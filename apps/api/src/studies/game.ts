import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { studyGame, users } from '../db/schema.js';

// Per-user Study Game state, stored as an opaque JSON string. The shape is owned
// by the web client (see series65Game.ts); the server only persists and returns
// it verbatim, so progress follows the learner across devices.

const MAX_STATE_BYTES = 64 * 1024; // generous ceiling for the serialized state

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
// few headline numbers needed to rank players are simple enough to read here
// without pulling in the whole client model. Keep these two constants in step
// with that file: the score window and the per-category prestige interval.
const SCORE_WINDOW = 100; // leaderboard score is accuracy over the last 100 answers
const PRESTIGE_AT = 135; // questions answered in a category before a crown

export interface LeaderboardEntry {
  userId: string;
  name: string;
  score: number | null; // accuracy % over the last SCORE_WINDOW answers
  attempted: number; // lifetime questions answered
  correct: number; // lifetime correct answers
  accuracy: number | null; // lifetime correct / attempted, as a %
  crowns: number; // total prestige crowns across all categories
  isMe: boolean;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Pull the ranking numbers out of one stored state blob. Returns null when the
// state is unparseable or the player has not answered anything yet, so empty
// and broken rows simply drop off the board.
function statsFromState(raw: string): Omit<LeaderboardEntry, 'userId' | 'name' | 'isMe'> | null {
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

  const recent = Array.isArray(g.recent)
    ? (g.recent as unknown[]).filter((x) => typeof x === 'boolean').slice(-SCORE_WINDOW)
    : [];
  const score = recent.length ? round1((100 * recent.filter(Boolean).length) / recent.length) : null;

  let crowns = 0;
  const cats = (g.cats ?? {}) as Record<string, { answered?: unknown }>;
  for (const c of Object.values(cats)) {
    const answered = Number(c?.answered) || 0;
    if (answered > 0) crowns += Math.floor(answered / PRESTIGE_AT);
  }

  return { score, attempted, correct, accuracy: round1((100 * correct) / attempted), crowns };
}

// Build the high-score table: every player who has answered at least one
// question, ranked by current score (then lifetime correct). The caller's row
// is flagged so the client can highlight it.
export async function getLeaderboard(currentUserId: string): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select({ userId: studyGame.userId, name: users.displayName, state: studyGame.state })
    .from(studyGame)
    .innerJoin(users, eq(users.id, studyGame.userId));

  const entries: LeaderboardEntry[] = [];
  for (const row of rows) {
    const stats = statsFromState(row.state);
    if (!stats) continue;
    entries.push({ userId: row.userId, name: row.name, isMe: row.userId === currentUserId, ...stats });
  }

  // Rank by score first (unplayed/null scores last), then lifetime correct as a
  // tiebreaker so the more practised player edges ahead at equal accuracy.
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
