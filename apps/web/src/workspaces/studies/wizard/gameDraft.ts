import { newDraftId } from './draft';

// Keeping an unfinished study game on the device.
//
// The same reasoning as the package draft next door, and it matters for exactly
// one card: THE HANDOFF IS A SCREEN SOMEBODY IS MEANT TO WALK AWAY FROM. They
// take the prompt to their own AI and come back — sometimes the next day — and
// the terminal's navigation is state-based, so without this the wizard's paste
// box goes when the tab does, and re-answering the questions mints a new game id
// for a file that was built against the old one. That fault has already been
// paid for once in the package wizard; it is not being rebuilt here.
//
// Only the answers are stored. Whatever material a creator hands to their own AI
// never comes near VTS, and nothing here writes a file into localStorage.

export const GAME_DRAFT_VERSION = 1;

const KEY_PREFIX = 'vts_study_game_draft_';

/** Still answering the questions, or through them and standing on the handoff. */
export type GameStage = 'wizard' | 'handoff';

export interface StoredGameDraft<P> {
  v: number;
  /** This draft's own identity — the Game ID stamped into the handoff. */
  gameId: string;
  stepId: string;
  plan: P;
  stage: GameStage;
  savedAt: number;
}

function key(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

export function newGameId(): string {
  return newDraftId();
}

/**
 * Read the saved draft, or null.
 *
 * Anything that is not a draft of THIS version is discarded rather than
 * repaired, so a future version bump needs no migration — replaying
 * half-understood answers into a changed set of questions produces a game
 * nobody described.
 */
export function loadGameDraft<P>(userId: string, base: P): StoredGameDraft<P> | null {
  if (typeof localStorage === 'undefined') return null;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key(userId));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredGameDraft<P>>;
    if (!parsed || parsed.v !== GAME_DRAFT_VERSION) return clearGameDraft(userId), null;
    if (!parsed.plan || typeof parsed.plan !== 'object') return clearGameDraft(userId), null;
    if (typeof parsed.stepId !== 'string') return clearGameDraft(userId), null;
    return {
      v: GAME_DRAFT_VERSION,
      gameId: typeof parsed.gameId === 'string' ? parsed.gameId : newGameId(),
      stepId: parsed.stepId,
      // Merged over a fresh plan so a field added since the draft was written
      // is present rather than undefined.
      plan: { ...base, ...parsed.plan },
      // Anything but the known value reads as 'wizard': resuming to the
      // questions costs a few clicks, where wrongly resuming to a handoff would
      // offer a paste box for a plan that was never finished.
      stage: parsed.stage === 'handoff' ? 'handoff' : 'wizard',
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
    };
  } catch {
    clearGameDraft(userId);
    return null;
  }
}

export function saveGameDraft<P>(userId: string, draft: Omit<StoredGameDraft<P>, 'v' | 'savedAt'>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key(userId), JSON.stringify({ ...draft, v: GAME_DRAFT_VERSION, savedAt: Date.now() }));
  } catch {
    // A full or disabled store is not worth interrupting the wizard over — what
    // is on screen is still there, it just will not survive a refresh.
  }
}

export function clearGameDraft(userId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(key(userId));
  } catch {
    /* nothing to do */
  }
}
