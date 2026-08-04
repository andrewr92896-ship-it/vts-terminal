import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';


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
// Private mode (`shareBook`) used to filter the visibility set. It is gone: with
// visibility self-only there was nothing left for it to hide, so a switch
// offering the choice would have been promising something already true. The
// column survives untouched — see features/service.ts.

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
// SINCE 2026-08 THIS IS ALWAYS EXACTLY THE VIEWER (owner decision). Nobody sees
// anybody else's trade metrics — not a teammate's, not a team member's if you
// lead the team, not another founder's. Positions, the trade log, history,
// deleted trades and live broker capital are each trader's own and nobody
// else's.
//
// The reason is regulatory rather than technical. A screen showing one trader's
// results to another is the raw material for an implied track record, and a
// platform that publishes one is a long way from "informational only" — which is
// the posture the whole product is built to hold at public launch. It is also
// why the desk's own metrics carry the "not proof of performance" rule in Site
// Help: they can be edited and trades can be deleted, so they were never
// evidence of anything to begin with.
//
// This function is kept — rather than deleted and its eight call sites changed
// to pass the viewer's own id — precisely so the boundary stays defined in one
// place and stays easy to widen again. If a shared desk ever comes back, it
// comes back here and every read follows.
//
// Administrators are unaffected: their install-wide reach for support comes from
// isAdmin() paths that never pass through this file.
//
// NOTE the contrast with scopedTraderIds above, which is unchanged and still
// team-wide. That one answers "who should RECEIVE this" — a TradingView alert is
// a signal the desk is sending its members, not a report of anyone's book, so it
// still reaches the team. Do not collapse the two.
export async function visibleTraderIds(viewer: Viewer): Promise<Set<string>> {
  return new Set([viewer.id]);
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
  return new Set([ownerId]);
}
