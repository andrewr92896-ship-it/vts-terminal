import { hash, verify } from '@node-rs/argon2';

// Argon2id with sensible interactive parameters. @node-rs/argon2 ships
// prebuilt native binaries, so there is no compile step.
const OPTIONS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

// A real Argon2id hash used when a login identifier matches no account. The
// plaintext is intentionally irrelevant; running the same verify path prevents
// a missing account from returning before the password work begins.
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$vyz8P/ghODcS4aR4qnDeJw$mtMV04YO5haJvYT4l/QOzBNzTa8V1GhmoCqZFZ+JVUQ';

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
