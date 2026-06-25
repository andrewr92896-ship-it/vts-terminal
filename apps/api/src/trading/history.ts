import crypto from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingPositions, users, type TradeSide, type TradingPositionRow } from '../db/schema.js';
import { canAccessWorkspace, parseRoles } from '../auth/rbac.js';
import { DEMO_USERNAME } from '../demo/identity.js';
import { sendToTradingDesk } from '../notifications/push.js';
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

  // Upsert every currently-open position (refresh mark + P/L, or insert new).
  for (const t of liveTrades) {
    const existing = byKey.get(t.id);
    if (existing) {
      await db
        .update(tradingPositions)
        .set({
          currentPrice: t.currentPrice,
          unrealizedPl: t.unrealizedPl,
          takeProfit: t.takeProfit,
          stopLoss: t.stopLoss,
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

  // Buzz the desk about fresh fills and closes. Best-effort and fire-and-forget
  // so the Live Wall render never waits on (or fails from) a push. Because the
  // open/close DB transition happens exactly once, this notifies once even
  // though every viewer's poll calls reconcile.
  const who = ownerName ? `${ownerName} · ` : '';
  for (const t of opened) {
    void sendToTradingDesk({
      title: `Trade opened · ${t.instrument}`,
      body: `${who}${t.side.toUpperCase()} ${t.units}${t.entryPrice ? ` @ ${t.entryPrice}` : ''}`,
      url: '/?screen=live',
      tag: `vts-open-${t.id}`,
    }).catch(() => {});
  }
  for (const c of closed) {
    const pl = fmtPl(c.pl);
    void sendToTradingDesk({
      title: `Trade closed · ${c.instrument}`,
      body: `${who}${pl ? `${pl}` : 'position closed'}`,
      url: '/?screen=history',
      tag: `vts-close-${c.instrument}`,
    }).catch(() => {});
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
}

export interface HistoryGroup {
  label: string;
  count: number;
  wins: number;
  losses: number;
  realizedPl: number | null; // gated
}

export interface HistorySummary {
  closed: number;
  wins: number;
  losses: number;
  winRate: number; // 0..1 over closed trades with a known P/L
  totalRealizedPl: number | null; // gated
  byStrategy: HistoryGroup[];
  byInstrument: HistoryGroup[];
}

export interface HistoryData {
  trades: HistoryRecord[];
  summary: HistorySummary;
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
  };
}

function groupBy(
  rows: TradingPositionRow[],
  pick: (r: TradingPositionRow) => string | null,
  canSeeBalances: boolean,
): HistoryGroup[] {
  const map = new Map<string, { count: number; wins: number; losses: number; pl: number }>();
  for (const r of rows) {
    const label = (pick(r) ?? '—').trim() || '—';
    const g = map.get(label) ?? { count: 0, wins: 0, losses: 0, pl: 0 };
    g.count += 1;
    if (r.realizedPl != null) {
      g.pl += r.realizedPl;
      if (r.realizedPl >= 0) g.wins += 1;
      else g.losses += 1;
    }
    map.set(label, g);
  }
  return [...map.entries()]
    .map(([label, g]) => ({
      label,
      count: g.count,
      wins: g.wins,
      losses: g.losses,
      realizedPl: canSeeBalances ? g.pl : null,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function getHistory(
  viewerId: string,
  canSeeBalances: boolean,
  viewerIsDemo = false,
): Promise<HistoryData> {
  // The public demo is sandboxed off the real desk: it never sees teammates'
  // closed trades (and its own showcase has no closed positions), so its History
  // is empty rather than a window into real accounts.
  if (viewerIsDemo) {
    return {
      trades: [],
      summary: { closed: 0, wins: 0, losses: 0, winRate: 0, totalRealizedPl: canSeeBalances ? 0 : null, byStrategy: [], byInstrument: [] },
    };
  }

  // Shared desk history: every trading-team member's closed positions, tagged
  // with the owner. Joined live with users so a teammate who loses trading
  // access drops off, mirroring the Live Wall and Trade Log.
  const joined = await db
    .select({ pos: tradingPositions, username: users.username, roles: users.roles })
    .from(tradingPositions)
    .innerJoin(users, eq(users.id, tradingPositions.userId))
    .where(eq(tradingPositions.status, 'closed'))
    .orderBy(desc(tradingPositions.closedAt));

  const visible = joined.filter(
    (r) =>
      // Drop the demo account: it's a sandbox, so its positions never surface as
      // "demo"-tagged rows in a real trader's shared history.
      r.username !== DEMO_USERNAME && canAccessWorkspace(parseRoles({ roles: r.roles }), 'trading'),
  );
  const rows = visible.map((r) => r.pos);
  const ownerOf = new Map(visible.map((r) => [r.pos.id, r.username]));

  let wins = 0;
  let losses = 0;
  let scored = 0;
  let totalPl = 0;
  for (const r of rows) {
    if (r.realizedPl != null) {
      totalPl += r.realizedPl;
      scored += 1;
      if (r.realizedPl >= 0) wins += 1;
      else losses += 1;
    }
  }

  return {
    trades: rows.map((r) => toRecord(r, ownerOf.get(r.id) ?? '', viewerId, canSeeBalances)),
    summary: {
      closed: rows.length,
      wins,
      losses,
      winRate: scored > 0 ? wins / scored : 0,
      totalRealizedPl: canSeeBalances ? totalPl : null,
      byStrategy: groupBy(rows, (r) => r.strategy, canSeeBalances),
      byInstrument: groupBy(rows, (r) => r.instrument, canSeeBalances),
    },
  };
}
