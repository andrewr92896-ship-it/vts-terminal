import { ApiError } from '../../api/client';

// What a failed study-content request says to the author. Shared by the game
// wizard and the combine-games form so one failure reads the same wherever it
// happened — and so neither can import the other just to borrow a sentence.
export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 503) return 'AI isn’t configured yet — an API key needs to be set on the server.';
    return e.message;
  }
  return 'Could not build the study game. Please try again.';
}
