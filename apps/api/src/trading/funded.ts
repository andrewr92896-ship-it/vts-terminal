import crypto from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  fundedAccounts,
  fundedTrades,
  TRADE_SIDES,
  type FundedAccountRow,
  type FundedTradeRow,
  type TradeSide,
} from '../db/schema.js';
import type { ParsedHistoryTrade } from '../ai/claude.js';
import { pnlWindows, type PnlWindows } from './pnl.js';

// Funded platforms (FTP and other prop accounts) are tracked separately from the
// Live Wall / Trade Log: they have no usable API, so the trader keeps the balance
// current by hand and logs trades from screenshots Claude parses. Everything here
// is owner-scoped (userId) so one trader never touches another's funded data.

export interface FundedTradeView {
  id: string;
  accountId: string;
  instrument: string;
  side: TradeSide;
  units: number;
  entryPrice: number | null;
  exitPrice: number | null;
  realizedPl: number | null;
  openedAt: number | null;
  closedAt: number | null;
  notes: string | null;
  createdAt: number;
}

export interface FundedAccountView {
  id: string;
  platform: string;
  label: string;
  currency: string;
  balance: number | null;
  startingBalance: number | null;
  notes: string | null;
  // Derived: realized P/L summed across this account's logged trades.
  realizedPl: number;
  tradeCount: number;
  // Capital gained from trades over rolling windows (today ET / 7d / 30d), built
  // from logged trade P/L only — so editing the balance / adding money never
  // counts as a gain.
  pnl: PnlWindows;
  trades: FundedTradeView[];
  createdAt: number;
  updatedAt: number;
}

export interface FundedData {
  accounts: FundedAccountView[];
}

export interface FundedAccountInput {
  platform?: string;
  label: string;
  currency?: string;
  balance?: number | null;
  startingBalance?: number | null;
  notes?: string | null;
}

export interface FundedTradeInput {
  instrument: string;
  side?: TradeSide;
  units?: number | null;
  entryPrice?: number | null;
  exitPrice?: number | null;
  realizedPl?: number | null;
  openedAt?: number | null;
  closedAt?: number | null;
  notes?: string | null;
}

function isSide(v: unknown): v is TradeSide {
  return typeof v === 'string' && (TRADE_SIDES as readonly string[]).includes(v);
}
function cleanNum(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return v;
}
function cleanText(v: string | null | undefined, max: number): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

// A stable fingerprint of a trade's identifying fields, so re-posting the same
// screenshot does not double-log a trade. Prices are rounded to keep tiny OCR
// jitter from defeating the dedupe; the open/close day is used rather than the
// exact timestamp for the same reason.
function dedupKeyOf(t: {
  instrument: string;
  side: TradeSide;
  units: number;
  entryPrice: number | null;
  exitPrice: number | null;
  realizedPl: number | null;
  openedAt: number | null;
  closedAt: number | null;
}): string {
  const r = (n: number | null, dp = 5) => (n == null ? '' : n.toFixed(dp));
  const day = (ms: number | null) => (ms == null ? '' : Math.floor(ms / 86_400_000));
  const basis = [
    t.instrument.toUpperCase(),
    t.side,
    r(t.units, 4),
    r(t.entryPrice),
    r(t.exitPrice),
    r(t.realizedPl, 2),
    day(t.openedAt),
    day(t.closedAt),
  ].join('|');
  return crypto.createHash('sha256').update(basis).digest('hex').slice(0, 32);
}

function toTradeView(row: FundedTradeRow): FundedTradeView {
  return {
    id: row.id,
    accountId: row.accountId,
    instrument: row.instrument,
    side: isSide(row.side) ? row.side : 'long',
    units: row.units,
    entryPrice: row.entryPrice,
    exitPrice: row.exitPrice,
    realizedPl: row.realizedPl,
    openedAt: row.openedAt ? row.openedAt.getTime() : null,
    closedAt: row.closedAt ? row.closedAt.getTime() : null,
    notes: row.notes,
    createdAt: row.createdAt.getTime(),
  };
}

function toAccountView(row: FundedAccountRow, trades: FundedTradeView[], now: number): FundedAccountView {
  const realizedPl = trades.reduce((sum, t) => sum + (t.realizedPl ?? 0), 0);
  // Window P/L keyed off when each trade closed (fall back to its open time, then
  // the time it was logged), counting only trades that carry a realized P/L.
  const windowed = trades
    .filter((t) => t.realizedPl != null)
    .map((t) => ({ ms: t.closedAt ?? t.openedAt ?? t.createdAt, pl: t.realizedPl as number }));
  return {
    id: row.id,
    platform: row.platform,
    label: row.label,
    currency: row.currency,
    balance: row.balance,
    startingBalance: row.startingBalance,
    notes: row.notes,
    realizedPl: Number(realizedPl.toFixed(2)),
    tradeCount: trades.length,
    pnl: pnlWindows(windowed, now),
    trades,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

export async function getFunded(userId: string): Promise<FundedData> {
  const accounts = await db
    .select()
    .from(fundedAccounts)
    .where(eq(fundedAccounts.userId, userId))
    .orderBy(asc(fundedAccounts.createdAt));
  const trades = await db
    .select()
    .from(fundedTrades)
    .where(eq(fundedTrades.userId, userId))
    .orderBy(desc(fundedTrades.closedAt), desc(fundedTrades.createdAt));
  const byAccount = new Map<string, FundedTradeView[]>();
  for (const t of trades) {
    const list = byAccount.get(t.accountId) ?? [];
    list.push(toTradeView(t));
    byAccount.set(t.accountId, list);
  }
  const now = Date.now();
  return { accounts: accounts.map((a) => toAccountView(a, byAccount.get(a.id) ?? [], now)) };
}

export async function addFundedAccount(userId: string, input: FundedAccountInput): Promise<FundedData> {
  const label = input.label.trim();
  if (!label) throw new Error('An account name is required');
  const now = new Date();
  await db.insert(fundedAccounts).values({
    id: crypto.randomUUID(),
    userId,
    platform: cleanText(input.platform, 40) ?? 'FTP',
    label: label.slice(0, 80),
    currency: (cleanText(input.currency, 8) ?? 'USD').toUpperCase(),
    balance: cleanNum(input.balance),
    startingBalance: cleanNum(input.startingBalance),
    notes: cleanText(input.notes, 2000),
    createdAt: now,
    updatedAt: now,
  });
  return getFunded(userId);
}

export async function updateFundedAccount(
  userId: string,
  id: string,
  input: Partial<FundedAccountInput>,
): Promise<FundedData> {
  const existing = (
    await db
      .select()
      .from(fundedAccounts)
      .where(and(eq(fundedAccounts.id, id), eq(fundedAccounts.userId, userId)))
      .limit(1)
  )[0];
  if (!existing) throw new Error('Account not found');
  const patch: Partial<typeof fundedAccounts.$inferInsert> = { updatedAt: new Date() };
  if (input.platform !== undefined) patch.platform = cleanText(input.platform, 40) ?? 'FTP';
  if (input.label !== undefined) {
    const l = input.label.trim();
    if (!l) throw new Error('An account name is required');
    patch.label = l.slice(0, 80);
  }
  if (input.currency !== undefined) patch.currency = (cleanText(input.currency, 8) ?? 'USD').toUpperCase();
  if (input.balance !== undefined) patch.balance = cleanNum(input.balance);
  if (input.startingBalance !== undefined) patch.startingBalance = cleanNum(input.startingBalance);
  if (input.notes !== undefined) patch.notes = cleanText(input.notes, 2000);
  await db
    .update(fundedAccounts)
    .set(patch)
    .where(and(eq(fundedAccounts.id, id), eq(fundedAccounts.userId, userId)));
  return getFunded(userId);
}

export async function removeFundedAccount(userId: string, id: string): Promise<FundedData> {
  await db
    .delete(fundedAccounts)
    .where(and(eq(fundedAccounts.id, id), eq(fundedAccounts.userId, userId)));
  return getFunded(userId);
}

// Confirm an account belongs to the caller (used before touching its trades).
async function ownsAccount(userId: string, accountId: string): Promise<boolean> {
  const row = (
    await db
      .select({ id: fundedAccounts.id })
      .from(fundedAccounts)
      .where(and(eq(fundedAccounts.id, accountId), eq(fundedAccounts.userId, userId)))
      .limit(1)
  )[0];
  return !!row;
}

export async function addFundedTrade(
  userId: string,
  accountId: string,
  input: FundedTradeInput,
): Promise<FundedData> {
  if (!(await ownsAccount(userId, accountId))) throw new Error('Account not found');
  const instrument = input.instrument.trim();
  if (!instrument) throw new Error('Instrument is required');
  const side: TradeSide = isSide(input.side) ? input.side : 'long';
  const units = cleanNum(input.units) ?? 0;
  const fields = {
    instrument: instrument.slice(0, 40),
    side,
    units,
    entryPrice: cleanNum(input.entryPrice),
    exitPrice: cleanNum(input.exitPrice),
    realizedPl: cleanNum(input.realizedPl),
    openedAt: cleanNum(input.openedAt),
    closedAt: cleanNum(input.closedAt),
  };
  await db
    .insert(fundedTrades)
    .values({
      id: crypto.randomUUID(),
      userId,
      accountId,
      instrument: fields.instrument,
      side,
      units,
      entryPrice: fields.entryPrice,
      exitPrice: fields.exitPrice,
      realizedPl: fields.realizedPl,
      openedAt: fields.openedAt != null ? new Date(fields.openedAt) : null,
      closedAt: fields.closedAt != null ? new Date(fields.closedAt) : null,
      dedupKey: dedupKeyOf(fields),
      notes: cleanText(input.notes, 2000),
      createdAt: new Date(),
    })
    .onConflictDoNothing();
  return getFunded(userId);
}

export async function removeFundedTrade(userId: string, tradeId: string): Promise<FundedData> {
  await db
    .delete(fundedTrades)
    .where(and(eq(fundedTrades.id, tradeId), eq(fundedTrades.userId, userId)));
  return getFunded(userId);
}

// Lenient date parse for the date/time strings Claude reads off a screenshot.
function parseLooseDate(v: string | null): number | null {
  if (!v) return null;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : ms;
}

// Import a batch of screenshot-parsed trades, skipping ones that already exist
// on the account (same dedupe fingerprint). Returns how many were added vs.
// skipped so the UI can confirm "3 added, 2 duplicates skipped".
export async function importFundedTrades(
  userId: string,
  accountId: string,
  parsed: ParsedHistoryTrade[],
): Promise<{ data: FundedData; added: number; skipped: number; ignored: number }> {
  if (!(await ownsAccount(userId, accountId))) throw new Error('Account not found');
  let added = 0;
  let skipped = 0;
  let ignored = 0;
  // What's already on the account, so duplicates inside one screenshot — and
  // against prior imports — are both caught.
  const existing = await db
    .select({ dedupKey: fundedTrades.dedupKey })
    .from(fundedTrades)
    .where(eq(fundedTrades.accountId, accountId));
  const seen = new Set(existing.map((r) => r.dedupKey));

  for (const t of parsed) {
    const instrument = (t.instrument ?? '').trim();
    // A row needs at least an instrument and some P/L or exit to be a real trade.
    if (!instrument || (t.realizedPl == null && t.exitPrice == null)) {
      ignored += 1;
      continue;
    }
    const fields = {
      instrument: instrument.slice(0, 40),
      side: (t.side === 'short' ? 'short' : 'long') as TradeSide,
      units: cleanNum(t.units) ?? 0,
      entryPrice: cleanNum(t.entryPrice),
      exitPrice: cleanNum(t.exitPrice),
      realizedPl: cleanNum(t.realizedPl),
      openedAt: parseLooseDate(t.openedAt),
      closedAt: parseLooseDate(t.closedAt),
    };
    const key = dedupKeyOf(fields);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    await db
      .insert(fundedTrades)
      .values({
        id: crypto.randomUUID(),
        userId,
        accountId,
        instrument: fields.instrument,
        side: fields.side,
        units: fields.units,
        entryPrice: fields.entryPrice,
        exitPrice: fields.exitPrice,
        realizedPl: fields.realizedPl,
        openedAt: fields.openedAt != null ? new Date(fields.openedAt) : null,
        closedAt: fields.closedAt != null ? new Date(fields.closedAt) : null,
        dedupKey: key,
        notes: null,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
    added += 1;
  }
  return { data: await getFunded(userId), added, skipped, ignored };
}
