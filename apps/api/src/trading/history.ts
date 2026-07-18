import crypto from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingPositions, users, TRADE_SIDES, type TradeSide, type TradingPositionRow } from '../db/schema.js';
import { canAccessWorkspace, parseRoles } from '../auth/rbac.js';
import { DEMO_USERNAME } from '../demo/identity.js';
import { sendToTradingDesk } from '../notifications/push.js';
import { sendPushoverToDesk } from '../notifications/pushover.js';
import type { NotifEvent } from '../notifications/prefs.js';
import { classifyOutcome, type BreakEvenConfig, type BreakEvenMode, type BreakEvenOverride } from './outcome.js';
import { tradePips } from './forex.js';
import { deskTradeCodeIndex } from './codes.js';
import { getDeskSettings, configOf } from './settings.js';
import { scopedTraderIds, scopedTraderIdsForUser, type Viewer } from './scope.js';
import { backfillClosedTrades } from './backfill.js';
import { designationsFor, type TradeDesignation } from '../badges/designations.js';
import type { LiveTrade } from './types.js';

// A position opened within this window is treated as a fresh fill worth a push;
// older "new to us" positions (e.g. on the first sync after a deploy) are not,
// so a backfill never floods every phone.
const FRESH_OPEN_MS = 15 * 60_000;

function fmtPl(n: number | null): string {
  if (n == null) return '';
  const sign = n < 0 ? '-' : '+';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

// Render a stop/target level for a notification line; null reads as "none" so a
// trader can tell an added level apart from a removed one.
function fmtLevel(n: number | null): string {
  return n == null ? 'none' : String(n);
}

// TP/SL are stored as floats, so compare with a small tolerance to ignore the
// last-bit noise of a round-trip through the DB and only flag a deliberate move.
function levelChanged(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return a !== b; // added or removed a level
  return Math.abs(a - b) > 1e-9;
}

// Reconcile the Live Wall's open positions against what we last stored, so that
// closures can be detected and auto-recorded to History.
//
// `okSources` is the set of connection ids that actually responded this cycle.
// A position only counts as closed if its source connection responded AND the
// position is no longer in the live feed — so a connection that errored (its
// positions vanish from the feed) can never trigger false closures.
export async function reconcile(
  userId: string,
  okSources: Set<string>,
  liveTrades: LiveTrade[],
  ownerName?: string,
): Promise<void> {
  const now = new Date();
  const openRows = await db
    .select()
    .from(tradingPositions)
    .where(and(eq(tradingPositions.userId, userId), eq(tradingPositions.status, 'open')));
  const byKey = new Map(openRows.map((r) => [r.key, r]));
  const currentKeys = new Set(liveTrades.map((t) => t.id));

  // Trade events to notify on after the DB work: genuinely fresh fills and
  // positions that just closed (TP/SL/manual exit). Collected here, pushed once.
  const opened: LiveTrade[] = [];
  const closed: { instrument: string; pl: number | null }[] = [];
  // Live trades whose TP or SL just moved (added, removed, or repriced), so the
  // desk hears about a stop/target adjustment the same way it hears open/close.
  const retargeted: {
    trade: LiveTrade;
    tp?: { from: number | null; to: number | null };
    sl?: { from: number | null; to: number | null };
  }[] = [];

  // Upsert every currently-open position (refresh mark + P/L, or insert new).
  for (const t of liveTrades) {
    const existing = byKey.get(t.id);
    if (existing) {
      // Trailing stops trail the market every tick, so they're deliberately not
      // compared here — only the fixed TP/SL prices, which move on a real edit.
      const tpMoved = levelChanged(existing.takeProfit, t.takeProfit);
      const slMoved = levelChanged(existing.stopLoss, t.stopLoss);
      if (tpMoved || slMoved) {
        retargeted.push({
          trade: t,
          ...(tpMoved ? { tp: { from: existing.takeProfit, to: t.takeProfit } } : {}),
          ...(slMoved ? { sl: { from: existing.stopLoss, to: t.stopLoss } } : {}),
        });
      }
      await db
        .update(tradingPositions)
        .set({
          currentPrice: t.currentPrice,
          unrealizedPl: t.unrealizedPl,
          takeProfit: t.takeProfit,
          stopLoss: t.stopLoss,
          trailingStopLoss: t.trailingStopLoss,
          units: t.units,
          lastSeenAt: now,
        })
        .where(eq(tradingPositions.id, existing.id));
    } else {
      await db.insert(tradingPositions).values({
        id: crypto.randomUUID(),
        userId,
        key: t.id,
        connectionId: t.connectionId,
        broker: t.broker,
        instrument: t.instrument,
        side: t.side,
        units: t.units,
        plannedEntry: t.plannedEntry,
        entryPrice: t.entryPrice,
        takeProfit: t.takeProfit,
        stopLoss: t.stopLoss,
        trailingStopLoss: t.trailingStopLoss,
        currentPrice: t.currentPrice,
        unrealizedPl: t.unrealizedPl,
        strategy: t.strategy,
        timeframe: t.timeframe,
        status: 'open',
        openedAt: t.openedAt != null ? new Date(t.openedAt) : null,
        firstSeenAt: now,
        lastSeenAt: now,
      });
      // Only a genuinely recent fill is push-worthy, so the first sync after a
      // deploy (where every open trade is "new to us") never floods phones.
      if (t.openedAt != null && now.getTime() - t.openedAt < FRESH_OPEN_MS) opened.push(t);
    }
  }

  // Close positions that vanished from a connection that DID respond this cycle.
  for (const r of openRows) {
    if (r.connectionId && okSources.has(r.connectionId) && !currentKeys.has(r.key)) {
      await db
        .update(tradingPositions)
        .set({
          status: 'closed',
          closedAt: now,
          exitPrice: r.currentPrice, // last mark we saw before it disappeared
          realizedPl: r.unrealizedPl, // last open P/L we saw
        })
        .where(eq(tradingPositions.id, r.id));
      closed.push({ instrument: r.instrument, pl: r.unrealizedPl });
    }
  }

  // Buzz the OWNER'S TEAM about fresh fills and closes — trade info never fans
  // out past the team. Best-effort and fire-and-forget so the Live Wall render
  // never waits on (or fails from) a push. Because the open/close DB transition
  // happens exactly once, this notifies once even though every viewer's poll
  // calls reconcile.
  const hasEvents = opened.length > 0 || closed.length > 0 || retargeted.length > 0;
  const teamIds = hasEvents ? await scopedTraderIdsForUser(userId) : new Set<string>();
  // When the owner holds a position designation (Chief Strategist / Chief
  // Analyst), lead the notification with its coloured circle + label so the
  // "colour designation" carries into the push/Pushover text.
  const desig = hasEvents ? (await designationsFor([userId])).get(userId) ?? null : null;
  const tag = desig ? `${desig.emoji} ${desig.label} · ` : '';
  const who = `${tag}${ownerName ? `${ownerName} · ` : ''}`;
  for (const t of opened) {
    const body = `${who}${t.side.toUpperCase()} ${t.units}${t.entryPrice ? ` @ ${t.entryPrice}` : ''}`;
    void sendToTradingDesk({
      title: `Trade opened · ${t.instrument}`,
      body,
      url: '/?screen=live',
      tag: `vts-open-${t.id}`,
    }, { scopeIds: teamIds, ownerId: userId, event: 'open' }).catch(() => {});
    void sendPushoverToDesk({
      title: `Trade opened · ${t.instrument}`,
      message: body,
      priority: 1,
      url: '/?screen=live',
      urlTitle: 'Open the Live Wall',
    }, { scopeIds: teamIds, ownerId: userId, event: 'open' }).catch(() => {});
  }
  for (const c of closed) {
    const pl = fmtPl(c.pl);
    const body = `${who}${pl ? `${pl}` : 'position closed'}`;
    void sendToTradingDesk({
      title: `Trade closed · ${c.instrument}`,
      body,
      url: '/?screen=history',
      tag: `vts-close-${c.instrument}`,
    }, { scopeIds: teamIds, ownerId: userId, event: 'close' }).catch(() => {});
    void sendPushoverToDesk({
      title: `Trade closed · ${c.instrument}`,
      message: body,
      priority: 1,
      url: '/?screen=history',
      urlTitle: 'Open History',
    }, { scopeIds: teamIds, ownerId: userId, event: 'close' }).catch(() => {});
  }
  // A stop/target change fires as its own event so each recipient's per-user
  // prefs can gate SL and TP — and placing vs moving each — independently. A
  // trade whose SL and TP both changed emits two notifications, one per level.
  for (const m of retargeted) {
    const t = m.trade;
    const events: { event: NotifEvent; line: string }[] = [];
    if (m.sl) {
      events.push({
        event: m.sl.from == null ? 'placeSl' : 'moveSl',
        line: `SL ${fmtLevel(m.sl.from)} → ${fmtLevel(m.sl.to)}`,
      });
    }
    if (m.tp) {
      events.push({
        event: m.tp.from == null ? 'placeTp' : 'moveTp',
        line: `TP ${fmtLevel(m.tp.from)} → ${fmtLevel(m.tp.to)}`,
      });
    }
    for (const ev of events) {
      const body = `${who}${ev.line}`;
      void sendToTradingDesk({
        title: `Trade updated · ${t.instrument}`,
        body,
        url: '/?screen=live',
        // Tag per trade + event so a rapid re-edit of the same level collapses
        // onto the last one, but an SL and a TP change stay distinct banners.
        tag: `vts-${ev.event}-${t.id}`,
      }, { scopeIds: teamIds, ownerId: userId, event: ev.event }).catch(() => {});
      void sendPushoverToDesk({
        title: `Trade updated · ${t.instrument}`,
        message: body,
        priority: 1,
        url: '/?screen=live',
        urlTitle: 'Open the Live Wall',
      }, { scopeIds: teamIds, ownerId: userId, event: ev.event }).catch(() => {});
    }
  }
}

// ---- History read model ----
export interface HistoryRecord {
  id: string;
  ownerId: string; // the teammate whose account this closed trade was on
  owner: string; // that teammate's username, shown on the row
  isMine: boolean; // the viewing user owns this trade
  broker: string;
  instrument: string;
  side: TradeSide;
  units: number;
  plannedEntry: number | null;
  entryPrice: number;
  exitPrice: number | null;
  slippage: number | null; // entry - planned, computed
  realizedPl: number | null; // gated by viewBrokerage
  strategy: string | null;
  timeframe: string | null;
  openedAt: number | null;
  closedAt: number | null;
  code: string | null; // desk code MMDDYY-N, shared with the Trade Log
  // The owner's position designation (Chief Strategist / Chief Analyst), when
  // they hold one — colours the row. Null otherwise. Filled in by getHistory.
  designation: TradeDesignation | null;
}

export interface HistoryGroup {
  label: string;
  count: number;
  wins: number;
  losses: number;
  breakeven: number; // trades inside the desk's break-even band
  realizedPl: number | null; // gated
  pips: number; // net entry→exit move across the group's forex trades, in pips
}

export interface HistorySummary {
  closed: number;
  wins: number;
  losses: number;
  breakeven: number; // closed trades inside the break-even band
  winRate: number; // 0..1 over decided (win/loss) trades — break-even excluded
  totalRealizedPl: number | null; // gated
  byStrategy: HistoryGroup[];
  byInstrument: HistoryGroup[];
}

export interface HistoryData {
  trades: HistoryRecord[];
  summary: HistorySummary;
  // The desk-wide break-even buffer applied to the summary — all three shapes
  // plus per-instrument overrides.
  breakEvenPct: number;
  breakEvenMode: BreakEvenMode;
  breakEvenAmount: number;
  breakEvenOverrides: BreakEvenOverride[];
}

function slippageOf(planned: number | null, entry: number): number | null {
  if (planned == null) return null;
  return Number((entry - planned).toFixed(8));
}

function toRecord(
  row: TradingPositionRow,
  owner: string,
  viewerId: string,
  canSeeBalances: boolean,
): HistoryRecord {
  return {
    id: row.id,
    ownerId: row.userId,
    owner,
    isMine: row.userId === viewerId,
    broker: row.broker,
    instrument: row.instrument,
    side: row.side as TradeSide,
    units: row.units,
    plannedEntry: row.plannedEntry,
    entryPrice: row.entryPrice,
    exitPrice: row.exitPrice,
    slippage: slippageOf(row.plannedEntry, row.entryPrice),
    realizedPl: canSeeBalances ? row.realizedPl : null,
    strategy: row.strategy,
    timeframe: row.timeframe,
    openedAt: row.openedAt ? row.openedAt.getTime() : null,
    closedAt: row.closedAt ? row.closedAt.getTime() : null,
    code: null, // filled in by getHistory from the desk-wide code index
    designation: null, // filled in by getHistory from the owner's badges
  };
}

function groupBy(
  rows: TradingPositionRow[],
  pick: (r: TradingPositionRow) => string | null,
  canSeeBalances: boolean,
  config: BreakEvenConfig,
): HistoryGroup[] {
  const map = new Map<string, { count: number; wins: number; losses: number; breakeven: number; pl: number; pips: number }>();
  for (const r of rows) {
    const label = (pick(r) ?? '—').trim() || '—';
    const g = map.get(label) ?? { count: 0, wins: 0, losses: 0, breakeven: 0, pl: 0, pips: 0 };
    g.count += 1;
    // Pips are a price fact (not a balance), so they accrue for every closeable
    // forex trade regardless of whether realized P/L is known or visible.
    const pips = tradePips(r.side as TradeSide, r.entryPrice, r.exitPrice, r.instrument);
    if (pips != null) g.pips += pips;
    if (r.realizedPl != null) {
      g.pl += r.realizedPl;
      const outcome = classifyOutcome(r.side as TradeSide, r.entryPrice, r.exitPrice, r.realizedPl, r.instrument, config);
      if (outcome === 'win') g.wins += 1;
      else if (outcome === 'loss') g.losses += 1;
      else g.breakeven += 1;
    }
    map.set(label, g);
  }
  return [...map.entries()]
    .map(([label, g]) => ({
      label,
      count: g.count,
      wins: g.wins,
      losses: g.losses,
      breakeven: g.breakeven,
      realizedPl: canSeeBalances ? g.pl : null,
      pips: Number(g.pips.toFixed(1)),
    }))
    .sort((a, b) => b.count - a.count);
}

// Delete a recorded position (open or closed). Used to clear a test/old trade
// from History and the Trade Log. Owner-scoped by default so a trader can only
// remove their own rows; an admin (admin=true) can remove anyone's, since the
// desk is shared. Returns true when a row was deleted. Note: a still-open
// position will reappear on the next Live Wall reconcile (it is still live on
// the broker); deleting a closed one is permanent.
export async function removePosition(userId: string, id: string, admin = false): Promise<boolean> {
  const where = admin
    ? eq(tradingPositions.id, id)
    : and(eq(tradingPositions.id, id), eq(tradingPositions.userId, userId));
  const row = (
    await db.select({ id: tradingPositions.id }).from(tradingPositions).where(where).limit(1)
  )[0];
  if (!row) return false;
  await db.delete(tradingPositions).where(where);
  return true;
}

// Fields a trader can correct on a closed trade in History. Kept to the trade's
// own facts (levels, size, P/L, tags, dates); connection/broker identity and the
// live-sync bookkeeping columns are never editable here.
export interface ClosedPositionEdit {
  instrument?: string;
  side?: TradeSide;
  units?: number | null;
  plannedEntry?: number | null;
  entryPrice?: number;
  exitPrice?: number | null;
  realizedPl?: number | null;
  strategy?: string | null;
  timeframe?: string | null;
  openedAt?: number | null;
  closedAt?: number | null;
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

// Edit a CLOSED recorded trade. Owner-scoped by default; an admin can correct
// anyone's on the shared desk (mirrors removePosition). Only closed rows are
// editable — an open position is still live on the broker and the next Live Wall
// reconcile would overwrite hand-edits, so those stay read-only. Returns true
// when a row was updated.
export async function updateClosedPosition(
  userId: string,
  id: string,
  input: ClosedPositionEdit,
  admin = false,
): Promise<boolean> {
  const where = admin
    ? and(eq(tradingPositions.id, id), eq(tradingPositions.status, 'closed'))
    : and(eq(tradingPositions.id, id), eq(tradingPositions.userId, userId), eq(tradingPositions.status, 'closed'));
  const row = (await db.select().from(tradingPositions).where(where).limit(1))[0];
  if (!row) return false;

  const patch: Partial<typeof tradingPositions.$inferInsert> = { lastSeenAt: new Date() };
  if (input.instrument !== undefined) {
    const inst = input.instrument.trim();
    if (!inst) throw new Error('Instrument is required');
    patch.instrument = inst.slice(0, 40);
  }
  if (input.side !== undefined && (TRADE_SIDES as readonly string[]).includes(input.side)) patch.side = input.side;
  if (input.units !== undefined) patch.units = cleanNum(input.units) ?? 0;
  if (input.plannedEntry !== undefined) patch.plannedEntry = cleanNum(input.plannedEntry);
  if (input.entryPrice !== undefined) {
    if (!Number.isFinite(input.entryPrice)) throw new Error('A valid entry price is required');
    patch.entryPrice = input.entryPrice;
  }
  if (input.exitPrice !== undefined) patch.exitPrice = cleanNum(input.exitPrice);
  if (input.realizedPl !== undefined) patch.realizedPl = cleanNum(input.realizedPl);
  if (input.strategy !== undefined) patch.strategy = cleanText(input.strategy, 80);
  if (input.timeframe !== undefined) patch.timeframe = cleanText(input.timeframe, 16);
  if (input.openedAt !== undefined) patch.openedAt = input.openedAt == null ? null : new Date(input.openedAt);
  if (input.closedAt !== undefined) patch.closedAt = input.closedAt == null ? null : new Date(input.closedAt);

  await db.update(tradingPositions).set(patch).where(where);
  return true;
}

export async function getHistory(
  viewer: Viewer,
  canSeeBalances: boolean,
  viewerIsDemo = false,
): Promise<HistoryData> {
  const viewerId = viewer.id;
  // The public demo is sandboxed off the real desk: it never sees teammates'
  // closed trades (and its own showcase has no closed positions), so its History
  // is empty rather than a window into real accounts.
  const settings = await getDeskSettings();
  const config = configOf(settings);
  const beFields = {
    breakEvenPct: settings.breakEvenPct,
    breakEvenMode: settings.breakEvenMode,
    breakEvenAmount: settings.breakEvenAmount,
    breakEvenOverrides: settings.breakEvenOverrides,
  };
  if (viewerIsDemo) {
    return {
      trades: [],
      summary: { closed: 0, wins: 0, losses: 0, breakeven: 0, winRate: 0, totalRealizedPl: canSeeBalances ? 0 : null, byStrategy: [], byInstrument: [] },
      ...beFields,
    };
  }

  // Team-scoped history: the closed positions of the viewer's team (or just the
  // viewer, if teamless), tagged with the owner. Joined live with users so a
  // teammate who loses trading access drops off, mirroring the Live Wall/Trade Log.
  const scopeIds = await scopedTraderIds(viewer);

  // Ingest the team's OANDA closed-trade history first, so trades the live
  // reconcile never saw (opened+closed between polls) appear here too. Throttled
  // per connection and best-effort.
  await backfillClosedTrades(scopeIds).catch(() => {});
  const joined = await db
    .select({ pos: tradingPositions, username: users.username, roles: users.roles })
    .from(tradingPositions)
    .innerJoin(users, eq(users.id, tradingPositions.userId))
    .where(eq(tradingPositions.status, 'closed'))
    .orderBy(desc(tradingPositions.closedAt));

  const visible = joined.filter(
    (r) =>
      scopeIds.has(r.pos.userId) && // only the viewer's team
      // Drop the demo account: it's a sandbox, so its positions never surface as
      // "demo"-tagged rows in a real trader's history.
      r.username !== DEMO_USERNAME &&
      canAccessWorkspace(parseRoles({ roles: r.roles }), 'trading'),
  );
  const rows = visible.map((r) => r.pos);
  const ownerOf = new Map(visible.map((r) => [r.pos.id, r.username]));

  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let totalPl = 0;
  for (const r of rows) {
    if (r.realizedPl != null) {
      totalPl += r.realizedPl;
      const outcome = classifyOutcome(r.side as TradeSide, r.entryPrice, r.exitPrice, r.realizedPl, r.instrument, config);
      if (outcome === 'win') wins += 1;
      else if (outcome === 'loss') losses += 1;
      else breakeven += 1;
    }
  }
  const decided = wins + losses;

  const codes = await deskTradeCodeIndex(scopeIds);
  // Colour each row by its owner's position designation (Chief Strategist /
  // Chief Analyst), when they hold one.
  const designations = await designationsFor(visible.map((r) => r.pos.userId));
  const trades = rows.map((r) => {
    const rec = toRecord(r, ownerOf.get(r.id) ?? '', viewerId, canSeeBalances);
    rec.code = codes.get(r.id) ?? null;
    rec.designation = designations.get(r.userId) ?? null;
    return rec;
  });

  return {
    trades,
    summary: {
      closed: rows.length,
      wins,
      losses,
      breakeven,
      winRate: decided > 0 ? wins / decided : 0,
      totalRealizedPl: canSeeBalances ? totalPl : null,
      byStrategy: groupBy(rows, (r) => r.strategy, canSeeBalances, config),
      byInstrument: groupBy(rows, (r) => r.instrument, canSeeBalances, config),
    },
    ...beFields,
  };
}
