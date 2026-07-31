import crypto from 'node:crypto';
import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingOrders, type TradeOrderKind, type TradeOrderStatus, type TradeOrderType, type UserRow } from '../db/schema.js';
import type { OandaConfig } from './config.js';
import { getActiveDecrypted, type OandaCreds } from './connections.js';
import { invalidateDeskSnapshot } from './liveWallCache.js';
import { isDemoUser } from '../demo/identity.js';
import {
  cancelOandaOrder,
  closeOandaTrade,
  fetchOandaInstrumentSpecs,
  fetchOandaPendingOrders,
  fetchOandaQuotes,
  modifyOandaTradeOrders,
  OandaOrderError,
  placeOandaOrder,
  toOandaSymbol,
  type OandaInstrumentSpec,
  type OandaQuote,
  type OandaWorkingOrder,
} from './brokers/oandaOrders.js';
import { fetchOandaAccountSummary } from './brokers/oanda.js';

// The Trade Desk — placing real orders from inside the portal.
//
// The hard boundary here, and the one thing not to relax: a trader may only ever
// trade **their own** broker connections. Everything else on the desk is
// team-scoped (see trading/scope.ts) so a trader watches their teammates' open
// positions live — but watching is where the sharing stops. Every function below
// resolves the connection through getActiveDecrypted(userId), which is keyed on
// the caller, so there is no code path that reaches a teammate's account at all.
//
// Only OANDA can be traded today. Kraken and the manual/prop connectors are
// read-or-hand-entered; a non-OANDA connection is simply absent from the desk.

export class DeskError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(message: string, status = 400, code: string | null = null) {
    super(message);
    this.name = 'DeskError';
    this.status = status;
    this.code = code;
  }
}

function oandaCfg(creds: OandaCreds): OandaConfig {
  return {
    token: creds.token,
    accountId: creds.accountId,
    base: creds.env === 'live' ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com',
  };
}

interface ResolvedConnection {
  id: string;
  label: string;
  env: 'practice' | 'live';
  cfg: OandaConfig;
}

// Resolve one of the caller's own active OANDA connections. Throws rather than
// returning null so every caller fails closed.
async function resolveConnection(userId: string, connectionId: string): Promise<ResolvedConnection> {
  const conns = await getActiveDecrypted(userId);
  const conn = conns.find((c) => c.id === connectionId);
  if (!conn) throw new DeskError('That broker connection is not available on your account', 404);
  if (conn.broker !== 'oanda') {
    throw new DeskError('Only OANDA connections can place orders from the Trade Desk', 400);
  }
  const creds = conn.creds as OandaCreds;
  return { id: conn.id, label: conn.label, env: creds.env, cfg: oandaCfg(creds) };
}

// The demo is a sandbox with canned data; it must never reach a broker's write
// API. demoGuard already blocks every non-GET, so this is the second lock on the
// same door — deliberately, because this is the one surface that moves money.
function refuseDemo(user: UserRow): void {
  if (isDemoUser(user)) throw new DeskError('The demo account cannot place trades', 403);
}

// Run a broker call and re-raise anything it throws as a DeskError, so a broker
// refusal reaches the client as a 502 with OANDA's own reason rather than a bare
// 500. A DeskError thrown by our own validation passes straight through.
async function viaBroker<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DeskError) throw e;
    const err = e instanceof OandaOrderError ? e : null;
    throw new DeskError(e instanceof Error ? e.message : 'The broker could not be reached', 502, err?.code ?? null);
  }
}

// ---- accounts ----

export interface DeskAccount {
  connectionId: string;
  label: string;
  env: 'practice' | 'live';
  // The tail of the OANDA account id — enough to tell two accounts apart on a
  // screen that gets shared, without printing the whole thing. Eight characters,
  // because an OANDA id ends "…-1234567-001": four would show only the
  // sub-account number, which is "001" on nearly every account.
  accountTail: string;
  currency: string;
  balance: number | null;
  nav: number | null;
  unrealizedPl: number | null;
  marginUsed: number | null;
  marginAvailable: number | null;
  openTradeCount: number | null;
  ok: boolean;
  error: string | null;
}

// Every OANDA account the caller can trade, with live capital. Best-effort per
// account: one unreachable account reports its error and the others still load,
// so a single bad token never blanks the desk.
export async function listDeskAccounts(userId: string): Promise<DeskAccount[]> {
  const conns = (await getActiveDecrypted(userId)).filter((c) => c.broker === 'oanda');
  const out = await Promise.all(
    conns.map(async (c): Promise<DeskAccount> => {
      const creds = c.creds as OandaCreds;
      const base: Omit<DeskAccount, 'ok' | 'error' | 'currency' | 'balance' | 'nav' | 'unrealizedPl' | 'marginUsed' | 'marginAvailable' | 'openTradeCount'> = {
        connectionId: c.id,
        label: c.label,
        env: creds.env,
        accountTail: creds.accountId.slice(-8),
      };
      try {
        const cap = await fetchOandaAccountSummary(oandaCfg(creds));
        return { ...base, ...cap, ok: true, error: null };
      } catch (e) {
        return {
          ...base,
          currency: 'USD',
          balance: null,
          nav: null,
          unrealizedPl: null,
          marginUsed: null,
          marginAvailable: null,
          openTradeCount: null,
          ok: false,
          error: e instanceof Error ? e.message : 'Could not reach OANDA',
        };
      }
    }),
  );
  return out;
}

// ---- instruments (cached: the tradeable set and its precisions barely move) ----

const SPEC_TTL_MS = 10 * 60_000;
const specCache = new Map<string, { at: number; specs: OandaInstrumentSpec[] }>();

export async function deskInstruments(userId: string, connectionId: string): Promise<OandaInstrumentSpec[]> {
  const conn = await resolveConnection(userId, connectionId);
  const hit = specCache.get(connectionId);
  if (hit && Date.now() - hit.at < SPEC_TTL_MS) return hit.specs;
  const specs = await viaBroker(() => fetchOandaInstrumentSpecs(conn.cfg));
  specCache.set(connectionId, { at: Date.now(), specs });
  return specs;
}

async function specFor(
  userId: string,
  connectionId: string,
  instrument: string,
): Promise<OandaInstrumentSpec> {
  const specs = await deskInstruments(userId, connectionId);
  const symbol = toOandaSymbol(instrument);
  const spec = specs.find((s) => s.symbol === symbol);
  if (!spec) throw new DeskError(`${instrument} is not tradeable on this account`, 400);
  return spec;
}

// ---- quotes ----

export async function deskQuotes(
  userId: string,
  connectionId: string,
  instruments: string[],
): Promise<OandaQuote[]> {
  const conn = await resolveConnection(userId, connectionId);
  if (instruments.length === 0) return [];
  return viaBroker(() => fetchOandaQuotes(conn.cfg, instruments));
}

// ---- the order journal ----

export interface DeskOrderRecord {
  id: string;
  connectionId: string;
  kind: TradeOrderKind;
  instrument: string;
  side: 'long' | 'short' | null;
  orderType: TradeOrderType | null;
  units: number | null;
  requestedPrice: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  status: TradeOrderStatus;
  brokerOrderId: string | null;
  brokerTradeId: string | null;
  fillPrice: number | null;
  realizedPl: number | null;
  errorCode: string | null;
  error: string | null;
  createdAt: number;
}

async function journal(
  userId: string,
  row: Omit<DeskOrderRecord, 'id' | 'createdAt'> & { broker?: string },
): Promise<void> {
  await db.insert(tradingOrders).values({
    id: crypto.randomUUID(),
    userId,
    connectionId: row.connectionId,
    broker: row.broker ?? 'oanda',
    kind: row.kind,
    instrument: row.instrument,
    side: row.side,
    orderType: row.orderType,
    units: row.units,
    requestedPrice: row.requestedPrice,
    takeProfit: row.takeProfit,
    stopLoss: row.stopLoss,
    status: row.status,
    brokerOrderId: row.brokerOrderId,
    brokerTradeId: row.brokerTradeId,
    fillPrice: row.fillPrice,
    realizedPl: row.realizedPl,
    errorCode: row.errorCode,
    error: row.error,
    createdAt: new Date(),
  });
}

export async function recentDeskOrders(userId: string, limit = 40): Promise<DeskOrderRecord[]> {
  const rows = await db
    .select()
    .from(tradingOrders)
    .where(eq(tradingOrders.userId, userId))
    .orderBy(desc(tradingOrders.createdAt))
    .limit(Math.max(1, Math.min(200, limit)));
  return rows.map((r) => ({
    id: r.id,
    connectionId: r.connectionId,
    kind: r.kind,
    instrument: r.instrument,
    side: r.side ?? null,
    orderType: r.orderType ?? null,
    units: r.units,
    requestedPrice: r.requestedPrice,
    takeProfit: r.takeProfit,
    stopLoss: r.stopLoss,
    status: r.status,
    brokerOrderId: r.brokerOrderId,
    brokerTradeId: r.brokerTradeId,
    fillPrice: r.fillPrice,
    realizedPl: r.realizedPl,
    errorCode: r.errorCode,
    error: r.error,
    createdAt: r.createdAt.getTime(),
  }));
}

// ---- placing ----

export interface PlaceInput {
  connectionId: string;
  instrument: string; // display or OANDA form
  side: 'long' | 'short';
  units: number; // absolute size
  type: TradeOrderType;
  price?: number | null; // limit/stop only
  takeProfit?: number | null;
  stopLoss?: number | null;
}

export interface PlaceResult {
  status: 'filled' | 'accepted';
  orderId: string | null;
  tradeId: string | null;
  fillPrice: number | null;
  units: number | null;
  instrument: string;
  side: 'long' | 'short';
  env: 'practice' | 'live';
}

// A trader's own double-click, a flaky connection retried by the browser, or a
// second tab can all send the same ticket twice seconds apart — and at a broker
// that means two positions, not one. Identical tickets inside this window are
// refused outright; anyone who genuinely wants the same size again can send it
// after the window (or send it as a second, differently-sized ticket).
const DUPLICATE_WINDOW_MS = 5_000;

async function refuseDuplicate(userId: string, input: PlaceInput, instrument: string): Promise<void> {
  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS);
  const recent = await db
    .select({
      instrument: tradingOrders.instrument,
      side: tradingOrders.side,
      units: tradingOrders.units,
      orderType: tradingOrders.orderType,
      status: tradingOrders.status,
      connectionId: tradingOrders.connectionId,
      kind: tradingOrders.kind,
    })
    .from(tradingOrders)
    .where(and(eq(tradingOrders.userId, userId), gte(tradingOrders.createdAt, since)));
  const dup = recent.some(
    (r) =>
      r.kind === 'entry' &&
      r.status !== 'rejected' &&
      r.connectionId === input.connectionId &&
      r.instrument === instrument &&
      r.side === input.side &&
      r.orderType === input.type &&
      r.units === input.units,
  );
  if (dup) {
    throw new DeskError(
      'An identical order went in seconds ago — waiting a moment before repeating it, in case that was a double-click',
      409,
      'DUPLICATE',
    );
  }
}

// Round to a broker-acceptable precision. OANDA refuses an over-precise price or
// size outright, so this is validation, not tidying.
function round(v: number, precision: number): number {
  const f = Math.pow(10, Math.max(0, Math.min(10, precision)));
  return Math.round(v * f) / f;
}

// Sanity-check the protective orders against the price the trade will open at:
// a long's stop must sit below it and its target above (and the reverse for a
// short). OANDA enforces this too, but catching it here means the trader is told
// which field is wrong instead of reading a rejection code.
function checkProtection(
  side: 'long' | 'short',
  reference: number | null,
  takeProfit: number | null | undefined,
  stopLoss: number | null | undefined,
): void {
  if (reference == null) return; // no price to judge against — let the broker rule
  const long = side === 'long';
  if (stopLoss != null) {
    if (long && stopLoss >= reference) throw new DeskError('A long’s stop loss has to be below the entry price');
    if (!long && stopLoss <= reference) throw new DeskError('A short’s stop loss has to be above the entry price');
  }
  if (takeProfit != null) {
    if (long && takeProfit <= reference) throw new DeskError('A long’s take profit has to be above the entry price');
    if (!long && takeProfit >= reference) throw new DeskError('A short’s take profit has to be below the entry price');
  }
}

export async function placeDeskOrder(user: UserRow, input: PlaceInput): Promise<PlaceResult> {
  refuseDemo(user);
  const conn = await resolveConnection(user.id, input.connectionId);
  const spec = await specFor(user.id, input.connectionId, input.instrument);

  if (!Number.isFinite(input.units) || input.units <= 0) {
    throw new DeskError('Enter a position size greater than zero');
  }
  const units = round(input.units, spec.tradeUnitsPrecision);
  if (units < spec.minimumTradeSize) {
    throw new DeskError(`${spec.displayName} has a minimum size of ${spec.minimumTradeSize} units`);
  }
  if (spec.maximumOrderUnits != null && units > spec.maximumOrderUnits) {
    throw new DeskError(`${spec.displayName} allows at most ${spec.maximumOrderUnits} units per order`);
  }

  const price = input.price == null ? null : round(input.price, spec.displayPrecision);
  if (input.type !== 'market' && price == null) {
    throw new DeskError('A limit or stop order needs a price');
  }
  const takeProfit = input.takeProfit == null ? null : round(input.takeProfit, spec.displayPrecision);
  const stopLoss = input.stopLoss == null ? null : round(input.stopLoss, spec.displayPrecision);

  // A market order is judged against the side of the book it will actually pay;
  // a resting order against its own trigger price.
  let reference = price;
  if (input.type === 'market') {
    const [quote] = await fetchOandaQuotes(conn.cfg, [spec.symbol]).catch(() => []);
    if (quote && !quote.tradeable) {
      throw new DeskError(`${spec.displayName} is not tradeable right now (market closed or halted)`, 409, 'HALTED');
    }
    reference = input.side === 'long' ? quote?.ask ?? null : quote?.bid ?? null;
  }
  checkProtection(input.side, reference, takeProfit, stopLoss);

  await refuseDuplicate(user.id, { ...input, units }, spec.instrument);

  const shared = {
    connectionId: conn.id,
    kind: 'entry' as const,
    instrument: spec.instrument,
    side: input.side,
    orderType: input.type,
    units,
    requestedPrice: price,
    takeProfit,
    stopLoss,
    realizedPl: null,
  };

  try {
    const res = await placeOandaOrder(conn.cfg, {
      instrument: spec.symbol,
      // OANDA encodes direction in the sign of the size.
      units: input.side === 'long' ? units : -units,
      type: input.type.toUpperCase() as 'MARKET' | 'LIMIT' | 'STOP',
      price,
      takeProfit,
      stopLoss,
      displayPrecision: spec.displayPrecision,
      tradeUnitsPrecision: spec.tradeUnitsPrecision,
    });
    await journal(user.id, {
      ...shared,
      status: res.status,
      brokerOrderId: res.orderId,
      brokerTradeId: res.tradeId,
      fillPrice: res.fillPrice,
      errorCode: null,
      error: null,
    });
    // The wall this trader (and their team) reads is cached for a few seconds;
    // a position they just opened should not have to wait it out.
    invalidateDeskSnapshot(user.teamId ?? `solo:${user.id}`);
    return {
      status: res.status,
      orderId: res.orderId,
      tradeId: res.tradeId,
      fillPrice: res.fillPrice,
      units: res.units == null ? units : Math.abs(res.units),
      instrument: spec.instrument,
      side: input.side,
      env: conn.env,
    };
  } catch (e) {
    const err = e instanceof OandaOrderError ? e : null;
    const message = e instanceof Error ? e.message : 'The order could not be placed';
    // A refusal is worth keeping: it is the record of an order that never became
    // a position, which is exactly what is missing when reconstructing a session.
    await journal(user.id, {
      ...shared,
      status: 'rejected',
      brokerOrderId: null,
      brokerTradeId: null,
      fillPrice: null,
      errorCode: err?.code ?? null,
      error: message.slice(0, 400),
    });
    throw new DeskError(message, 502, err?.code ?? null);
  }
}

// ---- closing an open trade ----

export interface CloseInput {
  connectionId: string;
  tradeId: string; // OANDA trade id (not the desk's namespaced position key)
  instrument: string;
  units?: number | null; // omit / null = close it all
}

export interface CloseResult {
  closedUnits: number | null;
  price: number | null;
  realizedPl: number | null;
  partial: boolean;
}

export async function closeDeskPosition(user: UserRow, input: CloseInput): Promise<CloseResult> {
  refuseDemo(user);
  const conn = await resolveConnection(user.id, input.connectionId);
  const spec = await specFor(user.id, input.connectionId, input.instrument).catch(() => null);
  const units = input.units == null || input.units <= 0 ? ('ALL' as const) : input.units;

  const shared = {
    connectionId: conn.id,
    kind: 'close' as const,
    instrument: spec?.instrument ?? input.instrument,
    side: null,
    orderType: null,
    units: units === 'ALL' ? null : units,
    requestedPrice: null,
    takeProfit: null,
    stopLoss: null,
  };

  try {
    const res = await closeOandaTrade(conn.cfg, input.tradeId, units, spec?.tradeUnitsPrecision ?? 0);
    await journal(user.id, {
      ...shared,
      status: 'filled',
      brokerOrderId: null,
      brokerTradeId: input.tradeId,
      fillPrice: res.price,
      realizedPl: res.realizedPl,
      errorCode: null,
      error: null,
    });
    invalidateDeskSnapshot(user.teamId ?? `solo:${user.id}`);
    return { closedUnits: res.closedUnits, price: res.price, realizedPl: res.realizedPl, partial: res.partial };
  } catch (e) {
    const err = e instanceof OandaOrderError ? e : null;
    const message = e instanceof Error ? e.message : 'The position could not be closed';
    await journal(user.id, {
      ...shared,
      status: 'rejected',
      brokerOrderId: null,
      brokerTradeId: input.tradeId,
      fillPrice: null,
      realizedPl: null,
      errorCode: err?.code ?? null,
      error: message.slice(0, 400),
    });
    throw new DeskError(message, 502, err?.code ?? null);
  }
}

// ---- amending a live trade's stop / target ----

export interface ModifyInput {
  connectionId: string;
  tradeId: string;
  instrument: string;
  // undefined = leave alone; null = remove that order; a number = set it.
  takeProfit?: number | null;
  stopLoss?: number | null;
}

export async function modifyDeskPosition(user: UserRow, input: ModifyInput): Promise<void> {
  refuseDemo(user);
  const conn = await resolveConnection(user.id, input.connectionId);
  const spec = await specFor(user.id, input.connectionId, input.instrument);
  const takeProfit = input.takeProfit == null ? input.takeProfit : round(input.takeProfit, spec.displayPrecision);
  const stopLoss = input.stopLoss == null ? input.stopLoss : round(input.stopLoss, spec.displayPrecision);
  if (takeProfit === undefined && stopLoss === undefined) {
    throw new DeskError('Nothing to change');
  }

  const shared = {
    connectionId: conn.id,
    kind: 'modify' as const,
    instrument: spec.instrument,
    side: null,
    orderType: null,
    units: null,
    requestedPrice: null,
    takeProfit: takeProfit ?? null,
    stopLoss: stopLoss ?? null,
    realizedPl: null,
  };

  try {
    await modifyOandaTradeOrders(conn.cfg, input.tradeId, {
      takeProfit,
      stopLoss,
      displayPrecision: spec.displayPrecision,
    });
    await journal(user.id, {
      ...shared,
      status: 'filled',
      brokerOrderId: null,
      brokerTradeId: input.tradeId,
      fillPrice: null,
      errorCode: null,
      error: null,
    });
    invalidateDeskSnapshot(user.teamId ?? `solo:${user.id}`);
  } catch (e) {
    const err = e instanceof OandaOrderError ? e : null;
    const message = e instanceof Error ? e.message : 'The change could not be applied';
    await journal(user.id, {
      ...shared,
      status: 'rejected',
      brokerOrderId: null,
      brokerTradeId: input.tradeId,
      fillPrice: null,
      errorCode: err?.code ?? null,
      error: message.slice(0, 400),
    });
    throw new DeskError(message, 502, err?.code ?? null);
  }
}

// ---- working (resting) orders ----

export interface DeskWorkingOrder extends OandaWorkingOrder {
  connectionId: string;
  connectionLabel: string;
}

// Every resting order across the caller's own OANDA accounts. TP/SL orders that
// belong to an open trade are filtered out — they are shown on the position they
// protect, not as standalone working orders.
export async function listDeskWorkingOrders(userId: string): Promise<DeskWorkingOrder[]> {
  const conns = (await getActiveDecrypted(userId)).filter((c) => c.broker === 'oanda');
  const results = await Promise.all(
    conns.map(async (c) => {
      try {
        const orders = await fetchOandaPendingOrders(oandaCfg(c.creds as OandaCreds));
        return orders
          .filter((o) => !o.tradeId)
          .map((o) => ({ ...o, connectionId: c.id, connectionLabel: c.label }));
      } catch {
        return []; // best-effort: an unreachable account shows no working orders
      }
    }),
  );
  return results.flat().sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export async function cancelDeskOrder(
  user: UserRow,
  input: { connectionId: string; orderId: string; instrument?: string },
): Promise<void> {
  refuseDemo(user);
  const conn = await resolveConnection(user.id, input.connectionId);
  const shared = {
    connectionId: conn.id,
    kind: 'cancel' as const,
    instrument: input.instrument ?? '—',
    side: null,
    orderType: null,
    units: null,
    requestedPrice: null,
    takeProfit: null,
    stopLoss: null,
    realizedPl: null,
    brokerOrderId: input.orderId,
    brokerTradeId: null,
    fillPrice: null,
  };
  try {
    await cancelOandaOrder(conn.cfg, input.orderId);
    await journal(user.id, { ...shared, status: 'filled', errorCode: null, error: null });
  } catch (e) {
    const err = e instanceof OandaOrderError ? e : null;
    const message = e instanceof Error ? e.message : 'The order could not be cancelled';
    await journal(user.id, { ...shared, status: 'rejected', errorCode: err?.code ?? null, error: message.slice(0, 400) });
    throw new DeskError(message, 502, err?.code ?? null);
  }
}
