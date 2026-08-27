// What database is this deployment actually serving, and what is in it?
//
// Written after a deploy where the private terminal came up healthy, signed the
// owner in, and showed an empty desk — because the service was pointed at a
// different database than the one holding the history. Nothing on any screen
// could say so, and answering it otherwise needs the Railway dashboard or the
// Railway CLI, neither of which is always to hand.
//
// TWO RULES SHAPE THIS FILE.
//
//   • IT NEVER RETURNS A CONNECTION STRING. A libsql URL carries its auth token
//     in the query string, and `file:` paths are harmless but the two arrive
//     through the same variable — so nothing here hands back the raw value.
//     `describeTarget` returns the SHAPE: which variable supplied it, the driver,
//     and the host or path with everything after it dropped. That is enough to
//     tell two databases apart, which is the whole question, and not enough to
//     connect to either.
//
//   • IT ONLY READS. Counts, account identity, and whether a stored credential
//     opens. No migration, no repair, no write — the same contract as
//     `db:inspect`, which this is the in-terminal version of.
import { db, client } from '../db/index.js';
import { config } from '../config.js';
import { users } from '../db/schema.js';
import { decryptSecret, MalformedSecretError, SecretAuthError, WrongKeyError } from '../security/secretbox.js';

export interface DevAccount {
  id: string;
  username: string;
  rank: 'founder' | 'admin' | 'member';
  active: boolean;
  /** Whether this account appears in PRIVATE_ACCESS_USER_IDS as configured here. */
  admitted: boolean;
}

export interface DevCredential {
  broker: string;
  label: string;
  active: boolean;
  /** null when it opened; otherwise why it did not, in words. */
  problem: string | null;
}

export interface DevEnvironment {
  database: {
    /** Which environment variable supplied the target. */
    source: 'PRIVATE_DATABASE_URL' | 'DATABASE_URL';
    driver: string;
    /** Host or file path, with any query string (and therefore any token) removed. */
    target: string;
  };
  counts: Record<string, number | null>;
  accounts: DevAccount[];
  allowlist: {
    configured: boolean;
    /** IDs admitted that do not exist in THIS database — the sign of a mismatch. */
    unknownIds: string[];
  };
  credentials: DevCredential[];
  credentialsTested: boolean;
}

// The shape of a target, never the target itself. A query string is dropped
// wholesale rather than filtered: a token can ride under any parameter name, and
// an allowlist of "safe" ones is a list somebody eventually adds to.
function describeTarget(raw: string): { driver: string; target: string } {
  if (raw.startsWith('file:')) {
    const path = raw.slice('file:'.length).split('?')[0]!;
    return { driver: 'sqlite file', target: path };
  }
  try {
    const parsed = new URL(raw);
    return { driver: parsed.protocol.replace(':', ''), target: parsed.host };
  } catch {
    return { driver: 'unknown', target: '(unreadable)' };
  }
}

const TABLES: Array<[string, string]> = [
  ['accounts', 'users'],
  ['closed and open trades', 'trading_positions'],
  ['broker connections', 'broker_connections'],
  ['funded trades', 'funded_trades'],
  ['trading notes', 'trading_notes'],
  ['study games', 'study_decks'],
  ['investment accounts', 'investment_accounts'],
  ['net worth items', 'net_worth_items'],
];

async function count(table: string): Promise<number | null> {
  try {
    const r = await client.execute(`select count(*) as n from ${table}`);
    return Number(r.rows[0]?.n ?? 0);
  } catch {
    return null; // absent on this schema version
  }
}

function rankOf(roles: string | null): DevAccount['rank'] {
  const r = roles ?? '';
  if (r.includes('founder') || r.includes('software_developer')) return 'founder';
  if (r.includes('admin')) return 'admin';
  return 'member';
}

function explain(error: unknown): string {
  if (error instanceof WrongKeyError) return 'sealed under a different CREDENTIALS_KEY';
  if (error instanceof SecretAuthError) return 'key matches, but the row moved — the account or connection ID changed';
  if (error instanceof MalformedSecretError) return 'an older record, or corrupt';
  return (error as Error).message || 'unreadable';
}

export async function readDevEnvironment(): Promise<DevEnvironment> {
  const raw = process.env.PRIVATE_DATABASE_URL?.trim();
  const source = raw ? 'PRIVATE_DATABASE_URL' : 'DATABASE_URL';
  const { driver, target } = describeTarget(config.databaseUrl);

  const counts: Record<string, number | null> = {};
  for (const [label, table] of TABLES) counts[label] = await count(table);

  const admitted = new Set(
    (process.env.PRIVATE_ACCESS_USER_IDS ?? '').split(',').map((v) => v.trim()).filter(Boolean),
  );

  const rows = await db
    .select({ id: users.id, username: users.username, roles: users.roles, active: users.active })
    .from(users)
    .catch(() => []);

  const accounts: DevAccount[] = rows.map((u) => ({
    id: u.id,
    username: u.username,
    rank: rankOf(u.roles as string | null),
    active: Boolean(u.active),
    admitted: admitted.has(u.id),
  }));

  // An admitted ID that is not an account HERE is the signature of a service
  // pointed at one database with an allowlist written from another.
  const present = new Set(accounts.map((a) => a.id));
  const unknownIds = [...admitted].filter((id) => !present.has(id));

  const credentials: DevCredential[] = [];
  let credentialsTested = false;
  const conns = await client
    .execute('select id, user_id, broker, label, secret_enc, active from broker_connections')
    .catch(() => null);
  if (conns) {
    credentialsTested = true;
    for (const c of conns.rows) {
      const broker = String(c.broker);
      const entry: DevCredential = {
        broker,
        label: String(c.label),
        active: Number(c.active) === 1,
        problem: null,
      };
      // A manual book holds no credential to test.
      if (broker !== 'manual') {
        try {
          decryptSecret(String(c.secret_enc), { userId: String(c.user_id), connectionId: String(c.id) });
        } catch (error) {
          entry.problem = explain(error);
        }
      }
      credentials.push(entry);
    }
  }

  return {
    database: { source, driver, target },
    counts,
    accounts,
    allowlist: { configured: admitted.size > 0, unknownIds },
    credentials,
    credentialsTested,
  };
}
