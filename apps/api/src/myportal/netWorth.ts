import crypto from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  netWorthItems,
  netWorthSnapshots,
  type NetWorthCategory,
  type NetWorthItemRow,
  type NetWorthKind,
  type UserRow,
} from '../db/schema.js';
import { etToday } from '../investments/service.js';
import { getMyHoldings } from './holdings.js';

// My Terminal ▸ Net Worth — everything you own minus everything you owe.
//
// The number this screen exists to produce is the easiest one in the terminal to
// quietly get wrong, and there are three distinct ways to do it. All three are
// designed against here rather than checked for afterwards:
//
//   1. DOUBLE COUNTING. The investment portfolio and the trading account are
//      already tracked, and they are pulled in live — so there is deliberately
//      no category for "brokerage" or "investments" among the hand-entered
//      assets. Offering one would invite somebody to type in the largest number
//      on the screen a second time, and nothing could detect that afterwards.
//   2. TWO SOURCES OF TRUTH. The tracked halves are read through getMyHoldings,
//      the same function the Investment Holdings screen uses, rather than
//      recomputed here. Two definitions of "what my portfolio is worth" that
//      drift apart would show two different totals on two screens, and there
//      would be no way to say which was right.
//   3. A CONFIDENT TOTAL BUILT ON A GAP. When the tracked side cannot be
//      totalled — a broker that would not answer, an account in another
//      currency — this reports no net worth at all rather than one that silently
//      omits part of it. A net worth missing a chunk is worse than none, because
//      it looks complete.

export class NetWorthError extends Error {}

export interface NetWorthItemView {
  id: string;
  kind: NetWorthKind;
  category: NetWorthCategory;
  label: string;
  value: number;
  note: string | null;
  active: boolean;
  sortOrder: number;
  updatedAt: number;
}

export interface NetWorthTracked {
  /** The long-term Investments portfolio. */
  investments: number;
  /** Trading account equity plus coins held outright. */
  trading: number;
  tradingEnabled: boolean;
  /** False when the tracked side could not be totalled; `note` says why. */
  available: boolean;
  note: string | null;
}

export interface NetWorthPoint {
  onDate: string;
  assets: number;
  liabilities: number;
  netWorth: number;
}

export interface NetWorthPayload {
  tracked: NetWorthTracked;
  assets: NetWorthItemView[];
  liabilities: NetWorthItemView[];
  totals: {
    /** Tracked value + hand-entered assets. */
    assets: number;
    liabilities: number;
    /** Null when the tracked side is incomplete — see rule 3 above. */
    netWorth: number | null;
    manualAssets: number;
  };
  history: NetWorthPoint[];
  /** Total days recorded, so the screen can explain a short series. */
  totalDays: number;
  asOf: number;
}

function toView(row: NetWorthItemRow): NetWorthItemView {
  return {
    id: row.id,
    kind: row.kind,
    category: row.category,
    label: row.label,
    value: row.value,
    note: row.note,
    active: row.active,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.getTime(),
  };
}

export async function listNetWorthItems(userId: string): Promise<NetWorthItemRow[]> {
  return db
    .select()
    .from(netWorthItems)
    .where(eq(netWorthItems.userId, userId))
    .orderBy(asc(netWorthItems.sortOrder), asc(netWorthItems.createdAt));
}

export interface NetWorthItemInput {
  kind: NetWorthKind;
  category: NetWorthCategory;
  label: string;
  value: number;
  note?: string | null;
  active?: boolean;
  sortOrder?: number;
}

export async function createNetWorthItem(userId: string, input: NetWorthItemInput): Promise<string> {
  const id = crypto.randomUUID();
  const at = new Date();
  await db.insert(netWorthItems).values({
    id,
    userId,
    kind: input.kind,
    category: input.category,
    label: input.label.trim(),
    // Always stored positive — `kind` carries the sign. See the schema comment.
    value: Math.abs(input.value),
    note: input.note?.trim() || null,
    active: input.active ?? true,
    sortOrder: input.sortOrder ?? 0,
    createdAt: at,
    updatedAt: at,
  });
  return id;
}

export async function updateNetWorthItem(
  userId: string,
  itemId: string,
  patch: Partial<NetWorthItemInput>,
): Promise<void> {
  const row = (
    await db
      .select()
      .from(netWorthItems)
      .where(and(eq(netWorthItems.id, itemId), eq(netWorthItems.userId, userId)))
      .limit(1)
  )[0];
  if (!row) throw new NetWorthError('That entry does not exist');

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.kind !== undefined) set.kind = patch.kind;
  if (patch.category !== undefined) set.category = patch.category;
  if (patch.label !== undefined) set.label = patch.label.trim();
  if (patch.value !== undefined) set.value = Math.abs(patch.value);
  if (patch.note !== undefined) set.note = patch.note?.trim() || null;
  if (patch.active !== undefined) set.active = patch.active;
  if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;
  await db.update(netWorthItems).set(set).where(eq(netWorthItems.id, itemId));
}

export async function removeNetWorthItem(userId: string, itemId: string): Promise<void> {
  const res = await db
    .delete(netWorthItems)
    .where(and(eq(netWorthItems.id, itemId), eq(netWorthItems.userId, userId)));
  if (res.rowsAffected === 0) throw new NetWorthError('That entry does not exist');
}

async function recordSnapshot(
  userId: string,
  assets: number,
  liabilities: number,
  netWorth: number,
): Promise<void> {
  await db
    .insert(netWorthSnapshots)
    .values({
      id: crypto.randomUUID(),
      userId,
      onDate: etToday(),
      assets,
      liabilities,
      netWorth,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      // The last reading of a day stands, matching investment_snapshots.
      target: [netWorthSnapshots.userId, netWorthSnapshots.onDate],
      set: { assets, liabilities, netWorth },
    });
}

export async function getNetWorth(
  user: UserRow,
  opts: { recordSnapshot?: boolean; historyDays?: number } = {},
): Promise<NetWorthPayload> {
  const [holdings, rows] = await Promise.all([getMyHoldings(user), listNetWorthItems(user.id)]);

  const tradingSide = (holdings.trading.accountValue ?? 0) + holdings.trading.spotValue;
  const tracked: NetWorthTracked = {
    investments: holdings.investments.value,
    trading: tradingSide,
    tradingEnabled: holdings.trading.enabled,
    // getMyHoldings already decided whether the two halves can honestly be
    // added; reuse that answer rather than re-deriving it and risking a
    // different verdict on this screen than on the last one.
    available: holdings.combinedValue != null,
    note: holdings.combinedNote,
  };

  const active = rows.filter((r) => r.active);
  const assetRows = active.filter((r) => r.kind === 'asset');
  const liabilityRows = active.filter((r) => r.kind === 'liability');
  const manualAssets = assetRows.reduce((s, r) => s + r.value, 0);
  const liabilities = liabilityRows.reduce((s, r) => s + r.value, 0);

  const trackedValue = holdings.combinedValue ?? 0;
  const assets = trackedValue + manualAssets;
  const netWorth = tracked.available ? assets - liabilities : null;

  // Record today's reading so the trend line has something to draw. Only when
  // the figure is actually complete — a snapshot taken while a broker was
  // unreachable would put a permanent dip in the history that never happened.
  // Skipped for the demo, which must not accumulate rows.
  if (opts.recordSnapshot && netWorth != null && (assets > 0 || liabilities > 0)) {
    await recordSnapshot(user.id, assets, liabilities, netWorth).catch(() => {
      /* a snapshot is a nice-to-have; never fail the read over it */
    });
  }

  const all = await db
    .select()
    .from(netWorthSnapshots)
    .where(eq(netWorthSnapshots.userId, user.id))
    .orderBy(asc(netWorthSnapshots.onDate));

  const days = opts.historyDays ?? 365;
  const cutoff = etToday(new Date(Date.now() - days * 86400000));
  const history: NetWorthPoint[] = all
    .filter((s) => s.onDate >= cutoff)
    .map((s) => ({ onDate: s.onDate, assets: s.assets, liabilities: s.liabilities, netWorth: s.netWorth }));

  return {
    tracked,
    assets: assetRows.map(toView),
    liabilities: liabilityRows.map(toView),
    totals: { assets, liabilities, netWorth, manualAssets },
    history,
    totalDays: all.length,
    asOf: Date.now(),
  };
}
