import crypto from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  brokerConnections,
  users,
  BROKER_CONNECTION_KINDS,
  type BrokerConnectionKind,
  type BrokerConnectionRow,
} from '../db/schema.js';
import { canAccessWorkspace, parseRoles } from '../auth/rbac.js';
import { decryptSecret, encryptSecret } from '../security/secretbox.js';
import { DEMO_USERNAME } from '../demo/identity.js';

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

function toPublic(row: BrokerConnectionRow): BrokerConnection {
  return {
    id: row.id,
    broker: row.broker,
    label: row.label,
    summary: row.summary,
    // The summary encodes the environment ("Live · ..." / "Practice · ...").
    env: row.broker === 'oanda' ? (row.summary?.startsWith('Live') ? 'live' : 'practice') : null,
    active: row.active,
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

export async function getActiveDecrypted(userId: string): Promise<DecryptedConnection[]> {
  const rows = await db
    .select()
    .from(brokerConnections)
    .where(and(eq(brokerConnections.userId, userId), eq(brokerConnections.active, true)));
  const out: DecryptedConnection[] = [];
  for (const r of rows) {
    try {
      out.push({ id: r.id, broker: r.broker, label: r.label, creds: JSON.parse(decryptSecret(r.secretEnc)) });
    } catch {
      // Undecryptable (e.g. key rotated), skip; status stays as last recorded.
    }
  }
  return out;
}

// Active broker connections, decrypted and tagged with their owner. Only
// connections owned by a user who currently has trading access are included, so
// a revoked teammate drops off automatically.
//
// `scopeIds` restricts the result to connections owned by those userIds — the
// viewer's team — so the Live Wall and broker capital only ever surface a team's
// own positions. Omit it (background desk reconcile) to load the whole install;
// no viewer sees that result, it only records each owner's positions to History.
export async function getAllActiveDecrypted(scopeIds?: Set<string>): Promise<OwnedConnection[]> {
  const rows = await db
    .select({
      conn: brokerConnections,
      username: users.username,
      roles: users.roles,
    })
    .from(brokerConnections)
    .innerJoin(users, eq(users.id, brokerConnections.userId))
    .where(
      scopeIds
        ? and(eq(brokerConnections.active, true), inArray(brokerConnections.userId, [...scopeIds]))
        : eq(brokerConnections.active, true),
    );

  const out: OwnedConnection[] = [];
  for (const r of rows) {
    // The public demo account is a sandbox, not a desk member: keep its
    // connections off the shared Live Wall (and keep the real desk's positions
    // out of the demo, handled in the service).
    if (r.username === DEMO_USERNAME) continue;
    if (!canAccessWorkspace(parseRoles({ roles: r.roles }), 'trading')) continue;
    try {
      out.push({
        id: r.conn.id,
        broker: r.conn.broker,
        label: r.conn.label,
        creds: JSON.parse(decryptSecret(r.conn.secretEnc)),
        ownerId: r.conn.userId,
        owner: r.username,
        historyStartAt: r.conn.historyStartAt ? r.conn.historyStartAt.getTime() : null,
      });
    } catch {
      // Undecryptable (e.g. key rotated), skip; status stays as last recorded.
    }
  }
  return out;
}

export async function addConnection(
  userId: string,
  input: { broker: BrokerConnectionKind; label: string; creds: Record<string, unknown> },
): Promise<void> {
  // Whatever the caller passed — a person typing in the form, or another agent
  // calling this directly — comes out naming its venue.
  const label = venueLabel(str(input.label) || defaultConnectionLabel('', input.broker), input.broker);
  const creds = normalizeCreds(input.broker, input.creds);
  const now = new Date();
  await db.insert(brokerConnections).values({
    id: crypto.randomUUID(),
    userId,
    broker: input.broker,
    label: label.slice(0, 80),
    secretEnc: encryptSecret(JSON.stringify(creds)),
    summary: summaryOf(input.broker, creds),
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
    patch.secretEnc = encryptSecret(JSON.stringify(creds));
    patch.summary = summaryOf(row.broker, creds);
    // New credentials → reset health until the next refresh proves them.
    patch.lastStatus = 'unknown';
    patch.lastError = null;
  }
  await db
    .update(brokerConnections)
    .set(patch)
    .where(and(eq(brokerConnections.id, id), eq(brokerConnections.userId, userId)));
}

export async function removeConnection(userId: string, id: string): Promise<void> {
  await db
    .delete(brokerConnections)
    .where(and(eq(brokerConnections.id, id), eq(brokerConnections.userId, userId)));
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

// Whether a broker position falls before its connection's cutoff (and so should
// be hidden from the desk stats). A position with no connection, or whose
// connection has no cutoff, is always kept.
export function beforeCutoff(
  cutoffs: Map<string, number>,
  connectionId: string | null,
  openedAtMs: number,
): boolean {
  if (!connectionId) return false;
  const cutoff = cutoffs.get(connectionId);
  return cutoff != null && openedAtMs < cutoff;
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
