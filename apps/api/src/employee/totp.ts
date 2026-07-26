import crypto from 'node:crypto';

// RFC 4226 (HOTP) / RFC 6238 (TOTP) — the second factor for the employee portal.
//
// Implemented directly on node:crypto rather than pulled from npm on purpose:
// the whole point of this surface is a small, auditable trust base, and a
// one-time-password verifier is ~60 lines of well-specified arithmetic. No
// dependency means no supply-chain surface on the code that guards the door.

const STEP_SECONDS = 30;
const DIGITS = 6;
// How many steps either side of "now" are accepted, to tolerate clock drift
// between the server and the employee's phone. One step = ±30s.
const DRIFT_STEPS = 1;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// RFC 4648 base32, unpadded — the encoding every authenticator app expects.
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=-]/g, '').toUpperCase();
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// A fresh 160-bit shared secret, base32-encoded for the authenticator app.
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

// The current 30-second time step. Exposed so callers can store the last step a
// code was accepted at and refuse a replay of the same code.
export function currentStep(atMs: number = Date.now()): number {
  return Math.floor(atMs / 1000 / STEP_SECONDS);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', secret).update(buf).digest();
  // Dynamic truncation (RFC 4226 §5.3).
  const offset = mac[mac.length - 1] & 0x0f;
  const bin =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

// Compare two same-length strings without leaking where they diverge.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Verify a submitted code against the secret. Returns the time step the code
// belongs to (so the caller can persist it and reject a replay), or null.
//
// `minStep` — when given, any code from that step or earlier is refused even if
// it is arithmetically valid. Pass the profile's stored last-accepted step to
// make every code strictly single-use.
export function verifyTotp(
  secretBase32: string,
  code: string,
  opts: { minStep?: number | null; atMs?: number } = {},
): number | null {
  const trimmed = code.replace(/\D/g, '');
  if (trimmed.length !== DIGITS) return null;

  let secret: Buffer;
  try {
    secret = base32Decode(secretBase32);
  } catch {
    return null;
  }

  const now = currentStep(opts.atMs ?? Date.now());
  for (let delta = -DRIFT_STEPS; delta <= DRIFT_STEPS; delta++) {
    const step = now + delta;
    if (opts.minStep != null && step <= opts.minStep) continue;
    if (safeEqual(hotp(secret, step), trimmed)) return step;
  }
  return null;
}

// The otpauth:// URI an authenticator app consumes. The label carries the issuer
// and the account so a phone with several codes shows which is which.
export function otpauthUrl(secretBase32: string, account: string, issuer = 'Vitalis Trading Systems'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ---- Recovery codes ----
// Ten single-use codes handed out once at enrollment. Only their hashes are
// stored, so a database copy cannot be turned back into a working code.

const RECOVERY_COUNT = 10;

export function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < RECOVERY_COUNT; i++) {
    // 10 hex chars, grouped for legibility: "a1b2c-3d4e5".
    const raw = crypto.randomBytes(5).toString('hex');
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}

export function hashRecoveryCode(code: string): string {
  return crypto.createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

export function normalizeRecoveryCode(code: string): string {
  return code.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}
