// Per-user study-game progress preferences: how many of your most recent
// answers the rolling "session" percentage is measured over, and the optional
// passing thresholds for the lifetime and session progress bars. These are
// personal, device-local display settings (kept in localStorage, keyed by the
// signed-in user) — they never change team data, leaderboards, or scoring, only
// how your own progress bars read. Leaderboards always rank by lifetime %.

import { WINDOW } from './gameEngine';

export interface StudyPrefs {
  // Size of the rolling session window: the session % is the correct rate over
  // your last `sessionWindow` answers. Capped to the stored recent buffer.
  sessionWindow: number;
  // Passing % for each bar, or null when no pass line is set.
  lifetimePass: number | null;
  sessionPass: number | null;
  // Rapid fire: how long the revealed answer stays on screen before the next
  // question is drawn. Lives here rather than in the per-deck session because
  // it is a fact about how the learner reads a result, not about one game — so
  // it carries across every game they play on this device. The rapid-fire
  // toggle itself is per deck (studySession).
  rapidSeconds: number;
  // Whether the game screen's category breakdown is open. A display choice
  // about the learner rather than about one game, so it carries across every
  // game they play on this device.
  categoriesOpen: boolean;
}

export const SESSION_WINDOW_MIN = 5;
// The rolling window can never exceed the number of recent outcomes we keep.
export const SESSION_WINDOW_MAX = WINDOW;

// Bounds on the rapid-fire reveal. The floor is 1s rather than 0 because a
// reveal nobody can see is not a reveal — at 0 the answer would be replaced in
// the same frame it was drawn, which reads as the question having been skipped.
export const RAPID_SECONDS_MIN = 1;
export const RAPID_SECONDS_MAX = 30;

export const DEFAULT_STUDY_PREFS: StudyPrefs = {
  sessionWindow: 50,
  lifetimePass: 70,
  sessionPass: 70,
  rapidSeconds: 4,
  categoriesOpen: false,
};

function prefsKey(userId: string | undefined): string {
  return `vts_study_prefs_${userId ?? 'anon'}`;
}

export function clampWindow(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_STUDY_PREFS.sessionWindow;
  return Math.max(SESSION_WINDOW_MIN, Math.min(SESSION_WINDOW_MAX, Math.round(n)));
}

// Coerce a passing threshold: null/blank means "no pass line"; anything else is
// clamped to a sensible 1..100 %.
export function clampPass(n: unknown): number | null {
  if (n == null || n === '') return null;
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.max(1, Math.min(100, Math.round(v)));
}

// Coerce the rapid-fire reveal length. Anything unusable falls back to the
// default rather than to zero — a stored value that has gone bad must never
// become "advance instantly".
export function clampRapidSeconds(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULT_STUDY_PREFS.rapidSeconds;
  return Math.max(RAPID_SECONDS_MIN, Math.min(RAPID_SECONDS_MAX, Math.round(v)));
}

export function normalizeStudyPrefs(p: unknown): StudyPrefs {
  if (!p || typeof p !== 'object') return { ...DEFAULT_STUDY_PREFS };
  const src = p as Record<string, unknown>;
  return {
    sessionWindow: clampWindow(Number(src.sessionWindow)),
    lifetimePass: 'lifetimePass' in src ? clampPass(src.lifetimePass) : DEFAULT_STUDY_PREFS.lifetimePass,
    sessionPass: 'sessionPass' in src ? clampPass(src.sessionPass) : DEFAULT_STUDY_PREFS.sessionPass,
    // Absent means the prefs were stored before rapid fire existed, so take the
    // default rather than treating the missing value as a choice.
    rapidSeconds: 'rapidSeconds' in src ? clampRapidSeconds(src.rapidSeconds) : DEFAULT_STUDY_PREFS.rapidSeconds,
    categoriesOpen: src.categoriesOpen === true,
  };
}

export function loadStudyPrefs(userId: string | undefined): StudyPrefs {
  try {
    const raw = localStorage.getItem(prefsKey(userId));
    if (!raw) return { ...DEFAULT_STUDY_PREFS };
    return normalizeStudyPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STUDY_PREFS };
  }
}

export function saveStudyPrefs(userId: string | undefined, prefs: StudyPrefs): void {
  try {
    localStorage.setItem(prefsKey(userId), JSON.stringify(prefs));
  } catch {
    /* ignore quota / disabled storage */
  }
}
