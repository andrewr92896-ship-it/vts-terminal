import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Structural check over the migration folder.
//
//     npm run verify:migrations           (root or @vts/api)
//
// There are exactly two ways a migration in this repo does nothing while
// reporting success, and both have already cost us:
//
//   1. The .sql file is not registered in migrations/meta/_journal.json.
//      Drizzle iterates the journal, not the directory, so an unregistered file
//      is invisible. 0086_market_news_channel_repair sat in the tree for weeks
//      looking applied, and CLAUDE.md described its effects as fact.
//
//   2. The file holds more than one statement but carries no
//      `--> statement-breakpoint` markers. Drizzle hands an unmarked file over
//      as a single statement, the driver runs the first one, and the rest are
//      discarded without an error. 0083 lost the INSERT that was supposed to
//      carry every existing account into Advanced Trading; 0084 lost the unique
//      index its own seeding path depends on for idempotency.
//
// Neither is visible in `db:migrate` output, in a typecheck, or in a build. This
// script is the thing that sees them. Run it whenever you add a migration.
//
// Exits non-zero on any problem.

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.resolve(here, '..', '..', 'migrations');
const JOURNAL = path.join(MIGRATIONS, 'meta', '_journal.json');

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

/**
 * Count the SQL statements in a migration body.
 *
 * Comment lines are stripped first: a `--` line can contain a semicolon (an
 * apostrophe-heavy sentence, a quoted example) and would otherwise be counted as
 * a statement boundary, which would flag well-formed files.
 */
export function countStatements(sql: string): number {
  const body = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  return body.split(';').filter((chunk) => chunk.trim().length > 0).length;
}

const MARKER = '--' + '> statement-breakpoint';

export function hasBreakpoints(sql: string): boolean {
  return sql.includes(MARKER);
}

/**
 * Occurrences of the marker that are not a line of their own.
 *
 * Drizzle matches the marker as a plain substring, anywhere in the file — so a
 * migration that merely *mentions* it in a comment gets split at that sentence,
 * and whichever statement the split lands inside is handed to the driver in two
 * broken halves. The failure is a bare "SQLITE_OK: not an error", which points
 * nowhere near the cause.
 *
 * (This function is why the constant above is spelled in two pieces: writing the
 * marker out whole in this file would be harmless here, but the habit is what
 * causes the bug in a .sql file, and the check exists to enforce the habit.)
 */
export function malformedMarkers(sql: string): number {
  let bad = 0;
  for (const line of sql.split('\n')) {
    const at = line.indexOf(MARKER);
    if (at < 0) continue;
    const before = line.slice(0, at).trim();
    // On its own line — drizzle's canonical form, and what we hand-write.
    if (before === '') continue;
    // Appended straight after a finished statement, which is what drizzle's own
    // generator emits (`ALTER TABLE ...;<marker>`). The split still lands on a
    // statement boundary, so this is fine.
    if (before.endsWith(';') && !before.startsWith('--')) continue;
    bad++;
  }
  return bad;
}

interface Problem {
  file: string;
  message: string;
}

/**
 * Migrations already applied to production with the breakpoint fault, which
 * therefore cannot be repaired by editing them — drizzle records a migration as
 * applied by its journal timestamp, so changing the file changes nothing on any
 * database that has already seen it. Each was repaired by a LATER migration, and
 * the entry here names it.
 *
 * This list exists so the check is usable: without it the three permanent
 * historical faults would fail every run and the signal would be ignored within
 * a week. Nothing may be added here to silence a NEW migration — a new one can
 * simply be written correctly. Adding to this list is a claim that the file has
 * already run in production and that a named migration has repaired it.
 */
const APPLIED_WITH_KNOWN_FAULT: Record<string, string> = {
  '0083_user_features':
    'lost its grandfathering INSERT; repaired by 0088_repair_skipped_migrations',
  '0084_market_news_channels':
    'lost CREATE UNIQUE INDEX (team_id, key); repaired by 0088_repair_skipped_migrations',
  '0085_connection_labels_name_the_venue':
    'lost 3 of 4 label UPDATEs; superseded by backfillConnectionLabels() on every boot',
};

export function auditMigrations(dir: string, journalPath: string): Problem[] {
  const problems: Problem[] = [];

  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as { entries: JournalEntry[] };
  const tags = journal.entries.map((e) => e.tag);
  const tagSet = new Set(tags);

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const fileSet = new Set(files.map((f) => f.replace(/\.sql$/, '')));

  for (const file of files) {
    const tag = file.replace(/\.sql$/, '');
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');

    if (!tagSet.has(tag)) {
      problems.push({
        file,
        message:
          'not registered in meta/_journal.json — drizzle iterates the journal, ' +
          'so this file has never run and never will',
      });
      // Still worth reporting a formatting problem on the same file.
    }

    const loose = malformedMarkers(sql);
    if (loose > 0) {
      problems.push({
        file,
        message:
          `mentions the statement-breakpoint marker ${loose} time(s) somewhere other than on a line ` +
          'of its own — drizzle matches it as plain text, so the file splits there and the statement ' +
          'around it is handed over in broken halves',
      });
    }

    const statements = countStatements(sql);
    if (statements > 1 && !hasBreakpoints(sql) && !(tag in APPLIED_WITH_KNOWN_FAULT)) {
      problems.push({
        file,
        message:
          `${statements} statements but no "--> statement-breakpoint" markers — ` +
          'only the first would be applied, in silence',
      });
    }
  }

  // A file that outgrew its exemption: if one of the known-faulty migrations is
  // ever edited into a correct shape, the entry is stale and should go, so the
  // list cannot quietly accumulate.
  for (const tag of Object.keys(APPLIED_WITH_KNOWN_FAULT)) {
    if (!fileSet.has(tag)) {
      problems.push({ file: `${tag}.sql`, message: 'listed as a known-faulty migration but the file is gone' });
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, `${tag}.sql`), 'utf8');
    if (countStatements(sql) <= 1 || hasBreakpoints(sql)) {
      problems.push({
        file: `${tag}.sql`,
        message: 'no longer has the fault it is exempted for — drop it from APPLIED_WITH_KNOWN_FAULT',
      });
    }
  }

  for (const tag of tags) {
    if (!fileSet.has(tag)) {
      problems.push({ file: `${tag}.sql`, message: 'listed in the journal but the file is missing' });
    }
  }

  // A duplicated tag would apply one file twice and skip another.
  const seen = new Set<string>();
  for (const tag of tags) {
    if (seen.has(tag)) problems.push({ file: `${tag}.sql`, message: 'appears in the journal more than once' });
    seen.add(tag);
  }

  // Drizzle applies entries whose timestamp is newer than the last one recorded
  // as applied, so a journal that is not strictly increasing silently skips.
  for (let i = 1; i < journal.entries.length; i++) {
    const prev = journal.entries[i - 1]!;
    const cur = journal.entries[i]!;
    if (cur.when <= prev.when) {
      problems.push({
        file: `${cur.tag}.sql`,
        message: `journal timestamp ${cur.when} is not after ${prev.tag}'s ${prev.when} — it would be skipped`,
      });
    }
  }

  return problems;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const problems = auditMigrations(MIGRATIONS, JOURNAL);
  const total = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).length;

  if (problems.length === 0) {
    console.log(`\nAll ${total} migrations are registered and safely formatted.\n`);
    process.exit(0);
  }

  console.error('\nMigration problems found:\n');
  for (const p of problems) console.error(`  ${p.file}\n    ${p.message}\n`);
  console.error(
    `${problems.length} problem(s). A migration with either fault reports success and does nothing.\n` +
      'Fix by registering the file in meta/_journal.json and separating statements with\n' +
      '"--> statement-breakpoint". Never repair a migration that has already been applied by\n' +
      'editing it — drizzle records it as done, so the edit changes nothing. Write a new one.\n',
  );
  process.exit(1);
}
