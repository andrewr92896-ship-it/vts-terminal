import crypto from 'node:crypto';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { smsNumbers } from '../db/schema.js';
import { config } from '../config.js';
import { filterAccountAlerts } from './alertPrefs.js';
import { channelRecipients, type AlertCategory } from './channels.js';

// Text-message delivery, over Twilio's HTTPS API.
//
// **Port 443, deliberately** — the same reason Resend is preferred over SMTP
// for the Employee Portal's sign-in codes: most PaaS hosts block outbound SMTP,
// and a block presents as a connection timeout rather than any error from the
// provider, because the provider is never reached. 443 cannot be blocked
// without breaking the app itself.
//
// Everything is best-effort: a send failure never throws into the alert path.
//
// THREE PROPERTIES SEPARATE THIS FROM THE OTHER TWO CHANNELS, and each shapes
// what belongs here:
//
//   • **Every message costs money**, per message, to the terminal's owner
//     rather than to the recipient. So a text is sent once and never repeated —
//     there is no SMS equivalent of a `repeating` Pushover alert, and adding one
//     would be an unbounded bill attached to a button.
//   • **It reaches a phone with nothing installed on it.** That is the whole
//     point of the channel, and it is also why a wrong number is so much worse
//     here than a wrong Pushover key: a stranger gets somebody else's trading
//     alerts with no way to stop them but replying STOP.
//   • **There is no title, no icon and no deep link** — a text is one short
//     block of plain characters. So the title and body are composed into one
//     line rather than sent as separate fields that nothing would render.

const API_ROOT = 'https://api.twilio.com/2010-04-01';

export function smsConfigured(): boolean {
  return !!(
    config.TWILIO_ACCOUNT_SID &&
    config.TWILIO_AUTH_TOKEN &&
    (config.TWILIO_MESSAGING_SERVICE_SID || config.TWILIO_FROM_NUMBER)
  );
}

// ---------------------------------------------------------------------------
// The number itself
// ---------------------------------------------------------------------------

// Normalize what somebody typed into E.164, or refuse it.
//
// **A 10-digit number is read as US/Canada (+1) and nothing else is guessed.**
// That is a deliberate limit rather than an oversight: guessing a country from a
// bare local number is how a text lands in the wrong country, and this terminal
// is a US product. Anything international has to be typed with its own `+`,
// which is unambiguous.
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const plus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (plus) {
    // E.164 allows 1–15 digits after the '+'; a country code is at least one.
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

// What to show on screen. Never the whole number — this appears on a settings
// panel that somebody may be screen-sharing, and the last four digits are all
// anybody needs to confirm it is the right phone.
export function maskPhone(e164: string): string {
  const tail = e164.slice(-4);
  return `••• ••• ${tail}`;
}

export interface SmsStatus {
  configured: boolean;
  // The number currently claimed, masked. Null when none has been given.
  phone: string | null;
  verified: boolean;
  // A code has been sent and has not expired — the panel shows the code box.
  awaitingCode: boolean;
}

export async function getSmsStatus(userId: string, now: Date = new Date()): Promise<SmsStatus> {
  const row = await rowFor(userId);
  const pending = !!(row?.codeHash && row.codeExpiresAt && row.codeExpiresAt.getTime() > now.getTime());
  return {
    configured: smsConfigured(),
    phone: row ? maskPhone(row.phone) : null,
    verified: !!row?.verifiedAt,
    awaitingCode: pending,
  };
}

async function rowFor(userId: string) {
  return (await db.select().from(smsNumbers).where(eq(smsNumbers.userId, userId)).limit(1))[0] ?? null;
}

/** A verified number, or null. The only thing a send path may read. */
export async function verifiedNumber(userId: string): Promise<string | null> {
  const row = await rowFor(userId);
  return row?.verifiedAt ? row.phone : null;
}

export async function removeSmsNumber(userId: string): Promise<void> {
  await db.delete(smsNumbers).where(eq(smsNumbers.userId, userId));
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export const CODE_TTL_MINUTES = 10;
export const CODE_MAX_ATTEMPTS = 5;
// Per ACCOUNT, not per request — see the schema comment. A per-request cooldown
// is no cooldown at all, because the flood is made by asking again.
export const CODE_COOLDOWN_SECONDS = 30;

export class SmsError extends Error {}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

// `crypto.randomInt` rather than Math.random and rather than a modulo of random
// bytes, which is biased. Padded so a code beginning with a zero is still six
// digits on screen.
function newCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

// Send a fresh verification code to a number. Claims the number (clearing any
// previous verification, so an edit can never inherit the old number's proof)
// and returns whether the text actually went out.
export async function startVerification(
  userId: string,
  rawPhone: string,
  now: Date = new Date(),
): Promise<{ phone: string; delivered: boolean }> {
  if (!smsConfigured()) throw new SmsError('Text alerts are not set up on the server yet.');
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    throw new SmsError('That doesn’t look like a mobile number. Use 10 digits, or start with + and the country code.');
  }

  const existing = await rowFor(userId);
  if (existing?.lastSentAt) {
    const waited = (now.getTime() - existing.lastSentAt.getTime()) / 1000;
    if (waited < CODE_COOLDOWN_SECONDS) {
      throw new SmsError(`Wait ${Math.ceil(CODE_COOLDOWN_SECONDS - waited)}s before asking for another code.`);
    }
  }

  const code = newCode();
  const expires = new Date(now.getTime() + CODE_TTL_MINUTES * 60_000);
  await db
    .insert(smsNumbers)
    .values({
      userId,
      phone,
      // A new code always means an unproved number, even when the phone is
      // unchanged: the proof is of the code, not of the row.
      verifiedAt: null,
      codeHash: hashCode(code),
      codeExpiresAt: expires,
      codeAttempts: 0,
      lastSentAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: smsNumbers.userId,
      set: {
        phone,
        verifiedAt: null,
        codeHash: hashCode(code),
        codeExpiresAt: expires,
        codeAttempts: 0,
        lastSentAt: now,
        updatedAt: now,
      },
    });

  const delivered = await sendOne(
    phone,
    `${code} is your VTS Terminal verification code. It expires in ${CODE_TTL_MINUTES} minutes.`,
  );
  return { phone, delivered };
}

// Check a code. Correct → the number is verified and the code is burned.
//
// Wrong guesses are capped per code: at the cap the code is destroyed and a
// fresh one has to be requested, so a six-digit space cannot be walked.
export async function confirmVerification(
  userId: string,
  input: string,
  now: Date = new Date(),
): Promise<void> {
  const row = await rowFor(userId);
  if (!row?.codeHash || !row.codeExpiresAt) throw new SmsError('Ask for a code first.');
  if (row.codeExpiresAt.getTime() <= now.getTime()) {
    await clearCode(userId, now);
    throw new SmsError('That code has expired — ask for a new one.');
  }
  if (row.codeAttempts >= CODE_MAX_ATTEMPTS) {
    await clearCode(userId, now);
    throw new SmsError('Too many wrong codes — ask for a new one.');
  }

  const given = hashCode(input.replace(/\D/g, ''));
  // Constant-time, so the comparison itself says nothing about how close a
  // guess was. Both sides are fixed-length hex, so the lengths always match.
  const ok =
    given.length === row.codeHash.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(row.codeHash));

  if (!ok) {
    // Incremented in SQL so a burst of parallel guesses cannot all read the
    // same value and collectively cost one attempt — the same reason the
    // Employee Portal's OTP counter is written this way.
    await db
      .update(smsNumbers)
      .set({ codeAttempts: sql`${smsNumbers.codeAttempts} + 1`, updatedAt: now })
      .where(eq(smsNumbers.userId, userId));
    throw new SmsError('That code isn’t right.');
  }

  await db
    .update(smsNumbers)
    .set({ verifiedAt: now, codeHash: null, codeExpiresAt: null, codeAttempts: 0, updatedAt: now })
    .where(eq(smsNumbers.userId, userId));
}

async function clearCode(userId: string, now: Date): Promise<void> {
  await db
    .update(smsNumbers)
    .set({ codeHash: null, codeExpiresAt: null, codeAttempts: 0, updatedAt: now })
    .where(eq(smsNumbers.userId, userId));
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

// One message to one number. Best-effort: returns whether Twilio accepted it.
async function sendOne(to: string, body: string): Promise<boolean> {
  const sid = config.TWILIO_ACCOUNT_SID;
  const token = config.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return false;

  const form = new URLSearchParams({ To: to, Body: body });
  if (config.TWILIO_MESSAGING_SERVICE_SID) {
    form.set('MessagingServiceSid', config.TWILIO_MESSAGING_SERVICE_SID);
  } else if (config.TWILIO_FROM_NUMBER) {
    form.set('From', config.TWILIO_FROM_NUMBER);
  } else {
    return false;
  }

  try {
    const res = await fetch(`${API_ROOT}/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
      // Bounded, for the reason the Employee Portal's mailer is: the verify
      // route awaits this so it can report `delivered` honestly, and an
      // unbounded send would be an unbounded request.
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return true;
    // Never log the body — it carries the recipient's number.
    console.error('SMS send failed:', res.status);
    return false;
  } catch (err) {
    console.error('SMS send failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

// A text is one block of plain characters, so the title and body are composed
// into a single line here rather than sent as fields nothing would render.
//
// Capped at 300 characters. A text is billed per 160-character segment, and a
// notification that runs to three of them is one nobody reads on a lock screen
// anyway; the terminal is where the detail lives.
export const SMS_MAX_LENGTH = 300;

export function composeSms(title: string, body: string): string {
  const line = `${title.trim()}: ${body.trim()}`.replace(/\s+/g, ' ');
  return line.length <= SMS_MAX_LENGTH ? line : `${line.slice(0, SMS_MAX_LENGTH - 1).trimEnd()}…`;
}

export interface SmsMessage {
  title: string;
  body: string;
}

// What a send needs beyond the message. `category` is REQUIRED, matching the
// other two channels and for the same reason: it is what the recipient's
// routing is read against, so an optional one would be the thing you get by
// forgetting to pass anything — and a new notification would quietly text
// everybody who had never asked to be texted, with nothing to catch it.
export interface SmsSendOpts {
  category: AlertCategory;
  // The test button alone, for the reason the other channels have it: a test
  // that silently does nothing is indistinguishable from a broken setup.
  ignoreAccountSwitch?: boolean;
  ignoreChannelChoice?: boolean;
}

// Send to a set of users, to each one's VERIFIED number only.
//
// Three filters, in the order the other channels apply theirs: the account
// master switch (`filterAccountAlerts`, the one place every channel honours it),
// this category's channel choice, and finally having a verified number at all.
// Applied here, at the single point every text leaves the server, so a caller
// cannot forget one.
export async function sendSmsToUsers(
  userIds: string[],
  msg: SmsMessage,
  opts: SmsSendOpts,
): Promise<void> {
  if (!smsConfigured() || userIds.length === 0) return;
  let ids = opts.ignoreAccountSwitch ? userIds : await filterAccountAlerts(userIds);
  if (!opts.ignoreChannelChoice) ids = await channelRecipients(ids, opts.category, 'sms');
  if (ids.length === 0) return;

  const rows = await db
    .select({ userId: smsNumbers.userId, phone: smsNumbers.phone })
    .from(smsNumbers)
    .where(and(inArray(smsNumbers.userId, [...new Set(ids)]), isNotNull(smsNumbers.verifiedAt)));
  if (rows.length === 0) return;

  const text = composeSms(msg.title, msg.body);
  await Promise.all(rows.map((r) => sendOne(r.phone, text)));
}

// A test SAYS it is a test, first thing, exactly as the other two channels do.
// Ignores the account master switch and the channel choice for the same reason
// they do: a test is a direct request made in the moment, and one that silently
// does nothing is indistinguishable from a broken setup.
export async function sendSmsTest(userId: string, message?: string): Promise<boolean> {
  const phone = await verifiedNumber(userId);
  if (!phone) return false;
  const body = message?.trim()
    ? message.trim()
    : 'This is a test alert — nothing has happened on your desk. Text alerts are working.';
  return sendOne(phone, composeSms('TEST · VTS Terminal', body));
}
