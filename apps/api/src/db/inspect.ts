import { createClient } from '@libsql/client';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// READ-ONLY survey of a database, for deciding what to do with it.
//
// Written for one question that cannot be answered by looking at Railway: there
// are two services, each with its own volume, and it is not obvious which holds
// the real history, how far behind its schema is, or — the part that actually
// costs something — whether the broker credentials in it can still be decrypted
// by the service that would be reading them.
//
//     DATABASE_URL="file:/data/vts.db" npm run db:inspect
//
// It runs SELECTs and nothing else: no migration, no write, no repair. Safe to
// point at production. It never prints a credential, only whether one opened.
//
// The credential probe is the reason this exists. A broker secret is sealed
// against its own row (`vts:broker_connections:<userId>:<connectionId>`) under
// CREDENTIALS_KEY, so it survives a move only if the key, the user id and the
// connection id all come across together. Run this with the CREDENTIALS_KEY of
// the service that would be serving, and it says outright how many would open.

const url = process.env.DATABASE_URL ?? process.env.PRIVATE_DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL (or PRIVATE_DATABASE_URL) to the database to inspect.');
  process.exit(1);
}
const client = createClient({ url });

const count = async (table: string): Promise<number | null> => {
  try {
    const r = await client.execute(`select count(*) as n from ${table}`);
    return Number(r.rows[0]?.n ?? 0);
  } catch {
    return null; // the table does not exist on this schema version
  }
};

const row = (label: string, value: string | number | null) =>
  console.log(`  ${label.padEnd(30)} ${value === null ? '— (table not present)' : value}`);

console.log(`\nDatabase: ${url.replace(/(authToken|password)=[^&]*/gi, '$1=***')}`);

// ---- schema age -------------------------------------------------------------
const here = path.dirname(fileURLToPath(import.meta.url));
const onDisk = readdirSync(path.join(here, '../../migrations')).filter((f) => f.endsWith('.sql')).length;
let applied: number | null = null;
try {
  const r = await client.execute('select count(*) as n from __drizzle_migrations');
  applied = Number(r.rows[0]?.n ?? 0);
} catch { applied = null; }

console.log('\n[schema]');
row('migrations applied here', applied);
row('migrations in this checkout', onDisk);
if (applied !== null) {
  console.log(
    applied === onDisk
      ? '  → up to date with this checkout.'
      : `  → ${onDisk - applied} pending. They apply on boot; nothing is lost, but take a snapshot first.`,
  );
} else {
  console.log('  → no drizzle migration table: either an empty volume or not a VTS database.');
}

// ---- what is actually in it -------------------------------------------------
console.log('\n[content]');
for (const [label, table] of [
  ['users', 'users'],
  ['trades (broker + manual)', 'trading_positions'],
  ['hand-typed positions', 'manual_positions'],
  ['broker connections', 'broker_connections'],
  ['funded accounts', 'funded_accounts'],
  ['study games', 'study_decks'],
  ['trading notes', 'trading_notes'],
  ['net worth items', 'net_worth_items'],
  ['budget entries', 'budget_entries'],
  ['investment holdings', 'investment_holdings'],
] as const) {
  row(label, await count(table));
}

// ---- will the broker credentials survive a move? ----------------------------
console.log('\n[broker credentials]');
const connections = await client
  .execute('select id, user_id, broker, label, secret_enc, active from broker_connections')
  .catch(() => null);

if (!connections) {
  console.log('  no broker_connections table on this schema version.');
} else if (connections.rows.length === 0) {
  console.log('  none stored.');
} else if (!process.env.CREDENTIALS_KEY) {
  console.log(`  ${connections.rows.length} stored, not tested.`);
  console.log('  → re-run with the CREDENTIALS_KEY of the service that would serve this data,');
  console.log('    and this reports how many would still open.');
} else {
  const { decryptSecret, WrongKeyError, MalformedSecretError, SecretAuthError } =
    await import('../security/secretbox.js');
  // The three failures mean different things, and only one of them is a
  // "you used the wrong key" that a correct key would fix.
  const explain = (error: unknown): string => {
    if (error instanceof WrongKeyError) return 'sealed under a DIFFERENT CREDENTIALS_KEY';
    if (error instanceof SecretAuthError) return 'key matches but the row moved — user id or connection id changed';
    if (error instanceof MalformedSecretError) return 'older v1 record, or corrupt';
    return (error as Error).message || 'unreadable';
  };
  let opened = 0;
  const failures: string[] = [];
  for (const c of connections.rows) {
    const id = String(c.id);
    const userId = String(c.user_id);
    const label = `${String(c.broker)} · ${String(c.label)}`;
    if (String(c.broker) === 'manual') { opened++; continue; }
    try {
      decryptSecret(String(c.secret_enc), { userId, connectionId: id });
      opened++;
    } catch (error) {
      // The reason matters: a wrong key is recoverable by using the right one,
      // a moved row is not.
      failures.push(`${label} — ${explain(error)}`);
    }
  }
  console.log(`  ${opened} of ${connections.rows.length} open under this CREDENTIALS_KEY.`);
  for (const f of failures) console.log(`    unreadable: ${f}`);
  if (failures.length) {
    console.log('  → a DIFFERENT key means try the other service\'s CREDENTIALS_KEY; the data is fine.');
    console.log('    A moved row cannot be recovered by any key — those get re-entered by hand.');
    console.log('    Either way nothing else is affected: trades, studies and settings do not use this key.');
  }
}

console.log('');
await client.close();
