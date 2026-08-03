import crypto from 'node:crypto';
import { config } from '../config.js';
import { resolveCredentialsMaterial } from './credentialsKey.js';

// Authenticated symmetric encryption (AES-256-GCM) for secrets stored at rest —
// specifically per-user broker API credentials, which can place real orders.
//
// Envelope: `v2:<keyId>:<iv_b64>:<tag_b64>:<ct_b64>`
//
// Four things that were not true of the v1 envelope, and each is load-bearing:
//
//  - **The key is generated, not derived from a passphrase.** See
//    `credentialsKey.ts` for why the answer to "a passphrase brute-forces at
//    SHA-256 speed" is a key nobody can guess rather than a slow KDF: these
//    credentials are decrypted on the Live Wall's 10-second poll for every
//    connection on a team.
//  - **HKDF-SHA256, with a salt and a domain-separating info string**, instead
//    of a bare `sha256(prefix + secret)`.
//  - **A key id travels with the ciphertext**, so a record can say which key
//    wrote it. Without that, rotating the key means every user re-enters their
//    broker credentials by hand.
//  - **AAD binds a ciphertext to its row.** A blob lifted out of one connection
//    and pasted into another no longer decrypts, so the database row is part of
//    what the tag authenticates rather than a container anything can be moved
//    between.
//
// v1 records cannot be read here and are not meant to be: migration 0094 marks
// every stored connection errored, and re-entering the credential re-encrypts it
// under this scheme.

export class SecretboxError extends Error {}

// The stored value is not a v2 envelope at all — a v1 record, or a truncated /
// corrupted column. Distinct from a key mismatch on purpose: this one can never
// be fixed by finding the right key.
export class MalformedSecretError extends SecretboxError {}

// The envelope is well formed but was written by a DIFFERENT key.
//
// This is the rotation seam. Nothing consumes the distinction yet — every caller
// today treats it the same as any other failure — but it is what a rotation path
// needs: try the current key, catch this specifically, retry with the retired
// key from a `CREDENTIALS_KEY_PREVIOUS`, and re-encrypt the row on read so the
// fleet migrates itself. Rotation itself is deliberately not built here.
export class WrongKeyError extends SecretboxError {
  constructor(readonly storedKeyId: string, readonly currentKeyId: string) {
    super(`Ciphertext was written by key ${storedKeyId}; the configured key is ${currentKeyId}`);
  }
}

// The tag did not verify: tampered ciphertext, a truncated tag, or an envelope
// presented against the wrong connection id / user id.
export class SecretAuthError extends SecretboxError {}

const ENVELOPE_VERSION = 'v2';
// GCM's standard 96-bit nonce and full 128-bit tag. The tag length is pinned on
// both sides — an unpinned `createDecipheriv` accepts a SHORTENED tag, so a
// stored blob could carry a weakened one and still verify.
const IV_BYTES = 12;
const TAG_BYTES = 16;

// HKDF inputs. Fixed rather than configurable: the salt is domain separation
// between this use of the key material and any future one, not a secret, and
// changing either makes every stored ciphertext unreadable.
const HKDF_SALT = Buffer.from('vts-terminal/credentials/v2', 'utf8');
const HKDF_INFO = Buffer.from('broker-credential-encryption', 'utf8');

// Which row a ciphertext belongs to. Authenticated as additional data, so it is
// covered by the tag without being stored in the envelope.
export interface SecretScope {
  userId: string;
  connectionId: string;
}

function aadFor(scope: SecretScope): Buffer {
  return Buffer.from(`vts:broker_connections:${scope.userId}:${scope.connectionId}`, 'utf8');
}

// Derived once per process. The old code re-hashed the key material on every
// call, which on the desk poll meant a derivation per connection per 10 seconds
// for no benefit.
let derived: { key: Buffer; keyId: string } | null = null;

function keyring(): { key: Buffer; keyId: string } {
  if (derived) return derived;
  const resolved = resolveCredentialsMaterial({
    credentialsKey: config.CREDENTIALS_KEY,
    sessionSecret: config.SESSION_SECRET,
    isProd: config.isProd,
  });
  // config.ts runs this same resolution at boot and exits on failure, so
  // reaching here means the process started without it — never in production.
  if (!resolved.ok) throw new SecretboxError(resolved.message);
  const key = Buffer.from(crypto.hkdfSync('sha256', resolved.ikm, HKDF_SALT, HKDF_INFO, 32));
  // The id is derived from the key itself, so rotation needs no second variable
  // to keep in step — a key always answers to the same id wherever it is set.
  const keyId = crypto.createHash('sha256').update(key).digest('hex').slice(0, 8);
  derived = { key, keyId };
  return derived;
}

// The id of the key this process is configured with. Exposed for diagnostics —
// it identifies the key without revealing anything about it.
export function currentKeyId(): string {
  return keyring().keyId;
}

// Encrypt a UTF-8 string for one specific connection row.
export function encryptSecret(plaintext: string, scope: SecretScope): string {
  const { key, keyId } = keyring();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aadFor(scope));
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENVELOPE_VERSION,
    keyId,
    iv.toString('base64'),
    tag.toString('base64'),
    enc.toString('base64'),
  ].join(':');
}

// Decrypt an envelope written for this exact connection row. Throws
// `MalformedSecretError`, `WrongKeyError` or `SecretAuthError` — never a bare
// Error, so a caller can tell "wrong key" from "corrupt" from "tampered".
export function decryptSecret(payload: string, scope: SecretScope): string {
  const parts = payload.split(':');
  if (parts.length !== 5 || parts[0] !== ENVELOPE_VERSION) {
    throw new MalformedSecretError(
      parts[0] === 'v1'
        ? 'Stored in the retired v1 format, which cannot be read'
        : 'Not a recognised ciphertext envelope',
    );
  }
  const [, storedKeyId, ivB, tagB, encB] = parts;
  const { key, keyId } = keyring();
  if (storedKeyId !== keyId) throw new WrongKeyError(storedKeyId, keyId);

  const iv = Buffer.from(ivB, 'base64');
  const tag = Buffer.from(tagB, 'base64');
  // Checked rather than trusted: a short tag is exactly what pinning
  // authTagLength exists to refuse, and a short IV would silently change how the
  // nonce is treated.
  if (iv.length !== IV_BYTES) throw new MalformedSecretError('Ciphertext has a malformed nonce');
  if (tag.length !== TAG_BYTES) throw new MalformedSecretError('Ciphertext has a malformed tag');

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(aadFor(scope));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(encB, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Deliberately not chained: the underlying error is uninformative and the
    // message must never carry any part of the ciphertext into a log.
    throw new SecretAuthError('Ciphertext failed authentication');
  }
}
