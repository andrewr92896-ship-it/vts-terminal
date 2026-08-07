import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingTeams, users } from '../db/schema.js';
import { parseRoles, type RoleKey } from '../auth/rbac.js';

// Trading teams: admin-managed groups a trader belongs to. A user is a member of
// at most one team (users.team_id). Teams scope the Studies leaderboards AND all
// trade data (Live Wall, Trade Log, History, broker capital) to teammates — a
// trader sees only their own team's trades (or just their own when teamless).
// Only admins manage teams and assign members.

// The default team seeded on boot (and by migration 0048). Existing accounts are
// assigned to it so the leaderboards keep showing everyone until an admin splits
// the roster into more teams.
export const DEFAULT_TEAM_ID = 'team-vitalis';
export const DEFAULT_TEAM_NAME = 'Vitalis Group';

export class TeamError extends Error {}

// A member of a team, as shown in the admin Teams roster.
export interface TeamMemberView {
  id: string;
  displayName: string;
  username: string;
  roles: RoleKey[];
  active: boolean;
}

// One team as shown in the admin team-management panel, with its current member
// count and roster so the admin can see and adjust who is on which team.
export interface TeamView {
  id: string;
  name: string;
  memberCount: number;
  members: TeamMemberView[];
  createdAt: number;
}

// A team reference (id + name) attached to leaderboard responses so the client
// can label which team the board is scoped to.
export interface TeamRef {
  id: string;
  name: string;
}

export async function listTeams(): Promise<TeamView[]> {
  const [teamRows, memberRows] = await Promise.all([
    db.select().from(tradingTeams),
    db
      .select({
        id: users.id,
        displayName: users.displayName,
        username: users.username,
        roles: users.roles,
        active: users.active,
        teamId: users.teamId,
      })
      .from(users),
  ]);
  const byTeam = new Map<string, TeamMemberView[]>();
  for (const m of memberRows) {
    if (!m.teamId) continue;
    const member: TeamMemberView = {
      id: m.id,
      displayName: m.displayName,
      username: m.username,
      roles: parseRoles({ roles: m.roles }),
      active: m.active,
    };
    const list = byTeam.get(m.teamId);
    if (list) list.push(member);
    else byTeam.set(m.teamId, [member]);
  }
  const views: TeamView[] = teamRows.map((t) => {
    const members = (byTeam.get(t.id) ?? []).sort((a, b) => a.displayName.localeCompare(b.displayName));
    return {
      id: t.id,
      name: t.name,
      memberCount: members.length,
      members,
      createdAt: t.createdAt.getTime(),
    };
  });
  // Alphabetical, but keep the seeded default team pinned to the top.
  views.sort((a, b) => {
    if (a.id === DEFAULT_TEAM_ID) return -1;
    if (b.id === DEFAULT_TEAM_ID) return 1;
    return a.name.localeCompare(b.name);
  });
  return views;
}

export async function createTeam(name: string): Promise<TeamView> {
  const clean = name.trim();
  if (!clean) throw new TeamError('A group name is required');
  if (clean.length > 80) throw new TeamError('That group name is too long');
  const dup = await teamByName(clean);
  if (dup) throw new TeamError('A group with that name already exists');
  const now = new Date();
  const row = { id: crypto.randomUUID(), name: clean, createdAt: now, updatedAt: now };
  await db.insert(tradingTeams).values(row);
  return { id: row.id, name: row.name, memberCount: 0, members: [], createdAt: now.getTime() };
}

export async function renameTeam(id: string, name: string): Promise<TeamView> {
  const clean = name.trim();
  if (!clean) throw new TeamError('A group name is required');
  if (clean.length > 80) throw new TeamError('That group name is too long');
  const team = (await db.select().from(tradingTeams).where(eq(tradingTeams.id, id)).limit(1))[0];
  if (!team) throw new TeamError('Group not found');
  const dup = await teamByName(clean);
  if (dup && dup.id !== id) throw new TeamError('A group with that name already exists');
  await db.update(tradingTeams).set({ name: clean, updatedAt: new Date() }).where(eq(tradingTeams.id, id));
  const memberRows = await db.select({ teamId: users.teamId }).from(users).where(eq(users.teamId, id));
  return { id, name: clean, memberCount: memberRows.length, members: [], createdAt: team.createdAt.getTime() };
}

// Delete a team. Its members are unassigned (team_id set to null) first, so no
// user is left pointing at a team that no longer exists.
export async function deleteTeam(id: string): Promise<void> {
  const team = (await db.select().from(tradingTeams).where(eq(tradingTeams.id, id)).limit(1))[0];
  if (!team) throw new TeamError('Group not found');
  await db.transaction(async (tx) => {
    await tx.update(users).set({ teamId: null, updatedAt: new Date() }).where(eq(users.teamId, id));
    await tx.delete(tradingTeams).where(eq(tradingTeams.id, id));
  });
}

// Whether a team id exists (used to validate an admin's team assignment).
export async function teamExists(id: string): Promise<boolean> {
  const rows = await db.select({ id: tradingTeams.id }).from(tradingTeams).where(eq(tradingTeams.id, id)).limit(1);
  return rows.length > 0;
}

// Resolve a team's display name from its id; null for a null/unknown id, so
// callers can pass a user's teamId straight through.
export async function getTeamName(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const rows = await db.select({ name: tradingTeams.name }).from(tradingTeams).where(eq(tradingTeams.id, id)).limit(1);
  return rows[0]?.name ?? null;
}

async function teamByName(name: string): Promise<{ id: string } | null> {
  const rows = await db.select({ id: tradingTeams.id, name: tradingTeams.name }).from(tradingTeams);
  const lower = name.toLowerCase();
  const hit = rows.find((r) => r.name.toLowerCase() === lower);
  return hit ? { id: hit.id } : null;
}

// Ensure the default team exists. Idempotent and best-effort — never blocks
// startup.
//
// IT NO LONGER ADOPTS ANYONE. This function used to end with an unconditional
// `UPDATE users SET team_id = 'team-vitalis' WHERE team_id IS NULL`, which ran
// on every boot — so every account that had not been put on a team explicitly
// was swept into one shared team. On a private terminal with a handful of
// invited users that was a convenience. At public launch it is a data leak with
// no mitigation: team scope is what separates study libraries, Market News
// channel lists and team chat, so every stranger who signed up would land in the
// same scope as every other stranger, able to read, edit and delete each other's
// content.
//
// A team-less account now resolves to a private scope of its own instead — see
// teams/contentScope.ts. Being on a team is something granted, never something
// that happens to you on the next restart.
//
// The default team row is still created (existing members keep it, and it is the
// one real team today), and existing members are left exactly where they are.
// The names the seeded group has been shipped under, so an install created
// before a rename catches up on the next boot. Repaired here rather than in a
// migration for the reason the connection labels are (see
// `backfillConnectionLabels`): a rename is a fact about what the terminal calls
// things, and the code that knows the current name is the only thing that should
// write it. Guarded on the OLD name, so a group somebody deliberately renamed is
// left exactly as they named it.
const SEEDED_GROUP_RENAMES = ['Vitalis Trading Team'];

export async function seedDefaultTeam(): Promise<void> {
  const existing = (
    await db
      .select({ id: tradingTeams.id, name: tradingTeams.name })
      .from(tradingTeams)
      .where(eq(tradingTeams.id, DEFAULT_TEAM_ID))
      .limit(1)
  )[0];
  const now = new Date();
  if (!existing) {
    await db.insert(tradingTeams).values({
      id: DEFAULT_TEAM_ID,
      name: DEFAULT_TEAM_NAME,
      createdAt: now,
      updatedAt: now,
    });
    return;
  }
  if (SEEDED_GROUP_RENAMES.includes(existing.name)) {
    await db
      .update(tradingTeams)
      .set({ name: DEFAULT_TEAM_NAME, updatedAt: now })
      .where(eq(tradingTeams.id, DEFAULT_TEAM_ID));
  }
}
