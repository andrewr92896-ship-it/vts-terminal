import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { studyDeckGame, studyDeckRuns, studyDecks, users } from '../db/schema.js';
import { accuracyOf, statsFromState } from './gameStats.js';
import { BAKED_IN_SOURCE, isBakedInSource } from './bakedGames.js';
import type { LeaderboardEntry } from './game.js';

// Per-user, per-deck Study Game state — the opaque per-game state blob, keyed by
// (userId, deckId).
//
// The LEADERBOARD is a different shape since 2026-08 (owner decision). It used
// to rank one deck id, which was implicitly a team board because a deck belonged
// to a team. Now:
//   • The terminal's BUILT-IN games have a PUBLIC board spanning the whole
//     install — see leaderboardDeckIds for why that means ranking across every
//     copy of the game rather than one id.
//   • User-made games have NO board at all. The route refuses them.

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

/**
 * Which deck ids a leaderboard for `deckId` should rank across.
 *
 * THIS IS THE WHOLE DESIGN OF THE PUBLIC LEADERBOARD, and it exists because a
 * built-in game is not one deck. The terminal's example games are seeded into
 * every scope separately (see bakedGames.ts), so a copy of "Market Terminology
 * 101" exists per user and per team, each with its own id. Ranking on one id
 * would rank a person against nobody.
 *
 * So a built-in game resolves to EVERY copy of itself, matched on the name that
 * identifies it in code, and the board spans the whole install. A user-made deck
 * resolves to nothing — see the route: custom games have no leaderboard at all
 * for now (owner decision, 2026-08).
 */
export async function leaderboardDeckIds(deckId: string): Promise<string[]> {
  const deck = (
    await db
      .select({ name: studyDecks.name, source: studyDecks.source })
      .from(studyDecks)
      .where(eq(studyDecks.id, deckId))
      .limit(1)
  )[0];
  if (!deck || !isBakedInSource(deck.source)) return [];
  const copies = await db
    .select({ id: studyDecks.id })
    .from(studyDecks)
    .where(and(eq(studyDecks.name, deck.name), eq(studyDecks.source, BAKED_IN_SOURCE)));
  return copies.map((c) => c.id);
}

// The high-score table for a built-in study game: every player's current run
// plus every banked past run, across EVERY copy of that game on the install,
// ranked by lifetime accuracy then correct count. The caller's live row is
// flagged so the client can highlight it.
//
// Two people can appear with the same display name only if two accounts hold
// one, which migration 0102 made impossible.
//
// Anyone with `hideFromLeaderboards` is filtered out — except the caller, who
// always sees their own row. Opting out means other people cannot find you on
// the board, not that you lose your own standing.
export async function getDeckLeaderboard(
  deckId: string,
  currentUserId: string,
): Promise<LeaderboardEntry[]> {
  const deckIds = await leaderboardDeckIds(deckId);
  if (deckIds.length === 0) return [];

  const [liveRows, runRows] = await Promise.all([
    db
      .select({
        userId: studyDeckGame.userId,
        name: users.displayName,
        hidden: users.hideFromLeaderboards,
        state: studyDeckGame.state,
      })
      .from(studyDeckGame)
      .innerJoin(users, eq(users.id, studyDeckGame.userId))
      .where(inArray(studyDeckGame.deckId, deckIds)),
    db
      .select({
        id: studyDeckRuns.id,
        userId: studyDeckRuns.userId,
        name: users.displayName,
        hidden: users.hideFromLeaderboards,
        attempted: studyDeckRuns.attempted,
        correct: studyDeckRuns.correct,
        bestStep: studyDeckRuns.bestStep,
        createdAt: studyDeckRuns.createdAt,
      })
      .from(studyDeckRuns)
      .innerJoin(users, eq(users.id, studyDeckRuns.userId))
      .where(inArray(studyDeckRuns.deckId, deckIds)),
  ]);

  const entries: LeaderboardEntry[] = [];

  for (const row of liveRows) {
    if (row.hidden && row.userId !== currentUserId) continue;
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
    // A banked run is somebody's past attempt; `isMe` is always false on these,
    // so an opted-out player's history goes even for themselves. Their live row
    // above is the one that carries their standing.
    if (row.hidden) continue;
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
