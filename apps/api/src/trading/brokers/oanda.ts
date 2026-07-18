import type { OandaConfig } from '../config.js';
import { brokerMeta } from '../config.js';
import type { LiveTrade } from '../types.js';
import { computeForex } from '../forex.js';

// OANDA v20: open trades for a forex account.
// GET {base}/v3/accounts/{accountId}/openTrades   (Bearer token)
// Docs: https://developer.oanda.com/rest-live-v20/trade-ep/
//
// openTrades does not include the live mark or the account currency, so for the
// Live Wall's current-price and pip math we also read pricing and the account
// summary. Those two extras are best-effort: if either fails the wall still
// renders with whatever it has.

interface OandaOrder {
  price?: string;
}
interface OandaTrade {
  id: string;
  instrument: string; // "EUR_USD"
  price: string; // average fill price
  openTime: string; // RFC3339
  currentUnits: string; // +long / -short
  unrealizedPL?: string;
  takeProfitOrder?: OandaOrder;
  stopLossOrder?: OandaOrder;
  // The trailing-stop order trails the market by `distance`; trailingStopValue
  // is its current trigger price.
  trailingStopLossOrder?: { distance?: string; trailingStopValue?: string };
}
interface OandaOpenTradesResponse {
  trades?: OandaTrade[];
}

interface OandaPrice {
  instrument?: string; // "EUR_USD"
  closeoutBid?: string;
  closeoutAsk?: string;
  bids?: { price?: string }[];
  asks?: { price?: string }[];
}
interface OandaPricingResponse {
  prices?: OandaPrice[];
}
interface OandaAccountSummaryResponse {
  account?: {
    currency?: string;
    balance?: string;
    NAV?: string;
    unrealizedPL?: string;
    marginUsed?: string;
    marginAvailable?: string;
    openTradeCount?: number;
  };
}

// The live capital of an OANDA account, read from the account summary endpoint.
// NAV (net asset value = balance + open P/L) is the "capital" shown on Account
// Metrics; it moves in real time as positions are opened/closed.
export interface OandaAccountCapital {
  currency: string;
  balance: number | null;
  nav: number | null;
  unrealizedPl: number | null;
  marginUsed: number | null;
  marginAvailable: number | null;
  openTradeCount: number | null;
}

// One closed trade's realized P/L and when it closed. Realized P/L is purely
// trade profit — deposits/withdrawals are separate (non-trade) transactions and
// never appear here, so P/L stats built from these exclude added capital.
export interface OandaClosedTradePnl {
  realizedPl: number;
  closeTimeMs: number;
}

interface OandaClosedTrade {
  id?: string;
  instrument?: string; // "EUR_USD"
  price?: string; // average entry fill price
  initialUnits?: string; // +long / -short, size at open
  averageClosePrice?: string; // average exit fill price
  realizedPL?: string;
  openTime?: string;
  closeTime?: string;
  state?: string;
}
interface OandaTradesResponse {
  trades?: OandaClosedTrade[];
}

// A fully-detailed closed trade, enough to reconstruct the trade as a History
// row (instrument, direction, size, fills, timing) — not just its P/L. Used by
// the closed-trade backfill so a trader's real broker history shows up even for
// trades that opened and closed between (or without) any live poll.
export interface OandaClosedTradeRow {
  tradeId: string; // OANDA trade id (unique per account)
  instrument: string; // display form "EUR/USD"
  side: 'long' | 'short';
  units: number; // absolute size at open
  entryPrice: number;
  exitPrice: number | null; // average close price, when reported
  realizedPl: number;
  openedAtMs: number | null;
  closeTimeMs: number;
}

// Pure normalizer, exported so it can be unit-tested against recorded JSON
// without any network access (mirrors mapOandaTrades). A trade missing any field
// we need to reconstruct it (id, entry, size, P/L, close time) is skipped.
export function mapOandaClosedTrades(json: OandaTradesResponse): OandaClosedTradeRow[] {
  const out: OandaClosedTradeRow[] = [];
  for (const t of json.trades ?? []) {
    const pl = num(t.realizedPL);
    const ct = t.closeTime ? Date.parse(t.closeTime) : NaN;
    const units = num(t.initialUnits);
    const entry = num(t.price);
    if (!t.id || pl == null || !Number.isFinite(ct) || units == null || entry == null) continue;
    const ot = t.openTime ? Date.parse(t.openTime) : NaN;
    out.push({
      tradeId: t.id,
      instrument: (t.instrument ?? '').replace('_', '/'),
      side: units >= 0 ? 'long' : 'short',
      units: Math.abs(units),
      entryPrice: entry,
      exitPrice: num(t.averageClosePrice),
      realizedPl: pl,
      openedAtMs: Number.isFinite(ot) ? ot : null,
      closeTimeMs: ct,
    });
  }
  return out;
}

// Recent closed trades for an account (up to 500, OANDA's max page), with full
// detail. This is the broker's authoritative record of what actually traded —
// unlike the Live Wall reconcile, which can only see a trade if it was polled
// while open. Best-effort at the call site.
export async function fetchOandaClosedTradeRows(cfg: OandaConfig): Promise<OandaClosedTradeRow[]> {
  const res = await fetch(`${cfg.base}/v3/accounts/${cfg.accountId}/trades?state=CLOSED&count=500`, {
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`OANDA responded ${res.status}`);
  return mapOandaClosedTrades((await res.json()) as OandaTradesResponse);
}

// Recent closed trades for an account, reduced to realized P/L + close time.
// Used to total trade-only P/L over rolling windows on Account Metrics.
export async function fetchOandaClosedTrades(cfg: OandaConfig): Promise<OandaClosedTradePnl[]> {
  const rows = await fetchOandaClosedTradeRows(cfg);
  return rows.map((r) => ({ realizedPl: r.realizedPl, closeTimeMs: r.closeTimeMs }));
}

export async function fetchOandaAccountSummary(cfg: OandaConfig): Promise<OandaAccountCapital> {
  const res = await fetch(`${cfg.base}/v3/accounts/${cfg.accountId}/summary`, {
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`OANDA responded ${res.status}`);
  const json = (await res.json()) as OandaAccountSummaryResponse;
  const a = json.account ?? {};
  return {
    currency: a.currency ?? 'USD',
    balance: num(a.balance),
    nav: num(a.NAV),
    unrealizedPl: num(a.unrealizedPL),
    marginUsed: num(a.marginUsed),
    marginAvailable: num(a.marginAvailable),
    openTradeCount: typeof a.openTradeCount === 'number' ? a.openTradeCount : null,
  };
}

function num(v: string | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Display form "EUR/USD" back to OANDA's "EUR_USD" for pricing lookups.
function toOandaSymbol(instrument: string): string {
  return instrument.replace('/', '_');
}

// Pure normalizer, exported so it can be unit-tested against recorded JSON
// without any network access.
export function mapOandaTrades(json: OandaOpenTradesResponse): LiveTrade[] {
  const name = brokerMeta('oanda').name;
  return (json.trades ?? []).map((t) => {
    const units = num(t.currentUnits) ?? 0;
    const entry = num(t.price) ?? 0;
    return {
      id: `oanda:${t.id}`,
      connectionId: '', // set by the service when aggregating per connection
      ownerId: '', // set by the service from the connection's owner
      owner: '',
      broker: 'oanda' as const,
      brokerName: name,
      instrument: t.instrument.replace('_', '/'),
      side: units >= 0 ? ('long' as const) : ('short' as const),
      units: Math.abs(units),
      plannedEntry: null,
      entryPrice: entry,
      currentPrice: null, // filled from the pricing endpoint below
      takeProfit: num(t.takeProfitOrder?.price),
      stopLoss: num(t.stopLossOrder?.price),
      trailingStopLoss: num(t.trailingStopLossOrder?.trailingStopValue),
      slippage: null,
      unrealizedPl: num(t.unrealizedPL),
      strategy: null,
      timeframe: null,
      openedAt: t.openTime ? Date.parse(t.openTime) || null : null,
    };
  });
}

// Live mid prices for an arbitrary set of instruments (display form "EUR/USD"),
// independent of whether any position is open on the account. Used to mark
// funded/prop positions that have no API of their own against real OANDA prices.
// Best-effort: a failed request or an unpriceable symbol is simply absent from
// the map. Returned keyed by display form ("EUR/USD") to match callers.
export async function fetchOandaPrices(
  cfg: OandaConfig,
  instruments: string[],
): Promise<Map<string, number>> {
  const symbols = [...new Set(instruments.map(toOandaSymbol))].filter(Boolean);
  if (symbols.length === 0) return new Map();
  const json = await getJson<OandaPricingResponse>(
    `${cfg.base}/v3/accounts/${cfg.accountId}/pricing?instruments=${encodeURIComponent(symbols.join(','))}`,
    cfg.token,
  );
  if (!json) return new Map();
  const out = new Map<string, number>();
  for (const [sym, mid] of mapOandaPrices(json)) out.set(sym.replace('_', '/'), mid);
  return out;
}

// Mid price per OANDA instrument symbol ("EUR_USD") from a pricing response.
export function mapOandaPrices(json: OandaPricingResponse): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of json.prices ?? []) {
    if (!p.instrument) continue;
    const bid = num(p.closeoutBid) ?? num(p.bids?.[0]?.price);
    const ask = num(p.closeoutAsk) ?? num(p.asks?.[0]?.price);
    let mid: number | null = null;
    if (bid != null && ask != null) mid = (bid + ask) / 2;
    else if (bid != null) mid = bid;
    else if (ask != null) mid = ask;
    if (mid != null) out.set(p.instrument, mid);
  }
  return out;
}

async function getJson<T>(url: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchOandaTrades(cfg: OandaConfig): Promise<LiveTrade[]> {
  const res = await fetch(`${cfg.base}/v3/accounts/${cfg.accountId}/openTrades`, {
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`OANDA responded ${res.status}`);
  }
  const json = (await res.json()) as OandaOpenTradesResponse;
  const trades = mapOandaTrades(json);
  if (trades.length === 0) return trades;

  // Best-effort enrichment: live marks for the open instruments, and the account
  // currency so pip money is in the right units. Failures leave trades as-is.
  const symbols = [...new Set(trades.map((t) => toOandaSymbol(t.instrument)))];
  const [pricing, summary] = await Promise.all([
    getJson<OandaPricingResponse>(
      `${cfg.base}/v3/accounts/${cfg.accountId}/pricing?instruments=${encodeURIComponent(symbols.join(','))}`,
      cfg.token,
    ),
    getJson<OandaAccountSummaryResponse>(
      `${cfg.base}/v3/accounts/${cfg.accountId}/summary`,
      cfg.token,
    ),
  ]);

  const marks = pricing ? mapOandaPrices(pricing) : new Map<string, number>();
  const currency = summary?.account?.currency ?? 'USD';

  return trades.map((t) => {
    const mark = marks.get(toOandaSymbol(t.instrument));
    const withMark: LiveTrade = mark != null ? { ...t, currentPrice: mark } : t;
    return { ...withMark, forex: computeForex(withMark, currency) };
  });
}
