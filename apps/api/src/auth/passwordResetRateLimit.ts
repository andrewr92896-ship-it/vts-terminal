import crypto from 'node:crypto';

// One-process protection suitable for the current single Railway replica. Keys
// are hashed before they enter memory, and each map is capped so random-address
// traffic cannot grow the process forever. A multi-replica deployment must move
// this policy to a shared store or edge limiter.

interface Bucket {
  acceptedAt: number[];
}

interface Rule {
  cooldownMs: number;
  windowMs: number;
  maxInWindow: number;
}

export interface PasswordResetLimitOptions {
  email?: Partial<Rule>;
  ip?: Partial<Rule>;
  maxEntries?: number;
}

const EMAIL_RULE: Rule = {
  cooldownMs: 5 * 60_000,
  windowMs: 60 * 60_000,
  maxInWindow: 3,
};
const IP_RULE: Rule = {
  cooldownMs: 10_000,
  windowMs: 15 * 60_000,
  maxInWindow: 10,
};

function key(kind: 'email' | 'ip', value: string): string {
  return crypto.createHash('sha256').update(`${kind}\0${value}`).digest('hex');
}

export class PasswordResetRateLimiter {
  private readonly emails = new Map<string, Bucket>();
  private readonly ips = new Map<string, Bucket>();
  private readonly emailRule: Rule;
  private readonly ipRule: Rule;
  private readonly maxEntries: number;
  private takes = 0;

  constructor(options: PasswordResetLimitOptions = {}) {
    this.emailRule = { ...EMAIL_RULE, ...options.email };
    this.ipRule = { ...IP_RULE, ...options.ip };
    this.maxEntries = Math.max(100, Math.floor(options.maxEntries ?? 5_000));
  }

  take(ip: string, normalizedEmail: string, now = Date.now()): boolean {
    // Periodically discard fully expired buckets even when the cap has not
    // been reached. The hard cap remains the defense against a burst of unique
    // inputs between cleanup passes.
    this.takes += 1;
    if (this.takes % 64 === 0) this.cleanup(now);

    // Consume independently. A request blocked by one dimension still spends
    // the other when it is allowed, so cycling addresses cannot evade the IP
    // budget and cycling IPs cannot evade the mailbox budget. A denied attempt
    // does not move its cooldown forward forever.
    const ipAllowed = this.consume(this.ips, key('ip', ip || 'unknown'), this.ipRule, now);
    const emailAllowed = this.consume(
      this.emails,
      key('email', normalizedEmail || 'invalid'),
      this.emailRule,
      now,
    );
    return ipAllowed && emailAllowed;
  }

  sizes(): { emails: number; ips: number } {
    return { emails: this.emails.size, ips: this.ips.size };
  }

  private consume(map: Map<string, Bucket>, id: string, rule: Rule, now: number): boolean {
    let bucket = map.get(id);
    if (!bucket) {
      bucket = { acceptedAt: [] };
      map.set(id, bucket);
      this.bound(map);
    }
    bucket.acceptedAt = bucket.acceptedAt.filter((at) => now - at < rule.windowMs);
    const last = bucket.acceptedAt.at(-1);
    const allowed =
      bucket.acceptedAt.length < rule.maxInWindow &&
      (last == null || now - last >= rule.cooldownMs);
    if (allowed) bucket.acceptedAt.push(now);
    return allowed;
  }

  private bound(map: Map<string, Bucket>): void {
    while (map.size > this.maxEntries) {
      const oldest = map.keys().next().value as string | undefined;
      if (!oldest) return;
      map.delete(oldest);
    }
  }

  private cleanup(now: number): void {
    this.cleanupMap(this.emails, this.emailRule, now);
    this.cleanupMap(this.ips, this.ipRule, now);
  }

  private cleanupMap(map: Map<string, Bucket>, rule: Rule, now: number): void {
    for (const [id, bucket] of map) {
      const newest = bucket.acceptedAt.at(-1);
      if (newest == null || now - newest >= rule.windowMs) map.delete(id);
    }
  }
}

export const passwordResetRateLimiter = new PasswordResetRateLimiter();
