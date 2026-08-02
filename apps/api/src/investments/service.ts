import crypto from 'node:crypto';
import { and, eq, gte, lte, desc, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  investmentAccounts,
  investmentHoldings,
  investmentTransactions,
  investmentSnapshots,
  investmentGoals,
  type InvestmentAccountKind,
  type InvestmentAccountRow,
  type InvestmentAssetClass,
  type InvestmentGoalKind,
  type InvestmentGoalRow,
  type InvestmentHoldingRow,
  type InvestmentTransactionRow,
  type InvestmentTxKind,
} from '../db/schema.js';
import { fetchInvestmentQuotes, investmentPricesConfigured } from './prices.js';
import {
  allocateBy,
  concentrationFlags,
  project,
  summarizePerformance,
  totalPortfolio,
  valueHolding,
  type AllocationBucket,
  type ConcentrationFlag,
  type HoldingValue,
  type PerformanceSummary,
  type PortfolioTotals,
  type PricedHolding,
  type ProjectionPoint,
  type SnapshotPoint,
} from './math.js';
import {
  LIMIT_GROUP_LABELS,
  LATEST_LIMIT_YEAR,
  contributionLimit,
  hasLimitsFor,
  limitGroupFor,
  type LimitGroup,
} from './limits.js';

// The Investments service — a read-only long-term portfolio tracker.
//
// Everything here is scoped to ONE user. There is no team scope in this
// workspace and there must not be one: unlike a trading desk, where the whole
// team watches the same book, an investment account is personal. Every query
// below filters on `userId`, and every write re-checks ownership rather than
// trusting an id from the client.

export class InvestmentError extends Error {}

// ---- Views ----

export interface AccountView {
  id: string;
  kind: InvestmentAccountKind;
  label: string;
  institution: string | null;
  source: 'manual' | 'plaid' | 'snaptrade';
  cashBalance: number;
  note: string | null;
  active: boolean;
  sortOrder: number;
  /** Value of the holdings inside it that could be priced, plus its cash. */
  value: number;
  holdingsCount: number;
  unpricedCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface HoldingView extends HoldingValue {
  accountLabel: string;
  manualPrice: number | null;
  manualPriceAt: number | null;
  note: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface PortfolioPayload {
  accounts: AccountView[];
  holdings: HoldingView[];
  totals: PortfolioTotals;
  allocation: {
    byClass: AllocationBucket[];
    bySector: AllocationBucket[];
    byRegion: AllocationBucket[];
    flags: ConcentrationFlag[];
  };
  /** Whether a live equity/ETF provider is configured at all on this install. */
  livePricesConfigured: boolean;
  asOf: number;
}

const ET_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's ET calendar date as "YYYY-MM-DD" — the key snapshots are stored on. */
export function etToday(now: Date = new Date()): string {
  return ET_DATE.format(now);
}

function nowMs(): number {
  return Date.now();
}

// ---- Accounts ----

export interface AccountInput {
  kind: InvestmentAccountKind;
  label: string;
  institution?: string | null;
  cashBalance?: number;
  note?: string | null;
  active?: boolean;
  sortOrder?: number;
}

async function ownedAccount(userId: string, accountId: string): Promise<InvestmentAccountRow> {
  const row = (
    await db
      .select()
      .from(investmentAccounts)
      .where(and(eq(investmentAccounts.id, accountId), eq(investmentAccounts.userId, userId)))
      .limit(1)
  )[0];
  if (!row) throw new InvestmentError('That account does not exist');
  return row;
}

export async function listAccounts(userId: string): Promise<InvestmentAccountRow[]> {
  return db
    .select()
    .from(investmentAccounts)
    .where(eq(investmentAccounts.userId, userId))
    .orderBy(asc(investmentAccounts.sortOrder), asc(investmentAccounts.createdAt));
}

export async function createAccount(userId: string, input: AccountInput): Promise<string> {
  const id = crypto.randomUUID();
  const at = new Date(nowMs());
  await db.insert(investmentAccounts).values({
    id,
    userId,
    kind: input.kind,
    label: input.label.trim(),
    institution: input.institution?.trim() || null,
    // Everything is hand-entered today. An aggregator would set this itself; a
    // client can never choose it, or a manual account could claim to be a
    // verified Plaid connection.
    source: 'manual',
    cashBalance: input.cashBalance ?? 0,
    note: input.note?.trim() || null,
    active: input.active ?? true,
    sortOrder: input.sortOrder ?? 0,
    createdAt: at,
    updatedAt: at,
  });
  return id;
}

export async function updateAccount(
  userId: string,
  accountId: string,
  patch: Partial<AccountInput>,
): Promise<void> {
  await ownedAccount(userId, accountId);
  const set: Record<string, unknown> = { updatedAt: new Date(nowMs()) };
  if (patch.kind !== undefined) set.kind = patch.kind;
  if (patch.label !== undefined) set.label = patch.label.trim();
  if (patch.institution !== undefined) set.institution = patch.institution?.trim() || null;
  if (patch.cashBalance !== undefined) set.cashBalance = patch.cashBalance;
  if (patch.note !== undefined) set.note = patch.note?.trim() || null;
  if (patch.active !== undefined) set.active = patch.active;
  if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;
  await db.update(investmentAccounts).set(set).where(eq(investmentAccounts.id, accountId));
}

export async function removeAccount(userId: string, accountId: string): Promise<void> {
  await ownedAccount(userId, accountId);
  // Children first and explicitly, rather than leaning on the foreign keys. The
  // cascade is real (the libsql client runs with foreign_keys=1), but every
  // other delete path in this repo states its tables, and a delete that depends
  // on a pragma is a delete that breaks quietly if the pragma ever changes.
  await db.delete(investmentTransactions).where(eq(investmentTransactions.accountId, accountId));
  await db.delete(investmentHoldings).where(eq(investmentHoldings.accountId, accountId));
  await db.delete(investmentGoals).where(eq(investmentGoals.accountId, accountId));
  await db.delete(investmentAccounts).where(eq(investmentAccounts.id, accountId));
}

// ---- Holdings ----

export interface HoldingInput {
  accountId: string;
  symbol?: string | null;
  name: string;
  assetClass: InvestmentAssetClass;
  quantity: number;
  costBasis?: number | null;
  manualPrice?: number | null;
  sector?: string | null;
  region?: string | null;
  note?: string | null;
}

function cleanSymbol(sym: string | null | undefined): string | null {
  const s = sym?.trim().toUpperCase();
  return s && s.length > 0 ? s : null;
}

export async function createHolding(userId: string, input: HoldingInput): Promise<string> {
  await ownedAccount(userId, input.accountId);
  const id = crypto.randomUUID();
  const at = new Date(nowMs());
  const price = input.manualPrice ?? null;
  await db.insert(investmentHoldings).values({
    id,
    userId,
    accountId: input.accountId,
    symbol: cleanSymbol(input.symbol),
    name: input.name.trim(),
    assetClass: input.assetClass,
    quantity: input.quantity,
    costBasis: input.costBasis ?? null,
    manualPrice: price,
    // Stamp when the user gave us the figure, so the screen can say "your price,
    // entered 3 weeks ago" rather than implying it is current.
    manualPriceAt: price != null ? at : null,
    sector: input.sector?.trim() || null,
    region: input.region?.trim() || null,
    note: input.note?.trim() || null,
    createdAt: at,
    updatedAt: at,
  });
  return id;
}

export async function updateHolding(
  userId: string,
  holdingId: string,
  patch: Partial<HoldingInput>,
): Promise<void> {
  const row = (
    await db
      .select()
      .from(investmentHoldings)
      .where(and(eq(investmentHoldings.id, holdingId), eq(investmentHoldings.userId, userId)))
      .limit(1)
  )[0];
  if (!row) throw new InvestmentError('That holding does not exist');
  if (patch.accountId !== undefined) await ownedAccount(userId, patch.accountId);

  const at = new Date(nowMs());
  const set: Record<string, unknown> = { updatedAt: at };
  if (patch.accountId !== undefined) set.accountId = patch.accountId;
  if (patch.symbol !== undefined) set.symbol = cleanSymbol(patch.symbol);
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.assetClass !== undefined) set.assetClass = patch.assetClass;
  if (patch.quantity !== undefined) set.quantity = patch.quantity;
  if (patch.costBasis !== undefined) set.costBasis = patch.costBasis;
  if (patch.sector !== undefined) set.sector = patch.sector?.trim() || null;
  if (patch.region !== undefined) set.region = patch.region?.trim() || null;
  if (patch.note !== undefined) set.note = patch.note?.trim() || null;
  if (patch.manualPrice !== undefined) {
    set.manualPrice = patch.manualPrice;
    // Only re-stamp when the number actually changed. Re-saving a holding to fix
    // a typo in its name must not make a month-old price look like today's.
    if (patch.manualPrice !== row.manualPrice) set.manualPriceAt = patch.manualPrice == null ? null : at;
  }
  await db.update(investmentHoldings).set(set).where(eq(investmentHoldings.id, holdingId));
}

export async function removeHolding(userId: string, holdingId: string): Promise<void> {
  const res = await db
    .delete(investmentHoldings)
    .where(and(eq(investmentHoldings.id, holdingId), eq(investmentHoldings.userId, userId)));
  if (res.rowsAffected === 0) throw new InvestmentError('That holding does not exist');
}

// ---- The portfolio read ----

export async function getPortfolio(
  userId: string,
  opts: { recordSnapshot?: boolean } = {},
): Promise<PortfolioPayload> {
  const [accounts, holdings] = await Promise.all([
    listAccounts(userId),
    db.select().from(investmentHoldings).where(eq(investmentHoldings.userId, userId)),
  ]);

  const activeAccounts = accounts.filter((a) => a.active);
  const activeIds = new Set(activeAccounts.map((a) => a.id));
  // An account switched off is excluded from every total, but its rows are kept
  // — the same rule as Feature Access: turning something off hides it, it never
  // deletes it.
  const liveHoldings = holdings.filter((h) => activeIds.has(h.accountId));

  const quoteReqs = liveHoldings
    .filter((h) => h.symbol)
    .map((h) => ({ symbol: h.symbol!, assetClass: h.assetClass }));
  const quotes = await fetchInvestmentQuotes(quoteReqs);

  const accountLabels = new Map(accounts.map((a) => [a.id, a.label]));

  const priced: (PricedHolding & { row: InvestmentHoldingRow })[] = liveHoldings.map((h) => {
    const q = h.symbol ? quotes.get(h.symbol) : undefined;
    const price = q ? q.price : h.manualPrice ?? null;
    const source: PricedHolding['priceSource'] = q ? 'live' : h.manualPrice != null ? 'manual' : 'none';
    return {
      row: h,
      id: h.id,
      accountId: h.accountId,
      symbol: h.symbol,
      name: h.name,
      assetClass: h.assetClass,
      quantity: h.quantity,
      costBasis: h.costBasis,
      price,
      priceSource: source,
      previousClose: q?.previousClose ?? null,
      sector: h.sector,
      region: h.region,
    };
  });

  const valued: HoldingView[] = priced.map((p) => ({
    ...valueHolding(p),
    accountLabel: accountLabels.get(p.accountId) ?? 'Unknown account',
    manualPrice: p.row.manualPrice,
    manualPriceAt: p.row.manualPriceAt ? p.row.manualPriceAt.getTime() : null,
    note: p.row.note,
    createdAt: p.row.createdAt.getTime(),
    updatedAt: p.row.updatedAt.getTime(),
  }));

  const cash = activeAccounts.reduce((s, a) => s + a.cashBalance, 0);
  const totals = totalPortfolio(valued, cash);

  const accountViews: AccountView[] = accounts.map((a) => {
    const mine = valued.filter((h) => h.accountId === a.id);
    const value = mine.reduce((s, h) => s + (h.value ?? 0), 0) + a.cashBalance;
    return {
      id: a.id,
      kind: a.kind,
      label: a.label,
      institution: a.institution,
      source: a.source,
      cashBalance: a.cashBalance,
      note: a.note,
      active: a.active,
      sortOrder: a.sortOrder,
      value: a.active ? value : 0,
      holdingsCount: holdings.filter((h) => h.accountId === a.id).length,
      unpricedCount: mine.filter((h) => h.value == null).length,
      createdAt: a.createdAt.getTime(),
      updatedAt: a.updatedAt.getTime(),
    };
  });

  const byClass = allocateBy(valued, 'assetClass', cash);
  const payload: PortfolioPayload = {
    accounts: accountViews,
    holdings: valued,
    totals,
    allocation: {
      byClass,
      bySector: allocateBy(valued, 'sector'),
      byRegion: allocateBy(valued, 'region'),
      flags: concentrationFlags(valued, byClass, totals.value),
    },
    livePricesConfigured: investmentPricesConfigured(),
    asOf: nowMs(),
  };

  // Record today's reading so Performance has a history to draw. This is the
  // only way the workspace can ever show a real return line: with no provider
  // for historical fund prices, the alternative is back-filling a curve that
  // never happened. One row per user per ET day, written on read.
  if (opts.recordSnapshot && (totals.value > 0 || holdings.length > 0)) {
    await recordSnapshot(userId, totals.value, totals.costBasis).catch(() => {
      /* a snapshot is a nice-to-have; never fail the portfolio read over it */
    });
  }

  return payload;
}

async function contributedToDate(userId: string): Promise<number> {
  const rows = await db
    .select()
    .from(investmentTransactions)
    .where(eq(investmentTransactions.userId, userId));
  return netContributed(rows);
}

/** Contributions + employer match - withdrawals. What the user actually put in. */
function netContributed(rows: InvestmentTransactionRow[]): number {
  let total = 0;
  for (const r of rows) {
    if (r.kind === 'contribution' || r.kind === 'employer_match') total += r.amount;
    else if (r.kind === 'withdrawal') total -= r.amount;
  }
  return total;
}

export async function recordSnapshot(
  userId: string,
  value: number,
  costBasis: number | null,
): Promise<void> {
  const onDate = etToday();
  const contributed = await contributedToDate(userId);
  await db
    .insert(investmentSnapshots)
    .values({
      id: crypto.randomUUID(),
      userId,
      onDate,
      value,
      costBasis,
      contributedToDate: contributed,
      createdAt: new Date(nowMs()),
    })
    .onConflictDoUpdate({
      // Later in the day beats earlier: the last reading of a day is the one
      // that stands, so a morning value is not what the year-end chart shows.
      target: [investmentSnapshots.userId, investmentSnapshots.onDate],
      set: { value, costBasis, contributedToDate: contributed },
    });
}

// ---- Transactions ----

export interface TransactionInput {
  accountId: string;
  holdingId?: string | null;
  kind: InvestmentTxKind;
  amount: number;
  quantity?: number | null;
  symbol?: string | null;
  occurredAt: number;
  taxYear?: number | null;
  note?: string | null;
}

export interface TransactionView {
  id: string;
  accountId: string;
  accountLabel: string;
  holdingId: string | null;
  kind: InvestmentTxKind;
  amount: number;
  quantity: number | null;
  symbol: string | null;
  occurredAt: number;
  taxYear: number | null;
  note: string | null;
}

export async function listTransactions(
  userId: string,
  filter: { kinds?: InvestmentTxKind[]; from?: number; to?: number; accountId?: string } = {},
): Promise<TransactionView[]> {
  const clauses = [eq(investmentTransactions.userId, userId)];
  if (filter.from != null) clauses.push(gte(investmentTransactions.occurredAt, new Date(filter.from)));
  if (filter.to != null) clauses.push(lte(investmentTransactions.occurredAt, new Date(filter.to)));
  if (filter.accountId) clauses.push(eq(investmentTransactions.accountId, filter.accountId));

  const rows = await db
    .select()
    .from(investmentTransactions)
    .where(and(...clauses))
    .orderBy(desc(investmentTransactions.occurredAt));

  const accounts = await listAccounts(userId);
  const labels = new Map(accounts.map((a) => [a.id, a.label]));
  const kinds = filter.kinds;

  return rows
    .filter((r) => !kinds || kinds.includes(r.kind))
    .map((r) => ({
      id: r.id,
      accountId: r.accountId,
      accountLabel: labels.get(r.accountId) ?? 'Unknown account',
      holdingId: r.holdingId,
      kind: r.kind,
      amount: r.amount,
      quantity: r.quantity,
      symbol: r.symbol,
      occurredAt: r.occurredAt.getTime(),
      taxYear: r.taxYear,
      note: r.note,
    }));
}

export async function createTransaction(userId: string, input: TransactionInput): Promise<string> {
  await ownedAccount(userId, input.accountId);
  const id = crypto.randomUUID();
  const at = new Date(nowMs());
  const occurred = new Date(input.occurredAt);
  await db.insert(investmentTransactions).values({
    id,
    userId,
    accountId: input.accountId,
    holdingId: input.holdingId ?? null,
    kind: input.kind,
    // Always stored positive; `kind` carries the direction. A negative amount
    // would make the same withdrawal count twice in opposite directions
    // depending on which reader looked at it.
    amount: Math.abs(input.amount),
    quantity: input.quantity ?? null,
    symbol: cleanSymbol(input.symbol),
    occurredAt: occurred,
    // Default the tax year to the ET year it happened in. A contribution
    // designated to a prior year is the exception, and the client sets it
    // explicitly.
    taxYear: input.taxYear ?? Number(etToday(occurred).slice(0, 4)),
    note: input.note?.trim() || null,
    createdAt: at,
    updatedAt: at,
  });
  return id;
}

export async function removeTransaction(userId: string, txId: string): Promise<void> {
  const res = await db
    .delete(investmentTransactions)
    .where(and(eq(investmentTransactions.id, txId), eq(investmentTransactions.userId, userId)));
  if (res.rowsAffected === 0) throw new InvestmentError('That entry does not exist');
}

// ---- Contributions & Goals ----

export interface ContributionGroupView {
  group: LimitGroup;
  label: string;
  contributed: number;
  employerMatch: number;
  limit: number | null;
  catchUp50: number | null;
  limitNote?: string;
  remaining: number | null;
  pct: number | null;
}

export interface GoalView {
  id: string;
  accountId: string | null;
  accountLabel: string | null;
  kind: InvestmentGoalKind;
  label: string;
  targetAmount: number;
  targetDate: string | null;
  note: string | null;
  current: number;
  pct: number;
}

export interface ContributionsPayload {
  taxYear: number;
  /** False when the catalog has no figures for this year — the screen says so. */
  limitsKnown: boolean;
  latestLimitYear: number;
  groups: ContributionGroupView[];
  goals: GoalView[];
  uncappedContributed: number;
}

export async function getContributions(userId: string, taxYear: number): Promise<ContributionsPayload> {
  const [accounts, rows, goals, portfolio] = await Promise.all([
    listAccounts(userId),
    db.select().from(investmentTransactions).where(eq(investmentTransactions.userId, userId)),
    db.select().from(investmentGoals).where(eq(investmentGoals.userId, userId)),
    getPortfolio(userId),
  ]);

  const kindOf = new Map(accounts.map((a) => [a.id, a.kind]));
  const byGroup = new Map<LimitGroup, { contributed: number; employerMatch: number }>();
  let uncappedContributed = 0;

  for (const r of rows) {
    if (r.kind !== 'contribution' && r.kind !== 'employer_match') continue;
    if ((r.taxYear ?? 0) !== taxYear) continue;
    const kind = kindOf.get(r.accountId);
    if (!kind) continue;
    const group = limitGroupFor(kind);
    if (!group) {
      uncappedContributed += r.amount;
      continue;
    }
    const cur = byGroup.get(group) ?? { contributed: 0, employerMatch: 0 };
    if (r.kind === 'employer_match') cur.employerMatch += r.amount;
    else cur.contributed += r.amount;
    byGroup.set(group, cur);
  }

  // Show every group the user actually has an account for, even at zero — the
  // point of the screen is to see the headroom, which is invisible if the row
  // only appears once you have contributed.
  const relevant = new Set<LimitGroup>();
  for (const a of accounts) {
    if (!a.active) continue;
    const g = limitGroupFor(a.kind);
    if (g) relevant.add(g);
  }
  for (const g of byGroup.keys()) relevant.add(g);

  const groups: ContributionGroupView[] = [...relevant].map((group) => {
    const totals = byGroup.get(group) ?? { contributed: 0, employerMatch: 0 };
    const lim = contributionLimit(group, taxYear);
    // The employer match does not count against an employee's elective-deferral
    // limit, so it is reported beside the figure rather than added into it.
    return {
      group,
      label: LIMIT_GROUP_LABELS[group],
      contributed: totals.contributed,
      employerMatch: totals.employerMatch,
      limit: lim?.limit ?? null,
      catchUp50: lim?.catchUp50 ?? null,
      limitNote: lim?.note,
      remaining: lim ? Math.max(0, lim.limit - totals.contributed) : null,
      pct: lim && lim.limit > 0 ? Math.min(100, (totals.contributed / lim.limit) * 100) : null,
    };
  });

  const accountValue = new Map(portfolio.accounts.map((a) => [a.id, a.value]));
  const labels = new Map(accounts.map((a) => [a.id, a.label]));

  const goalViews: GoalView[] = goals.map((g: InvestmentGoalRow) => {
    const current = g.accountId ? accountValue.get(g.accountId) ?? 0 : portfolio.totals.value;
    return {
      id: g.id,
      accountId: g.accountId,
      accountLabel: g.accountId ? labels.get(g.accountId) ?? null : null,
      kind: g.kind,
      label: g.label,
      targetAmount: g.targetAmount,
      targetDate: g.targetDate,
      note: g.note,
      current,
      pct: g.targetAmount > 0 ? Math.min(100, (current / g.targetAmount) * 100) : 0,
    };
  });

  return {
    taxYear,
    limitsKnown: hasLimitsFor(taxYear),
    latestLimitYear: LATEST_LIMIT_YEAR,
    groups: groups.sort((a, b) => a.label.localeCompare(b.label)),
    goals: goalViews,
    uncappedContributed,
  };
}

export interface GoalInput {
  accountId?: string | null;
  kind: InvestmentGoalKind;
  label: string;
  targetAmount: number;
  targetDate?: string | null;
  note?: string | null;
}

export async function createGoal(userId: string, input: GoalInput): Promise<string> {
  if (input.accountId) await ownedAccount(userId, input.accountId);
  const id = crypto.randomUUID();
  const at = new Date(nowMs());
  await db.insert(investmentGoals).values({
    id,
    userId,
    accountId: input.accountId ?? null,
    kind: input.kind,
    label: input.label.trim(),
    targetAmount: input.targetAmount,
    targetDate: input.targetDate ?? null,
    note: input.note?.trim() || null,
    createdAt: at,
    updatedAt: at,
  });
  return id;
}

export async function removeGoal(userId: string, goalId: string): Promise<void> {
  const res = await db
    .delete(investmentGoals)
    .where(and(eq(investmentGoals.id, goalId), eq(investmentGoals.userId, userId)));
  if (res.rowsAffected === 0) throw new InvestmentError('That goal does not exist');
}

// ---- Performance ----

export interface PerformancePayload {
  points: SnapshotPoint[];
  summary: PerformanceSummary | null;
  /** How many days of history exist at all — the screen explains a thin series. */
  totalDays: number;
  rangeDays: number;
}

export async function getPerformance(userId: string, rangeDays: number): Promise<PerformancePayload> {
  const all = await db
    .select()
    .from(investmentSnapshots)
    .where(eq(investmentSnapshots.userId, userId))
    .orderBy(asc(investmentSnapshots.onDate));

  const cutoff = new Date(Date.now() - rangeDays * 86400000);
  const cutoffKey = etToday(cutoff);
  const inRange = rangeDays > 0 ? all.filter((s) => s.onDate >= cutoffKey) : all;

  const points: SnapshotPoint[] = inRange.map((s) => ({
    onDate: s.onDate,
    value: s.value,
    contributedToDate: s.contributedToDate,
  }));

  // Contributions inside the window: the difference between the running
  // contributed-to-date at each end. Derived from the snapshots rather than
  // re-summing transactions so the split always reconciles with the line above
  // it — the same reason the Market Data yield spread is derived from the two
  // legs it displays rather than read from its own series.
  let contributedInWindow = 0;
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && first.contributedToDate != null && last.contributedToDate != null) {
    contributedInWindow = last.contributedToDate - first.contributedToDate;
  }

  return {
    points,
    summary: summarizePerformance(points, contributedInWindow),
    totalDays: all.length,
    rangeDays,
  };
}

// ---- Dividends & income ----

export interface DividendPayload {
  entries: TransactionView[];
  /** Income received in each of the last 12 ET months, oldest first. */
  monthly: { month: string; amount: number }[];
  totalLast12: number;
  totalAllTime: number;
  /** Trailing 12-month income over current portfolio value, as a percentage. */
  trailingYieldPct: number | null;
  bySymbol: { symbol: string; amount: number }[];
}

export async function getDividends(userId: string): Promise<DividendPayload> {
  const [entries, portfolio] = await Promise.all([
    listTransactions(userId, { kinds: ['dividend', 'interest'] }),
    getPortfolio(userId),
  ]);

  const now = new Date();
  const monthKey = (d: Date) => etToday(d).slice(0, 7);
  const months: { month: string; amount: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ month: monthKey(d), amount: 0 });
  }
  const monthIndex = new Map(months.map((m, i) => [m.month, i]));

  let totalLast12 = 0;
  let totalAllTime = 0;
  const bySymbol = new Map<string, number>();

  for (const e of entries) {
    totalAllTime += e.amount;
    const key = monthKey(new Date(e.occurredAt));
    const idx = monthIndex.get(key);
    if (idx !== undefined) {
      months[idx]!.amount += e.amount;
      totalLast12 += e.amount;
    }
    const sym = e.symbol ?? 'Unattributed';
    bySymbol.set(sym, (bySymbol.get(sym) ?? 0) + e.amount);
  }

  return {
    entries,
    monthly: months,
    totalLast12,
    totalAllTime,
    // Trailing, not forward: a forward yield needs each holding's declared
    // dividend rate, which no source available here provides. Reporting what was
    // actually received is a fact; projecting it forward would not be.
    trailingYieldPct: portfolio.totals.value > 0 ? (totalLast12 / portfolio.totals.value) * 100 : null,
    bySymbol: [...bySymbol.entries()]
      .map(([symbol, amount]) => ({ symbol, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}

// ---- Projections ----

export interface ProjectionPayload {
  points: ProjectionPoint[];
  startValue: number;
  monthlyContribution: number;
  annualRatePct: number;
  years: number;
}

export async function getProjection(
  userId: string,
  opts: { monthlyContribution: number; annualRatePct: number; years: number },
): Promise<ProjectionPayload> {
  const portfolio = await getPortfolio(userId);
  const startValue = portfolio.totals.value;
  return {
    points: project(startValue, opts.monthlyContribution, opts.annualRatePct, opts.years),
    startValue,
    monthlyContribution: opts.monthlyContribution,
    annualRatePct: opts.annualRatePct,
    years: opts.years,
  };
}
