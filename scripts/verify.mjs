#!/usr/bin/env node
// Everything that must pass before a branch is proposed — one command, on any OS.
//
// WHY ONE COMMAND. The checks used to be a list in AGENTS.md that a session was
// trusted to remember, and the repo is worked on from two different tools. A
// list is something to forget; this is not. CI runs exactly this, so work from
// either tool meets the same bar whatever the session remembered.
//
// WHY NODE RATHER THAN BASH. This was a bash script first and it did not run on
// Windows. Two reasons, both invisible on Linux: npm on Windows runs scripts
// through cmd.exe, where `bash` may not be on PATH at all; and `mktemp -d` under
// Git Bash returns a POSIX path like /tmp/tmp.AbC that Node then cannot resolve,
// so every database check failed on a path that does not exist. Node is
// guaranteed present in a Node project and behaves the same everywhere, which
// removes both problems rather than working around them.
//
// THE THROWAWAY KEYS ARE NOT SECRETS. The config guard refuses to boot without
// CREDENTIALS_KEY, so one is generated when the caller has none. Nothing here
// reads a real credential or a real database — the encryption check builds its
// own envelopes and the database checks run against scratch files that are
// deleted afterwards. Do NOT replace these with real values or wire repository
// secrets into CI for them; there is nothing for a real key to protect here, and
// putting one in CI is how a production key ends up in a build log.
//
// Add a check by adding a line to STEPS. Cheap ones first so a failure surfaces
// fast, and `build` stays last — it is the slowest and the least likely to fail
// on its own.

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const STEPS = [
  ['typecheck', 'typecheck'],
  ['migrations', 'verify:migrations'],
  ['credential encryption', 'verify:secretbox'],
  ['market data macro', 'verify:market-macro'],
  ['investments math', 'verify:investments'],
  ['position sizing (web ↔ server)', 'verify:sizing'],
  ['Desk right now responsive layout', 'verify:desk-layout'],
  ['rollover alerts and re-entry math', 'verify:rollover'],
  ['study packages', 'verify:study-packages'],
  ['study category draw and breakdown', 'verify:study-categories'],
  ['database integration (auth, sharing, alerts and package edits)', 'verify:db'],
  ['public/private application boundary', 'verify:boundaries'],
  ['build', 'build'],
];

const env = { ...process.env };
const key = () => randomBytes(32).toString('base64');
if (!env.CREDENTIALS_KEY) env.CREDENTIALS_KEY = key();
if (!env.SESSION_SECRET) env.SESSION_SECRET = key();

for (const [label, script] of STEPS) {
  process.stdout.write(`\n── ${label} ──\n`);
  // shell: true is what makes this work on Windows, where the executable is
  // npm.cmd rather than npm.
  const run = spawnSync('npm', ['run', script], { stdio: 'inherit', env, shell: true });
  if (run.status !== 0) {
    process.stdout.write(`\n✗ failed at: ${label}\n\n`);
    process.exit(run.status ?? 1);
  }
}

process.stdout.write('\n✓ all checks passed\n\n');
