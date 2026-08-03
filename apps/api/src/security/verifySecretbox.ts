import crypto from 'node:crypto';
import {
  DEV_SESSION_SECRET,
  parseCredentialsKey,
  resolveCredentialsMaterial,
} from './credentialsKey.js';

// Offline check of broker-credential encryption (`secretbox.ts`) and of the key
// rules that gate the API's boot (`credentialsKey.ts`).
//
// Everything here fails silently in production if it is wrong. A ciphertext that
// is not bound to its row still decrypts; a tag that is not pinned still
// verifies; a key that is really a passphrase still encrypts. None of it shows up
// as an error anywhere — the terminal keeps working and the guarantee is simply
// absent.
//
//     npm run verify:secretbox           (root or @vts/api)
//
// Exits non-zero on the first mismatch. Reads no network and no database.

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}\n       expected ${e}\n       actual   ${a}`);
  }
}

// Assert that a call throws, and that it throws the RIGHT class — "it failed" is
// not the property under test here, "it failed for the stated reason" is.
function throwsWith(label: string, fn: () => unknown, expected: string): void {
  try {
    fn();
    failures++;
    console.error(`  FAIL ${label}\n       expected ${expected}, but nothing was thrown`);
  } catch (err) {
    const name = err instanceof Error ? err.constructor.name : typeof err;
    if (name === expected) {
      console.log(`  ok   ${label}`);
    } else {
      failures++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  FAIL ${label}\n       expected ${expected}\n       actual   ${name}: ${msg}`);
    }
  }
}

// The module reads its key through config at first use, and config validates the
// environment the moment it is imported — so the key has to be in place before
// either is loaded. Hence the dynamic import.
const TEST_KEY = crypto.randomBytes(32).toString('base64');
process.env.CREDENTIALS_KEY = TEST_KEY;
process.env.SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const { currentKeyId, decryptSecret, encryptSecret } = await import('./secretbox.js');

const SCOPE = { userId: 'user-1', connectionId: 'conn-1' };
const SECRET = JSON.stringify({ token: 'oanda-token-abc123', accountId: '001-001-1234567-001' });

console.log('\nEnvelope\n');
{
  const sealed = encryptSecret(SECRET, SCOPE);
  const parts = sealed.split(':');
  check('round-trips to the same plaintext', decryptSecret(sealed, SCOPE), SECRET);
  check('is a five-part v2 envelope', [parts.length, parts[0]], [5, 'v2']);
  check('carries the current key id', parts[1], currentKeyId());
  check('nonce is 12 bytes', Buffer.from(parts[2], 'base64').length, 12);
  check('tag is a full 16 bytes', Buffer.from(parts[3], 'base64').length, 16);
  check('the same plaintext seals differently each time', encryptSecret(SECRET, SCOPE) === sealed, false);
  check('the plaintext never appears in the envelope', sealed.includes('oanda-token'), false);
}

console.log('\nTampering\n');
{
  const sealed = encryptSecret(SECRET, SCOPE);
  const [v, id, iv, tag, ct] = sealed.split(':');
  // Flip one character of the ciphertext body.
  const flipped = ct[0] === 'A' ? `B${ct.slice(1)}` : `A${ct.slice(1)}`;
  throwsWith(
    'a flipped ciphertext character fails authentication',
    () => decryptSecret([v, id, iv, tag, flipped].join(':'), SCOPE),
    'SecretAuthError',
  );
  const badTag = tag[0] === 'A' ? `B${tag.slice(1)}` : `A${tag.slice(1)}`;
  throwsWith(
    'a flipped tag character fails authentication',
    () => decryptSecret([v, id, iv, badTag, ct].join(':'), SCOPE),
    'SecretAuthError',
  );
  // A shortened tag is the reason authTagLength is pinned on both sides: left
  // unpinned, GCM accepts a truncated tag and verifies against fewer bits.
  const shortTag = Buffer.from(tag, 'base64').subarray(0, 8).toString('base64');
  throwsWith(
    'a truncated tag is refused rather than verified',
    () => decryptSecret([v, id, iv, shortTag, ct].join(':'), SCOPE),
    'MalformedSecretError',
  );
}

console.log('\nRow binding (AAD)\n');
{
  const sealed = encryptSecret(SECRET, SCOPE);
  throwsWith(
    'will not decrypt against another connection id',
    () => decryptSecret(sealed, { userId: SCOPE.userId, connectionId: 'conn-2' }),
    'SecretAuthError',
  );
  throwsWith(
    'will not decrypt against another user id',
    () => decryptSecret(sealed, { userId: 'user-2', connectionId: SCOPE.connectionId }),
    'SecretAuthError',
  );
  // The pair is authenticated together, not as two independent fields.
  throwsWith(
    'will not decrypt with the ids transposed',
    () => decryptSecret(sealed, { userId: SCOPE.connectionId, connectionId: SCOPE.userId }),
    'SecretAuthError',
  );
}

console.log('\nKey identity\n');
{
  const sealed = encryptSecret(SECRET, SCOPE);
  const parts = sealed.split(':');
  parts[1] = 'deadbeef';
  // The rotation seam: a record written by another key says so, distinctly, so a
  // future rotation path can fall back to a retired key instead of treating it
  // as corruption.
  throwsWith(
    'an envelope from another key raises WrongKeyError, not corruption',
    () => decryptSecret(parts.join(':'), SCOPE),
    'WrongKeyError',
  );
  check('the key id is 8 hex characters', /^[0-9a-f]{8}$/.test(currentKeyId()), true);
}

console.log('\nRetired and malformed envelopes\n');
{
  // What a v1 record looks like: `v1:<iv>:<tag>:<ct>`. It must land on the
  // "wrong format" path, which is what surfaces the connection as errored
  // instead of dropping it silently from the desk.
  const v1 = ['v1', 'aXY=', 'dGFn', 'Y3Q='].join(':');
  throwsWith('a v1 envelope is malformed, not a key mismatch', () => decryptSecret(v1, SCOPE), 'MalformedSecretError');
  throwsWith('empty string', () => decryptSecret('', SCOPE), 'MalformedSecretError');
  throwsWith('plaintext JSON', () => decryptSecret('{"token":"x"}', SCOPE), 'MalformedSecretError');
  const sealed = encryptSecret(SECRET, SCOPE);
  const p = sealed.split(':');
  const shortIv = Buffer.from(p[2], 'base64').subarray(0, 8).toString('base64');
  throwsWith(
    'a truncated nonce',
    () => decryptSecret([p[0], p[1], shortIv, p[3], p[4]].join(':'), SCOPE),
    'MalformedSecretError',
  );
}

console.log('\nKey material\n');
{
  check('accepts generated base64', parseCredentialsKey(crypto.randomBytes(32).toString('base64')).ok, true);
  check('accepts generated base64url', parseCredentialsKey(crypto.randomBytes(32).toString('base64url')).ok, true);
  check('accepts generated hex', parseCredentialsKey(crypto.randomBytes(32).toString('hex')).ok, true);
  check('accepts a longer key', parseCredentialsKey(crypto.randomBytes(64).toString('hex')).ok, true);

  check('rejects 16 generated bytes as too short', parseCredentialsKey(crypto.randomBytes(16).toString('hex')).ok, false);
  check('rejects a blank value', parseCredentialsKey('   ').ok, false);
  // The point of the whole design: a passphrase is not key material, however
  // long. Base64's decoder ignores characters it does not know, so without the
  // charset and round-trip checks these decode to something and pass.
  check('rejects a passphrase', parseCredentialsKey('correct horse battery staple').ok, false);
  check(
    'rejects a long dashed passphrase',
    parseCredentialsKey('correct-horse-battery-staple-correct-horse-battery').ok,
    false,
  );
  check('rejects the .env.example placeholder', parseCredentialsKey('change-me-to-a-long-random-string').ok, false);
  check('rejects a repeated character', parseCredentialsKey('a'.repeat(80)).ok, false);
  check('rejects all zeroes', parseCredentialsKey('0'.repeat(64)).ok, false);
}

console.log('\nBoot guard\n');
{
  const good = crypto.randomBytes(32).toString('base64');
  const realSecret = crypto.randomBytes(48).toString('hex');

  const prodNoKey = resolveCredentialsMaterial({ sessionSecret: realSecret, isProd: true });
  check('production refuses to start with no CREDENTIALS_KEY', prodNoKey.ok, false);
  check(
    'and the message names the variable and the fix',
    !prodNoKey.ok && prodNoKey.message.includes('CREDENTIALS_KEY') && prodNoKey.message.includes('randomBytes(32)'),
    true,
  );

  check(
    'production refuses a key equal to SESSION_SECRET',
    resolveCredentialsMaterial({ credentialsKey: realSecret, sessionSecret: realSecret, isProd: true }).ok,
    false,
  );
  check(
    'production refuses a passphrase',
    resolveCredentialsMaterial({ credentialsKey: 'my-broker-key-passphrase', sessionSecret: realSecret, isProd: true }).ok,
    false,
  );
  const prodOk = resolveCredentialsMaterial({ credentialsKey: good, sessionSecret: realSecret, isProd: true });
  check('production accepts a generated key', [prodOk.ok, prodOk.ok && prodOk.source], [true, 'credentials-key']);
  check('and does not warn about it', prodOk.ok && prodOk.warning === undefined, true);

  // Development keeps the SESSION_SECRET fallback so a fresh checkout runs with
  // no .env — but never onto the dev secret that is a literal in this repo.
  const devFallback = resolveCredentialsMaterial({ sessionSecret: realSecret, isProd: false });
  check('development falls back to SESSION_SECRET', devFallback.ok && devFallback.source, 'dev-session-secret');
  check('and warns loudly every time', devFallback.ok && typeof devFallback.warning === 'string', true);
  check(
    'development refuses the built-in dev secret',
    resolveCredentialsMaterial({ sessionSecret: DEV_SESSION_SECRET, isProd: false }).ok,
    false,
  );
  check(
    'a real CREDENTIALS_KEY beats the fallback in development',
    resolveCredentialsMaterial({ credentialsKey: good, sessionSecret: DEV_SESSION_SECRET, isProd: false }).ok,
    true,
  );
}

console.log('');
if (failures > 0) {
  console.error(`${failures} check(s) failed.\n`);
  process.exit(1);
}
console.log('All credential encryption checks passed.\n');
