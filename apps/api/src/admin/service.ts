import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, ROLES, type Role } from '../db/schema.js';
import { hashPassword } from '../auth/passwords.js';
import { destroyUserSessions } from '../auth/sessions.js';

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
  role: Role;
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
    role: u.role,
    active: u.active,
    viewBrokerage: u.viewBrokerage,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt.getTime(),
  };
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
  role: Role;
  viewBrokerage?: boolean;
}

export class AdminError extends Error {}

export async function createUser(input: CreateUserInput): Promise<AdminUserView> {
  const username = input.username.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (!username) throw new AdminError('Username is required');
  if (!displayName) throw new AdminError('Display name is required');
  if (!ROLES.includes(input.role)) throw new AdminError('Invalid role');
  if (input.password.length < 8) {
    throw new AdminError('Temporary password must be at least 8 characters');
  }

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
    role: input.role,
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
  role?: Role;
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
  if (isSelf && input.role && input.role !== 'Admin') {
    throw new AdminError('You cannot change your own role away from Admin');
  }

  const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };

  if (input.displayName != null) {
    const dn = input.displayName.trim();
    if (!dn) throw new AdminError('Display name cannot be empty');
    patch.displayName = dn;
  }
  if (input.role != null) {
    if (!ROLES.includes(input.role)) throw new AdminError('Invalid role');
    patch.role = input.role;
  }
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
