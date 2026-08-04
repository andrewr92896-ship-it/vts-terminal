import crypto from 'node:crypto';
import { and, desc, eq, gt, gte, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { aiViolations, users } from '../db/schema.js';

// Recording and enforcing the financial-advice guardrails.
//
// THE SHAPE OF THE PENALTY, and why it is not what it first looks like.
//
// The instruction was "warn them and time them out for 30 minutes". The
// instruction was also "do not deter customers, and give them the benefit of the
// doubt". Those pull against each other, because detection is imperfect and the
// cost of a false positive lands entirely on somebody who did nothing wrong. So:
//
//   • The FIRST refusal in the look-back window is a WARNING. No timeout. The
//     user is told plainly what happened and reminded not to ask the AI for
//     financial advice.
//   • A SECOND refusal within the window carries the 30-minute timeout.
//
// Both are recorded and both reach the admin review screen, so nothing is lost
// in visibility — the only thing given up is punishing somebody the first time
// the system might have misread them. That is the benefit of the doubt, made
// concrete rather than promised in copy.
//
// The timeout covers Ask VTS AI and the study tutor. It deliberately does NOT
// cover support intake or bug reports: a user who cannot reach help is a user
// who cannot tell you the guardrail misfired, and the terminal's existing rule
// is that the complaints channel never sits behind the thing being complained
// about.

/** How long a timeout lasts. */
export const TIMEOUT_MS = 30 * 60 * 1000;

/**
 * How far back a previous violation still counts toward escalation.
 *
 * 24 hours rather than forever: a warning from three months ago should not be
 * what turns today's single misread question into a lockout. Long enough that
 * somebody probing the limits in one sitting escalates on the second try; short
 * enough that an ordinary user who tripped it once in March starts fresh.
 */
export const ESCALATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ViolationSurface = 'ask' | 'tutor';
export type ViolationStatus = 'open' | 'dismissed' | 'warned' | 'actioned';

export class AiTimeoutError extends Error {
  until: number;
  constructor(until: number) {
    super('AI access is paused');
    this.name = 'AiTimeoutError';
    this.until = until;
  }
}

/** The caller's current standing: are they timed out, and until when. */
export async function activeTimeout(userId: string): Promise<number | null> {
  const now = new Date();
  const row = (
    await db
      .select({ until: aiViolations.timeoutUntil })
      .from(aiViolations)
      .where(and(eq(aiViolations.userId, userId), gt(aiViolations.timeoutUntil, now)))
      .orderBy(desc(aiViolations.timeoutUntil))
      .limit(1)
  )[0];
  return row?.until ? row.until.getTime() : null;
}

/**
 * Refuse the call if this user is inside a timeout.
 *
 * Called by the AI surfaces the timeout covers, BEFORE the model runs — the
 * point of a timeout is to not spend the call.
 */
export async function enforceAiTimeout(userId: string): Promise<void> {
  const until = await activeTimeout(userId);
  if (until != null) throw new AiTimeoutError(until);
}

// Keep the stored conversation to the tail. The reviewer needs the exchange that
// produced the refusal and enough before it to judge intent — not a user's whole
// afternoon. Also bounds what one row can cost.
const MAX_STORED_TURNS = 12;
const MAX_STORED_CHARS = 8000;

function trimConversation(messages: { role: string; content: string }[]): string {
  const tail = messages.slice(-MAX_STORED_TURNS).map((m) => ({
    role: m.role,
    content: m.content.length > 2000 ? `${m.content.slice(0, 2000)}…` : m.content,
  }));
  let json = JSON.stringify(tail);
  // Drop from the front until it fits, so the turn that actually tripped the
  // limit is the last thing to go.
  let start = 0;
  while (json.length > MAX_STORED_CHARS && start < tail.length - 1) {
    start++;
    json = JSON.stringify(tail.slice(start));
  }
  return json;
}

export interface RecordedViolation {
  id: string;
  timedOut: boolean;
  timeoutUntil: number | null;
  /** How many violations this user has inside the window, including this one. */
  countInWindow: number;
}

/**
 * Record a refusal and decide whether it carries a timeout.
 *
 * Returns what the caller needs to tell the user. Never throws into the request:
 * a failure to write the record must not turn a handled refusal into a 500 — the
 * user has already been refused, which is the part that protects the product.
 */
export async function recordViolation(input: {
  userId: string;
  surface: ViolationSurface;
  messages: { role: string; content: string }[];
  reply: string;
}): Promise<RecordedViolation> {
  const now = new Date();
  const since = new Date(now.getTime() - ESCALATION_WINDOW_MS);

  let priorInWindow = 0;
  try {
    const prior = await db
      .select({ id: aiViolations.id })
      .from(aiViolations)
      .where(and(eq(aiViolations.userId, input.userId), gte(aiViolations.createdAt, since)));
    priorInWindow = prior.length;
  } catch {
    // Counting failed — treat it as a first offense. Erring toward the warning
    // rather than the lockout is the right direction when we cannot tell.
    priorInWindow = 0;
  }

  const timedOut = priorInWindow >= 1;
  const timeoutUntil = timedOut ? new Date(now.getTime() + TIMEOUT_MS) : null;
  const id = crypto.randomUUID();

  try {
    await db.insert(aiViolations).values({
      id,
      userId: input.userId,
      surface: input.surface,
      conversation: trimConversation(input.messages),
      reply: input.reply.slice(0, 4000),
      timedOut,
      timeoutUntil,
      status: 'open',
      disputed: false,
      createdAt: now,
    });
  } catch (err) {
    console.error('[ai] could not record guardrail violation', err);
  }

  return {
    id,
    timedOut,
    timeoutUntil: timeoutUntil ? timeoutUntil.getTime() : null,
    countInWindow: priorInWindow + 1,
  };
}

/**
 * The user pressing "I think the AI made a mistake".
 *
 * Flags the row for a human and nothing else — it does not lift the timeout on
 * its own. That is deliberate in both directions: automatically lifting it would
 * make the penalty opt-out for anyone who reads the button, and ignoring the
 * press would waste the only signal the terminal gets about its own guardrails
 * misfiring. An admin can clear it from the review screen, which is the same
 * action they would take anyway.
 *
 * Scoped to the caller's own rows — there is no parameter that widens it.
 */
export async function disputeViolation(
  userId: string,
  violationId: string,
  note: string | null,
): Promise<boolean> {
  const row = (
    await db
      .select({ id: aiViolations.id })
      .from(aiViolations)
      .where(and(eq(aiViolations.id, violationId), eq(aiViolations.userId, userId)))
      .limit(1)
  )[0];
  if (!row) return false;
  await db
    .update(aiViolations)
    .set({
      disputed: true,
      disputedAt: new Date(),
      disputeNote: note ? note.slice(0, 1000) : null,
    })
    .where(eq(aiViolations.id, violationId));
  return true;
}

export interface ViolationView {
  id: string;
  userId: string;
  userName: string;
  surface: string;
  conversation: { role: string; content: string }[];
  reply: string;
  timedOut: boolean;
  timeoutUntil: number | null;
  status: ViolationStatus;
  reviewedByName: string | null;
  reviewedAt: number | null;
  reviewNote: string | null;
  disputed: boolean;
  disputedAt: number | null;
  disputeNote: string | null;
  createdAt: number;
}

function parseConversation(raw: string): { role: string; content: string }[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m): m is { role: string; content: string } =>
        !!m && typeof m === 'object' && typeof (m as any).content === 'string',
      )
      .map((m) => ({ role: String(m.role ?? 'user'), content: m.content }));
  } catch {
    return [];
  }
}

/** Every violation, newest first, for the admin review screen. */
export async function listViolations(limit = 200): Promise<ViolationView[]> {
  const rows = await db
    .select()
    .from(aiViolations)
    .orderBy(desc(aiViolations.createdAt))
    .limit(limit);
  if (rows.length === 0) return [];

  const ids = new Set<string>();
  for (const r of rows) {
    ids.add(r.userId);
    if (r.reviewedBy) ids.add(r.reviewedBy);
  }
  const people = await db
    .select({ id: users.id, displayName: users.displayName, username: users.username })
    .from(users)
    .where(inArray(users.id, [...ids]));
  const nameById = new Map(people.map((p) => [p.id, p.displayName?.trim() || p.username]));

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: nameById.get(r.userId) ?? '(deleted account)',
    surface: r.surface,
    conversation: parseConversation(r.conversation),
    reply: r.reply,
    timedOut: r.timedOut,
    timeoutUntil: r.timeoutUntil ? r.timeoutUntil.getTime() : null,
    status: r.status as ViolationStatus,
    reviewedByName: r.reviewedBy ? nameById.get(r.reviewedBy) ?? null : null,
    reviewedAt: r.reviewedAt ? r.reviewedAt.getTime() : null,
    reviewNote: r.reviewNote,
    disputed: r.disputed,
    disputedAt: r.disputedAt ? r.disputedAt.getTime() : null,
    disputeNote: r.disputeNote,
    createdAt: r.createdAt.getTime(),
  }));
}

/** How many are still waiting on an administrator — drives the bell count. */
export async function countOpenViolations(): Promise<number> {
  const rows = await db
    .select({ id: aiViolations.id })
    .from(aiViolations)
    .where(eq(aiViolations.status, 'open'));
  return rows.length;
}

/** The most recent violation timestamp, for the notification feed. */
export async function latestViolationAt(): Promise<number> {
  const row = (
    await db
      .select({ createdAt: aiViolations.createdAt })
      .from(aiViolations)
      .orderBy(desc(aiViolations.createdAt))
      .limit(1)
  )[0];
  return row?.createdAt ? row.createdAt.getTime() : 0;
}

/**
 * An administrator's decision on one violation.
 *
 * `clearTimeout` is the "the terminal got this wrong" action: it ends the
 * timeout immediately rather than leaving somebody sitting out a penalty an
 * admin has just agreed was a mistake. It is separate from the status so that
 * dismissing a borderline case does not silently hand back the thirty minutes.
 */
export async function reviewViolation(
  actorId: string,
  violationId: string,
  input: { status: ViolationStatus; note?: string | null; clearTimeout?: boolean },
): Promise<boolean> {
  const row = (
    await db.select().from(aiViolations).where(eq(aiViolations.id, violationId)).limit(1)
  )[0];
  if (!row) return false;
  await db
    .update(aiViolations)
    .set({
      status: input.status,
      reviewedBy: actorId,
      reviewedAt: new Date(),
      reviewNote: input.note ? input.note.slice(0, 1000) : null,
      ...(input.clearTimeout ? { timeoutUntil: null } : {}),
    })
    .where(eq(aiViolations.id, violationId));
  return true;
}
