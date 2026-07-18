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
