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
// to light. Advancement is a count of correct answers, but each sub-level costs
// one more than the last (10, 11, 12, … continuously up the ladder), so higher
// levels take progressively longer. Clearing the fifth sub-level rolls over into
// the next level's emoji and hue.
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

export const SUBLEVELS = 5; // sub-levels per main level
export const BASE_SUBLEVEL_COST = 10; // correct answers to clear the very first sub-level
const MAX_STEP = MAIN_LEVELS.length * SUBLEVELS - 1; // 59 (Lv12, sub-level 5)

// ---- Streak multiplier ----
// A run of consecutive correct answers boosts how much each correct answer
// counts toward your level. Every STREAK_STEP answers in a row bumps the
// multiplier: 5 in a row → ×2, 10 → ×3, 15 → ×4, and so on. A single wrong
// answer resets the streak (and the multiplier) to zero. The multiplier only
// scales level progress — lifetime accuracy still counts each answer once.
export const STREAK_STEP = 5; // correct answers in a row per multiplier tier

// The multiplier for a given streak length: 1× below the first tier, then +1 for
// every STREAK_STEP consecutive correct answers.
export function streakMultiplier(streak: number): number {
  return 1 + Math.floor(Math.max(0, Math.floor(streak)) / STREAK_STEP);
}

// Correct answers to advance FROM sub-level step `s` to the next. Starts at
// BASE_SUBLEVEL_COST and grows by one each sub-level, continuously across every
// level — so each sub-level costs one more correct answer than the last (step 0
// costs 10, step 1 costs 11, …), making higher levels progressively harder.
export function subLevelCost(step: number): number {
  return BASE_SUBLEVEL_COST + Math.max(0, Math.min(MAX_STEP, Math.floor(step)));
}

// Cumulative correct answers needed to REACH sub-level step `s` (0 at step 0):
// the sum of every earlier sub-level's cost.
export function correctToReachStep(step: number): number {
  const s = Math.max(0, Math.min(MAX_STEP + 1, Math.floor(step)));
  return BASE_SUBLEVEL_COST * s + (s * (s - 1)) / 2; // Σ_{i=0}^{s-1}(BASE + i)
}

// Highest sub-level step (0..59) reached at a given correct-answer count.
export function stepForCorrect(totalCorrect: number): number {
  const correct = Math.max(0, Math.floor(totalCorrect) || 0);
  let s = 0;
  while (s < MAX_STEP && correctToReachStep(s + 1) <= correct) s++;
  return s;
}

// Correct answers to fully max the ladder (reach Lv12 ★★★★★).
export const MAX_CORRECT = correctToReachStep(MAX_STEP);

export interface OverallLevel {
  mainIndex: number; // 0..11 (main level index)
  main: MainLevelDef;
  sub: number; // 1..5 (current sub-level)
  stars: string; // pip string, e.g. "★★☆☆☆"
  bg: string; // shaded base colour for this sub-level
  text: string; // readable text colour on `bg`
  isMax: boolean; // at level 12, sub-level 5
  correct: number; // total correct answers
  intoSub: number; // correct answers into the current sub-level (0..subCost)
  toNext: number; // correct answers remaining to the next sub-level (0 at max)
  subCost: number; // correct answers this sub-level costs to clear
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
  const step = stepForCorrect(correct);
  const mainIndex = Math.floor(step / SUBLEVELS);
  const sub = (step % SUBLEVELS) + 1; // 1..5
  const main = MAIN_LEVELS[mainIndex];
  const isMax = step === MAX_STEP;

  const L = main.lMin + ((main.lMax - main.lMin) * (sub - 1)) / (SUBLEVELS - 1);
  const [r, g, b] = hslToRgb(main.hue, main.sat, L);
  const bg = `hsl(${main.hue}, ${main.sat}%, ${round1(L)}%)`;
  const text = readableText(r, g, b);

  const stars = '★'.repeat(sub) + '☆'.repeat(SUBLEVELS - sub);
  const subCost = subLevelCost(step);
  const intoSub = isMax ? subCost : correct - correctToReachStep(step);
  const toNext = isMax ? 0 : subCost - intoSub;
  const nextLabel = isMax
    ? 'Maxed'
    : sub < SUBLEVELS
      ? `${main.emoji} ${main.name} ${'★'.repeat(sub + 1)}${'☆'.repeat(SUBLEVELS - sub - 1)}`
      : `${MAIN_LEVELS[mainIndex + 1].emoji} ${MAIN_LEVELS[mainIndex + 1].name}`;

  return { mainIndex, main, sub, stars, bg, text, isMax, correct, intoSub, toNext, subCost, nextLabel, step };
}

// The level descriptor for an exact sub-level step (0..59). Used for the "best
// reached" badges, where we track a step but not a correct-answer count.
export function levelAtStep(step: number): OverallLevel {
  return overallLevel(correctToReachStep(Math.max(0, Math.min(MAX_STEP, Math.floor(step)))));
}

// A summary of a level-up caused by finishing a mock test, so the test screen
// can celebrate it. Null-ish (no summary) means the test didn't cross a level.
export interface TestLevelUp {
  mainUp: boolean; // reached a new main level (fresh emoji + hue)
  emoji: string;
  name: string;
  mainIndex: number;
  stars: string;
  bg: string;
  text: string;
  gained: number; // sub-levels gained
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
  // Correct answers that count toward the level. Quiz answers bump this and
  // totalCorrect together; mock-test answers bump only this — so tests level you
  // up without changing your lifetime accuracy or leaderboard score.
  levelCorrect: number;
  bestStep: number; // highest overall level step reached this run (0..59)
  allTimeBestStep: number; // highest level step ever reached — survives a reset
  // Current run of consecutive correct answers, and the longest such run this
  // game. `streak` drives the level multiplier (see streakMultiplier); a wrong
  // answer resets it to 0. `bestStreak` is kept for a "best streak" readout.
  streak: number;
  bestStreak: number;
  cats: Record<Series65Topic, CatState>;
}

export function emptyGame(): GameState {
  const cats = {} as Record<Series65Topic, CatState>;
  for (const t of SERIES65_TOPICS) cats[t] = { answered: 0, correct: 0, recent: [] };
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

// The question a learner is currently on, persisted per user so closing and
// reopening the app returns them to the same question rather than drawing a new
// one. Only the question id and its answer state are stored — the live question
// object is resolved from the static bank on load.
export interface CurrentSnapshot {
  id: number; // question id from the static bank
  topic: Series65Topic; // the category it was served under
  selected: 'A' | 'B' | 'C' | 'D' | null; // highlighted / submitted choice, if any
  revealed: boolean; // whether the answer was already submitted and scored
  outcome: boolean | null; // correct / incorrect, once revealed
}

export function currentKey(userId: string | undefined): string {
  return `vts_series65_current_${userId ?? 'anon'}`;
}

export function saveCurrent(userId: string | undefined, snap: CurrentSnapshot | null): void {
  try {
    if (snap == null) localStorage.removeItem(currentKey(userId));
    else localStorage.setItem(currentKey(userId), JSON.stringify(snap));
  } catch {
    /* ignore storage failures */
  }
}

// Read back the persisted current question, validating each field so a stale or
// malformed entry falls back to null (i.e. a fresh question will be drawn).
export function loadCurrentSnapshot(userId: string | undefined): CurrentSnapshot | null {
  try {
    const raw = localStorage.getItem(currentKey(userId));
    if (!raw) return null;
    const p = JSON.parse(raw) as Record<string, unknown>;
    const id = Number(p.id);
    if (!Number.isInteger(id)) return null;
    const topic = p.topic;
    if (typeof topic !== 'string' || !SERIES65_TOPICS.includes(topic as Series65Topic)) return null;
    const selected =
      p.selected === 'A' || p.selected === 'B' || p.selected === 'C' || p.selected === 'D'
        ? p.selected
        : null;
    return {
      id,
      topic: topic as Series65Topic,
      selected,
      revealed: p.revealed === true,
      outcome: typeof p.outcome === 'boolean' ? p.outcome : null,
    };
  } catch {
    return null;
  }
}

// Coerce an arbitrary parsed object into a valid GameState, dropping anything
// malformed. Shared by the localStorage and server-synced load paths.
export function normalizeGame(p: unknown): GameState {
  const fresh = emptyGame();
  if (!p || typeof p !== 'object') return fresh;
  const src = p as Record<string, unknown>;
  const totalCorrect = Number(src.totalCorrect) || 0;
  // Level progress. Older saves predate the field, so seed it from totalCorrect
  // (which is what drove the level before) — no level is lost on upgrade.
  const levelCorrect = Math.max(Number(src.levelCorrect) || 0, totalCorrect);
  // Best level reached: honour the stored high-water marks when present, but
  // never let them fall below the level the level count implies (so older saves,
  // which predate these fields, still show a sensible best).
  const floorStep = stepForCorrect(levelCorrect);
  const bestStep = Math.max(Number(src.bestStep) || 0, floorStep);
  const g: GameState = {
    recent: Array.isArray(src.recent) ? src.recent.filter((x: unknown) => typeof x === 'boolean').slice(-WINDOW) : [],
    totalAttempted: Number(src.totalAttempted) || 0,
    totalCorrect,
    levelCorrect,
    bestStep,
    allTimeBestStep: Math.max(Number(src.allTimeBestStep) || 0, bestStep),
    // Streak fields postdate the first saves; absent → 0. bestStreak never falls
    // below the current streak.
    streak: Math.max(0, Math.floor(Number(src.streak) || 0)),
    bestStreak: Math.max(
      0,
      Math.floor(Number(src.bestStreak) || 0),
      Math.floor(Number(src.streak) || 0),
    ),
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
  // Extend the streak on a correct answer (reset it on a miss), then let the
  // multiplier for the *new* streak scale this answer's contribution to the
  // level. So the 5th correct in a row lands at ×2, the 10th at ×3, etc.
  const streak = correct ? g.streak + 1 : 0;
  const gain = correct ? streakMultiplier(streak) : 0;
  const levelCorrect = g.levelCorrect + gain;
  const bestStep = Math.max(g.bestStep, stepForCorrect(levelCorrect));
  const next: GameState = {
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
      [topic]: {
        answered: cat.answered + 1,
        correct: cat.correct + (correct ? 1 : 0),
        recent: [...cat.recent, correct].slice(-WINDOW),
      },
    },
  };
  return next;
}

// Fold a finished mock test's correct answers into the level only: `levelCorrect`
// (and the best-level marks) advance, but lifetime accuracy, per-category stats,
// and the leaderboard are untouched. Returns a new state.
export function applyTestLevel(g: GameState, correctCount: number): GameState {
  const gained = Math.max(0, Math.floor(correctCount) || 0);
  if (gained === 0) return g;
  const levelCorrect = g.levelCorrect + gained;
  const bestStep = Math.max(g.bestStep, stepForCorrect(levelCorrect));
  return { ...g, levelCorrect, bestStep, allTimeBestStep: Math.max(g.allTimeBestStep, bestStep) };
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
