import crypto from 'node:crypto';
import { eq, or, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  users,
  sessions,
  todoSections,
  todoItems,
  tradingTrades,
  tradingAlerts,
  tradingPositions,
  tradingSessions,
  brokerConnections,
  tradingChallenges,
  tradingDeskSettings,
  tradingBeOverrides,
  tradingNews,
  tradingCalendar,
  aiUsage,
  notificationPrefs,
  sessionAlertPrefs,
  priceAlerts,
  widgetTokens,
  supportRequests,
  supportRequestMessages,
  userTeams,
  userTeamMembers,
  userTeamInvites,
  manualPositions,
  fundedAccounts,
  fundedTrades,
  tradingBoards,
  chatMessages,
  announcements,
  suggestions,
  bugReports,
  bugReportMessages,
  studyLearned,
  studyVocab,
  studyStarred,
  studySections,
  pushSubscriptions,
  pushoverUsers,
  studyGame,
  studyGameRuns,
  studyDeckGame,
  studyDeckRuns,
  studyTests,
  studyTestProgress,
  studyDecks,
  studyFlashcardSets,
  studyGuides,
} from '../db/schema.js';
import { hashPassword } from '../auth/passwords.js';
import { destroyUserSessions } from '../auth/sessions.js';
import { isAdmin, isFounder, isRoleKey, parseRoles, parseBadges, type RoleKey } from '../auth/rbac.js';
import { teamExists } from '../teams/service.js';
import { assignableBadgeKeys } from '../badges/service.js';

// The portal owner's account, identified by the immutable created username
// (matches the first-boot seed, ADMIN_USERNAME). Only the owner may grant or
// revoke the founder / software_developer roles.
const OWNER_USERNAME = (process.env.ADMIN_USERNAME || 'andrew').trim().toLowerCase();

function isOwnerRow(u: { username: string; createdUsername: string | null }): boolean {
  return (u.createdUsername ?? u.username).trim().toLowerCase() === OWNER_USERNAME;
}

// Roles only the owner may grant/revoke (founder-level power).
const OWNER_ONLY_ROLES: RoleKey[] = ['founder', 'software_developer'];
// Roles only a founder-level user may grant/revoke.
const FOUNDER_ONLY_ROLES: RoleKey[] = ['admin', 'funded'];

// Enforce who may change which roles when an admin edits a user's role set.
// `acting` is the user making the change; `current`/`next` are the target's
// role sets before and after. Throws AdminError if `acting` lacks the authority
// for any role that is being added or removed.
function assertCanAssignRoles(
  acting: typeof users.$inferSelect,
  current: RoleKey[],
  next: RoleKey[],
): void {
  const actingRoles = parseRoles(acting);
  const owner = isOwnerRow(acting);
  const founderLevel = isFounder(actingRoles);
  const changed = (role: RoleKey) => current.includes(role) !== next.includes(role);

  for (const role of OWNER_ONLY_ROLES) {
    if (changed(role) && !owner) {
      throw new AdminError('Only the owner can grant or remove the Founder role');
    }
  }
  for (const role of FOUNDER_ONLY_ROLES) {
    if (changed(role) && !founderLevel) {
      const label = role === 'funded' ? 'Funded' : 'Admin';
      throw new AdminError(`Only a founder can grant or remove the ${label} role`);
    }
  }
}

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
  // Admin-assigned recognition badge keys (see badge_types).
  badges: string[];
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
    badges: parseBadges(u),
    teamId: u.teamId ?? null,
    active: u.active,
    viewBrokerage: u.viewBrokerage,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt.getTime(),
  };
}

// Keep only badge keys that exist and are assignable (not auto-granted by role),
// de-duplicated. Used when an admin sets a user's badges.
async function cleanBadges(badges: string[]): Promise<string[]> {
  const allowed = await assignableBadgeKeys();
  return [...new Set(badges.filter((b) => allowed.has(b)))];
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

export async function createUser(actingUserId: string, input: CreateUserInput): Promise<AdminUserView> {
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

  // A new account starts with no roles, so any elevated role requested must be
  // one the acting user is allowed to grant.
  const acting = (await db.select().from(users).where(eq(users.id, actingUserId)).limit(1))[0];
  if (!acting) throw new AdminError('Acting user not found');
  assertCanAssignRoles(acting, [], roles);

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
    avatar: null,
    passwordHash: await hashPassword(input.password),
    role: 'Viewer' as const, // legacy column, unused; kept populated for type/back-compat
    roles: JSON.stringify(roles),
    badges: null,
    teamId,
    viewBrokerage: input.viewBrokerage ?? false,
    active: true,
    // Admin sets a temporary password; force a change on first login.
    mustChangePassword: true,
    // New account has not accepted the Terms/Privacy yet; the acceptance gate
    // prompts them on first sign-in.
    termsAcceptedVersion: null,
    termsAcceptedAt: null,
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
  // Recognition badge keys to assign (replaces the current set). Invalid or
  // auto-granted keys are dropped.
  badges?: string[];
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
  if (isSelf && input.roles && !isAdmin(cleanRoles(input.roles))) {
    throw new AdminError('You cannot remove your own admin access');
  }

  // Enforce who may grant/revoke each role that is changing.
  if (input.roles != null) {
    const acting = (await db.select().from(users).where(eq(users.id, actingUserId)).limit(1))[0];
    if (!acting) throw new AdminError('Acting user not found');
    assertCanAssignRoles(acting, parseRoles(target), cleanRoles(input.roles));
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
  if (input.badges != null) patch.badges = JSON.stringify(await cleanBadges(input.badges));
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

  // Never delete the last admin-capable account (admin or founder-level), so the
  // portal always has an owner who can manage it. (With self-deletion blocked
  // above this is also a backstop.)
  if (isAdmin(parseRoles(target))) {
    const all = await db.select({ roles: users.roles }).from(users);
    const adminCount = all.filter((u) => isAdmin(parseRoles(u))).length;
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
    await tx.delete(aiUsage).where(eq(aiUsage.userId, targetId));
    await tx.delete(tradingTrades).where(eq(tradingTrades.userId, targetId));
    await tx.delete(tradingAlerts).where(eq(tradingAlerts.userId, targetId));
    await tx.delete(tradingPositions).where(eq(tradingPositions.userId, targetId));
    await tx.delete(tradingSessions).where(eq(tradingSessions.userId, targetId));
    await tx.delete(sessionAlertPrefs).where(eq(sessionAlertPrefs.userId, targetId));
    await tx.delete(priceAlerts).where(eq(priceAlerts.userId, targetId));
    await tx.delete(widgetTokens).where(eq(widgetTokens.userId, targetId));
    await tx.delete(brokerConnections).where(eq(brokerConnections.userId, targetId));
    await tx.delete(tradingChallenges).where(eq(tradingChallenges.userId, targetId));
    // Per-trader desk settings + their per-instrument break-even buffers (the
    // shared 'desk' default row is keyed 'desk', never a userId, so it survives).
    await tx.delete(tradingDeskSettings).where(eq(tradingDeskSettings.id, targetId));
    await tx.delete(tradingBeOverrides).where(eq(tradingBeOverrides.ownerId, targetId));
    // Notification prefs reference the user on both sides (recipient and the
    // watched trader), so clear rows pointing either way.
    await tx
      .delete(notificationPrefs)
      .where(or(eq(notificationPrefs.userId, targetId), eq(notificationPrefs.targetUserId, targetId)));
    // Market News and the economic calendar are a shared desk feed, so they
    // survive the user — just drop the authorship link.
    await tx.update(tradingNews).set({ authorId: null }).where(eq(tradingNews.authorId, targetId));
    await tx.update(tradingCalendar).set({ authorId: null }).where(eq(tradingCalendar.authorId, targetId));
    // General support requests and their intake messages (messages reference the
    // request, not the user, so clear them by request id first).
    const supportIds = (
      await tx.select({ id: supportRequests.id }).from(supportRequests).where(eq(supportRequests.userId, targetId))
    ).map((r) => r.id);
    if (supportIds.length) {
      await tx.delete(supportRequestMessages).where(inArray(supportRequestMessages.requestId, supportIds));
    }
    await tx.delete(supportRequests).where(eq(supportRequests.userId, targetId));
    // Feedback the user filed from Site Help (siblings of support requests).
    // Bug-report intake messages reference the report, not the user, so clear
    // them by report id first, then the reports and any suggestions.
    const bugReportIds = (
      await tx.select({ id: bugReports.id }).from(bugReports).where(eq(bugReports.userId, targetId))
    ).map((r) => r.id);
    if (bugReportIds.length) {
      await tx.delete(bugReportMessages).where(inArray(bugReportMessages.reportId, bugReportIds));
    }
    await tx.delete(bugReports).where(eq(bugReports.userId, targetId));
    await tx.delete(suggestions).where(eq(suggestions.userId, targetId));
    await tx.delete(announcements).where(eq(announcements.userId, targetId));
    // Manual & funded trading data (trades reference their account, but both
    // also carry user_id, so a direct per-user delete covers all rows).
    await tx.delete(manualPositions).where(eq(manualPositions.userId, targetId));
    await tx.delete(fundedTrades).where(eq(fundedTrades.userId, targetId));
    await tx.delete(fundedAccounts).where(eq(fundedAccounts.userId, targetId));
    await tx.delete(tradingBoards).where(eq(tradingBoards.userId, targetId));
    // Team chat authored by this user.
    await tx.delete(chatMessages).where(eq(chatMessages.userId, targetId));
    // Notification delivery targets (privacy: don't leave device endpoints or a
    // Pushover user key behind after the account is gone).
    await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, targetId));
    await tx.delete(pushoverUsers).where(eq(pushoverUsers.userId, targetId));
    // Per-user Studies progress (learned terms, custom vocab, starred questions,
    // custom subsections, game/test state and banked leaderboard runs).
    await tx.delete(studyLearned).where(eq(studyLearned.userId, targetId));
    await tx.delete(studyVocab).where(eq(studyVocab.userId, targetId));
    await tx.delete(studyStarred).where(eq(studyStarred.userId, targetId));
    await tx.delete(studySections).where(eq(studySections.userId, targetId));
    await tx.delete(studyGame).where(eq(studyGame.userId, targetId));
    await tx.delete(studyGameRuns).where(eq(studyGameRuns.userId, targetId));
    await tx.delete(studyDeckGame).where(eq(studyDeckGame.userId, targetId));
    await tx.delete(studyDeckRuns).where(eq(studyDeckRuns.userId, targetId));
    await tx.delete(studyTests).where(eq(studyTests.userId, targetId));
    await tx.delete(studyTestProgress).where(eq(studyTestProgress.userId, targetId));
    // Team-SHARED study content (decks, flashcard sets, guides) survives the
    // author — just drop the authorship link, mirroring the news feed above.
    await tx.update(studyDecks).set({ createdBy: null }).where(eq(studyDecks.createdBy, targetId));
    await tx
      .update(studyFlashcardSets)
      .set({ createdBy: null })
      .where(eq(studyFlashcardSets.createdBy, targetId));
    await tx.update(studyGuides).set({ createdBy: null }).where(eq(studyGuides.createdBy, targetId));
    // My Portal team metadata. The team itself (trading_teams + members'
    // users.team_id) is the real trade-scoping team and is left intact — only
    // this user's My Portal metadata is cleared. For any team this user led,
    // drop that team's leader pointer + member badges/permissions + pending
    // invites; a new leader is auto-picked from the remaining members on next
    // access (see ensureTeamMeta). Then clear their own membership metadata and
    // any invites addressed to or sent by them.
    const ledTeamIds = (
      await tx.select({ id: userTeams.id }).from(userTeams).where(eq(userTeams.leaderId, targetId))
    ).map((r) => r.id);
    if (ledTeamIds.length) {
      await tx.delete(userTeamMembers).where(inArray(userTeamMembers.teamId, ledTeamIds));
      await tx.delete(userTeamInvites).where(inArray(userTeamInvites.teamId, ledTeamIds));
      await tx.delete(userTeams).where(inArray(userTeams.id, ledTeamIds));
    }
    await tx.delete(userTeamMembers).where(eq(userTeamMembers.userId, targetId));
    await tx
      .delete(userTeamInvites)
      .where(or(eq(userTeamInvites.invitedUserId, targetId), eq(userTeamInvites.invitedBy, targetId)));
    await tx.delete(sessions).where(eq(sessions.userId, targetId));
    await tx.delete(users).where(eq(users.id, targetId));
  });
}
