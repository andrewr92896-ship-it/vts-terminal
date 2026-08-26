import crypto from 'node:crypto';
import { parseCredentialsKey } from './credentialsKey.js';

export type OfflineEnvelopeFormat = 'current-v2' | 'historical-v1';

export interface OfflineCredentialScope {
  userId: string;
  connectionId: string;
}

export interface OfflineCredentialKey {
  readonly keyId: string;
  readonly currentKey: Buffer;
  readonly historicalKey: Buffer;
  destroy(): void;
}

export class OfflineEnvelopeError extends Error {}
export class OfflineMalformedEnvelopeError extends OfflineEnvelopeError {}
export class OfflineWrongKeyError extends OfflineEnvelopeError {}
export class OfflineAuthenticationError extends OfflineEnvelopeError {}

const IV_BYTES = 12;
const TAG_BYTES = 16;
const HKDF_SALT = Buffer.from('vts-terminal/credentials/v2', 'utf8');
const HKDF_INFO = Buffer.from('broker-credential-encryption', 'utf8');

function aadFor(scope: OfflineCredentialScope): Buffer {
  return Buffer.from(
    'vts:broker_connections:' + scope.userId + ':' + scope.connectionId,
    'utf8',
  );
}

function decodeBase64(value: string, label: string, allowEmpty = false): Buffer {
  if ((!allowEmpty && value.length === 0) || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new OfflineMalformedEnvelopeError('Credential envelope has a malformed ' + label);
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')) {
    decoded.fill(0);
    throw new OfflineMalformedEnvelopeError('Credential envelope has a malformed ' + label);
  }
  return decoded;
}

export function createOfflineCredentialKey(input: Buffer): OfflineCredentialKey {
  const raw = input.toString('utf8').trim();
  const parsed = parseCredentialsKey(raw);
  if (!parsed.ok) {
    throw new OfflineWrongKeyError('Credential key material failed validation');
  }
  const currentKey = Buffer.from(
    crypto.hkdfSync('sha256', parsed.bytes, HKDF_SALT, HKDF_INFO, 32),
  );
  parsed.bytes.fill(0);
  const historicalKey = crypto
    .createHash('sha256')
    .update('vts-credentials:', 'utf8')
    .update(raw, 'utf8')
    .digest();
  const keyId = crypto.createHash('sha256').update(currentKey).digest('hex').slice(0, 8);
  return {
    keyId,
    currentKey,
    historicalKey,
    destroy(): void {
      currentKey.fill(0);
      historicalKey.fill(0);
    },
  };
}

export function envelopeFormat(payload: string): OfflineEnvelopeFormat {
  const parts = payload.split(':');
  if (parts[0] === 'v2' && parts.length === 5) return 'current-v2';
  if (parts[0] === 'v1' && parts.length === 4) return 'historical-v1';
  throw new OfflineMalformedEnvelopeError('Credential envelope format is not supported');
}

export function storedCurrentKeyId(payload: string): string | null {
  if (envelopeFormat(payload) !== 'current-v2') return null;
  const id = payload.split(':')[1] ?? '';
  if (!/^[0-9a-f]{8}$/.test(id)) {
    throw new OfflineMalformedEnvelopeError('Credential envelope key identifier is malformed');
  }
  return id;
}

export function decryptOfflineCredential(
  payload: string,
  scope: OfflineCredentialScope,
  key: OfflineCredentialKey,
): { plaintext: Buffer; format: OfflineEnvelopeFormat } {
  const parts = payload.split(':');
  const format = envelopeFormat(payload);
  const offset = format === 'current-v2' ? 2 : 1;
  if (format === 'current-v2') {
    const storedId = storedCurrentKeyId(payload);
    if (storedId !== key.keyId) {
      throw new OfflineWrongKeyError('Credential envelope was not written by the expected source key');
    }
  }

  const iv = decodeBase64(parts[offset] ?? '', 'nonce');
  const tag = decodeBase64(parts[offset + 1] ?? '', 'authentication tag');
  const ciphertext = decodeBase64(parts[offset + 2] ?? '', 'ciphertext');
  if (iv.length !== IV_BYTES) {
    iv.fill(0);
    tag.fill(0);
    ciphertext.fill(0);
    throw new OfflineMalformedEnvelopeError('Credential envelope nonce length is invalid');
  }
  if (tag.length !== TAG_BYTES) {
    iv.fill(0);
    tag.fill(0);
    ciphertext.fill(0);
    throw new OfflineMalformedEnvelopeError('Credential envelope tag length is invalid');
  }

  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      format === 'current-v2' ? key.currentKey : key.historicalKey,
      iv,
      { authTagLength: TAG_BYTES },
    );
    if (format === 'current-v2') decipher.setAAD(aadFor(scope));
    decipher.setAuthTag(tag);
    return {
      plaintext: Buffer.concat([decipher.update(ciphertext), decipher.final()]),
      format,
    };
  } catch {
    throw new OfflineAuthenticationError('Credential envelope failed authenticated decryption');
  } finally {
    iv.fill(0);
    tag.fill(0);
    ciphertext.fill(0);
  }
}

export function encryptOfflineCredential(
  plaintext: Buffer,
  scope: OfflineCredentialScope,
  key: OfflineCredentialKey,
): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key.currentKey, iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(aadFor(scope));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  try {
    return [
      'v2',
      key.keyId,
      iv.toString('base64'),
      tag.toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  } finally {
    iv.fill(0);
    tag.fill(0);
    ciphertext.fill(0);
  }
}
