import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { badgeTypes } from '../db/schema.js';

// Recognition badges shown as small icons next to a member's name. An admin
// manages the registry (create/edit/delete) and assigns badges per user
// (users.badges). Two badges are seeded and marked builtin so they always
// exist: a star for early-release members, and a shield for admins (auto-granted
// to anyone holding the admin role).

export class BadgeError extends Error {}

export interface BadgeTypeView {
  id: string;
  key: string;
  label: string;
  icon: string;
  color: string;
  description: string | null;
  autoRole: string | null;
  builtin: boolean;
  position: number;
}

function toView(r: typeof badgeTypes.$inferSelect): BadgeTypeView {
  return {
    id: r.id,
    key: r.key,
    label: r.label,
    icon: r.icon,
    color: r.color,
    description: r.description ?? null,
    autoRole: r.autoRole ?? null,
    builtin: r.builtin,
    position: r.position,
  };
}

export async function listBadgeTypes(): Promise<BadgeTypeView[]> {
  const rows = await db.select().from(badgeTypes);
  rows.sort((a, b) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime());
  return rows.map(toView);
}

// A stable, storage-safe key from a label: lowercase, alphanumerics + dashes.
function normalizeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export interface BadgeInput {
  key?: string;
  label: string;
  icon: string;
  color?: string;
  description?: string | null;
}

export async function createBadgeType(input: BadgeInput): Promise<BadgeTypeView> {
  const label = input.label.trim();
  if (!label) throw new BadgeError('A badge name is required');
  const icon = input.icon.trim();
  if (!icon) throw new BadgeError('Pick an icon for the badge');
  const key = normalizeKey(input.key || label);
  if (!key) throw new BadgeError('That badge name can’t be used — try letters and numbers');

  const dup = (await db.select({ id: badgeTypes.id }).from(badgeTypes).where(eq(badgeTypes.key, key)).limit(1))[0];
  if (dup) throw new BadgeError('A badge with that name already exists');

  const maxPos = (await db.select().from(badgeTypes)).reduce((m, r) => Math.max(m, r.position), 0);
  const now = new Date();
  const row = {
    id: crypto.randomUUID(),
    key,
    label: label.slice(0, 40),
    icon: icon.slice(0, 40),
    color: (input.color || '#EBCB74').slice(0, 16),
    description: input.description?.trim() ? input.description.trim().slice(0, 200) : null,
    autoRole: null,
    builtin: false,
    position: maxPos + 1,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(badgeTypes).values(row);
  return toView(row);
}

export interface BadgeUpdate {
  label?: string;
  icon?: string;
  color?: string;
  description?: string | null;
}

export async function updateBadgeType(id: string, input: BadgeUpdate): Promise<BadgeTypeView> {
  const existing = (await db.select().from(badgeTypes).where(eq(badgeTypes.id, id)).limit(1))[0];
  if (!existing) throw new BadgeError('Badge not found');
  const patch: Partial<typeof badgeTypes.$inferInsert> = { updatedAt: new Date() };
  if (input.label != null) {
    const l = input.label.trim();
    if (!l) throw new BadgeError('A badge name is required');
    patch.label = l.slice(0, 40);
  }
  if (input.icon != null) {
    const ic = input.icon.trim();
    if (!ic) throw new BadgeError('Pick an icon for the badge');
    patch.icon = ic.slice(0, 40);
  }
  if (input.color != null) patch.color = (input.color || '#EBCB74').slice(0, 16);
  if (input.description !== undefined) {
    patch.description = input.description && input.description.trim() ? input.description.trim().slice(0, 200) : null;
  }
  await db.update(badgeTypes).set(patch).where(eq(badgeTypes.id, id));
  return (await db.select().from(badgeTypes).where(eq(badgeTypes.id, id)).limit(1)).map(toView)[0];
}

export async function deleteBadgeType(id: string): Promise<void> {
  const existing = (await db.select().from(badgeTypes).where(eq(badgeTypes.id, id)).limit(1))[0];
  if (!existing) throw new BadgeError('Badge not found');
  if (existing.builtin) throw new BadgeError('Built-in badges can’t be deleted');
  await db.delete(badgeTypes).where(eq(badgeTypes.id, id));
}

// Whether `key` refers to an existing badge (used to validate assignments).
export async function badgeKeyExists(key: string): Promise<boolean> {
  const rows = await db.select({ id: badgeTypes.id }).from(badgeTypes).where(eq(badgeTypes.key, key)).limit(1);
  return rows.length > 0;
}

// The membership badges. Earned by holding a tier, never assigned by hand — so
// they are kept out of the admin picker below. A badge that says somebody is a
// Premium member has to be true, or it is decoration rather than information.
export const MEMBERSHIP_BADGE_KEYS: Record<string, string> = {
  premium: 'premium',
  max: 'max',
};

// The badge key a tier shows, or null for Free (which has no badge — a badge
// meaning "has not paid" would be a mark, not recognition).
export function membershipBadgeKey(tier: string): string | null {
  return MEMBERSHIP_BADGE_KEYS[tier] ?? null;
}

// The set of assignable badge keys — the ones an admin can toggle on a user.
// Excludes both auto badges (granted by role, e.g. the Admin shield) and the
// membership badges (granted by tier).
export async function assignableBadgeKeys(): Promise<Set<string>> {
  const rows = await db.select().from(badgeTypes);
  return new Set(
    rows.filter((r) => !r.autoRole && !MEMBERSHIP_BADGE_KEYS[r.key]).map((r) => r.key),
  );
}

// Seed the two built-in badges once. Idempotent: only inserts the ones missing,
// so a later edit to a builtin badge's label/icon by an admin is preserved.
export async function seedBadges(): Promise<void> {
  const now = new Date();
  const builtins = [
    // Auto-granted to every founder-role holder, shown site-wide next to their
    // name. Listed first (position 0) so it leads the badge row.
    {
      key: 'founder',
      label: 'Founder',
      icon: 'crown',
      color: '#F5A524',
      description: 'Terminal founder.',
      autoRole: 'founder' as string | null,
      position: 0,
    },
    {
      key: 'early',
      label: 'Early Release',
      // A rocket, not a star: the star now means Premium, and two badges wearing
      // the same glyph in the same row is not a badge system.
      icon: 'rocket',
      color: '#EBCB74',
      description: 'Early-release member — here from the start.',
      autoRole: null as string | null,
      position: 1,
    },
    // The two membership badges. Assigned by tier rather than by hand — see
    // membershipBadgeKeys() below — so they cannot be handed out as decoration
    // to somebody who has not got the tier.
    // These two colours are the terminal's tier language and are mirrored in
    // TIER_COLORS (web auth/access.ts), which paints the sidebar rows. Change one
    // and change the other, or a Premium section stops matching the Premium star.
    {
      key: 'premium',
      label: 'Premium',
      icon: 'star',
      color: '#EBCB74', // gold/yellow
      description: 'Premium member.',
      autoRole: null as string | null,
      position: 5,
    },
    {
      key: 'max',
      label: 'Max',
      // `gem` is the brilliant-cut diamond. NOT `diamond`, which in this icon
      // set is a rounded tilted square and reads as a rhombus rather than a
      // jewel — migration 0091 corrects the rows seeded before this.
      icon: 'gem',
      // Diamond blue — icier than the Markets accent (#5AC8FA) on purpose, so a
      // Max marker is never read as a Markets one.
      color: '#B9F2FF',
      description: 'Max member — the full terminal.',
      autoRole: null as string | null,
      position: 6,
    },
    // Auto-granted to every software_developer-role holder (founder-equivalent
    // access), shown site-wide next to their name.
    {
      key: 'software-developer',
      label: 'Software Developer',
      icon: 'code',
      color: '#6C9EFF',
      description: 'Software developer — founder-level access.',
      autoRole: 'software_developer' as string | null,
      position: 1,
    },
    {
      key: 'admin',
      label: 'Admin',
      icon: 'shield',
      color: '#E0708F',
      description: 'Terminal administrator.',
      autoRole: 'admin' as string | null,
      position: 2,
    },
  ];
  for (const b of builtins) {
    const exists = (await db.select({ id: badgeTypes.id }).from(badgeTypes).where(eq(badgeTypes.key, b.key)).limit(1))[0];
    if (exists) continue;
    await db.insert(badgeTypes).values({
      id: crypto.randomUUID(),
      key: b.key,
      label: b.label,
      icon: b.icon,
      color: b.color,
      description: b.description,
      autoRole: b.autoRole,
      builtin: true,
      position: b.position,
      createdAt: now,
      updatedAt: now,
    });
  }
}
