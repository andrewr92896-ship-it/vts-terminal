import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { studyGame, studyGameRuns, users } from '../db/schema.js';
import { accuracyOf, statsFromState, type RunStats } from './gameStats.js';

// Per-user Study Game state, stored as an opaque JSON string. The shape is owned
// by the web client; the server only persists and returns
// it verbatim, so progress follows the learner across devices.

// The state validator and the ranking-number extraction live with the other
// shared Study Game math (gameStats.ts), reused by the team-deck leaderboards.
export { normalizeState } from './gameStats.js';

export async function getGame(userId: string): Promise<string | null> {
  const rows = await db
    .select({ state: studyGame.state })
    .from(studyGame)
    .where(eq(studyGame.userId, userId))
    .limit(1);
  return rows[0]?.state ?? null;
}

export async function saveGame(userId: string, state: string): Promise<void> {
  await db
    .insert(studyGame)
    .values({ userId, state, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: studyGame.userId,
      set: { state, updatedAt: new Date() },
    });
}

// ---- Leaderboard ----
// The study-game state is owned by the web client, but the
// few headline numbers needed to rank players are simple enough to read here.
// The score is plain lifetime accuracy (correct / attempted).

export interface LeaderboardEntry {
  id: string; // unique row id: "live:<userId>" or "run:<runId>"
  userId: string;
  name: string;
  score: number | null; // lifetime accuracy % (correct / attempted)
  attempted: number; // questions answered in this run
  correct: number; // correct answers in this run
  bestStep: number; // highest overall level step reached (0..59)
  // Current session block (up to WINDOW questions, resets every WINDOW). Only
  // live rows carry it — a banked run has no live block, so these are null/0.
  sessionScore: number | null; // % correct in the current block
  sessionAttempted: number; // answers in the current block (0..WINDOW)
  sessionCorrect: number; // correct answers in the current block
  archived: boolean; // true for a banked (reset) run
  when: number | null; // when the run was banked (ms); null for live rows
  isMe: boolean; // the caller's current live row
}

// Bank a run to the leaderboard: parse its headline numbers from the given state
// blob and store them as a past run for this user. No-op when the run is empty
// or the state is unparseable, so a reset with nothing to save simply resets.
export async function archiveRun(userId: string, raw: string): Promise<void> {
  const stats = statsFromState(raw);
  if (!stats) return;
  await db.insert(studyGameRuns).values({
    id: randomUUID(),
    userId,
    attempted: stats.attempted,
    correct: stats.correct,
    bestStep: stats.bestStep,
    createdAt: new Date(),
  });
}

// Build the high-score table: every player's current run plus every banked past
// run, ranked by lifetime accuracy (then correct count). The caller's live row
// is flagged so the client can highlight it. The board is scoped to the caller's
// trading team — a learner is ranked only against teammates (and team-less
// learners against each other), so each team competes on its own board.
export async function getLeaderboard(currentUserId: string): Promise<LeaderboardEntry[]> {
  const [viewerRows, liveRows, runRows] = await Promise.all([
    db.select({ teamId: users.teamId }).from(users).where(eq(users.id, currentUserId)).limit(1),
    db
      .select({ userId: studyGame.userId, name: users.displayName, teamId: users.teamId, state: studyGame.state })
      .from(studyGame)
      .innerJoin(users, eq(users.id, studyGame.userId)),
    db
      .select({
        id: studyGameRuns.id,
        userId: studyGameRuns.userId,
        name: users.displayName,
        teamId: users.teamId,
        attempted: studyGameRuns.attempted,
        correct: studyGameRuns.correct,
        bestStep: studyGameRuns.bestStep,
        createdAt: studyGameRuns.createdAt,
      })
      .from(studyGameRuns)
      .innerJoin(users, eq(users.id, studyGameRuns.userId)),
  ]);

  const viewerTeamId = viewerRows[0]?.teamId ?? null;
  const sameTeam = (teamId: string | null) => (teamId ?? null) === viewerTeamId;

  const entries: LeaderboardEntry[] = [];

  for (const row of liveRows) {
    if (!sameTeam(row.teamId)) continue;
    const stats = statsFromState(row.state);
    if (!stats) continue;
    entries.push({
      id: `live:${row.userId}`,
      userId: row.userId,
      name: row.name,
      score: accuracyOf(stats.correct, stats.attempted),
      attempted: stats.attempted,
      correct: stats.correct,
      bestStep: stats.bestStep,
      sessionScore: accuracyOf(stats.sessionCorrect, stats.sessionAttempted),
      sessionAttempted: stats.sessionAttempted,
      sessionCorrect: stats.sessionCorrect,
      archived: false,
      when: null,
      isMe: row.userId === currentUserId,
    });
  }

  for (const row of runRows) {
    if (!sameTeam(row.teamId)) continue;
    if (row.attempted <= 0) continue;
    entries.push({
      id: `run:${row.id}`,
      userId: row.userId,
      name: row.name,
      score: accuracyOf(row.correct, row.attempted),
      attempted: row.attempted,
      correct: row.correct,
      bestStep: row.bestStep,
      // A banked run has no live session block.
      sessionScore: null,
      sessionAttempted: 0,
      sessionCorrect: 0,
      archived: true,
      when: row.createdAt.getTime(),
      isMe: false,
    });
  }

  // Rank by score first (unplayed/null scores last), then correct count as a
  // tiebreaker so the more practised run edges ahead at equal accuracy.
  entries.sort((a, b) => {
    const sa = a.score ?? -1;
    const sb = b.score ?? -1;
    if (sb !== sa) return sb - sa;
    return b.correct - a.correct;
  });
  return entries;
}
