import crypto from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

// Argon2id with sensible interactive parameters. @node-rs/argon2 ships
// prebuilt native binaries, so there is no compile step.
const OPTIONS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(
  storedHash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}

// A hash of a throwaway secret, computed once at startup. When a login attempt
// names a user that doesn't exist (or is inactive), the route verifies the
// supplied password against this instead of skipping the hash entirely — so the
// response takes the same ~Argon2 time either way and an attacker can't tell
// real usernames apart from fake ones by timing. Always returns false.
const dummyHash: Promise<string> = hashPassword(crypto.randomBytes(32).toString('hex'));

export async function verifyDummyPassword(plain: string): Promise<boolean> {
  await verify(await dummyHash, plain).catch(() => false);
  return false;
}
