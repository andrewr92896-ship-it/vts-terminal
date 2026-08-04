import type { UserRow } from '../db/schema.js';
import { isAdmin, parseRoles } from '../auth/rbac.js';

// Who may delete (and restore) whose trades.
//
// A trader deletes their own. Admins keep their install-wide reach for support.
// There is nothing in between.
//
// THE TEAM GRANT IS GONE (owner decision, 2026-08). A team leader used to be
// able to hand out a "Delete trades" permission reaching any member's rows, and
// that permission was always bounded by what the holder could SEE — deleting
// something you are not allowed to look at was never a power a team grant should
// carry. Trade visibility is self-only now (trading/scope.ts), so that bound had
// already collapsed the permission to "your own trades": it kept resolving
// through `visibleTraderIds`, which returns exactly the caller.
//
// It is written out rather than left to resolve to nothing, because a permission
// that silently does nothing is worse than one that is absent — the toggle stays
// on screen, an admin hands it out believing it works, and nobody finds out
// until somebody needs it. `canDeleteTrades` is off the team permissions UI for
// the same reason.

export interface TradeDeleteScope {
  // Unrestricted: an admin may clear any row on the install.
  any: boolean;
  // The owners whose trades may be removed; always contains the caller.
  ownerIds: Set<string>;
  // Whether the caller may remove somebody else's trade — what the UI needs to
  // decide if a Delete control belongs on another trader's row. Only ever true
  // for an admin now.
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
  return ownTradesOnly(actor.id);
}
