import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  brokerConnections,
  BROKER_CONNECTION_KINDS,
  type BrokerConnectionKind,
  type BrokerConnectionRow,
} from '../db/schema.js';
import { decryptSecret, encryptSecret } from '../security/secretbox.js';

// Per-user broker connections. Credentials are encrypted at rest; only a
// non-secret `summary` is ever exposed to the client. The connector layer uses
// getActiveDecrypted() to obtain live credentials.

export type OandaCreds = { token: string; accountId: string; env: 'practice' | 'live' };
export type KrakenCreds = { apiKey: string; apiSecret: string };
export type BrokerCreds = OandaCreds | KrakenCreds;

export type ConnStatus = 'unknown' | 'ok' | 'error';

// Client-safe view — never includes secrets.
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
  createdAt: number;
}

export interface DecryptedConnection {
  id: string;
  broker: BrokerConnectionKind;
  label: string;
  creds: BrokerCreds;
}

export function isBrokerKind(v: unknown): v is BrokerConnectionKind {
  return typeof v === 'string' && (BROKER_CONNECTION_KINDS as readonly string[]).includes(v);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

// Validate + normalize the credentials for a broker. Throws on missing fields.
export function normalizeCreds(broker: BrokerConnectionKind, raw: Record<string, unknown>): BrokerCreds {
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
      // Undecryptable (e.g. key rotated) — skip; status stays as last recorded.
    }
  }
  return out;
}

export async function addConnection(
  userId: string,
  input: { broker: BrokerConnectionKind; label: string; creds: Record<string, unknown> },
): Promise<void> {
  const label = str(input.label) || (input.broker === 'oanda' ? 'OANDA' : 'Kraken');
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
  input: { label?: string; active?: boolean; creds?: Record<string, unknown> },
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
    patch.label = l.slice(0, 80);
  }
  if (input.active !== undefined) patch.active = input.active;
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

// Has this user set up any connection at all?
export async function hasAnyConnection(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: brokerConnections.id })
    .from(brokerConnections)
    .where(eq(brokerConnections.userId, userId))
    .limit(1);
  return rows.length > 0;
}

// Seed "Andrew's Trades" from the existing global env keys for a given user, if
// they have no connections yet. Lets the current env-based setup keep working
// after the move to per-user connections. Idempotent.
export async function seedConnectionsFromEnv(userId: string): Promise<void> {
  if (await hasAnyConnection(userId)) return;

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
      label: "Andrew's Trades",
      creds: { token: oandaToken, accountId: oandaAccount, env: oandaEnv },
    });
  }

  const krakenKey = env('KRAKEN_API_KEY');
  const krakenSecret = env('KRAKEN_API_SECRET');
  if (krakenKey && krakenSecret) {
    await addConnection(userId, {
      broker: 'kraken',
      label: "Andrew's Trades",
      creds: { apiKey: krakenKey, apiSecret: krakenSecret },
    });
  }
}
