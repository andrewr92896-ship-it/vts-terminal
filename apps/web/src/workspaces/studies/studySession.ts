// Per-user, per-deck study-game session state, kept in localStorage so a learner
// stays exactly where they left off. Two things persist here:
//
//   1. Practice mode — when on, answers reveal + explain but don't touch the
//      score, level, streak, or leaderboard.
//   2. The question the learner is currently on (by its stable `seq`) and its
//      reveal state, so leaving the tab, backgrounding the app, or relaunching
//      restores the exact same question — even one that's already been answered
//      but not yet advanced past — instead of jumping to a fresh one.
//
// This is a personal, device-local view state (like studyPrefs); it never
// changes team data, leaderboards, or scoring. Scoring itself lives in the
// separate deck-game blob (studyEngine).

export type Letter = 'A' | 'B' | 'C' | 'D';

// The current question's on-screen state. `revealed` reflects a completed
// question the learner hasn't advanced past yet.
export interface DeckViewState {
  seq: number; // the current question's stable seq
  selected: Letter | null;
  revealed: boolean;
  outcome: boolean | null;
  sourceGuess: string | null;
  // True when this answer was submitted in practice mode (so its result was not
  // recorded) — lets the restored reveal show "not counted" rather than a score
  // change, independent of the live practice toggle.
  practiceAttempt: boolean;
}

export interface DeckSessionState {
  practice: boolean;
  current: DeckViewState | null;
}

export const emptyDeckSession: DeckSessionState = { practice: false, current: null };

// localStorage key for a deck's per-user session/view state.
export function deckSessionKey(userId: string | undefined, deckId: string): string {
  return `vts_deck_session_${userId ?? 'anon'}_${deckId}`;
}

function isLetter(x: unknown): x is Letter {
  return x === 'A' || x === 'B' || x === 'C' || x === 'D';
}

function normalizeView(p: unknown): DeckViewState | null {
  if (!p || typeof p !== 'object') return null;
  const src = p as Record<string, unknown>;
  if (typeof src.seq !== 'number') return null;
  return {
    seq: src.seq,
    selected: isLetter(src.selected) ? src.selected : null,
    revealed: src.revealed === true,
    outcome: typeof src.outcome === 'boolean' ? src.outcome : null,
    sourceGuess: typeof src.sourceGuess === 'string' ? src.sourceGuess : null,
    practiceAttempt: src.practiceAttempt === true,
  };
}

function normalizeSession(p: unknown): DeckSessionState {
  if (!p || typeof p !== 'object') return { ...emptyDeckSession };
  const src = p as Record<string, unknown>;
  return {
    practice: src.practice === true,
    current: normalizeView(src.current),
  };
}

export function loadDeckSession(userId: string | undefined, deckId: string): DeckSessionState {
  try {
    const raw = localStorage.getItem(deckSessionKey(userId, deckId));
    if (!raw) return { ...emptyDeckSession };
    return normalizeSession(JSON.parse(raw));
  } catch {
    return { ...emptyDeckSession };
  }
}

export function saveDeckSession(userId: string | undefined, deckId: string, state: DeckSessionState): void {
  try {
    localStorage.setItem(deckSessionKey(userId, deckId), JSON.stringify(state));
  } catch {
    /* ignore quota / disabled storage */
  }
}
