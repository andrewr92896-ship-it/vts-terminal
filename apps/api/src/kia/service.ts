import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  kiaDeals,
  kiaSettings,
  type KiaDealRow,
} from '../db/schema.js';

const COMMISSION_RATE = 0.135;
const REVIEW_REQ = 50; // percent of units needing a Google review to unlock bonus
// Non-stacking unit bonuses; you earn the highest tier reached.
const BONUS_TIERS = [
  { units: 19, amount: 2000 },
  { units: 15, amount: 1000 },
  { units: 12, amount: 500 },
] as const;

const dateLabelFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
  day: 'numeric',
});

// Current calendar context in Eastern Time.
function etNow(): { year: number; month: number; day: number; daysInMonth: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [year, month, day] = parts.split('-').map(Number); // month is 1-based
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { year, month, day, daysInMonth };
}

// Anchor a calendar day at noon UTC so it formats to the same day in ET
// (UTC midnight would render as the previous evening in Eastern Time).
function dayAtNoonUtc(year: number, month1: number, day: number): Date {
  return new Date(Date.UTC(year, month1 - 1, day, 12));
}

export interface KiaDeal {
  id: string;
  customer: string;
  model: string;
  type: 'New' | 'Used';
  profit: number;
  dateLabel: string;
  soldAt: number;
}

export interface KiaMetrics {
  units: number;
  goalUnits: number;
  toGoal: number;
  unitPct: number;
  totalProfit: number;
  commission: number;
  commissionRate: number;
  reviewCount: number;
  reviewPct: number;
  reviewReq: number;
  reviewOk: boolean;
  bonusTiers: { units: number; amount: number }[];
  bonusEarned: number;
  tierHitUnits: number | null;
  nextBonus: { units: number; amount: number; toGo: number } | null;
  daysInMonth: number;
  dayOfMonth: number;
  daysLeft: number;
  paceUnits: number;
  paceProfit: number;
  paceComm: number;
  onPace: boolean;
}

const seeding = new Map<string, Promise<void>>();

export async function ensureKiaSeed(userId: string): Promise<void> {
  const inflight = seeding.get(userId);
  if (inflight) return inflight;
  const p = seedUser(userId);
  seeding.set(userId, p);
  try {
    await p;
  } finally {
    seeding.delete(userId);
  }
}

// Initialize a user's Kia tracker the first time they open it. New users
// begin empty: a settings row with a default goal but zero deals and zero
// reviews. Existing users are untouched (seeding only runs once, when no
// settings row exists yet).
async function seedUser(userId: string): Promise<void> {
  const existing = await db
    .select({ userId: kiaSettings.userId })
    .from(kiaSettings)
    .where(eq(kiaSettings.userId, userId))
    .limit(1);
  if (existing[0]) return;

  const now = new Date();
  await db.insert(kiaSettings).values({
    userId,
    goalUnits: 12, // a sensible starting monthly goal; the user can change it
    reviewCount: 0,
    createdAt: now,
    updatedAt: now,
  });
}

function computeMetrics(
  deals: KiaDealRow[],
  goalUnits: number,
  reviewCount: number,
): KiaMetrics {
  const units = deals.length;
  const totalProfit = deals.reduce((a, d) => a + d.profit, 0);
  const commission = Math.round(totalProfit * COMMISSION_RATE);
  const reviewPct = units > 0 ? Math.round((reviewCount / units) * 100) : 0;
  const reviewOk = reviewPct >= REVIEW_REQ;

  const tierHit = BONUS_TIERS.find((t) => units >= t.units) ?? null;
  const bonusEarned = reviewOk && tierHit ? tierHit.amount : 0;
  const nextTier = [...BONUS_TIERS].reverse().find((t) => units < t.units) ?? null;

  const unitPct = goalUnits > 0 ? Math.min(100, Math.round((units / goalUnits) * 100)) : 0;
  const { daysInMonth, day } = etNow();
  const daysLeft = Math.max(0, daysInMonth - day);
  const paceUnits = day > 0 ? Math.round((units / day) * daysInMonth) : units;
  const paceProfit = day > 0 ? Math.round((totalProfit / day) * daysInMonth) : totalProfit;
  const paceComm = Math.round(paceProfit * COMMISSION_RATE);

  return {
    units,
    goalUnits,
    toGoal: Math.max(0, goalUnits - units),
    unitPct,
    totalProfit,
    commission,
    commissionRate: COMMISSION_RATE,
    reviewCount,
    reviewPct,
    reviewReq: REVIEW_REQ,
    reviewOk,
    bonusTiers: BONUS_TIERS.map((t) => ({ ...t })),
    bonusEarned,
    tierHitUnits: tierHit ? tierHit.units : null,
    nextBonus: nextTier
      ? { units: nextTier.units, amount: nextTier.amount, toGo: nextTier.units - units }
      : null,
    daysInMonth,
    dayOfMonth: day,
    daysLeft,
    paceUnits,
    paceProfit,
    paceComm,
    onPace: paceUnits >= goalUnits,
  };
}

export async function getDashboard(userId: string): Promise<{
  deals: KiaDeal[];
  metrics: KiaMetrics;
  settings: { goalUnits: number; reviewCount: number };
}> {
  await ensureKiaSeed(userId);

  const settingsRow = (
    await db.select().from(kiaSettings).where(eq(kiaSettings.userId, userId)).limit(1)
  )[0];
  const goalUnits = settingsRow?.goalUnits ?? 12;
  const reviewCount = settingsRow?.reviewCount ?? 5;

  const rows = await db.select().from(kiaDeals).where(eq(kiaDeals.userId, userId));
  // Recent first: by sale date, then by entry time.
  rows.sort((a, b) => {
    const d = b.soldAt.getTime() - a.soldAt.getTime();
    return d !== 0 ? d : b.createdAt.getTime() - a.createdAt.getTime();
  });

  const deals: KiaDeal[] = rows.map((r) => ({
    id: r.id,
    customer: r.customer,
    model: r.model,
    type: r.type,
    profit: r.profit,
    soldAt: r.soldAt.getTime(),
    dateLabel: dateLabelFmt.format(r.soldAt),
  }));

  return {
    deals,
    metrics: computeMetrics(rows, goalUnits, reviewCount),
    settings: { goalUnits, reviewCount },
  };
}

export async function addDeal(
  userId: string,
  input: { customer?: string; model: string; type: 'New' | 'Used'; profit: number; soldAt?: string },
): Promise<void> {
  await ensureKiaSeed(userId);
  let soldAt: Date;
  if (input.soldAt) {
    const [y, m, d] = input.soldAt.split('-').map(Number);
    soldAt = dayAtNoonUtc(y, m, d);
  } else {
    const n = etNow();
    soldAt = dayAtNoonUtc(n.year, n.month, n.day);
  }
  await db.insert(kiaDeals).values({
    id: crypto.randomUUID(),
    userId,
    customer: (input.customer || 'Walk-in').trim() || 'Walk-in',
    model: input.model.trim(),
    type: input.type,
    profit: Math.round(input.profit),
    soldAt,
    createdAt: new Date(),
  });
}

export async function removeDeal(userId: string, id: string): Promise<void> {
  await db.delete(kiaDeals).where(and(eq(kiaDeals.id, id), eq(kiaDeals.userId, userId)));
}

export async function updateSettings(
  userId: string,
  input: { goalUnits?: number; reviewCount?: number },
): Promise<void> {
  await ensureKiaSeed(userId);
  const patch: { goalUnits?: number; reviewCount?: number; updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (input.goalUnits != null) patch.goalUnits = Math.max(1, Math.round(input.goalUnits));
  if (input.reviewCount != null) patch.reviewCount = Math.max(0, Math.round(input.reviewCount));
  await db.update(kiaSettings).set(patch).where(eq(kiaSettings.userId, userId));
}
