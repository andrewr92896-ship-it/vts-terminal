// Per-game state for team-authored study decks. It uses the shared, topic-
// agnostic level ladder, streak multiplier, and session/lifetime scoring from
// gameEngine, with per-category bookkeeping keyed by the deck's own category
// names. The stored blob's headline fields match what the server leaderboard
// reads (gameStats.ts).

import {
  WINDOW,
  round1,
  scorePct,
  streakMultiplier,
  stepForCorrect,
  type CatState,
  type SessionScore,
} from './gameEngine';

export interface DeckGameState {
  recent: boolean[]; // last WINDOW outcomes overall
  totalAttempted: number;
  totalCorrect: number;
  levelCorrect: number; // correct answers counting toward the level (streak-scaled)
  bestStep: number; // highest level step reached this run (0..59)
  allTimeBestStep: number; // highest ever — survives a reset
  streak: number;
  bestStreak: number;
  cats: Record<string, CatState>; // keyed by the deck's category names
}

export function emptyDeckGame(categories: string[]): DeckGameState {
  const cats: Record<string, CatState> = {};
  for (const c of categories) cats[c] = { answered: 0, correct: 0, recent: [] };
  return {
    recent: [],
    totalAttempted: 0,
    totalCorrect: 0,
    levelCorrect: 0,
    bestStep: 0,
    allTimeBestStep: 0,
    streak: 0,
    bestStreak: 0,
    cats,
  };
}

// localStorage key for a deck's per-user state.
export function deckGameKey(userId: string | undefined, deckId: string): string {
  return `vts_deck_game_${userId ?? 'anon'}_${deckId}`;
}

// Lifetime accuracy: correct / attempted across the whole run. Mirrors
// lifetimeAccuracy() in gameEngine.
export function deckLifetimeAccuracy(g: DeckGameState): number | null {
  return g.totalAttempted > 0 ? round1((100 * g.totalCorrect) / g.totalAttempted) : null;
}

// Current fixed block score (up to WINDOW answers, resetting every WINDOW).
// Mirrors the session-score math in gameEngine.
export function deckSessionScore(g: DeckGameState): SessionScore | null {
  const total = Math.max(0, Math.floor(g.totalAttempted) || 0);
  if (total <= 0) return null;
  const rem = total % WINDOW;
  const blockLen = rem === 0 ? WINDOW : rem;
  const tail = g.recent.slice(-blockLen);
  const attempted = tail.length;
  if (attempted === 0) return null;
  const correct = tail.filter(Boolean).length;
  const index = Math.floor((total - 1) / WINDOW);
  return {
    attempted,
    correct,
    pct: round1((100 * correct) / attempted),
    index,
    start: index * WINDOW + 1,
    end: index * WINDOW + WINDOW,
  };
}

// Record one answer, returning a new immutable state. Mirrors recordAnswer() in
// gameEngine (same streak-scaled level math), but keyed by a deck category.
export function recordDeckAnswer(g: DeckGameState, category: string, correct: boolean): DeckGameState {
  const cat = g.cats[category] ?? { answered: 0, correct: 0, recent: [] };
  const totalCorrect = g.totalCorrect + (correct ? 1 : 0);
  const streak = correct ? g.streak + 1 : 0;
  const gain = correct ? streakMultiplier(streak) : 0;
  const levelCorrect = g.levelCorrect + gain;
  const bestStep = Math.max(g.bestStep, stepForCorrect(levelCorrect));
  return {
    recent: [...g.recent, correct].slice(-WINDOW),
    totalAttempted: g.totalAttempted + 1,
    totalCorrect,
    levelCorrect,
    bestStep,
    allTimeBestStep: Math.max(g.allTimeBestStep, bestStep),
    streak,
    bestStreak: Math.max(g.bestStreak, streak),
    cats: {
      ...g.cats,
      [category]: {
        answered: cat.answered + 1,
        correct: cat.correct + (correct ? 1 : 0),
        recent: [...cat.recent, correct].slice(-WINDOW),
      },
    },
  };
}

// Coerce an arbitrary parsed object into a valid DeckGameState, dropping anything
// malformed and seeding the deck's categories. Mirrors normalizeGame().
export function normalizeDeckGame(p: unknown, categories: string[]): DeckGameState {
  const fresh = emptyDeckGame(categories);
  if (!p || typeof p !== 'object') return fresh;
  const src = p as Record<string, unknown>;
  const totalCorrect = Number(src.totalCorrect) || 0;
  const levelCorrect = Math.max(Number(src.levelCorrect) || 0, totalCorrect);
  const floorStep = stepForCorrect(levelCorrect);
  const bestStep = Math.max(Number(src.bestStep) || 0, floorStep);
  const g: DeckGameState = {
    recent: Array.isArray(src.recent)
      ? src.recent.filter((x: unknown) => typeof x === 'boolean').slice(-WINDOW)
      : [],
    totalAttempted: Number(src.totalAttempted) || 0,
    totalCorrect,
    levelCorrect,
    bestStep,
    allTimeBestStep: Math.max(Number(src.allTimeBestStep) || 0, bestStep),
    streak: Math.max(0, Math.floor(Number(src.streak) || 0)),
    bestStreak: Math.max(0, Math.floor(Number(src.bestStreak) || 0), Math.floor(Number(src.streak) || 0)),
    cats: fresh.cats,
  };
  const cats = (src.cats ?? {}) as Record<string, { answered?: unknown; correct?: unknown; recent?: unknown }>;
  for (const c of categories) {
    const cs = cats[c];
    if (cs) {
      g.cats[c] = {
        answered: Number(cs.answered) || 0,
        correct: Number(cs.correct) || 0,
        recent: Array.isArray(cs.recent)
          ? cs.recent.filter((x: unknown) => typeof x === 'boolean').slice(-WINDOW)
          : [],
      };
    }
  }
  return g;
}

export function parseDeckGame(raw: string | null, categories: string[]): DeckGameState | null {
  if (!raw) return null;
  try {
    return normalizeDeckGame(JSON.parse(raw), categories);
  } catch {
    return null;
  }
}

export { scorePct };
