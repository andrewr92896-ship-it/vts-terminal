import crypto from 'node:crypto';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions, users } from '../db/schema.js';
import { config } from '../config.js';
import { applyPreview, type PreviewedUser } from '../dev/preview.js';
import { isPrivateUserAllowed } from './privateAccess.js';

export const SESSION_COOKIE = config.PRIVATE_SESSION_COOKIE;

/** The session id a request is authenticated by — what a preview is stored on. */
export function sessionIdForToken(token: string): string {
  return hashToken(token);
}
const TTL_MS = config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Cookie options shared by login (set) and logout (clear).
export function cookieOptions(maxAgeSeconds?: number) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.isProd || config.COOKIE_SECURE,
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
): Promise<PreviewedUser | null> {
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
  if (!user || !user.active || !isPrivateUserAllowed(user.id)) return null;

  // Touch last-seen without blocking the request.
  void db
    .update(sessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(sessions.id, id));

  // A developer preview is applied HERE, at the one place a request's user is
  // resolved, so every guard and every payload downstream is answered for the
  // previewed account without knowing a preview exists. `applyPreview` refuses
  // anything that would be a privilege change rather than a preview.
  return applyPreview(user, session.previewAs);
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

// Revoke every other login while preserving the request that just changed its
// password. Deleting the current row would make the successful response arrive
// in a browser that has already been signed out.
export async function destroyOtherUserSessions(
  userId: string,
  keepSessionId: string,
): Promise<void> {
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)));
}
