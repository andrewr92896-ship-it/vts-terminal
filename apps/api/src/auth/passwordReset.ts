import crypto from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db/index.js';
import {
  employeeSessions,
  employeeTrustedDevices,
  loginChallenges,
  passwordResetCredentials,
  sessions,
  terminalTrustedDevices,
  users,
  type UserRow,
} from '../db/schema.js';
import { DEMO_USERNAME } from '../demo/identity.js';
import { mailConfigured, sendMail } from '../employee/mailer.js';
import { isPrivateUserAllowed } from './privateAccess.js';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './passwords.js';

const emailSchema = z.string().trim().email().max(255);

export type PasswordResetRequestResult =
  | 'sent'
  | 'invalid'
  | 'unconfigured'
  | 'ineligible'
  | 'delivery-failed';

export interface PasswordResetMessage {
  to: string;
  temporaryPassword: string;
  expiresInMinutes: number;
}

export interface PasswordResetDelivery {
  configured(): boolean;
  send(message: PasswordResetMessage): Promise<boolean>;
}

export function normalizePasswordResetEmail(value: string): string | null {
  const parsed = emailSchema.safeParse(value);
  return parsed.success ? parsed.data.toLowerCase() : null;
}

export function generateTemporaryPassword(): string {
  // 128 bits of CSPRNG entropy, URL-safe and short enough to type. This is not
  // derived from the user, the clock, or a pseudo-random generator.
  return crypto.randomBytes(16).toString('base64url');
}

async function sendTemporaryPassword(message: PasswordResetMessage): Promise<boolean> {
  const text = [
    'A password reset was requested for your VTS Terminal account.',
    '',
    `Temporary password: ${message.temporaryPassword}`,
    '',
    `It expires in ${message.expiresInMinutes} minutes. Sign in with it once, then the terminal will require a new password.`,
    '',
    'If you did not request this, you can ignore this email; your current password has not changed.',
    '',
    'Vitalis Trading Systems',
  ].join('\n');

  return sendMail({
    to: message.to,
    subject: 'Your VTS Terminal temporary password',
    text,
  });
}

export const defaultPasswordResetDelivery: PasswordResetDelivery = {
  configured: mailConfigured,
  send: sendTemporaryPassword,
};

export function passwordResetTtlMs(): number {
  return config.PASSWORD_RESET_TTL_MINUTES * 60_000;
}

export async function purgeExpiredPasswordResets(now = new Date()): Promise<void> {
  await db.delete(passwordResetCredentials).where(lt(passwordResetCredentials.expiresAt, now));
}

// Creates and delivers a separate pending credential. The current password is
// deliberately not touched here. Delivery failure removes only the row written
// by this request, so a concurrent newer request cannot be rolled back with it.
export async function requestPasswordReset(
  rawEmail: string,
  delivery: PasswordResetDelivery = defaultPasswordResetDelivery,
  now = new Date(),
): Promise<PasswordResetRequestResult> {
  const email = normalizePasswordResetEmail(rawEmail);
  if (!email) return 'invalid';

  // Load-bearing: sendMail's no-provider fallback logs message bodies. Recovery
  // must stop before lookup, generation, hashing, or message construction when
  // no real transport exists, so plaintext can never reach that fallback.
  if (!delivery.configured()) return 'unconfigured';

  await purgeExpiredPasswordResets(now);
  const user = (
    await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), eq(users.active, true)))
      .limit(1)
  )[0];

  if (
    !user ||
    user.username === DEMO_USERNAME ||
    !isPrivateUserAllowed(user) ||
    normalizePasswordResetEmail(user.email ?? '') !== email
  ) {
    return 'ineligible';
  }

  const temporaryPassword = generateTemporaryPassword();
  const id = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + passwordResetTtlMs());
  const passwordHash = await hashPassword(temporaryPassword);

  await db
    .insert(passwordResetCredentials)
    .values({ id, userId: user.id, passwordHash, createdAt: now, expiresAt })
    .onConflictDoUpdate({
      target: passwordResetCredentials.userId,
      set: { id, passwordHash, createdAt: now, expiresAt },
    });

  let delivered = false;
  try {
    delivered = await delivery.send({
      to: email,
      temporaryPassword,
      expiresInMinutes: config.PASSWORD_RESET_TTL_MINUTES,
    });
  } catch {
    delivered = false;
  }

  if (!delivered) {
    await db.delete(passwordResetCredentials).where(eq(passwordResetCredentials.id, id));
    return 'delivery-failed';
  }
  return 'sent';
}

// Verify and consume a pending credential. Promotion, consumption, and old
// session revocation are one transaction, so two simultaneous login attempts
// cannot both spend the same reset row.
export async function promotePasswordResetCredential(
  user: UserRow,
  submittedPassword: string,
  now = new Date(),
): Promise<UserRow | null> {
  const pending = (
    await db
      .select()
      .from(passwordResetCredentials)
      .where(eq(passwordResetCredentials.userId, user.id))
      .limit(1)
  )[0];
  // Login performs a second Argon2 verification whenever the permanent
  // password fails. A dummy hash keeps the missing/expired-record path from
  // revealing whether an otherwise valid account currently has a reset email.
  const matches = await verifyPassword(pending?.passwordHash ?? DUMMY_PASSWORD_HASH, submittedPassword);
  if (!pending) return null;
  if (pending.expiresAt.getTime() <= now.getTime()) {
    await db.delete(passwordResetCredentials).where(eq(passwordResetCredentials.id, pending.id));
    return null;
  }
  if (!matches) return null;

  let promoted = false;
  await db.transaction(async (tx) => {
    const current = (
      await tx
        .select()
        .from(passwordResetCredentials)
        .where(
          and(
            eq(passwordResetCredentials.id, pending.id),
            eq(passwordResetCredentials.userId, user.id),
          ),
        )
        .limit(1)
    )[0];
    if (!current || current.expiresAt.getTime() <= now.getTime()) return;

    await tx
      .update(users)
      .set({
        passwordHash: current.passwordHash,
        mustChangePassword: true,
        updatedAt: now,
      })
      .where(eq(users.id, user.id));
    await tx.delete(passwordResetCredentials).where(eq(passwordResetCredentials.id, current.id));
    await Promise.all([
      tx.delete(sessions).where(eq(sessions.userId, user.id)),
      tx.delete(loginChallenges).where(eq(loginChallenges.userId, user.id)),
      tx.delete(terminalTrustedDevices).where(eq(terminalTrustedDevices.userId, user.id)),
      tx.delete(employeeSessions).where(eq(employeeSessions.userId, user.id)),
      tx.delete(employeeTrustedDevices).where(eq(employeeTrustedDevices.userId, user.id)),
    ]);
    promoted = true;
  });

  if (!promoted) return null;
  return (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0] ?? null;
}
