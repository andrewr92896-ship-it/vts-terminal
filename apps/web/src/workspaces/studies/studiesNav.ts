// Lets the Study Hub / Progress screens deep-link into a specific Study Game
// view (the quiz or the flashcards) without threading extra props through the
// portal shell. The Study Game consumes the request once on mount.
export type StudyView = 'quiz' | 'cards' | 'leaderboard' | 'test';

let pending: StudyView | null = null;

export function requestStudyView(v: StudyView): void {
  pending = v;
}

export function consumeStudyView(): StudyView | null {
  const v = pending;
  pending = null;
  return v;
}

// Peek at a pending view without consuming it, so the Study Game selector can
// tell a Series 65 deep-link should skip the picker and drop straight into the
// game (which consumes the view itself on mount).
export function peekStudyView(): StudyView | null {
  return pending;
}

// Lets Study Creation deep-link into a specific team deck in the Study Game
// selector: request the deck, navigate to `st_game`, and the selector opens it.
let pendingDeckId: string | null = null;

export function requestStudyDeck(id: string): void {
  pendingDeckId = id;
}

export function consumeStudyDeck(): string | null {
  const id = pendingDeckId;
  pendingDeckId = null;
  return id;
}
