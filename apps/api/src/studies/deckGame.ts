import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { studyDeckGame, studyDeckRuns, users } from '../db/schema.js';
import { accuracyOf, statsFromState } from './gameStats.js';
import type { LeaderboardEntry } from './game.js';

// Per-user, per-deck Study Game state for team decks — the exact same opaque
// per-game state blob, keyed by (userId, deckId). The
// leaderboard mirrors game.ts's, filtered to one deck; everyone who has played a
// deck is a teammate by construction (the deck is team-scoped), so ranking by
// deck already ranks within the team.

export async function getDeckGame(userId: string, deckId: string): Promise<string | null> {
  const rows = await db
    .select({ state: studyDeckGame.state })
    .from(studyDeckGame)
    .where(and(eq(studyDeckGame.userId, userId), eq(studyDeckGame.deckId, deckId)))
    .limit(1);
  return rows[0]?.state ?? null;
}

export async function saveDeckGame(userId: string, deckId: string, state: string): Promise<void> {
  await db
    .insert(studyDeckGame)
    .values({ userId, deckId, state, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [studyDeckGame.userId, studyDeckGame.deckId],
      set: { state, updatedAt: new Date() },
    });
}

// Bank a deck run to its leaderboard (called when the learner resets a deck's
// progress). No-op on an empty/unparseable run.
export async function archiveDeckRun(userId: string, deckId: string, raw: string): Promise<void> {
  const stats = statsFromState(raw);
  if (!stats) return;
  await db.insert(studyDeckRuns).values({
    id: randomUUID(),
    userId,
    deckId,
    attempted: stats.attempted,
    correct: stats.correct,
    bestStep: stats.bestStep,
    createdAt: new Date(),
  });
}

// Delete one of the CALLER'S OWN leaderboard entries for a deck. `entryId` is the
// composite id the leaderboard uses:
//   • "run:<runId>"   — a banked past run; deletes that run row.
//   • "live:<userId>" — the caller's current run; clears their live state (a
//                       fresh run is created next time they answer a question).
// Ownership is enforced in the WHERE clause / by comparing the id, so a user can
// only ever remove their own posts. Unknown ids are a no-op. Returns true when a
// row was removed.
export async function deleteDeckLeaderboardEntry(
  userId: string,
  deckId: string,
  entryId: string,
): Promise<boolean> {
  if (entryId.startsWith('run:')) {
    const runId = entryId.slice('run:'.length);
    if (!runId) return false;
    const res = await db
      .delete(studyDeckRuns)
      .where(
        and(
          eq(studyDeckRuns.id, runId),
          eq(studyDeckRuns.userId, userId),
          eq(studyDeckRuns.deckId, deckId),
        ),
      );
    return (res.rowsAffected ?? 0) > 0;
  }
  if (entryId.startsWith('live:')) {
    // Only the owner may clear their own live run.
    if (entryId.slice('live:'.length) !== userId) return false;
    const res = await db
      .delete(studyDeckGame)
      .where(and(eq(studyDeckGame.userId, userId), eq(studyDeckGame.deckId, deckId)));
    return (res.rowsAffected ?? 0) > 0;
  }
  return false;
}

// The high-score table for one deck: every player's current run plus every
// banked past run, ranked by lifetime accuracy then correct count. The caller's
// live row is flagged so the client can highlight it.
export async function getDeckLeaderboard(
  deckId: string,
  currentUserId: string,
): Promise<LeaderboardEntry[]> {
  const [liveRows, runRows] = await Promise.all([
    db
      .select({ userId: studyDeckGame.userId, name: users.displayName, state: studyDeckGame.state })
      .from(studyDeckGame)
      .innerJoin(users, eq(users.id, studyDeckGame.userId))
      .where(eq(studyDeckGame.deckId, deckId)),
    db
      .select({
        id: studyDeckRuns.id,
        userId: studyDeckRuns.userId,
        name: users.displayName,
        attempted: studyDeckRuns.attempted,
        correct: studyDeckRuns.correct,
        bestStep: studyDeckRuns.bestStep,
        createdAt: studyDeckRuns.createdAt,
      })
      .from(studyDeckRuns)
      .innerJoin(users, eq(users.id, studyDeckRuns.userId))
      .where(eq(studyDeckRuns.deckId, deckId)),
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
      sessionScore: accuracyOf(stats.sessionCorrect, stats.sessionAttempted),
      sessionAttempted: stats.sessionAttempted,
      sessionCorrect: stats.sessionCorrect,
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
      sessionScore: null,
      sessionAttempted: 0,
      sessionCorrect: 0,
      archived: true,
      when: row.createdAt.getTime(),
      isMe: false,
    });
  }

  entries.sort((a, b) => {
    const sa = a.score ?? -1;
    const sb = b.score ?? -1;
    if (sb !== sa) return sb - sa;
    return b.correct - a.correct;
  });
  return entries;
}
