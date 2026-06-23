import crypto from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingPositions, type TradeSide, type TradingPositionRow } from '../db/schema.js';
import type { LiveTrade } from './types.js';

// Reconcile the Live Wall's open positions against what we last stored, so that
// closures can be detected and auto-recorded to History.
//
// `okBrokers` is the set of broker keys that actually responded this cycle. A
// position only counts as closed if its broker responded AND the position is no
// longer in the live feed — so a broker that errored (its positions vanish from
// the feed) can never trigger false closures.
export async function reconcile(
  userId: string,
  okBrokers: Set<string>,
  liveTrades: LiveTrade[],
): Promise<void> {
  const now = new Date();
  const openRows = await db
    .select()
    .from(tradingPositions)
    .where(and(eq(tradingPositions.userId, userId), eq(tradingPositions.status, 'open')));
  const byKey = new Map(openRows.map((r) => [r.key, r]));
  const currentKeys = new Set(liveTrades.map((t) => t.id));

  // Upsert every currently-open position (refresh mark + P/L, or insert new).
  for (const t of liveTrades) {
    const existing = byKey.get(t.id);
    if (existing) {
      await db
        .update(tradingPositions)
        .set({
          currentPrice: t.currentPrice,
          unrealizedPl: t.unrealizedPl,
          takeProfit: t.takeProfit,
          stopLoss: t.stopLoss,
          units: t.units,
          lastSeenAt: now,
        })
        .where(eq(tradingPositions.id, existing.id));
    } else {
      await db.insert(tradingPositions).values({
        id: crypto.randomUUID(),
        userId,
        key: t.id,
        broker: t.broker,
        instrument: t.instrument,
        side: t.side,
        units: t.units,
        plannedEntry: t.plannedEntry,
        entryPrice: t.entryPrice,
        takeProfit: t.takeProfit,
        stopLoss: t.stopLoss,
        currentPrice: t.currentPrice,
        unrealizedPl: t.unrealizedPl,
        strategy: t.strategy,
        timeframe: t.timeframe,
        status: 'open',
        openedAt: t.openedAt != null ? new Date(t.openedAt) : null,
        firstSeenAt: now,
        lastSeenAt: now,
      });
    }
  }

  // Close positions that vanished from a broker that DID respond this cycle.
  for (const r of openRows) {
    if (okBrokers.has(r.broker) && !currentKeys.has(r.key)) {
      await db
        .update(tradingPositions)
        .set({
          status: 'closed',
          closedAt: now,
          exitPrice: r.currentPrice, // last mark we saw before it disappeared
          realizedPl: r.unrealizedPl, // last open P/L we saw
        })
        .where(eq(tradingPositions.id, r.id));
    }
  }
}

// ---- History read model ----
export interface HistoryRecord {
  id: string;
  broker: string;
  instrument: string;
  side: TradeSide;
  units: number;
  plannedEntry: number | null;
  entryPrice: number;
  exitPrice: number | null;
  slippage: number | null; // entry - planned, computed
  realizedPl: number | null; // gated by viewBrokerage
  strategy: string | null;
  timeframe: string | null;
  openedAt: number | null;
  closedAt: number | null;
}

export interface HistoryGroup {
  label: string;
  count: number;
  wins: number;
  losses: number;
  realizedPl: number | null; // gated
}

export interface HistorySummary {
  closed: number;
  wins: number;
  losses: number;
  winRate: number; // 0..1 over closed trades with a known P/L
  totalRealizedPl: number | null; // gated
  byStrategy: HistoryGroup[];
  byInstrument: HistoryGroup[];
}

export interface HistoryData {
  trades: HistoryRecord[];
  summary: HistorySummary;
}

function slippageOf(planned: number | null, entry: number): number | null {
  if (planned == null) return null;
  return Number((entry - planned).toFixed(8));
}

function toRecord(row: TradingPositionRow, canSeeBalances: boolean): HistoryRecord {
  return {
    id: row.id,
    broker: row.broker,
    instrument: row.instrument,
    side: row.side as TradeSide,
    units: row.units,
    plannedEntry: row.plannedEntry,
    entryPrice: row.entryPrice,
    exitPrice: row.exitPrice,
    slippage: slippageOf(row.plannedEntry, row.entryPrice),
    realizedPl: canSeeBalances ? row.realizedPl : null,
    strategy: row.strategy,
    timeframe: row.timeframe,
    openedAt: row.openedAt ? row.openedAt.getTime() : null,
    closedAt: row.closedAt ? row.closedAt.getTime() : null,
  };
}

function groupBy(
  rows: TradingPositionRow[],
  pick: (r: TradingPositionRow) => string | null,
  canSeeBalances: boolean,
): HistoryGroup[] {
  const map = new Map<string, { count: number; wins: number; losses: number; pl: number }>();
  for (const r of rows) {
    const label = (pick(r) ?? '—').trim() || '—';
    const g = map.get(label) ?? { count: 0, wins: 0, losses: 0, pl: 0 };
    g.count += 1;
    if (r.realizedPl != null) {
      g.pl += r.realizedPl;
      if (r.realizedPl >= 0) g.wins += 1;
      else g.losses += 1;
    }
    map.set(label, g);
  }
  return [...map.entries()]
    .map(([label, g]) => ({
      label,
      count: g.count,
      wins: g.wins,
      losses: g.losses,
      realizedPl: canSeeBalances ? g.pl : null,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function getHistory(userId: string, canSeeBalances: boolean): Promise<HistoryData> {
  const rows = await db
    .select()
    .from(tradingPositions)
    .where(and(eq(tradingPositions.userId, userId), eq(tradingPositions.status, 'closed')))
    .orderBy(desc(tradingPositions.closedAt));

  let wins = 0;
  let losses = 0;
  let scored = 0;
  let totalPl = 0;
  for (const r of rows) {
    if (r.realizedPl != null) {
      totalPl += r.realizedPl;
      scored += 1;
      if (r.realizedPl >= 0) wins += 1;
      else losses += 1;
    }
  }

  return {
    trades: rows.map((r) => toRecord(r, canSeeBalances)),
    summary: {
      closed: rows.length,
      wins,
      losses,
      winRate: scored > 0 ? wins / scored : 0,
      totalRealizedPl: canSeeBalances ? totalPl : null,
      byStrategy: groupBy(rows, (r) => r.strategy, canSeeBalances),
      byInstrument: groupBy(rows, (r) => r.instrument, canSeeBalances),
    },
  };
}
