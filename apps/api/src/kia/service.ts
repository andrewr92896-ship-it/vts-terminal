import crypto from 'node:crypto';
import { and, desc, eq, lt } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  kiaDeals,
  kiaSettings,
  kiaMonthSettings,
  type KiaDealRow,
} from '../db/schema.js';

export interface BonusTier {
  units: number;
  amount: number;
}

// The editable, per-user compensation plan.
export interface PayPlan {
  // 'total' uses one rate on each deal's total profit; 'split' uses separate
  // front-end and back-end rates.
  commissionMode: 'total' | 'split';
  commissionRate: number; // total mode: fraction of total profit, e.g. 0.135
  frontRate: number; // split mode: fraction of front-end profit
  backRate: number; // split mode: fraction of back-end profit
  reviewRequired: boolean; // whether the bonus needs a minimum review %
  reviewReqPct: number; // that minimum, when required
  bonusTiers: BonusTier[]; // non-stacking; highest tier reached is earned
}

const DEFAULT_BONUS_TIERS: BonusTier[] = [
  { units: 12, amount: 500 },
  { units: 15, amount: 1000 },
  { units: 19, amount: 2000 },
];

export const DEFAULT_PAY_PLAN: PayPlan = {
  commissionMode: 'total',
  commissionRate: 0.135,
  frontRate: 0,
  backRate: 0,
  reviewRequired: true,
  reviewReqPct: 50,
  bonusTiers: DEFAULT_BONUS_TIERS,
};

// Commission for one deal under the given plan. In split mode a deal without a
// recorded front/back breakdown is treated as all front-end.
function dealCommission(deal: Pick<KiaDealRow, 'profit' | 'frontProfit' | 'backProfit'>, plan: PayPlan): number {
  if (plan.commissionMode === 'split') {
    const front = deal.frontProfit ?? deal.profit;
    const back = deal.backProfit ?? 0;
    return front * plan.frontRate + back * plan.backRate;
  }
  return deal.profit * plan.commissionRate;
}

function commissionForDeals(deals: KiaDealRow[], plan: PayPlan): number {
  return Math.round(deals.reduce((sum, d) => sum + dealCommission(d, plan), 0));
}

type KiaSettingsRow = typeof kiaSettings.$inferSelect;

// Build a clean PayPlan from a settings row (or defaults). Tiers are sorted
// descending by units so the "highest tier reached" lookup is a simple find.
function parsePayPlan(row: KiaSettingsRow | undefined): PayPlan {
  if (!row) return DEFAULT_PAY_PLAN;
  let tiers = DEFAULT_BONUS_TIERS;
  if (row.bonusTiers) {
    try {
      const parsed = JSON.parse(row.bonusTiers);
      if (Array.isArray(parsed)) {
        const clean = parsed
          .filter(
            (t) =>
              t && Number.isFinite(t.units) && Number.isFinite(t.amount) && t.units > 0 && t.amount >= 0,
          )
          .map((t) => ({ units: Math.round(t.units), amount: Math.round(t.amount) }));
        if (clean.length) tiers = clean;
      }
    } catch {
      /* fall back to defaults */
    }
  }
  return {
    commissionMode: row.commissionMode === 'split' ? 'split' : 'total',
    commissionRate: (row.commissionBp ?? 1350) / 10000,
    frontRate: (row.commissionFrontBp ?? 0) / 10000,
    backRate: (row.commissionBackBp ?? 0) / 10000,
    reviewRequired: row.reviewRequired ?? true,
    reviewReqPct: row.reviewReqPct ?? 50,
    bonusTiers: [...tiers].sort((a, b) => b.units - a.units),
  };
}

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

// Months are keyed 'YYYY-MM' in Eastern Time, so each deal lands in the month
// a salesperson would file it under regardless of the server's time zone.
function etYearMonth(date: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === 'year')!.value);
  const month = Number(parts.find((p) => p.type === 'month')!.value);
  return { year, month };
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function etMonthKey(date: Date): string {
  const { year, month } = etYearMonth(date);
  return monthKey(year, month);
}

function currentMonthKey(): string {
  const n = etNow();
  return monthKey(n.year, n.month);
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, 1, 12)));
}

interface MonthContext {
  daysInMonth: number;
  dayOfMonth: number;
  isCurrent: boolean;
}

// Pace math needs to know how far through the month we are. The current month
// uses today's date; completed (past) months are treated as fully elapsed so
// their pace equals the actual result rather than a projection.
function monthContext(key: string): MonthContext {
  const [y, m] = key.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const now = etNow();
  const isCurrent = y === now.year && m === now.month;
  return { daysInMonth, dayOfMonth: isCurrent ? now.day : daysInMonth, isCurrent };
}

function resolveMonth(requested?: string): string {
  return requested && /^\d{4}-\d{2}$/.test(requested) ? requested : currentMonthKey();
}

// Effective goal + review count for a month. Uses the month's own row if set,
// otherwise carries the goal forward from the most recent prior month (then
// the legacy global setting, then 12). Reviews are per-month, so they only
// inherit from the legacy global row for the current month of pre-existing
// accounts; other months start at zero until edited.
async function monthSettings(
  userId: string,
  month: string,
): Promise<{ goalUnits: number; reviewCount: number }> {
  const row = (
    await db
      .select()
      .from(kiaMonthSettings)
      .where(and(eq(kiaMonthSettings.userId, userId), eq(kiaMonthSettings.month, month)))
      .limit(1)
  )[0];
  if (row) return { goalUnits: row.goalUnits, reviewCount: row.reviewCount };

  const prior = (
    await db
      .select()
      .from(kiaMonthSettings)
      .where(and(eq(kiaMonthSettings.userId, userId), lt(kiaMonthSettings.month, month)))
      .orderBy(desc(kiaMonthSettings.month))
      .limit(1)
  )[0];
  const legacy = (
    await db.select().from(kiaSettings).where(eq(kiaSettings.userId, userId)).limit(1)
  )[0];

  const goalUnits = prior?.goalUnits ?? legacy?.goalUnits ?? 12;
  const reviewCount = month === currentMonthKey() ? legacy?.reviewCount ?? 0 : 0;
  return { goalUnits, reviewCount };
}

export interface KiaDeal {
  id: string;
  customer: string;
  model: string;
  type: 'New' | 'Used';
  profit: number;
  frontProfit: number | null;
  backProfit: number | null;
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
  reviewRequired: boolean;
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
  ctx: MonthContext,
  plan: PayPlan,
): KiaMetrics {
  const units = deals.length;
  const totalProfit = deals.reduce((a, d) => a + d.profit, 0);
  const commission = commissionForDeals(deals, plan);
  // Blended rate (commission ÷ total profit) used for the headline % and pace.
  const effectiveRate =
    totalProfit > 0
      ? commission / totalProfit
      : plan.commissionMode === 'split'
        ? plan.frontRate
        : plan.commissionRate;
  const reviewPct = units > 0 ? Math.round((reviewCount / units) * 100) : 0;
  // When the plan doesn't require reviews, the bonus is never gated by them.
  const reviewOk = !plan.reviewRequired || reviewPct >= plan.reviewReqPct;

  const tiersDesc = plan.bonusTiers; // already sorted descending by units
  const tierHit = tiersDesc.find((t) => units >= t.units) ?? null;
  const bonusEarned = reviewOk && tierHit ? tierHit.amount : 0;
  const nextTier = [...tiersDesc].reverse().find((t) => units < t.units) ?? null;

  const unitPct = goalUnits > 0 ? Math.min(100, Math.round((units / goalUnits) * 100)) : 0;
  const { daysInMonth, dayOfMonth, isCurrent } = ctx;
  const daysLeft = isCurrent ? Math.max(0, daysInMonth - dayOfMonth) : 0;
  // Past months are complete, so their pace is just the actual result.
  const elapsed = dayOfMonth > 0 ? dayOfMonth : 1;
  const paceUnits = isCurrent ? Math.round((units / elapsed) * daysInMonth) : units;
  const paceProfit = isCurrent ? Math.round((totalProfit / elapsed) * daysInMonth) : totalProfit;
  const paceComm = Math.round(paceProfit * effectiveRate);

  return {
    units,
    goalUnits,
    toGoal: Math.max(0, goalUnits - units),
    unitPct,
    totalProfit,
    commission,
    commissionRate: effectiveRate,
    reviewCount,
    reviewPct,
    reviewReq: plan.reviewReqPct,
    reviewRequired: plan.reviewRequired,
    reviewOk,
    bonusTiers: tiersDesc.map((t) => ({ ...t })),
    bonusEarned,
    tierHitUnits: tierHit ? tierHit.units : null,
    nextBonus: nextTier
      ? { units: nextTier.units, amount: nextTier.amount, toGo: nextTier.units - units }
      : null,
    daysInMonth,
    dayOfMonth,
    daysLeft,
    paceUnits,
    paceProfit,
    paceComm,
    onPace: paceUnits >= goalUnits,
  };
}

export interface MonthOption {
  key: string;
  label: string;
}

export interface MonthSummary {
  month: string;
  label: string;
  units: number;
  totalProfit: number;
  commission: number;
}

export interface KiaDashboardData {
  month: string; // the month currently shown, 'YYYY-MM'
  months: MonthOption[]; // selectable months (current + any with deals), newest first
  history: MonthSummary[]; // per-month totals, newest first
  deals: KiaDeal[];
  metrics: KiaMetrics;
  settings: { goalUnits: number; reviewCount: number };
  payPlan: PayPlan;
}

export async function getDashboard(
  userId: string,
  requestedMonth?: string,
): Promise<KiaDashboardData> {
  await ensureKiaSeed(userId);

  const settingsRow = (
    await db.select().from(kiaSettings).where(eq(kiaSettings.userId, userId)).limit(1)
  )[0];
  const payPlan = parsePayPlan(settingsRow);

  const allRows = await db.select().from(kiaDeals).where(eq(kiaDeals.userId, userId));

  // Group every deal by its Eastern-Time month.
  const byMonth = new Map<string, KiaDealRow[]>();
  for (const row of allRows) {
    const key = etMonthKey(row.soldAt);
    const list = byMonth.get(key) ?? [];
    list.push(row);
    byMonth.set(key, list);
  }

  const current = currentMonthKey();
  const month = resolveMonth(requestedMonth);
  const { goalUnits, reviewCount } = await monthSettings(userId, month);

  // Selectable months: the current month plus any month that has deals.
  const monthKeys = [...new Set([current, ...byMonth.keys()])].sort().reverse();
  const months: MonthOption[] = monthKeys.map((k) => ({ key: k, label: monthLabel(k) }));

  // Per-month history totals, newest first (only months that have deals).
  const history: MonthSummary[] = [...byMonth.entries()]
    .map(([k, rows]) => {
      const totalProfit = rows.reduce((a, d) => a + d.profit, 0);
      return {
        month: k,
        label: monthLabel(k),
        units: rows.length,
        totalProfit,
        commission: commissionForDeals(rows, payPlan),
      };
    })
    .sort((a, b) => (a.month < b.month ? 1 : -1));

  const rows = (byMonth.get(month) ?? []).slice();
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
    frontProfit: r.frontProfit,
    backProfit: r.backProfit,
    soldAt: r.soldAt.getTime(),
    dateLabel: dateLabelFmt.format(r.soldAt),
  }));

  return {
    month,
    months,
    history,
    deals,
    metrics: computeMetrics(rows, goalUnits, reviewCount, monthContext(month), payPlan),
    settings: { goalUnits, reviewCount },
    payPlan,
  };
}

// Update the user's pay plan. Any field can be changed; current values are the
// defaults. Commission is given as a percent (e.g. 13.5) and stored in bp.
export async function updatePayPlan(
  userId: string,
  input: {
    commissionMode?: 'total' | 'split';
    commissionPct?: number;
    commissionFrontPct?: number;
    commissionBackPct?: number;
    reviewRequired?: boolean;
    reviewReqPct?: number;
    bonusTiers?: BonusTier[];
  },
): Promise<void> {
  await ensureKiaSeed(userId);
  const patch: Partial<typeof kiaSettings.$inferInsert> = { updatedAt: new Date() };
  const toBp = (pct: number) => Math.round(Math.max(0, Math.min(100, pct)) * 100);

  if (input.commissionMode != null) patch.commissionMode = input.commissionMode;
  if (input.commissionPct != null) patch.commissionBp = toBp(input.commissionPct);
  if (input.commissionFrontPct != null) patch.commissionFrontBp = toBp(input.commissionFrontPct);
  if (input.commissionBackPct != null) patch.commissionBackBp = toBp(input.commissionBackPct);
  if (input.reviewRequired != null) patch.reviewRequired = input.reviewRequired;
  if (input.reviewReqPct != null) {
    patch.reviewReqPct = Math.round(Math.max(0, Math.min(100, input.reviewReqPct)));
  }
  if (input.bonusTiers != null) {
    const clean = input.bonusTiers
      .filter((t) => Number.isFinite(t.units) && Number.isFinite(t.amount) && t.units > 0 && t.amount >= 0)
      .map((t) => ({ units: Math.round(t.units), amount: Math.round(t.amount) }))
      .sort((a, b) => a.units - b.units);
    patch.bonusTiers = JSON.stringify(clean);
  }

  await db.update(kiaSettings).set(patch).where(eq(kiaSettings.userId, userId));
}

export async function addDeal(
  userId: string,
  input: {
    customer?: string;
    model: string;
    type: 'New' | 'Used';
    profit?: number;
    frontProfit?: number;
    backProfit?: number;
    soldAt?: string;
  },
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
  // When a front/back split is given, total profit is their sum.
  const split = input.frontProfit != null || input.backProfit != null;
  const front = input.frontProfit != null ? Math.max(0, Math.round(input.frontProfit)) : null;
  const back = input.backProfit != null ? Math.max(0, Math.round(input.backProfit)) : null;
  const profit = split ? (front ?? 0) + (back ?? 0) : Math.max(0, Math.round(input.profit ?? 0));
  await db.insert(kiaDeals).values({
    id: crypto.randomUUID(),
    userId,
    customer: (input.customer || 'Walk-in').trim() || 'Walk-in',
    model: input.model.trim(),
    type: input.type,
    profit,
    frontProfit: front,
    backProfit: back,
    soldAt,
    createdAt: new Date(),
  });
}

export async function updateDeal(
  userId: string,
  id: string,
  input: {
    customer?: string;
    model?: string;
    type?: 'New' | 'Used';
    profit?: number;
    frontProfit?: number;
    backProfit?: number;
    soldAt?: string;
  },
): Promise<void> {
  const existing = (
    await db
      .select()
      .from(kiaDeals)
      .where(and(eq(kiaDeals.id, id), eq(kiaDeals.userId, userId)))
      .limit(1)
  )[0];
  if (!existing) throw new Error('Deal not found');

  const patch: Partial<typeof kiaDeals.$inferInsert> = {};
  if (input.customer != null) {
    patch.customer = (input.customer || 'Walk-in').trim() || 'Walk-in';
  }
  if (input.model != null) {
    const m = input.model.trim();
    if (!m) throw new Error('Model is required');
    patch.model = m;
  }
  if (input.type != null) patch.type = input.type;
  // Editing a front/back split recomputes total profit; editing total clears
  // the split (it becomes a single number again).
  if (input.frontProfit != null || input.backProfit != null) {
    const front = Math.max(0, Math.round(input.frontProfit ?? existing.frontProfit ?? 0));
    const back = Math.max(0, Math.round(input.backProfit ?? existing.backProfit ?? 0));
    patch.frontProfit = front;
    patch.backProfit = back;
    patch.profit = front + back;
  } else if (input.profit != null) {
    patch.profit = Math.max(0, Math.round(input.profit));
    patch.frontProfit = null;
    patch.backProfit = null;
  }
  if (input.soldAt != null) {
    const [y, m, d] = input.soldAt.split('-').map(Number);
    patch.soldAt = dayAtNoonUtc(y, m, d);
  }

  await db
    .update(kiaDeals)
    .set(patch)
    .where(and(eq(kiaDeals.id, id), eq(kiaDeals.userId, userId)));
}

// The raw fields needed to restore a removed deal exactly (undo).
export interface RemovedKiaDeal {
  id: string;
  customer: string;
  model: string;
  type: 'New' | 'Used';
  profit: number;
  frontProfit: number | null;
  backProfit: number | null;
  soldAt: number; // ms
}

export async function removeDeal(
  userId: string,
  id: string,
): Promise<RemovedKiaDeal | null> {
  const row = (
    await db
      .select()
      .from(kiaDeals)
      .where(and(eq(kiaDeals.id, id), eq(kiaDeals.userId, userId)))
      .limit(1)
  )[0];
  if (!row) return null;

  await db.delete(kiaDeals).where(and(eq(kiaDeals.id, id), eq(kiaDeals.userId, userId)));

  return {
    id: row.id,
    customer: row.customer,
    model: row.model,
    type: row.type,
    profit: row.profit,
    frontProfit: row.frontProfit,
    backProfit: row.backProfit,
    soldAt: row.soldAt.getTime(),
  };
}

// Re-insert a previously removed deal (undo); ignored if the id already exists.
export async function restoreDeal(userId: string, deal: RemovedKiaDeal): Promise<void> {
  await ensureKiaSeed(userId);
  await db
    .insert(kiaDeals)
    .values({
      id: deal.id,
      userId,
      customer: deal.customer,
      model: deal.model,
      type: deal.type,
      profit: deal.profit,
      frontProfit: deal.frontProfit,
      backProfit: deal.backProfit,
      soldAt: new Date(deal.soldAt),
      createdAt: new Date(),
    })
    .onConflictDoNothing();
}

export async function updateSettings(
  userId: string,
  requestedMonth: string | undefined,
  input: { goalUnits?: number; reviewCount?: number },
): Promise<void> {
  await ensureKiaSeed(userId);
  const month = resolveMonth(requestedMonth);
  // Start from the month's effective values so a partial update keeps the rest.
  const cur = await monthSettings(userId, month);
  const goalUnits =
    input.goalUnits != null ? Math.max(1, Math.round(input.goalUnits)) : cur.goalUnits;
  const reviewCount =
    input.reviewCount != null ? Math.max(0, Math.round(input.reviewCount)) : cur.reviewCount;

  const now = new Date();
  await db
    .insert(kiaMonthSettings)
    .values({ userId, month, goalUnits, reviewCount, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [kiaMonthSettings.userId, kiaMonthSettings.month],
      set: { goalUnits, reviewCount, updatedAt: now },
    });
}
