import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  financeSettings,
  financeExpenses,
  financeNetWorth,
  tradingTrades,
  tradingPositions,
  FTP_PHASES,
  NET_WORTH_KINDS,
  type FtpPhase,
  type NetWorthKind,
  type FinanceExpenseRow,
  type FinanceNetWorthRow,
  type FinanceSettingsRow,
} from '../db/schema.js';

// ---- Eastern-Time month helpers (match the trading month bucketing) ----
function etParts(d = new Date()): { year: number; month: number; day: number; key: string } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value])) as Record<string, string>;
  return { year: +p.year, month: +p.month, day: +p.day, key: `${p.year}-${p.month}` };
}
function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function inCurrentEtMonth(d: Date): boolean {
  const a = etParts(d);
  const now = etParts();
  return a.year === now.year && a.month === now.month;
}

async function ensureSettings(userId: string): Promise<FinanceSettingsRow> {
  const row = (
    await db.select().from(financeSettings).where(eq(financeSettings.userId, userId)).limit(1)
  )[0];
  if (row) return row;
  const now = new Date();
  await db
    .insert(financeSettings)
    .values({ userId, createdAt: now, updatedAt: now })
    .onConflictDoNothing();
  return (
    await db.select().from(financeSettings).where(eq(financeSettings.userId, userId)).limit(1)
  )[0];
}

// ---- Overview ----
export interface FinanceOverview {
  month: string;
  monthLabel: string;
  todayDay: number;
  settings: { ftpPhase: FtpPhase; ftpDivisor: number; ftpPayoutPct: number };
  earnings: {
    tradingReal: number;
    ftpRaw: number;
    ftpScaled: number;
    total: number;
  };
  expenses: { total: number; paid: number; upcoming: number; count: number };
  net: number;
  billsCoveredPct: number;
  netWorth: { assets: number; liabilities: number; total: number };
}

function scaleFtp(raw: number, s: FinanceSettingsRow): number {
  if (s.ftpPhase === 'funded') return raw * (s.ftpPayoutBp / 10000);
  return s.ftpDivisor > 0 ? raw / s.ftpDivisor : 0;
}

export async function getOverview(userId: string): Promise<FinanceOverview> {
  const settings = await ensureSettings(userId);
  const now = etParts();

  // Closed trades this month: FTP (simulated, scaled) vs. real brokers (100%).
  const closedTrades = await db
    .select()
    .from(tradingTrades)
    .where(and(eq(tradingTrades.userId, userId), eq(tradingTrades.status, 'closed')));
  let ftpRaw = 0;
  let realFromLog = 0;
  for (const t of closedTrades) {
    const when = t.closedAt ?? t.openedAt;
    if (!inCurrentEtMonth(when) || t.realizedPl == null) continue;
    if (t.broker === 'ftp') ftpRaw += t.realizedPl;
    else realFromLog += t.realizedPl;
  }

  // Live Wall auto-closed positions (OANDA/Kraken — real money).
  const closedPositions = await db
    .select()
    .from(tradingPositions)
    .where(and(eq(tradingPositions.userId, userId), eq(tradingPositions.status, 'closed')));
  let realFromPositions = 0;
  for (const p of closedPositions) {
    if (p.closedAt && inCurrentEtMonth(p.closedAt) && p.realizedPl != null) realFromPositions += p.realizedPl;
  }

  const tradingReal = realFromLog + realFromPositions;
  const ftpScaled = scaleFtp(ftpRaw, settings);
  const totalEarnings = tradingReal + ftpScaled;

  // Expenses (recurring monthly). "Paid" = its bank day has already passed.
  const expenseRows = (
    await db.select().from(financeExpenses).where(eq(financeExpenses.userId, userId))
  ).filter((e) => e.active);
  let expTotal = 0;
  let expPaid = 0;
  for (const e of expenseRows) {
    expTotal += e.amount;
    if (e.dayOfMonth <= now.day) expPaid += e.amount;
  }

  // Net worth.
  const nwRows = await db.select().from(financeNetWorth).where(eq(financeNetWorth.userId, userId));
  let assets = 0;
  let liabilities = 0;
  for (const r of nwRows) {
    if (r.kind === 'liability') liabilities += r.amount;
    else assets += r.amount;
  }

  return {
    month: now.key,
    monthLabel: monthLabel(now.key),
    todayDay: now.day,
    settings: { ftpPhase: settings.ftpPhase, ftpDivisor: settings.ftpDivisor, ftpPayoutPct: settings.ftpPayoutBp / 100 },
    earnings: {
      tradingReal,
      ftpRaw,
      ftpScaled,
      total: totalEarnings,
    },
    expenses: { total: expTotal, paid: expPaid, upcoming: expTotal - expPaid, count: expenseRows.length },
    net: totalEarnings - expTotal,
    billsCoveredPct: expTotal > 0 ? totalEarnings / expTotal : totalEarnings > 0 ? 1 : 0,
    netWorth: { assets, liabilities, total: assets - liabilities },
  };
}

// ---- Settings ----
export async function updateSettings(
  userId: string,
  input: { ftpPhase?: FtpPhase; ftpDivisor?: number; ftpPayoutPct?: number },
): Promise<FinanceOverview> {
  await ensureSettings(userId);
  const patch: Partial<typeof financeSettings.$inferInsert> = { updatedAt: new Date() };
  if (input.ftpPhase != null && (FTP_PHASES as readonly string[]).includes(input.ftpPhase)) patch.ftpPhase = input.ftpPhase;
  if (input.ftpDivisor != null && Number.isFinite(input.ftpDivisor) && input.ftpDivisor > 0) patch.ftpDivisor = input.ftpDivisor;
  if (input.ftpPayoutPct != null && Number.isFinite(input.ftpPayoutPct)) patch.ftpPayoutBp = Math.round(input.ftpPayoutPct * 100);
  await db.update(financeSettings).set(patch).where(eq(financeSettings.userId, userId));
  return getOverview(userId);
}

// ---- Expenses ----
export interface Expense {
  id: string;
  label: string;
  amount: number;
  dayOfMonth: number;
  category: string | null;
  active: boolean;
}

function toExpense(r: FinanceExpenseRow): Expense {
  return { id: r.id, label: r.label, amount: r.amount, dayOfMonth: r.dayOfMonth, category: r.category, active: r.active };
}

export async function listExpenses(userId: string): Promise<Expense[]> {
  const rows = await db.select().from(financeExpenses).where(eq(financeExpenses.userId, userId));
  return [...rows].sort((a, b) => a.dayOfMonth - b.dayOfMonth || a.label.localeCompare(b.label)).map(toExpense);
}

function clampDay(d: number): number {
  if (!Number.isFinite(d)) return 1;
  return Math.min(31, Math.max(1, Math.round(d)));
}

export async function addExpense(
  userId: string,
  input: { label: string; amount: number; dayOfMonth: number; category?: string | null },
): Promise<Expense[]> {
  const label = input.label.trim();
  if (!label) throw new Error('A label is required');
  const now = new Date();
  await db.insert(financeExpenses).values({
    id: crypto.randomUUID(),
    userId,
    label: label.slice(0, 80),
    amount: Number.isFinite(input.amount) ? Math.max(0, input.amount) : 0,
    dayOfMonth: clampDay(input.dayOfMonth),
    category: input.category?.trim() ? input.category.trim().slice(0, 40) : null,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  return listExpenses(userId);
}

export async function updateExpense(
  userId: string,
  id: string,
  input: { label?: string; amount?: number; dayOfMonth?: number; category?: string | null; active?: boolean },
): Promise<Expense[]> {
  const patch: Partial<typeof financeExpenses.$inferInsert> = { updatedAt: new Date() };
  if (input.label != null) {
    const l = input.label.trim();
    if (!l) throw new Error('A label is required');
    patch.label = l.slice(0, 80);
  }
  if (input.amount != null && Number.isFinite(input.amount)) patch.amount = Math.max(0, input.amount);
  if (input.dayOfMonth != null) patch.dayOfMonth = clampDay(input.dayOfMonth);
  if (input.category !== undefined) patch.category = input.category?.trim() ? input.category.trim().slice(0, 40) : null;
  if (input.active != null) patch.active = input.active;
  await db.update(financeExpenses).set(patch).where(and(eq(financeExpenses.id, id), eq(financeExpenses.userId, userId)));
  return listExpenses(userId);
}

export async function removeExpense(userId: string, id: string): Promise<Expense[]> {
  await db.delete(financeExpenses).where(and(eq(financeExpenses.id, id), eq(financeExpenses.userId, userId)));
  return listExpenses(userId);
}

// ---- Net worth ----
export interface NetWorthItem {
  id: string;
  label: string;
  amount: number;
  kind: NetWorthKind;
}
export interface NetWorthData {
  items: NetWorthItem[];
  assets: number;
  liabilities: number;
  total: number;
}

function toNw(r: FinanceNetWorthRow): NetWorthItem {
  return { id: r.id, label: r.label, amount: r.amount, kind: r.kind };
}

export async function getNetWorth(userId: string): Promise<NetWorthData> {
  const rows = await db.select().from(financeNetWorth).where(eq(financeNetWorth.userId, userId));
  let assets = 0;
  let liabilities = 0;
  for (const r of rows) {
    if (r.kind === 'liability') liabilities += r.amount;
    else assets += r.amount;
  }
  const items = [...rows].sort((a, b) => a.kind.localeCompare(b.kind) || b.amount - a.amount).map(toNw);
  return { items, assets, liabilities, total: assets - liabilities };
}

function isKind(v: unknown): v is NetWorthKind {
  return typeof v === 'string' && (NET_WORTH_KINDS as readonly string[]).includes(v);
}

export async function addNetWorth(
  userId: string,
  input: { label: string; amount: number; kind: NetWorthKind },
): Promise<NetWorthData> {
  const label = input.label.trim();
  if (!label) throw new Error('A label is required');
  const now = new Date();
  await db.insert(financeNetWorth).values({
    id: crypto.randomUUID(),
    userId,
    label: label.slice(0, 80),
    amount: Number.isFinite(input.amount) ? Math.abs(input.amount) : 0,
    kind: isKind(input.kind) ? input.kind : 'asset',
    createdAt: now,
    updatedAt: now,
  });
  return getNetWorth(userId);
}

export async function updateNetWorth(
  userId: string,
  id: string,
  input: { label?: string; amount?: number; kind?: NetWorthKind },
): Promise<NetWorthData> {
  const patch: Partial<typeof financeNetWorth.$inferInsert> = { updatedAt: new Date() };
  if (input.label != null) {
    const l = input.label.trim();
    if (!l) throw new Error('A label is required');
    patch.label = l.slice(0, 80);
  }
  if (input.amount != null && Number.isFinite(input.amount)) patch.amount = Math.abs(input.amount);
  if (input.kind != null && isKind(input.kind)) patch.kind = input.kind;
  await db.update(financeNetWorth).set(patch).where(and(eq(financeNetWorth.id, id), eq(financeNetWorth.userId, userId)));
  return getNetWorth(userId);
}

export async function removeNetWorth(userId: string, id: string): Promise<NetWorthData> {
  await db.delete(financeNetWorth).where(and(eq(financeNetWorth.id, id), eq(financeNetWorth.userId, userId)));
  return getNetWorth(userId);
}
