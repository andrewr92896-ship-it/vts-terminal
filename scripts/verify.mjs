#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const STEPS = [
  ['typecheck', 'typecheck'],
  ['public API authentication and migration security', 'verify:public-api'],
  ['migrations', 'verify:migrations'],
  ['environment checks', 'verify:config'],
  ['private portal admission', 'verify:private-access'],
  ['credential encryption', 'verify:secretbox'],
  ['AI provider seam', 'verify:ai-provider'],
  ['market data macro', 'verify:market-macro'],
  ['investments math', 'verify:investments'],
  ['investments math mirror (private ↔ public)', 'verify:investments-mirror'],
  ['position sizing (web ↔ server)', 'verify:sizing'],
  ['trade movement (pips and points)', 'verify:movement'],
  // The demo is the showcase, and its writes are the half a screenshot cannot
  // see: a capture asserts a page rendered, not that pressing "add" on it did
  // anything.
  // Every api call a public screen can reach must be answered by something —
  // and every write must drive to the act it exists for. Neither is visible to
  // a typecheck or to a screenshot.
  ['demo coverage', 'verify:demo-coverage'],
  ['limits mirror', 'verify:limits-mirror'],
  // The clickwrap's pinned hashes against the documents the terminal actually
  // renders. A stored acceptance names a version and a hash; if the text moves
  // and the hash does not, every row points at words nobody was shown.
  ['legal document hashes (clickwrap)', 'verify:legal-hashes'],
  ['demo writes', 'verify:demo-writes'],
  ['Desk right now responsive layout', 'verify:desk-layout'],
  ['rollover alerts and re-entry math', 'verify:rollover'],
  ['study packages', 'verify:study-packages'],
  ['study category draw and breakdown', 'verify:study-categories'],
  ['database integration (auth, sharing, alerts and package edits)', 'verify:db'],
  ['public/private application boundary', 'verify:boundaries'],
  ['build', 'build'],
  // AFTER the build, deliberately. The boundary step above is the source
  // allowlist, which is worth failing fast on; the built-bundle denylist it
  // also carries has nothing to read until `dist` exists, so on a clean CI
  // checkout it was silently scanning no files at all. This pass is the one
  // that actually reads the shipped public bundle.
  ['public bundle denylist', 'verify:public-imports'],
];
const env={...process.env};const key=()=>randomBytes(32).toString('base64');
if(!env.CREDENTIALS_KEY)env.CREDENTIALS_KEY=key();if(!env.SESSION_SECRET)env.SESSION_SECRET=key();
for(const [label,script] of STEPS){process.stdout.write(`\n── ${label} ──\n`);const run=spawnSync('npm',['run',script],{stdio:'inherit',env,shell:true});if(run.status!==0){process.stdout.write(`\n✗ failed at: ${label}\n\n`);process.exit(run.status??1)}}
process.stdout.write('\n✓ all checks passed\n\n');
