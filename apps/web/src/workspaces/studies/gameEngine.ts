// The topic-agnostic study-game engine: the level ladder + prestige, the streak
// multiplier, and the session/lifetime scoring math. This is the single source
// of truth for how any study game (team-built decks) levels up and scores — it
// carries no subject-specific content (no fixed topics, no question bank). The
// per-game state that uses this math lives in studyEngine.ts (DeckGameState).

export const WINDOW = 100; // per-category accuracy is measured over the last 100 answers

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Accuracy % over a window, to one decimal. Null when no answers yet.
export function scorePct(recent: boolean[]): number | null {
  if (!recent.length) return null;
  return round1((100 * recent.filter(Boolean).length) / recent.length);
}

// ---- Session score ----
// The score for the current block of up to WINDOW (100) questions. Blocks are
// fixed, not sliding: questions 1–100 are one block, 101–200 the next, and so on.
export interface SessionScore {
  attempted: number; // questions answered in the current block (1..WINDOW)
  correct: number; // correct answers in the current block
  pct: number; // correct / attempted × 100, to one decimal
  index: number; // 0-based block number (0 = questions 1–100)
  start: number; // first question number in this block (1-based)
  end: number; // last question number this block can hold (start + WINDOW − 1)
}

// ---- Streak multiplier ----
// A run of consecutive correct answers boosts how much each correct answer
// counts toward your level. Every STREAK_STEP answers in a row bumps the
// multiplier: 5 in a row → ×2, 10 → ×3, and so on. A single wrong answer resets
// the streak (and the multiplier) to zero. The multiplier only scales level
// progress — lifetime accuracy still counts each answer once.
export const STREAK_STEP = 5; // correct answers in a row per multiplier tier

export function streakMultiplier(streak: number): number {
  return 1 + Math.floor(Math.max(0, Math.floor(streak)) / STREAK_STEP);
}

// ---- Overall level ladder (topic-agnostic) ----
// A single progression that spans every category. Twelve themed levels, each a
// distinct emoji with its own base hue, and each level holds five sub-levels
// that shade the base colour from dark to light. Advancement is a count of
// correct answers, but each sub-level costs one more than the last (10, 11, 12,
// … continuously up the ladder), so higher levels take progressively longer.
export interface MainLevelDef {
  emoji: string;
  name: string;
  hue: number; // base hue on the colour wheel (0..360)
  sat: number; // base saturation %
  lMin: number; // lightness % at sub-level 1 (darkest / dullest)
  lMax: number; // lightness % at sub-level 5 (lightest)
}

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

// Correct answers to advance FROM sub-level step `s` to the next.
export function subLevelCost(step: number): number {
  return BASE_SUBLEVEL_COST + Math.max(0, Math.min(MAX_STEP, Math.floor(step)));
}

// Cumulative correct answers needed to REACH sub-level step `s` (0 at step 0).
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

// Pick black or white text for a background by its WCAG relative luminance.
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
