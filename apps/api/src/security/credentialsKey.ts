import { Buffer } from 'node:buffer';

// The key material that encrypts every stored broker credential, and the rules
// it has to satisfy before the API will start.
//
// This module deliberately imports nothing from `config.ts`: config runs the
// boot guard below, and `secretbox.ts` runs the same resolution again to derive
// its key, so the rule has to live somewhere both can reach without a cycle.
//
// **CREDENTIALS_KEY is 32+ bytes of GENERATED randomness, not a passphrase.**
// That is the whole design. The obvious hardening for a human-chosen passphrase
// is a slow KDF (scrypt/argon2), and it is the wrong answer here: credentials
// are decrypted on the Live Wall's 10-second poll, once per connection on the
// team, so a deliberately-expensive derivation would be a permanent latency tax
// on the busiest loop in the terminal. Requiring a key nobody can guess removes
// the brute-force concern instead of pricing it, which leaves HKDF-SHA256 —
// fast — as a perfectly sound way to derive the AES key.

// Printed in every failure message so a stuck deploy carries its own fix.
export const CREDENTIALS_KEY_COMMAND =
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`;

// The dev-only SESSION_SECRET fallback in config.ts. It is a literal in a public
// repository, so it is refused as credential key material outright — see below.
export const DEV_SESSION_SECRET = 'dev-only-insecure-session-secret-change-me';

const MIN_KEY_BYTES = 32;

// A generated 32-byte key has ~30 distinct byte values; the chance of fewer than
// 16 is not a number worth writing down. So this only ever catches the degenerate
// inputs — "aaaa…", "0000…", a repeated word — and never a real key.
const MIN_DISTINCT_BYTES = 16;

export type KeyMaterial =
  | { ok: true; bytes: Buffer; encoding: 'base64' | 'hex' }
  | { ok: false; reason: string };

function distinctBytes(buf: Buffer): number {
  const seen = new Set<number>();
  for (const b of buf.subarray(0, 64)) seen.add(b);
  return seen.size;
}

// Bytes that are entirely printable ASCII were typed, not generated: the odds of
// 32 random bytes all landing in the printable range are about 1 in 10^14. This
// is what actually catches a passphrase — a passphrase base64-decodes to
// convincingly random-looking bytes, so counting distinct values would pass it.
function looksTyped(buf: Buffer): boolean {
  for (const b of buf) if (b < 0x20 || b > 0x7e) return false;
  return true;
}

// Decode CREDENTIALS_KEY, insisting it is a proper base64 or hex encoding of at
// least 32 bytes. The charset and round-trip checks are what stop a passphrase
// from being quietly reinterpreted as bytes — Buffer's base64 decoder silently
// ignores characters it does not recognise, so without them "my secret key!!"
// decodes to something and the check passes on nothing.
export function parseCredentialsKey(raw: string): KeyMaterial {
  const value = raw.trim();
  if (!value) return { ok: false, reason: 'CREDENTIALS_KEY is empty' };

  let bytes: Buffer;
  let encoding: 'base64' | 'hex';
  if (/^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0) {
    bytes = Buffer.from(value, 'hex');
    encoding = 'hex';
  } else if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
    bytes = Buffer.from(value, 'base64');
    encoding = 'base64';
    // Re-encoding has to reproduce the input exactly. A value that decodes to
    // something but does not encode back is not base64, it is a passphrase that
    // happens to be spelled with base64 characters.
    const back = bytes.toString(value.includes('-') || value.includes('_') ? 'base64url' : 'base64');
    if (back.replace(/=+$/, '') !== value.replace(/=+$/, '')) {
      return { ok: false, reason: 'CREDENTIALS_KEY is not valid base64 or hex' };
    }
  } else {
    return { ok: false, reason: 'CREDENTIALS_KEY is not valid base64 or hex' };
  }

  if (bytes.length < MIN_KEY_BYTES) {
    return {
      ok: false,
      reason: `CREDENTIALS_KEY decodes to ${bytes.length} bytes; at least ${MIN_KEY_BYTES} are required`,
    };
  }
  if (looksTyped(bytes)) {
    return {
      ok: false,
      reason: 'CREDENTIALS_KEY looks like a typed passphrase rather than generated random bytes',
    };
  }
  if (distinctBytes(bytes) < MIN_DISTINCT_BYTES) {
    return { ok: false, reason: 'CREDENTIALS_KEY has too little variation to be randomly generated' };
  }
  return { ok: true, bytes, encoding };
}

export type CredentialsResolution =
  | { ok: true; ikm: Buffer; source: 'credentials-key' | 'dev-session-secret'; warning?: string }
  | { ok: false; message: string };

// The single rule for what may encrypt a broker credential, used twice: once by
// `config.ts` at boot so a misconfigured production deploy dies immediately with
// a message naming its fix, and once (memoized) by `secretbox.ts` to derive the
// AES key. Pure, so it can be exercised directly by `verify:secretbox`.
export function resolveCredentialsMaterial(opts: {
  credentialsKey?: string;
  sessionSecret: string;
  isProd: boolean;
}): CredentialsResolution {
  const raw = opts.credentialsKey?.trim();

  if (opts.isProd) {
    if (!raw) {
      return {
        ok: false,
        message:
          'CREDENTIALS_KEY is not set. It encrypts every stored broker credential and is required in ' +
          `production. Generate one with:\n  ${CREDENTIALS_KEY_COMMAND}\nthen set it as a service variable and redeploy.`,
      };
    }
    // One secret must not protect two unrelated things. SESSION_SECRET signs
    // cookies and is handled by different code on a different schedule; sharing
    // it means a leak of either is a leak of both.
    if (raw === opts.sessionSecret.trim()) {
      return {
        ok: false,
        message:
          'CREDENTIALS_KEY must not be the same value as SESSION_SECRET — one secret cannot protect both ' +
          `sessions and broker credentials. Generate a separate key with:\n  ${CREDENTIALS_KEY_COMMAND}`,
      };
    }
    const parsed = parseCredentialsKey(raw);
    if (!parsed.ok) {
      return {
        ok: false,
        message: `${parsed.reason}. Generate a valid key with:\n  ${CREDENTIALS_KEY_COMMAND}`,
      };
    }
    return { ok: true, ikm: parsed.bytes, source: 'credentials-key' };
  }

  // ---- development ----
  if (raw) {
    const parsed = parseCredentialsKey(raw);
    if (!parsed.ok) {
      return {
        ok: false,
        message: `${parsed.reason}. Generate a valid key with:\n  ${CREDENTIALS_KEY_COMMAND}`,
      };
    }
    return { ok: true, ikm: parsed.bytes, source: 'credentials-key' };
  }

  // The SESSION_SECRET fallback survives in development so a local checkout runs
  // with no .env at all — but never onto the hardcoded dev secret, which is a
  // literal in this repository and would make every stored credential readable
  // by anyone who can read the source.
  if (opts.sessionSecret.trim() === DEV_SESSION_SECRET) {
    return {
      ok: false,
      message:
        'Refusing to encrypt broker credentials with the built-in development SESSION_SECRET — it is a ' +
        `literal in this repository. Set CREDENTIALS_KEY (or a real SESSION_SECRET):\n  ${CREDENTIALS_KEY_COMMAND}`,
    };
  }
  return {
    ok: true,
    ikm: Buffer.from(opts.sessionSecret, 'utf8'),
    source: 'dev-session-secret',
    warning:
      'CREDENTIALS_KEY is not set — broker credentials are being encrypted with a key derived from ' +
      'SESSION_SECRET. That is a development-only fallback and production refuses to start without a ' +
      `real key. Generate one with:\n  ${CREDENTIALS_KEY_COMMAND}`,
  };
}
