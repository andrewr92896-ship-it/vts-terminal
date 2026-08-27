import crypto from 'node:crypto';
import { config } from '../config.js';
import { sendMail } from './mailer.js';

// The Employee Portal's second factor: a six-digit code emailed to the
// employee's company sign-in address.
//
// What makes it a second factor rather than theatre:
//   • The code is random, not derived — `crypto.randomInt` is uniform over the
//     whole range, so there is no modulo bias to shave the search space with.
//   • Only its SHA-256 is stored, on the one session that asked for it. The
//     plaintext exists in the employee's inbox and nowhere else on this server.
//   • It expires (EMPLOYEE_OTP_TTL_MINUTES) and is single-use — the session's
//     stored hash is cleared the instant it is accepted, so a code read off a
//     screen or a forwarded email cannot be replayed.
//   • Guesses against it are capped (MAX_ATTEMPTS) *and* fed to the account
//     lockout ladder, so a six-digit space cannot be walked within one window.
//
// The delivery address is `users.email`, which the guard has already required
// to be on the company domain — so the code can only ever land in a company
// mailbox, never at whatever address someone typed into the sign-in form.

const DIGITS = 6;

// Wrong guesses allowed against one code before it is burned and a fresh one
// must be requested. Low on purpose: six digits is only a million values, and
// an attacker who has the password already has everything but this.
export const MAX_OTP_ATTEMPTS = 5;

// Minimum gap between sends for one sign-in attempt. Stops the resend button
// being turned into a way to flood somebody's inbox.
export const OTP_RESEND_COOLDOWN_MS = 30_000;

export function otpTtlMs(): number {
  return config.EMPLOYEE_OTP_TTL_MINUTES * 60 * 1000;
}

export function generateOtpCode(): string {
  return String(crypto.randomInt(0, 10 ** DIGITS)).padStart(DIGITS, '0');
}

export function hashOtpCode(code: string): string {
  return crypto.createHash('sha256').update(code.replace(/\D/g, '')).digest('hex');
}

// Compare a submitted code against the stored hash without leaking where they
// diverge. Hashing first means both sides are always the same length.
export function otpMatches(storedHash: string, submitted: string): boolean {
  const presented = hashOtpCode(submitted);
  const a = Buffer.from(storedHash);
  const b = Buffer.from(presented);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Send a code. Returns whether it actually left over SMTP — see mailer.ts for
// why an unconfigured server logs it instead of failing the sign-in.
export async function sendOtpEmail(
  to: string,
  code: string,
  meta: { name: string; ip: string },
): Promise<boolean> {
  const minutes = config.EMPLOYEE_OTP_TTL_MINUTES;
  const text = [
    `${meta.name},`,
    '',
    `Your Employee Portal sign-in code is ${code}`,
    '',
    `It expires in ${minutes} minutes and can be used once.`,
    `The request came from ${meta.ip || 'an unknown address'}.`,
    '',
    'If this was not you, your password may be known to someone else — change it and tell a portal administrator.',
    '',
    'Vitalis Trading Systems',
  ].join('\n');

  return sendMail({
    to,
    // The code stays out of the subject. Subjects show up in lock-screen and
    // desktop notification previews, and are retained in more places than
    // bodies are (relay logs, DLP/MDM indexes) — which would undo the property
    // that the plaintext lives in the employee's inbox and nowhere else.
    subject: 'Your Employee Portal sign-in code',
    text,
  });
}
