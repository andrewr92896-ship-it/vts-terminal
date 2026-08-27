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

// ---- who is in this database, and by what id? -------------------------------
//
// The reason this prints IDs rather than just a count: PRIVATE_ACCESS_USER_IDS
// admits accounts by ID, and two databases hold DIFFERENT accounts. Point a
// service at a different database without moving the allowlist to match, and it
// starts perfectly well and then refuses the only person who should be let in —
// a working site nobody can sign in to, with nothing on screen saying why.
//
// So: read the ID from the database that is about to be SERVED, and set the
// allowlist from that, before switching anything.
console.log('\n[accounts]');
const accounts = await client
  .execute('select id, username, display_name, email, roles, active from users order by created_at')
  .catch(() => null);

if (!accounts) {
  console.log('  no users table on this schema version.');
} else if (accounts.rows.length === 0) {
  console.log('  none — this database has never been seeded.');
} else {
  for (const u of accounts.rows) {
    const roles = String(u.roles ?? '');
    const rank = roles.includes('founder') || roles.includes('software_developer')
      ? 'founder'
      : roles.includes('admin')
        ? 'admin'
        : 'member';
    const state = Number(u.active) === 0 ? ' [inactive]' : '';
    console.log(`  ${String(u.id)}  ${String(u.username)} · ${rank}${state}`);
  }
  console.log('  → PRIVATE_ACCESS_USER_IDS admits by the ID on the left, and these IDs are');
  console.log('    specific to THIS database. Set it from whichever database will be served.');
}

// ---- WHO OWNS THE TRADES, AND WHAT IS FILTERING THEM OUT? -------------------
//
// The counts above say the database holds trades. They do NOT say the signed-in
// account will see any of them, and those are different questions — a terminal
// can read exactly the right database and still show an empty desk.
//
// Three things independently produce "0 trades" over a full table, and this
// section separates them because the fix differs completely:
//
//   1. OWNERSHIP. Trade visibility is self-only unless the account holds the
//      Trading Teams grant, so a book owned by another user row is invisible —
//      correctly — to whoever is signed in.
//   2. THE CONNECTION CUTOFF. `history_start_at` excludes everything logged
//      before it. Set to a recent date, it hides an entire history while every
//      row is still present and correct.
//   3. SOFT DELETION. A row with `deleted_at` is on the Deleted Trades screen
//      and nowhere else.
console.log('\n[trades by owner]');
const owners = await client
  .execute(
    `select u.id, u.username, u.team_id as team,
            sum(case when p.deleted_at is null and p.status = 'open' then 1 else 0 end) as open_now,
            sum(case when p.deleted_at is null and p.status = 'closed' then 1 else 0 end) as closed,
            sum(case when p.deleted_at is not null then 1 else 0 end) as deleted
       from users u left join trading_positions p on p.user_id = u.id
      group by u.id order by closed desc`,
  )
  .catch(() => null);

if (!owners) {
  console.log('  could not read trades by owner on this schema version.');
} else {
  for (const r of owners.rows) {
    const open = Number(r.open_now ?? 0);
    const closed = Number(r.closed ?? 0);
    const deleted = Number(r.deleted ?? 0);
    if (open + closed + deleted === 0) continue;
    console.log(
      `  ${String(r.username)} (${String(r.id)})  open ${open} · closed ${closed} · deleted ${deleted}` +
        (r.team ? `  team ${String(r.team)}` : '  no team'),
    );
  }
  console.log('  → a trader sees only their OWN trades unless their account holds the');
  console.log('    Trading Teams grant. Trades owned by another row are hidden by design.');
}

// The cutoff is the quiet one: every row present, every row excluded.
console.log('\n[connection cutoffs]');
const cutoffs = await client
  .execute(
    `select c.id, c.user_id, c.broker, c.label, c.active, c.history_start_at as cutoff,
            (select count(*) from trading_positions p
              where p.connection_id = c.id and p.deleted_at is null) as rows_total,
            (select count(*) from trading_positions p
              where p.connection_id = c.id and p.deleted_at is null
                and c.history_start_at is not null
                and coalesce(p.closed_at, p.opened_at, p.first_seen_at) < c.history_start_at) as rows_before
       from broker_connections c`,
  )
  .catch(() => null);

if (!cutoffs) {
  console.log('  no broker_connections table on this schema version.');
} else if (cutoffs.rows.length === 0) {
  console.log('  none stored.');
} else {
  for (const c of cutoffs.rows) {
    const cutoff = c.cutoff ? new Date(Number(c.cutoff)).toISOString().slice(0, 10) : null;
    const total = Number(c.rows_total ?? 0);
    const before = Number(c.rows_before ?? 0);
    console.log(
      `  ${String(c.broker)} · ${String(c.label)}${Number(c.active) === 1 ? '' : ' (paused)'}` +
        `  owner ${String(c.user_id)}  ${total} trades` +
        (cutoff ? `  counted since ${cutoff} — ${before} excluded by it` : '  no cutoff set'),
    );
  }
  const hidden = cutoffs.rows.some((c) => Number(c.rows_before ?? 0) > 0 && Number(c.rows_before) === Number(c.rows_total));
  if (hidden) {
    console.log('  → A CUTOFF IS EXCLUDING AN ENTIRE CONNECTION\'S HISTORY. The rows are all');
    console.log('    still there; clear or move the "count trades since" date to count them.');
  }
}

// Trades that arrived with no connection attached still belong to their owner
// and still count — worth stating so a zero here is not read as a problem.
const orphaned = await client
  .execute("select count(*) as n from trading_positions where connection_id is null and deleted_at is null")
  .catch(() => null);
if (orphaned) console.log(`  ${Number(orphaned.rows[0]?.n ?? 0)} trades carry no connection (still counted)`);

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
