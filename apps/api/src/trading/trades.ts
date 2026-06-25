import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  tradingTrades,
  users,
  TRADE_SIDES,
  TRADE_STATUSES,
  type TradeSide,
  type TradeStatus,
  type TradingTradeRow,
} from '../db/schema.js';
import { canAccessWorkspace, parseRoles } from '../auth/rbac.js';

// The Trade Log is a shared trading-desk view: every user with trading access
// (full or view-only) sees every other trading user's trades in full — capital
// (realized P/L), lot sizes, fills, and all — each tagged with the owner's
// username. Rows are still keyed by userId, so a trader can only edit, remove,
// or restore their own; those paths stay scoped to the owner. Slippage is
// derived on read (entry vs. planned), never stored.

export interface TradeRecord {
  id: string;
  ownerId: string; // the user who logged the trade
  owner: string; // that user's username, shown on the trade
  isMine: boolean; // the viewing user owns this trade (may edit/remove it)
  broker: string | null;
  instrument: string;
  side: TradeSide;
  status: TradeStatus;
  plannedEntry: number | null;
  entryPrice: number;
  exitPrice: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  units: number;
  slippage: number | null; // entryPrice - plannedEntry, computed
  realizedPl: number | null; // null only while open / unknown — shared with the desk
  strategy: string | null;
  timeframe: string | null;
  openedAt: number; // ms
  closedAt: number | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TradeSummary {
  total: number;
  open: number;
  closed: number;
  wins: number;
  losses: number;
  winRate: number; // 0..1 over closed trades with a known P/L
  totalRealizedPl: number; // desk-wide realized P/L across closed trades
  avgSlippage: number | null; // over trades that have a planned entry
}

export interface TradeLogData {
  trades: TradeRecord[];
  summary: TradeSummary;
}

export interface TradeInput {
  broker?: string | null;
  instrument: string;
  side?: TradeSide;
  status?: TradeStatus;
  plannedEntry?: number | null;
  entryPrice: number;
  exitPrice?: number | null;
  takeProfit?: number | null;
  stopLoss?: number | null;
  units?: number;
  realizedPl?: number | null;
  strategy?: string | null;
  timeframe?: string | null;
  openedAt?: number; // ms; defaults to now
  closedAt?: number | null;
  notes?: string | null;
}

function isSide(v: unknown): v is TradeSide {
  return typeof v === 'string' && (TRADE_SIDES as readonly string[]).includes(v);
}
function isStatus(v: unknown): v is TradeStatus {
  return typeof v === 'string' && (TRADE_STATUSES as readonly string[]).includes(v);
}

function cleanText(v: string | null | undefined, max: number): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

// Optional numeric: undefined/null/NaN → null; otherwise the finite number.
function cleanNum(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return v;
}

function slippageOf(plannedEntry: number | null, entryPrice: number): number | null {
  if (plannedEntry == null) return null;
  return Number((entryPrice - plannedEntry).toFixed(8));
}

function toRecord(row: TradingTradeRow, owner: string, viewerId: string): TradeRecord {
  return {
    id: row.id,
    ownerId: row.userId,
    owner,
    isMine: row.userId === viewerId,
    broker: row.broker,
    instrument: row.instrument,
    side: isSide(row.side) ? row.side : 'long',
    status: isStatus(row.status) ? row.status : 'closed',
    plannedEntry: row.plannedEntry,
    entryPrice: row.entryPrice,
    exitPrice: row.exitPrice,
    takeProfit: row.takeProfit,
    stopLoss: row.stopLoss,
    units: row.units,
    slippage: slippageOf(row.plannedEntry, row.entryPrice),
    realizedPl: row.realizedPl,
    strategy: row.strategy,
    timeframe: row.timeframe,
    openedAt: row.openedAt.getTime(),
    closedAt: row.closedAt ? row.closedAt.getTime() : null,
    notes: row.notes,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

function summarize(rows: TradingTradeRow[]): TradeSummary {
  let open = 0;
  let closed = 0;
  let wins = 0;
  let losses = 0;
  let totalPl = 0;
  let slipSum = 0;
  let slipCount = 0;
  let scored = 0; // closed trades with a known P/L

  for (const r of rows) {
    if (r.status === 'open') open += 1;
    else closed += 1;
    if (r.realizedPl != null) {
      totalPl += r.realizedPl;
      if (r.status === 'closed') {
        scored += 1;
        if (r.realizedPl >= 0) wins += 1;
        else losses += 1;
      }
    }
    const slip = slippageOf(r.plannedEntry, r.entryPrice);
    if (slip != null) {
      slipSum += slip;
      slipCount += 1;
    }
  }

  return {
    total: rows.length,
    open,
    closed,
    wins,
    losses,
    winRate: scored > 0 ? wins / scored : 0,
    totalRealizedPl: totalPl,
    avgSlippage: slipCount > 0 ? Number((slipSum / slipCount).toFixed(8)) : null,
  };
}

export async function getTrades(viewerId: string): Promise<TradeLogData> {
  // Pull every trade alongside its owner's username and roles, then keep only
  // those owned by a user who currently has trading access (full or view-only).
  // Joining live keeps the desk view correct as people's roles change.
  const rows = await db
    .select({
      trade: tradingTrades,
      username: users.username,
      roles: users.roles,
    })
    .from(tradingTrades)
    .innerJoin(users, eq(users.id, tradingTrades.userId));

  const visible = rows.filter((r) => canAccessWorkspace(parseRoles({ roles: r.roles }), 'trading'));

  // Open trades first, then newest by open time — the order a trader scans in.
  const sorted = [...visible].sort((a, b) => {
    if (a.trade.status !== b.trade.status) return a.trade.status === 'open' ? -1 : 1;
    return b.trade.openedAt.getTime() - a.trade.openedAt.getTime();
  });
  return {
    trades: sorted.map((r) => toRecord(r.trade, r.username, viewerId)),
    summary: summarize(visible.map((r) => r.trade)),
  };
}

export async function addTrade(userId: string, input: TradeInput): Promise<string> {
  const instrument = input.instrument.trim();
  if (!instrument) throw new Error('Instrument is required');
  if (!Number.isFinite(input.entryPrice)) throw new Error('A valid entry price is required');
  const now = new Date();
  const status: TradeStatus = isStatus(input.status) ? input.status : 'closed';
  const id = crypto.randomUUID();
  await db.insert(tradingTrades).values({
    id,
    userId,
    broker: cleanText(input.broker, 40),
    instrument: instrument.slice(0, 40),
    side: isSide(input.side) ? input.side : 'long',
    status,
    plannedEntry: cleanNum(input.plannedEntry),
    entryPrice: input.entryPrice,
    exitPrice: cleanNum(input.exitPrice),
    takeProfit: cleanNum(input.takeProfit),
    stopLoss: cleanNum(input.stopLoss),
    units: cleanNum(input.units) ?? 0,
    realizedPl: cleanNum(input.realizedPl),
    strategy: cleanText(input.strategy, 80),
    timeframe: cleanText(input.timeframe, 16),
    openedAt: input.openedAt ? new Date(input.openedAt) : now,
    closedAt: input.closedAt != null ? new Date(input.closedAt) : status === 'closed' ? now : null,
    notes: cleanText(input.notes, 2000),
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function updateTrade(
  userId: string,
  id: string,
  input: Partial<TradeInput>,
): Promise<void> {
  const existing = (
    await db
      .select()
      .from(tradingTrades)
      .where(and(eq(tradingTrades.id, id), eq(tradingTrades.userId, userId)))
      .limit(1)
  )[0];
  if (!existing) throw new Error('Trade not found');

  const patch: Partial<typeof tradingTrades.$inferInsert> = { updatedAt: new Date() };
  if (input.broker !== undefined) patch.broker = cleanText(input.broker, 40);
  if (input.instrument !== undefined) {
    const inst = input.instrument.trim();
    if (!inst) throw new Error('Instrument is required');
    patch.instrument = inst.slice(0, 40);
  }
  if (input.side !== undefined && isSide(input.side)) patch.side = input.side;
  if (input.status !== undefined && isStatus(input.status)) patch.status = input.status;
  if (input.plannedEntry !== undefined) patch.plannedEntry = cleanNum(input.plannedEntry);
  if (input.entryPrice !== undefined) {
    if (!Number.isFinite(input.entryPrice)) throw new Error('A valid entry price is required');
    patch.entryPrice = input.entryPrice;
  }
  if (input.exitPrice !== undefined) patch.exitPrice = cleanNum(input.exitPrice);
  if (input.takeProfit !== undefined) patch.takeProfit = cleanNum(input.takeProfit);
  if (input.stopLoss !== undefined) patch.stopLoss = cleanNum(input.stopLoss);
  if (input.units !== undefined) patch.units = cleanNum(input.units) ?? 0;
  if (input.realizedPl !== undefined) patch.realizedPl = cleanNum(input.realizedPl);
  if (input.strategy !== undefined) patch.strategy = cleanText(input.strategy, 80);
  if (input.timeframe !== undefined) patch.timeframe = cleanText(input.timeframe, 16);
  if (input.openedAt !== undefined) patch.openedAt = new Date(input.openedAt);
  if (input.closedAt !== undefined) patch.closedAt = input.closedAt == null ? null : new Date(input.closedAt);
  if (input.notes !== undefined) patch.notes = cleanText(input.notes, 2000);

  await db
    .update(tradingTrades)
    .set(patch)
    .where(and(eq(tradingTrades.id, id), eq(tradingTrades.userId, userId)));
}

// Raw fields needed to restore a removed trade exactly (undo).
export interface RemovedTrade {
  id: string;
  broker: string | null;
  instrument: string;
  side: TradeSide;
  status: TradeStatus;
  plannedEntry: number | null;
  entryPrice: number;
  exitPrice: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  units: number;
  realizedPl: number | null;
  strategy: string | null;
  timeframe: string | null;
  openedAt: number;
  closedAt: number | null;
  notes: string | null;
  createdAt: number;
}

export async function removeTrade(userId: string, id: string): Promise<RemovedTrade | null> {
  const row = (
    await db
      .select()
      .from(tradingTrades)
      .where(and(eq(tradingTrades.id, id), eq(tradingTrades.userId, userId)))
      .limit(1)
  )[0];
  if (!row) return null;
  await db
    .delete(tradingTrades)
    .where(and(eq(tradingTrades.id, id), eq(tradingTrades.userId, userId)));
  return {
    id: row.id,
    broker: row.broker,
    instrument: row.instrument,
    side: isSide(row.side) ? row.side : 'long',
    status: isStatus(row.status) ? row.status : 'closed',
    plannedEntry: row.plannedEntry,
    entryPrice: row.entryPrice,
    exitPrice: row.exitPrice,
    takeProfit: row.takeProfit,
    stopLoss: row.stopLoss,
    units: row.units,
    realizedPl: row.realizedPl,
    strategy: row.strategy,
    timeframe: row.timeframe,
    openedAt: row.openedAt.getTime(),
    closedAt: row.closedAt ? row.closedAt.getTime() : null,
    notes: row.notes,
    createdAt: row.createdAt.getTime(),
  };
}

export async function restoreTrade(userId: string, t: RemovedTrade): Promise<void> {
  await db
    .insert(tradingTrades)
    .values({
      id: t.id,
      userId,
      broker: t.broker,
      instrument: t.instrument,
      side: isSide(t.side) ? t.side : 'long',
      status: isStatus(t.status) ? t.status : 'closed',
      plannedEntry: t.plannedEntry,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      takeProfit: t.takeProfit,
      stopLoss: t.stopLoss,
      units: t.units,
      realizedPl: t.realizedPl,
      strategy: t.strategy,
      timeframe: t.timeframe,
      openedAt: new Date(t.openedAt),
      closedAt: t.closedAt != null ? new Date(t.closedAt) : null,
      notes: t.notes,
      createdAt: new Date(t.createdAt),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
}
