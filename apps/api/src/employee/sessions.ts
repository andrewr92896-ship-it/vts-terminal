import crypto from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  employeeSessions,
  users,
  type EmployeeSessionRow,
  type EmployeeSessionStage,
  type UserRow,
} from '../db/schema.js';
import { config } from '../config.js';

// Sessions for the employee portal — deliberately NOT the main portal's
// `sessions` table or `vts_session` cookie. Signing into vitalistradingsystems.com
// grants nothing at /employee and vice versa: the two surfaces share an origin
// and a user table, and nothing else.
//
// Differences from the main session, all in the strict direction:
//   • `__Host-` cookie prefix in production — the browser itself then refuses
//     the cookie unless it is Secure, host-only (no Domain) and Path=/, which
//     shuts down subdomain-injection attacks on it.
//   • SameSite=Strict rather than Lax — the cookie is never attached to a
//     request that originated anywhere but this site.
//   • A short absolute lifetime (default 8h) *and* an idle timeout (default
//     30m), instead of a 14-day rolling window.
//   • A CSRF token derived per session (see employeeCsrfToken).

// `__Host-` is only legal on a Secure cookie, so the dev name (plain HTTP) drops
// the prefix. Everything else about the cookie is identical.
export const EMPLOYEE_COOKIE = config.COOKIE_SECURE ? '__Host-vts_employee' : 'vts_employee';

// The header the browser must echo the CSRF token back in.
export const EMPLOYEE_CSRF_HEADER = 'x-vts-employee-csrf';

const ABSOLUTE_MS = config.EMPLOYEE_SESSION_HOURS * 60 * 60 * 1000;
const IDLE_MS = config.EMPLOYEE_IDLE_MINUTES * 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// `__Host-` requires Path=/ and no Domain, which is also what we want anyway:
// the cookie has to reach /api/employee/*, not just the /employee page.
export function employeeCookieOptions(maxAgeSeconds?: number) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: config.COOKIE_SECURE,
    signed: true,
    ...(maxAgeSeconds != null ? { maxAge: maxAgeSeconds } : {}),
  };
}

// The CSRF token for a session, derived rather than stored: an HMAC of the
// session's id under the app secret. Deriving it means a database copy contains
// no usable token, and the value is stable across page reloads without us having
// to hand it back out of storage. The browser cannot read the httpOnly session
// cookie, so an off-site page can never compute or replay this.
export function employeeCsrfToken(sessionId: string): string {
  return crypto
    .createHmac('sha256', `vts-employee-csrf:${config.SESSION_SECRET}`)
    .update(sessionId)
    .digest('hex');
}

export function csrfMatches(sessionId: string, presented: string | undefined): boolean {
  if (!presented) return false;
  const expected = employeeCsrfToken(sessionId);
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export interface CreatedEmployeeSession {
  token: string;
  maxAgeSeconds: number;
  csrfToken: string;
}

export async function createEmployeeSession(
  userId: string,
  stage: EmployeeSessionStage,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<CreatedEmployeeSession> {
  const token = crypto.randomBytes(32).toString('hex');
  const id = hashToken(token);
  const now = new Date();
  await db.insert(employeeSessions).values({
    id,
    userId,
    stage,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + ABSOLUTE_MS),
  });
  return {
    token,
    // The cookie is capped at the absolute session lifetime; the idle timeout is
    // enforced server-side on every lookup regardless of what the browser keeps.
    maxAgeSeconds: Math.floor(ABSOLUTE_MS / 1000),
    csrfToken: employeeCsrfToken(id),
  };
}

export interface ResolvedEmployeeSession {
  session: EmployeeSessionRow;
  user: UserRow;
}

// Resolve a raw cookie token to its session + user, enforcing both the absolute
// expiry and the idle timeout. Anything stale is deleted on the spot rather than
// left to linger.
export async function resolveEmployeeSession(
  token: string | undefined,
): Promise<ResolvedEmployeeSession | null> {
  if (!token) return null;
  const id = hashToken(token);
  const rows = await db.select().from(employeeSessions).where(eq(employeeSessions.id, id)).limit(1);
  const session = rows[0];
  if (!session) return null;

  const now = Date.now();
  const idleOut = now - session.lastSeenAt.getTime() > IDLE_MS;
  if (session.expiresAt.getTime() < now || idleOut) {
    await db.delete(employeeSessions).where(eq(employeeSessions.id, id));
    return null;
  }

  const userRows = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  const user = userRows[0];
  // A deactivated account loses its employee session immediately, not at expiry.
  if (!user || !user.active) {
    await db.delete(employeeSessions).where(eq(employeeSessions.id, id));
    return null;
  }

  return { session, user };
}

// Push the idle window forward. Called once per authenticated request, after the
// guard has accepted it.
export async function touchEmployeeSession(id: string): Promise<void> {
  await db
    .update(employeeSessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(employeeSessions.id, id));
}

export async function promoteEmployeeSession(id: string): Promise<void> {
  await db.update(employeeSessions).set({ stage: 'active' }).where(eq(employeeSessions.id, id));
}

export async function destroyEmployeeSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(employeeSessions).where(eq(employeeSessions.id, hashToken(token)));
}

export async function destroyEmployeeSessionById(id: string, userId: string): Promise<void> {
  await db
    .delete(employeeSessions)
    .where(and(eq(employeeSessions.id, id), eq(employeeSessions.userId, userId)));
}

// Revoke every employee session for a user — used when access is revoked, the
// second factor is reset, or the account is suspended.
export async function destroyEmployeeSessionsForUser(userId: string): Promise<void> {
  await db.delete(employeeSessions).where(eq(employeeSessions.userId, userId));
}

export async function listEmployeeSessions(userId: string): Promise<EmployeeSessionRow[]> {
  const rows = await db
    .select()
    .from(employeeSessions)
    .where(eq(employeeSessions.userId, userId));
  return rows.sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
}

// Housekeeping: drop rows whose absolute expiry has passed. Cheap and safe to
// call opportunistically (we run it on sign-in).
export async function purgeExpiredEmployeeSessions(): Promise<void> {
  await db.delete(employeeSessions).where(lt(employeeSessions.expiresAt, new Date()));
}
