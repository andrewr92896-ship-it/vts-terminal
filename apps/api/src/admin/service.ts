import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  users,
  sessions,
  todoSections,
  todoItems,
  wealthClients,
  wealthPortfolios,
  wealthAllocations,
  wealthPlans,
  wealthCompliance,
  tradingTrades,
  tradingAlerts,
  tradingPositions,
  tradingSessions,
  brokerConnections,
  tradingChallenges,
  financeSettings,
  financeExpenses,
  financeNetWorth,
  tradingNews,
  tradingCalendar,
  aiUsage,
} from '../db/schema.js';
import { hashPassword } from '../auth/passwords.js';
import { destroyUserSessions } from '../auth/sessions.js';
import { isRoleKey, parseRoles, type RoleKey } from '../auth/rbac.js';
import { teamExists } from '../teams/service.js';

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
  teamId: string | null;
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
    teamId: u.teamId ?? null,
    active: u.active,
    viewBrokerage: u.viewBrokerage,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt.getTime(),
  };
}

// Validate an admin-supplied team assignment: null clears the team; a non-null
// id must reference an existing team. Returns the normalized value to store.
async function resolveTeamId(teamId: string | null): Promise<string | null> {
  if (teamId == null) return null;
  if (!(await teamExists(teamId))) throw new AdminError('That team no longer exists');
  return teamId;
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
  email: string;
  password: string;
  roles: string[];
  viewBrokerage?: boolean;
  teamId?: string | null;
}

export class AdminError extends Error {}

// Reject an email already used by another account (case-insensitive). Emails are
// the sign-in identifier, so they must be unique. `exceptId` skips the account
// being edited.
async function assertEmailFree(email: string, exceptId?: string): Promise<void> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(2);
  if (rows.some((r) => r.id !== exceptId)) {
    throw new AdminError('That email is already in use');
  }
}

export async function createUser(input: CreateUserInput): Promise<AdminUserView> {
  const username = input.username.trim().toLowerCase();
  const displayName = input.displayName.trim();
  const email = input.email.trim().toLowerCase();
  if (!username) throw new AdminError('Username is required');
  if (!displayName) throw new AdminError('Display name is required');
  if (!email) throw new AdminError('Email is required');
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
  await assertEmailFree(email);
  const teamId = await resolveTeamId(input.teamId ?? null);

  const now = new Date();
  const row = {
    id: crypto.randomUUID(),
    username,
    createdUsername: username, // preserved even if the user renames later
    displayName,
    email,
    passwordHash: await hashPassword(input.password),
    role: 'Viewer' as const, // legacy column, unused; kept populated for type/back-compat
    roles: JSON.stringify(roles),
    teamId,
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
  email?: string;
  roles?: string[];
  active?: boolean;
  viewBrokerage?: boolean;
  // The trading team to assign. `null` clears the team; a non-null id must
  // reference an existing team. Omitted leaves the current team unchanged.
  teamId?: string | null;
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
  if (input.email != null) {
    const email = input.email.trim().toLowerCase();
    if (!email) throw new AdminError('Email cannot be empty');
    await assertEmailFree(email, targetId);
    patch.email = email;
  }
  if (input.roles != null) patch.roles = JSON.stringify(cleanRoles(input.roles));
  if (input.active != null) patch.active = input.active;
  if (input.viewBrokerage != null) patch.viewBrokerage = input.viewBrokerage;
  if (input.teamId !== undefined) patch.teamId = await resolveTeamId(input.teamId);

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
    await tx.delete(wealthClients).where(eq(wealthClients.userId, targetId));
    await tx.delete(wealthAllocations).where(eq(wealthAllocations.userId, targetId));
    await tx.delete(wealthPortfolios).where(eq(wealthPortfolios.userId, targetId));
    await tx.delete(wealthPlans).where(eq(wealthPlans.userId, targetId));
    await tx.delete(wealthCompliance).where(eq(wealthCompliance.userId, targetId));
    await tx.delete(aiUsage).where(eq(aiUsage.userId, targetId));
    await tx.delete(tradingTrades).where(eq(tradingTrades.userId, targetId));
    await tx.delete(tradingAlerts).where(eq(tradingAlerts.userId, targetId));
    await tx.delete(tradingPositions).where(eq(tradingPositions.userId, targetId));
    await tx.delete(tradingSessions).where(eq(tradingSessions.userId, targetId));
    await tx.delete(brokerConnections).where(eq(brokerConnections.userId, targetId));
    await tx.delete(tradingChallenges).where(eq(tradingChallenges.userId, targetId));
    await tx.delete(financeExpenses).where(eq(financeExpenses.userId, targetId));
    await tx.delete(financeNetWorth).where(eq(financeNetWorth.userId, targetId));
    await tx.delete(financeSettings).where(eq(financeSettings.userId, targetId));
    // Market News and the economic calendar are a shared desk feed, so they
    // survive the user — just drop the authorship link.
    await tx.update(tradingNews).set({ authorId: null }).where(eq(tradingNews.authorId, targetId));
    await tx.update(tradingCalendar).set({ authorId: null }).where(eq(tradingCalendar.authorId, targetId));
    await tx.delete(sessions).where(eq(sessions.userId, targetId));
    await tx.delete(users).where(eq(users.id, targetId));
  });
}
