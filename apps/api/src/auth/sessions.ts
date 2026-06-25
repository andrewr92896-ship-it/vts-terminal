import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions, users, type UserRow } from '../db/schema.js';
import { config } from '../config.js';

export const SESSION_COOKIE = 'vts_session';
const TTL_MS = config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
// Only persist last-seen this often. Every authenticated request would
// otherwise write to the sessions row; throttling keeps "last seen" accurate
// to within a few minutes while cutting a DB write off the hot path.
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Cookie options shared by login (set) and logout (clear).
export function cookieOptions(maxAgeSeconds?: number) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.COOKIE_SECURE,
    signed: true,
    ...(maxAgeSeconds != null ? { maxAge: maxAgeSeconds } : {}),
  };
}

// Create a session for a user and return the raw token to put in the cookie.
export async function createSession(
  userId: string,
  userAgent?: string,
): Promise<{ token: string; maxAgeSeconds: number }> {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_MS);
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    createdAt: now,
    expiresAt,
    lastSeenAt: now,
    userAgent: userAgent ?? null,
  });
  return { token, maxAgeSeconds: Math.floor(TTL_MS / 1000) };
}

// Resolve a raw cookie token to its active user, or null. Expired sessions
// are deleted lazily on lookup.
export async function getUserForToken(
  token: string | undefined,
): Promise<UserRow | null> {
  if (!token) return null;
  const id = hashToken(token);
  const rows = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  const session = rows[0];
  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  const user = userRows[0];
  if (!user || !user.active) return null;

  // Touch last-seen without blocking the request, but at most once per throttle
  // window so a chatty client doesn't write on every request.
  if (Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    void db
      .update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(sessions.id, id));
  }

  return user;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

// Revoke every active session for a user — used when an admin resets a
// password or deactivates an account, so existing logins stop working.
export async function destroyUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
