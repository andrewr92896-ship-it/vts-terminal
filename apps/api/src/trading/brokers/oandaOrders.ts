import type { OandaConfig } from '../config.js';

// OANDA v20 — the *write* side of the connector: placing, closing, amending and
// cancelling real orders. brokers/oanda.ts stays read-only (open trades, prices,
// account summary, closed-trade history); everything that moves money lives here
// so the one file that can trade is easy to audit.
//
// Endpoints used (all Bearer-token, JSON):
//   POST /v3/accounts/{id}/orders                       place an order
//   PUT  /v3/accounts/{id}/orders/{orderId}/cancel      cancel a working order
//   GET  /v3/accounts/{id}/pendingOrders                working orders
//   PUT  /v3/accounts/{id}/trades/{tradeId}/close       close (all or partial)
//   PUT  /v3/accounts/{id}/trades/{tradeId}/orders      set/clear that trade's TP/SL
//   GET  /v3/accounts/{id}/instruments                  tradeable set + precision
//   GET  /v3/accounts/{id}/pricing                      bid/ask + home conversion
// Docs: https://developer.oanda.com/rest-live-v20/order-ep/

export type OandaOrderType = 'MARKET' | 'LIMIT' | 'STOP';

export interface PlaceOrderInput {
  instrument: string; // OANDA symbol, e.g. "EUR_USD"
  units: number; // signed: +long / -short
  type: OandaOrderType;
  price?: number | null; // required for LIMIT / STOP
  takeProfit?: number | null;
  stopLoss?: number | null;
  // Trailing stop distance in *price* terms (not pips), when the trader wants one.
  trailingStopDistance?: number | null;
  // Price precision for this instrument (OANDA rejects over-precise prices).
  displayPrecision: number;
  tradeUnitsPrecision: number;
}

// What actually happened at the broker. `filled` is the money-moving outcome; a
// working (unfilled) LIMIT/STOP is `accepted`.
export interface PlaceOrderResult {
  status: 'filled' | 'accepted';
  orderId: string | null;
  tradeId: string | null; // the trade the fill opened, when it filled
  fillPrice: number | null;
  units: number | null;
  time: number | null; // ms epoch
}

export interface OandaWorkingOrder {
  id: string;
  type: string; // LIMIT / STOP / MARKET_IF_TOUCHED / TAKE_PROFIT / ...
  instrument: string; // display form "EUR/USD"
  units: number; // signed
  price: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  timeInForce: string | null;
  createdAt: number | null;
  // Set when this order belongs to an open trade (a TP/SL), rather than being a
  // standalone entry order.
  tradeId: string | null;
}

export interface OandaInstrumentSpec {
  symbol: string; // "EUR_USD"
  instrument: string; // display form "EUR/USD"
  displayName: string;
  type: string; // CURRENCY / CFD / METAL
  pipSize: number; // 0.0001, 0.01, ...
  displayPrecision: number;
  tradeUnitsPrecision: number;
  minimumTradeSize: number;
  maximumOrderUnits: number | null;
  marginRate: number | null;
}

export interface OandaQuote {
  instrument: string; // display form "EUR/USD"
  bid: number | null;
  ask: number | null;
  spread: number | null;
  tradeable: boolean;
  time: number | null;
  // Multiplier from the instrument's quote currency into the account currency,
  // so the ticket can price risk in real money for any instrument (not just the
  // pairs quoted in the account currency). Null when OANDA doesn't report one.
  quoteHomeFactor: number | null;
}

// A broker refusal, carrying OANDA's own reason so the ticket can show it
// verbatim ("INSUFFICIENT_MARGIN", "MARKET_HALTED", ...) instead of "failed".
export class OandaOrderError extends Error {
  readonly code: string | null;
  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = 'OandaOrderError';
    this.code = code;
  }
}

// ---- transport ----

const TIMEOUT_MS = 12_000;

interface OandaErrorBody {
  errorCode?: string;
  errorMessage?: string;
  orderRejectTransaction?: { rejectReason?: string; type?: string };
  orderCancelTransaction?: { reason?: string };
}

async function oandaRequest<T>(
  cfg: OandaConfig,
  path: string,
  init: { method: 'GET' | 'POST' | 'PUT'; body?: unknown } = { method: 'GET' },
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${cfg.base}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
        // OANDA dates as RFC3339 rather than the default UNIX floats.
        'Accept-Datetime-Format': 'RFC3339',
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: ctrl.signal,
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    throw new OandaOrderError(
      aborted ? 'OANDA did not respond in time' : 'Could not reach OANDA',
      aborted ? 'TIMEOUT' : 'NETWORK',
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const body = (json ?? {}) as OandaErrorBody;
    const reason = body.orderRejectTransaction?.rejectReason ?? body.errorCode ?? null;
    const msg = body.errorMessage ?? body.orderRejectTransaction?.rejectReason ?? `OANDA responded ${res.status}`;
    if (res.status === 401) throw new OandaOrderError('OANDA rejected the API token', 'UNAUTHORIZED');
    if (res.status === 403) throw new OandaOrderError('This OANDA token is not permitted to trade', 'FORBIDDEN');
    throw new OandaOrderError(msg, reason);
  }
  return (json ?? {}) as T;
}

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ms(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

export function toOandaSymbol(instrument: string): string {
  return instrument.trim().toUpperCase().replace('/', '_');
}

export function toDisplaySymbol(symbol: string): string {
  return symbol.replace('_', '/');
}

// Round a price to the instrument's display precision and render it the way
// OANDA wants it (a string). An over-precise price is rejected outright, so this
// is not cosmetic.
function priceStr(v: number, precision: number): string {
  return v.toFixed(Math.max(0, Math.min(10, precision)));
}

function unitsStr(v: number, precision: number): string {
  return v.toFixed(Math.max(0, Math.min(10, precision)));
}

// ---- placing ----

interface FillTransaction {
  id?: string;
  orderID?: string;
  price?: string;
  units?: string;
  time?: string;
  tradeOpened?: { tradeID?: string; units?: string; price?: string };
  tradesClosed?: { tradeID?: string; units?: string; price?: string; realizedPL?: string }[];
  tradeReduced?: { tradeID?: string; units?: string; price?: string; realizedPL?: string };
  pl?: string;
}

interface OrderResponse {
  orderCreateTransaction?: { id?: string; time?: string };
  orderFillTransaction?: FillTransaction;
  orderCancelTransaction?: { orderID?: string; reason?: string };
  orderRejectTransaction?: { rejectReason?: string };
}

// Place an order on the account. A MARKET order either fills or is refused; a
// LIMIT/STOP order rests on the book until it triggers.
//
// The subtlety worth keeping: OANDA answers **201 Created** even when it then
// immediately cancels the order (insufficient margin, market halted, FOK not
// fillable). A naive "res.ok means done" reads those as successes and the desk
// would show a trade that does not exist — so an orderCancelTransaction is
// turned into an error here.
export async function placeOandaOrder(
  cfg: OandaConfig,
  input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
  const p = input.displayPrecision;
  const order: Record<string, unknown> = {
    type: input.type,
    instrument: toOandaSymbol(input.instrument),
    units: unitsStr(input.units, input.tradeUnitsPrecision),
    positionFill: 'DEFAULT',
    // A market order is fill-or-kill (no partial fill at a worse price); a
    // resting order stays good until the trader cancels it.
    timeInForce: input.type === 'MARKET' ? 'FOK' : 'GTC',
  };
  if (input.type !== 'MARKET') {
    if (input.price == null) throw new OandaOrderError('A limit or stop order needs a price', 'NO_PRICE');
    order.price = priceStr(input.price, p);
  }
  if (input.takeProfit != null) {
    order.takeProfitOnFill = { price: priceStr(input.takeProfit, p), timeInForce: 'GTC' };
  }
  if (input.stopLoss != null) {
    order.stopLossOnFill = { price: priceStr(input.stopLoss, p), timeInForce: 'GTC' };
  }
  if (input.trailingStopDistance != null) {
    order.trailingStopLossOnFill = { distance: priceStr(input.trailingStopDistance, p), timeInForce: 'GTC' };
  }

  const json = await oandaRequest<OrderResponse>(cfg, `/v3/accounts/${cfg.accountId}/orders`, {
    method: 'POST',
    body: { order },
  });

  if (json.orderCancelTransaction) {
    const reason = json.orderCancelTransaction.reason ?? 'CANCELLED';
    throw new OandaOrderError(`OANDA cancelled the order (${reason})`, reason);
  }
  if (json.orderRejectTransaction) {
    const reason = json.orderRejectTransaction.rejectReason ?? 'REJECTED';
    throw new OandaOrderError(`OANDA rejected the order (${reason})`, reason);
  }

  const fill = json.orderFillTransaction;
  if (fill) {
    return {
      status: 'filled',
      orderId: fill.orderID ?? json.orderCreateTransaction?.id ?? null,
      tradeId: fill.tradeOpened?.tradeID ?? null,
      fillPrice: num(fill.price),
      units: num(fill.tradeOpened?.units ?? fill.units),
      time: ms(fill.time),
    };
  }
  return {
    status: 'accepted',
    orderId: json.orderCreateTransaction?.id ?? null,
    tradeId: null,
    fillPrice: null,
    units: input.units,
    time: ms(json.orderCreateTransaction?.time),
  };
}

// ---- closing ----

export interface CloseTradeResult {
  closedUnits: number | null;
  price: number | null;
  realizedPl: number | null;
  time: number | null;
  // True when only part of the position was closed.
  partial: boolean;
}

// Close an open trade — all of it, or `units` of it. OANDA takes "ALL" or a
// positive unit count regardless of direction.
export async function closeOandaTrade(
  cfg: OandaConfig,
  tradeId: string,
  units: number | 'ALL',
  tradeUnitsPrecision = 0,
): Promise<CloseTradeResult> {
  const body = { units: units === 'ALL' ? 'ALL' : unitsStr(Math.abs(units), tradeUnitsPrecision) };
  const json = await oandaRequest<OrderResponse>(
    cfg,
    `/v3/accounts/${cfg.accountId}/trades/${encodeURIComponent(tradeId)}/close`,
    { method: 'PUT', body },
  );
  if (json.orderCancelTransaction) {
    const reason = json.orderCancelTransaction.reason ?? 'CANCELLED';
    throw new OandaOrderError(`OANDA could not close the trade (${reason})`, reason);
  }
  const fill = json.orderFillTransaction;
  if (!fill) throw new OandaOrderError('OANDA did not report a fill for the close', 'NO_FILL');
  const closed = fill.tradesClosed?.[0];
  const reduced = fill.tradeReduced;
  return {
    closedUnits: num(closed?.units ?? reduced?.units ?? fill.units),
    price: num(closed?.price ?? reduced?.price ?? fill.price),
    realizedPl: num(closed?.realizedPL ?? reduced?.realizedPL ?? fill.pl),
    time: ms(fill.time),
    partial: !closed && !!reduced,
  };
}

// ---- amending a live trade's protective orders ----

export interface ModifyTradeInput {
  // undefined = leave alone; null = cancel that order; a number = set it.
  takeProfit?: number | null;
  stopLoss?: number | null;
  displayPrecision: number;
}

export async function modifyOandaTradeOrders(
  cfg: OandaConfig,
  tradeId: string,
  input: ModifyTradeInput,
): Promise<void> {
  const body: Record<string, unknown> = {};
  // OANDA's semantics on this endpoint: an omitted field is untouched, an
  // explicit null cancels the existing order. That maps exactly onto
  // undefined/null here, so "clear my stop" needs no separate call.
  if (input.takeProfit !== undefined) {
    body.takeProfit =
      input.takeProfit == null
        ? null
        : { price: priceStr(input.takeProfit, input.displayPrecision), timeInForce: 'GTC' };
  }
  if (input.stopLoss !== undefined) {
    body.stopLoss =
      input.stopLoss == null
        ? null
        : { price: priceStr(input.stopLoss, input.displayPrecision), timeInForce: 'GTC' };
  }
  if (Object.keys(body).length === 0) return;
  const json = await oandaRequest<OrderResponse & { takeProfitOrderRejectTransaction?: { rejectReason?: string }; stopLossOrderRejectTransaction?: { rejectReason?: string } }>(
    cfg,
    `/v3/accounts/${cfg.accountId}/trades/${encodeURIComponent(tradeId)}/orders`,
    { method: 'PUT', body },
  );
  const reject =
    json.takeProfitOrderRejectTransaction?.rejectReason ?? json.stopLossOrderRejectTransaction?.rejectReason;
  if (reject) throw new OandaOrderError(`OANDA rejected the change (${reject})`, reject);
}

// ---- working orders ----

interface PendingOrder {
  id?: string;
  type?: string;
  instrument?: string;
  units?: string;
  price?: string;
  timeInForce?: string;
  createTime?: string;
  tradeID?: string;
  takeProfitOnFill?: { price?: string };
  stopLossOnFill?: { price?: string };
}

// The account's resting orders. Includes the TP/SL orders attached to open
// trades (they are orders too) — those carry a tradeId, so a caller that only
// wants standalone entry orders can filter on it.
export async function fetchOandaPendingOrders(cfg: OandaConfig): Promise<OandaWorkingOrder[]> {
  const json = await oandaRequest<{ orders?: PendingOrder[] }>(
    cfg,
    `/v3/accounts/${cfg.accountId}/pendingOrders`,
  );
  return (json.orders ?? [])
    .filter((o) => o.id)
    .map((o) => ({
      id: o.id!,
      type: o.type ?? 'ORDER',
      instrument: toDisplaySymbol(o.instrument ?? ''),
      units: num(o.units) ?? 0,
      price: num(o.price),
      takeProfit: num(o.takeProfitOnFill?.price),
      stopLoss: num(o.stopLossOnFill?.price),
      timeInForce: o.timeInForce ?? null,
      createdAt: ms(o.createTime),
      tradeId: o.tradeID ?? null,
    }));
}

export async function cancelOandaOrder(cfg: OandaConfig, orderId: string): Promise<void> {
  await oandaRequest(cfg, `/v3/accounts/${cfg.accountId}/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: 'PUT',
  });
}

// ---- instrument specs ----

interface InstrumentRow {
  name?: string;
  type?: string;
  displayName?: string;
  pipLocation?: number;
  displayPrecision?: number;
  tradeUnitsPrecision?: number;
  minimumTradeSize?: string;
  maximumOrderUnits?: string;
  marginRate?: string;
}

// Everything the ticket needs to build a *valid* order for each instrument the
// account may trade: how precise a price may be, how precise a size may be, the
// smallest allowed trade, and the pip size (OANDA gives pipLocation as the
// exponent, so 10^-4 for most pairs and 10^-2 for JPY ones).
export async function fetchOandaInstrumentSpecs(cfg: OandaConfig): Promise<OandaInstrumentSpec[]> {
  const json = await oandaRequest<{ instruments?: InstrumentRow[] }>(
    cfg,
    `/v3/accounts/${cfg.accountId}/instruments`,
  );
  const out: OandaInstrumentSpec[] = [];
  for (const i of json.instruments ?? []) {
    if (!i.name) continue;
    const pipLocation = typeof i.pipLocation === 'number' ? i.pipLocation : -4;
    out.push({
      symbol: i.name,
      instrument: toDisplaySymbol(i.name),
      displayName: i.displayName ?? toDisplaySymbol(i.name),
      type: i.type ?? 'CURRENCY',
      pipSize: Math.pow(10, pipLocation),
      displayPrecision: typeof i.displayPrecision === 'number' ? i.displayPrecision : 5,
      tradeUnitsPrecision: typeof i.tradeUnitsPrecision === 'number' ? i.tradeUnitsPrecision : 0,
      minimumTradeSize: num(i.minimumTradeSize) ?? 1,
      maximumOrderUnits: num(i.maximumOrderUnits),
      marginRate: num(i.marginRate),
    });
  }
  out.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return out;
}

// ---- quotes ----

interface PricingRow {
  instrument?: string;
  time?: string;
  tradeable?: boolean;
  status?: string;
  bids?: { price?: string }[];
  asks?: { price?: string }[];
  closeoutBid?: string;
  closeoutAsk?: string;
  quoteHomeConversionFactors?: { positiveUnits?: string; negativeUnits?: string };
}

interface HomeConversion {
  currency?: string;
  accountGain?: string;
  accountLoss?: string;
  positionValue?: string;
}

// Live two-sided prices for the ticket, plus the quote→account-currency factor
// that lets the risk calculator price a stop in real money for *any* instrument
// (a EUR/GBP stop on a USD account is not worth its pip count in dollars).
//
// `includeHomeConversions` is asked for because the per-price
// quoteHomeConversionFactors field is deprecated; the top-level homeConversions
// block is the supported source. Both are read, newest first, so the factor
// still resolves on an account whose entity has not caught up.
export async function fetchOandaQuotes(
  cfg: OandaConfig,
  instruments: string[],
): Promise<OandaQuote[]> {
  const symbols = [...new Set(instruments.map(toOandaSymbol))].filter(Boolean);
  if (symbols.length === 0) return [];
  const json = await oandaRequest<{ prices?: PricingRow[]; homeConversions?: HomeConversion[] }>(
    cfg,
    `/v3/accounts/${cfg.accountId}/pricing?includeHomeConversions=true&instruments=${encodeURIComponent(symbols.join(','))}`,
  );
  const conversions = new Map<string, number>();
  for (const c of json.homeConversions ?? []) {
    const factor = num(c.positionValue) ?? num(c.accountGain);
    if (c.currency && factor != null) conversions.set(c.currency.toUpperCase(), factor);
  }
  return (json.prices ?? [])
    .filter((p) => p.instrument)
    .map((p) => {
      const bid = num(p.closeoutBid) ?? num(p.bids?.[0]?.price);
      const ask = num(p.closeoutAsk) ?? num(p.asks?.[0]?.price);
      const quoteCcy = (p.instrument ?? '').split('_')[1] ?? '';
      const factor =
        conversions.get(quoteCcy.toUpperCase()) ?? num(p.quoteHomeConversionFactors?.positiveUnits);
      return {
        instrument: toDisplaySymbol(p.instrument!),
        bid,
        ask,
        spread: bid != null && ask != null ? Number((ask - bid).toFixed(8)) : null,
        tradeable: p.tradeable ?? p.status === 'tradeable',
        time: ms(p.time),
        quoteHomeFactor: factor ?? null,
      };
    });
}
