import crypto from 'node:crypto';
import { config } from '../config.js';

// Authenticated symmetric encryption (AES-256-GCM) for secrets stored at rest —
// specifically per-user broker API credentials. The key comes from
// CREDENTIALS_KEY when set; otherwise it is derived from SESSION_SECRET so the
// feature works before a dedicated key is configured. Rotating either value
// makes existing ciphertexts undecryptable, so set CREDENTIALS_KEY once and
// keep it stable.

function keyBytes(): Buffer {
  const raw = (config.CREDENTIALS_KEY && config.CREDENTIALS_KEY.trim()) || config.SESSION_SECRET;
  // Hash to a fixed 32-byte key regardless of the input length/format.
  return crypto.createHash('sha256').update(`vts-credentials:${raw}`).digest();
}

// Encrypt a UTF-8 string → "v1:<iv>:<tag>:<ciphertext>" (all base64).
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Malformed ciphertext');
  const [, ivB, tagB, encB] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes(), Buffer.from(ivB, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encB, 'base64')), decipher.final()]).toString('utf8');
}
