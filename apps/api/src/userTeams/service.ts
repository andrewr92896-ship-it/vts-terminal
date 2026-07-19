import crypto from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, userTeams, userTeamMembers, userTeamInvites } from '../db/schema.js';

// My Portal — user-created Trading Teams. A user owns at most one team (the one
// they lead) and belongs to at most one (enforced by the unique userId on
// user_team_members). The leader assigns cosmetic badges and per-member
// permissions and can hand leadership to another member. Capped at five members.

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
}

const ALL_PERMS: MemberPermissions = {
  canCreateStudyGuides: true,
  canInvite: true,
  canManageBadges: true,
  canRemoveMembers: true,
  canEditTeam: true,
};

const NO_PERMS: MemberPermissions = {
  canCreateStudyGuides: false,
  canInvite: false,
  canManageBadges: false,
  canRemoveMembers: false,
  canEditTeam: false,
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
  invites: TeamInviteView[]; // pending invites the team has sent (leaders/inviters)
  createdAt: number;
}

export interface IncomingInviteView {
  id: string;
  teamId: string;
  teamName: string;
  invitedByName: string | null;
  createdAt: number;
}

function permsFromRow(row: typeof userTeamMembers.$inferSelect): MemberPermissions {
  return {
    canCreateStudyGuides: row.canCreateStudyGuides,
    canInvite: row.canInvite,
    canManageBadges: row.canManageBadges,
    canRemoveMembers: row.canRemoveMembers,
    canEditTeam: row.canEditTeam,
  };
}

// The membership row for a user, or null when they are in no team.
async function memberRow(userId: string) {
  return (
    await db.select().from(userTeamMembers).where(eq(userTeamMembers.userId, userId)).limit(1)
  )[0];
}

async function teamRow(teamId: string) {
  return (await db.select().from(userTeams).where(eq(userTeams.id, teamId)).limit(1))[0];
}

// Lightweight context used by other modules (e.g. the Studies delete gate):
// which team the user is in and whether they lead it.
export async function getUserTeamContext(
  userId: string,
): Promise<{ teamId: string; isLeader: boolean } | null> {
  const m = await memberRow(userId);
  if (!m) return null;
  const team = await teamRow(m.teamId);
  if (!team) return null;
  return { teamId: m.teamId, isLeader: team.leaderId === userId };
}

// The effective permissions a user has in their team (leader = all). Returns
// null when the user is in no team.
export async function getEffectivePermissions(userId: string): Promise<MemberPermissions | null> {
  const m = await memberRow(userId);
  if (!m) return null;
  const team = await teamRow(m.teamId);
  if (!team) return null;
  return team.leaderId === userId ? ALL_PERMS : permsFromRow(m);
}

async function usersByIds(ids: string[]) {
  if (!ids.length) return new Map<string, typeof users.$inferSelect>();
  const rows = await db.select().from(users).where(inArray(users.id, ids));
  return new Map(rows.map((u) => [u.id, u]));
}

async function buildTeamView(teamId: string, viewerId: string): Promise<MyTeamView | null> {
  const team = await teamRow(teamId);
  if (!team) return null;
  const memberRows = await db.select().from(userTeamMembers).where(eq(userTeamMembers.teamId, teamId));
  const userMap = await usersByIds(memberRows.map((m) => m.userId));
  const members: TeamMemberView[] = memberRows
    .map((m) => {
      const u = userMap.get(m.userId);
      const isLeader = team.leaderId === m.userId;
      return {
        userId: m.userId,
        username: u?.username ?? '(removed)',
        displayName: u?.displayName ?? '(removed)',
        avatarUrl: u?.avatar ?? null,
        isLeader,
        badge: m.badge ?? null,
        permissions: isLeader ? ALL_PERMS : permsFromRow(m),
        joinedAt: m.joinedAt.getTime(),
      };
    })
    // Leader first, then by join time.
    .sort((a, b) => (a.isLeader ? -1 : b.isLeader ? 1 : a.joinedAt - b.joinedAt));

  const viewerIsLeader = team.leaderId === viewerId;
  const viewerRow = memberRows.find((m) => m.userId === viewerId);
  const myPermissions = viewerIsLeader ? ALL_PERMS : viewerRow ? permsFromRow(viewerRow) : NO_PERMS;

  // Pending sent invites (shown to leader and members who can invite).
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
    id: team.id,
    name: team.name,
    leaderId: team.leaderId,
    isLeader: viewerIsLeader,
    myPermissions,
    members,
    invites,
    createdAt: team.createdAt.getTime(),
  };
}

// The current user's team (or null) plus any pending invitations addressed to
// them from other teams.
export async function getMyPortal(
  userId: string,
): Promise<{ team: MyTeamView | null; incomingInvites: IncomingInviteView[] }> {
  const m = await memberRow(userId);
  const team = m ? await buildTeamView(m.teamId, userId) : null;

  const incomingRows = await db
    .select()
    .from(userTeamInvites)
    .where(and(eq(userTeamInvites.invitedUserId, userId), eq(userTeamInvites.status, 'pending')));
  const teamMap = new Map(
    (await db.select().from(userTeams).where(inArray(userTeams.id, incomingRows.map((i) => i.teamId) as string[])))
      .map((t) => [t.id, t]),
  );
  const inviterMap = await usersByIds(incomingRows.map((i) => i.invitedBy).filter((x): x is string => !!x));
  const incomingInvites: IncomingInviteView[] = incomingRows
    // A user already in a team shouldn't see join prompts (defensive).
    .filter(() => !m)
    .map((i) => ({
      id: i.id,
      teamId: i.teamId,
      teamName: teamMap.get(i.teamId)?.name ?? 'a team',
      invitedByName: i.invitedBy ? inviterMap.get(i.invitedBy)?.displayName ?? null : null,
      createdAt: i.createdAt.getTime(),
    }));

  return { team, incomingInvites };
}

export async function createTeam(userId: string, rawName: string): Promise<MyTeamView> {
  const name = rawName.trim();
  if (!name) throw new UserTeamError('A team name is required');
  if (name.length > 80) throw new UserTeamError('That team name is too long');
  if (await memberRow(userId)) {
    throw new UserTeamError('You are already in a Trading Team');
  }
  const now = new Date();
  const teamId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(userTeams).values({ id: teamId, name, leaderId: userId, createdAt: now, updatedAt: now });
    await tx.insert(userTeamMembers).values({
      id: crypto.randomUUID(),
      teamId,
      userId,
      badge: null,
      canCreateStudyGuides: true,
      canInvite: true,
      canManageBadges: true,
      canRemoveMembers: true,
      canEditTeam: true,
      joinedAt: now,
    });
  });
  const view = await buildTeamView(teamId, userId);
  if (!view) throw new UserTeamError('Could not create the team');
  return view;
}

// Ensure the acting user leads the given team, or holds the named permission.
async function requirePerm(
  teamId: string,
  userId: string,
  perm: keyof MemberPermissions,
): Promise<void> {
  const team = await teamRow(teamId);
  if (!team) throw new UserTeamError('That team no longer exists');
  if (team.leaderId === userId) return; // leader can do everything
  const m = await memberRow(userId);
  if (!m || m.teamId !== teamId) throw new UserTeamError('You are not on this team');
  if (!permsFromRow(m)[perm]) throw new UserTeamError('You do not have permission to do that');
}

async function requireLeader(teamId: string, userId: string): Promise<void> {
  const team = await teamRow(teamId);
  if (!team) throw new UserTeamError('That team no longer exists');
  if (team.leaderId !== userId) throw new UserTeamError('Only the team leader can do that');
}

export async function inviteByUsername(
  actingUserId: string,
  teamId: string,
  rawUsername: string,
): Promise<MyTeamView> {
  await requirePerm(teamId, actingUserId, 'canInvite');

  const count = (await db.select().from(userTeamMembers).where(eq(userTeamMembers.teamId, teamId))).length;
  if (count >= MAX_TEAM_MEMBERS) {
    throw new UserTeamError(`A team can have at most ${MAX_TEAM_MEMBERS} members`);
  }

  const username = rawUsername.trim().toLowerCase();
  if (!username) throw new UserTeamError('Enter a username to invite');
  const invitee = (await db.select().from(users).where(eq(users.username, username)).limit(1))[0];
  if (!invitee) throw new UserTeamError('No user with that username');
  if (invitee.id === actingUserId) throw new UserTeamError('You cannot invite yourself');
  if (!invitee.active) throw new UserTeamError('That account is not active');

  if (await memberRow(invitee.id)) {
    throw new UserTeamError('That user is already in a Trading Team');
  }
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
    // Re-invite after a previous decline: reopen the same row.
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

// The invited user accepts or declines an invitation addressed to them.
export async function respondToInvite(
  userId: string,
  inviteId: string,
  accept: boolean,
): Promise<void> {
  const invite = (await db.select().from(userTeamInvites).where(eq(userTeamInvites.id, inviteId)).limit(1))[0];
  if (!invite || invite.invitedUserId !== userId) throw new UserTeamError('That invite no longer exists');
  if (invite.status !== 'pending') throw new UserTeamError('That invite is no longer open');
  const now = new Date();

  if (!accept) {
    await db.update(userTeamInvites).set({ status: 'declined', updatedAt: now }).where(eq(userTeamInvites.id, inviteId));
    return;
  }

  if (await memberRow(userId)) throw new UserTeamError('You are already in a Trading Team');
  const count = (await db.select().from(userTeamMembers).where(eq(userTeamMembers.teamId, invite.teamId))).length;
  if (count >= MAX_TEAM_MEMBERS) throw new UserTeamError('That team is already full');

  await db.transaction(async (tx) => {
    await tx.insert(userTeamMembers).values({
      id: crypto.randomUUID(),
      teamId: invite.teamId,
      userId,
      badge: null,
      canCreateStudyGuides: false,
      canInvite: false,
      canManageBadges: false,
      canRemoveMembers: false,
      canEditTeam: false,
      joinedAt: now,
    });
    await tx.update(userTeamInvites).set({ status: 'accepted', updatedAt: now }).where(eq(userTeamInvites.id, inviteId));
  });
}

// A member leaves. The leader can only leave once they've transferred
// leadership; if they are the sole member, leaving disbands the team.
export async function leaveTeam(userId: string): Promise<void> {
  const m = await memberRow(userId);
  if (!m) throw new UserTeamError('You are not in a Trading Team');
  const team = await teamRow(m.teamId);
  if (!team) {
    await db.delete(userTeamMembers).where(eq(userTeamMembers.userId, userId));
    return;
  }
  if (team.leaderId === userId) {
    const others = (
      await db.select().from(userTeamMembers).where(eq(userTeamMembers.teamId, team.id))
    ).filter((r) => r.userId !== userId);
    if (others.length > 0) {
      throw new UserTeamError('Hand leadership to another member before leaving');
    }
    // Sole member: disband the whole team.
    await db.transaction(async (tx) => {
      await tx.delete(userTeamInvites).where(eq(userTeamInvites.teamId, team.id));
      await tx.delete(userTeamMembers).where(eq(userTeamMembers.teamId, team.id));
      await tx.delete(userTeams).where(eq(userTeams.id, team.id));
    });
    return;
  }
  await db.delete(userTeamMembers).where(eq(userTeamMembers.userId, userId));
}

export async function removeMember(actingUserId: string, memberUserId: string): Promise<MyTeamView> {
  const m = await memberRow(memberUserId);
  if (!m) throw new UserTeamError('That member is not on a team');
  await requirePerm(m.teamId, actingUserId, 'canRemoveMembers');
  const team = await teamRow(m.teamId);
  if (!team) throw new UserTeamError('That team no longer exists');
  if (team.leaderId === memberUserId) throw new UserTeamError('The team leader cannot be removed');
  if (memberUserId === actingUserId) throw new UserTeamError('Use “Leave team” to remove yourself');
  await db.delete(userTeamMembers).where(eq(userTeamMembers.userId, memberUserId));
  const view = await buildTeamView(team.id, actingUserId);
  if (!view) throw new UserTeamError('That team no longer exists');
  return view;
}

export async function transferLeadership(actingUserId: string, newLeaderUserId: string): Promise<MyTeamView> {
  const m = await memberRow(actingUserId);
  if (!m) throw new UserTeamError('You are not in a Trading Team');
  await requireLeader(m.teamId, actingUserId);
  const target = await memberRow(newLeaderUserId);
  if (!target || target.teamId !== m.teamId) throw new UserTeamError('Pick a member of your team');
  if (newLeaderUserId === actingUserId) throw new UserTeamError('You are already the leader');
  await db
    .update(userTeams)
    .set({ leaderId: newLeaderUserId, updatedAt: new Date() })
    .where(eq(userTeams.id, m.teamId));
  const view = await buildTeamView(m.teamId, actingUserId);
  if (!view) throw new UserTeamError('That team no longer exists');
  return view;
}

export async function setMemberBadge(
  actingUserId: string,
  memberUserId: string,
  rawBadge: string | null,
): Promise<MyTeamView> {
  const m = await memberRow(memberUserId);
  if (!m) throw new UserTeamError('That member is not on a team');
  await requirePerm(m.teamId, actingUserId, 'canManageBadges');
  let badge: string | null = null;
  if (rawBadge != null) {
    badge = rawBadge.trim();
    if (badge.length === 0) badge = null;
    else if (badge.length > 40) throw new UserTeamError('That badge title is too long');
  }
  await db.update(userTeamMembers).set({ badge }).where(eq(userTeamMembers.userId, memberUserId));
  const view = await buildTeamView(m.teamId, actingUserId);
  if (!view) throw new UserTeamError('That team no longer exists');
  return view;
}

export async function setMemberPermissions(
  actingUserId: string,
  memberUserId: string,
  perms: Partial<MemberPermissions>,
): Promise<MyTeamView> {
  const m = await memberRow(memberUserId);
  if (!m) throw new UserTeamError('That member is not on a team');
  await requireLeader(m.teamId, actingUserId);
  const team = await teamRow(m.teamId);
  if (team && team.leaderId === memberUserId) {
    throw new UserTeamError('The leader already has every permission');
  }
  const patch: Partial<typeof userTeamMembers.$inferInsert> = {};
  if (perms.canCreateStudyGuides != null) patch.canCreateStudyGuides = perms.canCreateStudyGuides;
  if (perms.canInvite != null) patch.canInvite = perms.canInvite;
  if (perms.canManageBadges != null) patch.canManageBadges = perms.canManageBadges;
  if (perms.canRemoveMembers != null) patch.canRemoveMembers = perms.canRemoveMembers;
  if (perms.canEditTeam != null) patch.canEditTeam = perms.canEditTeam;
  if (Object.keys(patch).length) {
    await db.update(userTeamMembers).set(patch).where(eq(userTeamMembers.userId, memberUserId));
  }
  const view = await buildTeamView(m.teamId, actingUserId);
  if (!view) throw new UserTeamError('That team no longer exists');
  return view;
}

export async function renameTeam(actingUserId: string, rawName: string): Promise<MyTeamView> {
  const m = await memberRow(actingUserId);
  if (!m) throw new UserTeamError('You are not in a Trading Team');
  await requirePerm(m.teamId, actingUserId, 'canEditTeam');
  const name = rawName.trim();
  if (!name) throw new UserTeamError('A team name is required');
  if (name.length > 80) throw new UserTeamError('That team name is too long');
  await db.update(userTeams).set({ name, updatedAt: new Date() }).where(eq(userTeams.id, m.teamId));
  const view = await buildTeamView(m.teamId, actingUserId);
  if (!view) throw new UserTeamError('That team no longer exists');
  return view;
}
