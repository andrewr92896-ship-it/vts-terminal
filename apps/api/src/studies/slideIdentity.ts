import { randomUUID } from 'node:crypto';

// What makes a presentation slide the same slide tomorrow.
//
// A guide stores its slides as one JSON blob, which is a fine way to keep a
// presentation together and a hopeless way to identify a slide — an array
// position changes the moment somebody drags a slide up the deck. A lesson that
// referred to "slide 2" would silently start describing a different slide, with
// nothing on screen to say so.
//
// So each slide carries its own id, minted by the server the first time the
// slide is written and preserved through every edit and reorder afterwards.
// These two functions are the whole mechanism, kept apart from the store so the
// rules can be checked without a database.

export interface SlideLike {
  id?: string | null;
  title: string;
  body: string;
  image?: string | null;
}

/**
 * Keep the id a slide already has; never invent one.
 *
 * Called on READ as well as write, which is exactly why it must not mint: a read
 * that invented identity would hand out a different id every time it ran, and
 * nothing pointing at a slide could rely on it. Legacy slides written before ids
 * existed simply come back with none, and go on working.
 */
export function keepSlideId(raw: unknown): string | null {
  const v = (raw ?? {}) as { id?: unknown };
  return typeof v.id === 'string' && v.id.trim() ? v.id.trim().slice(0, 80) : null;
}

/**
 * Give every slide an id, keeping the ones that already have one.
 *
 * Called only when slides are being WRITTEN. A slide arriving without an id is
 * new — just added, or from a presentation that predates ids — and gets one now.
 * A slide arriving with an id keeps it, which is how identity survives a save
 * that reordered the deck.
 *
 * The consequence to remember: an editor that does not send the ids back would
 * make every save look like a deck of brand new slides. That is why `getGuide`
 * returns them, the route schema accepts them, and the presentation editor
 * round-trips them.
 */
export function withSlideIds<T extends SlideLike>(slides: T[]): (T & { id: string })[] {
  // The return type states the point of the function: past here, every slide has
  // an id, so nothing downstream has to re-check.
  return slides.map((s) => ({ ...s, id: s.id && s.id.trim() ? s.id : randomUUID() }));
}
