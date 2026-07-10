import crypto from 'node:crypto';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { studyTests, users } from '../db/schema.js';

// Per-user completed Series 65 mock tests. Each finished 100-question exam is
// recorded with its final score and the learner's attempt number (their Nth
// completed test), so the test leaderboard can show a player's best run and at
// which attempt they earned it. Mirrors the vocab / starred / sections services.

export const TEST_PASS = 72; // Series 65 passing score (~72%)

// Per-topic correct/total, keyed by the four Series 65 topics.
export type TestBreakdown = Record<string, { correct: number; total: number }>;

export interface TestResultInput {
  score: number; // percent correct, 0..100
  correct: number;
  total: number;
  breakdown: TestBreakdown;
  passed: boolean;
  durationMs: number | null;
}

export interface TestResult {
  id: string;
  attempt: number;
  score: number;
  correct: number;
  total: number;
  breakdown: TestBreakdown;
  passed: boolean;
  durationMs: number | null;
  createdAt: number;
}

// One player's best test on the leaderboard, tagged with the attempt at which
// they scored it and their total attempts so far.
export interface TestLeaderboardEntry {
  userId: string;
  name: string;
  score: number;
  correct: number;
  total: number;
  attempt: number; // the attempt number that produced this best score
  attempts: number; // how many tests this player has finished
  passed: boolean;
  createdAt: number;
  isMe: boolean;
}

function parseBreakdown(raw: string): TestBreakdown {
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return {};
    const out: TestBreakdown = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const c = (v as { correct?: unknown })?.correct;
      const t = (v as { total?: unknown })?.total;
      if (Number.isFinite(Number(c)) && Number.isFinite(Number(t))) {
        out[k] = { correct: Number(c), total: Number(t) };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function rowToResult(r: typeof studyTests.$inferSelect): TestResult {
  return {
    id: r.id,
    attempt: r.attempt,
    score: r.score,
    correct: r.correct,
    total: r.total,
    breakdown: parseBreakdown(r.breakdown),
    passed: r.passed,
    durationMs: r.durationMs ?? null,
    createdAt: r.createdAt.getTime(),
  };
}

// Record a finished test. The attempt number is derived server-side as the
// count of the user's existing tests + 1, so it can't be spoofed or race the
// client's own bookkeeping.
export async function recordTest(userId: string, input: TestResultInput): Promise<TestResult> {
  const prior = await db
    .select({ n: sql<number>`count(*)` })
    .from(studyTests)
    .where(eq(studyTests.userId, userId));
  const attempt = (Number(prior[0]?.n) || 0) + 1;

  const row = {
    id: crypto.randomUUID(),
    userId,
    attempt,
    score: Math.max(0, Math.min(100, Math.round(input.score))),
    correct: Math.max(0, Math.round(input.correct)),
    total: Math.max(0, Math.round(input.total)),
    breakdown: JSON.stringify(input.breakdown ?? {}),
    passed: input.passed,
    durationMs: input.durationMs == null ? null : Math.max(0, Math.round(input.durationMs)),
    createdAt: new Date(),
  };
  await db.insert(studyTests).values(row);
  return rowToResult(row);
}

// The caller's own test history, newest first.
export async function listMyTests(userId: string): Promise<TestResult[]> {
  const rows = await db
    .select()
    .from(studyTests)
    .where(eq(studyTests.userId, userId))
    .orderBy(desc(studyTests.createdAt));
  return rows.map(rowToResult);
}

// The test high-score table: every player's single best test, ranked by score.
// Ties break toward the earlier attempt (fewer tries to reach it), then the
// earlier date. Each row carries the attempt number that produced the score and
// the player's total attempts.
export async function getTestLeaderboard(
  currentUserId: string,
): Promise<TestLeaderboardEntry[]> {
  const rows = await db
    .select({
      userId: studyTests.userId,
      name: users.displayName,
      attempt: studyTests.attempt,
      score: studyTests.score,
      correct: studyTests.correct,
      total: studyTests.total,
      passed: studyTests.passed,
      createdAt: studyTests.createdAt,
    })
    .from(studyTests)
    .innerJoin(users, eq(users.id, studyTests.userId));

  // Fold every player's rows into their best single result plus a total count.
  const best = new Map<string, TestLeaderboardEntry>();
  const counts = new Map<string, number>();
  for (const r of rows) {
    counts.set(r.userId, (counts.get(r.userId) ?? 0) + 1);
    const created = r.createdAt.getTime();
    const prev = best.get(r.userId);
    const better =
      !prev ||
      r.score > prev.score ||
      (r.score === prev.score && r.attempt < prev.attempt) ||
      (r.score === prev.score && r.attempt === prev.attempt && created < prev.createdAt);
    if (better) {
      best.set(r.userId, {
        userId: r.userId,
        name: r.name,
        score: r.score,
        correct: r.correct,
        total: r.total,
        attempt: r.attempt,
        attempts: 0, // filled in below
        passed: r.passed,
        createdAt: created,
        isMe: r.userId === currentUserId,
      });
    }
  }

  const entries = [...best.values()].map((e) => ({ ...e, attempts: counts.get(e.userId) ?? 1 }));
  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.attempt !== b.attempt) return a.attempt - b.attempt;
    return a.createdAt - b.createdAt;
  });
  return entries;
}
