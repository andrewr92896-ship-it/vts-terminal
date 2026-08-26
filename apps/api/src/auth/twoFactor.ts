import crypto from 'node:crypto';
import { eq, lt, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { loginChallenges, terminalTrustedDevices, users, type UserRow } from '../db/schema.js';
import { config } from '../config.js';
import { mailConfigured, sendMail } from '../employee/mailer.js';

const OTP_DIGITS = 6;
export const MAX_LOGIN_OTP_ATTEMPTS = 5;
export const LOGIN_OTP_RESEND_COOLDOWN_MS = 30_000;

export const LOGIN_CHALLENGE_COOKIE = `${config.PRIVATE_SESSION_COOKIE}_challenge`;
export const TERMINAL_DEVICE_COOKIE = `${config.PRIVATE_SESSION_COOKIE}_device`;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function loginChallengeCookieOptions(maxAgeSeconds?: number) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.isProd || config.COOKIE_SECURE,
    signed: true,
    ...(maxAgeSeconds != null ? { maxAge: maxAgeSeconds } : {}),
  };
}

export function terminalDeviceCookieOptions(maxAgeSeconds?: number) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: config.isProd || config.COOKIE_SECURE,
    signed: true,
    ...(maxAgeSeconds != null ? { maxAge: maxAgeSeconds } : {}),
  };
}

function challengeTtlMs(): number {
  return config.AUTH_2FA_CODE_TTL_MINUTES * 60 * 1000;
}

function trustTtlMs(): number {
  return config.AUTH_2FA_REMEMBER_DAYS * 24 * 60 * 60 * 1000;
}

export function generateLoginOtp(): string {
  return String(crypto.randomInt(0, 10 ** OTP_DIGITS)).padStart(OTP_DIGITS, '0');
}

export function hashLoginOtp(code: string): string {
  return crypto.createHash('sha256').update(code.replace(/\D/g, '')).digest('hex');
}

export function loginOtpMatches(storedHash: string, submitted: string): boolean {
  const presented = hashLoginOtp(submitted);
  const a = Buffer.from(storedHash);
  const b = Buffer.from(presented);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function maskLoginEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain || !local) return 'your email';
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${'•'.repeat(Math.max(3, local.length - head.length))}@${domain}`;
}

async function sendLoginOtp(user: UserRow, code: string, ip: string): Promise<boolean> {
  if (!user.email || !mailConfigured()) return false;
  const minutes = config.AUTH_2FA_CODE_TTL_MINUTES;
  return sendMail({
    to: user.email,
    subject: 'Your VTS Terminal sign-in code',
    text: [
      `${user.displayName},`,
      '',
      `Your VTS Terminal sign-in code is ${code}`,
      '',
      `It expires in ${minutes} minutes and can be used once.`,
      `The request came from ${ip || 'an unknown address'}.`,
      '',
      'If this was not you, change your password and contact an administrator.',
      '',
      'Vitalis Trading Systems',
    ].join('\n'),
  });
}

export async function beginLoginChallenge(
  user: UserRow,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<{ token: string; maxAgeSeconds: number; sentTo: string } | null> {
  if (!user.email || !mailConfigured()) return null;
  const previous = (
    await db.select().from(loginChallenges).where(eq(loginChallenges.userId, user.id)).limit(1)
  )[0];
  if (
    previous &&
    Date.now() - previous.sentAt.getTime() < LOGIN_OTP_RESEND_COOLDOWN_MS
  ) {
    return null;
  }
  const token = crypto.randomBytes(32).toString('hex');
  const code = generateLoginOtp();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + challengeTtlMs());

  // One live terminal challenge per account. A fresh password sign-in replaces
  // the previous attempt so old codes cannot remain usable in another browser.
  await db.delete(loginChallenges).where(eq(loginChallenges.userId, user.id));
  await db.insert(loginChallenges).values({
    id: hashToken(token),
    userId: user.id,
    codeHash: hashLoginOtp(code),
    attempts: 0,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
    createdAt: now,
    sentAt: now,
    expiresAt,
  });

  const delivered = await sendLoginOtp(user, code, meta.ip ?? '');
  if (!delivered) {
    await db.delete(loginChallenges).where(eq(loginChallenges.id, hashToken(token)));
    return null;
  }

  return {
    token,
    maxAgeSeconds: Math.floor(challengeTtlMs() / 1000),
    sentTo: maskLoginEmail(user.email),
  };
}

export type LoginChallengeResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'missing' | 'expired' | 'invalid' | 'attempts' };

export async function verifyLoginChallenge(
  rawToken: string | undefined,
  code: string,
): Promise<LoginChallengeResult> {
  if (!rawToken) return { ok: false, reason: 'missing' };
  const id = hashToken(rawToken);
  const row = (await db.select().from(loginChallenges).where(eq(loginChallenges.id, id)).limit(1))[0];
  if (!row) return { ok: false, reason: 'missing' };
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(loginChallenges).where(eq(loginChallenges.id, id));
    return { ok: false, reason: 'expired' };
  }
  if (!loginOtpMatches(row.codeHash, code)) {
    await db
      .update(loginChallenges)
      .set({ attempts: sql`${loginChallenges.attempts} + 1` })
      .where(eq(loginChallenges.id, id));
    const attempts =
      (await db
        .select({ attempts: loginChallenges.attempts })
        .from(loginChallenges)
        .where(eq(loginChallenges.id, id))
        .limit(1))[0]?.attempts ?? MAX_LOGIN_OTP_ATTEMPTS;
    if (attempts >= MAX_LOGIN_OTP_ATTEMPTS) {
      await db.delete(loginChallenges).where(eq(loginChallenges.id, id));
      return { ok: false, reason: 'attempts' };
    }
    return { ok: false, reason: 'invalid' };
  }
  await db.delete(loginChallenges).where(eq(loginChallenges.id, id));
  return { ok: true, userId: row.userId };
}

export async function resendLoginChallenge(
  rawToken: string | undefined,
  user: UserRow,
  ip: string,
): Promise<{ ok: true; sentTo: string } | { ok: false; retryAfter?: number }> {
  if (!rawToken || !user.email || !mailConfigured()) return { ok: false };
  const id = hashToken(rawToken);
  const row = (await db.select().from(loginChallenges).where(eq(loginChallenges.id, id)).limit(1))[0];
  if (!row || row.userId !== user.id || row.expiresAt.getTime() < Date.now()) return { ok: false };
  const remaining = LOGIN_OTP_RESEND_COOLDOWN_MS - (Date.now() - row.sentAt.getTime());
  if (remaining > 0) return { ok: false, retryAfter: Math.ceil(remaining / 1000) };

  const code = generateLoginOtp();
  if (!(await sendLoginOtp(user, code, ip))) return { ok: false };
  const now = new Date();
  await db
    .update(loginChallenges)
    .set({
      codeHash: hashLoginOtp(code),
      attempts: 0,
      sentAt: now,
      expiresAt: new Date(now.getTime() + challengeTtlMs()),
    })
    .where(eq(loginChallenges.id, id));
  return { ok: true, sentTo: maskLoginEmail(user.email) };
}

export async function challengeUser(rawToken: string | undefined): Promise<UserRow | null> {
  if (!rawToken) return null;
  const id = hashToken(rawToken);
  const row = (await db.select().from(loginChallenges).where(eq(loginChallenges.id, id)).limit(1))[0];
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  return (await db.select().from(users).where(eq(users.id, row.userId)).limit(1))[0] ?? null;
}

export async function destroyLoginChallenge(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  await db.delete(loginChallenges).where(eq(loginChallenges.id, hashToken(rawToken)));
}

export async function rememberTerminalDevice(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<{ token: string; maxAgeSeconds: number }> {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  await db.insert(terminalTrustedDevices).values({
    id: hashToken(token),
    userId,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
    createdAt: now,
    lastUsedAt: now,
    expiresAt: new Date(now.getTime() + trustTtlMs()),
  });
  return { token, maxAgeSeconds: Math.floor(trustTtlMs() / 1000) };
}

export async function terminalDeviceTrusted(
  userId: string,
  rawToken: string | undefined,
): Promise<boolean> {
  if (!rawToken) return false;
  const id = hashToken(rawToken);
  const row = (
    await db.select().from(terminalTrustedDevices).where(eq(terminalTrustedDevices.id, id)).limit(1)
  )[0];
  if (!row || row.userId !== userId) return false;
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(terminalTrustedDevices).where(eq(terminalTrustedDevices.id, id));
    return false;
  }
  await db
    .update(terminalTrustedDevices)
    .set({ lastUsedAt: new Date() })
    .where(eq(terminalTrustedDevices.id, id));
  return true;
}

export async function forgetTerminalDevicesForUser(userId: string): Promise<void> {
  await db.delete(terminalTrustedDevices).where(eq(terminalTrustedDevices.userId, userId));
}

export async function purgeExpiredTerminalAuth(): Promise<void> {
  const now = new Date();
  await db.delete(loginChallenges).where(lt(loginChallenges.expiresAt, now));
  await db.delete(terminalTrustedDevices).where(lt(terminalTrustedDevices.expiresAt, now));
}
