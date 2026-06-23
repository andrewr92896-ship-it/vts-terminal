// Lets the Study Hub / Progress screens deep-link into a specific Study Game
// view (the quiz or the flashcards) without threading extra props through the
// portal shell. The Study Game consumes the request once on mount.
export type StudyView = 'quiz' | 'cards';

let pending: StudyView | null = null;

export function requestStudyView(v: StudyView): void {
  pending = v;
}

export function consumeStudyView(): StudyView | null {
  const v = pending;
  pending = null;
  return v;
}
