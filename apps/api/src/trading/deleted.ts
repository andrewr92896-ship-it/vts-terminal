import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingTrades, tradingPositions, users, type TradeSide } from '../db/schema.js';
import { canAccessWorkspace, parseRoles } from '../auth/rbac.js';
import { DEMO_USERNAME } from '../demo/identity.js';
import { scopedTraderIds, type Viewer } from './scope.js';
import { ownTradesOnly, type TradeDeleteScope } from './deleteAccess.js';

// The Deleted Trades section: soft-deleted trades (hand-logged + broker-imported)
// that a trader can restore if they removed the wrong one. Team-scoped exactly
// like the Trade Log / History, so a trader only sees their own team's deleted
// rows, tagged with the owner.

export interface DeletedTradeRecord {
  id: string;
  kind: 'manual' | 'broker'; // which table it came from (hand-logged vs broker)
  ownerId: string;
  owner: string;
  isMine: boolean;
  broker: string | null;
  instrument: string;
  side: TradeSide;
  status: 'open' | 'closed';
  units: number;
  entryPrice: number;
  exitPrice: number | null;
  realizedPl: number | null;
  openedAt: number | null;
  closedAt: number | null; // null while the trade was still open when it was removed
  deletedAt: number; // ms — when it was removed (newest first)
}

export async function listDeletedTrades(
  viewer: Viewer,
  viewerIsDemo = false,
): Promise<{ trades: DeletedTradeRecord[] }> {
  if (viewerIsDemo) return { trades: [] };
  const scopeIds = await scopedTraderIds(viewer);

  const [manual, positions] = await Promise.all([
    db
      .select({ t: tradingTrades, username: users.username, roles: users.roles })
      .from(tradingTrades)
      .innerJoin(users, eq(users.id, tradingTrades.userId))
      .where(isNotNull(tradingTrades.deletedAt)),
    db
      .select({ p: tradingPositions, username: users.username, roles: users.roles })
      .from(tradingPositions)
      .innerJoin(users, eq(users.id, tradingPositions.userId))
      .where(isNotNull(tradingPositions.deletedAt)),
  ]);

  const out: DeletedTradeRecord[] = [];
  const visible = (userId: string, username: string, roles: string | null) =>
    scopeIds.has(userId) && username !== DEMO_USERNAME && canAccessWorkspace(parseRoles({ roles }), 'trading');

  for (const r of manual) {
    if (!visible(r.t.userId, r.username, r.roles) || !r.t.deletedAt) continue;
    out.push({
      id: r.t.id,
      kind: 'manual',
      ownerId: r.t.userId,
      owner: r.username,
      isMine: r.t.userId === viewer.id,
      broker: r.t.broker,
      instrument: r.t.instrument,
      side: r.t.side as TradeSide,
      status: r.t.status === 'open' ? 'open' : 'closed',
      units: r.t.units,
      entryPrice: r.t.entryPrice,
      exitPrice: r.t.exitPrice,
      realizedPl: r.t.realizedPl,
      openedAt: r.t.openedAt ? r.t.openedAt.getTime() : null,
      closedAt: r.t.closedAt ? r.t.closedAt.getTime() : null,
      deletedAt: r.t.deletedAt.getTime(),
    });
  }
  for (const r of positions) {
    if (!visible(r.p.userId, r.username, r.roles) || !r.p.deletedAt) continue;
    const opened = r.p.openedAt ?? r.p.firstSeenAt;
    out.push({
      id: r.p.id,
      kind: 'broker',
      ownerId: r.p.userId,
      owner: r.username,
      isMine: r.p.userId === viewer.id,
      broker: r.p.broker,
      instrument: r.p.instrument,
      side: r.p.side as TradeSide,
      status: r.p.status === 'closed' ? 'closed' : 'open',
      units: r.p.units,
      entryPrice: r.p.entryPrice,
      exitPrice: r.p.exitPrice,
      realizedPl: r.p.status === 'closed' ? r.p.realizedPl : null,
      openedAt: opened.getTime(),
      closedAt: r.p.status === 'closed' && r.p.closedAt ? r.p.closedAt.getTime() : null,
      deletedAt: r.p.deletedAt.getTime(),
    });
  }

  out.sort((a, b) => b.deletedAt - a.deletedAt);
  return { trades: out };
}

// Restore a soft-deleted trade by clearing its delete marker. Whoever may delete
// a trade may put it back: the same `scope` gates both (own trades by default; a
// team leader / Delete-trades grantee reaches their team, an admin anyone — see
// deleteAccess.ts). Tries the hand-logged table first, then broker positions
// (ids don't collide). Returns true when a row was restored.
export async function restoreDeleted(userId: string, id: string, scope?: TradeDeleteScope): Promise<boolean> {
  const reach = scope ?? ownTradesOnly(userId);
  const owners = [...reach.ownerIds];

  const ownTrade = reach.any
    ? eq(tradingTrades.id, id)
    : and(eq(tradingTrades.id, id), inArray(tradingTrades.userId, owners));
  const tradeWhere = and(ownTrade, isNotNull(tradingTrades.deletedAt));
  const t = (await db.select({ id: tradingTrades.id }).from(tradingTrades).where(tradeWhere).limit(1))[0];
  if (t) {
    await db.update(tradingTrades).set({ deletedAt: null, updatedAt: new Date() }).where(tradeWhere);
    return true;
  }

  const ownPos = reach.any
    ? eq(tradingPositions.id, id)
    : and(eq(tradingPositions.id, id), inArray(tradingPositions.userId, owners));
  const posWhere = and(ownPos, isNotNull(tradingPositions.deletedAt));
  const p = (await db.select({ id: tradingPositions.id }).from(tradingPositions).where(posWhere).limit(1))[0];
  if (p) {
    await db.update(tradingPositions).set({ deletedAt: null }).where(posWhere);
    return true;
  }
  return false;
}
