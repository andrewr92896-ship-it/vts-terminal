import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { sharingBookUserIds } from '../features/service.js';

// Trade-data visibility boundary. Actual trade information (the Live Wall, Trade
// Log, History, and live broker capital) is NOT shared across the whole install:
// a viewer sees only the trades of their own team, or — if they belong to no
// team — only their own. Every shared read funnels its owner filter through
// this file so the boundary is defined in exactly one place.
//
// THE FUNCTIONS BELOW ARE NOT INTERCHANGEABLE. Since private mode, the team set
// is used in two opposite directions, and private mode belongs on only one:
//
//   • VISIBILITY — "whose trade data may this viewer SEE". visibleTraderIds.
//     Private members are removed. Use it on a READ.
//   • RECIPIENTS — "who should RECEIVE this". scopedTraderIds. Private members
//     are kept: going private hides your book from teammates, it does not cut
//     you off from what the team sends you. Filtering here would stop a private
//     trader receiving the team's TradingView alerts — see trading/alerts.ts,
//     which deliberately uses the unfiltered set. Use it on a SEND.
//
// notifyTraderIds is the one case that is neither: a send whose whole content is
// one trader's own position. See its comment.

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

// The set of trader userIds whose trade data `viewer` may SEE: their team, less
// anyone on it running in private mode. This is the one to use on a read.
//
// The viewer's own id is always kept — private mode hides your book from other
// people, never from yourself, so a private trader's own screens are unchanged.
//
// Private is private from teammates INCLUDING THE TEAM LEADER: leading a team
// does not come with a right to read a member's positions. Administrators are
// unaffected — their install-wide reach for support comes from isAdmin() paths
// that never pass through here.
export async function visibleTraderIds(viewer: Viewer): Promise<Set<string>> {
  const ids = await scopedTraderIds(viewer);
  // Solo trader (or a team of one): nothing to filter, and no query to run.
  if (ids.size <= 1) return ids;
  const visible = await sharingBookUserIds(ids);
  visible.add(viewer.id);
  return visible;
}

// The recipients of a notification ABOUT `ownerId`'s own trading — a fill, a
// close, a stop moved. Their team normally; just them while they are private.
//
// This is neither of the two cases above, which is why it is its own function: a
// trade notification is a SEND, but its whole content is one trader's book. A
// private trader whose "BUY 10,000 EUR/USD @ 1.0850" still buzzed every
// teammate's phone would not be private in any sense that matters, however clean
// their row on the Live Wall looked. They keep receiving their own.
//
// Team-wide notifications that are not about one person's positions — the
// TradingView alerts — use scopedTraderIdsForUser instead and reach everyone.
export async function notifyTraderIds(ownerId: string): Promise<Set<string>> {
  const ids = await scopedTraderIdsForUser(ownerId);
  if (ids.size <= 1) return ids;
  const sharing = await sharingBookUserIds(new Set([ownerId]));
  return sharing.has(ownerId) ? ids : new Set([ownerId]);
}
