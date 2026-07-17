import crypto from 'node:crypto';
import { eq, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingTeams, users } from '../db/schema.js';

// Trading teams: admin-managed groups a trader belongs to. A user is a member of
// at most one team (users.team_id). Teams scope the Studies leaderboards AND all
// trade data (Live Wall, Trade Log, History, broker capital) to teammates — a
// trader sees only their own team's trades (or just their own when teamless).
// Only admins manage teams and assign members.

// The default team seeded on boot (and by migration 0048). Existing accounts are
// assigned to it so the leaderboards keep showing everyone until an admin splits
// the roster into more teams.
export const DEFAULT_TEAM_ID = 'team-vitalis';
export const DEFAULT_TEAM_NAME = 'Vitalis Trading Team';

export class TeamError extends Error {}

// One team as shown in the admin team-management panel, with its current member
// count so the admin can see how the roster is split.
export interface TeamView {
  id: string;
  name: string;
  memberCount: number;
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
    db.select({ teamId: users.teamId }).from(users),
  ]);
  const counts = new Map<string, number>();
  for (const m of memberRows) {
    if (m.teamId) counts.set(m.teamId, (counts.get(m.teamId) ?? 0) + 1);
  }
  const views = teamRows.map((t) => ({
    id: t.id,
    name: t.name,
    memberCount: counts.get(t.id) ?? 0,
    createdAt: t.createdAt.getTime(),
  }));
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
  if (!clean) throw new TeamError('A team name is required');
  if (clean.length > 80) throw new TeamError('Team name is too long');
  const dup = await teamByName(clean);
  if (dup) throw new TeamError('A team with that name already exists');
  const now = new Date();
  const row = { id: crypto.randomUUID(), name: clean, createdAt: now, updatedAt: now };
  await db.insert(tradingTeams).values(row);
  return { id: row.id, name: row.name, memberCount: 0, createdAt: now.getTime() };
}

export async function renameTeam(id: string, name: string): Promise<TeamView> {
  const clean = name.trim();
  if (!clean) throw new TeamError('A team name is required');
  if (clean.length > 80) throw new TeamError('Team name is too long');
  const team = (await db.select().from(tradingTeams).where(eq(tradingTeams.id, id)).limit(1))[0];
  if (!team) throw new TeamError('Team not found');
  const dup = await teamByName(clean);
  if (dup && dup.id !== id) throw new TeamError('A team with that name already exists');
  await db.update(tradingTeams).set({ name: clean, updatedAt: new Date() }).where(eq(tradingTeams.id, id));
  const memberRows = await db.select({ teamId: users.teamId }).from(users).where(eq(users.teamId, id));
  return { id, name: clean, memberCount: memberRows.length, createdAt: team.createdAt.getTime() };
}

// Delete a team. Its members are unassigned (team_id set to null) first, so no
// user is left pointing at a team that no longer exists.
export async function deleteTeam(id: string): Promise<void> {
  const team = (await db.select().from(tradingTeams).where(eq(tradingTeams.id, id)).limit(1))[0];
  if (!team) throw new TeamError('Team not found');
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

// Ensure the default team exists and adopt any team-less accounts into it. The
// migration seeds this too, but on a brand-new database the admin/demo users are
// created after migrations run (with no team), so this backfills them on boot.
// Idempotent and best-effort — never blocks startup.
export async function seedDefaultTeam(): Promise<void> {
  const existing = (
    await db.select({ id: tradingTeams.id }).from(tradingTeams).where(eq(tradingTeams.id, DEFAULT_TEAM_ID)).limit(1)
  )[0];
  const now = new Date();
  if (!existing) {
    await db.insert(tradingTeams).values({
      id: DEFAULT_TEAM_ID,
      name: DEFAULT_TEAM_NAME,
      createdAt: now,
      updatedAt: now,
    });
  }
  // Adopt any account that has no team yet.
  await db.update(users).set({ teamId: DEFAULT_TEAM_ID, updatedAt: now }).where(isNull(users.teamId));
}
