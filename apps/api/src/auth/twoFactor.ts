import crypto from 'node:crypto';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { loginChallenges, terminalTrustedDevices, users, type UserRow } from '../db/schema.js';
import { config } from '../config.js';
import { mailConfigured, sendMail } from '../employee/mailer.js';
import {
  LOGIN_OTP_RESEND_COOLDOWN_MS,
  purgeStaleTerminalAuthLimits,
  reserveTerminalTwoFactorSend,
} from './twoFactorRateLimit.js';

const OTP_DIGITS = 6;
export const MAX_LOGIN_OTP_ATTEMPTS = 5;

export const LOGIN_CHALLENGE_COOKIE = `${config.PRIVATE_SESSION_COOKIE}_challenge`;
export const TERMINAL_DEVICE_COOKIE = `${config.PRIVATE_SESSION_COOKIE}_device`;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizedOtp(code: string): string {
  return code.replace(/\D/g, '');
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

export function hashLoginOtp(challengeId: string, code: string): string {
  return crypto
    .createHmac('sha256', `vts-terminal-login-otp:${config.SESSION_SECRET}`)
    .update(challengeId)
    .update(':')
    .update(normalizedOtp(code))
    .digest('hex');
}

export function loginOtpMatches(storedHash: string, submitted: string, challengeId: string): boolean {
  const presented = hashLoginOtp(challengeId, submitted);
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

export interface LoginOtpMessage {
  to: string;
  code: string;
  name: string;
  expiresInMinutes: number;
  ip: string;
}

export interface LoginTwoFactorDelivery {
  configured(): boolean;
  send(message: LoginOtpMessage): Promise<boolean>;
}

async function sendLoginOtp(message: LoginOtpMessage): Promise<boolean> {
  return sendMail({
    to: message.to,
    subject: 'Your VTS Terminal sign-in code',
    text: [
      `${message.name},`,
      '',
      `Your VTS Terminal sign-in code is ${message.code}`,
      '',
      `It expires in ${message.expiresInMinutes} minutes and can be used once.`,
      `The request came from ${message.ip || 'an unknown address'}.`,
      '',
      'If this was not you, change your password and contact an administrator.',
      '',
      'Vitalis Trading Systems',
    ].join('\n'),
  });
}

export const defaultLoginTwoFactorDelivery: LoginTwoFactorDelivery = {
  configured: mailConfigured,
  send: sendLoginOtp,
};

export type BeginLoginChallengeResult =
  | { ok: true; token: string; maxAgeSeconds: number; sentTo: string }
  | { ok: false; reason: 'unconfigured' | 'limited' | 'delivery'; retryAfter?: number };

export async function beginLoginChallenge(
  user: UserRow,
  meta: { ip?: string | null; userAgent?: string | null },
  delivery: LoginTwoFactorDelivery = defaultLoginTwoFactorDelivery,
): Promise<BeginLoginChallengeResult> {
  if (!user.email || !delivery.configured()) return { ok: false, reason: 'unconfigured' };
  const reservation = await reserveTerminalTwoFactorSend(user.id, meta.ip ?? '');
  if (!reservation.ok) return { ok: false, reason: 'limited', retryAfter: reservation.retryAfter };

  const token = crypto.randomBytes(32).toString('hex');
  const id = hashToken(token);
  const code = generateLoginOtp();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + challengeTtlMs());
  const codeHash = hashLoginOtp(id, code);

  await db
    .insert(loginChallenges)
    .values({
      id, userId: user.id, codeHash, attempts: 0,
      ip: meta.ip ?? null, userAgent: meta.userAgent ?? null,
      createdAt: now, sentAt: now, expiresAt,
    })
    .onConflictDoUpdate({
      target: loginChallenges.userId,
      set: {
        id, codeHash, attempts: 0,
        ip: meta.ip ?? null, userAgent: meta.userAgent ?? null,
        createdAt: now, sentAt: now, expiresAt,
      },
    });

  let delivered = false;
  try {
    delivered = await delivery.send({
      to: user.email,
      code,
      name: user.displayName,
      expiresInMinutes: config.AUTH_2FA_CODE_TTL_MINUTES,
      ip: meta.ip ?? '',
    });
  } catch {
    delivered = false;
  }
  if (!delivered) {
    await db.delete(loginChallenges).where(eq(loginChallenges.id, id));
    return { ok: false, reason: 'delivery' };
  }
  return {
    ok: true,
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
  const now = new Date();
  if (row.expiresAt.getTime() <= now.getTime()) {
    await db.delete(loginChallenges).where(eq(loginChallenges.id, id));
    return { ok: false, reason: 'expired' };
  }
  if (!loginOtpMatches(row.codeHash, code, id)) {
    const updated = await db
      .update(loginChallenges)
      .set({ attempts: sql`${loginChallenges.attempts} + 1` })
      .where(and(eq(loginChallenges.id, id), lt(loginChallenges.attempts, MAX_LOGIN_OTP_ATTEMPTS)))
      .returning({ attempts: loginChallenges.attempts });
    const attempts = updated[0]?.attempts ?? MAX_LOGIN_OTP_ATTEMPTS;
    if (attempts >= MAX_LOGIN_OTP_ATTEMPTS) {
      await db.delete(loginChallenges).where(eq(loginChallenges.id, id));
      return { ok: false, reason: 'attempts' };
    }
    return { ok: false, reason: 'invalid' };
  }
  const consumed = await db
    .delete(loginChallenges)
    .where(and(
      eq(loginChallenges.id, id),
      eq(loginChallenges.codeHash, row.codeHash),
      gt(loginChallenges.expiresAt, now),
      lt(loginChallenges.attempts, MAX_LOGIN_OTP_ATTEMPTS),
    ))
    .returning({ userId: loginChallenges.userId });
  return consumed[0] ? { ok: true, userId: consumed[0].userId } : { ok: false, reason: 'missing' };
}

export async function resendLoginChallenge(
  rawToken: string | undefined,
  user: UserRow,
  ip: string,
  delivery: LoginTwoFactorDelivery = defaultLoginTwoFactorDelivery,
): Promise<
  | { ok: true; sentTo: string }
  | { ok: false; reason: 'missing' | 'limited' | 'delivery'; retryAfter?: number }
> {
  if (!rawToken || !user.email || !delivery.configured()) return { ok: false, reason: 'delivery' };
  const id = hashToken(rawToken);
  const row = (await db.select().from(loginChallenges).where(eq(loginChallenges.id, id)).limit(1))[0];
  if (!row || row.userId !== user.id || row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: 'missing' };
  }
  const remaining = LOGIN_OTP_RESEND_COOLDOWN_MS - (Date.now() - row.sentAt.getTime());
  if (remaining > 0) {
    return { ok: false, reason: 'limited', retryAfter: Math.ceil(remaining / 1000) };
  }
  const reservation = await reserveTerminalTwoFactorSend(user.id, ip);
  if (!reservation.ok) return { ok: false, reason: 'limited', retryAfter: reservation.retryAfter };

  const code = generateLoginOtp();
  const now = new Date();
  const nextHash = hashLoginOtp(id, code);
  const updated = await db
    .update(loginChallenges)
    .set({
      codeHash: nextHash,
      attempts: 0,
      sentAt: now,
      expiresAt: new Date(now.getTime() + challengeTtlMs()),
    })
    .where(and(
      eq(loginChallenges.id, id),
      eq(loginChallenges.userId, user.id),
      eq(loginChallenges.codeHash, row.codeHash),
      gt(loginChallenges.expiresAt, now),
    ))
    .returning({ id: loginChallenges.id });
  if (!updated[0]) return { ok: false, reason: 'missing' };

  let delivered = false;
  try {
    delivered = await delivery.send({
      to: user.email,
      code,
      name: user.displayName,
      expiresInMinutes: config.AUTH_2FA_CODE_TTL_MINUTES,
      ip,
    });
  } catch {
    delivered = false;
  }
  if (!delivered) {
    await db.delete(loginChallenges).where(and(
      eq(loginChallenges.id, id),
      eq(loginChallenges.codeHash, nextHash),
    ));
    return { ok: false, reason: 'delivery' };
  }
  return { ok: true, sentTo: maskLoginEmail(user.email) };
}

export async function challengeUser(rawToken: string | undefined): Promise<UserRow | null> {
  if (!rawToken) return null;
  const id = hashToken(rawToken);
  const row = (await db.select().from(loginChallenges).where(eq(loginChallenges.id, id)).limit(1))[0];
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(loginChallenges).where(eq(loginChallenges.id, id));
    return null;
  }
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
  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(terminalTrustedDevices).where(eq(terminalTrustedDevices.id, id));
    return false;
  }
  await db.update(terminalTrustedDevices).set({ lastUsedAt: new Date() }).where(eq(terminalTrustedDevices.id, id));
  return true;
}

export async function forgetTerminalDevice(
  rawToken: string | undefined,
  userId?: string,
): Promise<void> {
  if (!rawToken) return;
  const id = hashToken(rawToken);
  if (userId) {
    await db.delete(terminalTrustedDevices).where(and(
      eq(terminalTrustedDevices.id, id),
      eq(terminalTrustedDevices.userId, userId),
    ));
    return;
  }
  await db.delete(terminalTrustedDevices).where(eq(terminalTrustedDevices.id, id));
}

export async function forgetTerminalDevicesForUser(userId: string): Promise<void> {
  await db.delete(terminalTrustedDevices).where(eq(terminalTrustedDevices.userId, userId));
}

export async function forgetTerminalAuthForUser(userId: string): Promise<void> {
  await Promise.all([
    db.delete(loginChallenges).where(eq(loginChallenges.userId, userId)),
    db.delete(terminalTrustedDevices).where(eq(terminalTrustedDevices.userId, userId)),
  ]);
}

export async function purgeExpiredTerminalAuth(): Promise<void> {
  const now = new Date();
  await Promise.all([
    db.delete(loginChallenges).where(lt(loginChallenges.expiresAt, now)),
    db.delete(terminalTrustedDevices).where(lt(terminalTrustedDevices.expiresAt, now)),
    purgeStaleTerminalAuthLimits(now),
  ]);
}
