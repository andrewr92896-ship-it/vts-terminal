#!/usr/bin/env node
// Let somebody in to the public terminal.
//
//   PUBLIC_DATABASE_URL=... npm --workspace @vts/public-api run admit -- \
//     --email someone@example.com --name "Their Name"
//
// Prints the password ONCE. There is nothing that can print it again — it is
// stored only as a scrypt digest — so a lost one is a password recovery, not a
// lookup.
//
// This is the only supported way to create a public account. The three ways a
// hand-written SQL row silently produces an account that cannot sign in are
// documented in src/admit.ts.
import { PostgresPublicStore } from '../dist/src/postgresStore.js';
import { admitAccount, AdmitError } from '../dist/src/admit.js';

const url = process.env.PUBLIC_DATABASE_URL;
if (!url) {
  console.error('PUBLIC_DATABASE_URL is required.');
  process.exit(1);
}

const arg = (name) => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
};

const email = arg('email');
const displayName = arg('name');
if (!email || !displayName) {
  console.error('Usage: admit --email <address> --name "<display name>" [--password <password>]');
  process.exit(1);
}

const store = new PostgresPublicStore(url);
try {
  const admitted = await admitAccount(store, { email, displayName, password: arg('password') });
  console.log(`\nAdmitted ${admitted.displayName} <${admitted.email}>`);
  console.log(`  id        ${admitted.id}`);
  console.log(`  password  ${admitted.password}`);
  console.log('\nThis password is not stored and cannot be printed again.');
  // Said here rather than left to be discovered on a failed sign-in: every
  // login is gated on a code sent by email, and the public mailer has no
  // fallback, so an account on an install with no working SMTP cannot be
  // signed in to at all.
  console.log('Signing in sends a code to that address — check mail is working first.\n');
} catch (error) {
  console.error(error instanceof AdmitError ? `\n${error.message}\n` : error);
  process.exitCode = 1;
} finally {
  await store.close();
}
