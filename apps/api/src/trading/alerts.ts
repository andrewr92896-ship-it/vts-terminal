import crypto from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  tradingAlerts,
  tradingTrades,
  users,
  TRADE_SIDES,
  TRADE_RESULTS,
  type AlertStatus,
  type TradeSide,
  type TradeResult,
  type TradingAlertRow,
} from '../db/schema.js';
import { parseRoles } from '../auth/rbac.js';
import { addTrade } from './trades.js';
import { autoMatch, linkedTradeSummary, type LinkedTradeSummary } from './strategies.js';
import { aiConfigured, analyzeTradeScreenshot, type AnalyzeResult } from '../ai/claude.js';

// TradingView alerts are the FTP/prop-trade replacement. The webhook is
// unauthenticated, so each alert is attributed to the owner (the earliest
// admin). The owner then pastes a screenshot and Claude analyzes it.

export interface AlertRecord {
  id: string;
  source: string;
  instrument: string | null;
  side: TradeSide | null;
  price: number | null;
  exitPrice: number | null;
  result: TradeResult | null;
  pnl: number | null;
  strategy: string | null;
  timeframe: string | null;
  message: string | null;
  status: AlertStatus;
  analysis: AnalyzeResult | null;
  analyzedAt: number | null;
  tradeId: string | null;
  linkedTrade: LinkedTradeSummary | null; // the real trade this alert is tied to
  receivedAt: number;
}

// Per-strategy rollup that accumulates as alerts arrive — the paper-trading
// scoreboard on the Alerts page. "decided" = win + loss (breakeven excluded
// from the win rate denominator); "open" = alerts with no result yet.
export interface StrategyStat {
  strategy: string;
  trades: number; // alerts with a recorded result
  wins: number;
  losses: number;
  breakeven: number;
  open: number;
  winRate: number | null; // 0–100 over decided trades, null when none decided
  totalPnl: number | null; // sum of recorded P&L, null when no P&L data
  avgPnl: number | null; // mean P&L over trades that carry a P&L value
  profitFactor: number | null; // gross win ÷ gross loss, null when undefined
}

export interface AlertsData {
  alerts: AlertRecord[];
  strategies: StrategyStat[];
  aiConfigured: boolean;
}

function asSide(v: unknown): TradeSide | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if ((TRADE_SIDES as readonly string[]).includes(s)) return s as TradeSide;
  if (['buy', 'long', 'b'].includes(s)) return 'long';
  if (['sell', 'short', 's'].includes(s)) return 'short';
  return null;
}

function asNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown, max: number): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

// Map a free-text outcome (from the alert body or a manual entry) to a result.
// Accepts the canonical words plus common trade-exit synonyms.
function asResult(v: unknown): TradeResult | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if ((TRADE_RESULTS as readonly string[]).includes(s)) return s as TradeResult;
  if (['win', 'won', 'w', 'tp', 'target', 'profit', 'green'].includes(s)) return 'win';
  if (['loss', 'lost', 'lose', 'l', 'sl', 'stop', 'stopped', 'red'].includes(s)) return 'loss';
  if (['breakeven', 'break-even', 'be', 'flat', 'scratch'].includes(s)) return 'breakeven';
  return null;
}

// Resolve a trade's result + P&L from whatever was supplied. An explicit result
// or P&L wins; otherwise both are derived from entry vs. exit given the side
// (a missing side is treated as long). P&L is in price points unless an
// explicit value was provided.
export function deriveOutcome(input: {
  side: TradeSide | null;
  entry: number | null;
  exit: number | null;
  result?: TradeResult | null;
  pnl?: number | null;
}): { result: TradeResult | null; pnl: number | null } {
  let pnl = input.pnl ?? null;
  if (pnl == null && input.entry != null && input.exit != null) {
    const diff = input.exit - input.entry;
    pnl = input.side === 'short' ? -diff : diff;
    pnl = Math.round(pnl * 1e6) / 1e6; // trim float noise
  }
  let result = input.result ?? null;
  if (result == null && pnl != null) {
    result = pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'breakeven';
  }
  return { result, pnl };
}

// The owner who receives webhook alerts: the earliest-created admin.
export async function resolveOwnerId(): Promise<string | null> {
  const rows = await db.select().from(users);
  const admins = rows
    .filter((u) => u.active && parseRoles(u).includes('admin'))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return admins[0]?.id ?? null;
}

// Store an inbound TradingView alert. `body` is whatever the webhook received
// (an object from JSON, or { message } for a plain-text alert). Returns the new
// alert id, or null if there is no owner to attribute it to.
export async function ingestAlert(body: Record<string, unknown>, rawPayload: string): Promise<string | null> {
  const ownerId = await resolveOwnerId();
  if (!ownerId) return null;

  const now = new Date();
  const id = crypto.randomUUID();
  const side = asSide(body.side ?? body.action ?? body.order);
  const entry = asNum(body.price ?? body.close ?? body.entry);
  const exit = asNum(body.exitPrice ?? body.exit ?? body.close_price);
  const { result, pnl } = deriveOutcome({
    side,
    entry,
    exit,
    result: asResult(body.result ?? body.outcome),
    pnl: asNum(body.pnl ?? body.profit ?? body.pl),
  });
  await db.insert(tradingAlerts).values({
    id,
    userId: ownerId,
    source: 'tradingview',
    instrument: str(body.instrument ?? body.ticker ?? body.symbol, 40),
    side,
    price: entry,
    exitPrice: exit,
    result,
    pnl,
    strategy: str(body.strategy ?? body.setup, 80),
    timeframe: str(body.timeframe ?? body.interval ?? body.tf, 16),
    message: str(body.message ?? body.comment ?? body.text, 2000),
    payload: rawPayload.slice(0, 8000),
    status: 'new',
    analysis: null,
    analyzedAt: null,
    tradeId: null,
    receivedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  // Tie this alert to a real trade already logged near its time, if any.
  await autoMatch(ownerId);
  return id;
}

// Manually add a (typically historical) trade as an alert row. Used to backfill
// past data so the strategy metrics cover trades that never came through the
// webhook. Attributed to the owner, same as inbound alerts.
export interface ManualAlertInput {
  strategy?: string | null;
  instrument?: string | null;
  side?: string | null;
  entry?: number | null;
  exit?: number | null;
  result?: string | null;
  pnl?: number | null;
  timeframe?: string | null;
  message?: string | null;
  occurredAt?: number | null; // ms; when the trade happened (defaults to now)
}

export async function createManualAlert(
  ownerId: string,
  input: ManualAlertInput,
): Promise<string> {
  const now = new Date();
  const id = crypto.randomUUID();
  const side = asSide(input.side);
  const entry = asNum(input.entry);
  const exit = asNum(input.exit);
  const { result, pnl } = deriveOutcome({
    side,
    entry,
    exit,
    result: asResult(input.result),
    pnl: asNum(input.pnl),
  });
  const when =
    typeof input.occurredAt === 'number' && Number.isFinite(input.occurredAt)
      ? new Date(input.occurredAt)
      : now;
  await db.insert(tradingAlerts).values({
    id,
    userId: ownerId,
    source: 'manual',
    instrument: str(input.instrument, 40),
    side,
    price: entry,
    exitPrice: exit,
    result,
    pnl,
    strategy: str(input.strategy, 80),
    timeframe: str(input.timeframe, 16),
    message: str(input.message, 2000),
    payload: JSON.stringify({ manual: true }),
    status: 'new',
    analysis: null,
    analyzedAt: null,
    tradeId: null,
    receivedAt: when,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

// Tag (or clear) an alert's outcome by hand. Passing result=null clears it back
// to "open". When an exit price is supplied the P&L is recomputed from it.
export async function setAlertResult(
  ownerId: string,
  alertId: string,
  input: { result: TradeResult | null; exitPrice?: number | null; pnl?: number | null },
  canSeeBalances = false,
): Promise<AlertsData> {
  const row = (
    await db
      .select()
      .from(tradingAlerts)
      .where(and(eq(tradingAlerts.id, alertId), eq(tradingAlerts.userId, ownerId)))
      .limit(1)
  )[0];
  if (!row) throw new Error('Alert not found');

  if (input.result == null) {
    await db
      .update(tradingAlerts)
      .set({ result: null, exitPrice: null, pnl: null, updatedAt: new Date() })
      .where(and(eq(tradingAlerts.id, alertId), eq(tradingAlerts.userId, ownerId)));
    return getAlerts(ownerId, canSeeBalances);
  }

  const exit = input.exitPrice != null ? input.exitPrice : row.exitPrice;
  const { result, pnl } = deriveOutcome({
    side: row.side,
    entry: row.price,
    exit,
    result: input.result,
    pnl: input.pnl ?? row.pnl,
  });
  await db
    .update(tradingAlerts)
    .set({ result, exitPrice: exit, pnl, updatedAt: new Date() })
    .where(and(eq(tradingAlerts.id, alertId), eq(tradingAlerts.userId, ownerId)));
  return getAlerts(ownerId, canSeeBalances);
}

function toRecord(row: TradingAlertRow): AlertRecord {
  let analysis: AnalyzeResult | null = null;
  if (row.analysis) {
    try {
      analysis = JSON.parse(row.analysis) as AnalyzeResult;
    } catch {
      analysis = null;
    }
  }
  return {
    id: row.id,
    source: row.source,
    instrument: row.instrument,
    side: (row.side as TradeSide | null) ?? null,
    price: row.price,
    exitPrice: row.exitPrice,
    result: (row.result as TradeResult | null) ?? null,
    pnl: row.pnl,
    strategy: row.strategy,
    timeframe: row.timeframe,
    message: row.message,
    status: row.status as AlertStatus,
    analysis,
    analyzedAt: row.analyzedAt ? row.analyzedAt.getTime() : null,
    tradeId: row.tradeId,
    linkedTrade: null, // filled in by getAlerts, which has the trade map
    receivedAt: row.receivedAt.getTime(),
  };
}

// Roll active alerts up into per-strategy metrics. Dismissed alerts are
// excluded — they aren't real trades. Strategies are sorted by trade count.
export function computeStrategyStats(alerts: AlertRecord[]): StrategyStat[] {
  const byStrategy = new Map<string, AlertRecord[]>();
  for (const a of alerts) {
    if (a.status === 'dismissed') continue;
    const key = a.strategy?.trim() || 'Unlabeled';
    const list = byStrategy.get(key) ?? [];
    list.push(a);
    byStrategy.set(key, list);
  }

  const stats: StrategyStat[] = [];
  for (const [strategy, list] of byStrategy) {
    let wins = 0;
    let losses = 0;
    let breakeven = 0;
    let open = 0;
    let pnlSum = 0;
    let pnlCount = 0;
    let grossWin = 0;
    let grossLoss = 0; // accumulated as a positive magnitude
    for (const a of list) {
      if (a.result === 'win') wins++;
      else if (a.result === 'loss') losses++;
      else if (a.result === 'breakeven') breakeven++;
      else open++;
      if (a.pnl != null) {
        pnlSum += a.pnl;
        pnlCount++;
        if (a.pnl > 0) grossWin += a.pnl;
        else if (a.pnl < 0) grossLoss += -a.pnl;
      }
    }
    const trades = wins + losses + breakeven;
    const decided = wins + losses;
    stats.push({
      strategy,
      trades,
      wins,
      losses,
      breakeven,
      open,
      winRate: decided > 0 ? Math.round((wins / decided) * 1000) / 10 : null,
      totalPnl: pnlCount > 0 ? Math.round(pnlSum * 1e6) / 1e6 : null,
      avgPnl: pnlCount > 0 ? Math.round((pnlSum / pnlCount) * 1e6) / 1e6 : null,
      profitFactor: grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : null,
    });
  }

  return stats.sort((a, b) => b.trades - a.trades || a.strategy.localeCompare(b.strategy));
}

export async function getAlerts(ownerId: string, canSeeBalances = false): Promise<AlertsData> {
  const rows = await db
    .select()
    .from(tradingAlerts)
    .where(eq(tradingAlerts.userId, ownerId))
    .orderBy(desc(tradingAlerts.receivedAt));
  const tradeRows = await db.select().from(tradingTrades).where(eq(tradingTrades.userId, ownerId));
  const tradeMap = new Map(tradeRows.map((t) => [t.id, t]));
  const alerts = rows.map((r) => {
    const rec = toRecord(r);
    rec.linkedTrade = linkedTradeSummary(r, tradeMap, canSeeBalances);
    return rec;
  });
  return { alerts, strategies: computeStrategyStats(alerts), aiConfigured: aiConfigured() };
}

// A tiny desk-wide signal the trading clients poll so they can chime when a new
// TradingView alert arrives. Every inbound alert is attributed to the single
// owner, so the latest receivedAt across the whole table is the desk-wide
// latest. That is why a trading_viewer (who owns no alerts of their own) still
// gets a real signal and hears the sound.
export interface AlertSignal {
  lastAlertAt: number | null;
  alertCount: number;
}

export async function getAlertSignal(): Promise<AlertSignal> {
  const rows = await db
    .select({ receivedAt: tradingAlerts.receivedAt })
    .from(tradingAlerts)
    .orderBy(desc(tradingAlerts.receivedAt));
  return {
    lastAlertAt: rows[0]?.receivedAt ? rows[0].receivedAt.getTime() : null,
    alertCount: rows.length,
  };
}

type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

// Analyze an alert's screenshot with Opus 4.8, store the result, and auto-create
// a Trade Log entry from the alert + analysis.
export async function analyzeAlert(
  ownerId: string,
  alertId: string,
  imageBase64: string,
  mediaType: ImageMediaType,
  canSeeBalances = false,
): Promise<AlertsData> {
  const row = (
    await db
      .select()
      .from(tradingAlerts)
      .where(and(eq(tradingAlerts.id, alertId), eq(tradingAlerts.userId, ownerId)))
      .limit(1)
  )[0];
  if (!row) throw new Error('Alert not found');

  const result = await analyzeTradeScreenshot(imageBase64, mediaType, {
    instrument: row.instrument,
    side: row.side,
    price: row.price,
    strategy: row.strategy,
    timeframe: row.timeframe,
    message: row.message,
  });

  // Build a Trade Log entry: planned entry from the alert, fill/exit from the
  // analysis where Claude could read them.
  const p = result.parsed;
  const side: TradeSide = p && p.side !== 'unknown' ? p.side : (row.side as TradeSide | null) ?? 'long';
  const plannedEntry = row.price ?? p?.plannedEntry ?? null;
  const entryPrice = p?.actualFill ?? row.price ?? 0;
  const exitPrice = p?.exit ?? null;
  const tradeId = await addTrade(ownerId, {
    broker: 'ftp',
    instrument: row.instrument ?? p?.instrument ?? 'Unknown',
    side,
    status: exitPrice != null ? 'closed' : 'open',
    plannedEntry,
    entryPrice,
    exitPrice,
    strategy: row.strategy,
    timeframe: row.timeframe,
    notes: p?.summary ?? result.raw.slice(0, 1000),
    openedAt: row.receivedAt.getTime(),
  });

  await db
    .update(tradingAlerts)
    .set({
      status: 'analyzed',
      analysis: JSON.stringify(result),
      analyzedAt: new Date(),
      tradeId,
      updatedAt: new Date(),
    })
    .where(and(eq(tradingAlerts.id, alertId), eq(tradingAlerts.userId, ownerId)));

  return getAlerts(ownerId, canSeeBalances);
}

export async function dismissAlert(
  ownerId: string,
  alertId: string,
  canSeeBalances = false,
): Promise<AlertsData> {
  await db
    .update(tradingAlerts)
    .set({ status: 'dismissed', updatedAt: new Date() })
    .where(and(eq(tradingAlerts.id, alertId), eq(tradingAlerts.userId, ownerId)));
  return getAlerts(ownerId, canSeeBalances);
}
