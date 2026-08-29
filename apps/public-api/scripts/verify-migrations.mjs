import { readFile, readdir } from 'node:fs/promises';

// Every public migration, not a hand-listed few.
//
// This read the first two by NAME, so every migration added afterwards was
// covered by none of the guards below — including the one that stops a public
// migration creating a private table. A checker that silently stops checking as
// the thing it checks grows is worse than no checker, because it still reports
// success.
const dir = new URL('../migrations/', import.meta.url);
const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
if (files.length === 0) throw new Error('No public migrations found.');
const parts = await Promise.all(files.map((name) => readFile(new URL(name, dir), 'utf8')));
const sql = parts.join('\n');

// The foundation has to be there whatever else changes: everything else
// references public_accounts, so its absence is not a missing feature but a
// database nothing can be stored in.
for (const table of ['public_accounts', 'public_auth_challenges', 'public_sessions', 'public_trusted_devices',
  'public_rate_limits', 'public_recovery_events', 'public_market_layouts', 'public_audit_events',
  'public_early_access_requests']) {
  if (!sql.includes(`create table ${table}`)) throw new Error(`Missing public migration table ${table}`);
}
for (const forbidden of ['users ', 'sessions ', 'broker_connections', 'trading_orders']) {
  if (new RegExp(`create table ${forbidden.replace(' ', '\\s')}`, 'i').test(sql)) {
    throw new Error(`Forbidden private table in public migration: ${forbidden}`);
  }
}
// EVERY public table is prefixed, which is what makes a migration run against
// the wrong database recoverable: it can only ever have created tables whose
// names say where they belong.
// `if not exists` is a legitimate spelling and must not be read as the table's
// name — done that way the guard reports "creates a non-public table: IF", which
// is a guard crying wolf about correct SQL, and a guard people learn to work
// around stops catching the thing it exists for.
for (const [, name] of sql.matchAll(/create table\s+(?:if\s+not\s+exists\s+)?([a-z_]+)/gi)) {
  if (!name.startsWith('public_')) throw new Error(`Public migration creates a non-public table: ${name}`);
}
// A file added but not named in sequence is a file the runner applies in an
// order nobody intended, so the numbering is checked rather than assumed.
files.forEach((name, index) => {
  const expected = String(index + 1).padStart(4, '0');
  if (!name.startsWith(`${expected}_`)) throw new Error(`Migration ${name} is out of sequence; expected ${expected}_`);
});

console.log(`Public migrations verified (${files.length} files).`);
