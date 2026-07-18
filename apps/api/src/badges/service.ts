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

// The set of assignable (non-auto) badge keys — the ones an admin can toggle on
// a user. Auto badges (e.g. admin) are granted by role, not assigned.
export async function assignableBadgeKeys(): Promise<Set<string>> {
  const rows = await db.select().from(badgeTypes);
  return new Set(rows.filter((r) => !r.autoRole).map((r) => r.key));
}

// Seed the two built-in badges once. Idempotent: only inserts the ones missing,
// so a later edit to a builtin badge's label/icon by an admin is preserved.
export async function seedBadges(): Promise<void> {
  const now = new Date();
  const builtins = [
    {
      key: 'early',
      label: 'Early Release',
      icon: 'star',
      color: '#EBCB74',
      description: 'Early-release member — here from the start.',
      autoRole: null as string | null,
      position: 1,
    },
    {
      key: 'admin',
      label: 'Admin',
      icon: 'shield',
      color: '#E0708F',
      description: 'Portal administrator.',
      autoRole: 'admin' as string | null,
      position: 2,
    },
    // Position designations — colour the holder's open positions across the desk
    // (Live Wall, Trade Log / History, and trade notifications). See
    // badges/designations.ts.
    {
      key: 'chief-strategist',
      label: 'Chief Strategist',
      icon: 'crown',
      color: '#35c47b', // green
      description: 'Chief Strategist — their open positions show in green across the desk.',
      autoRole: null as string | null,
      position: 3,
    },
    {
      key: 'chief-analyst',
      label: 'Chief Analyst',
      icon: 'candlestick-chart',
      color: '#ef5468', // red
      description: 'Chief Analyst — their open positions show in red across the desk.',
      autoRole: null as string | null,
      position: 4,
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
