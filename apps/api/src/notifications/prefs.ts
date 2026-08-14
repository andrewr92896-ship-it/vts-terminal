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

// How loud an event is. The boolean beside it still decides WHETHER you hear
// about the event; this decides what the phone does when you do.
//
//   silent    — shows on the phone, no sound, no vibration
//   normal    — ordinary alert, respects the quiet hours set in the Pushover app
//   alert     — sounds through those quiet hours (what everything sent before)
//   repeating — repeats until acknowledged, and the only level iOS lets through
//               silent mode and Focus
//
// **Pushover only.** Web push has no equivalent — a browser notification is a
// browser notification — so a level never changes whether a phone (web push)
// notification is sent, only how Pushover delivers its copy.
export const NOTIF_LEVELS = ['silent', 'normal', 'alert', 'repeating'] as const;
export type NotifLevel = (typeof NOTIF_LEVELS)[number];

// The Pushover priority each level maps to. Kept here rather than in the
// Pushover module so the ladder and its meaning are one thing to read.
export const LEVEL_PRIORITY: Record<NotifLevel, number> = {
  silent: -1,
  normal: 0,
  alert: 1,
  repeating: 2,
};

// 'alert' is what every notification sent before levels existed, so it is both
// the column default and the fallback for an unrecognised stored value — a
// level nobody recognises must never silence an alert somebody is relying on.
export const DEFAULT_LEVEL: NotifLevel = 'alert';

export function isNotifLevel(v: unknown): v is NotifLevel {
  return typeof v === 'string' && (NOTIF_LEVELS as readonly string[]).includes(v);
}

function toLevel(v: string): NotifLevel {
  return isNotifLevel(v) ? v : DEFAULT_LEVEL;
}

export interface NotifPrefFlags {
  open: boolean;
  close: boolean;
  placeSl: boolean;
  moveSl: boolean;
  placeTp: boolean;
  moveTp: boolean;
}

export type NotifPrefLevels = Record<NotifEvent, NotifLevel>;

// Everything on — the default applied when a recipient has no stored row.
export const DEFAULT_PREF_FLAGS: NotifPrefFlags = {
  open: true,
  close: true,
  placeSl: true,
  moveSl: true,
  placeTp: true,
  moveTp: true,
};

export const DEFAULT_PREF_LEVELS: NotifPrefLevels = {
  open: DEFAULT_LEVEL,
  close: DEFAULT_LEVEL,
  placeSl: DEFAULT_LEVEL,
  moveSl: DEFAULT_LEVEL,
  placeTp: DEFAULT_LEVEL,
  moveTp: DEFAULT_LEVEL,
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

function rowToLevels(row: NotificationPrefRow): NotifPrefLevels {
  return {
    open: toLevel(row.levelOpen),
    close: toLevel(row.levelClose),
    placeSl: toLevel(row.levelPlaceSl),
    moveSl: toLevel(row.levelMoveSl),
    placeTp: toLevel(row.levelPlaceTp),
    moveTp: toLevel(row.levelMoveTp),
  };
}

// Narrow a set of candidate recipients to those who want `event` about
// `ownerId`, AND say how loud each of them wants it. A candidate with no stored
// row for that owner keeps the defaults (on, at 'alert') — the behaviour before
// either setting existed — so this only ever removes recipients who explicitly
// muted the event.
//
// One query answers both halves deliberately: web push needs the recipient
// list and Pushover needs the list plus the level, and reading them separately
// is how the two channels come to disagree about who is being notified.
export async function recipientLevelsForEvent(
  candidates: string[],
  ownerId: string,
  event: NotifEvent,
): Promise<Map<string, NotifLevel>> {
  const out = new Map<string, NotifLevel>();
  if (candidates.length === 0) return out;
  const ids = [...new Set(candidates)];
  const rows = await db
    .select()
    .from(notificationPrefs)
    .where(and(eq(notificationPrefs.targetUserId, ownerId), inArray(notificationPrefs.userId, ids)));
  const byUser = new Map(rows.map((r) => [r.userId, r]));
  for (const id of ids) {
    const row = byUser.get(id);
    if (row && !rowToFlags(row)[event]) continue; // explicitly muted
    out.set(id, row ? rowToLevels(row)[event] : DEFAULT_LEVEL);
  }
  return out;
}

// The same, for a caller that only needs to know WHO — web push, which has no
// level to apply.
export async function recipientsWantingEvent(
  candidates: string[],
  ownerId: string,
  event: NotifEvent,
): Promise<string[]> {
  if (candidates.length === 0) return candidates;
  const wanted = await recipientLevelsForEvent(candidates, ownerId, event);
  return candidates.filter((id) => wanted.has(id));
}

// All of a recipient's stored prefs, keyed by the watched trader's id. Missing
// keys mean "default (everything on)"; the caller fills those in from the target
// list so the UI can render a row per teammate.
export async function getPrefsFor(
  userId: string,
): Promise<Record<string, { flags: NotifPrefFlags; levels: NotifPrefLevels }>> {
  const rows = await db
    .select()
    .from(notificationPrefs)
    .where(eq(notificationPrefs.userId, userId));
  const out: Record<string, { flags: NotifPrefFlags; levels: NotifPrefLevels }> = {};
  for (const r of rows) out[r.targetUserId] = { flags: rowToFlags(r), levels: rowToLevels(r) };
  return out;
}

// Upsert one recipient→trader preference. Keyed by the (userId, targetUserId)
// unique constraint so re-saving the same pair updates in place.
//
// Levels are optional so a caller changing only the on/off flags leaves them
// alone — the panel saves the whole row, but a partial write must never silently
// reset somebody's repeating alert back to 'alert'.
export async function setPref(
  userId: string,
  targetUserId: string,
  flags: NotifPrefFlags,
  levels?: Partial<NotifPrefLevels>,
): Promise<void> {
  const now = new Date();
  const lv = { ...DEFAULT_PREF_LEVELS, ...levels };
  const levelCols = {
    levelOpen: lv.open,
    levelClose: lv.close,
    levelPlaceSl: lv.placeSl,
    levelMoveSl: lv.moveSl,
    levelPlaceTp: lv.placeTp,
    levelMoveTp: lv.moveTp,
  };
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
      ...levelCols,
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
        // Only written when the caller supplied them — see above.
        ...(levels ? levelCols : {}),
        updatedAt: now,
      },
    });
}
