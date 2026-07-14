import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { studyGame, studyGameRuns, users } from '../db/schema.js';

// Per-user Study Game state, stored as an opaque JSON string. The shape is owned
// by the web client (see series65Game.ts); the server only persists and returns
// it verbatim, so progress follows the learner across devices.

const MAX_STATE_BYTES = 64 * 1024; // generous ceiling for the serialized state

// Level ladder shape, kept in step with the web client (series65Game.ts): 12
// levels × 5 sub-levels, one sub-level per 10 correct answers. Used to derive a
// run's "best level reached" step (0..59) when the stored state predates it.
const CORRECT_PER_SUBLEVEL = 10;
const MAX_LEVEL_STEP = 12 * 5 - 1; // 59

function stepForCorrect(correct: number): number {
  return Math.min(MAX_LEVEL_STEP, Math.floor(Math.max(0, correct) / CORRECT_PER_SUBLEVEL));
}

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
// The Study Game state is owned by the web client (series65Game.ts), but the
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
  archived: boolean; // true for a banked (reset) run
  when: number | null; // when the run was banked (ms); null for live rows
  isMe: boolean; // the caller's current live row
}

// The headline numbers of one run, read from either a stored state blob or a
// banked run row.
interface RunStats {
  attempted: number;
  correct: number;
  bestStep: number;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function accuracyOf(correct: number, attempted: number): number | null {
  return attempted > 0 ? round1((100 * correct) / attempted) : null;
}

// Pull the ranking numbers out of one stored state blob. Returns null when the
// state is unparseable or the player has not answered anything yet, so empty
// and broken rows simply drop off the board.
function statsFromState(raw: string): RunStats | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const g = parsed as Record<string, unknown>;

  const attempted = Number(g.totalAttempted) || 0;
  const correct = Number(g.totalCorrect) || 0;
  if (attempted <= 0) return null;

  // Best level reached: honour the stored high-water mark, but never below what
  // the correct-answer count already implies (older saves predate the field).
  const bestStep = Math.max(Number(g.bestStep) || 0, stepForCorrect(correct));

  return { attempted, correct, bestStep };
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
// is flagged so the client can highlight it.
export async function getLeaderboard(currentUserId: string): Promise<LeaderboardEntry[]> {
  const [liveRows, runRows] = await Promise.all([
    db
      .select({ userId: studyGame.userId, name: users.displayName, state: studyGame.state })
      .from(studyGame)
      .innerJoin(users, eq(users.id, studyGame.userId)),
    db
      .select({
        id: studyGameRuns.id,
        userId: studyGameRuns.userId,
        name: users.displayName,
        attempted: studyGameRuns.attempted,
        correct: studyGameRuns.correct,
        bestStep: studyGameRuns.bestStep,
        createdAt: studyGameRuns.createdAt,
      })
      .from(studyGameRuns)
      .innerJoin(users, eq(users.id, studyGameRuns.userId)),
  ]);

  const entries: LeaderboardEntry[] = [];

  for (const row of liveRows) {
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
      archived: false,
      when: null,
      isMe: row.userId === currentUserId,
    });
  }

  for (const row of runRows) {
    if (row.attempted <= 0) continue;
    entries.push({
      id: `run:${row.id}`,
      userId: row.userId,
      name: row.name,
      score: accuracyOf(row.correct, row.attempted),
      attempted: row.attempted,
      correct: row.correct,
      bestStep: row.bestStep,
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

// Validate that the body is a JSON string within our size ceiling. Returns the
// canonical string to store, or null if it is unusable.
export function normalizeState(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length === 0 || raw.length > MAX_STATE_BYTES) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return raw;
  } catch {
    return null;
  }
}
