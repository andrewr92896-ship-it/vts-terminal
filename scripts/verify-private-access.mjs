#!/usr/bin/env node
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const key = () => randomBytes(32).toString('base64');
const base = {
  ...process.env,
  NODE_ENV: 'production',
  PRIVATE_PORTAL_ORIGIN: 'https://portal.vitalistradingsystems.com',
  PRIVATE_DATABASE_URL: 'file:./data/boundary-check.db',
  PRIVATE_SESSION_SECRET: key(),
  CREDENTIALS_KEY: key(),
  COOKIE_SECURE: 'true',
};
delete base.PRIVATE_ACCESS_USER_IDS;

const run = (env) => spawnSync(
  'npm',
  ['exec', '--workspace', '@vts/api', '--', 'tsx', 'src/config.ts'],
  { env, encoding: 'utf8', shell: true },
);

const denied = run(base);
if (denied.status === 0 || !`${denied.stderr}${denied.stdout}`.includes('PRIVATE_ACCESS_USER_IDS')) {
  console.error('FAIL private production config did not fail closed without an allowlist');
  process.exit(1);
}

const admitted = run({ ...base, PRIVATE_ACCESS_USER_IDS: 'verification-user-id' });
if (admitted.status !== 0) {
  console.error('FAIL private production config rejected an explicit allowlist');
  console.error(admitted.stderr);
  process.exit(admitted.status ?? 1);
}

const bootstrapId = randomUUID();
const bootstrap = run({
  ...base,
  PRIVATE_ACCESS_USER_IDS: bootstrapId,
  PRIVATE_BOOTSTRAP_ADMIN_ID: bootstrapId,
});
if (bootstrap.status !== 0) {
  console.error('FAIL private production config rejected an allowlisted bootstrap admin ID');
  console.error(bootstrap.stderr);
  process.exit(bootstrap.status ?? 1);
}

const mismatchedBootstrap = run({
  ...base,
  PRIVATE_ACCESS_USER_IDS: randomUUID(),
  PRIVATE_BOOTSTRAP_ADMIN_ID: bootstrapId,
});
if (
  mismatchedBootstrap.status === 0 ||
  !`${mismatchedBootstrap.stderr}${mismatchedBootstrap.stdout}`.includes(
    'PRIVATE_BOOTSTRAP_ADMIN_ID',
  )
) {
  console.error('FAIL private production config accepted a bootstrap admin outside the allowlist');
  process.exit(1);
}

console.log('Private admission configuration checks passed.');
