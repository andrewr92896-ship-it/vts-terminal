import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  users,
  sessions,
  todoSections,
  todoItems,
  kiaSettings,
  kiaMonthSettings,
  kiaDeals,
  wealthClients,
  tradingTrades,
} from '../db/schema.js';
import { hashPassword } from '../auth/passwords.js';
import { destroyUserSessions } from '../auth/sessions.js';
import { isRoleKey, parseRoles, type RoleKey } from '../auth/rbac.js';

// A user row as shown in the admin user-management screen. Never includes the
// password hash. `createdUsername` is the username the account was created
// with; it never changes even if the user later renames themselves, so the
// admin can always recognize the account.
export interface AdminUserView {
  id: string;
  username: string;
  createdUsername: string;
  displayName: string;
  email: string | null;
  roles: RoleKey[];
  active: boolean;
  viewBrokerage: boolean;
  mustChangePassword: boolean;
  createdAt: number;
}

function toView(u: typeof users.$inferSelect): AdminUserView {
  return {
    id: u.id,
    username: u.username,
    createdUsername: u.createdUsername ?? u.username,
    displayName: u.displayName,
    email: u.email,
    roles: parseRoles(u),
    active: u.active,
    viewBrokerage: u.viewBrokerage,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt.getTime(),
  };
}

// Normalize an incoming roles array: keep only valid keys, de-duplicate.
function cleanRoles(roles: string[]): RoleKey[] {
  return [...new Set(roles.filter(isRoleKey))];
}

export async function listUsers(): Promise<AdminUserView[]> {
  const rows = await db.select().from(users);
  rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return rows.map(toView);
}

export interface CreateUserInput {
  username: string;
  displayName: string;
  password: string;
  roles: string[];
  viewBrokerage?: boolean;
}

export class AdminError extends Error {}

export async function createUser(input: CreateUserInput): Promise<AdminUserView> {
  const username = input.username.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (!username) throw new AdminError('Username is required');
  if (!displayName) throw new AdminError('Display name is required');
  if (input.password.length < 8) {
    throw new AdminError('Temporary password must be at least 8 characters');
  }
  const roles = cleanRoles(input.roles);

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (existing[0]) throw new AdminError('That username is already taken');

  const now = new Date();
  const row = {
    id: crypto.randomUUID(),
    username,
    createdUsername: username, // preserved even if the user renames later
    displayName,
    email: null,
    passwordHash: await hashPassword(input.password),
    role: 'Viewer' as const, // legacy column, unused; kept populated for type/back-compat
    roles: JSON.stringify(roles),
    viewBrokerage: input.viewBrokerage ?? false,
    active: true,
    // Admin sets a temporary password; force a change on first login.
    mustChangePassword: true,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(users).values(row);
  return toView(row);
}

export interface UpdateUserInput {
  displayName?: string;
  roles?: string[];
  active?: boolean;
  viewBrokerage?: boolean;
  // When provided, sets a new temporary password and forces a change at next
  // login, revoking the user's existing sessions.
  password?: string;
}

export async function updateUser(
  actingUserId: string,
  targetId: string,
  input: UpdateUserInput,
): Promise<AdminUserView> {
  const target = (
    await db.select().from(users).where(eq(users.id, targetId)).limit(1)
  )[0];
  if (!target) throw new AdminError('User not found');

  // Guard against an admin locking themselves out of admin access.
  const isSelf = actingUserId === targetId;
  if (isSelf && input.active === false) {
    throw new AdminError('You cannot deactivate your own account');
  }
  if (isSelf && input.roles && !cleanRoles(input.roles).includes('admin')) {
    throw new AdminError('You cannot remove the Admin role from your own account');
  }

  const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };

  if (input.displayName != null) {
    const dn = input.displayName.trim();
    if (!dn) throw new AdminError('Display name cannot be empty');
    patch.displayName = dn;
  }
  if (input.roles != null) patch.roles = JSON.stringify(cleanRoles(input.roles));
  if (input.active != null) patch.active = input.active;
  if (input.viewBrokerage != null) patch.viewBrokerage = input.viewBrokerage;

  let revoke = false;
  if (input.password != null) {
    if (input.password.length < 8) {
      throw new AdminError('Temporary password must be at least 8 characters');
    }
    patch.passwordHash = await hashPassword(input.password);
    patch.mustChangePassword = true;
    revoke = true;
  }
  // Deactivating also ends the user's active sessions.
  if (input.active === false) revoke = true;

  await db.update(users).set(patch).where(eq(users.id, targetId));
  if (revoke) await destroyUserSessions(targetId);

  const updated = (
    await db.select().from(users).where(eq(users.id, targetId)).limit(1)
  )[0];
  return toView(updated);
}

// Permanently delete a user and all of their data. Unlike deactivation (which
// keeps the row and just flips `active`), this is irreversible.
export async function deleteUser(actingUserId: string, targetId: string): Promise<void> {
  // An admin can't delete their own account (prevents self-lockout).
  if (actingUserId === targetId) {
    throw new AdminError('You cannot delete your own account');
  }

  const target = (
    await db.select().from(users).where(eq(users.id, targetId)).limit(1)
  )[0];
  if (!target) throw new AdminError('User not found');

  // Never delete the last admin, so the portal always has an owner who can
  // manage it. (With self-deletion blocked above this is also a backstop.)
  if (parseRoles(target).includes('admin')) {
    const all = await db.select({ roles: users.roles }).from(users);
    const adminCount = all.filter((u) => parseRoles(u).includes('admin')).length;
    if (adminCount <= 1) {
      throw new AdminError('Cannot delete the only remaining admin account');
    }
  }

  // Remove the account and every per-user row in one transaction. Child rows
  // are deleted explicitly rather than relying on SQLite's ON DELETE CASCADE
  // (which only fires when the connection's foreign_keys pragma is on), so no
  // data is ever orphaned. NOTE: add any new per-user table here.
  await db.transaction(async (tx) => {
    await tx.delete(todoItems).where(eq(todoItems.userId, targetId));
    await tx.delete(todoSections).where(eq(todoSections.userId, targetId));
    await tx.delete(kiaDeals).where(eq(kiaDeals.userId, targetId));
    await tx.delete(kiaMonthSettings).where(eq(kiaMonthSettings.userId, targetId));
    await tx.delete(kiaSettings).where(eq(kiaSettings.userId, targetId));
    await tx.delete(wealthClients).where(eq(wealthClients.userId, targetId));
    await tx.delete(tradingTrades).where(eq(tradingTrades.userId, targetId));
    await tx.delete(sessions).where(eq(sessions.userId, targetId));
    await tx.delete(users).where(eq(users.id, targetId));
  });
}
