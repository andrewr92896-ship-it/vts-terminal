import type { UserRow } from '../db/schema.js';
import { isAdmin, parseRoles } from '../auth/rbac.js';
import { getEffectivePermissions } from '../userTeams/service.js';
import { scopedTraderIds } from './scope.js';

// Who may delete (and restore) whose trades.
//
// A trader can always remove their own. Removing somebody else's is a team
// grant, handed out from My Portal ▸ Trading Team: the **team leader** holds
// every permission implicitly, and they can give the **Delete trades**
// permission (`canDeleteTrades`) to any member. Admins keep their install-wide
// reach over the shared desk, as they always had.
//
// Every non-admin grant is bounded by the team's trade-visibility boundary
// (trading/scope.ts), so a leader can only ever clear rows their own desk can
// already see — the permission widens *whose* trades, never *which* desk.

export interface TradeDeleteScope {
  // Unrestricted: an admin may clear any row on the install.
  any: boolean;
  // The owners whose trades may be removed; always contains the caller.
  ownerIds: Set<string>;
  // Whether the caller may remove somebody else's trade — what the UI needs to
  // decide if a Delete control belongs on a teammate's row.
  others: boolean;
}

// The default reach: your own trades and nothing else.
export function ownTradesOnly(userId: string): TradeDeleteScope {
  return { any: false, ownerIds: new Set([userId]), others: false };
}

// Resolve how far `actor`'s delete reaches. Called once per request and threaded
// into removeTrade / removePosition / restoreDeleted, which turn it into the
// owner filter on their WHERE clause.
export async function tradeDeleteScope(actor: UserRow): Promise<TradeDeleteScope> {
  if (isAdmin(parseRoles(actor))) {
    return { any: true, ownerIds: new Set([actor.id]), others: true };
  }
  // Leader ⇒ every permission (getEffectivePermissions resolves that for us).
  const perms = await getEffectivePermissions(actor.id);
  if (!perms?.canDeleteTrades) return ownTradesOnly(actor.id);
  const ownerIds = await scopedTraderIds(actor);
  ownerIds.add(actor.id);
  // A solo trader with the permission still only has their own trades to reach.
  return { any: false, ownerIds, others: ownerIds.size > 1 };
}
