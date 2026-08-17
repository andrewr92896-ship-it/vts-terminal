// A practice test that is part-way through, kept per user and per deck in
// localStorage so leaving the screen does not throw the sitting away. Returning
// to the intro offers to carry on where it was left; nothing resumes on its own.
//
// A test is a graded paper, so what is stored has to be enough to make the
// resumed sitting the SAME paper: the questions that were drawn and in what
// order, every answer given so far, and the terms it was sat under (pass line,
// feedback, and whether it was drawn to the category blueprint). Restoring the
// answers against a different set of questions would quietly rescore a test the
// learner already sat half of — which is why `restoreQuestions` below refuses
// the whole thing rather than resolving what it can.
//
// Personal, device-local view state, like studySession — it never touches team
// data, scoring or the leaderboard.

import type { DeckQuestion } from '../../api/types';
import type { DrawAllocation } from './examWeights';

export type Letter = 'A' | 'B' | 'C' | 'D';

// Bumped when the shape below changes in a way that would make an older stored
// sitting mean something different. A mismatch DISCARDS rather than repairs:
// half-understood answers replayed into a changed paper produce a score nobody
// sat for.
const SCHEMA = 1;

export interface TestSessionState {
  v: number;
  // The drawn paper, in order, by each question's stable `seq`.
  seqs: number[];
  answers: (Letter | null)[];
  index: number;
  selected: Letter | null;
  revealed: boolean;
  // The terms of the sitting. Kept with it because the intro screen's controls
  // can be moved afterwards, and the resumed test must be graded on what it was
  // started under.
  passLine: number;
  feedback: boolean;
  weighted: boolean;
  allocations: DrawAllocation[];
  savedAt: number;
}

export function testSessionKey(userId: string | undefined, deckId: string): string {
  return `vts_deck_test_${userId ?? 'anon'}_${deckId}`;
}

function isLetter(x: unknown): x is Letter {
  return x === 'A' || x === 'B' || x === 'C' || x === 'D';
}

function normalizeAllocations(p: unknown): DrawAllocation[] {
  if (!Array.isArray(p)) return [];
  return p.flatMap((a) => {
    if (!a || typeof a !== 'object') return [];
    const src = a as Record<string, unknown>;
    if (typeof src.name !== 'string') return [];
    return [
      {
        name: src.name,
        wanted: Number(src.wanted) || 0,
        drawn: Number(src.drawn) || 0,
      },
    ];
  });
}

function normalize(p: unknown): TestSessionState | null {
  if (!p || typeof p !== 'object') return null;
  const src = p as Record<string, unknown>;
  if (src.v !== SCHEMA) return null;
  if (!Array.isArray(src.seqs) || src.seqs.length === 0) return null;
  const seqs = src.seqs.filter((s): s is number => typeof s === 'number');
  if (seqs.length !== src.seqs.length) return null;

  // The answers array is indexed against the paper, so it is padded or trimmed
  // to match rather than trusted — a shorter one read straight would shift every
  // answer after the gap onto the wrong question.
  const rawAnswers = Array.isArray(src.answers) ? src.answers : [];
  const answers: (Letter | null)[] = seqs.map((_, i) => (isLetter(rawAnswers[i]) ? rawAnswers[i] : null));

  const index = typeof src.index === 'number' ? Math.max(0, Math.min(seqs.length - 1, Math.floor(src.index))) : 0;

  return {
    v: SCHEMA,
    seqs,
    answers,
    index,
    selected: isLetter(src.selected) ? src.selected : null,
    revealed: src.revealed === true,
    passLine: typeof src.passLine === 'number' ? src.passLine : 72,
    feedback: src.feedback === true,
    weighted: src.weighted === true,
    allocations: normalizeAllocations(src.allocations),
    savedAt: typeof src.savedAt === 'number' ? src.savedAt : 0,
  };
}

export function loadTestSession(userId: string | undefined, deckId: string): TestSessionState | null {
  try {
    const raw = localStorage.getItem(testSessionKey(userId, deckId));
    if (!raw) return null;
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveTestSession(userId: string | undefined, deckId: string, state: Omit<TestSessionState, 'v' | 'savedAt'>): void {
  try {
    localStorage.setItem(
      testSessionKey(userId, deckId),
      JSON.stringify({ ...state, v: SCHEMA, savedAt: Date.now() }),
    );
  } catch {
    /* ignore quota / disabled storage */
  }
}

export function clearTestSession(userId: string | undefined, deckId: string): void {
  try {
    localStorage.removeItem(testSessionKey(userId, deckId));
  } catch {
    /* ignore */
  }
}

// Resolve a saved paper against the deck as it stands now.
//
// **All or nothing, deliberately.** A question can be edited away or deleted by
// the game's author while somebody is part-way through a sitting; resolving the
// ones that survive would silently shorten the paper, move every later answer
// onto a different question, and change the denominator the score is out of. A
// test that cannot be restored exactly is not the test that was started, so this
// returns null and the sitting is dropped.
export function restoreQuestions(seqs: number[], deck: { questions: DeckQuestion[] }): DeckQuestion[] | null {
  const bySeq = new Map(deck.questions.map((q) => [q.seq, q]));
  const out: DeckQuestion[] = [];
  for (const s of seqs) {
    const q = bySeq.get(s);
    if (!q) return null;
    out.push(q);
  }
  return out;
}
