import crypto from 'node:crypto';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { pushoverReceipts, type PushoverReceiptRow } from '../db/schema.js';

// Storage for live repeating alerts, and NOTHING ELSE — no Pushover API calls
// live here. That is deliberate: `pushover.ts` needs to write a row the moment
// it sends a priority-2 message, and the acknowledge path needs to read rows
// and then call Pushover. Keeping this module storage-only makes the dependency
// one-way (pushover.ts → here) instead of a cycle.

export type ResolvedBy = 'terminal' | 'pushover' | 'expired';

export interface LiveAlert {
  id: string;
  title: string;
  body: string;
  kind: string;
  createdAt: number;
  expiresAt: number;
}

function toLive(row: PushoverReceiptRow): LiveAlert {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    kind: row.kind,
    createdAt: row.createdAt.getTime(),
    expiresAt: row.expiresAt.getTime(),
  };
}

// A URL-safe unguessable value for the public callback route. Pushover signs
// nothing it sends back, so this is the only thing standing between the callback
// and anybody who can POST to the terminal.
export function newCallbackToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export async function recordReceipt(input: {
  userId: string;
  receipt: string;
  callbackToken: string;
  title: string;
  body: string;
  kind: string;
  expiresAt: Date;
}): Promise<void> {
  await db.insert(pushoverReceipts).values({
    id: crypto.randomUUID(),
    userId: input.userId,
    receipt: input.receipt,
    callbackToken: input.callbackToken,
    title: input.title,
    body: input.body,
    kind: input.kind,
    createdAt: new Date(),
    expiresAt: input.expiresAt,
  });
}

// The rows still repeating: unresolved AND not yet past the expiry Pushover was
// given. Reading the expiry here rather than asking Pushover is what lets the
// terminal stop showing an alert nobody answered without a network round trip
// per row — Pushover has already stopped retrying it by then.
export async function liveReceiptRows(userId: string): Promise<PushoverReceiptRow[]> {
  return db
    .select()
    .from(pushoverReceipts)
    .where(
      and(
        eq(pushoverReceipts.userId, userId),
        isNull(pushoverReceipts.resolvedAt),
        gt(pushoverReceipts.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(pushoverReceipts.createdAt));
}

export async function liveAlerts(userId: string): Promise<LiveAlert[]> {
  return (await liveReceiptRows(userId)).map(toLive);
}

export async function markResolved(ids: string[], by: ResolvedBy): Promise<void> {
  if (ids.length === 0) return;
  const now = new Date();
  // One statement per id rather than an inArray: the lists here are a handful
  // of rows at most, and the `resolvedAt IS NULL` guard means a row already
  // answered on the phone is never re-stamped with a later terminal time.
  await Promise.all(
    ids.map((id) =>
      db
        .update(pushoverReceipts)
        .set({ resolvedAt: now, resolvedBy: by })
        .where(and(eq(pushoverReceipts.id, id), isNull(pushoverReceipts.resolvedAt))),
    ),
  );
}

// Resolve by the callback token — the path Pushover itself takes when the user
// acknowledges on their phone. Returns whether a live row matched, so the route
// can answer honestly without leaking whether the token merely existed.
export async function resolveByCallbackToken(token: string): Promise<boolean> {
  const row = (
    await db
      .select()
      .from(pushoverReceipts)
      .where(and(eq(pushoverReceipts.callbackToken, token), isNull(pushoverReceipts.resolvedAt)))
      .limit(1)
  )[0];
  if (!row) return false;
  await markResolved([row.id], 'pushover');
  return true;
}
