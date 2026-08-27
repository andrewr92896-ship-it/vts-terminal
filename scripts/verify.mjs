#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const STEPS = [
  ['typecheck', 'typecheck'],
  ['public API authentication and migration security', 'verify:public-api'],
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
const env={...process.env};const key=()=>randomBytes(32).toString('base64');
if(!env.CREDENTIALS_KEY)env.CREDENTIALS_KEY=key();if(!env.SESSION_SECRET)env.SESSION_SECRET=key();
for(const [label,script] of STEPS){process.stdout.write(`\n── ${label} ──\n`);const run=spawnSync('npm',['run',script],{stdio:'inherit',env,shell:true});if(run.status!==0){process.stdout.write(`\n✗ failed at: ${label}\n\n`);process.exit(run.status??1)}}
process.stdout.write('\n✓ all checks passed\n\n');
