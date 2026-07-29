import crypto from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, tradingTeams, userTeams, userTeamMembers, userTeamInvites } from '../db/schema.js';
import { isAdmin, isFounder, parseRoles, type RoleKey } from '../auth/rbac.js';
import { isDemoUser } from '../demo/identity.js';

// My Portal — Trading Teams.
//
// A user's Trading Team is the SAME team that scopes their trade sharing: their
// `users.team_id` (a `trading_teams` row). This service is the self-service
// surface over that team — it reads its membership from `users.team_id` (the
// single source of truth, shared with the admin Teams panel and the trade-scope
// boundary) and layers on the My-Portal-only metadata:
//   • `user_teams`        — one row per team holding the leader (leaderId).
//   • `user_team_members` — optional per-user cosmetic badge + permission flags.
//   • `user_team_invites` — pending invitations; accepting sets the invitee's
//                           team_id, i.e. moves them onto the team's desk.
// Because membership lives in `team_id`, everything that scopes to a team (Live
// Wall, Trade Log, History, capital, chat, leaderboards, notifications) follows
// the My Portal team automatically — the two are now one team.

export class UserTeamError extends Error {}

export const MAX_TEAM_MEMBERS = 5;

// Cosmetic badge titles offered as presets; the leader may also type a custom
// one (any label up to 40 chars).
export const BADGE_PRESETS = ['Chief Strategist', 'Chief Analyst', 'Risk Manager', 'Lead Trader'] as const;

// The leader-granted permission flags. The leader implicitly holds them all.
export interface MemberPermissions {
  canCreateStudyGuides: boolean;
  canInvite: boolean;
  canManageBadges: boolean;
  canRemoveMembers: boolean;
  canEditTeam: boolean;
  // Remove (and restore) any teammate's trade, not just their own. Enforced in
  // trading/deleteAccess.ts and bounded by the team's trade scope.
  canDeleteTrades: boolean;
}

const ALL_PERMS: MemberPermissions = {
  canCreateStudyGuides: true,
  canInvite: true,
  canManageBadges: true,
  canRemoveMembers: true,
  canEditTeam: true,
  canDeleteTrades: true,
};

const NO_PERMS: MemberPermissions = {
  canCreateStudyGuides: false,
  canInvite: false,
  canManageBadges: false,
  canRemoveMembers: false,
  canEditTeam: false,
  canDeleteTrades: false,
};

export interface TeamMemberView {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isLeader: boolean;
  badge: string | null;
  permissions: MemberPermissions;
  joinedAt: number;
}

export interface TeamInviteView {
  id: string;
  invitedUserId: string;
  username: string;
  displayName: string;
  status: string;
  createdAt: number;
}

export interface MyTeamView {
  id: string;
  name: string;
  leaderId: string;
  isLeader: boolean;
  myPermissions: MemberPermissions;
  members: TeamMemberView[];
  invites: TeamInviteView[];
  createdAt: number;
}

export interface IncomingInviteView {
  id: string;
  teamId: string;
  teamName: string;
  invitedByName: string | null;
  createdAt: number;
}

type UserRow = typeof users.$inferSelect;
type MemberMetaRow = typeof userTeamMembers.$inferSelect;

function permsFromRow(row: MemberMetaRow): MemberPermissions {
  return {
    canCreateStudyGuides: row.canCreateStudyGuides,
    canInvite: row.canInvite,
    canManageBadges: row.canManageBadges,
    canRemoveMembers: row.canRemoveMembers,
    canEditTeam: row.canEditTeam,
    canDeleteTrades: row.canDeleteTrades,
  };
}

function isRealMember(u: Pick<UserRow, 'username' | 'active'>): boolean {
  return u.active && !isDemoUser({ username: u.username });
}

// The user's current team id (or null when they belong to no team).
async function teamIdOf(userId: string): Promise<string | null> {
  const row = (await db.select({ teamId: users.teamId }).from(users).where(eq(users.id, userId)).limit(1))[0];
  return row?.teamId ?? null;
}

async function teamName(teamId: string): Promise<string> {
  const row = (await db.select({ name: tradingTeams.name }).from(tradingTeams).where(eq(tradingTeams.id, teamId)).limit(1))[0];
  return row?.name ?? 'Trading Team';
}

// The active, non-demo members of a team — the roster, straight from team_id.
async function teamMembers(teamId: string): Promise<UserRow[]> {
  const rows = await db.select().from(users).where(eq(users.teamId, teamId));
  return rows.filter(isRealMember);
}

function leaderRank(rolesJson: string | null): number {
  const roles = parseRoles({ roles: rolesJson });
  if (isFounder(roles)) return 0;
  if (isAdmin(roles)) return 1;
  return 2;
}

// Choose a team's leader when one isn't set (or the stored one has left):
// prefer a founder, then an admin, then the earliest-created member.
function pickLeader(members: UserRow[]): string | null {
  if (members.length === 0) return null;
  const sorted = [...members].sort((a, b) => {
    const ra = leaderRank(a.roles);
    const rb = leaderRank(b.roles);
    if (ra !== rb) return ra - rb;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return sorted[0].id;
}

// Ensure the team's metadata row exists and names a leader who is a current
// member; repairs a stale leader (e.g. after the old one left or was moved by an
// admin). Returns null only when the team has no real members.
async function ensureTeamMeta(
  teamId: string,
): Promise<{ leaderId: string; name: string; createdAt: Date; members: UserRow[] } | null> {
  const members = await teamMembers(teamId);
  if (members.length === 0) return null;
  const memberIds = new Set(members.map((m) => m.id));
  const name = await teamName(teamId);
  const now = new Date();

  let row = (await db.select().from(userTeams).where(eq(userTeams.id, teamId)).limit(1))[0];
  if (!row) {
    const leaderId = pickLeader(members)!;
    await db
      .insert(userTeams)
      .values({ id: teamId, name, leaderId, createdAt: now, updatedAt: now })
      .onConflictDoNothing();
    row = (await db.select().from(userTeams).where(eq(userTeams.id, teamId)).limit(1))[0];
  }
  if (!row) return null;

  const leaderValid = memberIds.has(row.leaderId);
  const nextLeader = leaderValid ? row.leaderId : pickLeader(members)!;
  if (nextLeader !== row.leaderId || row.name !== name) {
    await db.update(userTeams).set({ leaderId: nextLeader, name, updatedAt: now }).where(eq(userTeams.id, teamId));
    row = { ...row, leaderId: nextLeader, name };
  }
  return { leaderId: row.leaderId, name, createdAt: row.createdAt, members };
}

// Per-user metadata (badge + permissions) for the given team, keyed by userId.
// A member-meta row that still points at a different team (the user was moved)
// is ignored, so their old badge/permissions don't leak onto the new team.
async function memberMeta(teamId: string, userIds: string[]): Promise<Map<string, MemberMetaRow>> {
  if (userIds.length === 0) return new Map();
  const rows = await db.select().from(userTeamMembers).where(inArray(userTeamMembers.userId, userIds));
  const map = new Map<string, MemberMetaRow>();
  for (const r of rows) if (r.teamId === teamId) map.set(r.userId, r);
  return map;
}

async function usersByIds(ids: string[]): Promise<Map<string, UserRow>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(users).where(inArray(users.id, ids));
  return new Map(rows.map((u) => [u.id, u]));
}

async function buildTeamView(teamId: string, viewerId: string): Promise<MyTeamView | null> {
  const meta = await ensureTeamMeta(teamId);
  if (!meta) return null;

  const metaMap = await memberMeta(teamId, meta.members.map((m) => m.id));
  const members: TeamMemberView[] = meta.members
    .map((u) => {
      const mr = metaMap.get(u.id);
      const isLeader = u.id === meta.leaderId;
      return {
        userId: u.id,
        username: u.username,
        displayName: u.displayName,
        avatarUrl: u.avatar ?? null,
        isLeader,
        badge: mr?.badge ?? null,
        permissions: isLeader ? ALL_PERMS : mr ? permsFromRow(mr) : NO_PERMS,
        joinedAt: (mr?.joinedAt ?? u.createdAt).getTime(),
      };
    })
    .sort((a, b) => (a.isLeader === b.isLeader ? a.joinedAt - b.joinedAt : a.isLeader ? -1 : 1));

  const viewerIsLeader = viewerId === meta.leaderId;
  const viewerMeta = metaMap.get(viewerId);
  const myPermissions = viewerIsLeader ? ALL_PERMS : viewerMeta ? permsFromRow(viewerMeta) : NO_PERMS;

  const inviteRows = await db
    .select()
    .from(userTeamInvites)
    .where(and(eq(userTeamInvites.teamId, teamId), eq(userTeamInvites.status, 'pending')));
  const inviteUserMap = await usersByIds(inviteRows.map((i) => i.invitedUserId));
  const invites: TeamInviteView[] = inviteRows.map((i) => {
    const u = inviteUserMap.get(i.invitedUserId);
    return {
      id: i.id,
      invitedUserId: i.invitedUserId,
      username: u?.username ?? '(unknown)',
      displayName: u?.displayName ?? '(unknown)',
      status: i.status,
      createdAt: i.createdAt.getTime(),
    };
  });

  return {
    id: teamId,
    name: meta.name,
    leaderId: meta.leaderId,
    isLeader: viewerIsLeader,
    myPermissions,
    members,
    invites,
    createdAt: meta.createdAt.getTime(),
  };
}

// Lightweight context used by other modules (e.g. the Studies delete gate):
// which team the user is in and whether they lead it.
export async function getUserTeamContext(userId: string): Promise<{ teamId: string; isLeader: boolean } | null> {
  const teamId = await teamIdOf(userId);
  if (!teamId) return null;
  const meta = await ensureTeamMeta(teamId);
  if (!meta) return null;
  return { teamId, isLeader: meta.leaderId === userId };
}

// The effective permissions a user has in their team (leader = all). Null when
// the user is in no team.
export async function getEffectivePermissions(userId: string): Promise<MemberPermissions | null> {
  const teamId = await teamIdOf(userId);
  if (!teamId) return null;
  const meta = await ensureTeamMeta(teamId);
  if (!meta) return null;
  if (meta.leaderId === userId) return ALL_PERMS;
  const mr = (await memberMeta(teamId, [userId])).get(userId);
  return mr ? permsFromRow(mr) : NO_PERMS;
}

// The current user's team (or null) plus any pending invitations addressed to
// them. Invites only matter when the user is on no team — once they have one,
// their My Portal shows that team.
export async function getMyPortal(
  userId: string,
): Promise<{ team: MyTeamView | null; incomingInvites: IncomingInviteView[] }> {
  const teamId = await teamIdOf(userId);
  const team = teamId ? await buildTeamView(teamId, userId) : null;

  let incomingInvites: IncomingInviteView[] = [];
  if (!team) {
    const incomingRows = await db
      .select()
      .from(userTeamInvites)
      .where(and(eq(userTeamInvites.invitedUserId, userId), eq(userTeamInvites.status, 'pending')));
    if (incomingRows.length) {
      const teamMap = new Map(
        (await db.select().from(userTeams).where(inArray(userTeams.id, incomingRows.map((i) => i.teamId))))
          .map((t) => [t.id, t]),
      );
      const inviterMap = await usersByIds(incomingRows.map((i) => i.invitedBy).filter((x): x is string => !!x));
      incomingInvites = await Promise.all(
        incomingRows.map(async (i) => ({
          id: i.id,
          teamId: i.teamId,
          teamName: (await teamName(i.teamId)) || teamMap.get(i.teamId)?.name || 'a team',
          invitedByName: i.invitedBy ? inviterMap.get(i.invitedBy)?.displayName ?? null : null,
          createdAt: i.createdAt.getTime(),
        })),
      );
    }
  }

  return { team, incomingInvites };
}

// Ensure the acting user leads the given team, or holds the named permission.
async function requirePerm(teamId: string, userId: string, perm: keyof MemberPermissions): Promise<void> {
  const meta = await ensureTeamMeta(teamId);
  if (!meta) throw new UserTeamError('That team no longer exists');
  if (meta.leaderId === userId) return; // leader can do everything
  if ((await teamIdOf(userId)) !== teamId) throw new UserTeamError('You are not on this team');
  const mr = (await memberMeta(teamId, [userId])).get(userId);
  const perms = mr ? permsFromRow(mr) : NO_PERMS;
  if (!perms[perm]) throw new UserTeamError('You do not have permission to do that');
}

async function requireLeader(teamId: string, userId: string): Promise<void> {
  const meta = await ensureTeamMeta(teamId);
  if (!meta) throw new UserTeamError('That team no longer exists');
  if (meta.leaderId !== userId) throw new UserTeamError('Only the team leader can do that');
}

// Create a brand-new team and move the creator onto it as leader. Reachable only
// when the creator is on no team (or alone) — otherwise they'd abandon teammates;
// in the merged model everyone already has a team, so this is the spin-off path.
export async function createTeam(userId: string, rawName: string): Promise<MyTeamView> {
  const name = rawName.trim();
  if (!name) throw new UserTeamError('A team name is required');
  if (name.length > 80) throw new UserTeamError('That team name is too long');

  const currentTeamId = await teamIdOf(userId);
  if (currentTeamId) {
    const others = (await teamMembers(currentTeamId)).filter((m) => m.id !== userId);
    if (others.length > 0) {
      throw new UserTeamError('You are already on a trading team. Leave it before creating a new one.');
    }
  }

  const now = new Date();
  const teamId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(tradingTeams).values({ id: teamId, name, createdAt: now, updatedAt: now });
    await tx.update(users).set({ teamId, updatedAt: now }).where(eq(users.id, userId));
    await tx.insert(userTeams).values({ id: teamId, name, leaderId: userId, createdAt: now, updatedAt: now });
    // Fresh membership metadata for the creator (leader → perms are implicit).
    await tx.delete(userTeamMembers).where(eq(userTeamMembers.userId, userId));
    await tx.insert(userTeamMembers).values({
      id: crypto.randomUUID(),
      teamId,
      userId,
      badge: null,
      ...ALL_PERMS,
      joinedAt: now,
    });
  });
  const view = await buildTeamView(teamId, userId);
  if (!view) throw new UserTeamError('Could not create the team');
  return view;
}

export async function inviteByUsername(
  actingUserId: string,
  teamId: string,
  rawUsername: string,
): Promise<MyTeamView> {
  await requirePerm(teamId, actingUserId, 'canInvite');

  const count = (await teamMembers(teamId)).length;
  if (count >= MAX_TEAM_MEMBERS) {
    throw new UserTeamError(`A team can have at most ${MAX_TEAM_MEMBERS} members`);
  }

  const username = rawUsername.trim().toLowerCase();
  if (!username) throw new UserTeamError('Enter a username to invite');
  const invitee = (await db.select().from(users).where(eq(users.username, username)).limit(1))[0];
  if (!invitee) throw new UserTeamError('No user with that username');
  if (invitee.id === actingUserId) throw new UserTeamError('You cannot invite yourself');
  if (!invitee.active) throw new UserTeamError('That account is not active');
  if (isDemoUser({ username: invitee.username })) throw new UserTeamError('You cannot invite the demo account');
  if (invitee.teamId === teamId) throw new UserTeamError('That user is already on your team');

  const existing = (
    await db
      .select()
      .from(userTeamInvites)
      .where(and(eq(userTeamInvites.teamId, teamId), eq(userTeamInvites.invitedUserId, invitee.id)))
      .limit(1)
  )[0];
  const now = new Date();
  if (existing) {
    if (existing.status === 'pending') throw new UserTeamError('That user already has a pending invite');
    await db
      .update(userTeamInvites)
      .set({ status: 'pending', invitedBy: actingUserId, updatedAt: now })
      .where(eq(userTeamInvites.id, existing.id));
  } else {
    await db.insert(userTeamInvites).values({
      id: crypto.randomUUID(),
      teamId,
      invitedUserId: invitee.id,
      invitedBy: actingUserId,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
  }
  const view = await buildTeamView(teamId, actingUserId);
  if (!view) throw new UserTeamError('That team no longer exists');
  return view;
}

// Cancel a pending sent invite (leader or an inviter with canInvite).
export async function cancelInvite(actingUserId: string, inviteId: string): Promise<MyTeamView> {
  const invite = (await db.select().from(userTeamInvites).where(eq(userTeamInvites.id, inviteId)).limit(1))[0];
  if (!invite) throw new UserTeamError('That invite no longer exists');
  await requirePerm(invite.teamId, actingUserId, 'canInvite');
  await db.delete(userTeamInvites).where(eq(userTeamInvites.id, inviteId));
  const view = await buildTeamView(invite.teamId, actingUserId);
  if (!view) throw new UserTeamError('That team no longer exists');
  return view;
}

// The invited user accepts or declines. Accepting MOVES them onto the team's
// desk (sets their team_id) — so they immediately share and see its trades.
export async function respondToInvite(userId: string, inviteId: string, accept: boolean): Promise<void> {
  const invite = (await db.select().from(userTeamInvites).where(eq(userTeamInvites.id, inviteId)).limit(1))[0];
  if (!invite || invite.invitedUserId !== userId) throw new UserTeamError('That invite no longer exists');
  if (invite.status !== 'pending') throw new UserTeamError('That invite is no longer open');
  const now = new Date();

  if (!accept) {
    await db.update(userTeamInvites).set({ status: 'declined', updatedAt: now }).where(eq(userTeamInvites.id, inviteId));
    return;
  }

  const count = (await teamMembers(invite.teamId)).length;
  if (count >= MAX_TEAM_MEMBERS) throw new UserTeamError('That team is already full');

  await db.transaction(async (tx) => {
    await tx.update(users).set({ teamId: invite.teamId, updatedAt: now }).where(eq(users.id, userId));
    // Reset any stale membership metadata from a previous team.
    await tx.delete(userTeamMembers).where(eq(userTeamMembers.userId, userId));
    await tx.insert(userTeamMembers).values({
      id: crypto.randomUUID(),
      teamId: invite.teamId,
      userId,
      badge: null,
      ...NO_PERMS,
      joinedAt: now,
    });
    await tx.update(userTeamInvites).set({ status: 'accepted', updatedAt: now }).where(eq(userTeamInvites.id, inviteId));
  });
}

// A member leaves the team (their team_id is cleared → they see only their own
// trades). The leader must hand off leadership first when other members remain.
export async function leaveTeam(userId: string): Promise<void> {
  const teamId = await teamIdOf(userId);
  if (!teamId) throw new UserTeamError('You are not in a Trading Team');
  const meta = await ensureTeamMeta(teamId);
  if (meta && meta.leaderId === userId) {
    const others = meta.members.filter((m) => m.id !== userId);
    if (others.length > 0) throw new UserTeamError('Hand leadership to another member before leaving');
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(users).set({ teamId: null, updatedAt: now }).where(eq(users.id, userId));
    await tx.delete(userTeamMembers).where(eq(userTeamMembers.userId, userId));
  });
}

export async function removeMember(actingUserId: string, memberUserId: string): Promise<MyTeamView> {
  const teamId = await teamIdOf(actingUserId);
  if (!teamId) throw new UserTeamError('You are not in a Trading Team');
  await requirePerm(teamId, actingUserId, 'canRemoveMembers');
  const meta = await ensureTeamMeta(teamId);
  if (!meta) throw new UserTeamError('That team no longer exists');
  if (memberUserId === meta.leaderId) throw new UserTeamError('The team leader cannot be removed');
  if (memberUserId === actingUserId) throw new UserTeamError('Use “Leave team” to remove yourself');
  if ((await teamIdOf(memberUserId)) !== teamId) throw new UserTeamError('That member is not on your team');

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(users).set({ teamId: null, updatedAt: now }).where(eq(users.id, memberUserId));
    await tx.delete(userTeamMembers).where(eq(userTeamMembers.userId, memberUserId));
  });
  const view = await buildTeamView(teamId, actingUserId);
  if (!view) throw new UserTeamError('That team no longer exists');
  return view;
}

export async function transferLeadership(actingUserId: string, newLeaderUserId: string): Promise<MyTeamView> {
  const teamId = await teamIdOf(actingUserId);
  if (!teamId) throw new UserTeamError('You are not in a Trading Team');
  await requireLeader(teamId, actingUserId);
  if (newLeaderUserId === actingUserId) throw new UserTeamError('You are already the leader');
  if ((await teamIdOf(newLeaderUserId)) !== teamId) throw new UserTeamError('Pick a member of your team');
  await db.update(userTeams).set({ leaderId: newLeaderUserId, updatedAt: new Date() }).where(eq(userTeams.id, teamId));
  const view = await buildTeamView(teamId, actingUserId);
  if (!view) throw new UserTeamError('That team no longer exists');
  return view;
}

// Upsert one member's metadata, keyed by the unique userId. When the stored row
// belongs to a different team (a moved user), it's replaced fresh for this team.
async function writeMemberMeta(
  teamId: string,
  memberUserId: string,
  changes: Partial<Omit<MemberMetaRow, 'id' | 'teamId' | 'userId' | 'joinedAt'>>,
): Promise<void> {
  await ensureTeamMeta(teamId); // guarantees the parent user_teams row exists
  const existing = (
    await db.select().from(userTeamMembers).where(eq(userTeamMembers.userId, memberUserId)).limit(1)
  )[0];
  if (existing && existing.teamId === teamId) {
    await db.update(userTeamMembers).set(changes).where(eq(userTeamMembers.userId, memberUserId));
    return;
  }
  const now = new Date();
  await db
    .insert(userTeamMembers)
    .values({ id: crypto.randomUUID(), teamId, userId: memberUserId, badge: null, ...NO_PERMS, ...changes, joinedAt: now })
    .onConflictDoUpdate({
      target: userTeamMembers.userId,
      set: { teamId, badge: null, ...NO_PERMS, ...changes },
    });
}

export async function setMemberBadge(
  actingUserId: string,
  memberUserId: string,
  rawBadge: string | null,
): Promise<MyTeamView> {
  const teamId = await teamIdOf(actingUserId);
  if (!teamId) throw new UserTeamError('You are not in a Trading Team');
  await requirePerm(teamId, actingUserId, 'canManageBadges');
  if ((await teamIdOf(memberUserId)) !== teamId) throw new UserTeamError('That member is not on your team');
  let badge: string | null = null;
  if (rawBadge != null) {
    badge = rawBadge.trim();
    if (badge.length === 0) badge = null;
    else if (badge.length > 40) throw new UserTeamError('That badge title is too long');
  }
  await writeMemberMeta(teamId, memberUserId, { badge });
  const view = await buildTeamView(teamId, actingUserId);
  if (!view) throw new UserTeamError('That team no longer exists');
  return view;
}

export async function setMemberPermissions(
  actingUserId: string,
  memberUserId: string,
  perms: Partial<MemberPermissions>,
): Promise<MyTeamView> {
  const teamId = await teamIdOf(actingUserId);
  if (!teamId) throw new UserTeamError('You are not in a Trading Team');
  await requireLeader(teamId, actingUserId);
  const meta = await ensureTeamMeta(teamId);
  if (meta && meta.leaderId === memberUserId) {
    throw new UserTeamError('The leader already has every permission');
  }
  if ((await teamIdOf(memberUserId)) !== teamId) throw new UserTeamError('That member is not on your team');
  const patch: Partial<MemberPermissions> = {};
  if (perms.canCreateStudyGuides != null) patch.canCreateStudyGuides = perms.canCreateStudyGuides;
  if (perms.canInvite != null) patch.canInvite = perms.canInvite;
  if (perms.canManageBadges != null) patch.canManageBadges = perms.canManageBadges;
  if (perms.canRemoveMembers != null) patch.canRemoveMembers = perms.canRemoveMembers;
  if (perms.canEditTeam != null) patch.canEditTeam = perms.canEditTeam;
  if (perms.canDeleteTrades != null) patch.canDeleteTrades = perms.canDeleteTrades;
  if (Object.keys(patch).length) await writeMemberMeta(teamId, memberUserId, patch);
  const view = await buildTeamView(teamId, actingUserId);
  if (!view) throw new UserTeamError('That team no longer exists');
  return view;
}

export async function renameTeam(actingUserId: string, rawName: string): Promise<MyTeamView> {
  const teamId = await teamIdOf(actingUserId);
  if (!teamId) throw new UserTeamError('You are not in a Trading Team');
  await requirePerm(teamId, actingUserId, 'canEditTeam');
  const name = rawName.trim();
  if (!name) throw new UserTeamError('A team name is required');
  if (name.length > 80) throw new UserTeamError('That team name is too long');
  const now = new Date();
  // Rename the authoritative trading team (shared with the admin panel) and keep
  // the metadata row's name in sync.
  await db.update(tradingTeams).set({ name, updatedAt: now }).where(eq(tradingTeams.id, teamId));
  await db.update(userTeams).set({ name, updatedAt: now }).where(eq(userTeams.id, teamId));
  const view = await buildTeamView(teamId, actingUserId);
  if (!view) throw new UserTeamError('That team no longer exists');
  return view;
}

// Boot backfill: give every existing trading team a My Portal leader row so it
// shows up as a managed team (picking a founder/admin/earliest member). Cheap
// and idempotent — ensureTeamMeta creates/repairs one row per team with members.
export async function backfillTeamLeaders(): Promise<void> {
  const teams = await db.select({ id: tradingTeams.id }).from(tradingTeams);
  for (const t of teams) {
    try {
      await ensureTeamMeta(t.id);
    } catch (err) {
      console.error('Team-leader backfill failed for', t.id, err);
    }
  }
}
