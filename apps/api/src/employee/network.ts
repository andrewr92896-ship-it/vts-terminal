import { config } from '../config.js';

// Optional network fence for the employee portal (EMPLOYEE_IP_ALLOWLIST).
//
// When the owner sets a list of addresses or CIDR ranges — an office network, a
// VPN egress — every /employee page load and /api/employee call from outside it
// is refused before authentication is even attempted, so a stolen password is
// worthless off-network. Unset (the default) means no network restriction and
// this module is a no-op.
//
// The check fails CLOSED: if an allowlist is configured and the client address
// cannot be parsed, access is refused rather than waved through.

interface Rule {
  // The network address as a BigInt, its prefix length, and which family it is.
  value: bigint;
  bits: number;
  family: 4 | 6;
}

function ipToBigInt(raw: string): { value: bigint; family: 4 | 6 } | null {
  let addr = raw.trim();
  if (!addr) return null;
  // Strip a bracketed form and any zone index ("fe80::1%eth0").
  if (addr.startsWith('[') && addr.endsWith(']')) addr = addr.slice(1, -1);
  const zone = addr.indexOf('%');
  if (zone >= 0) addr = addr.slice(0, zone);

  // IPv4-mapped IPv6 ("::ffff:203.0.113.4") is treated as the IPv4 address it
  // represents — that is what a proxy in front of us hands over.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(addr);
  if (mapped) addr = mapped[1];

  if (addr.includes('.') && !addr.includes(':')) {
    const parts = addr.split('.');
    if (parts.length !== 4) return null;
    let value = 0n;
    for (const part of parts) {
      if (!/^\d{1,3}$/.test(part)) return null;
      const n = Number(part);
      if (n > 255) return null;
      value = (value << 8n) | BigInt(n);
    }
    return { value, family: 4 };
  }

  if (!addr.includes(':')) return null;
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : [];
  const groupCount = head.length + tail.length;
  if (groupCount > 8) return null;
  if (halves.length === 1 && groupCount !== 8) return null;
  const middle = new Array(8 - groupCount).fill('0');
  const groups = halves.length === 2 ? [...head, ...middle, ...tail] : head;

  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    value = (value << 16n) | BigInt(parseInt(group, 16));
  }
  return { value, family: 6 };
}

function parseRule(entry: string): Rule | null {
  const [addrPart, bitsPart] = entry.trim().split('/');
  const parsed = ipToBigInt(addrPart);
  if (!parsed) return null;
  const maxBits = parsed.family === 4 ? 32 : 128;
  let bits = maxBits;
  if (bitsPart != null) {
    if (!/^\d{1,3}$/.test(bitsPart)) return null;
    bits = Number(bitsPart);
    if (bits > maxBits) return null;
  }
  return { value: parsed.value, bits, family: parsed.family };
}

// Parsed once at module load — the allowlist is configuration, not data.
const RULES: Rule[] = (config.EMPLOYEE_IP_ALLOWLIST ?? '')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean)
  .map((entry) => {
    const rule = parseRule(entry);
    if (!rule) console.error(`EMPLOYEE_IP_ALLOWLIST: ignoring unparseable entry "${entry}"`);
    return rule;
  })
  .filter((r): r is Rule => r !== null);

export function ipAllowlistActive(): boolean {
  return RULES.length > 0;
}

export function ipAllowed(ip: string | undefined | null): boolean {
  if (RULES.length === 0) return true; // no fence configured
  if (!ip) return false; // fail closed
  const parsed = ipToBigInt(ip);
  if (!parsed) return false; // fail closed
  const maxBits = parsed.family === 4 ? 32 : 128;
  for (const rule of RULES) {
    if (rule.family !== parsed.family) continue;
    if (rule.bits === 0) return true;
    const shift = BigInt(maxBits - rule.bits);
    if (parsed.value >> shift === rule.value >> shift) return true;
  }
  return false;
}
