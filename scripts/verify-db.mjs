#!/usr/bin/env node
// The checks that WRITE to a database, run against throwaway scratch files.
//
// Each of them deliberately refuses any database that already holds a user —
// that guard is what stops them ever being pointed at production — so each needs
// its own fresh file rather than sharing one. Running them back to back against
// a single scratch database fails the second one, which looks like a real
// failure and is not.
//
// THE SCRATCH FILES ARE INSIDE THE REPO, not in the system temp directory, and
// that is the Windows fix: `mktemp -d` under Git Bash hands back a POSIX path
// (/tmp/tmp.AbC) that Node cannot resolve on Windows. `.tmp-verify/` is
// gitignored and removed on the way out, including after a failure.
//
// THE PATH IS ABSOLUTE, AND BUILT WITH pathToFileURL. Two traps, one per
// platform. A repo-relative URL is resolved by whichever process opens it, and
// these checks reach the database through `npm --workspace @vts/api`, which runs
// with its cwd inside apps/api — so `file:./.tmp-verify/x.db` looked for the
// file one directory too deep and failed to connect. Spelling an absolute path
// by hand then breaks on Windows instead, where a drive letter has to be encoded
// into the URL. pathToFileURL is the one construction that is correct on both.
//
// Called by scripts/verify.mjs. Safe to run on its own.

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CHECKS = [
  { script: 'db:check-ai-usage', env: { AI_MONTHLY_LIMIT: '3', AI_RATE_PER_MIN: '15' } },
  { script: 'db:check-sharing' },
  { script: 'db:check-alerts' },
  { script: 'db:check-package-add' },
  { script: 'db:check-capital' },
  { script: 'db:check-notes' },
  { script: 'db:check-rollover' },
  { script: 'db:check-founder-trades' },
];
const DIR = '.tmp-verify';

const base = { ...process.env };
const key = () => randomBytes(32).toString('base64');
if (!base.CREDENTIALS_KEY) base.CREDENTIALS_KEY = key();
if (!base.SESSION_SECRET) base.SESSION_SECRET = key();

const run = (script, env, quiet = false) =>
  spawnSync('npm', ['run', script], {
    stdio: quiet ? ['inherit', 'ignore', 'inherit'] : 'inherit',
    env,
    shell: true,
  }).status ?? 1;

let status = 0;
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });

try {
  for (const check of CHECKS) {
    const file = resolve(DIR, `${check.script.replace(/:/g, '-')}.db`);
    const env = { ...base, ...check.env, DATABASE_URL: pathToFileURL(file).href };
    status = run('db:migrate', env, true) || run(check.script, env);
    if (status !== 0) break;
  }
} finally {
  // Cleanup has to happen before exit, so the loop records a status rather than
  // calling process.exit — process.exit skips finally.
  rmSync(DIR, { recursive: true, force: true });
}

process.exit(status);
