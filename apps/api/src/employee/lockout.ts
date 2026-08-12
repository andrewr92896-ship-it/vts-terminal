import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { employeeLoginAttempts } from '../db/schema.js';

// Progressive lockout for employee-portal sign-ins.
//
// The main terminal has no login throttle at all (see AGENTS.md) — this surface
// does, because it is the one an attacker would actually target. Two counters
// are kept for every attempt: one keyed on the account and one on the source
// address, so neither spraying a single account from a botnet nor working
// through many accounts from one address gets unlimited tries.
//
// Counters live in the database rather than memory so a restart (a deploy, a
// crash) does not hand an attacker a fresh budget.

// Failures → how long the key is locked afterwards.
const LADDER: { fails: number; lockMs: number }[] = [
  { fails: 5, lockMs: 60_000 }, // 1 minute
  { fails: 8, lockMs: 5 * 60_000 }, // 5 minutes
  { fails: 10, lockMs: 15 * 60_000 }, // 15 minutes
  { fails: 12, lockMs: 60 * 60_000 }, // 1 hour
];

// A run of failures that has gone quiet for this long starts over, so an honest
// person who mistyped a password last week is not carrying it around.
const DECAY_MS = 60 * 60 * 1000;

export function userKey(userId: string): string {
  return `user:${userId}`;
}

export function ipKey(ip: string): string {
  return `ip:${ip}`;
}

function lockFor(fails: number): number | null {
  let ms: number | null = null;
  for (const rung of LADDER) if (fails >= rung.fails) ms = rung.lockMs;
  return ms;
}

export interface LockState {
  locked: boolean;
  retryAfterSeconds: number;
}

// Is any of these keys currently locked? Checked before the password is even
// verified, so a locked key costs an attacker a request and nothing else.
export async function checkLock(keys: string[]): Promise<LockState> {
  if (!keys.length) return { locked: false, retryAfterSeconds: 0 };
  const rows = await db
    .select()
    .from(employeeLoginAttempts)
    .where(inArray(employeeLoginAttempts.id, keys));
  const now = Date.now();
  let until = 0;
  for (const row of rows) {
    const lockedUntil = row.lockedUntil?.getTime() ?? 0;
    if (lockedUntil > now) until = Math.max(until, lockedUntil);
  }
  return until > now
    ? { locked: true, retryAfterSeconds: Math.ceil((until - now) / 1000) }
    : { locked: false, retryAfterSeconds: 0 };
}

// Record a failed attempt against every key and return the resulting lock state.
export async function recordFailure(keys: string[]): Promise<LockState> {
  const now = new Date();
  let until = 0;
  for (const key of keys) {
    const existing = (
      await db.select().from(employeeLoginAttempts).where(eq(employeeLoginAttempts.id, key)).limit(1)
    )[0];

    // A quiet hour resets the run rather than compounding it forever.
    const stale = existing && now.getTime() - existing.lastFailAt.getTime() > DECAY_MS;
    const fails = existing && !stale ? existing.fails + 1 : 1;
    const lockMs = lockFor(fails);
    const lockedUntil = lockMs ? new Date(now.getTime() + lockMs) : null;
    if (lockedUntil) until = Math.max(until, lockedUntil.getTime());

    if (existing) {
      await db
        .update(employeeLoginAttempts)
        .set({
          fails,
          firstFailAt: stale ? now : existing.firstFailAt,
          lastFailAt: now,
          lockedUntil,
        })
        .where(eq(employeeLoginAttempts.id, key));
    } else {
      await db.insert(employeeLoginAttempts).values({
        id: key,
        fails,
        firstFailAt: now,
        lastFailAt: now,
        lockedUntil,
      });
    }
  }
  const nowMs = Date.now();
  return until > nowMs
    ? { locked: true, retryAfterSeconds: Math.ceil((until - nowMs) / 1000) }
    : { locked: false, retryAfterSeconds: 0 };
}

// A completed sign-in clears the counters for those keys.
export async function clearFailures(keys: string[]): Promise<void> {
  if (!keys.length) return;
  await db.delete(employeeLoginAttempts).where(inArray(employeeLoginAttempts.id, keys));
}
