import crypto from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingChallenges, tradingTrades, users, type TradingChallengeRow } from '../db/schema.js';
import { etDayStamp } from './sessions.js';
import { visibleTraderIds, type Viewer } from './scope.js';

// The prop-firm funded-account dashboard. Equity is maintained by the trader
// (a prop firm has no API) or pulled from the Trade Log; every target and
// drawdown figure is derived from it.
//
// **A funded account is owned by one trader and read by their desk.** Several
// per trader, several per team: `visibleTraderIds` decides whose are returned,
// which is self-only until an account holds the Trading Teams grant — so a
// public signup sees exactly its own by construction rather than by a filter
// somebody has to remember. Every write takes the challenge id AND the caller,
// and matches on both, so there is no path that edits a teammate's account.

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
  id: string;
  ownerId: string;
  owner: string; // the owning trader's display name, shown on somebody else's card
  isMine: boolean; // the viewer owns it, so may edit it
  label: string;
  trailing: boolean;
  startedAt: number;
  // When the trader last changed this account — a save, an equity sync, or a
  // balance read off a screenshot. A prop firm has no API, so every figure on
  // this card is only as current as this stamp: the screen states it outright
  // rather than leaving a stale equity looking live. Deliberately NOT moved by
  // the day-start roll (see rollDayStart), and never gated by canSeeBalances —
  // it is a time, not money.
  updatedAt: number;
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

// Every funded account the viewer may see, theirs first.
export interface ChallengesData {
  challenges: ChallengeData[];
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
//
// A teammate's read rolls it too, and that is correct rather than a liberty: the
// roll is derived entirely from the row's own equity, so it lands on the same
// figure whoever triggers it — and a gauge that waits for its owner to log in
// before it resets is the stale gauge this fixed.
async function rollDayStart(row: TradingChallengeRow): Promise<TradingChallengeRow> {
  const today = etDayStamp();
  if (row.dayStartOn === today) return row;
  const patch = { dayStartEquity: row.currentEquity, dayStartOn: today };
  await db.update(tradingChallenges).set(patch).where(eq(tradingChallenges.id, row.id));
  // `updatedAt` is deliberately untouched — it records when the trader last
  // changed something, and the day turning over is not that.
  return { ...row, ...patch };
}

async function ownedChallenges(userId: string): Promise<TradingChallengeRow[]> {
  return db
    .select()
    .from(tradingChallenges)
    .where(eq(tradingChallenges.userId, userId))
    .orderBy(asc(tradingChallenges.createdAt));
}

const finite = (v: number | undefined): number | undefined =>
  v != null && Number.isFinite(v) ? v : undefined;

// A fresh account row.
//
// **Its equity, peak and day-start all start AT its account size**, which is the
// one thing about this that is not cosmetic: those three are what the drawdown
// floors are measured from. Seeding the 200,000 default into a 50,000 account
// puts both floors far above the equity, so the card opens reading "Breached"
// on an account that has never traded — which is exactly what it did before the
// size was threaded through here.
function newRow(
  userId: string,
  now: Date,
  opts: { accountSize?: number; equity?: number; label?: string } = {},
): typeof tradingChallenges.$inferInsert {
  const accountSize = finite(opts.accountSize) ?? DEFAULTS.accountSize;
  const currentEquity = finite(opts.equity) ?? accountSize;
  return {
    id: crypto.randomUUID(),
    userId,
    ...DEFAULTS,
    label: opts.label ?? DEFAULTS.label,
    accountSize,
    currentEquity,
    peakEquity: currentEquity,
    dayStartEquity: currentEquity,
    dayStartOn: etDayStamp(now),
    startedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

// The caller's own account, created on first read the way it always has been —
// opening the screen has never required setting one up first. Only ever creates
// for the CALLER: reading a teammate's desk must not mint them an account they
// never asked for.
async function ensureOwnChallenge(userId: string): Promise<TradingChallengeRow[]> {
  const existing = await ownedChallenges(userId);
  if (existing.length > 0) return existing;
  await db.insert(tradingChallenges).values(newRow(userId, new Date()));
  return ownedChallenges(userId);
}

// The row a write is aimed at, refused unless the caller owns it. Both halves
// matter: an id the caller does not own reads as "not found" rather than as a
// permission error, so this cannot be used to discover another desk's ids.
async function ownedRow(userId: string, id: string): Promise<TradingChallengeRow> {
  const row = (
    await db
      .select()
      .from(tradingChallenges)
      .where(and(eq(tradingChallenges.id, id), eq(tradingChallenges.userId, userId)))
      .limit(1)
  )[0];
  if (!row) throw new Error('Funded account not found');
  return row;
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

function toData(row: TradingChallengeRow, viewerId: string, owner: string, canSee: boolean): ChallengeData {
  return {
    id: row.id,
    ownerId: row.userId,
    owner,
    isMine: row.userId === viewerId,
    label: row.label,
    trailing: row.trailing,
    startedAt: row.startedAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
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

// Display names for a set of owners, so a teammate's card can say whose account
// it is. Falls back to the username, which every row has.
async function ownerNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, username: users.username, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(rows.map((r) => [r.id, r.displayName || r.username]));
}

// Every funded account the viewer may see: their own (created on first read),
// then their teammates' — which resolves to nothing at all unless the viewer
// holds the Trading Teams grant.
export async function listChallenges(viewer: Viewer, canSeeBalances: boolean): Promise<ChallengesData> {
  await ensureOwnChallenge(viewer.id);
  const scope = await visibleTraderIds(viewer);
  const rows = await db
    .select()
    .from(tradingChallenges)
    .where(inArray(tradingChallenges.userId, [...scope]))
    .orderBy(asc(tradingChallenges.createdAt));
  const rolled = await Promise.all(rows.map((r) => rollDayStart(r)));
  const names = await ownerNames([...new Set(rolled.map((r) => r.userId))]);
  return {
    challenges: rolled
      .map((r) => toData(r, viewer.id, names.get(r.userId) ?? 'Trader', canSeeBalances))
      // The viewer's own first: it is the one they act on, and a desk of six
      // would otherwise bury it in creation order.
      .sort((a, b) => Number(b.isMine) - Number(a.isMine)),
  };
}

// The caller's own primary account — what a surface needing ONE challenge reads
// (the AI coaching brief). Never a teammate's.
export async function getOwnChallenge(userId: string, canSeeBalances: boolean): Promise<ChallengeData> {
  const rows = await ensureOwnChallenge(userId);
  const row = await rollDayStart(rows[0]);
  const names = await ownerNames([userId]);
  return toData(row, userId, names.get(userId) ?? 'Trader', canSeeBalances);
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

// How many funded accounts one trader may keep. Not a licence question — a
// runaway-input guard, the same shape as MAX_TEAM_CHANNELS.
const MAX_PER_TRADER = 12;

export async function addChallenge(
  viewer: Viewer,
  input: ChallengeInput,
  canSeeBalances: boolean,
): Promise<ChallengesData> {
  const own = await ownedChallenges(viewer.id);
  if (own.length >= MAX_PER_TRADER) {
    throw new Error(`You can keep up to ${MAX_PER_TRADER} funded accounts`);
  }
  const now = new Date();
  const row = newRow(viewer.id, now, {
    accountSize: input.accountSize,
    equity: input.currentEquity,
    // A second account named the same as the first is two identical cards. The
    // very first one keeps the historical default name.
    label: input.label ?? (own.length > 0 ? `Funded account ${own.length + 1}` : undefined),
  });
  await db.insert(tradingChallenges).values(row);
  // Everything else the trader typed goes through the ordinary update path, so
  // the label trimming, the basis-point conversion and the peak ratchet are
  // written once rather than once here and once there.
  if (Object.keys(input).length > 0) await updateChallenge(viewer.id, row.id, input, canSeeBalances);
  return listChallenges(viewer, canSeeBalances);
}

export async function updateChallenge(
  userId: string,
  id: string,
  input: ChallengeInput,
  canSeeBalances: boolean,
): Promise<ChallengeData> {
  const row = await ownedRow(userId, id);
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

  await db.update(tradingChallenges).set(patch).where(eq(tradingChallenges.id, id));
  const updated = await ownedRow(userId, id);
  const names = await ownerNames([userId]);
  return toData(updated, userId, names.get(userId) ?? 'Trader', canSeeBalances);
}

export async function removeChallenge(
  viewer: Viewer,
  id: string,
  canSeeBalances: boolean,
): Promise<ChallengesData> {
  await ownedRow(viewer.id, id); // refuses anything the caller does not own
  await db.delete(tradingChallenges).where(eq(tradingChallenges.id, id));
  return listChallenges(viewer, canSeeBalances);
}

// Set equity to account size + realized P/L of closed Trade Log trades since the
// challenge start. A convenience — the trader can always type the exact figure.
export async function syncEquityFromTradeLog(
  userId: string,
  id: string,
  canSeeBalances: boolean,
): Promise<ChallengeData> {
  const row = await ownedRow(userId, id);
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
  return updateChallenge(userId, id, { currentEquity: row.accountSize + realized }, canSeeBalances);
}
