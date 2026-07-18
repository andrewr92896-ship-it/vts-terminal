import crypto from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { notificationPrefs, type NotificationPrefRow } from '../db/schema.js';

// Per-user notification preferences: which teammate a trader wants trade
// notifications about, and — per teammate — which trade events buzz them. The
// recipient filtering for a fired event runs through `recipientsWantingEvent`;
// the settings UI reads/writes through `getPrefsFor` / `setPref`.
//
// Default when a recipient has NO row for a given trader: every event is on.
// That preserves the historical behaviour (a whole-team feed) for anyone who
// never opens the settings, and means a new teammate is heard by default.

// The trade events a recipient can toggle per watched trader. "place" vs "move"
// distinguishes adding a stop/target where there was none from repricing an
// existing one; both SL and TP carry the split.
export const NOTIF_EVENTS = ['open', 'close', 'placeSl', 'moveSl', 'placeTp', 'moveTp'] as const;
export type NotifEvent = (typeof NOTIF_EVENTS)[number];

export interface NotifPrefFlags {
  open: boolean;
  close: boolean;
  placeSl: boolean;
  moveSl: boolean;
  placeTp: boolean;
  moveTp: boolean;
}

// Everything on — the default applied when a recipient has no stored row.
export const DEFAULT_PREF_FLAGS: NotifPrefFlags = {
  open: true,
  close: true,
  placeSl: true,
  moveSl: true,
  placeTp: true,
  moveTp: true,
};

function rowToFlags(row: NotificationPrefRow): NotifPrefFlags {
  return {
    open: row.notifyOpen,
    close: row.notifyClose,
    placeSl: row.notifyPlaceSl,
    moveSl: row.notifyMoveSl,
    placeTp: row.notifyPlaceTp,
    moveTp: row.notifyMoveTp,
  };
}

// Narrow a set of candidate recipients to those who want `event` about `ownerId`.
// A candidate with no stored pref row for that owner keeps the default (on), so
// filtering only ever removes recipients who explicitly muted this event.
export async function recipientsWantingEvent(
  candidates: string[],
  ownerId: string,
  event: NotifEvent,
): Promise<string[]> {
  if (candidates.length === 0) return candidates;
  const ids = [...new Set(candidates)];
  const rows = await db
    .select()
    .from(notificationPrefs)
    .where(and(eq(notificationPrefs.targetUserId, ownerId), inArray(notificationPrefs.userId, ids)));
  const byUser = new Map(rows.map((r) => [r.userId, rowToFlags(r)]));
  return candidates.filter((id) => {
    const flags = byUser.get(id);
    return flags ? flags[event] : true; // no row → default on
  });
}

// All of a recipient's stored prefs, keyed by the watched trader's id. Missing
// keys mean "default (everything on)"; the caller fills those in from the target
// list so the UI can render a row per teammate.
export async function getPrefsFor(userId: string): Promise<Record<string, NotifPrefFlags>> {
  const rows = await db
    .select()
    .from(notificationPrefs)
    .where(eq(notificationPrefs.userId, userId));
  const out: Record<string, NotifPrefFlags> = {};
  for (const r of rows) out[r.targetUserId] = rowToFlags(r);
  return out;
}

// Upsert one recipient→trader preference. Keyed by the (userId, targetUserId)
// unique constraint so re-saving the same pair updates in place.
export async function setPref(
  userId: string,
  targetUserId: string,
  flags: NotifPrefFlags,
): Promise<void> {
  const now = new Date();
  await db
    .insert(notificationPrefs)
    .values({
      id: crypto.randomUUID(),
      userId,
      targetUserId,
      notifyOpen: flags.open,
      notifyClose: flags.close,
      notifyPlaceSl: flags.placeSl,
      notifyMoveSl: flags.moveSl,
      notifyPlaceTp: flags.placeTp,
      notifyMoveTp: flags.moveTp,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [notificationPrefs.userId, notificationPrefs.targetUserId],
      set: {
        notifyOpen: flags.open,
        notifyClose: flags.close,
        notifyPlaceSl: flags.placeSl,
        notifyMoveSl: flags.moveSl,
        notifyPlaceTp: flags.placeTp,
        notifyMoveTp: flags.moveTp,
        updatedAt: now,
      },
    });
}
