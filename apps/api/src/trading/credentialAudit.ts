import crypto from 'node:crypto';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  credentialAudit,
  users,
  type CredentialAuditPurpose,
  type CredentialAuditRow,
} from '../db/schema.js';

// Who used a broker credential, when, and what for.
//
// See the table comment in db/schema.ts for the shape and for why the record
// outlives the account it describes. This module is the only writer.
//
// **Nothing here ever touches a credential.** It is handed ids, a purpose and an
// outcome — never the decrypted creds, never the ciphertext, never the row's
// `secret_enc`. A failure reason is truncated and comes from our own error
// classes, which are written to carry neither.

// The purposes that get one row each: they moved money, or a person asked for
// them and expects to see it listed.
const INDIVIDUAL: ReadonlySet<CredentialAuditPurpose> = new Set([
  'order_place',
  'order_close',
  'order_amend',
  'order_cancel',
  'desk_read',
  'holdings',
  'quotes',
  'funding',
  'credential_replace',
]);

// Everything else is background polling and is counted by the hour. A row per
// decryption would be thousands a day per connection, all of it identical.
function isAggregate(purpose: CredentialAuditPurpose): boolean {
  return !INDIVIDUAL.has(purpose);
}

function hourOf(ms: number): number {
  return Math.floor(ms / 3_600_000) * 3_600_000;
}

// Who caused a credential use. A background job passes SYSTEM: a null actor is a
// statement ("the system did this on its own schedule"), not a gap.
export interface AuditActor {
  actorUserId: string | null;
  sourceIp: string | null;
}

export const SYSTEM: AuditActor = { actorUserId: null, sourceIp: null };

// Build an actor from a Fastify request. `request.ip` is the real client address
// rather than the platform's edge because `trustProxy` is enabled in production
// (server.ts) — without it every row would record the same useless proxy
// address. It is the left-most forwarded address, which makes it an indicator
// worth having in an investigation rather than proof of where a call came from.
export function auditActorFor(request: {
  ip?: string;
  currentUser?: { id: string } | null;
}): AuditActor {
  return {
    actorUserId: request.currentUser?.id ?? null,
    sourceIp: request.ip ?? null,
  };
}

export interface CredentialUseEntry {
  connectionId: string;
  ownerUserId: string;
  ownerUsername?: string;
  purpose: CredentialAuditPurpose;
  actor?: AuditActor;
  ok?: boolean;
  error?: string | null;
}

// A failure reason, bounded. Broker messages are short, but nothing about a
// third party's error string is guaranteed.
function shortError(error: string | null | undefined): string | null {
  if (!error) return null;
  return error.trim().slice(0, 200) || null;
}

async function usernameFor(userId: string): Promise<string> {
  const row = (
    await db.select({ username: users.username }).from(users).where(eq(users.id, userId)).limit(1)
  )[0];
  // A deleted account still gets a row — the point of denormalizing the name is
  // that the record survives the user, so an unknown id is recorded as such
  // rather than dropping the entry.
  return row?.username ?? `(deleted:${userId.slice(0, 8)})`;
}

async function write(entry: CredentialUseEntry): Promise<void> {
  const now = Date.now();
  const ok = entry.ok !== false;
  const error = shortError(entry.error);
  const actor = entry.actor ?? SYSTEM;

  if (isAggregate(entry.purpose)) {
    const bucket = hourOf(now);
    // Upsert on (connection, purpose, hour). A failed poll is counted in the
    // same row rather than splitting the hour in two — `ok` goes false and stays
    // false for that hour, which is the honest reading of "some of these did not
    // work" without inventing a second counter.
    await db
      .insert(credentialAudit)
      .values({
        id: crypto.randomUUID(),
        connectionId: entry.connectionId,
        ownerUserId: entry.ownerUserId,
        ownerUsername: entry.ownerUsername ?? (await usernameFor(entry.ownerUserId)),
        // Deliberately null on an aggregate row: an hour of polling has no one
        // actor, and naming any single one of them would be a false attribution.
        actorUserId: null,
        purpose: entry.purpose,
        sourceIp: null,
        occurredAt: new Date(now),
        hourBucket: new Date(bucket),
        count: 1,
        ok,
        error,
      })
      .onConflictDoUpdate({
        target: [credentialAudit.connectionId, credentialAudit.purpose, credentialAudit.hourBucket],
        set: {
          count: sql`${credentialAudit.count} + 1`,
          occurredAt: new Date(now),
          ok: sql`${credentialAudit.ok} AND ${ok ? 1 : 0}`,
          error: error ? error : sql`${credentialAudit.error}`,
        },
      });
    return;
  }

  await db.insert(credentialAudit).values({
    id: crypto.randomUUID(),
    connectionId: entry.connectionId,
    ownerUserId: entry.ownerUserId,
    ownerUsername: entry.ownerUsername ?? (await usernameFor(entry.ownerUserId)),
    actorUserId: actor.actorUserId,
    purpose: entry.purpose,
    sourceIp: actor.sourceIp,
    occurredAt: new Date(now),
    hourBucket: null,
    count: 1,
    ok,
    error,
  });
}

// Record a credential use. **Fire and forget, by design**: an audit write must
// never delay or fail a broker call — a trader whose order is refused because
// the logging table was busy would be a far worse outcome than a missing row.
// Its own failures are logged and go no further.
export function recordCredentialUse(entry: CredentialUseEntry): void {
  void write(entry).catch((err: unknown) => {
    void err;
    console.error('[credentialAudit] could not record a redacted credential event');
  });
}

// ---- reading it back ----

export interface CredentialAuditEntry {
  id: string;
  connectionId: string;
  ownerUserId: string;
  owner: string;
  actorUserId: string | null;
  actor: string | null; // username, resolved for display; null = the system
  purpose: CredentialAuditPurpose;
  sourceIp: string | null;
  occurredAt: number;
  count: number;
  aggregated: boolean;
  ok: boolean;
  error: string | null;
}

// How far back a panel reads. Deliberately a window rather than "everything":
// the point of the screen is "was my key used recently", and an unbounded scan
// of an append-only table only gets slower.
const WINDOW_DAYS = 30;

function toEntry(row: CredentialAuditRow, actorName: string | null): CredentialAuditEntry {
  return {
    id: row.id,
    connectionId: row.connectionId,
    ownerUserId: row.ownerUserId,
    owner: row.ownerUsername,
    actorUserId: row.actorUserId,
    actor: actorName,
    purpose: row.purpose,
    sourceIp: row.sourceIp,
    occurredAt: row.occurredAt.getTime(),
    count: row.count,
    aggregated: row.hourBucket != null,
    ok: row.ok,
    error: row.error,
  };
}

// Resolve actor ids to usernames for display. Done here rather than joined so a
// deleted actor still renders (the row keeps the id either way).
async function withActorNames(rows: CredentialAuditRow[]): Promise<CredentialAuditEntry[]> {
  const ids = [...new Set(rows.map((r) => r.actorUserId).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const found = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(inArray(users.id, ids));
    for (const u of found) names.set(u.id, u.username);
  }
  return rows.map((r) => toEntry(r, r.actorUserId ? (names.get(r.actorUserId) ?? '(deleted)') : null));
}

// A trader's own credential use — every connection they own. This is the whole
// point of the exercise: the person who owns the key can see what it was used
// for. A teammate can never read this; the route resolves the owner from the
// session rather than from anything the client sends.
export async function getOwnCredentialAudit(userId: string, limit = 200): Promise<CredentialAuditEntry[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  const rows = await db
    .select()
    .from(credentialAudit)
    .where(and(eq(credentialAudit.ownerUserId, userId), gte(credentialAudit.occurredAt, since)))
    .orderBy(desc(credentialAudit.occurredAt))
    .limit(Math.min(Math.max(limit, 1), 500));
  return withActorNames(rows);
}

// Everyone's, for an administrator handling a support case or an incident.
export async function getAllCredentialAudit(limit = 500): Promise<CredentialAuditEntry[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  const rows = await db
    .select()
    .from(credentialAudit)
    .where(gte(credentialAudit.occurredAt, since))
    .orderBy(desc(credentialAudit.occurredAt))
    .limit(Math.min(Math.max(limit, 1), 1000));
  return withActorNames(rows);
}
