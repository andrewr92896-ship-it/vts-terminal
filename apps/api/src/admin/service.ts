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
  tradingOrders,
  tradingSessions,
  tradingNotes,
  brokerConnections,
  tradingChallenges,
  tradingDeskSettings,
  tradingBeOverrides,
  tradingCapitalAccounts,
  tradingNews,
  tradingCalendar,
  aiUsage,
  notificationPrefs,
  sessionAlertPrefs,
  alertPrefs,
  pushoverReceipts,
  userFeatures,
  aiViolations,
  budgetCategories,
  budgetEntries,
  userMemberships,
  marketDataLayout,
  marketNewsStreams,
  ticketPresets,
  priceAlerts,
  investmentAccounts,
  investmentHoldings,
  investmentTransactions,
  investmentSnapshots,
  investmentGoals,
  netWorthItems,
  netWorthSnapshots,
  widgetTokens,
  supportRequests,
  supportRequestMessages,
  userTeams,
  userTeamMembers,
  userTeamInvites,
  employeeProfiles,
  employeeSessions,
  employeeLoginAttempts,
  employeeTasks,
  employeeTrustedDevices,
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
  studyDeckQuestions,
  studyFlashcardCards,
  studyFlashcardSets,
  studyGuides,
  studyPackages,
  studyPackageAdds,
  studyPackageCategories,
  studyPackageLessons,
  studyPackageShares,
  studyPackageSubmissions,
} from '../db/schema.js';
import { hashPassword } from '../auth/passwords.js';
import { destroyUserSessions } from '../auth/sessions.js';
import { isAdmin, isFounder, isRoleKey, parseRoles, parseBadges, type RoleKey } from '../auth/rbac.js';
import { teamExists } from '../teams/service.js';
import { assignableBadgeKeys } from '../badges/service.js';
import {
  FREE_MEMBERSHIP,
  MembershipError,
  TIER_LABELS,
  assertCanGrantMembership,
  membershipsByUserId,
  setMembership,
  type Membership,
  type MembershipTier,
} from '../memberships/service.js';
import { recordAdminAction } from './adminLog.js';

// The terminal owner's account, identified by the immutable created username
// (matches the first-boot seed, ADMIN_USERNAME). Only the owner may grant or
// revoke the founder / software_developer roles.
const OWNER_USERNAME = (process.env.ADMIN_USERNAME || 'andrew').trim().toLowerCase();

function isOwnerRow(u: { username: string; createdUsername: string | null }): boolean {
  return (u.createdUsername ?? u.username).trim().toLowerCase() === OWNER_USERNAME;
}

// Roles only the owner may grant/revoke (founder-level power).
const OWNER_ONLY_ROLES: RoleKey[] = ['founder', 'software_developer'];
// Roles only a founder-level user may grant/revoke.
const FOUNDER_ONLY_ROLES: RoleKey[] = ['admin', 'employee'];

// Human labels for the founder-only roles, used in the refusal message.
const FOUNDER_ONLY_LABELS: Partial<Record<RoleKey, string>> = {
  admin: 'Admin',
  employee: 'Employee',
};

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
      const label = FOUNDER_ONLY_LABELS[role] ?? role;
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
  // The paid tier this account holds. Resolved rather than read straight off the
  // row: admins, software developers and founders are always Max by role and
  // have no row at all, so a missing membership does NOT mean Free.
  membership: Membership;
  // Whether this account has been granted Trading Teams. Resolved the same way
  // membership is — founder-level accounts hold it by role with no stored row —
  // so a false here really does mean "cannot see teams", not "no row yet".
  tradingTeams: boolean;
}

function toView(
  u: typeof users.$inferSelect,
  membership: Membership,
  tradingTeams: boolean,
): AdminUserView {
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
    membership,
    tradingTeams,
  };
}

// The membership to show for a user in the admin list. Roles win over rows, the
// same order getMembership() uses — so an admin always reads Max here even
// though nothing was ever granted to them.
function membershipForRow(
  u: typeof users.$inferSelect,
  stored: Map<string, Membership>,
): Membership {
  if (isAdmin(parseRoles(u))) return { ...FREE_MEMBERSHIP, tier: 'max', source: 'role' };
  return stored.get(u.id) ?? FREE_MEMBERSHIP;
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
  if (!(await teamExists(teamId))) throw new AdminError('That group no longer exists');
  return teamId;
}

// Normalize an incoming roles array: keep only valid keys, de-duplicate.
function cleanRoles(roles: string[]): RoleKey[] {
  return [...new Set(roles.filter(isRoleKey))];
}

// The stored Trading Teams grant for one account, ignoring roles. Callers add
// the founder-level resolution themselves so the two rules stay visible at the
// call site rather than hidden in here.
async function rawTradingTeamsGrant(userId: string): Promise<boolean> {
  const row = (
    await db
      .select({ granted: userFeatures.tradingTeams })
      .from(userFeatures)
      .where(eq(userFeatures.userId, userId))
      .limit(1)
  )[0];
  return row?.granted ?? false;
}

export async function listUsers(): Promise<AdminUserView[]> {
  const [rows, stored, grants] = await Promise.all([
    db.select().from(users),
    membershipsByUserId(),
    db.select({ userId: userFeatures.userId, granted: userFeatures.tradingTeams }).from(userFeatures),
  ]);
  const grantByUser = new Map(grants.map((g) => [g.userId, g.granted]));
  rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return rows.map((u) =>
    toView(
      u,
      membershipForRow(u, stored),
      // Founder-level by role, or an explicit grant. Mirrors featuresForUser.
      isFounder(parseRoles(u)) || (grantByUser.get(u.id) ?? false),
    ),
  );
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

// Reject a display name already used by another account (case-insensitive,
// ignoring surrounding space). Display names are the terminal's ONE public
// identity — the name on a public study leaderboard, in a roster, on an invite —
// so two people cannot hold the same one (migration 0102).
//
// Compared the same way the unique index compares: lower(trim(...)). If those
// ever disagree, the index throws a raw SQLite error instead of this readable
// message, so keep them in step.
export async function assertDisplayNameFree(displayName: string, exceptId?: string): Promise<void> {
  const target = displayName.trim().toLowerCase();
  const rows = await db.select({ id: users.id, displayName: users.displayName }).from(users);
  if (rows.some((r) => r.id !== exceptId && r.displayName.trim().toLowerCase() === target)) {
    throw new AdminError('That display name is already taken');
  }
}

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
  await assertDisplayNameFree(displayName);
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
    // Never chosen — resolves to Eastern until they pick one in Preferences.
    displayTimezone: null,
    // On the public study leaderboards by default; switched off in Preferences.
    hideFromLeaderboards: false,
    // No home page chosen — the terminal opens where it always did until they
    // pick one in My Terminal ▸ Settings.
    homeWorkspace: null,
    homeScreen: null,
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
  // A brand-new account has no grant yet, so its tier — and its Trading Teams
  // access — come from its roles alone.
  return toView(row, membershipForRow(row, new Map()), isFounder(parseRoles(row)));
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
    await assertDisplayNameFree(dn, targetId);
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
  // Re-resolved rather than carried over: a role change here can move the
  // account to or from Max, and to or from Trading Teams, on its own.
  return toView(
    updated,
    membershipForRow(updated, await membershipsByUserId()),
    isFounder(parseRoles(updated)) || (await rawTradingTeamsGrant(targetId)),
  );
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
  // terminal always has an owner who can manage it. (With self-deletion blocked
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
  //
  // Two deliberate exceptions, both security records that have to outlive the
  // account they describe: `employee_audit_log` and `credential_audit`. Neither
  // carries a foreign key, and both denormalize the username for exactly this
  // reason — a log of who used a broker key that vanishes when the account is
  // deleted answers nothing after an incident. Do not "tidy" either into the
  // list below; a privacy-policy rewrite covers them explicitly instead.
  await db.transaction(async (tx) => {
    await tx.delete(todoItems).where(eq(todoItems.userId, targetId));
    await tx.delete(todoSections).where(eq(todoSections.userId, targetId));
    await tx.delete(aiUsage).where(eq(aiUsage.userId, targetId));
    await tx.delete(tradingTrades).where(eq(tradingTrades.userId, targetId));
    await tx.delete(tradingAlerts).where(eq(tradingAlerts.userId, targetId));
    await tx.delete(tradingPositions).where(eq(tradingPositions.userId, targetId));
    // The Trade Desk's order journal — this trader's own orders, including the
    // refused ones. Nobody else's record references them, so they go with them.
    await tx.delete(tradingOrders).where(eq(tradingOrders.userId, targetId));
    await tx.delete(tradingSessions).where(eq(tradingSessions.userId, targetId));
    await tx.delete(sessionAlertPrefs).where(eq(sessionAlertPrefs.userId, targetId));
    // Trading Notes — their predictions, observations and reflections. Personal
    // writing, so it goes with the person: unlike credential_audit and the
    // employee audit log, nothing here records access to money or to a hardened
    // surface, and a deleted customer's stored notes are the harder thing to
    // defend keeping. A note shared with a group goes too — the group read it
    // through its author, and the author is leaving.
    await tx.delete(tradingNotes).where(eq(tradingNotes.userId, targetId));
    // Which optional features they had turned on (Premium Features), plus their
    // Trading Teams grant, which rides the same row.
    await tx.delete(userFeatures).where(eq(userFeatures.userId, targetId));
    // Their recorded AI guardrail violations, and the stored conversations with
    // them. Deliberately UNLIKE credential_audit and employee_audit_log, which
    // both outlive the account: those record access to somebody's money and to a
    // hardened internal surface. This records a conversation, so it goes when the
    // person goes — keeping a deleted customer's chat logs is the harder thing to
    // defend, not the easier one.
    await tx.delete(aiViolations).where(eq(aiViolations.userId, targetId));
    // Their budget. Entries cascade from the categories, but both are deleted
    // explicitly — this repo has no ON DELETE CASCADE convention to rely on for
    // per-user cleanup, and an unlisted table is how one gets left behind.
    await tx.delete(budgetEntries).where(eq(budgetEntries.userId, targetId));
    await tx.delete(budgetCategories).where(eq(budgetCategories.userId, targetId));
    // Their paid tier. The Administrator Log entry recording the grant is NOT
    // deleted — like the employee audit log, it is the record that an admin did
    // something, and it survives the account it was done to (target_user_id goes
    // null, target_name is kept, so the entry still reads correctly).
    await tx.delete(userMemberships).where(eq(userMemberships.userId, targetId));
    await tx.delete(marketDataLayout).where(eq(marketDataLayout.userId, targetId));
    await tx.delete(marketNewsStreams).where(eq(marketNewsStreams.userId, targetId));
    await tx.delete(priceAlerts).where(eq(priceAlerts.userId, targetId));
    // The Investments workspace — accounts, the holdings inside them, the money
    // in and out, the dated portfolio readings, and the savings goals. Every one
    // is owner-scoped and personal (nothing here is ever team-visible), so a
    // deleted account takes all of it. Ordered children-first: the foreign keys
    // would cascade these anyway, but the convention in this list is to state
    // every table explicitly rather than depend on that.
    await tx.delete(investmentTransactions).where(eq(investmentTransactions.userId, targetId));
    await tx.delete(investmentHoldings).where(eq(investmentHoldings.userId, targetId));
    await tx.delete(investmentGoals).where(eq(investmentGoals.userId, targetId));
    await tx.delete(investmentSnapshots).where(eq(investmentSnapshots.userId, targetId));
    await tx.delete(investmentAccounts).where(eq(investmentAccounts.userId, targetId));
    // Net Worth — the hand-entered assets and debts, and the dated readings of
    // the whole picture. As personal as anything in the terminal.
    await tx.delete(netWorthItems).where(eq(netWorthItems.userId, targetId));
    await tx.delete(netWorthSnapshots).where(eq(netWorthSnapshots.userId, targetId));
    await tx.delete(widgetTokens).where(eq(widgetTokens.userId, targetId));
    await tx.delete(brokerConnections).where(eq(brokerConnections.userId, targetId));
    await tx.delete(tradingChallenges).where(eq(tradingChallenges.userId, targetId));
    // Per-trader desk settings + their per-instrument break-even buffers (the
    // shared 'desk' default row is keyed 'desk', never a userId, so it survives).
    await tx.delete(tradingDeskSettings).where(eq(tradingDeskSettings.id, targetId));
    await tx.delete(tradingBeOverrides).where(eq(tradingBeOverrides.ownerId, targetId));
    // What they put into each of their accounts and took back out.
    await tx.delete(tradingCapitalAccounts).where(eq(tradingCapitalAccounts.userId, targetId));
    // Their order ticket's quick-size buttons.
    await tx.delete(ticketPresets).where(eq(ticketPresets.userId, targetId));
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
    // How long their repeating alerts repeated for, and the record of which ones
    // fired and were answered. The receipts are NOT an access audit — nothing
    // here records a credential being used, only that this person's own phone
    // was buzzed — so unlike credential_audit they go with the account.
    await tx.delete(alertPrefs).where(eq(alertPrefs.userId, targetId));
    await tx.delete(pushoverReceipts).where(eq(pushoverReceipts.userId, targetId));
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
    // Study Packages this account OWNS, and everything inside them.
    //
    // Unlike the team-shared content below, a package belongs to one person, so
    // it goes with them the way their Investments and Net Worth rows do. It is
    // deleted WHOLE — the game, its questions, everybody's state and banked runs
    // on it, the flashcard set and its cards, the presentation, the categories
    // and the lessons.
    //
    // Detaching the content instead was the first cut and is worse: it would
    // leave games and sets in a scope keyed to a user who no longer exists —
    // unreachable content carrying a package id that resolves to nothing. The
    // ordinary way a creator removes a package is to ARCHIVE it, which destroys
    // nothing; this path only runs when the account itself is being erased.
    //
    // Every child write is spelled out because this database never turns the
    // foreign key pragma on, so a declared ON DELETE action does not fire and
    // anything unnamed here is what gets left behind.
    const ownedPackageIds = (
      await tx.select({ id: studyPackages.id }).from(studyPackages).where(eq(studyPackages.ownerUserId, targetId))
    ).map((p) => p.id);
    if (ownedPackageIds.length) {
      const packageDeckIds = (
        await tx.select({ id: studyDecks.id }).from(studyDecks).where(inArray(studyDecks.packageId, ownedPackageIds))
      ).map((d) => d.id);
      const packageSetIds = (
        await tx
          .select({ id: studyFlashcardSets.id })
          .from(studyFlashcardSets)
          .where(inArray(studyFlashcardSets.packageId, ownedPackageIds))
      ).map((s) => s.id);
      if (packageDeckIds.length) {
        await tx.delete(studyDeckQuestions).where(inArray(studyDeckQuestions.deckId, packageDeckIds));
        await tx.delete(studyDeckGame).where(inArray(studyDeckGame.deckId, packageDeckIds));
        await tx.delete(studyDeckRuns).where(inArray(studyDeckRuns.deckId, packageDeckIds));
        await tx.delete(studyDecks).where(inArray(studyDecks.id, packageDeckIds));
      }
      if (packageSetIds.length) {
        await tx.delete(studyFlashcardCards).where(inArray(studyFlashcardCards.setId, packageSetIds));
        await tx.delete(studyFlashcardSets).where(inArray(studyFlashcardSets.id, packageSetIds));
      }
      await tx.delete(studyGuides).where(inArray(studyGuides.packageId, ownedPackageIds));
      await tx
        .delete(studyPackageCategories)
        .where(inArray(studyPackageCategories.packageId, ownedPackageIds));
      await tx.delete(studyPackageLessons).where(inArray(studyPackageLessons.packageId, ownedPackageIds));
      // Everything hanging off the package this account owned goes with it: the
      // shares it handed out, its library submissions, and the rows recording
      // that other people had taken it up. Leaving any of them would leave a row
      // pointing at a package id that resolves to nothing, since the foreign key
      // pragma is never on.
      await tx.delete(studyPackageShares).where(inArray(studyPackageShares.packageId, ownedPackageIds));
      await tx.delete(studyPackageSubmissions).where(inArray(studyPackageSubmissions.packageId, ownedPackageIds));
      await tx.delete(studyPackageAdds).where(inArray(studyPackageAdds.packageId, ownedPackageIds));
      await tx.delete(studyPackages).where(inArray(studyPackages.id, ownedPackageIds));
    }
    // A package somebody else owns that this account merely authored keeps its
    // authorship link dropped, like the team content below.
    await tx.update(studyPackages).set({ createdBy: null }).where(eq(studyPackages.createdBy, targetId));
    // This account's own side of OTHER people's packages: shares they were given
    // or handed out, submissions they made or reviewed, and library adds. The
    // package itself belongs to somebody else and is untouched — only this
    // person's relationship to it goes.
    await tx.delete(studyPackageShares).where(eq(studyPackageShares.recipientUserId, targetId));
    await tx
      .update(studyPackageShares)
      .set({ sharedByUserId: null })
      .where(eq(studyPackageShares.sharedByUserId, targetId));
    await tx.delete(studyPackageAdds).where(eq(studyPackageAdds.userId, targetId));
    await tx
      .update(studyPackageSubmissions)
      .set({ submittedByUserId: null })
      .where(eq(studyPackageSubmissions.submittedByUserId, targetId));
    await tx
      .update(studyPackageSubmissions)
      .set({ reviewedByUserId: null })
      .where(eq(studyPackageSubmissions.reviewedByUserId, targetId));
    // Team-SHARED study content (decks, flashcard sets, guides) survives the
    // author — just drop the authorship link, mirroring the news feed above.
    await tx.update(studyDecks).set({ createdBy: null }).where(eq(studyDecks.createdBy, targetId));
    await tx
      .update(studyFlashcardSets)
      .set({ createdBy: null })
      .where(eq(studyFlashcardSets.createdBy, targetId));
    await tx.update(studyGuides).set({ createdBy: null }).where(eq(studyGuides.createdBy, targetId));
    // My Terminal team metadata. The team itself (trading_teams + members'
    // users.team_id) is the real trade-scoping team and is left intact — only
    // this user's My Terminal metadata is cleared. For any team this user led,
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
    // Employee portal. The HR record, every employee session and the sign-in
    // throttle counter go with the account. The audit trail deliberately does
    // NOT: it is append-only evidence of what happened, so the rows survive with
    // their `actor` name intact (the user_id column simply points at an id that
    // no longer resolves). Announcements and documents they authored also
    // survive — only the authorship link is dropped (`ON DELETE set null`),
    // matching how team study content is handled above.
    await tx.delete(employeeTasks).where(eq(employeeTasks.userId, targetId));
    await tx.delete(employeeSessions).where(eq(employeeSessions.userId, targetId));
    await tx.delete(employeeTrustedDevices).where(eq(employeeTrustedDevices.userId, targetId));
    await tx.delete(employeeProfiles).where(eq(employeeProfiles.userId, targetId));
    await tx.delete(employeeLoginAttempts).where(eq(employeeLoginAttempts.id, `user:${targetId}`));
    await tx.delete(sessions).where(eq(sessions.userId, targetId));
    await tx.delete(users).where(eq(users.id, targetId));
  });
}


// ---- Memberships ----

// Grant (or change) a user's paid tier.
//
// One function does the grant AND its Administrator Log entry, deliberately.
// The rule the owner set is that no membership is ever handed out without a
// stated reason attached to a named person — so if these were two calls, the
// second could be forgotten and the rule would quietly become optional. The log
// write is best-effort inside recordAdminAction, so a log failure cannot leave a
// user without the tier an admin just promised them; what it cannot do is be
// skipped.
//
// How long a grant may run is not a preference either — assertCanGrantMembership
// caps a plain admin at six months and lets founder-level users grant
// indefinitely. That check runs on the ACTOR's roles, before anything is written.
export async function grantMembership(
  actor: { id: string; displayName: string; roles: RoleKey[] },
  targetId: string,
  input: { tier: MembershipTier; expiresAt: number | null; note: string },
): Promise<AdminUserView> {
  const target = (await db.select().from(users).where(eq(users.id, targetId)).limit(1))[0];
  if (!target) throw new AdminError('That account no longer exists');

  assertCanGrantMembership(actor.roles, { expiresAt: input.expiresAt });
  if (!input.note.trim()) {
    throw new MembershipError('Say why this membership is being granted');
  }

  // An admin or developer is already Max by role, so a grant on one of those
  // accounts would be stored and never read. Say so rather than pretending.
  if (isAdmin(parseRoles(target))) {
    throw new MembershipError(
      `${target.displayName} is an administrator or developer and already holds Max`,
    );
  }

  const membership = await setMembership(
    targetId,
    input,
    { id: actor.id, name: actor.displayName },
  );

  const until =
    membership.expiresAt == null
      ? 'indefinitely'
      : `until ${new Date(membership.expiresAt).toISOString().slice(0, 10)}`;
  await recordAdminAction({
    kind: 'membership.granted',
    // Informational: it is a record of something that happened, and asks nothing
    // of anybody. Only tickets are 'open'.
    state: 'info',
    title: `${TIER_LABELS[input.tier]} membership granted to ${target.displayName} ${until}`,
    detail: input.note.trim(),
    actor: { id: actor.id, name: actor.displayName },
    target: { id: target.id, name: target.displayName },
  });

  return toView(
    target,
    membership,
    isFounder(parseRoles(target)) || (await rawTradingTeamsGrant(target.id)),
  );
}
