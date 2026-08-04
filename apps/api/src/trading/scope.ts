import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userFeatures, users } from '../db/schema.js';
import { isFounder, parseRoles } from '../auth/rbac.js';

// Whether this account holds the Trading Teams grant — the gate on shared trade
// visibility below.
//
// Read directly rather than through featuresForUser to avoid an import cycle
// (features/service.ts is imported by rbac.ts). Founder-level resolves to true
// with no stored row, matching featuresForUser exactly; if that rule ever
// changes, change it in both places.
async function hasTradingTeamsGrant(userId: string): Promise<boolean> {
  const row = (
    await db
      .select({ roles: users.roles, granted: userFeatures.tradingTeams })
      .from(users)
      .leftJoin(userFeatures, eq(userFeatures.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1)
  )[0];
  if (!row) return false;
  if (isFounder(parseRoles({ roles: row.roles }))) return true;
  return !!row.granted;
}


// Trade-data visibility boundary. Every shared read funnels its owner filter
// through this file, so the boundary is defined in exactly one place.
//
// THE FUNCTIONS BELOW ARE NOT INTERCHANGEABLE. The team set is used in two
// opposite directions and only one of them is about trade data:
//
//   • VISIBILITY — "whose trade data may this viewer SEE". visibleTraderIds.
//     Always the viewer alone, since 2026-08. Use it on a READ.
//   • RECIPIENTS — "who should RECEIVE this". scopedTraderIds. Still team-wide.
//     A TradingView alert is a signal the desk sends its members, not a report
//     of anyone's book, so narrowing it would cut a trader off from the alerts
//     their own desk is sending them — see trading/alerts.ts, which deliberately
//     uses this one. Use it on a SEND.
//
// notifyTraderIds is the one case that is neither: a send whose whole content is
// one trader's own position, so it follows visibility. See its comment.
//
// Private mode (`shareBook`) is not consulted. It was retired when visibility
// went self-only, and a granted team is a group that deliberately shares a book
// — reviving a per-member opt-out is a real decision, not something to infer.
// The column survives untouched, so it is there if that decision is ever made.

export interface Viewer {
  id: string;
  teamId: string | null;
}

// The set of trader userIds whose trade data `viewer` may see: everyone on the
// viewer's team, or just the viewer when they have no team. The viewer's own id
// is always included as a safety net.
export async function scopedTraderIds(viewer: Viewer): Promise<Set<string>> {
  if (!viewer.teamId) return new Set([viewer.id]);
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.teamId, viewer.teamId));
  const ids = new Set(rows.map((r) => r.id));
  ids.add(viewer.id);
  return ids;
}

// Same boundary, keyed by a userId when the caller only has the id (e.g. a
// notification about one owner's fill). Looks the owner's team up first, so a
// trade alert only reaches that owner's teammates — never the whole install.
export async function scopedTraderIdsForUser(userId: string): Promise<Set<string>> {
  const row = (
    await db.select({ teamId: users.teamId }).from(users).where(eq(users.id, userId)).limit(1)
  )[0];
  return scopedTraderIds({ id: userId, teamId: row?.teamId ?? null });
}

// The set of trader userIds whose trade data `viewer` may SEE.
//
// SELF-ONLY BY DEFAULT, and team-wide only for an account that has been GRANTED
// Trading Teams (owner decision, 2026-08).
//
// The default is what matters for public launch: a screen showing one trader's
// results to another is the raw material for an implied track record, which is a
// long way from the informational-only posture the product holds. Since teams
// are hidden and handed out by a software developer, every ordinary account —
// and every public signup — resolves to itself and nothing else.
//
// A granted team is a different situation and the owner asked for it back: those
// are people who already know each other, working a desk together, and the whole
// reason they were put on a team is to work from the same book. The grant is the
// gate, so widening this cannot reach anyone who was not deliberately given it.
//
// Administrators are unaffected: their install-wide reach for support comes from
// isAdmin() paths that never pass through this file.
//
// NOTE the contrast with scopedTraderIds above, which has always been team-wide.
// That one answers "who should RECEIVE this" — a TradingView alert is a signal
// the desk sends its members, not a report of anyone's book. Do not collapse the
// two: they agree for a granted team and disagree for everyone else, which is
// exactly the point.
export async function visibleTraderIds(viewer: Viewer): Promise<Set<string>> {
  if (!viewer.teamId) return new Set([viewer.id]);
  if (!(await hasTradingTeamsGrant(viewer.id))) return new Set([viewer.id]);
  return scopedTraderIds(viewer);
}

// The recipients of a notification ABOUT `ownerId`'s own trading — a fill, a
// close, a stop moved. Always just that trader.
//
// This is neither of the two cases above, which is why it is its own function: a
// trade notification is a SEND, but its whole content is one trader's book. It
// follows visibility rather than recipiency for that reason, and visibility is
// now self-only — a push reading "BUY 10,000 EUR/USD @ 1.0850" on a teammate's
// phone is the same disclosure as the Live Wall row, just delivered somewhere
// the screens cannot reach. Hiding the row and buzzing the phone would have left
// the leak intact and merely moved it.
//
// Team-wide notifications that are NOT about one person's positions — the
// TradingView alerts — use scopedTraderIdsForUser instead and still reach
// everyone on the team, which is the whole point of the split.
export async function notifyTraderIds(ownerId: string): Promise<Set<string>> {
  // Follows VISIBILITY, so it widens with it: on a granted team a fill reaches
  // the teammates who can already see the position on the Live Wall, and
  // nowhere else. Buzzing a phone about a book the recipient is not allowed to
  // look at would move the disclosure rather than remove it.
  const row = (
    await db.select({ teamId: users.teamId }).from(users).where(eq(users.id, ownerId)).limit(1)
  )[0];
  return visibleTraderIds({ id: ownerId, teamId: row?.teamId ?? null });
}
