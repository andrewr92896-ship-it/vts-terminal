import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';

// Trade-data visibility boundary. Actual trade information (the Live Wall, Trade
// Log, History, and live broker capital) is NOT shared across the whole install:
// a viewer sees only the trades of their own team, or — if they belong to no
// team — only their own. Every shared read funnels its owner filter through
// scopedTraderIds so the boundary is defined in exactly one place.

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
