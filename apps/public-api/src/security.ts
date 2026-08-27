import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const randomCode = () => String(randomBytes(4).readUInt32BE() % 1_000_000).padStart(6, '0');
export const randomTemporaryPassword = () => `${randomToken(12)}!aA7`;
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const keyedHash = (key: string, value: string) => createHmac('sha256', key).update(value).digest('hex');

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('base64url');
  const result = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${result.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [kind, salt, digest] = encoded.split('$');
  if (kind !== 'scrypt' || !salt || !digest) return false;
  const expected = Buffer.from(digest, 'base64url');
  const actual = await scrypt(password, salt, expected.length) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function signToken(id: string, key: string) { return `${id}.${keyedHash(key, id)}`; }
export function verifySignedToken(token: string | undefined, key: string) {
  if (!token) return undefined;
  const split = token.lastIndexOf('.');
  if (split < 1) return undefined;
  const id = token.slice(0, split); const signature = token.slice(split + 1);
  const expected = keyedHash(key, id);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return undefined;
  return id;
}

export function validateNewPassword(password: string) {
  return password.length >= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
}

export function maskEmail(email: string) {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}${local.length > 1 ? '•••' : ''}@${domain}`;
}
