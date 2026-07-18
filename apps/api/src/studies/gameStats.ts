// Shared ranking math for the study-game leaderboards. Both the per-user game
// (game.ts) and team decks (deckGame.ts) store the SAME opaque GameState blob
// (owned by the web client), so the few headline numbers used to rank players
// are read the same way for both. Kept in one place so the two leaderboards
// never drift.

// Level ladder shape, kept in step with the web client (studyEngine.ts /
// gameEngine.ts): 12 levels x 5 sub-levels, each sub-level costing one more
// correct answer than the last (10, 11, 12, …). Used to derive a run's "best
// level reached" step (0..59) when the stored state predates that field.
const BASE_SUBLEVEL_COST = 10;
const MAX_LEVEL_STEP = 12 * 5 - 1; // 59

// Session score window, kept in step with the web client: the score for the
// current fixed block of up to WINDOW questions, which resets every WINDOW.
export const WINDOW = 100;

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function accuracyOf(correct: number, attempted: number): number | null {
  return attempted > 0 ? round1((100 * correct) / attempted) : null;
}

function correctToReachStep(step: number): number {
  const s = Math.max(0, Math.min(MAX_LEVEL_STEP + 1, Math.floor(step)));
  return BASE_SUBLEVEL_COST * s + (s * (s - 1)) / 2;
}

export function stepForCorrect(correct: number): number {
  const c = Math.max(0, Math.floor(correct) || 0);
  let s = 0;
  while (s < MAX_LEVEL_STEP && correctToReachStep(s + 1) <= c) s++;
  return s;
}

// The headline numbers of one run, read from either a stored state blob or a
// banked run row.
export interface RunStats {
  attempted: number;
  correct: number;
  bestStep: number;
  // Current session block, derived from the stored `recent` window. Zeroed for
  // banked runs (which store no per-answer history).
  sessionAttempted: number;
  sessionCorrect: number;
}

// Pull the ranking numbers out of one stored state blob. Returns null when the
// state is unparseable or the player has not answered anything yet, so empty and
// broken rows simply drop off the board.
export function statsFromState(raw: string): RunStats | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const g = parsed as Record<string, unknown>;

  const attempted = Number(g.totalAttempted) || 0;
  const correct = Number(g.totalCorrect) || 0;
  if (attempted <= 0) return null;

  // Best level reached: honour the stored high-water mark, but never below what
  // the level count already implies (older saves predate the field). Level is
  // driven by `levelCorrect` (quiz + test), falling back to totalCorrect.
  const levelCorrect = Number(g.levelCorrect) || correct;
  const bestStep = Math.max(Number(g.bestStep) || 0, stepForCorrect(levelCorrect));

  // Current session block: the most recent `blockLen` outcomes in `recent` are
  // exactly this block's answers (a completed block shows its full WINDOW). This
  // mirrors sessionScore() in the web client.
  const recent = Array.isArray(g.recent) ? g.recent.filter((x: unknown) => typeof x === 'boolean') : [];
  const rem = attempted % WINDOW;
  const blockLen = rem === 0 ? WINDOW : rem;
  const tail = recent.slice(-blockLen);
  const sessionAttempted = tail.length;
  const sessionCorrect = tail.filter(Boolean).length;

  return { attempted, correct, bestStep, sessionAttempted, sessionCorrect };
}

// Validate that a value is a JSON string within a size ceiling. Returns the
// canonical string to store, or null if it is unusable. Shared by the per-user
// game and team decks.
const MAX_STATE_BYTES = 64 * 1024;
export function normalizeState(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length === 0 || raw.length > MAX_STATE_BYTES) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return raw;
  } catch {
    return null;
  }
}
