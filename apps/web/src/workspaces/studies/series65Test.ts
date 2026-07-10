// Rules + builder for the Series 65 mock test: a fixed 100-question exam drawn
// to the real exam's topic blueprint, each question asked exactly once, in a
// random order of mixed difficulty. Separate from the endless Study Game (which
// repeats questions and scores a rolling average) — a test is a one-shot sitting
// meant to mirror a real exam result.

import { SERIES65_QUESTIONS, type Series65Question, type Series65Topic } from './series65Questions';
import { PASS_THRESHOLD } from './series65Game';

export const TEST_PASS = PASS_THRESHOLD; // ~72%, same pass line as the real exam
export const TEST_SIZE = 100;

// How many questions of each topic make up one test. Mirrors the user's real
// Series 65 mix: 25 investments, 30 client management, 30 regulations & ethics,
// 15 economics — 100 total.
export interface TestSlice {
  topic: Series65Topic;
  count: number;
}

export const TEST_BLUEPRINT: TestSlice[] = [
  { topic: 'Investments', count: 25 },
  { topic: 'Client Management', count: 30 },
  { topic: 'Regulations & Ethics', count: 30 },
  { topic: 'Economics', count: 15 },
];

// Fisher–Yates shuffle over a copy of the input.
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Draw one fresh test: random, non-repeating questions per the blueprint, then
// the whole set shuffled together so topics are interleaved (random difficulty
// mix, one appearance each). If a topic's bank is smaller than its quota we take
// all of it — the four Series 65 banks are large enough that this never trims in
// practice, but the guard keeps the builder safe.
export function buildTest(): Series65Question[] {
  const picked: Series65Question[] = [];
  for (const slice of TEST_BLUEPRINT) {
    const pool = SERIES65_QUESTIONS.filter((q) => q.topic === slice.topic);
    picked.push(...shuffle(pool).slice(0, Math.min(slice.count, pool.length)));
  }
  return shuffle(picked);
}

export type Letter = 'A' | 'B' | 'C' | 'D';

export interface TestScore {
  correct: number;
  total: number;
  score: number; // percent, 0..100, one decimal
  passed: boolean;
  breakdown: Record<string, { correct: number; total: number }>;
}

// Grade a completed test given the question list and the learner's answers
// (index-aligned; null = left blank, which counts as wrong).
export function gradeTest(questions: Series65Question[], answers: (Letter | null)[]): TestScore {
  const breakdown: Record<string, { correct: number; total: number }> = {};
  let correct = 0;
  questions.forEach((q, i) => {
    const b = (breakdown[q.topic] ??= { correct: 0, total: 0 });
    b.total += 1;
    if (answers[i] === q.answer) {
      correct += 1;
      b.correct += 1;
    }
  });
  const total = questions.length;
  const score = total ? Math.round((1000 * correct) / total) / 10 : 0;
  return { correct, total, score, passed: score >= TEST_PASS, breakdown };
}

// ---- In-progress persistence ----
// A test in flight is saved to localStorage per user so a refresh or an
// accidental tab switch doesn't wipe a sitting. Only the drawn question ids, the
// answers so far, the current index, and the start time are stored; the full
// question objects are rehydrated from the static bank by id.
export interface TestProgress {
  ids: number[];
  answers: (Letter | null)[];
  index: number;
  startedAt: number;
}

export function testKey(userId: string | undefined): string {
  return `vts_series65_test_${userId ?? 'anon'}`;
}

// Coerce a stored JSON string (from localStorage or the account) into a valid
// TestProgress, or null when it is absent/malformed. Shared by the local and
// server-synced load paths.
export function parseTestProgress(raw: string | null): TestProgress | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (
      !p ||
      !Array.isArray(p.ids) ||
      !Array.isArray(p.answers) ||
      p.ids.length !== TEST_SIZE ||
      p.answers.length !== TEST_SIZE
    ) {
      return null;
    }
    return {
      ids: p.ids.map((n: unknown) => Number(n)),
      answers: p.answers.map((a: unknown) => (a === 'A' || a === 'B' || a === 'C' || a === 'D' ? a : null)),
      index: Math.max(0, Math.min(TEST_SIZE - 1, Number(p.index) || 0)),
      startedAt: Number(p.startedAt) || 0,
    };
  } catch {
    return null;
  }
}

export function loadTestProgress(userId: string | undefined): TestProgress | null {
  try {
    return parseTestProgress(localStorage.getItem(testKey(userId)));
  } catch {
    return null;
  }
}

// Count answered questions in a progress snapshot, used to pick the more
// advanced of a local vs account copy so a resume never loses work.
export function answeredCount(p: TestProgress): number {
  return p.answers.filter((a) => a != null).length;
}

export function saveTestProgress(userId: string | undefined, p: TestProgress): void {
  try {
    localStorage.setItem(testKey(userId), JSON.stringify(p));
  } catch {
    /* ignore storage failures */
  }
}

export function clearTestProgress(userId: string | undefined): void {
  try {
    localStorage.removeItem(testKey(userId));
  } catch {
    /* ignore storage failures */
  }
}

// Rehydrate the drawn questions from stored ids, dropping any id no longer in
// the bank. Returns null if the set can't be fully restored (bank changed), so
// the caller falls back to a fresh test rather than a short one.
export function questionsFromIds(ids: number[]): Series65Question[] | null {
  const byId = new Map(SERIES65_QUESTIONS.map((q) => [q.id, q]));
  const out: Series65Question[] = [];
  for (const id of ids) {
    const q = byId.get(id);
    if (!q) return null;
    out.push(q);
  }
  return out.length === ids.length ? out : null;
}
