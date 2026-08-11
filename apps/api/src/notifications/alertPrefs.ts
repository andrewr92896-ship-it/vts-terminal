import crypto from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { alertPrefs } from '../db/schema.js';

// How often a 'repeating' alert repeats, and for how long, before Pushover
// gives up. One row per user — anything worth waking somebody for wants the
// same urgency, so this is deliberately NOT per watched trader.
//
// The bounds are Pushover's own, not ours: it refuses a priority-2 message with
// a retry under 30 seconds or an expiry over 3 hours. They are clamped rather
// than rejected, because the cost of refusing a save here is an alert that does
// not repeat at all, which is the opposite of what the user asked for.

export const REPEAT_EVERY_MIN_SECONDS = 30;
export const REPEAT_EVERY_MAX_SECONDS = 3600; // an hour between buzzes is already well past useful
export const REPEAT_FOR_MIN_SECONDS = 30;
export const REPEAT_FOR_MAX_SECONDS = 10800; // Pushover's hard ceiling: 3 hours

// Five minutes of repeats at half-minute intervals. Long enough to wake
// somebody, short enough that an alert nobody answered stops on its own.
export const DEFAULT_REPEAT_EVERY_SECONDS = 30;
export const DEFAULT_REPEAT_FOR_SECONDS = 300;

export interface AlertRepeatPrefs {
  repeatEverySeconds: number;
  repeatForSeconds: number;
}

// The two account-level switches. Both default ON, matching the convention
// notification_prefs follows — an account with no stored row hears about
// everything — so nothing already working goes quiet on deploy.
export interface AlertSwitches {
  // The master switch: off silences every channel on every device for this
  // account. Per ACCOUNT, unlike phone notifications which are per device.
  accountAlerts: boolean;
  // Whether somebody else in this user's private group may buzz their phone.
  groupAlerts: boolean;
}

export type AlertPrefs = AlertRepeatPrefs & AlertSwitches;

export const DEFAULT_REPEAT_PREFS: AlertRepeatPrefs = {
  repeatEverySeconds: DEFAULT_REPEAT_EVERY_SECONDS,
  repeatForSeconds: DEFAULT_REPEAT_FOR_SECONDS,
};

export const DEFAULT_SWITCHES: AlertSwitches = { accountAlerts: true, groupAlerts: true };
export const DEFAULT_ALERT_PREFS: AlertPrefs = { ...DEFAULT_REPEAT_PREFS, ...DEFAULT_SWITCHES };

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(v)));
}

// Clamp a pair into what Pushover will accept. `repeatFor` is additionally
// floored at `repeatEvery`: an alert that expires before its first retry would
// be a repeating alert that never repeats, which reads as the feature being
// broken rather than as a setting being unusual.
export function normalizeRepeatPrefs(input: Partial<AlertRepeatPrefs>): AlertRepeatPrefs {
  const every = clamp(
    input.repeatEverySeconds ?? DEFAULT_REPEAT_EVERY_SECONDS,
    REPEAT_EVERY_MIN_SECONDS,
    REPEAT_EVERY_MAX_SECONDS,
  );
  const forSecs = clamp(
    input.repeatForSeconds ?? DEFAULT_REPEAT_FOR_SECONDS,
    Math.max(REPEAT_FOR_MIN_SECONDS, every),
    REPEAT_FOR_MAX_SECONDS,
  );
  return { repeatEverySeconds: every, repeatForSeconds: forSecs };
}

export async function getAlertPrefs(userId: string): Promise<AlertPrefs> {
  const row = (
    await db.select().from(alertPrefs).where(eq(alertPrefs.userId, userId)).limit(1)
  )[0];
  if (!row) return { ...DEFAULT_ALERT_PREFS };
  return {
    // Normalized on READ as well as write: a row stored before a bound moved
    // must never hand Pushover a value it will refuse.
    ...normalizeRepeatPrefs({
      repeatEverySeconds: row.repeatEverySeconds,
      repeatForSeconds: row.repeatForSeconds,
    }),
    accountAlerts: row.accountAlerts,
    groupAlerts: row.groupAlerts,
  };
}

export async function getRepeatPrefs(userId: string): Promise<AlertRepeatPrefs> {
  const { repeatEverySeconds, repeatForSeconds } = await getAlertPrefs(userId);
  return { repeatEverySeconds, repeatForSeconds };
}

// Narrow a set of candidate recipients to those whose ACCOUNT switch is on.
// Applied by both send channels, so the switch means what it says rather than
// governing only whichever feature happened to remember it.
//
// A user with no row is included: no row means never touched, which is on.
export async function filterAccountAlerts(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return userIds;
  const rows = await db
    .select({ userId: alertPrefs.userId, on: alertPrefs.accountAlerts })
    .from(alertPrefs)
    .where(inArray(alertPrefs.userId, [...new Set(userIds)]));
  const off = new Set(rows.filter((r) => !r.on).map((r) => r.userId));
  return userIds.filter((id) => !off.has(id));
}

// The same, for the group nudge: both switches have to be on. Somebody who has
// silenced their account has silenced this too — the master switch is a
// superset, not a parallel setting.
export async function recipientsAcceptingGroupAlerts(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return userIds;
  const rows = await db
    .select({
      userId: alertPrefs.userId,
      account: alertPrefs.accountAlerts,
      group: alertPrefs.groupAlerts,
    })
    .from(alertPrefs)
    .where(inArray(alertPrefs.userId, [...new Set(userIds)]));
  const off = new Set(rows.filter((r) => !r.account || !r.group).map((r) => r.userId));
  return userIds.filter((id) => !off.has(id));
}

export async function setAlertPrefs(
  userId: string,
  input: Partial<AlertPrefs>,
): Promise<AlertPrefs> {
  const current = await getAlertPrefs(userId);
  const next: AlertPrefs = {
    ...normalizeRepeatPrefs({
      repeatEverySeconds: input.repeatEverySeconds ?? current.repeatEverySeconds,
      repeatForSeconds: input.repeatForSeconds ?? current.repeatForSeconds,
    }),
    accountAlerts: input.accountAlerts ?? current.accountAlerts,
    groupAlerts: input.groupAlerts ?? current.groupAlerts,
  };
  const now = new Date();
  await db
    .insert(alertPrefs)
    .values({
      id: crypto.randomUUID(),
      userId,
      repeatEverySeconds: next.repeatEverySeconds,
      repeatForSeconds: next.repeatForSeconds,
      accountAlerts: next.accountAlerts,
      groupAlerts: next.groupAlerts,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: alertPrefs.userId,
      set: {
        repeatEverySeconds: next.repeatEverySeconds,
        repeatForSeconds: next.repeatForSeconds,
        accountAlerts: next.accountAlerts,
        groupAlerts: next.groupAlerts,
        updatedAt: now,
      },
    });
  return next;
}

export async function setRepeatPrefs(
  userId: string,
  input: Partial<AlertRepeatPrefs>,
): Promise<AlertRepeatPrefs> {
  return setAlertPrefs(userId, input);
}
