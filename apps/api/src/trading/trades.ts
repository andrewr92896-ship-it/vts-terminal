import crypto from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  tradingTrades,
  tradingPositions,
  users,
  TRADE_SIDES,
  TRADE_STATUSES,
  type TradeSide,
  type TradeStatus,
  type TradingTradeRow,
  type TradingPositionRow,
} from '../db/schema.js';
import { canAccessWorkspace, parseRoles } from '../auth/rbac.js';
import { DEMO_USERNAME } from '../demo/identity.js';
import { classifyOutcome, type BreakEvenConfig, type BreakEvenMode, type BreakEvenOverride } from './outcome.js';
import { deskTradeCodeIndex } from './codes.js';
import { getDeskSettings, configOf, isSmallTrade } from './settings.js';
import { visibleTraderIds, type Viewer } from './scope.js';
import { ownTradesOnly, type TradeDeleteScope } from './deleteAccess.js';
import { backfillClosedTrades } from './backfill.js';
import { beforeCutoff, connectionCutoffs } from './connections.js';

// The Trade Log is a shared trading-desk view: every user with trading access
// (full or view-only) sees every other trading user's trades in full — capital
// (realized P/L), lot sizes, fills, and all — each tagged with the owner's
// username. Rows are still keyed by userId, so a trader can only edit, remove,
// or restore their own; those paths stay scoped to the owner. Slippage is
// derived on read (entry vs. planned), never stored.

export interface TradeRecord {
  id: string;
  ownerId: string; // the user who logged the trade
  owner: string; // that user's username, shown on the trade
  ownerName: string; // that user's display name (preferred for labels/pickers)
  isMine: boolean; // the viewing user owns this trade (may edit/remove it)
  broker: string | null;
  instrument: string;
  side: TradeSide;
  status: TradeStatus;
  plannedEntry: number | null;
  entryPrice: number;
  exitPrice: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  units: number;
  slippage: number | null; // entryPrice - plannedEntry, computed
  realizedPl: number | null; // null only while open / unknown — shared with the desk
  // Live (last-seen) open P/L for a currently-open broker position; null once
  // closed or for a hand-logged trade. Lets the Trade Log show the open leg too.
  unrealizedPl: number | null;
  strategy: string | null;
  timeframe: string | null;
  openedAt: number; // ms
  closedAt: number | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
  // Hand-logged trades are editable; broker-sourced positions (auto-imported
  // from a connected broker like OANDA) are read-only here — they're managed on
  // the Live Wall / History, so the Trade Log never offers Edit/Remove on them.
  editable: boolean;
  source: 'manual' | 'broker'; // where the row came from, for a small UI tag
  // Human-friendly desk code, MMDDYY-N (N = order within the ET day). Stable and
  // shared with History. Null only for a sandboxed demo trade (no desk code).
  code: string | null;
}

export interface TradeSummary {
  total: number;
  open: number;
  closed: number;
  wins: number;
  losses: number;
  breakeven: number; // closed, known-P/L trades inside the break-even band
  winRate: number; // 0..1 over decided (win/loss) trades — break-even excluded
  totalRealizedPl: number; // desk-wide realized P/L across closed trades
  totalUnrealizedPl: number; // desk-wide open (unrealized) P/L across open positions
  avgSlippage: number | null; // over trades that have a planned entry
}

export interface TradeLogData {
  trades: TradeRecord[];
  summary: TradeSummary;
  // The desk-wide break-even buffer applied to the summary, in all three of its
  // shapes plus the per-instrument overrides, so the client can classify and
  // label trades exactly the same way the server does.
  breakEvenPct: number;
  breakEvenMode: BreakEvenMode;
  breakEvenAmount: number;
  breakEvenOverrides: BreakEvenOverride[];
  // The desk's "test trade" floor (units). Broker fills under it are already
  // excluded from `trades` + `summary`; sent so the client can note it. 0 = off.
  minTradeUnits: number;
  // What the VIEWER deposited out of their own pocket, or null when they have
  // not said. Their own setting, so it does not vary with whose rows are being
  // looked at — which is why it rides this payload rather than each trade.
  depositedCapital: number | null;
}

export interface TradeInput {
  broker?: string | null;
  instrument: string;
  side?: TradeSide;
  status?: TradeStatus;
  plannedEntry?: number | null;
  entryPrice: number;
  exitPrice?: number | null;
  takeProfit?: number | null;
  stopLoss?: number | null;
  units?: number;
  realizedPl?: number | null;
  strategy?: string | null;
  timeframe?: string | null;
  openedAt?: number; // ms; defaults to now
  closedAt?: number | null;
  notes?: string | null;
}

function isSide(v: unknown): v is TradeSide {
  return typeof v === 'string' && (TRADE_SIDES as readonly string[]).includes(v);
}
function isStatus(v: unknown): v is TradeStatus {
  return typeof v === 'string' && (TRADE_STATUSES as readonly string[]).includes(v);
}

function cleanText(v: string | null | undefined, max: number): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

// Optional numeric: undefined/null/NaN → null; otherwise the finite number.
function cleanNum(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return v;
}

function slippageOf(plannedEntry: number | null, entryPrice: number): number | null {
  if (plannedEntry == null) return null;
  return Number((entryPrice - plannedEntry).toFixed(8));
}

function toRecord(row: TradingTradeRow, owner: string, ownerName: string, viewerId: string): TradeRecord {
  return {
    id: row.id,
    ownerId: row.userId,
    owner,
    ownerName: ownerName || owner,
    isMine: row.userId === viewerId,
    broker: row.broker,
    instrument: row.instrument,
    side: isSide(row.side) ? row.side : 'long',
    status: isStatus(row.status) ? row.status : 'closed',
    plannedEntry: row.plannedEntry,
    entryPrice: row.entryPrice,
    exitPrice: row.exitPrice,
    takeProfit: row.takeProfit,
    stopLoss: row.stopLoss,
    units: row.units,
    slippage: slippageOf(row.plannedEntry, row.entryPrice),
    realizedPl: row.realizedPl,
    unrealizedPl: null, // hand-logged trades carry no live mark
    strategy: row.strategy,
    timeframe: row.timeframe,
    openedAt: row.openedAt.getTime(),
    closedAt: row.closedAt ? row.closedAt.getTime() : null,
    notes: row.notes,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    editable: true,
    source: 'manual',
    code: null, // filled in by getTrades from the desk-wide code index
  };
}

// Map an auto-recorded broker position (open or closed) into a Trade Log row.
// These come from a connected broker (e.g. OANDA), so they're read-only here:
// edits/closures happen on the broker and flow in through the Live Wall reconcile.
function positionToRecord(row: TradingPositionRow, owner: string, ownerName: string, viewerId: string): TradeRecord {
  const opened = row.openedAt ?? row.firstSeenAt; // openedAt can be null; fall back to first sight
  return {
    id: row.id,
    ownerId: row.userId,
    owner,
    ownerName: ownerName || owner,
    isMine: row.userId === viewerId,
    broker: row.broker,
    instrument: row.instrument,
    side: isSide(row.side) ? row.side : 'long',
    status: row.status === 'closed' ? 'closed' : 'open',
    plannedEntry: row.plannedEntry,
    entryPrice: row.entryPrice,
    exitPrice: row.exitPrice,
    takeProfit: row.takeProfit,
    stopLoss: row.stopLoss,
    units: row.units,
    slippage: slippageOf(row.plannedEntry, row.entryPrice),
    // Realized P/L only once closed; an open position's P/L is unrealized and
    // stays out of the realized KPI total. The open leg is surfaced separately
    // via unrealizedPl below so the Trade Log can show it too.
    realizedPl: row.status === 'closed' ? row.realizedPl : null,
    unrealizedPl: row.status === 'closed' ? null : row.unrealizedPl,
    strategy: row.strategy,
    timeframe: row.timeframe,
    openedAt: opened.getTime(),
    closedAt: row.closedAt ? row.closedAt.getTime() : null,
    notes: null,
    createdAt: row.firstSeenAt.getTime(),
    updatedAt: row.lastSeenAt.getTime(),
    editable: false,
    source: 'broker',
    code: null, // filled in by getTrades from the desk-wide code index
  };
}

// Summary over the trade record list. `config` is the desk-wide break-even
// buffer (default + per-instrument overrides): a scored trade inside its
// instrument's buffer counts as break-even, kept out of both the win and loss
// tallies (and out of the win-rate denominator).
function summarizeRecords(records: TradeRecord[], config: BreakEvenConfig): TradeSummary {
  let open = 0;
  let closed = 0;
  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let totalPl = 0;
  let totalUnrealizedPl = 0;
  let slipSum = 0;
  let slipCount = 0;
  for (const r of records) {
    if (r.status === 'open') open += 1;
    else closed += 1;
    if (r.realizedPl != null) {
      totalPl += r.realizedPl;
      if (r.status === 'closed') {
        const outcome = classifyOutcome(r.side, r.entryPrice, r.exitPrice, r.realizedPl, r.instrument, config);
        if (outcome === 'win') wins += 1;
        else if (outcome === 'loss') losses += 1;
        else breakeven += 1;
      }
    }
    if (r.unrealizedPl != null) totalUnrealizedPl += r.unrealizedPl;
    if (r.slippage != null) {
      slipSum += r.slippage;
      slipCount += 1;
    }
  }
  const decided = wins + losses;
  return {
    total: records.length,
    open,
    closed,
    wins,
    losses,
    breakeven,
    winRate: decided > 0 ? wins / decided : 0,
    totalRealizedPl: totalPl,
    totalUnrealizedPl: Number(totalUnrealizedPl.toFixed(2)),
    avgSlippage: slipCount > 0 ? Number((slipSum / slipCount).toFixed(8)) : null,
  };
}

export async function getTrades(viewer: Viewer, viewerIsDemo = false): Promise<TradeLogData> {
  const viewerId = viewer.id;
  // Trade data is scoped to the viewer's team (or just the viewer, if teamless):
  // the Trade Log only shows that team's trades, never the whole install.
  const scopeIds = await visibleTraderIds(viewer);

  // Pull the team's OANDA closed-trade history into `tradingPositions` before we
  // read, so trades the live reconcile never caught (opened+closed between polls)
  // still show up. Self-throttled per connection and best-effort — the demo is a
  // sandbox with no real broker, so it's skipped.
  if (!viewerIsDemo) await backfillClosedTrades(scopeIds).catch(() => {});

  // Desk settings drive the break-even scoring and the "test trade" floor, both
  // of which shape what's counted below — so load them before folding in trades.
  // Each trader scores their own view of the desk, so use the viewer's settings.
  const settings = await getDeskSettings(viewer.id);

  // Pull every trade alongside its owner's username and roles, then keep only
  // those on the viewer's team whose owner currently has trading access (full or
  // view-only). Joining live keeps the view correct as people's roles change.
  const rows = await db
    .select({
      trade: tradingTrades,
      username: users.username,
      displayName: users.displayName,
      roles: users.roles,
    })
    .from(tradingTrades)
    .innerJoin(users, eq(users.id, tradingTrades.userId))
    .where(isNull(tradingTrades.deletedAt)); // soft-deleted trades live in Deleted Trades

  const visible = rows.filter((r) => {
    if (!scopeIds.has(r.trade.userId)) return false; // only the viewer's team
    if (!canAccessWorkspace(parseRoles({ roles: r.roles }), 'trading')) return false;
    // The public demo is sandboxed: a real trader never sees the demo's
    // showcase trades, and the demo only sees its own showcase.
    return viewerIsDemo ? r.username === DEMO_USERNAME : r.username !== DEMO_USERNAME;
  });

  const records = visible.map((r) => toRecord(r.trade, r.username, r.displayName, viewerId));

  // Fold in broker-sourced positions (open + closed) so a trader's OANDA (and
  // other connected-broker) trades show up here automatically, not just on the
  // Live Wall / History. They're read-only rows tagged with their broker. The
  // public demo is sandboxed off real broker data, so it only ever sees its own
  // hand-logged showcase.
  if (!viewerIsDemo) {
    // Per-connection "count trades since" cutoffs — a broker position that opened
    // before its connection's cutoff is an earlier phase the trader excluded, so
    // it's dropped from the log and its KPIs.
    const cutoffs = await connectionCutoffs();
    const posRows = await db
      .select({ pos: tradingPositions, username: users.username, displayName: users.displayName, roles: users.roles })
      .from(tradingPositions)
      .innerJoin(users, eq(users.id, tradingPositions.userId))
      .where(isNull(tradingPositions.deletedAt)); // soft-deleted rows are hidden here
    for (const r of posRows) {
      if (!scopeIds.has(r.pos.userId)) continue; // only the viewer's team
      if (r.username === DEMO_USERNAME) continue;
      if (!canAccessWorkspace(parseRoles({ roles: r.roles }), 'trading')) continue;
      const opened = (r.pos.openedAt ?? r.pos.firstSeenAt).getTime();
      if (beforeCutoff(cutoffs, r.pos.connectionId, opened)) continue;
      // Drop sub-floor broker fills (1-unit connection tests) from the log + KPIs.
      if (isSmallTrade(r.pos.units, settings.minTradeUnits)) continue;
      records.push(positionToRecord(r.pos, r.username, r.displayName, viewerId));
    }
  }

  // Open trades first, then newest by open time — the order a trader scans in.
  const sorted = records.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return b.openedAt - a.openedAt;
  });

  // Stamp each row with its desk code and score against the desk-wide break-even
  // band. The demo is sandboxed off the shared code index, so its rows keep the
  // null code set in the mappers.
  if (!viewerIsDemo) {
    const codes = await deskTradeCodeIndex(scopeIds);
    for (const r of sorted) r.code = codes.get(r.id) ?? null;
  }
  return {
    trades: sorted,
    summary: summarizeRecords(sorted, configOf(settings)),
    breakEvenPct: settings.breakEvenPct,
    breakEvenMode: settings.breakEvenMode,
    breakEvenAmount: settings.breakEvenAmount,
    breakEvenOverrides: settings.breakEvenOverrides,
    minTradeUnits: settings.minTradeUnits,
    // The viewer's own deposit, carried on the payload the KPI row already reads
    // rather than fetched separately — it is the viewer's setting, so it never
    // varies with which trader's rows are being looked at.
    depositedCapital: settings.depositedCapital,
  };
}

export async function addTrade(userId: string, input: TradeInput): Promise<string> {
  const instrument = input.instrument.trim();
  if (!instrument) throw new Error('Instrument is required');
  if (!Number.isFinite(input.entryPrice)) throw new Error('A valid entry price is required');
  const now = new Date();
  const status: TradeStatus = isStatus(input.status) ? input.status : 'closed';
  const id = crypto.randomUUID();
  await db.insert(tradingTrades).values({
    id,
    userId,
    broker: cleanText(input.broker, 40),
    instrument: instrument.slice(0, 40),
    side: isSide(input.side) ? input.side : 'long',
    status,
    plannedEntry: cleanNum(input.plannedEntry),
    entryPrice: input.entryPrice,
    exitPrice: cleanNum(input.exitPrice),
    takeProfit: cleanNum(input.takeProfit),
    stopLoss: cleanNum(input.stopLoss),
    units: cleanNum(input.units) ?? 0,
    realizedPl: cleanNum(input.realizedPl),
    strategy: cleanText(input.strategy, 80),
    timeframe: cleanText(input.timeframe, 16),
    openedAt: input.openedAt ? new Date(input.openedAt) : now,
    closedAt: input.closedAt != null ? new Date(input.closedAt) : status === 'closed' ? now : null,
    notes: cleanText(input.notes, 2000),
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function updateTrade(
  userId: string,
  id: string,
  input: Partial<TradeInput>,
): Promise<void> {
  const existing = (
    await db
      .select()
      .from(tradingTrades)
      .where(and(eq(tradingTrades.id, id), eq(tradingTrades.userId, userId)))
      .limit(1)
  )[0];
  if (!existing) throw new Error('Trade not found');

  const patch: Partial<typeof tradingTrades.$inferInsert> = { updatedAt: new Date() };
  if (input.broker !== undefined) patch.broker = cleanText(input.broker, 40);
  if (input.instrument !== undefined) {
    const inst = input.instrument.trim();
    if (!inst) throw new Error('Instrument is required');
    patch.instrument = inst.slice(0, 40);
  }
  if (input.side !== undefined && isSide(input.side)) patch.side = input.side;
  if (input.status !== undefined && isStatus(input.status)) patch.status = input.status;
  if (input.plannedEntry !== undefined) patch.plannedEntry = cleanNum(input.plannedEntry);
  if (input.entryPrice !== undefined) {
    if (!Number.isFinite(input.entryPrice)) throw new Error('A valid entry price is required');
    patch.entryPrice = input.entryPrice;
  }
  if (input.exitPrice !== undefined) patch.exitPrice = cleanNum(input.exitPrice);
  if (input.takeProfit !== undefined) patch.takeProfit = cleanNum(input.takeProfit);
  if (input.stopLoss !== undefined) patch.stopLoss = cleanNum(input.stopLoss);
  if (input.units !== undefined) patch.units = cleanNum(input.units) ?? 0;
  if (input.realizedPl !== undefined) patch.realizedPl = cleanNum(input.realizedPl);
  if (input.strategy !== undefined) patch.strategy = cleanText(input.strategy, 80);
  if (input.timeframe !== undefined) patch.timeframe = cleanText(input.timeframe, 16);
  if (input.openedAt !== undefined) patch.openedAt = new Date(input.openedAt);
  if (input.closedAt !== undefined) patch.closedAt = input.closedAt == null ? null : new Date(input.closedAt);
  if (input.notes !== undefined) patch.notes = cleanText(input.notes, 2000);

  await db
    .update(tradingTrades)
    .set(patch)
    .where(and(eq(tradingTrades.id, id), eq(tradingTrades.userId, userId)));
}

// Raw fields needed to restore a removed trade exactly (undo).
export interface RemovedTrade {
  id: string;
  broker: string | null;
  instrument: string;
  side: TradeSide;
  status: TradeStatus;
  plannedEntry: number | null;
  entryPrice: number;
  exitPrice: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  units: number;
  realizedPl: number | null;
  strategy: string | null;
  timeframe: string | null;
  openedAt: number;
  closedAt: number | null;
  notes: string | null;
  createdAt: number;
}

// Remove a hand-logged trade. Owner-scoped by default; an admin (admin=true) can
// remove anyone's on the shared desk. An undo snapshot is returned only when the
// caller removed their *own* trade — restoring re-creates it under the caller, so
// admin-removed teammates' trades are not offered an undo (it would re-own them).
export async function removeTrade(userId: string, id: string, scope?: TradeDeleteScope): Promise<RemovedTrade | null> {
  // Soft delete: mark deleted (kept for the Deleted Trades section) rather than
  // dropping the row, so a mistaken delete can always be undone.
  // `scope` says whose trades the caller may remove (their own by default; a
  // team leader / Delete-trades grantee reaches their team, an admin anyone).
  const reach = scope ?? ownTradesOnly(userId);
  const where = reach.any
    ? and(eq(tradingTrades.id, id), isNull(tradingTrades.deletedAt))
    : and(
        eq(tradingTrades.id, id),
        inArray(tradingTrades.userId, [...reach.ownerIds]),
        isNull(tradingTrades.deletedAt),
      );
  const row = (await db.select().from(tradingTrades).where(where).limit(1))[0];
  if (!row) return null;
  await db.update(tradingTrades).set({ deletedAt: new Date(), updatedAt: new Date() }).where(where);
  if (row.userId !== userId) return null; // removed a teammate's trade — no undo bar
  return {
    id: row.id,
    broker: row.broker,
    instrument: row.instrument,
    side: isSide(row.side) ? row.side : 'long',
    status: isStatus(row.status) ? row.status : 'closed',
    plannedEntry: row.plannedEntry,
    entryPrice: row.entryPrice,
    exitPrice: row.exitPrice,
    takeProfit: row.takeProfit,
    stopLoss: row.stopLoss,
    units: row.units,
    realizedPl: row.realizedPl,
    strategy: row.strategy,
    timeframe: row.timeframe,
    openedAt: row.openedAt.getTime(),
    closedAt: row.closedAt ? row.closedAt.getTime() : null,
    notes: row.notes,
    createdAt: row.createdAt.getTime(),
  };
}

export async function restoreTrade(userId: string, t: RemovedTrade): Promise<void> {
  // The row still exists (soft-deleted) — clear the delete marker to bring it
  // back. Owner-scoped: the undo bar only ever restores the caller's own trade.
  await db
    .update(tradingTrades)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(and(eq(tradingTrades.id, t.id), eq(tradingTrades.userId, userId)));
}
