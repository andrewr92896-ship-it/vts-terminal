import crypto from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  brokerConnections,
  manualPositions,
  users,
  BROKER_CONNECTION_KINDS,
  type BrokerConnectionKind,
  type BrokerConnectionRow,
} from '../db/schema.js';
import { canAccessWorkspace, parseRoles } from '../auth/rbac.js';
import { decryptSecret, encryptSecret } from '../security/secretbox.js';
import { DEMO_USERNAME } from '../demo/identity.js';
import { recordCredentialUse, type AuditActor } from './credentialAudit.js';
import type { CredentialAuditPurpose } from '../db/schema.js';

// Per-user broker connections. Credentials are encrypted at rest; only a
// non-secret `summary` is ever exposed to the client. The connector layer uses
// getActiveDecrypted() to obtain live credentials.

export type OandaCreds = { token: string; accountId: string; env: 'practice' | 'live' };
export type KrakenCreds = { apiKey: string; apiSecret: string };
// A manual connection has no credentials, positions are entered by hand.
export type ManualCreds = Record<string, never>;
export type BrokerCreds = OandaCreds | KrakenCreds | ManualCreds;

export type ConnStatus = 'unknown' | 'ok' | 'error';

// Client-safe view, never includes secrets.
export interface BrokerConnection {
  id: string;
  broker: BrokerConnectionKind;
  label: string;
  summary: string | null;
  // OANDA environment, surfaced (non-secret) so the edit form can restore it
  // instead of silently defaulting a credential rotation back to practice.
  env: 'practice' | 'live' | null;
  active: boolean;
  credentialState: 'active' | 'reconnect_required';
  lastStatus: ConnStatus;
  lastError: string | null;
  lastCheckedAt: number | null;
  // "Count trades since" cutoff (ms). Trades that opened before this are dropped
  // from the Trade Log / History / backfill for this connection. Null = all.
  historyStartAt: number | null;
  createdAt: number;
}

export interface DecryptedConnection {
  id: string;
  broker: BrokerConnectionKind;
  label: string;
  creds: BrokerCreds;
}

// A decrypted connection plus the teammate who owns it. Used by the shared Live
// Wall, which streams every trading-team member's positions side by side.
export interface OwnedConnection extends DecryptedConnection {
  ownerId: string;
  owner: string; // owner's username, shown on each position
  // "Count trades since" cutoff (ms) for this connection; null = count all. Read
  // by the closed-trade backfill so pre-cutoff trades are never re-imported.
  historyStartAt: number | null;
}

export function isBrokerKind(v: unknown): v is BrokerConnectionKind {
  return typeof v === 'string' && (BROKER_CONNECTION_KINDS as readonly string[]).includes(v);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

// ---- naming a connection ----
//
// A connection's name says **whose** it is and **where** it is: "Andrew's
// OANDA", "Andrew's Kraken". The desk trades more than one venue now, so a name
// that only says whose ("Andrew's Trades") leaves two chips on the Live Wall
// and two account cards on the Trade Desk that cannot be told apart.
//
// This used to be a one-shot SQL rename, which is exactly why it broke: a
// migration only ever sees the rows that existed the day it ran, so the next
// connection anybody created went back to being nameless about its venue. The
// rule now lives in one function that **every** write goes through
// (addConnection / updateConnection / adminUpdateConnection) and that the boot
// pass below re-applies to whatever is already stored. There is no path left
// that can save an OANDA or Kraken connection whose name does not say so.

const VENUE_NAMES = { oanda: 'OANDA', kraken: 'Kraken', manual: 'Manual' } as const;

// Words that describe an account generically rather than naming its venue.
// Dropped before the venue is appended so "Andrew's Trades" becomes "Andrew's
// Kraken" rather than "Andrew's Trades Kraken".
const GENERIC_TAIL = /[\s·,-]+(trades?|trading|account|acct|crypto|coins?|forex|fx|live|practice|demo|book)$/i;

function mentions(label: string, word: string): boolean {
  return new RegExp(`\\b${word}\\b`, 'i').test(label);
}

// Force a connection's label to name its own venue. Idempotent: running it on
// its own output changes nothing, which is what lets the boot pass re-run it
// every start without ever churning a name.
//
// `manual` is deliberately left alone — a hand-entered book is named after the
// prop firm it tracks ("FundedNext"), and it has no platform to name.
export function venueLabel(raw: string, broker: BrokerConnectionKind): string {
  const venue = VENUE_NAMES[broker];
  let label = raw.trim().replace(/\s+/g, ' ');
  if (broker === 'manual') return label || venue;
  // Already names its own venue — leave whatever the owner chose exactly as is.
  if (mentions(label, venue)) return label;
  // Names a *different* venue: the actively misleading case, and the one worth
  // overwriting rather than appending to.
  for (const [kind, name] of Object.entries(VENUE_NAMES)) {
    if (kind === broker) continue;
    label = label.replace(new RegExp(`\\b${name}\\b`, 'ig'), ' ');
  }
  label = label.replace(/\s+/g, ' ').trim();
  label = label.replace(GENERIC_TAIL, '').trim();
  label = label.replace(/[·,\-–—'’]+$/, '').trim();
  return label ? `${label} ${venue}` : venue;
}

// The name a connection gets when nobody typed one: "Andrew's Kraken".
export function defaultConnectionLabel(owner: string, broker: BrokerConnectionKind): string {
  const name = owner.trim();
  if (!name) return VENUE_NAMES[broker];
  // "Andrew" → "Andrew's"; "Chris" → "Chris'".
  const possessive = name.endsWith('s') ? `${name}’` : `${name}’s`;
  return venueLabel(possessive, broker);
}

// Validate + normalize the credentials for a broker. Throws on missing fields.
export function normalizeCreds(broker: BrokerConnectionKind, raw: Record<string, unknown>): BrokerCreds {
  if (broker === 'manual') {
    return {}; // no credentials, positions are entered by hand
  }
  if (broker === 'oanda') {
    const token = str(raw.token);
    const accountId = str(raw.accountId);
    const env = str(raw.env).toLowerCase() === 'live' ? 'live' : 'practice';
    if (!token) throw new Error('OANDA API token is required');
    if (!accountId) throw new Error('OANDA account ID is required');
    return { token, accountId, env };
  }
  // kraken
  const apiKey = str(raw.apiKey);
  const apiSecret = str(raw.apiSecret);
  if (!apiKey) throw new Error('Kraken API key is required');
  if (!apiSecret) throw new Error('Kraken private key is required');
  return { apiKey, apiSecret };
}

// A short, non-secret hint shown in the UI.
function summaryOf(broker: BrokerConnectionKind, creds: BrokerCreds): string {
  if (broker === 'manual') return 'Manual entries';
  if (broker === 'oanda') {
    const c = creds as OandaCreds;
    return `${c.env === 'live' ? 'Live' : 'Practice'} · ${c.accountId}`;
  }
  const c = creds as KrakenCreds;
  return `Key ••${c.apiKey.slice(-4)}`;
}

// Refuse a second connection to an account this owner already has connected.
//
// Two rows naming one OANDA account are two views of ONE book: the same trades
// arrive under both, numbered with the same broker trade ids. That is how the
// desk's July trades came to be counted twice — a connection deactivated by the
// 2026-08-02 credential reset was replaced by a NEW connection rather than
// re-keyed, so the closed-trade backfill saw an account it had no history for
// and re-imported all of it. The backfill dedupes on the account now rather than
// the connection row, so it can no longer double-import; this stops the pair
// being created at all, which also keeps the live poll from reporting one open
// position twice.
//
// Compared on `summary` because it is derived from the credentials by
// `summaryOf` and stored in plaintext — so this establishes identity without
// decrypting anything, and without an audit row for a credential nobody used.
// For OANDA that string IS the account (environment + account id); for Kraken it
// is the last four of the API key, which catches the same key added twice but
// not two different keys cut against one Kraken account. `manual` is exempt: it
// carries no credential and a trader legitimately keeps several hand-kept books.
async function assertAccountNotAlreadyConnected(
  userId: string,
  broker: BrokerConnectionKind,
  summary: string,
  exceptId?: string,
): Promise<void> {
  if (broker === 'manual') return;
  const clash = (
    await db
      .select({ id: brokerConnections.id, label: brokerConnections.label })
      .from(brokerConnections)
      .where(
        and(
          eq(brokerConnections.userId, userId),
          eq(brokerConnections.broker, broker),
          eq(brokerConnections.summary, summary),
        ),
      )
  ).find((r) => r.id !== exceptId);
  if (!clash) return;
  // Name the row they already have, because the fix is almost always to re-enter
  // the key on it — a connection that stopped reading is the reason somebody
  // reaches for a second one.
  throw new Error(
    `That account is already connected as "${clash.label}". Update the key on that connection instead of adding a second one.`,
  );
}

function toPublic(row: BrokerConnectionRow): BrokerConnection {
  return {
    id: row.id,
    broker: row.broker,
    label: row.label,
    summary: row.summary,
    // The summary encodes the environment ("Live · ..." / "Practice · ...").
    env: row.broker === 'oanda' ? (row.summary?.startsWith('Live') ? 'live' : 'practice') : null,
    active: row.active,
    credentialState: row.credentialState,
    lastStatus: row.lastStatus,
    lastError: row.lastError,
    lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.getTime() : null,
    historyStartAt: row.historyStartAt ? row.historyStartAt.getTime() : null,
    createdAt: row.createdAt.getTime(),
  };
}

export async function listConnections(userId: string): Promise<BrokerConnection[]> {
  const rows = await db
    .select()
    .from(brokerConnections)
    .where(eq(brokerConnections.userId, userId));
  return [...rows]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(toPublic);
}

// A client-safe connection tagged with its owner. Used by the admin "team
// connections" view so an admin can see and rename every teammate's connection
// (e.g. tidy a teammate's default "Oanda" label into "Dale's Trades").
export interface OwnedBrokerConnection extends BrokerConnection {
  ownerId: string;
  owner: string;
}

export async function listAllConnections(): Promise<OwnedBrokerConnection[]> {
  const rows = await db
    .select({ conn: brokerConnections, username: users.username })
    .from(brokerConnections)
    .innerJoin(users, eq(users.id, brokerConnections.userId));
  return [...rows]
    .sort((a, b) => a.conn.createdAt.getTime() - b.conn.createdAt.getTime())
    .map((r) => ({ ...toPublic(r.conn), ownerId: r.conn.userId, owner: r.username }));
}

// Admin-only: rename or pause/resume any connection regardless of owner. Limited
// to label and active on purpose — an admin never rotates a teammate's secrets.
export async function adminUpdateConnection(
  id: string,
  input: { label?: string; active?: boolean; historyStartAt?: number | null },
): Promise<void> {
  const existing = (
    await db
      .select({ id: brokerConnections.id, broker: brokerConnections.broker })
      .from(brokerConnections)
      .where(eq(brokerConnections.id, id))
      .limit(1)
  )[0];
  if (!existing) throw new Error('Connection not found');

  const patch: Partial<typeof brokerConnections.$inferInsert> = { updatedAt: new Date() };
  if (input.label !== undefined) {
    const l = str(input.label);
    if (!l) throw new Error('Label cannot be empty');
    patch.label = venueLabel(l, existing.broker).slice(0, 80);
  }
  if (input.active !== undefined) patch.active = input.active;
  // Admins can set a teammate's "count trades since" cutoff (never their secrets).
  if (input.historyStartAt !== undefined) {
    patch.historyStartAt = input.historyStartAt == null ? null : new Date(input.historyStartAt);
  }
  await db.update(brokerConnections).set(patch).where(eq(brokerConnections.id, id));
}

// ---- when a stored credential cannot be read ----
//
// A connection whose ciphertext will not decrypt used to be skipped in silence:
// it dropped out of every result while the UI kept showing whatever status was
// last recorded, so a green "ok" dot sat beside a connection the server could no
// longer use. Say so instead — in the log, and on the row the trader is looking
// at.
//
// The write is guarded on the stored status because this runs inside the Live
// Wall's 10-second poll, once per connection on the team. Writing on every
// failure would turn one broken row into six updates a minute, forever.

const UNREADABLE_CREDENTIAL_MESSAGE =
  'Stored credentials could not be read. Re-enter them to reconnect this account.';

async function noteUnreadable(row: BrokerConnectionRow, err: unknown): Promise<void> {
  // The class, not err.name — an Error subclass inherits the name "Error", and
  // which failure it was (retired format / wrong key / failed authentication) is
  // the only thing this line is for.
  const reason = err instanceof Error ? `${err.constructor.name}: ${err.message}` : 'unknown error';
  // Never the ciphertext and never the credential — the secretbox errors are
  // written to carry neither, and nothing else from the row belongs in a log.
  console.error(
    `[connections] ${row.broker} connection ${row.id} (owner ${row.userId}) could not be decrypted — ${reason}`,
  );
  if (row.lastStatus === 'error') return;
  await recordConnectionStatus(row.id, false, UNREADABLE_CREDENTIAL_MESSAGE);
}

// ---- every decryption is recorded ----
//
// The two functions below are the only places in the codebase that turn a stored
// credential back into something usable, which makes them the one place worth
// auditing. They cannot work out *why* they were called, though — serving the
// Live Wall and serving an order placement look identical from in here — so the
// purpose is passed in by the caller and is not optional.
//
// See trading/credentialAudit.ts for the two tiers and why the pollers are
// counted by the hour rather than logged per call.
export interface CredentialUse {
  purpose: CredentialAuditPurpose;
  actor?: AuditActor;
  // Record only this one connection. The desk decrypts all of a trader's
  // connections in order to find the one an order names; logging "order placed"
  // against the other two would be false, and alarming on a screen whose entire
  // job is telling somebody their key was used.
  only?: string;
  // The caller writes the row itself, once the broker has answered. Used by the
  // order paths, where the outcome is the whole point and is not known yet at
  // the moment of decryption.
  deferred?: boolean;
}

function noteBlocked(use: CredentialUse, conn: { id: string; userId: string; username?: string }): void {
  if (use.only && use.only !== conn.id) return;
  recordCredentialUse({
    connectionId: conn.id,
    ownerUserId: conn.userId,
    ownerUsername: conn.username,
    purpose: use.purpose,
    actor: use.actor,
    ok: false,
    error: 'credential_reentry_required',
  });
}

function noteUse(use: CredentialUse, conn: { id: string; userId: string; username?: string }): void {
  if (use.deferred) return;
  if (use.only && use.only !== conn.id) return;
  recordCredentialUse({
    connectionId: conn.id,
    ownerUserId: conn.userId,
    ownerUsername: conn.username,
    purpose: use.purpose,
    actor: use.actor,
  });
}

export async function getActiveDecrypted(
  userId: string,
  use: CredentialUse,
): Promise<DecryptedConnection[]> {
  const rows = await db
    .select()
    .from(brokerConnections)
    .where(and(eq(brokerConnections.userId, userId), eq(brokerConnections.active, true)));
  const out: DecryptedConnection[] = [];
  for (const r of rows) {
    // This check is deliberately before the try/decrypt block. A quarantined
    // row is not a broken credential to retry; it is an explicit refusal.
    if (r.credentialState === 'reconnect_required') {
      noteBlocked(use, r);
      continue;
    }
    try {
      out.push({
        id: r.id,
        broker: r.broker,
        label: r.label,
        creds: JSON.parse(decryptSecret(r.secretEnc, { userId: r.userId, connectionId: r.id })),
      });
      noteUse(use, r);
    } catch (err) {
      await noteUnreadable(r, err);
    }
  }
  return out;
}

// Whose credentials a read is allowed to decrypt: a set of user ids, or the
// explicit install-wide opt-in.
//
// `ALL_USERS` exists so that decrypting every credential on the deployment has to
// be **written down**. This used to be an optional parameter, which meant the
// install-wide read was what you got by forgetting to pass anything — and that is
// exactly how one customer's OANDA key came to price the Market Data board for
// every other customer. An omitted argument is now a compile error, and the two
// legitimate background callers say `ALL_USERS` where a reviewer can see it.
export const ALL_USERS = 'all-users' as const;
export type ConnectionScope = Set<string> | typeof ALL_USERS;

// Active broker connections, decrypted and tagged with their owner. Only
// connections owned by a user who currently has trading access are included, so
// a revoked teammate drops off automatically.
//
// A `Set` restricts the result to connections owned by those userIds — the
// viewer's team, minus anyone in private mode — so the Live Wall and broker
// capital only ever surface a team's own positions. `ALL_USERS` loads the whole
// install and is only for background bookkeeping that no viewer sees: it records
// each owner's own positions to their own History.
export async function getAllActiveDecrypted(
  scope: ConnectionScope,
  use: CredentialUse,
): Promise<OwnedConnection[]> {
  const rows = await db
    .select({
      conn: brokerConnections,
      username: users.username,
      roles: users.roles,
    })
    .from(brokerConnections)
    .innerJoin(users, eq(users.id, brokerConnections.userId))
    .where(
      scope === ALL_USERS
        ? eq(brokerConnections.active, true)
        : and(eq(brokerConnections.active, true), inArray(brokerConnections.userId, [...scope])),
    );

  const out: OwnedConnection[] = [];
  for (const r of rows) {
    // The public demo account is a sandbox, not a desk member: keep its
    // connections off the shared Live Wall (and keep the real desk's positions
    // out of the demo, handled in the service).
    if (r.username === DEMO_USERNAME) continue;
    if (!canAccessWorkspace(parseRoles({ roles: r.roles }), 'trading')) continue;
    if (r.conn.credentialState === 'reconnect_required') {
      noteBlocked(use, { id: r.conn.id, userId: r.conn.userId, username: r.username });
      continue;
    }
    try {
      out.push({
        id: r.conn.id,
        broker: r.conn.broker,
        label: r.conn.label,
        creds: JSON.parse(
          decryptSecret(r.conn.secretEnc, { userId: r.conn.userId, connectionId: r.conn.id }),
        ),
        ownerId: r.conn.userId,
        owner: r.username,
        historyStartAt: r.conn.historyStartAt ? r.conn.historyStartAt.getTime() : null,
      });
      noteUse(use, { id: r.conn.id, userId: r.conn.userId, username: r.username });
    } catch (err) {
      await noteUnreadable(r.conn, err);
    }
  }
  return out;
}

// A stored connection's metadata, owner-tagged, WITHOUT decrypting anything.
//
// This exists so a screen can tell "this desk has never connected a broker" from
// "this desk has a connection the terminal currently cannot read" — two states
// that look identical to getAllActiveDecrypted, which returns an empty array for
// both. The Live Wall needs the distinction to decide whether showing its sample
// feed is honest (see getLiveWall).
//
// Deliberately touches no credential: no decrypt, so no audit row, no
// noteUnreadable, and nothing here can fail on a bad key. It reads the same
// status columns the Live Brokers panel already shows.
export interface StoredConnection {
  id: string;
  broker: BrokerConnectionKind;
  label: string;
  ownerId: string;
  owner: string;
  active: boolean;
  lastStatus: ConnStatus;
  lastError: string | null;
}

export async function listStoredConnections(scope: Set<string>): Promise<StoredConnection[]> {
  if (scope.size === 0) return [];
  const rows = await db
    .select({ conn: brokerConnections, username: users.username })
    .from(brokerConnections)
    .innerJoin(users, eq(users.id, brokerConnections.userId))
    .where(inArray(brokerConnections.userId, [...scope]));
  return rows
    .filter((r) => r.username !== DEMO_USERNAME)
    .map((r) => ({
      id: r.conn.id,
      broker: r.conn.broker,
      label: r.conn.label,
      ownerId: r.conn.userId,
      owner: r.username,
      active: r.conn.active,
      lastStatus: r.conn.lastStatus,
      lastError: r.conn.lastError,
    }));
}

export async function addConnection(
  userId: string,
  input: { broker: BrokerConnectionKind; label: string; creds: Record<string, unknown> },
): Promise<void> {
  // Whatever the caller passed — a person typing in the form, or another agent
  // calling this directly — comes out naming its venue.
  const label = venueLabel(str(input.label) || defaultConnectionLabel('', input.broker), input.broker);
  const creds = normalizeCreds(input.broker, input.creds);
  const summary = summaryOf(input.broker, creds);
  await assertAccountNotAlreadyConnected(userId, input.broker, summary);
  const now = new Date();
  // The id is minted before the secret is sealed, because the ciphertext is
  // bound to the row it belongs to (id + owner) as authenticated data — a blob
  // moved to another connection or another user no longer decrypts.
  const id = crypto.randomUUID();
  await db.insert(brokerConnections).values({
    id,
    userId,
    broker: input.broker,
    label: label.slice(0, 80),
    secretEnc: encryptSecret(JSON.stringify(creds), { userId, connectionId: id }),
    summary,
    active: true,
    lastStatus: 'unknown',
    lastError: null,
    lastCheckedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateConnection(
  userId: string,
  id: string,
  input: { label?: string; active?: boolean; creds?: Record<string, unknown>; historyStartAt?: number | null },
  actor: AuditActor = { actorUserId: userId, sourceIp: null },
): Promise<void> {
  const row = (
    await db
      .select()
      .from(brokerConnections)
      .where(and(eq(brokerConnections.id, id), eq(brokerConnections.userId, userId)))
      .limit(1)
  )[0];
  if (!row) throw new Error('Connection not found');

  const patch: Partial<typeof brokerConnections.$inferInsert> = { updatedAt: new Date() };
  if (input.label !== undefined) {
    const l = str(input.label);
    if (!l) throw new Error('Label cannot be empty');
    patch.label = venueLabel(l, row.broker).slice(0, 80);
  }
  if (input.active !== undefined) patch.active = input.active;
  // "Count trades since": null clears it (count everything again); a ms instant
  // sets the cutoff. Trades that opened before it drop out of the desk stats.
  if (input.historyStartAt !== undefined) {
    patch.historyStartAt = input.historyStartAt == null ? null : new Date(input.historyStartAt);
  }
  if (input.creds !== undefined) {
    const creds = normalizeCreds(row.broker, input.creds);
    const summary = summaryOf(row.broker, creds);
    // Re-pointing an existing connection at an account already connected here
    // makes the same pair as adding one, so it is refused on the same terms.
    await assertAccountNotAlreadyConnected(userId, row.broker, summary, id);
    patch.secretEnc = encryptSecret(JSON.stringify(creds), { userId, connectionId: id });
    patch.summary = summary;
    // New credentials → reset health until the next refresh proves them.
    patch.lastStatus = 'unknown';
    patch.lastError = null;
    // The new envelope and the state transition are one UPDATE: there is no
    // instant in which a quarantined row is usable with its old payload.
    patch.credentialState = 'active';
  }
  await db
    .update(brokerConnections)
    .set(patch)
    .where(and(eq(brokerConnections.id, id), eq(brokerConnections.userId, userId)));
  if (input.creds !== undefined) {
    recordCredentialUse({
      connectionId: id,
      ownerUserId: userId,
      purpose: 'credential_replace',
      actor,
    });
  }
}

export async function removeConnection(userId: string, id: string): Promise<void> {
  await db
    .delete(brokerConnections)
    .where(and(eq(brokerConnections.id, id), eq(brokerConnections.userId, userId)));
}

// Admin-only: remove any connection regardless of owner, so a stranded one — a
// dead account replaced after a credential reset, say — can be tidied up by
// somebody other than the person who left it there. Returns the row it removed
// so the caller can record who did what to whom.
//
// **The desk's trade history is NOT affected.** `trading_positions.connection_id`
// carries no foreign key, deliberately, so closed trades outlive the connection
// they arrived through: an orphaned row still shows on the Trade Log, and still
// dedupes the closed-trade backfill (an account it cannot attribute is unknown,
// and unknown dedupes). Removing a connection is tidying the list, not deleting
// anybody's trades.
//
// Two refusals, each covering a loss the admin cannot see coming:
//
//   • **An ACTIVE connection.** Removing one stops that trader's Live Wall with
//     nothing on screen to say why, and the credential is gone, so putting it
//     back means asking them for a key they may no longer have. Pause is the
//     reversible stop and already exists; this is the cleanup afterwards. Two
//     deliberate steps is the point, not an obstacle.
//   • **A MANUAL connection still holding positions.** `manual_positions`
//     cascades on this row, so deleting it destroys hand-typed trades that exist
//     nowhere else and cannot be re-imported from any broker. The owner can
//     still delete their own book — they can see what is in it.
export async function adminRemoveConnection(id: string): Promise<OwnedBrokerConnection> {
  const row = (
    await db
      .select({ conn: brokerConnections, username: users.username })
      .from(brokerConnections)
      .innerJoin(users, eq(users.id, brokerConnections.userId))
      .where(eq(brokerConnections.id, id))
      .limit(1)
  )[0];
  if (!row) throw new Error('Connection not found');

  if (row.conn.active) {
    throw new Error('Pause this connection first, then remove it.');
  }

  if (row.conn.broker === 'manual') {
    const held = await db
      .select({ id: manualPositions.id })
      .from(manualPositions)
      .where(eq(manualPositions.connectionId, id));
    if (held.length > 0) {
      throw new Error(
        `This hand-kept book still holds ${held.length} position${held.length === 1 ? '' : 's'}, which would be deleted with it. Only ${row.username} can remove it.`,
      );
    }
  }

  await db.delete(brokerConnections).where(eq(brokerConnections.id, id));
  return { ...toPublic(row.conn), ownerId: row.conn.userId, owner: row.username };
}

// Record the outcome of a live fetch against a connection (drives the UI dots).
export async function recordConnectionStatus(id: string, ok: boolean, error: string | null): Promise<void> {
  await db
    .update(brokerConnections)
    .set({
      lastStatus: ok ? 'ok' : 'error',
      lastError: ok ? null : (error ?? 'Fetch failed'),
      lastCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(brokerConnections.id, id));
}

// Map of connectionId → "count trades since" cutoff (ms) for every connection
// that has one set. The Trade Log and History load this once and drop any
// broker position whose open time predates its connection's cutoff, so a
// trader's earlier learning/practice phase never counts toward their stats.
export async function connectionCutoffs(): Promise<Map<string, number>> {
  const rows = await db
    .select({ id: brokerConnections.id, start: brokerConnections.historyStartAt })
    .from(brokerConnections);
  const out = new Map<string, number>();
  for (const r of rows) if (r.start) out.set(r.id, r.start.getTime());
  return out;
}

// The cutoff that excludes this position, or null when nothing does. Returning
// the cutoff rather than a boolean is what lets a caller both drop the trade and
// say WHICH date dropped it — counting exclusions off a second, parallel test is
// how a count and a filter come to disagree about the same trade.
export function cutoffFor(
  cutoffs: Map<string, number>,
  connectionId: string | null,
  openedAtMs: number,
): number | null {
  if (!connectionId) return null;
  const cutoff = cutoffs.get(connectionId);
  return cutoff != null && openedAtMs < cutoff ? cutoff : null;
}

// Whether a broker position falls before its connection's cutoff (and so should
// be hidden from the desk stats). A position with no connection, or whose
// connection has no cutoff, is always kept.
export function beforeCutoff(
  cutoffs: Map<string, number>,
  connectionId: string | null,
  openedAtMs: number,
): boolean {
  return cutoffFor(cutoffs, connectionId, openedAtMs) != null;
}

// Has this user set up any connection at all?
export async function hasAnyConnection(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: brokerConnections.id })
    .from(brokerConnections)
    .where(eq(brokerConnections.userId, userId))
    .limit(1);
  return rows.length > 0;
}

// Bring every stored connection's name in line with the rule above, on boot.
//
// This is the half a migration cannot do. Migration 0085 renamed the labels
// that existed the day it ran and then was finished forever, so a Kraken
// connection created afterwards came back reading "Andrew's Trades" beside an
// OANDA one — the exact confusion the rename existed to remove. Running the
// same `venueLabel` the write paths use, on every start, means a row can only
// ever be wrong until the next deploy rather than permanently.
//
// Safe to run repeatedly: `venueLabel` is idempotent, so a name that already
// says its venue is not touched, and nothing is written unless it changes.
export async function backfillConnectionLabels(): Promise<void> {
  const rows = await db
    .select({ id: brokerConnections.id, label: brokerConnections.label, broker: brokerConnections.broker })
    .from(brokerConnections);
  for (const r of rows) {
    const fixed = venueLabel(r.label, r.broker).slice(0, 80);
    if (fixed === r.label) continue;
    await db
      .update(brokerConnections)
      .set({ label: fixed, updatedAt: new Date() })
      .where(eq(brokerConnections.id, r.id));
  }
}

// Re-seal `manual` connections whose stored payload can no longer be read.
//
// A manual connection has no credentials — its encrypted payload is an empty
// object, kept only so every connection has the same shape — but it is still
// decrypted on the way to the Live Wall, which reads a hand-entered book through
// the same path as a broker one. So when the encryption scheme changed, a manual
// book would have quietly dropped off the wall with nothing for its owner to
// re-enter: there is no key to paste.
//
// Migration 0094 therefore leaves manual rows alone and this repairs them, the
// same split as the connection-label backfill above — a migration cannot run the
// encryption, and this is the half it cannot do. Idempotent and cheap: a row that
// already reads is left untouched, and the plaintext is a constant.
export async function repairManualConnectionSecrets(): Promise<void> {
  const rows = await db.select().from(brokerConnections).where(eq(brokerConnections.broker, 'manual'));
  for (const r of rows) {
    try {
      JSON.parse(decryptSecret(r.secretEnc, { userId: r.userId, connectionId: r.id }));
      continue;
    } catch {
      // Unreadable — re-seal it below. Nothing is lost: a manual connection's
      // credential is `{}`, and its positions live in their own table.
    }
    await db
      .update(brokerConnections)
      .set({
        secretEnc: encryptSecret(JSON.stringify({}), { userId: r.userId, connectionId: r.id }),
        updatedAt: new Date(),
      })
      .where(eq(brokerConnections.id, r.id));
    console.log(`[connections] re-sealed manual connection ${r.id} under the current credentials key`);
  }
}

// Seed the owner's connections from the existing global env keys, if they have
// none yet. Lets the current env-based setup keep working after the move to
// per-user connections. Idempotent.
export async function seedConnectionsFromEnv(userId: string): Promise<void> {
  if (await hasAnyConnection(userId)) return;

  const owner = (
    await db.select({ name: users.displayName, username: users.username }).from(users).where(eq(users.id, userId)).limit(1)
  )[0];
  // Just the first name — "Andrew Roberts's OANDA" is a chip nobody can read.
  const who = (owner?.name || owner?.username || '').trim().split(/\s+/)[0] ?? '';

  const env = (n: string) => {
    const v = process.env[n];
    return v && v.trim() ? v.trim() : undefined;
  };
  const oandaToken = env('OANDA_API_TOKEN');
  const oandaAccount = env('OANDA_ACCOUNT_ID');
  const oandaEnv = (env('OANDA_ENV') ?? 'practice').toLowerCase() === 'live' ? 'live' : 'practice';
  if (oandaToken && oandaAccount) {
    await addConnection(userId, {
      broker: 'oanda',
      label: defaultConnectionLabel(who, 'oanda'),
      creds: { token: oandaToken, accountId: oandaAccount, env: oandaEnv },
    });
  }

  const krakenKey = env('KRAKEN_API_KEY');
  const krakenSecret = env('KRAKEN_API_SECRET');
  if (krakenKey && krakenSecret) {
    await addConnection(userId, {
      broker: 'kraken',
      label: defaultConnectionLabel(who, 'kraken'),
      creds: { apiKey: krakenKey, apiSecret: krakenSecret },
    });
  }
}
