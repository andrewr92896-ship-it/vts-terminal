import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { manualPositions, TRADE_SIDES, type ManualPositionRow, type TradeSide } from '../db/schema.js';
import { computeForex } from './forex.js';
import type { LiveTrade } from './types.js';

// A "manual" broker connection has no API, the trader enters open positions by
// hand here, and they render on the Live Wall exactly like broker-streamed
// positions (with the same forex pip math). Manual positions are assumed to be
// in a USD account. Everything is owner-scoped (userId) so one trader can never
// touch another's entries.

export interface ManualPositionView {
  id: string;
  connectionId: string;
  instrument: string;
  side: 'long' | 'short';
  units: number;
  entryPrice: number;
  currentPrice: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  trailingStopLoss: number | null;
  plannedEntry: number | null;
  openedAt: number | null;
}

export interface ManualPositionInput {
  instrument: string;
  side?: TradeSide;
  units?: number;
  entryPrice: number;
  currentPrice?: number | null;
  takeProfit?: number | null;
  stopLoss?: number | null;
  trailingStopLoss?: number | null;
  plannedEntry?: number | null;
  openedAt?: number;
}

function isSide(v: unknown): v is TradeSide {
  return typeof v === 'string' && (TRADE_SIDES as readonly string[]).includes(v);
}

// Optional numeric: undefined/null/NaN → null; otherwise the finite number.
function cleanNum(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return v;
}

function toView(row: ManualPositionRow): ManualPositionView {
  return {
    id: row.id,
    connectionId: row.connectionId,
    instrument: row.instrument,
    side: isSide(row.side) ? row.side : 'long',
    units: row.units,
    entryPrice: row.entryPrice,
    currentPrice: row.currentPrice,
    takeProfit: row.takeProfit,
    stopLoss: row.stopLoss,
    trailingStopLoss: row.trailingStopLoss,
    plannedEntry: row.plannedEntry,
    openedAt: row.openedAt ? row.openedAt.getTime() : null,
  };
}

export async function listManualPositions(connectionId: string): Promise<ManualPositionView[]> {
  const rows = await db
    .select()
    .from(manualPositions)
    .where(eq(manualPositions.connectionId, connectionId));
  return [...rows]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(toView);
}

export async function addManualPosition(
  userId: string,
  connectionId: string,
  input: ManualPositionInput,
): Promise<ManualPositionView[]> {
  const instrument = input.instrument.trim();
  if (!instrument) throw new Error('Instrument is required');
  if (instrument.length > 40) throw new Error('Instrument is too long');
  const units = cleanNum(input.units) ?? 0;
  if (units < 0) throw new Error('Units cannot be negative');
  if (!Number.isFinite(input.entryPrice)) throw new Error('A valid entry price is required');
  const now = new Date();
  await db.insert(manualPositions).values({
    id: crypto.randomUUID(),
    userId,
    connectionId,
    instrument: instrument.slice(0, 40),
    side: isSide(input.side) ? input.side : 'long',
    units,
    entryPrice: input.entryPrice,
    currentPrice: cleanNum(input.currentPrice),
    takeProfit: cleanNum(input.takeProfit),
    stopLoss: cleanNum(input.stopLoss),
    trailingStopLoss: cleanNum(input.trailingStopLoss),
    plannedEntry: cleanNum(input.plannedEntry),
    openedAt: input.openedAt ? new Date(input.openedAt) : now,
    createdAt: now,
    updatedAt: now,
  });
  return listManualPositions(connectionId);
}

export async function updateManualPosition(
  userId: string,
  positionId: string,
  input: Partial<ManualPositionInput>,
): Promise<ManualPositionView[]> {
  const existing = (
    await db
      .select()
      .from(manualPositions)
      .where(and(eq(manualPositions.id, positionId), eq(manualPositions.userId, userId)))
      .limit(1)
  )[0];
  if (!existing) throw new Error('Position not found');

  const patch: Partial<typeof manualPositions.$inferInsert> = { updatedAt: new Date() };
  if (input.instrument !== undefined) {
    const inst = input.instrument.trim();
    if (!inst) throw new Error('Instrument is required');
    patch.instrument = inst.slice(0, 40);
  }
  if (input.side !== undefined && isSide(input.side)) patch.side = input.side;
  if (input.units !== undefined) {
    const u = cleanNum(input.units) ?? 0;
    if (u < 0) throw new Error('Units cannot be negative');
    patch.units = u;
  }
  if (input.entryPrice !== undefined) {
    if (!Number.isFinite(input.entryPrice)) throw new Error('A valid entry price is required');
    patch.entryPrice = input.entryPrice;
  }
  if (input.currentPrice !== undefined) patch.currentPrice = cleanNum(input.currentPrice);
  if (input.takeProfit !== undefined) patch.takeProfit = cleanNum(input.takeProfit);
  if (input.stopLoss !== undefined) patch.stopLoss = cleanNum(input.stopLoss);
  if (input.trailingStopLoss !== undefined) patch.trailingStopLoss = cleanNum(input.trailingStopLoss);
  if (input.plannedEntry !== undefined) patch.plannedEntry = cleanNum(input.plannedEntry);
  if (input.openedAt !== undefined) patch.openedAt = new Date(input.openedAt);

  await db
    .update(manualPositions)
    .set(patch)
    .where(and(eq(manualPositions.id, positionId), eq(manualPositions.userId, userId)));
  return listManualPositions(existing.connectionId);
}

export async function removeManualPosition(userId: string, positionId: string): Promise<ManualPositionView[]> {
  const row = (
    await db
      .select()
      .from(manualPositions)
      .where(and(eq(manualPositions.id, positionId), eq(manualPositions.userId, userId)))
      .limit(1)
  )[0];
  if (!row) return [];
  await db
    .delete(manualPositions)
    .where(and(eq(manualPositions.id, positionId), eq(manualPositions.userId, userId)));
  return listManualPositions(row.connectionId);
}

// Map a manual connection's positions to the normalized LiveTrade shape. The
// service re-keys ids and fills in connectionId/brokerName, so those are left
// empty here. Manual positions are assumed account-currency USD for pip math.
export async function getManualTrades(connectionId: string): Promise<LiveTrade[]> {
  const positions = await listManualPositions(connectionId);
  return positions.map((p) => {
    const trade: LiveTrade = {
      id: p.id,
      connectionId: '',
      ownerId: '', // set by the service from the connection's owner
      owner: '',
      broker: 'manual',
      brokerName: '',
      instrument: p.instrument,
      side: p.side,
      units: p.units,
      plannedEntry: p.plannedEntry,
      entryPrice: p.entryPrice,
      currentPrice: p.currentPrice,
      takeProfit: p.takeProfit,
      stopLoss: p.stopLoss,
      trailingStopLoss: p.trailingStopLoss,
      slippage: null,
      unrealizedPl: null,
      strategy: null,
      timeframe: null,
      openedAt: p.openedAt,
      forex: null,
    };
    trade.forex = computeForex(trade, 'USD');
    return trade;
  });
}
