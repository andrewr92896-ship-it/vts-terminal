import crypto from 'node:crypto';
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { budgetCategories, budgetEntries, type BudgetKind } from '../db/schema.js';

// Personal budgeting — what you earn and what you spend, by month.
//
// EVERYTHING HERE IS THE CALLER'S OWN. Every query filters on `userId`, no
// function takes a "whose" parameter, and `scopedTraderIds` deliberately does
// not appear. A budget is the most personal thing in the terminal; there is no
// version of this feature where somebody else's is worth reading.
//
// MONEY IS CENTS, as integers, everywhere in this module. A budget adds and
// subtracts the same figures repeatedly and binary floats accumulate visible
// error doing that. Conversion to and from dollars happens at the edges (the
// route parses, the client formats) so nothing in the middle can drift.

export class BudgetError extends Error {}

// ---------------------------------------------------------------------------
// Months
// ---------------------------------------------------------------------------
//
// A month is `YYYY-MM`, and a day is `YYYY-MM-DD`, both in EASTERN time.
//
// Eastern rather than the reader's own zone, deliberately and for the same
// reason History buckets trades that way: a month boundary has to be one fact,
// not a per-reader one. Somebody who travels should not watch December's
// spending move into November because they changed the display zone — the
// figures would appear to change without anything being entered or edited.

const ET = 'America/New_York';

/** Today's ET calendar day as YYYY-MM-DD. */
export function etToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ET,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** The current ET month as YYYY-MM. */
export function etThisMonth(): string {
  return etToday().slice(0, 7);
}

/** Whether a string is a well-formed YYYY-MM. */
export function isMonthKey(v: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(v)) return false;
  const m = Number(v.slice(5, 7));
  return m >= 1 && m <= 12;
}

/** Whether a string is a well-formed YYYY-MM-DD that names a real date. */
export function isDayKey(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  // Round-tripping catches 2026-02-31, which the regex alone happily accepts.
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * The half-open day range covering one month: `[first, nextFirst)`.
 *
 * Half-open rather than first..last so the query is `>= a AND < b` and no
 * comparison has to reason about how many days the month has. String comparison
 * works because YYYY-MM-DD sorts lexicographically the same way it sorts
 * chronologically — which is the whole reason the column is a date string.
 */
export function monthRange(month: string): { from: string; to: string } {
  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7));
  const nextYear = mon === 12 ? year + 1 : year;
  const nextMon = mon === 12 ? 1 : mon + 1;
  return {
    from: `${month}-01`,
    to: `${String(nextYear).padStart(4, '0')}-${String(nextMon).padStart(2, '0')}-01`,
  };
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export interface BudgetCategoryView {
  id: string;
  name: string;
  kind: BudgetKind;
  /** Expected monthly figure in cents, or null for "no target". */
  monthlyLimit: number | null;
  icon: string | null;
  sortOrder: number;
  archived: boolean;
  /** What was actually recorded against this category in the month asked for. */
  actualCents: number;
  /** How many entries made it up — so the UI can say "nothing recorded yet". */
  entryCount: number;
}

export interface BudgetEntryView {
  id: string;
  categoryId: string;
  categoryName: string;
  kind: BudgetKind;
  amountCents: number;
  note: string | null;
  occurredOn: string;
  source: string;
}

export interface BudgetMonth {
  month: string;
  categories: BudgetCategoryView[];
  entries: BudgetEntryView[];
  /** Money in, actual, cents. */
  incomeCents: number;
  /** Money out, actual, cents. */
  spentCents: number;
  /** incomeCents - spentCents. Negative means the month is running at a loss. */
  netCents: number;
  /** The same three, from the monthly targets rather than what happened. */
  plannedIncomeCents: number;
  plannedSpendCents: number;
  plannedNetCents: number;
  /**
   * Whether any expense category carries a target at all. The screen uses this
   * to decide between showing progress against a plan and simply showing what
   * was spent — a budget with no targets set is a spending log, and pretending
   * otherwise would draw every bar at 0%.
   */
  hasTargets: boolean;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getBudgetMonth(userId: string, month: string): Promise<BudgetMonth> {
  if (!isMonthKey(month)) throw new BudgetError('That is not a valid month');
  const { from, to } = monthRange(month);

  const [cats, rows] = await Promise.all([
    db
      .select()
      .from(budgetCategories)
      .where(eq(budgetCategories.userId, userId))
      .orderBy(asc(budgetCategories.sortOrder), asc(budgetCategories.name)),
    db
      .select()
      .from(budgetEntries)
      .where(
        and(
          eq(budgetEntries.userId, userId),
          gte(budgetEntries.occurredOn, from),
          lt(budgetEntries.occurredOn, to),
        ),
      )
      .orderBy(asc(budgetEntries.occurredOn)),
  ]);

  const byCategory = new Map<string, { total: number; count: number }>();
  for (const e of rows) {
    const cur = byCategory.get(e.categoryId) ?? { total: 0, count: 0 };
    cur.total += e.amountCents;
    cur.count += 1;
    byCategory.set(e.categoryId, cur);
  }

  const catById = new Map(cats.map((c) => [c.id, c]));

  // An ARCHIVED category is kept in the list when it has activity this month.
  // Archiving says "stop offering this going forward", not "pretend I never
  // spent it" — dropping it would silently change a past month's totals, which
  // is the one thing a record of what you spent must never do.
  const categories: BudgetCategoryView[] = cats
    .filter((c) => !c.archived || (byCategory.get(c.id)?.count ?? 0) > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      monthlyLimit: c.monthlyLimit,
      icon: c.icon,
      sortOrder: c.sortOrder,
      archived: c.archived,
      actualCents: byCategory.get(c.id)?.total ?? 0,
      entryCount: byCategory.get(c.id)?.count ?? 0,
    }));

  const entries: BudgetEntryView[] = rows.map((e) => {
    const c = catById.get(e.categoryId);
    return {
      id: e.id,
      categoryId: e.categoryId,
      categoryName: c?.name ?? '(removed)',
      kind: c?.kind ?? 'expense',
      amountCents: e.amountCents,
      note: e.note,
      occurredOn: e.occurredOn,
      source: e.source,
    };
  });

  let incomeCents = 0;
  let spentCents = 0;
  let plannedIncomeCents = 0;
  let plannedSpendCents = 0;
  let hasTargets = false;
  for (const c of categories) {
    if (c.kind === 'income') {
      incomeCents += c.actualCents;
      plannedIncomeCents += c.monthlyLimit ?? 0;
    } else {
      spentCents += c.actualCents;
      plannedSpendCents += c.monthlyLimit ?? 0;
      if (c.monthlyLimit != null) hasTargets = true;
    }
  }

  return {
    month,
    categories,
    entries,
    incomeCents,
    spentCents,
    netCents: incomeCents - spentCents,
    plannedIncomeCents,
    plannedSpendCents,
    plannedNetCents: plannedIncomeCents - plannedSpendCents,
    hasTargets,
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

const MAX_CATEGORIES = 60;

export async function addCategory(
  userId: string,
  input: { name: string; kind: BudgetKind; monthlyLimit?: number | null; icon?: string | null },
): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new BudgetError('Give the category a name');

  const existing = await db
    .select({ id: budgetCategories.id, name: budgetCategories.name })
    .from(budgetCategories)
    .where(eq(budgetCategories.userId, userId));
  if (existing.length >= MAX_CATEGORIES) {
    throw new BudgetError('That is as many categories as one budget can hold');
  }
  if (existing.some((c) => c.name.trim().toLowerCase() === name.toLowerCase())) {
    throw new BudgetError('You already have a category with that name');
  }

  const now = new Date();
  await db.insert(budgetCategories).values({
    id: crypto.randomUUID(),
    userId,
    name,
    kind: input.kind,
    monthlyLimit: input.monthlyLimit ?? null,
    icon: input.icon ?? null,
    sortOrder: existing.length,
    archived: false,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateCategory(
  userId: string,
  id: string,
  patch: { name?: string; monthlyLimit?: number | null; archived?: boolean; icon?: string | null },
): Promise<void> {
  // Scoped to the caller's own row: the WHERE carries userId, so an id belonging
  // to somebody else simply matches nothing.
  const own = (
    await db
      .select({ id: budgetCategories.id })
      .from(budgetCategories)
      .where(and(eq(budgetCategories.id, id), eq(budgetCategories.userId, userId)))
      .limit(1)
  )[0];
  if (!own) throw new BudgetError('That category no longer exists');

  const set: Partial<typeof budgetCategories.$inferInsert> = { updatedAt: new Date() };
  if (patch.name != null) {
    const name = patch.name.trim();
    if (!name) throw new BudgetError('Give the category a name');
    set.name = name;
  }
  if (patch.monthlyLimit !== undefined) set.monthlyLimit = patch.monthlyLimit;
  if (patch.archived != null) set.archived = patch.archived;
  if (patch.icon !== undefined) set.icon = patch.icon;

  await db
    .update(budgetCategories)
    .set(set)
    .where(and(eq(budgetCategories.id, id), eq(budgetCategories.userId, userId)));
}

/**
 * Remove a category and everything recorded against it.
 *
 * The entries go with it (ON DELETE CASCADE), which is why the screen offers
 * ARCHIVE as the ordinary action and keeps delete for a category created by
 * mistake. Archiving preserves the history and stops the category being offered;
 * deleting is what somebody actually means only when there is no history worth
 * keeping.
 */
export async function removeCategory(userId: string, id: string): Promise<void> {
  await db
    .delete(budgetCategories)
    .where(and(eq(budgetCategories.id, id), eq(budgetCategories.userId, userId)));
}

export async function addEntry(
  userId: string,
  input: { categoryId: string; amountCents: number; note?: string | null; occurredOn?: string },
): Promise<void> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    // Positive only — the category's kind carries the sign. A negative amount
    // here would read correctly on this screen and wrongly everywhere that sums
    // the column.
    throw new BudgetError('Enter an amount greater than zero');
  }
  const cat = (
    await db
      .select({ id: budgetCategories.id })
      .from(budgetCategories)
      .where(and(eq(budgetCategories.id, input.categoryId), eq(budgetCategories.userId, userId)))
      .limit(1)
  )[0];
  if (!cat) throw new BudgetError('Pick a category');

  const occurredOn = input.occurredOn ?? etToday();
  if (!isDayKey(occurredOn)) throw new BudgetError('That is not a valid date');

  const now = new Date();
  await db.insert(budgetEntries).values({
    id: crypto.randomUUID(),
    userId,
    categoryId: input.categoryId,
    amountCents: input.amountCents,
    note: input.note?.trim() || null,
    occurredOn,
    // Always 'manual' from this path. The aggregator, when it lands, is the only
    // other writer and sets its own source — the client can never choose one.
    source: 'manual',
    externalId: null,
    createdAt: now,
    updatedAt: now,
  });
}

export async function removeEntry(userId: string, id: string): Promise<void> {
  await db
    .delete(budgetEntries)
    .where(and(eq(budgetEntries.id, id), eq(budgetEntries.userId, userId)));
}
