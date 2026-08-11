import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
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

export const DEFAULT_REPEAT_PREFS: AlertRepeatPrefs = {
  repeatEverySeconds: DEFAULT_REPEAT_EVERY_SECONDS,
  repeatForSeconds: DEFAULT_REPEAT_FOR_SECONDS,
};

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

export async function getRepeatPrefs(userId: string): Promise<AlertRepeatPrefs> {
  const row = (
    await db.select().from(alertPrefs).where(eq(alertPrefs.userId, userId)).limit(1)
  )[0];
  if (!row) return { ...DEFAULT_REPEAT_PREFS };
  // Normalized on READ as well as write: a row stored before a bound moved must
  // never hand Pushover a value it will refuse.
  return normalizeRepeatPrefs({
    repeatEverySeconds: row.repeatEverySeconds,
    repeatForSeconds: row.repeatForSeconds,
  });
}

export async function setRepeatPrefs(
  userId: string,
  input: Partial<AlertRepeatPrefs>,
): Promise<AlertRepeatPrefs> {
  const next = normalizeRepeatPrefs(input);
  const now = new Date();
  await db
    .insert(alertPrefs)
    .values({
      id: crypto.randomUUID(),
      userId,
      repeatEverySeconds: next.repeatEverySeconds,
      repeatForSeconds: next.repeatForSeconds,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: alertPrefs.userId,
      set: {
        repeatEverySeconds: next.repeatEverySeconds,
        repeatForSeconds: next.repeatForSeconds,
        updatedAt: now,
      },
    });
  return next;
}
