// Which built-in ("baked in", isSample) study games a learner has added into
// their own "Your study games" list. The portal seeds a handful of example
// games per team; rather than showing them all at once, they live in the
// Browse Study Games gallery until the learner adds the ones they want. This is
// a personal, device-local preference (kept in localStorage, keyed by the
// signed-in user) — exactly like the other per-user study display settings — so
// it never changes team data or what anyone else sees.

function addedKey(userId: string | undefined): string {
  return `vts_study_added_games_${userId ?? 'anon'}`;
}

// The set of built-in deck ids the user has added to their own list.
export function loadAddedSamples(userId: string | undefined): Set<string> {
  try {
    const raw = localStorage.getItem(addedKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((x): x is string => typeof x === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
}

export function saveAddedSamples(userId: string | undefined, ids: Set<string>): void {
  try {
    localStorage.setItem(addedKey(userId), JSON.stringify([...ids]));
  } catch {
    /* ignore quota / disabled storage */
  }
}
