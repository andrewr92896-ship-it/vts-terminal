import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userMemberships, MEMBERSHIP_TIERS, type UserRow } from '../db/schema.js';
import { isAdmin, isFounder, parseRoles, type RoleKey } from '../auth/rbac.js';
import { isDemoUser } from '../demo/identity.js';
import {
  FREE_MEMBERSHIP,
  tierAllows,
  viewOf,
  type Membership,
  type MembershipTier,
  type MembershipView,
  type PremiumFeature,
} from './tiers.js';

// Memberships — the paid tiers, and the single place that answers "what is this
// account entitled to".
//
// The terminal is invite-only today and is being opened to the public as a paid
// product. This module is the seam that makes that possible without rewriting
// every guard later: a feature asks `hasEntitlement(user, 'ai')`, never "is this
// user premium", so moving a feature between tiers is one line in FEATURE_TIER.
//
// Two axes that are easily confused and must not be:
//   • Feature Access (features/service.ts) is what the user has ASKED to see.
//   • A membership is what they are ALLOWED to see.
// A user can hold Max with Advanced Trading switched off; turning it on is their
// choice, not a purchase.

export * from './tiers.js';

// Whether a stored grant is still in force. A lapsed row is left in place rather
// than deleted — it is the record of what was granted and by whom — so every
// read checks the date rather than trusting that the row exists.
function stillValid(expiresAt: Date | null, now: number): boolean {
  return expiresAt == null || expiresAt.getTime() > now;
}

function tierOf(raw: string): MembershipTier {
  return (MEMBERSHIP_TIERS as readonly string[]).includes(raw) ? (raw as MembershipTier) : 'free';
}

// The account's effective membership.
//
// Roles win over rows: an admin, software developer or founder is always Max, by
// the owner's decision, and never needs a grant. That is checked FIRST, so
// promoting somebody to admin cannot leave them stuck on a lapsed Free row — and
// demoting them falls back to whatever they were actually granted, rather than
// to nothing.
export async function getMembership(
  user: Pick<UserRow, 'id' | 'username' | 'roles'>,
): Promise<Membership> {
  const roles = parseRoles(user);
  if (isAdmin(roles)) return { ...FREE_MEMBERSHIP, tier: 'max', source: 'role' };
  // The public demo is a showcase: it sees everything so the tour is complete,
  // and demoGuard refuses every write regardless of tier.
  if (isDemoUser(user)) return { ...FREE_MEMBERSHIP, tier: 'max', source: 'demo' };

  const row = (
    await db.select().from(userMemberships).where(eq(userMemberships.userId, user.id)).limit(1)
  )[0];
  if (!row) return FREE_MEMBERSHIP;
  if (!stillValid(row.expiresAt, Date.now())) {
    // Lapsed: Free again, but still carrying what it was and who gave it, so the
    // screen can say "your Premium ended on the 4th" instead of going blank.
    return {
      ...FREE_MEMBERSHIP,
      expiresAt: row.expiresAt ? row.expiresAt.getTime() : null,
      note: row.note,
      grantedByName: row.grantedByName,
      grantedAt: row.grantedAt.getTime(),
    };
  }
  return {
    tier: tierOf(row.tier),
    expiresAt: row.expiresAt ? row.expiresAt.getTime() : null,
    source: (row.source as Membership['source']) ?? 'manual',
    note: row.note,
    grantedByName: row.grantedByName,
    grantedAt: row.grantedAt.getTime(),
  };
}

export async function hasEntitlement(
  user: Pick<UserRow, 'id' | 'username' | 'roles'>,
  feature: PremiumFeature,
): Promise<boolean> {
  const { tier } = await getMembership(user);
  return tierAllows(tier, feature);
}

// The whole entitlement picture, for the client. Sent on the user payload so the
// UI can draw locks without a round trip per feature — the server is still the
// enforcer on every endpoint.
export async function getMembershipView(
  user: Pick<UserRow, 'id' | 'username' | 'roles'>,
): Promise<MembershipView> {
  return viewOf(await getMembership(user));
}

// ---- Granting ----

export class MembershipError extends Error {}

// The longest grant a plain admin may write. Founder-level users are uncapped
// and may grant indefinitely.
export const ADMIN_MAX_GRANT_DAYS = 183; // ~six months

export interface GrantInput {
  tier: MembershipTier;
  /** Null = indefinite. Founder-level only. */
  expiresAt: number | null;
  /**
   * Why. Required, and not a formality: the Administrator Log exists so that
   * every membership handed out has a stated reason attached to a named person.
   */
  note: string;
}

// Who may grant what, and for how long. This is the rule the Admin Guidelines
// describe, enforced rather than trusted:
//   • founder / software_developer — any tier, any length, including forever.
//   • admin                        — any tier, but never more than six months.
//   • anybody else                 — nothing.
export function assertCanGrantMembership(
  actorRoles: RoleKey[],
  input: { expiresAt: number | null },
  now = Date.now(),
): void {
  if (isFounder(actorRoles)) return;
  if (!isAdmin(actorRoles)) {
    throw new MembershipError('You are not allowed to grant memberships');
  }
  if (input.expiresAt == null) {
    throw new MembershipError(
      'Only a founder or software developer can grant a membership that never expires',
    );
  }
  if (input.expiresAt <= now) {
    throw new MembershipError('Pick an end date in the future');
  }
  if (input.expiresAt > now + ADMIN_MAX_GRANT_DAYS * 24 * 60 * 60 * 1000) {
    throw new MembershipError('An admin can grant a membership for up to six months at a time');
  }
}

// Write the grant.
//
// The Administrator Log entry is deliberately NOT written here — admin/service.ts
// does both together, so one place owns the fact that a grant and its log entry
// are inseparable.
export async function setMembership(
  userId: string,
  input: GrantInput,
  actor: { id: string; name: string },
): Promise<Membership> {
  const note = input.note.trim();
  if (!note) throw new MembershipError('Say why this membership is being granted');
  if (!(MEMBERSHIP_TIERS as readonly string[]).includes(input.tier)) {
    throw new MembershipError('Unknown membership tier');
  }
  const now = new Date();
  const expiresAt = input.expiresAt == null ? null : new Date(input.expiresAt);

  await db
    .insert(userMemberships)
    .values({
      id: crypto.randomUUID(),
      userId,
      tier: input.tier,
      expiresAt,
      source: 'manual',
      note,
      grantedBy: actor.id,
      grantedByName: actor.name,
      grantedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userMemberships.userId,
      set: {
        tier: input.tier,
        expiresAt,
        source: 'manual',
        note,
        grantedBy: actor.id,
        grantedByName: actor.name,
        grantedAt: now,
        updatedAt: now,
      },
    });

  return {
    tier: input.tier,
    expiresAt: expiresAt ? expiresAt.getTime() : null,
    source: 'manual',
    note,
    grantedByName: actor.name,
    grantedAt: now.getTime(),
  };
}

// Stored memberships keyed by user id, for the admin Users list. Roles still
// win, so the caller merges this with its own role check rather than treating a
// missing row as Free.
export async function membershipsByUserId(): Promise<Map<string, Membership>> {
  const rows = await db.select().from(userMemberships);
  const now = Date.now();
  const out = new Map<string, Membership>();
  for (const row of rows) {
    const valid = stillValid(row.expiresAt, now);
    out.set(row.userId, {
      tier: valid ? tierOf(row.tier) : 'free',
      expiresAt: row.expiresAt ? row.expiresAt.getTime() : null,
      source: (row.source as Membership['source']) ?? 'manual',
      note: row.note,
      grantedByName: row.grantedByName,
      grantedAt: row.grantedAt.getTime(),
    });
  }
  return out;
}
