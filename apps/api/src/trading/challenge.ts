import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingChallenges, tradingTrades, type TradingChallengeRow } from '../db/schema.js';
import { etDayStamp } from './sessions.js';

// The FTP-style funded-account challenge dashboard. One row per user. Equity is
// maintained by the trader (FTP has no API) or pulled from the Trade Log; all
// the target/drawdown numbers are derived from it.

export interface ChallengeMetrics {
  profit: number | null;
  profitPct: number; // profit / accountSize
  targetAmount: number | null;
  targetEquity: number | null;
  toTarget: number | null;
  progressPct: number; // profit / targetAmount (can exceed 1 or go negative)
  maxDdAmount: number | null;
  maxFloor: number | null; // equity floor before a max-drawdown breach
  maxHeadroom: number | null;
  maxHeadroomPct: number; // headroom / maxDdAmount (1 = full buffer, 0 = at floor)
  dailyDdAmount: number | null;
  dailyFloor: number | null;
  dailyHeadroom: number | null;
  dailyHeadroomPct: number;
  status: 'active' | 'passed' | 'breached';
  breaches: { target: boolean; daily: boolean; max: boolean };
}

export interface ChallengeData {
  label: string;
  trailing: boolean;
  startedAt: number;
  targetPct: number;
  dailyDdPct: number;
  maxDdPct: number;
  canSeeBalances: boolean;
  // Dollar values — null when the user lacks the viewBrokerage grant.
  accountSize: number | null;
  equity: number | null;
  peakEquity: number | null;
  dayStartEquity: number | null;
  metrics: ChallengeMetrics;
}

const DEFAULTS = {
  label: 'FTP Challenge',
  accountSize: 200000,
  targetBp: 1000,
  dailyDdBp: 400,
  maxDdBp: 600,
  trailing: true,
  currentEquity: 200000,
  peakEquity: 200000,
  dayStartEquity: 200000,
};

const bpToPct = (bp: number) => bp / 100;

// The daily drawdown is the one gauge here that is supposed to forget yesterday,
// and it did not: `dayStartEquity` was written once and then only ever changed by
// hand, so the "Daily Drawdown" gauge quietly measured the whole challenge. An
// account down for the month but flat on the day read as most of its daily
// allowance spent — a breach warning on a day nothing had been lost.
//
// So the day-start rolls forward on read: the first read of a new ET day sets it
// to the equity the account is carrying at that moment and stamps the day. That
// figure is the last equity the trader recorded, which is precisely what "what
// this account started today on" means for a book with no API behind it — the
// terminal never invents a number it was not given.
//
// The ET calendar day is the boundary, matching how every other trading-day
// bucket in the terminal is cut (see codes.ts, pnl.ts). A weekend roll is a
// no-op assignment: nothing traded, so the equity has not moved.
async function rollDayStart(row: TradingChallengeRow): Promise<TradingChallengeRow> {
  const today = etDayStamp();
  if (row.dayStartOn === today) return row;
  const patch = { dayStartEquity: row.currentEquity, dayStartOn: today };
  await db.update(tradingChallenges).set(patch).where(eq(tradingChallenges.userId, row.userId));
  // `updatedAt` is deliberately untouched — it records when the trader last
  // changed something, and the day turning over is not that.
  return { ...row, ...patch };
}

async function ensureChallenge(userId: string): Promise<TradingChallengeRow> {
  const existing = (
    await db.select().from(tradingChallenges).where(eq(tradingChallenges.userId, userId)).limit(1)
  )[0];
  if (existing) return rollDayStart(existing);
  const now = new Date();
  await db
    .insert(tradingChallenges)
    .values({
      userId,
      ...DEFAULTS,
      dayStartOn: etDayStamp(now),
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
  return (
    await db.select().from(tradingChallenges).where(eq(tradingChallenges.userId, userId)).limit(1)
  )[0];
}

function gate(v: number, canSee: boolean): number | null {
  return canSee ? v : null;
}

function computeMetrics(row: TradingChallengeRow, canSee: boolean): ChallengeMetrics {
  const size = row.accountSize;
  const equity = row.currentEquity;
  const profit = equity - size;
  const targetAmount = (size * bpToPct(row.targetBp)) / 100;
  const targetEquity = size + targetAmount;
  const maxDdAmount = (size * bpToPct(row.maxDdBp)) / 100;
  const dailyDdAmount = (size * bpToPct(row.dailyDdBp)) / 100;
  const maxFloor = (row.trailing ? row.peakEquity : size) - maxDdAmount;
  const dailyFloor = row.dayStartEquity - dailyDdAmount;
  const maxHeadroom = equity - maxFloor;
  const dailyHeadroom = equity - dailyFloor;

  const breaches = {
    target: equity >= targetEquity,
    daily: equity <= dailyFloor,
    max: equity <= maxFloor,
  };
  const status: ChallengeMetrics['status'] =
    breaches.max || breaches.daily ? 'breached' : breaches.target ? 'passed' : 'active';

  return {
    profit: gate(profit, canSee),
    profitPct: size > 0 ? profit / size : 0,
    targetAmount: gate(targetAmount, canSee),
    targetEquity: gate(targetEquity, canSee),
    toTarget: gate(targetEquity - equity, canSee),
    progressPct: targetAmount > 0 ? profit / targetAmount : 0,
    maxDdAmount: gate(maxDdAmount, canSee),
    maxFloor: gate(maxFloor, canSee),
    maxHeadroom: gate(maxHeadroom, canSee),
    maxHeadroomPct: maxDdAmount > 0 ? maxHeadroom / maxDdAmount : 0,
    dailyDdAmount: gate(dailyDdAmount, canSee),
    dailyFloor: gate(dailyFloor, canSee),
    dailyHeadroom: gate(dailyHeadroom, canSee),
    dailyHeadroomPct: dailyDdAmount > 0 ? dailyHeadroom / dailyDdAmount : 0,
    status,
    breaches,
  };
}

function toData(row: TradingChallengeRow, canSee: boolean): ChallengeData {
  return {
    label: row.label,
    trailing: row.trailing,
    startedAt: row.startedAt.getTime(),
    targetPct: bpToPct(row.targetBp),
    dailyDdPct: bpToPct(row.dailyDdBp),
    maxDdPct: bpToPct(row.maxDdBp),
    canSeeBalances: canSee,
    accountSize: gate(row.accountSize, canSee),
    equity: gate(row.currentEquity, canSee),
    peakEquity: gate(row.peakEquity, canSee),
    dayStartEquity: gate(row.dayStartEquity, canSee),
    metrics: computeMetrics(row, canSee),
  };
}

export async function getChallenge(userId: string, canSeeBalances: boolean): Promise<ChallengeData> {
  const row = await ensureChallenge(userId);
  return toData(row, canSeeBalances);
}

export interface ChallengeInput {
  label?: string;
  accountSize?: number;
  targetPct?: number;
  dailyDdPct?: number;
  maxDdPct?: number;
  trailing?: boolean;
  currentEquity?: number;
  peakEquity?: number;
  dayStartEquity?: number;
  startedAt?: number;
}

const pctToBp = (pct: number) => Math.max(0, Math.round(pct * 100));
const money = (v: number) => (Number.isFinite(v) ? v : 0);

export async function updateChallenge(
  userId: string,
  input: ChallengeInput,
  canSeeBalances: boolean,
): Promise<ChallengeData> {
  const row = await ensureChallenge(userId);
  const patch: Partial<typeof tradingChallenges.$inferInsert> = { updatedAt: new Date() };

  if (input.label != null) patch.label = input.label.trim().slice(0, 80) || 'FTP Challenge';
  if (input.accountSize != null) patch.accountSize = money(input.accountSize);
  if (input.targetPct != null) patch.targetBp = pctToBp(input.targetPct);
  if (input.dailyDdPct != null) patch.dailyDdBp = pctToBp(input.dailyDdPct);
  if (input.maxDdPct != null) patch.maxDdBp = pctToBp(input.maxDdPct);
  if (input.trailing != null) patch.trailing = input.trailing;
  if (input.currentEquity != null) patch.currentEquity = money(input.currentEquity);
  if (input.peakEquity != null) patch.peakEquity = money(input.peakEquity);
  // A hand-typed day-start belongs to the day it was typed on, so it is stamped
  // with it — otherwise the next read would read it as yesterday's and roll the
  // trader's own correction straight back off.
  if (input.dayStartEquity != null) {
    patch.dayStartEquity = money(input.dayStartEquity);
    patch.dayStartOn = etDayStamp();
  }
  if (input.startedAt != null) patch.startedAt = new Date(input.startedAt);

  // Trailing drawdown: the peak only ever ratchets up. Auto-bump it whenever
  // equity rises above the stored peak (unless the user set it explicitly).
  const nextEquity = patch.currentEquity ?? row.currentEquity;
  const basePeak = patch.peakEquity ?? row.peakEquity;
  if (nextEquity > basePeak) patch.peakEquity = nextEquity;

  await db.update(tradingChallenges).set(patch).where(eq(tradingChallenges.userId, userId));
  const updated = (
    await db.select().from(tradingChallenges).where(eq(tradingChallenges.userId, userId)).limit(1)
  )[0];
  return toData(updated, canSeeBalances);
}

// Set equity to account size + realized P/L of closed Trade Log trades since the
// challenge start. A convenience — the trader can always type the exact figure.
export async function syncEquityFromTradeLog(
  userId: string,
  canSeeBalances: boolean,
): Promise<ChallengeData> {
  const row = await ensureChallenge(userId);
  const closed = await db
    .select()
    .from(tradingTrades)
    .where(and(eq(tradingTrades.userId, userId), eq(tradingTrades.status, 'closed')));
  const startMs = row.startedAt.getTime();
  let realized = 0;
  for (const t of closed) {
    const when = (t.closedAt ?? t.openedAt).getTime();
    if (when >= startMs && t.realizedPl != null) realized += t.realizedPl;
  }
  return updateChallenge(userId, { currentEquity: row.accountSize + realized }, canSeeBalances);
}
