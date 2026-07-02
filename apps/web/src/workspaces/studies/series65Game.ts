// State + rules for the gamified Series 65 Study Game: per-category levels and
// prestige, exam-weighted question mix, and last-100 accuracy scoring. Persisted
// per user in localStorage.

import { SERIES65_QUESTIONS, SERIES65_TOPICS, type Series65Topic } from './series65Questions';

export const PASS_THRESHOLD = 72; // Series 65 passing score (~72%)
export const WINDOW = 100; // score is accuracy over the last 100 answers

// Official NASAA Series 65 content areas and their exam weightings, mapped to
// our four topics. Used to weight the question mix and shown in the HUD.
export interface CategoryMeta {
  topic: Series65Topic;
  official: string;
  weight: number; // exam percentage
}

export const CATEGORY_META: CategoryMeta[] = [
  { topic: 'Economics', official: 'Economic Factors & Business Information', weight: 15 },
  { topic: 'Investments', official: 'Investment Vehicle Characteristics', weight: 25 },
  { topic: 'Client Management', official: 'Client Recommendations & Strategies', weight: 30 },
  { topic: 'Regulations & Ethics', official: 'Laws, Regulations & Ethics', weight: 30 },
];

export function metaFor(topic: Series65Topic): CategoryMeta {
  return CATEGORY_META.find((c) => c.topic === topic)!;
}

// The universal level ladder. `at` is the count of questions answered (in a
// category) at which the level is reached.
export interface LevelDef {
  icon: string;
  name: string;
  at: number;
}

// Every level is reached 15 questions after the previous one, so each level-up
// costs a consistent 15 answered questions in the category.
export const LEVEL_STEP = 15;

export const LEVELS: LevelDef[] = [
  { icon: '🌱', name: 'Novice', at: 0 },
  { icon: '📖', name: 'Student', at: 15 },
  { icon: '✏️', name: 'Apprentice', at: 30 },
  { icon: '🧠', name: 'Adept', at: 45 },
  { icon: '🔬', name: 'Specialist', at: 60 },
  { icon: '🎓', name: 'Scholar', at: 75 },
  { icon: '🏅', name: 'Expert', at: 90 },
  { icon: '⭐', name: 'Master', at: 105 },
  { icon: '👑', name: 'Grandmaster', at: 120 },
];

// Reaching Grandmaster (120) holds for one more 15-question band, then the
// category prestiges: a crown is added and the ladder restarts at Novice.
export const PRESTIGE_AT = 135;

export interface LevelInfo {
  prestige: number; // crowns earned (completed cycles)
  index: number; // 0..8 within the current cycle
  level: LevelDef;
  within: number; // answers into the current cycle
  isMax: boolean; // at Grandmaster
  nextAt: number; // answers-in-cycle for the next milestone (or PRESTIGE_AT)
  toNext: number; // answers remaining to that milestone
  nextLabel: string; // what the next milestone is
}

export function levelInfo(answered: number): LevelInfo {
  const prestige = Math.floor(answered / PRESTIGE_AT);
  const within = answered - prestige * PRESTIGE_AT;
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) if (within >= LEVELS[i].at) index = i;
  const isMax = index === LEVELS.length - 1;
  const nextAt = isMax ? PRESTIGE_AT : LEVELS[index + 1].at;
  const nextLabel = isMax
    ? `Prestige 👑${'👑'.repeat(prestige)}`
    : `${LEVELS[index + 1].icon} ${LEVELS[index + 1].name}`;
  return { prestige, index, level: LEVELS[index], within, isMax, nextAt, toNext: nextAt - within, nextLabel };
}

export interface CatState {
  answered: number;
  correct: number;
  recent: boolean[]; // last WINDOW outcomes in this category
}

export interface GameState {
  recent: boolean[]; // last WINDOW outcomes overall
  totalAttempted: number;
  totalCorrect: number;
  cats: Record<Series65Topic, CatState>;
}

export function emptyGame(): GameState {
  const cats = {} as Record<Series65Topic, CatState>;
  for (const t of SERIES65_TOPICS) cats[t] = { answered: 0, correct: 0, recent: [] };
  return { recent: [], totalAttempted: 0, totalCorrect: 0, cats };
}

export function gameKey(userId: string | undefined): string {
  return `vts_series65_game_${userId ?? 'anon'}`;
}

// Per-user set of starred question ids (kept in localStorage for instant load
// and offline use; also synced to the account so it follows the learner).
export function starredKey(userId: string | undefined): string {
  return `vts_series65_starred_${userId ?? 'anon'}`;
}

export function loadStarred(userId: string | undefined): Set<number> {
  try {
    const raw = localStorage.getItem(starredKey(userId));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr)
      ? new Set(arr.filter((x: unknown): x is number => typeof x === 'number' && Number.isInteger(x)))
      : new Set();
  } catch {
    return new Set();
  }
}

export function saveStarred(userId: string | undefined, ids: Set<number>): void {
  try {
    localStorage.setItem(starredKey(userId), JSON.stringify([...ids]));
  } catch {
    /* ignore storage failures */
  }
}

// Coerce an arbitrary parsed object into a valid GameState, dropping anything
// malformed. Shared by the localStorage and server-synced load paths.
export function normalizeGame(p: unknown): GameState {
  const fresh = emptyGame();
  if (!p || typeof p !== 'object') return fresh;
  const src = p as Record<string, unknown>;
  const g: GameState = {
    recent: Array.isArray(src.recent) ? src.recent.filter((x: unknown) => typeof x === 'boolean').slice(-WINDOW) : [],
    totalAttempted: Number(src.totalAttempted) || 0,
    totalCorrect: Number(src.totalCorrect) || 0,
    cats: fresh.cats,
  };
  const cats = (src.cats ?? {}) as Record<string, { answered?: unknown; correct?: unknown; recent?: unknown }>;
  for (const t of SERIES65_TOPICS) {
    const c = cats[t];
    if (c) {
      g.cats[t] = {
        answered: Number(c.answered) || 0,
        correct: Number(c.correct) || 0,
        recent: Array.isArray(c.recent) ? c.recent.filter((x: unknown) => typeof x === 'boolean').slice(-WINDOW) : [],
      };
    }
  }
  return g;
}

// Parse a stored JSON string (from localStorage or the server) into a GameState,
// returning null when it is absent or unparseable so callers can fall back.
export function parseGame(raw: string | null): GameState | null {
  if (!raw) return null;
  try {
    return normalizeGame(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function loadGame(key: string): GameState {
  try {
    return parseGame(localStorage.getItem(key)) ?? emptyGame();
  } catch {
    return emptyGame();
  }
}

export function saveGame(key: string, g: GameState): void {
  try {
    localStorage.setItem(key, JSON.stringify(g));
  } catch {
    /* ignore storage failures */
  }
}

// Record one answer, returning a new state (the previous is left untouched so
// callers can diff scores/levels for the "score change" and level-up display).
export function recordAnswer(g: GameState, topic: Series65Topic, correct: boolean): GameState {
  const cat = g.cats[topic];
  const next: GameState = {
    recent: [...g.recent, correct].slice(-WINDOW),
    totalAttempted: g.totalAttempted + 1,
    totalCorrect: g.totalCorrect + (correct ? 1 : 0),
    cats: {
      ...g.cats,
      [topic]: {
        answered: cat.answered + 1,
        correct: cat.correct + (correct ? 1 : 0),
        recent: [...cat.recent, correct].slice(-WINDOW),
      },
    },
  };
  return next;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Accuracy % over a window, to one decimal. Null when no answers yet.
export function scorePct(recent: boolean[]): number | null {
  if (!recent.length) return null;
  return round1((100 * recent.filter(Boolean).length) / recent.length);
}

// Pick a category for the "mix" mode, weighted to the real exam percentages.
export function weightedCategory(): Series65Topic {
  const total = CATEGORY_META.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const c of CATEGORY_META) {
    r -= c.weight;
    if (r <= 0) return c.topic;
  }
  return CATEGORY_META[CATEGORY_META.length - 1].topic;
}

// Shuffled question-index pools per category (cycled through, then reshuffled).
export function buildPools(): Record<Series65Topic, number[]> {
  const pools = {} as Record<Series65Topic, number[]>;
  for (const t of SERIES65_TOPICS) pools[t] = [];
  SERIES65_QUESTIONS.forEach((q, i) => pools[q.topic].push(i));
  for (const t of SERIES65_TOPICS) {
    const a = pools[t];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  }
  return pools;
}
