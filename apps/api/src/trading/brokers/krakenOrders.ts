import type { KrakenConfig } from '../config.js';
import { KrakenError, displayAsset, krakenPrivate, krakenPublic } from './krakenClient.js';

// Kraken Spot — the *write* side of the connector, and the reads the Trade Desk
// needs to build a valid order. brokers/kraken.ts stays read-only (open margin
// positions for the Live Wall); everything that can move money lives here, so
// the second file in the repo that can trade is one small unit to audit. It is
// the crypto counterpart of brokers/oandaOrders.ts.
//
// Endpoints used:
//   GET  /0/public/AssetPairs        tradeable set, precision, minimums
//   GET  /0/public/Ticker            bid/ask
//   POST /0/private/Balance|BalanceEx spot holdings
//   POST /0/private/TradeBalance     equity / margin
//   POST /0/private/AddOrder         place an order            ← moves money
//   POST /0/private/QueryOrders      what actually happened to it
//   POST /0/private/OpenOrders       resting orders
//   POST /0/private/CancelOrder      cancel a resting order
//
// **Spot only, deliberately.** No request built here ever sends `leverage`, so
// this connector cannot open a margin position, cannot be liquidated, and needs
// no margin permission on the API key. A "sell" is a sale of coins the account
// already holds. Kraken margin positions still appear on the Live Wall through
// the read connector, but the desk will not act on them (see trading/deskBrokers.ts).
//
// Two Kraken behaviours everything below is shaped around:
//
//   • **A refusal comes back as HTTP 200** with an `error` array — handled once,
//     in krakenClient.ts, so it cannot be skipped here.
//   • **AddOrder answers with a transaction id, not a fill.** Unlike OANDA, the
//     order's outcome is not in the response: it may still be resting, and it
//     may have been accepted and then immediately cancelled. Reading the AddOrder
//     reply as "done" would report a position that does not exist, which is the
//     same class of bug as trusting OANDA's 201. `placeKrakenOrder` therefore
//     asks QueryOrders what actually happened before it answers.

// ---- types ----

export interface KrakenPairSpec {
  // Kraken's canonical key for the pair ("XXBTZUSD") — what Ticker and
  // OpenOrders key their results by, which is not always what you asked with.
  key: string;
  // The name a request is made with ("XBTUSD"). AddOrder accepts this.
  altname: string;
  // Display form, in the names a trader reads: "BTC/USD", never "XBT/USD".
  instrument: string;
  base: string; // display base asset, e.g. "BTC"
  quote: string; // display quote asset, e.g. "USD"
  pricePrecision: number; // pair_decimals — decimals a price may carry
  volumePrecision: number; // lot_decimals — decimals a size may carry
  tickSize: number; // minimum price increment
  minimumVolume: number; // ordermin, in base units
  minimumCost: number | null; // costmin, in quote currency
  online: boolean; // status === 'online'; anything else can't take a new order
}

export interface KrakenQuote {
  instrument: string;
  bid: number | null;
  ask: number | null;
  spread: number | null;
  tradeable: boolean;
  time: number | null;
}

export interface KrakenTradeBalance {
  equity: number | null; // e — trade balance + unrealized P/L on margin
  balance: number | null; // tb — combined balance of all equity currencies
  unrealizedPl: number | null; // n — unrealized net P/L on open margin positions
  marginUsed: number | null; // m
  marginFree: number | null; // mf
}

export interface KrakenBalance {
  asset: string; // display name, e.g. "BTC" — or "BTC.S" when staked
  amount: number;
  onOrder: number; // amount locked by resting orders (0 when unknown)
}

export type KrakenOrderType = 'market' | 'limit' | 'stop-loss';

export interface KrakenPlaceInput {
  spec: KrakenPairSpec;
  side: 'buy' | 'sell';
  volume: number; // base units, positive
  type: KrakenOrderType;
  price?: number | null; // limit price, or the stop's trigger
  // Kraken attaches exactly ONE conditional close order to an entry — there is
  // no bracket on spot REST — so the caller picks which, and the desk refuses a
  // ticket carrying both (trading/orderDesk.ts).
  close?: { kind: 'stop-loss' | 'take-profit'; price: number } | null;
}

export interface KrakenPlaceResult {
  status: 'filled' | 'accepted';
  orderId: string | null;
  fillPrice: number | null;
  volume: number | null; // volume actually executed, when it filled
  description: string | null; // Kraken's own one-line rendering of the order
}

export interface KrakenWorkingOrder {
  id: string;
  type: string; // LIMIT / STOP-LOSS / TAKE-PROFIT …
  instrument: string; // display form
  units: number; // signed: + buy / − sell
  price: number | null;
  createdAt: number | null;
}

// ---- number helpers ----

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Kraken refuses a price that is not a multiple of the pair's tick size, and one
// carrying more decimals than pair_decimals. Both are enforced here rather than
// left to the exchange, so a trader is told what happened by the ticket instead
// of by a terse "Invalid price".
function priceStr(v: number, spec: KrakenPairSpec): string {
  const tick = spec.tickSize > 0 ? spec.tickSize : Math.pow(10, -spec.pricePrecision);
  const snapped = Math.round(v / tick) * tick;
  return snapped.toFixed(Math.max(0, Math.min(10, spec.pricePrecision)));
}

function volumeStr(v: number, spec: KrakenPairSpec): string {
  return v.toFixed(Math.max(0, Math.min(10, spec.volumePrecision)));
}

// ---- tradeable set ----

interface AssetPairRow {
  altname?: string;
  wsname?: string;
  base?: string;
  quote?: string;
  pair_decimals?: number;
  lot_decimals?: number;
  tick_size?: string;
  ordermin?: string;
  costmin?: string;
  status?: string;
}

// Every pair this Kraken account may trade, with the precision and minimums a
// valid order has to respect. Public data — the same for every account — so it
// needs no key, and the desk caches it per connection like the OANDA specs.
//
// Dark-pool pairs (altname ending ".d") are dropped: they are a different venue
// with different rules, and one showing up beside the ordinary pair in a picker
// is a trap rather than a choice.
export async function fetchKrakenPairs(): Promise<KrakenPairSpec[]> {
  const rows = await krakenPublic<Record<string, AssetPairRow>>('AssetPairs');
  const out: KrakenPairSpec[] = [];
  for (const [key, r] of Object.entries(rows ?? {})) {
    const altname = r.altname ?? key;
    if (altname.endsWith('.d')) continue;
    // wsname is the only field carrying a clean, separable base/quote
    // ("XBT/USD"); the `base`/`quote` fields are legacy codes and the key runs
    // them together with no separator.
    const ws = r.wsname ?? '';
    const [wsBase, wsQuote] = ws.split('/');
    if (!wsBase || !wsQuote) continue;
    const base = displayAsset(wsBase);
    const quote = displayAsset(wsQuote);
    out.push({
      key,
      altname,
      instrument: `${base}/${quote}`,
      base,
      quote,
      pricePrecision: typeof r.pair_decimals === 'number' ? r.pair_decimals : 5,
      volumePrecision: typeof r.lot_decimals === 'number' ? r.lot_decimals : 8,
      tickSize: num(r.tick_size) ?? 0,
      minimumVolume: num(r.ordermin) ?? 0,
      minimumCost: num(r.costmin),
      // "online" is the only status that accepts a new order; the others
      // (cancel_only, post_only, limit_only, reduce_only) are restrictions.
      online: (r.status ?? 'online') === 'online',
    });
  }
  out.sort((a, b) => a.instrument.localeCompare(b.instrument));
  return out;
}

// ---- quotes ----

interface TickerRow {
  a?: string[]; // ask [price, whole lot volume, lot volume]
  b?: string[]; // bid
  c?: string[]; // last trade closed [price, volume]
}

// Live two-sided prices. Kraken keys its answer by the pair's canonical name
// even when the request used the altname, so the specs are passed in and the
// result is matched back on either name — matching on the request string alone
// silently returns nothing for half the pairs on the exchange.
export async function fetchKrakenQuotes(specs: KrakenPairSpec[]): Promise<KrakenQuote[]> {
  if (specs.length === 0) return [];
  const rows = await krakenPublic<Record<string, TickerRow>>('Ticker', {
    pair: specs.map((s) => s.altname).join(','),
  });
  const byName = new Map<string, KrakenPairSpec>();
  for (const s of specs) {
    byName.set(s.key.toUpperCase(), s);
    byName.set(s.altname.toUpperCase(), s);
  }
  const at = Date.now();
  const out: KrakenQuote[] = [];
  for (const [name, row] of Object.entries(rows ?? {})) {
    const spec = byName.get(name.toUpperCase());
    if (!spec) continue;
    const bid = num(row.b?.[0]);
    const ask = num(row.a?.[0]);
    out.push({
      instrument: spec.instrument,
      bid,
      ask,
      spread: bid != null && ask != null ? Number((ask - bid).toFixed(10)) : null,
      // Crypto never closes, so a pair is tradeable unless Kraken has restricted
      // it — which is a property of the pair, not of the clock.
      tradeable: spec.online,
      time: at,
    });
  }
  return out;
}

// ---- account ----

// Equity, margin and unrealized P/L, all converted into `asset` by Kraken. The
// desk asks in USD, which is what the account card and every money figure on the
// ticket are then denominated in.
export async function fetchKrakenTradeBalance(
  cfg: KrakenConfig,
  asset = 'ZUSD',
): Promise<KrakenTradeBalance> {
  const r = await krakenPrivate<Record<string, string>>(cfg, 'TradeBalance', { asset });
  return {
    equity: num(r.e) ?? num(r.eb),
    balance: num(r.tb) ?? num(r.eb),
    unrealizedPl: num(r.n),
    marginUsed: num(r.m),
    marginFree: num(r.mf),
  };
}

// Every asset the account holds, with the part locked by resting orders where
// Kraken reports it. BalanceEx carries the `hold_trade` figure — a holding that
// is already committed to a sell order is not one you can sell again — and
// Balance is the fallback for a key or account BalanceEx refuses.
export async function fetchKrakenBalances(cfg: KrakenConfig): Promise<KrakenBalance[]> {
  try {
    const rows = await krakenPrivate<Record<string, { balance?: string; hold_trade?: string }>>(cfg, 'BalanceEx');
    return Object.entries(rows ?? {})
      .map(([asset, r]) => ({
        asset: displayAsset(asset),
        amount: num(r.balance) ?? 0,
        onOrder: num(r.hold_trade) ?? 0,
      }))
      .filter((b) => b.amount > 0);
  } catch (e) {
    if (e instanceof KrakenError && (e.code === 'TIMEOUT' || e.code === 'NETWORK')) throw e;
    const rows = await krakenPrivate<Record<string, string>>(cfg, 'Balance');
    return Object.entries(rows ?? {})
      .map(([asset, amount]) => ({ asset: displayAsset(asset), amount: num(amount) ?? 0, onOrder: 0 }))
      .filter((b) => b.amount > 0);
  }
}

// ---- placing ----

interface AddOrderResponse {
  descr?: { order?: string; close?: string };
  txid?: string[];
}

interface OrderRow {
  status?: string; // pending | open | closed | canceled | expired
  reason?: string; // why it was canceled
  price?: string; // average fill price, in the quote currency
  vol?: string;
  vol_exec?: string;
  opentm?: number;
  descr?: { pair?: string; type?: string; ordertype?: string; price?: string; order?: string };
}

// Kraken fills asynchronously, so a market order that has just been accepted may
// not have reported its fill yet. One immediate read, then one more after a
// short pause, is enough for a spot market order in practice — and if it is
// still open after that the desk simply reports it as working, which is true.
const SETTLE_DELAY_MS = 700;

async function queryOrder(cfg: KrakenConfig, txid: string): Promise<OrderRow | null> {
  const rows = await krakenPrivate<Record<string, OrderRow>>(cfg, 'QueryOrders', { txid });
  return rows?.[txid] ?? null;
}

// Place an order on the account. Market orders execute immediately; limit and
// stop orders rest on the book until they trigger.
//
// The outcome is read back from QueryOrders rather than inferred from the
// AddOrder reply, because Kraken can accept an order and then cancel it (an
// unfillable price, a pair that went reduce-only, funds that moved between the
// two calls). Reporting that as a fill would put a position on the desk that
// the account does not hold.
export async function placeKrakenOrder(
  cfg: KrakenConfig,
  input: KrakenPlaceInput,
): Promise<KrakenPlaceResult> {
  const { spec } = input;
  const params: Record<string, string> = {
    pair: spec.altname,
    type: input.side,
    ordertype: input.type,
    volume: volumeStr(input.volume, spec),
    // No `leverage` — ever. Its absence is what keeps this connector spot-only.
  };
  if (input.type !== 'market') {
    if (input.price == null) throw new KrakenError('A limit or stop order needs a price', 'NO_PRICE');
    params.price = priceStr(input.price, spec);
  }
  if (input.close) {
    params['close[ordertype]'] = input.close.kind;
    params['close[price]'] = priceStr(input.close.price, spec);
  }

  const res = await krakenPrivate<AddOrderResponse>(cfg, 'AddOrder', params);
  const txid = res.txid?.[0] ?? null;
  const description = res.descr?.order ?? null;
  if (!txid) {
    // Nothing to reconcile against and nothing to cancel — treat it as a refusal
    // rather than reporting an order the desk cannot show or manage.
    throw new KrakenError('Kraken accepted the request but returned no order id', 'NO_TXID');
  }

  let row = await queryOrder(cfg, txid).catch(() => null);
  // Read again when the answer is "not settled yet" — or when there was no
  // answer at all, since the first query can outrun the order's own bookkeeping.
  const unsettled = !row || row.status === 'pending' || (row.status === 'open' && input.type === 'market');
  if (unsettled) {
    await new Promise((r) => setTimeout(r, SETTLE_DELAY_MS));
    row = (await queryOrder(cfg, txid).catch(() => null)) ?? row;
  }

  if (row?.status === 'canceled' || row?.status === 'expired') {
    const reason = row.reason ?? row.status.toUpperCase();
    throw new KrakenError(`Kraken ${row.status} the order (${reason})`, reason);
  }

  const executed = num(row?.vol_exec) ?? 0;
  const filled = row?.status === 'closed' || executed > 0;
  return {
    status: filled ? 'filled' : 'accepted',
    orderId: txid,
    // Kraken's `price` on a closed order is the average price paid.
    fillPrice: filled ? num(row?.price) : null,
    volume: filled ? executed : null,
    description,
  };
}

// ---- working orders ----

// The account's resting orders. Kraken has no equivalent of an OANDA TP/SL order
// attached to a trade, so everything here is a standalone order.
export async function fetchKrakenOpenOrders(
  cfg: KrakenConfig,
  specs: KrakenPairSpec[],
): Promise<KrakenWorkingOrder[]> {
  const res = await krakenPrivate<{ open?: Record<string, OrderRow> }>(cfg, 'OpenOrders');
  const byName = new Map<string, KrakenPairSpec>();
  for (const s of specs) {
    byName.set(s.key.toUpperCase(), s);
    byName.set(s.altname.toUpperCase(), s);
    byName.set(s.instrument.toUpperCase(), s);
  }
  const out: KrakenWorkingOrder[] = [];
  for (const [id, row] of Object.entries(res.open ?? {})) {
    const pair = row.descr?.pair ?? '';
    const spec = byName.get(pair.toUpperCase());
    const volume = num(row.vol) ?? 0;
    const executed = num(row.vol_exec) ?? 0;
    const remaining = Math.max(0, volume - executed);
    out.push({
      id,
      type: (row.descr?.ordertype ?? 'order').toUpperCase(),
      instrument: spec?.instrument ?? pair,
      units: row.descr?.type === 'sell' ? -remaining : remaining,
      price: num(row.descr?.price),
      createdAt: typeof row.opentm === 'number' ? Math.round(row.opentm * 1000) : null,
    });
  }
  return out.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export async function cancelKrakenOrder(cfg: KrakenConfig, txid: string): Promise<void> {
  await krakenPrivate<{ count?: number }>(cfg, 'CancelOrder', { txid });
}

// ---- quote-currency conversion ----

// What one unit of `quote` is worth in USD, so the ticket can price a stop in
// real money on a pair that is not quoted in dollars. USD is 1 by definition;
// the dollar stablecoins are treated as 1 too, which is the same approximation
// the terminal's keyless crypto price feed already makes. Anything else is looked
// up on Kraken itself, and a pair Kraken cannot price returns null so the ticket
// shows "—" rather than a confidently wrong number.
const USD_LIKE = new Set(['USD', 'USDT', 'USDC', 'DAI', 'PYUSD', 'RLUSD']);

export async function krakenUsdFactor(quote: string, specs: KrakenPairSpec[]): Promise<number | null> {
  const q = quote.toUpperCase();
  if (USD_LIKE.has(q)) return 1;
  // Both sides are already display names (displayAsset ran when the pairs were
  // parsed), so this is a straight comparison — no legacy-code mapping needed.
  const spec = specs.find((s) => s.base.toUpperCase() === q && s.quote === 'USD');
  if (!spec) return null;
  const [tick] = await fetchKrakenQuotes([spec]).catch(() => []);
  if (!tick || tick.bid == null || tick.ask == null) return null;
  return (tick.bid + tick.ask) / 2;
}
