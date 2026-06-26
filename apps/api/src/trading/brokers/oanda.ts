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
  account?: { currency?: string };
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
