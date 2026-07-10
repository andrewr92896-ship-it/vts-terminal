import crypto from 'node:crypto';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  fundedAccounts,
  fundedTrades,
  users,
  TRADE_SIDES,
  type FundedAccountRow,
  type FundedTradeRow,
  type FundedTradeStatus,
  type TradeSide,
} from '../db/schema.js';
import { canAccessWorkspace, parseRoles } from '../auth/rbac.js';
import { DEMO_USERNAME } from '../demo/identity.js';
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
  status: FundedTradeStatus;
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
  status?: FundedTradeStatus;
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

// A stable fingerprint that decides whether a screenshot trade is a duplicate.
// A trade is identified by its TIME and PROFIT (per the desk's rule): the close
// time (to the minute, falling back to the open time) plus the realized P/L. So
// re-posting the same screenshot — even if prices/size OCR slightly differently —
// won't double-log. When neither a time nor a profit is readable, we fall back to
// the instrument + prices so a re-paste of that row still dedupes best-effort.
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
  // An open position (no exit, no realized P/L) is identified by its instrument,
  // side and fill price — not its time — so re-posting the same active-trade
  // screenshot doesn't stack a second live position on the wall.
  if (t.exitPrice == null && t.realizedPl == null) {
    const basis = `op|${t.instrument.toUpperCase()}|${t.side}|${r(t.entryPrice)}`;
    return crypto.createHash('sha256').update(basis).digest('hex').slice(0, 32);
  }
  const timeMs = t.closedAt ?? t.openedAt;
  let basis: string;
  if (timeMs != null && t.realizedPl != null) {
    // Time + profit — the primary dedupe. Minute granularity tolerates seconds
    // that a screenshot may not show.
    basis = `tp|${Math.floor(timeMs / 60_000)}|${t.realizedPl.toFixed(2)}`;
  } else {
    basis = `fb|${t.instrument.toUpperCase()}|${r(t.entryPrice)}|${r(t.exitPrice)}|${r(t.realizedPl, 2)}|${timeMs ?? ''}`;
  }
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
    status: row.status,
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
  const status: FundedTradeStatus = input.status === 'open' ? 'open' : 'closed';
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
      status,
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

// Pick the result row from a closed-trade screenshot that finalizes a given open
// position. Prefer a row whose instrument matches; otherwise take the first row
// carrying a P/L or exit price. Rows with neither aren't usable outcomes.
function pickResultRow(
  candidates: ParsedHistoryTrade[],
  instrument: string,
): { exitPrice: number | null; realizedPl: number | null; closedAt: number | null; units: number | null } | null {
  const usable = candidates.filter((c) => c.realizedPl != null || c.exitPrice != null);
  if (usable.length === 0) return null;
  const want = instrument.trim().toUpperCase();
  const match = usable.find((c) => (c.instrument ?? '').trim().toUpperCase() === want) ?? usable[0];
  return {
    exitPrice: cleanNum(match.exitPrice),
    realizedPl: cleanNum(match.realizedPl),
    closedAt: parseLooseDate(match.closedAt),
    units: cleanNum(match.units),
  };
}

// Finalize an OPEN funded position from a trade-result screenshot: stamp the exit
// price, realized P/L and close time, and flip the trade to 'closed' so it drops
// off the Live Wall and lands in the account's logged P/L and history. Returns
// closed:false (with data untouched) when no usable outcome could be read, so the
// caller can tell the trader to try a clearer screenshot.
export async function closeFundedTrade(
  userId: string,
  tradeId: string,
  candidates: ParsedHistoryTrade[],
): Promise<{
  data: FundedData;
  closed: boolean;
  result: { exitPrice: number | null; realizedPl: number | null; closedAt: number | null } | null;
}> {
  const existing = (
    await db
      .select()
      .from(fundedTrades)
      .where(and(eq(fundedTrades.id, tradeId), eq(fundedTrades.userId, userId)))
      .limit(1)
  )[0];
  if (!existing) throw new Error('Trade not found');

  const picked = pickResultRow(candidates, existing.instrument);
  if (!picked) return { data: await getFunded(userId), closed: false, result: null };

  const closedAt = picked.closedAt ?? Date.now();
  const units = picked.units ?? existing.units;
  const side: TradeSide = isSide(existing.side) ? existing.side : 'long';
  // Recompute the dedupe fingerprint now that the trade carries an exit/P/L, so a
  // later history import of this same closed trade doesn't double-log it.
  const dedupKey = dedupKeyOf({
    instrument: existing.instrument,
    side,
    units,
    entryPrice: existing.entryPrice,
    exitPrice: picked.exitPrice,
    realizedPl: picked.realizedPl,
    openedAt: existing.openedAt ? existing.openedAt.getTime() : null,
    closedAt,
  });
  await db
    .update(fundedTrades)
    .set({
      units,
      exitPrice: picked.exitPrice,
      realizedPl: picked.realizedPl,
      status: 'closed',
      closedAt: new Date(closedAt),
      dedupKey,
    })
    .where(and(eq(fundedTrades.id, tradeId), eq(fundedTrades.userId, userId)));
  return {
    data: await getFunded(userId),
    closed: true,
    result: { exitPrice: picked.exitPrice, realizedPl: picked.realizedPl, closedAt },
  };
}

// A still-open funded position, tagged with the trader who owns it, for the Live
// Wall. These are prop-account positions (no broker API): the wall marks them
// against the desk's OANDA price. They never touch tradingPositions, so they
// stay off the Trade Log, History, and Live Brokers capital by construction.
export interface FundedOpenPosition {
  id: string;
  userId: string;
  owner: string; // that trader's username
  platform: string; // e.g. "FTP"
  accountLabel: string;
  instrument: string;
  side: TradeSide;
  units: number;
  entryPrice: number;
  openedAt: number | null;
}

// Every open funded position across the trading desk (owner-tagged), for the
// shared Live Wall. Demo and non-trading users are excluded, mirroring the wall.
export async function getDeskFundedOpenPositions(): Promise<FundedOpenPosition[]> {
  const rows = await db
    .select({ t: fundedTrades, acct: fundedAccounts, username: users.username, roles: users.roles })
    .from(fundedTrades)
    .innerJoin(fundedAccounts, eq(fundedAccounts.id, fundedTrades.accountId))
    .innerJoin(users, eq(users.id, fundedTrades.userId))
    .where(and(eq(fundedTrades.status, 'open'), isNull(fundedTrades.exitPrice)));
  const out: FundedOpenPosition[] = [];
  for (const r of rows) {
    if (r.username === DEMO_USERNAME) continue;
    if (!canAccessWorkspace(parseRoles({ roles: r.roles }), 'trading')) continue;
    if (r.t.entryPrice == null) continue; // need a fill price to mark it
    out.push({
      id: r.t.id,
      userId: r.t.userId,
      owner: r.username,
      platform: r.acct.platform,
      accountLabel: r.acct.label,
      instrument: r.t.instrument,
      side: isSide(r.t.side) ? r.t.side : 'long',
      units: r.t.units,
      entryPrice: r.t.entryPrice,
      openedAt: r.t.openedAt ? r.t.openedAt.getTime() : null,
    });
  }
  return out;
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
  newBalance?: number | null,
): Promise<{ data: FundedData; added: number; skipped: number; ignored: number; balanceSet: number | null }> {
  if (!(await ownsAccount(userId, accountId))) throw new Error('Account not found');
  let added = 0;
  let skipped = 0;
  let ignored = 0;

  // When the screenshot also shows the account equity/balance, set it — the desk
  // now keeps funded equity from the same screenshots as the trades.
  const balanceSet = cleanNum(newBalance);
  if (balanceSet != null) {
    await db
      .update(fundedAccounts)
      .set({ balance: balanceSet, updatedAt: new Date() })
      .where(and(eq(fundedAccounts.id, accountId), eq(fundedAccounts.userId, userId)));
  }
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
  return { data: await getFunded(userId), added, skipped, ignored, balanceSet };
}
