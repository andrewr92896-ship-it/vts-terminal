import crypto from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
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
import { visibleTraderIdsForUser } from './scope.js';
import { resolveTilePalette } from './tileColors.js';

// Funded platforms (FTP and other prop accounts) are tracked separately from the
// Live Wall / Trade Log: they have no usable API, so the trader keeps the balance
// current by hand and logs trades from screenshots Claude parses.
//
// **Read by the desk, written by the owner.** A read resolves through
// visibleTraderIds — the whole team on a desk holding the Trading Teams grant,
// the caller alone for everybody else — while every write still matches the
// account or trade against the caller's own id. So a teammate's funded account
// appears on the screen and no code path can edit it.

export interface FundedTradeView {
  id: string;
  accountId: string;
  instrument: string;
  side: TradeSide;
  units: number;
  entryPrice: number | null;
  exitPrice: number | null;
  realizedPl: number | null;
  // The stop and target held at the prop firm. Null means none is known of.
  stopLoss: number | null;
  takeProfit: number | null;
  status: FundedTradeStatus;
  openedAt: number | null;
  closedAt: number | null;
  notes: string | null;
  createdAt: number;
}

export interface FundedAccountView {
  id: string;
  // Who the account belongs to. A desk reads each other's funded books (see
  // getFunded), so every account says whose it is and whether the viewer may
  // act on it.
  ownerId: string;
  owner: string; // the owning trader's display name
  isMine: boolean;
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
  // The colour funded tiles are washed in, so the live positions listed here
  // read the same as the ones on the Live Wall rather than being the one place
  // the group's choice does not apply. Every position in this payload is funded
  // by definition, so it is one colour for the screen rather than one per row.
  fundedTileColor: string | null;
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
  stopLoss?: number | null;
  takeProfit?: number | null;
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
    stopLoss: row.stopLoss,
    takeProfit: row.takeProfit,
    status: row.status,
    openedAt: row.openedAt ? row.openedAt.getTime() : null,
    closedAt: row.closedAt ? row.closedAt.getTime() : null,
    notes: row.notes,
    createdAt: row.createdAt.getTime(),
  };
}

function toAccountView(
  row: FundedAccountRow,
  trades: FundedTradeView[],
  now: number,
  viewerId: string,
  owner: string,
): FundedAccountView {
  const realizedPl = trades.reduce((sum, t) => sum + (t.realizedPl ?? 0), 0);
  // Window P/L keyed off when each trade closed (fall back to its open time, then
  // the time it was logged), counting only trades that carry a realized P/L.
  const windowed = trades
    .filter((t) => t.realizedPl != null)
    .map((t) => ({ ms: t.closedAt ?? t.openedAt ?? t.createdAt, pl: t.realizedPl as number }));
  return {
    id: row.id,
    ownerId: row.userId,
    owner,
    isMine: row.userId === viewerId,
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

// The funded book the caller may SEE: their own accounts, and their teammates'
// when the account holds the Trading Teams grant — which is what makes a desk's
// funded accounts shared. Self-only for everybody else, by construction rather
// than by a filter somebody has to remember to write.
//
// Every write in this file still resolves ownership from the caller's own id, so
// widening the read widens nothing else: a teammate's account is watch-only
// because no write path can reach it, not because the UI hides a button.
//
// Takes a userId rather than a viewer because every write path here is handed
// the owner and answers with the refreshed book — see visibleTraderIdsForUser.
export async function getFunded(userId: string): Promise<FundedData> {
  const scope = [...(await visibleTraderIdsForUser(userId))];
  const accounts = await db
    .select({ acct: fundedAccounts, username: users.username, displayName: users.displayName })
    .from(fundedAccounts)
    .innerJoin(users, eq(users.id, fundedAccounts.userId))
    .where(inArray(fundedAccounts.userId, scope))
    .orderBy(asc(fundedAccounts.createdAt));
  const trades = await db
    .select()
    .from(fundedTrades)
    .where(inArray(fundedTrades.userId, scope))
    .orderBy(desc(fundedTrades.closedAt), desc(fundedTrades.createdAt));
  const byAccount = new Map<string, FundedTradeView[]>();
  for (const t of trades) {
    const list = byAccount.get(t.accountId) ?? [];
    list.push(toTradeView(t));
    byAccount.set(t.accountId, list);
  }
  const now = Date.now();
  const palette = await resolveTilePalette(userId);
  return {
    accounts: accounts
      .map((r) =>
        toAccountView(r.acct, byAccount.get(r.acct.id) ?? [], now, userId, r.displayName || r.username),
      )
      // The viewer's own first — they are the ones they act on.
      .sort((a, b) => Number(b.isMine) - Number(a.isMine)),
    fundedTileColor: palette.funded,
  };
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

// Remove one of the caller's own funded accounts. Refused rather than silently
// matching nothing when the account is a teammate's — same reason as
// removeFundedTrade below: the desk can see each other's books now.
export async function removeFundedAccount(userId: string, id: string): Promise<FundedData> {
  if (!(await ownsAccount(userId, id))) throw new Error('Account not found');
  await db.delete(fundedAccounts).where(eq(fundedAccounts.id, id));
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
  const stopLoss = cleanNum(input.stopLoss);
  const takeProfit = cleanNum(input.takeProfit);
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
  const insert = db
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
      stopLoss,
      takeProfit,
      status,
      openedAt: fields.openedAt != null ? new Date(fields.openedAt) : null,
      closedAt: fields.closedAt != null ? new Date(fields.closedAt) : null,
      dedupKey: dedupKeyOf(fields),
      notes: cleanText(input.notes, 2000),
      createdAt: new Date(),
    });
  // An OPEN position dedupes on instrument + side + fill price and NOT on time,
  // so re-pasting a screenshot of a trade already on the wall is the same row.
  // Doing nothing there was right when the row held nothing that could change;
  // now that it carries the stop and target it is wrong — moving a stop at the
  // prop firm and re-pasting has to reach the desk, and it was the only remedy
  // for a position imported before this column existed. Only the protective
  // levels are refreshed: the fill, size and open time are what identify the
  // position, so a re-paste must not quietly rewrite those.
  //
  // A screenshot with no stop visible therefore CLEARS a stop read earlier, and
  // that is the right direction rather than a gap: the picture is the source of
  // truth for what the firm is holding, and erring towards "none" under-claims
  // protection where the alternative would draw a stop that may not exist.
  //
  // A CLOSED trade keeps do-nothing. Those dedupe on time + profit and re-posting
  // a history batch must never rewrite what was already logged.
  await (status === 'open'
    ? insert.onConflictDoUpdate({
        target: [fundedTrades.accountId, fundedTrades.dedupKey],
        set: { stopLoss, takeProfit },
      })
    : insert.onConflictDoNothing());
  return getFunded(userId);
}

// Set the stop and target on a funded position by hand.
//
// The screenshot import is the usual way these arrive, and re-pasting refreshes
// them — but a parser that misreads a level, or a platform that shows it
// somewhere the picture does not reach, otherwise leaves the trader with no
// remedy but deleting the position and importing it again. That is a bad trade
// for a record that is only ever a note about what the prop firm is holding.
//
// Deliberately protection-only. Everything else about a funded position — the
// fill, the size, the side, the open time — is what identifies it, and the
// dedupe key is built from three of those; letting them be typed over would
// detach the row from the screenshot it came from and quietly break the
// re-paste path. Correcting one of those is still a delete and re-import.
//
// `undefined` leaves a level alone, `null` clears it. So a caller changing only
// the stop cannot blank the target by omission.
export async function setFundedTradeProtection(
  userId: string,
  tradeId: string,
  patch: { stopLoss?: number | null; takeProfit?: number | null },
): Promise<FundedData> {
  const row = (
    await db
      .select()
      .from(fundedTrades)
      .where(and(eq(fundedTrades.id, tradeId), eq(fundedTrades.userId, userId)))
      .limit(1)
  )[0];
  if (!row) throw new Error('Trade not found');

  const set: Partial<typeof fundedTrades.$inferInsert> = {};
  if (patch.stopLoss !== undefined) set.stopLoss = cleanNum(patch.stopLoss);
  if (patch.takeProfit !== undefined) set.takeProfit = cleanNum(patch.takeProfit);
  if (Object.keys(set).length === 0) return getFunded(userId);

  await db
    .update(fundedTrades)
    .set(set)
    .where(and(eq(fundedTrades.id, tradeId), eq(fundedTrades.userId, userId)));
  return getFunded(userId);
}

// Remove one of the caller's own funded trades.
//
// The owner check is a lookup rather than a bare `WHERE user_id = ?` on the
// delete, so a trade belonging to somebody else is REFUSED instead of quietly
// matching nothing. That distinction did not exist while the book was
// self-only — a teammate could never learn an id to aim at — but the desk now
// reads each other's funded books, so a delete that reports success while
// deleting nothing is a lie the client would faithfully repeat.
export async function removeFundedTrade(userId: string, tradeId: string): Promise<FundedData> {
  const row = (
    await db
      .select({ id: fundedTrades.id })
      .from(fundedTrades)
      .where(and(eq(fundedTrades.id, tradeId), eq(fundedTrades.userId, userId)))
      .limit(1)
  )[0];
  if (!row) throw new Error('Trade not found');
  await db.delete(fundedTrades).where(eq(fundedTrades.id, tradeId));
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
  stopLoss: number | null;
  takeProfit: number | null;
  openedAt: number | null;
}

// Open funded positions (owner-tagged) for the Live Wall, restricted to the
// viewer's team via `scopeIds`. Demo and non-trading users are excluded,
// mirroring the wall.
export async function getDeskFundedOpenPositions(scopeIds: Set<string>): Promise<FundedOpenPosition[]> {
  const rows = await db
    .select({ t: fundedTrades, acct: fundedAccounts, username: users.username, roles: users.roles })
    .from(fundedTrades)
    .innerJoin(fundedAccounts, eq(fundedAccounts.id, fundedTrades.accountId))
    .innerJoin(users, eq(users.id, fundedTrades.userId))
    .where(and(eq(fundedTrades.status, 'open'), isNull(fundedTrades.exitPrice)));
  const out: FundedOpenPosition[] = [];
  for (const r of rows) {
    if (!scopeIds.has(r.t.userId)) continue; // only the viewer's team
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
      stopLoss: r.t.stopLoss,
      takeProfit: r.t.takeProfit,
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
