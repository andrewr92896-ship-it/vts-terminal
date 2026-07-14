// State + rules for the gamified Series 65 Study Game: per-category levels and
// prestige, exam-weighted question mix, and last-100 accuracy scoring. Persisted
// per user in localStorage.

import { SERIES65_QUESTIONS, SERIES65_TOPICS, type Series65Topic } from './series65Questions';

export const PASS_THRESHOLD = 72; // Series 65 passing score (~72%)
export const WINDOW = 100; // per-category accuracy is measured over the last 100 answers

// ---- Score ----
// The headline score is plain lifetime accuracy: correct answers divided by
// questions attempted, across the whole life of the game. No smoothing, no
// windowing — the number you see is exactly your all-time percentage.
export function lifetimeAccuracy(g: GameState): number | null {
  return g.totalAttempted > 0 ? round1((100 * g.totalCorrect) / g.totalAttempted) : null;
}

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

// ---- Overall level ladder (topic-agnostic) ----
// A single progression that spans every category rather than one ladder per
// topic. There are twelve themed levels, each a distinct emoji with its own base
// hue, and each level holds five sub-levels that shade the base colour from dark
// to light. Advancement is a plain count of correct answers: every
// CORRECT_PER_SUBLEVEL correct answers is one sub-level up, and clearing the
// fifth sub-level rolls over into the next level's emoji and hue.
export interface MainLevelDef {
  emoji: string;
  name: string;
  hue: number; // base hue on the colour wheel (0..360)
  sat: number; // base saturation %
  lMin: number; // lightness % at sub-level 1 (darkest / dullest)
  lMax: number; // lightness % at sub-level 5 (lightest)
}

// Twelve levels; hues are spaced far apart so adjacent levels read as clearly
// different colours.
export const MAIN_LEVELS: MainLevelDef[] = [
  { emoji: '🥚', name: 'Egg', hue: 45, sat: 44, lMin: 66, lMax: 90 },
  { emoji: '🍅', name: 'Tomato', hue: 6, sat: 72, lMin: 34, lMax: 66 },
  { emoji: '🍊', name: 'Orange', hue: 26, sat: 88, lMin: 40, lMax: 68 },
  { emoji: '🌽', name: 'Corn', hue: 47, sat: 85, lMin: 46, lMax: 74 },
  { emoji: '🌱', name: 'Sprout', hue: 138, sat: 55, lMin: 28, lMax: 58 },
  { emoji: '🌊', name: 'Wave', hue: 182, sat: 60, lMin: 28, lMax: 56 },
  { emoji: '🫐', name: 'Blueberry', hue: 221, sat: 66, lMin: 34, lMax: 64 },
  { emoji: '🍇', name: 'Grape', hue: 272, sat: 50, lMin: 36, lMax: 64 },
  { emoji: '🌸', name: 'Blossom', hue: 330, sat: 72, lMin: 44, lMax: 74 },
  { emoji: '🟤', name: 'Cocoa', hue: 24, sat: 42, lMin: 26, lMax: 50 },
  { emoji: '⚫', name: 'Onyx', hue: 250, sat: 14, lMin: 12, lMax: 34 },
  { emoji: '💎', name: 'Diamond', hue: 188, sat: 82, lMin: 42, lMax: 72 },
];

export const CORRECT_PER_SUBLEVEL = 10; // correct answers per sub-level up
export const SUBLEVELS = 5; // sub-levels per main level
// Correct answers needed to fully max the ladder: 12 × 5 × 10 = 600.
export const MAX_CORRECT = MAIN_LEVELS.length * SUBLEVELS * CORRECT_PER_SUBLEVEL;

export interface OverallLevel {
  mainIndex: number; // 0..11 (main level index)
  main: MainLevelDef;
  sub: number; // 1..5 (current sub-level)
  stars: string; // pip string, e.g. "★★☆☆☆"
  bg: string; // shaded base colour for this sub-level
  text: string; // readable text colour on `bg`
  isMax: boolean; // at level 12, sub-level 5
  correct: number; // total correct answers
  intoSub: number; // correct answers into the current sub-level (0..CORRECT_PER_SUBLEVEL)
  toNext: number; // correct answers remaining to the next sub-level (0 at max)
  nextLabel: string; // description of the next milestone
  step: number; // sub-level index across the whole ladder (0..59)
}

// Convert HSL to sRGB channels (0..255), so text contrast can be computed.
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const hp = ((((h % 360) + 360) % 360) / 60);
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = lig - c / 2;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

// Pick black or white text for a background by its WCAG relative luminance, so
// every one of the 60 shades stays legible.
function readableText(r: number, g: number, b: number): string {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.42 ? '#1a1324' : '#ffffff';
}

// Resolve a running total of correct answers into the current level, sub-level,
// colour, and progress toward the next milestone.
export function overallLevel(totalCorrect: number): OverallLevel {
  const correct = Math.max(0, Math.floor(totalCorrect) || 0);
  const maxStep = MAIN_LEVELS.length * SUBLEVELS - 1; // 59
  const step = Math.min(maxStep, Math.floor(correct / CORRECT_PER_SUBLEVEL));
  const mainIndex = Math.floor(step / SUBLEVELS);
  const sub = (step % SUBLEVELS) + 1; // 1..5
  const main = MAIN_LEVELS[mainIndex];
  const isMax = step === maxStep;

  const L = main.lMin + ((main.lMax - main.lMin) * (sub - 1)) / (SUBLEVELS - 1);
  const [r, g, b] = hslToRgb(main.hue, main.sat, L);
  const bg = `hsl(${main.hue}, ${main.sat}%, ${round1(L)}%)`;
  const text = readableText(r, g, b);

  const stars = '★'.repeat(sub) + '☆'.repeat(SUBLEVELS - sub);
  const intoSub = isMax ? CORRECT_PER_SUBLEVEL : correct - step * CORRECT_PER_SUBLEVEL;
  const toNext = isMax ? 0 : CORRECT_PER_SUBLEVEL - intoSub;
  const nextLabel = isMax
    ? 'Maxed'
    : sub < SUBLEVELS
      ? `${main.emoji} ${main.name} ${'★'.repeat(sub + 1)}${'☆'.repeat(SUBLEVELS - sub - 1)}`
      : `${MAIN_LEVELS[mainIndex + 1].emoji} ${MAIN_LEVELS[mainIndex + 1].name}`;

  return { mainIndex, main, sub, stars, bg, text, isMax, correct, intoSub, toNext, nextLabel, step };
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
  bestStep: number; // highest overall level step reached this run (0..59)
  allTimeBestStep: number; // highest level step ever reached — survives a reset
  cats: Record<Series65Topic, CatState>;
}

export function emptyGame(): GameState {
  const cats = {} as Record<Series65Topic, CatState>;
  for (const t of SERIES65_TOPICS) cats[t] = { answered: 0, correct: 0, recent: [] };
  return { recent: [], totalAttempted: 0, totalCorrect: 0, bestStep: 0, allTimeBestStep: 0, cats };
}

// The overall level step reached at a given correct-answer count (0..59), the
// same value `overallLevel` computes. Used to track the best level reached.
export function stepForCorrect(totalCorrect: number): number {
  const correct = Math.max(0, Math.floor(totalCorrect) || 0);
  return Math.min(MAIN_LEVELS.length * SUBLEVELS - 1, Math.floor(correct / CORRECT_PER_SUBLEVEL));
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
  const totalCorrect = Number(src.totalCorrect) || 0;
  // Best level reached: honour the stored high-water marks when present, but
  // never let them fall below the level the current correct-answer count implies
  // (so older saves, which predate these fields, still show a sensible best).
  const floorStep = stepForCorrect(totalCorrect);
  const bestStep = Math.max(Number(src.bestStep) || 0, floorStep);
  const g: GameState = {
    recent: Array.isArray(src.recent) ? src.recent.filter((x: unknown) => typeof x === 'boolean').slice(-WINDOW) : [],
    totalAttempted: Number(src.totalAttempted) || 0,
    totalCorrect,
    bestStep,
    allTimeBestStep: Math.max(Number(src.allTimeBestStep) || 0, bestStep),
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
  const totalCorrect = g.totalCorrect + (correct ? 1 : 0);
  const bestStep = Math.max(g.bestStep, stepForCorrect(totalCorrect));
  const next: GameState = {
    recent: [...g.recent, correct].slice(-WINDOW),
    totalAttempted: g.totalAttempted + 1,
    totalCorrect,
    bestStep,
    allTimeBestStep: Math.max(g.allTimeBestStep, bestStep),
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
