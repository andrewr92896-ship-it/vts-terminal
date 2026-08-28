#!/usr/bin/env node
// Apply the public migrations to the public database.
//
// There was no runner at all, so provisioning meant feeding twelve files
// through psql by hand, in the right order, and remembering which had already
// been applied. This is that, done once and repeatably:
//
//   PUBLIC_DATABASE_URL=... npm run db:migrate:public
//
// It is idempotent, so it is safe to run on every deploy: what has already been
// applied is recorded in `public_migrations` and skipped.
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';

const url = process.env.PUBLIC_DATABASE_URL;
if (!url) {
  console.error('PUBLIC_DATABASE_URL is not set.');
  console.error('This runs against the PUBLIC database only — see the deployment runbook.');
  process.exit(1);
}

const dir = new URL('../migrations/', import.meta.url);
const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();

const pool = new pg.Pool({ connectionString: url, application_name: 'vts-public-migrate' });
try {
  // REFUSE TO TOUCH THE PRIVATE DATABASE. Every public table is prefixed, so a
  // table without that prefix means this is pointed at the wrong database — and
  // the private one is the one with real trades and real credentials in it. The
  // check costs one query and removes the worst thing this script could do.
  const foreign = await pool.query(
    `select table_name from information_schema.tables
      where table_schema='public' and table_name not like 'public\\_%' limit 5`);
  if (foreign.rowCount > 0) {
    console.error('Refusing to run: this database holds tables that are not public_*:');
    for (const row of foreign.rows) console.error(`  ${row.table_name}`);
    console.error('PUBLIC_DATABASE_URL is probably pointed at the wrong database.');
    process.exit(1);
  }

  await pool.query(`create table if not exists public_migrations(
    name text primary key,
    applied_at timestamptz not null default now())`);
  const applied = new Set((await pool.query('select name from public_migrations')).rows.map((r) => r.name));

  let ran = 0;
  for (const name of files) {
    if (applied.has(name)) continue;
    const sql = await readFile(new URL(name, dir), 'utf8');
    const client = await pool.connect();
    try {
      // One transaction per migration: a file that fails part way leaves
      // nothing behind, so the next run starts it cleanly rather than on top of
      // half of itself.
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into public_migrations(name) values($1)', [name]);
      await client.query('commit');
      console.log(`applied ${name}`);
      ran += 1;
    } catch (error) {
      await client.query('rollback').catch(() => {});
      console.error(`FAILED ${name}`);
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    } finally {
      client.release();
    }
  }
  console.log(ran === 0 ? `Up to date (${files.length} migrations already applied).` : `Applied ${ran} migration(s).`);
} finally {
  await pool.end();
}
