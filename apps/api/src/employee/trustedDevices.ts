import crypto from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { employeeTrustedDevices, type EmployeeTrustedDeviceRow } from '../db/schema.js';
import { config } from '../config.js';

// "Remember this device for 30 days."
//
// A device the employee has ticked that box on skips the emailed code at the
// next sign-in. What it never skips is the password: this shortens how often
// the second factor is asked for on a browser the employee has already proved
// they control, it does not turn the portal into a one-factor surface.
//
// The trust lives in its own cookie, separate from the session cookie, because
// the two have opposite lifetimes — the session is deliberately short (8h, 30m
// idle) and this deliberately long. Same hardening either way: `__Host-`
// prefixed in production, SameSite=Strict, httpOnly, signed, and only the
// SHA-256 of the token is stored, so a copy of the database grants nothing.
//
// Every remembered device is listed on the employee's own Security screen and
// can be revoked from there; a portal admin can drop all of someone's at once,
// and revoking employee access or suspending a record clears them too.

export const EMPLOYEE_DEVICE_COOKIE = config.COOKIE_SECURE
  ? '__Host-vts_employee_device'
  : 'vts_employee_device';

function trustMs(): number {
  return config.EMPLOYEE_REMEMBER_DEVICE_DAYS * 24 * 60 * 60 * 1000;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function deviceCookieOptions(maxAgeSeconds?: number) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: config.COOKIE_SECURE,
    signed: true,
    ...(maxAgeSeconds != null ? { maxAge: maxAgeSeconds } : {}),
  };
}

export interface CreatedTrustedDevice {
  token: string;
  maxAgeSeconds: number;
}

export async function rememberDevice(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<CreatedTrustedDevice> {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  await db.insert(employeeTrustedDevices).values({
    id: hashToken(token),
    userId,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
    createdAt: now,
    lastUsedAt: now,
    expiresAt: new Date(now.getTime() + trustMs()),
  });
  return { token, maxAgeSeconds: Math.floor(trustMs() / 1000) };
}

// Is this browser's token a live trust for this specific user? Expired rows are
// deleted on the spot rather than left to linger. The `userId` is part of the
// match, so a token issued for one account can never vouch for another.
export async function deviceTrusted(
  userId: string,
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;
  const id = hashToken(token);
  const row = (
    await db.select().from(employeeTrustedDevices).where(eq(employeeTrustedDevices.id, id)).limit(1)
  )[0];
  if (!row) return false;
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(employeeTrustedDevices).where(eq(employeeTrustedDevices.id, id));
    return false;
  }
  if (row.userId !== userId) return false;
  await db
    .update(employeeTrustedDevices)
    .set({ lastUsedAt: new Date() })
    .where(eq(employeeTrustedDevices.id, id));
  return true;
}

export async function listTrustedDevices(userId: string): Promise<EmployeeTrustedDeviceRow[]> {
  const rows = await db
    .select()
    .from(employeeTrustedDevices)
    .where(eq(employeeTrustedDevices.userId, userId));
  return rows.sort((a, b) => b.lastUsedAt.getTime() - a.lastUsedAt.getTime());
}

export function trustedDeviceId(token: string | undefined): string | null {
  return token ? hashToken(token) : null;
}

export async function forgetDevice(id: string, userId: string): Promise<void> {
  await db
    .delete(employeeTrustedDevices)
    .where(and(eq(employeeTrustedDevices.id, id), eq(employeeTrustedDevices.userId, userId)));
}

export async function forgetAllDevices(userId: string): Promise<void> {
  await db.delete(employeeTrustedDevices).where(eq(employeeTrustedDevices.userId, userId));
}

export async function purgeExpiredTrustedDevices(): Promise<void> {
  await db.delete(employeeTrustedDevices).where(lt(employeeTrustedDevices.expiresAt, new Date()));
}
