import { weightedCategories, type CategoryWeights } from './examWeights';

// How the study game picks the next question — and, above all, WHERE IT IS UP
// TO, which is the part that has to survive leaving the screen.
//
// Two modes:
//
//  * `even` — what the game has always done. One shuffled pass over every
//    question in the deck, so each is asked once before any is asked twice. The
//    MIX that produces is whatever mix the deck holds: a deck with 100
//    questions in each of four areas serves them a quarter each, however the
//    exam actually splits.
//  * `blueprint` — the mix the exam asks for. The next question comes from
//    whichever weighted area is furthest behind its share (highest averages,
//    the same rule `allocateDraw` composes a practice test with), and then from
//    that area's OWN shuffled pass — so a 30% area comes up twice as often as a
//    15% one, and within an area every question is still seen before any
//    repeats.
//
// The learner chooses per game, and `even` is the default: a deck whose
// question mix already matches its blueprint plays identically either way.
//
// THE PASS IS SAVED, AND THAT IS THE WHOLE POINT OF THIS MODULE EXISTING.
// It used to live in a React ref, rebuilt on mount — so opening the game,
// answering twenty questions and leaving reshuffled the deck and started again
// from the top. Over a few sittings that is sampling WITH replacement: on a
// 400-question deck a learner reported heavy repeats and whole stretches of the
// deck they had never seen, which is exactly what that produces (roughly 180 of
// 400 distinct after 237 answers, rather than 237 of 400). Nothing about the
// shuffle was wrong; it was being thrown away. So what is left of the pass is
// written to localStorage after every draw and picked up on the next visit.
//
// IT IS KEPT ON THE ACCOUNT, NOT THE DEVICE. localStorage alone solved half of
// it: somebody who studies on a phone and a laptop had two independent passes,
// each working through its own copy of the deck, so the same questions came
// round on both while others went unasked on either — the same repeats, from a
// different cause. So the device copy is now the instant-start cache and the
// account copy is the one that carries between devices; `reconcileDraw` merges
// them, and what it merges is the REMAINING questions, since the intersection of
// two remainders is the union of what the two devices have asked.
//
// IT IS KEYED BY QUESTION `seq`, NEVER BY ARRAY INDEX. A stored index means
// something different the moment a question is added or deleted, so a saved
// pass would silently start pointing at the wrong questions. `seq` is the
// question's stable id — the same thing the saved session restores the current
// question by — so a stored pass survives the deck being edited, and anything
// no longer in the deck simply drops out of it.
//
// Areas carrying no weight are off the exam, so a blueprint draw never serves
// them. A blueprint that no question in the deck matches falls back to the even
// pass rather than serving nothing.

export type DrawMode = 'even' | 'blueprint';

export interface DrawQuestion {
  seq: number;
  topic: string;
}

interface CatPool {
  name: string;
  weight: number;
  all: number[]; // every seq in this area
  pool: number[]; // what is left of the current pass, drawn from the end
  served: number; // how many this pass has drawn from it
}

export interface DrawState {
  mode: DrawMode;
  all: number[]; // every seq in the deck
  pool: number[]; // what is left of the even pass
  cats: CatPool[]; // the weighted areas, when a blueprint draw is possible
}

function shuffle(a: number[]): number[] {
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const key = (s: string) => (s || 'General').trim().toLowerCase();

/**
 * Build a fresh draw for a deck — a full pass, in the order it will be served.
 * Categories are matched to each question's topic the way the rest of the study
 * code matches them (trimmed, case-insensitively).
 */
export function buildDraw(
  questions: DrawQuestion[],
  categories: string[],
  weights: CategoryWeights,
  mode: DrawMode,
): DrawState {
  const all = questions.map((q) => q.seq);
  const state: DrawState = { mode, all, pool: shuffle(all), cats: [] };
  if (mode !== 'blueprint') return state;

  const byTopic = new Map<string, number[]>();
  for (const q of questions) {
    const k = key(q.topic);
    const list = byTopic.get(k);
    if (list) list.push(q.seq);
    else byTopic.set(k, [q.seq]);
  }

  for (const c of weightedCategories(categories, weights)) {
    if (c.weight <= 0) continue;
    const areaAll = byTopic.get(key(c.name)) ?? [];
    if (areaAll.length === 0) continue;
    state.cats.push({ name: c.name, weight: c.weight, all: areaAll, pool: shuffle(areaAll), served: 0 });
  }
  return state;
}

// Whether a blueprint draw would actually do anything on this deck: at least
// one weighted area has questions to serve. Deliberately does NOT build a draw
// — this is read on every render of the game screen, and building one shuffles
// every question in the deck.
export function canDrawByBlueprint(
  questions: DrawQuestion[],
  categories: string[],
  weights: CategoryWeights,
): boolean {
  const present = new Set(questions.map((q) => key(q.topic)));
  return weightedCategories(categories, weights).some((c) => c.weight > 0 && present.has(key(c.name)));
}

/**
 * The next question's `seq`, or null on an empty deck. Mutates the state: a
 * pass that runs out is reshuffled and started again.
 */
export function drawNext(state: DrawState): number | null {
  if (state.mode === 'blueprint' && state.cats.length > 0) {
    // Highest averages: whichever area has the worst questions-per-weight so
    // far. Ties break on the larger weight, then the name, so the sequence is
    // deterministic rather than dependent on object order.
    let best: CatPool | null = null;
    let bestQuotient = -1;
    for (const c of state.cats) {
      const q = c.weight / (c.served + 1);
      if (q > bestQuotient || (q === bestQuotient && best != null && (c.weight > best.weight || (c.weight === best.weight && c.name < best.name)))) {
        bestQuotient = q;
        best = c;
      }
    }
    if (best) {
      if (best.pool.length === 0) best.pool = shuffle(best.all);
      const seq = best.pool.pop();
      if (seq != null) {
        best.served += 1;
        return seq;
      }
    }
  }

  if (state.pool.length === 0) state.pool = shuffle(state.all);
  const seq = state.pool.pop();
  return seq == null ? null : seq;
}

// Take one question out of what is left of the pass — used when a question is
// restored from a saved session, so it does not come straight back round as the
// next one drawn.
export function dropSeq(state: DrawState, seq: number): void {
  state.pool = state.pool.filter((s) => s !== seq);
  for (const c of state.cats) c.pool = c.pool.filter((s) => s !== seq);
}

// How many questions are still to be asked before anything repeats. In
// blueprint mode that is per area, so this is the total across them.
export function passRemaining(state: DrawState): number {
  if (state.mode === 'blueprint' && state.cats.length > 0) {
    return state.cats.reduce((a, c) => a + c.pool.length, 0);
  }
  return state.pool.length;
}

// How many questions a full pass holds — the deck, or in blueprint mode only
// the part of it the exam actually covers.
export function passSize(state: DrawState): number {
  if (state.mode === 'blueprint' && state.cats.length > 0) {
    return state.cats.reduce((a, c) => a + c.all.length, 0);
  }
  return state.all.length;
}

// ---- Keeping the pass across visits and devices ----

interface StoredDraw {
  v: 1;
  mode: DrawMode;
  pool: number[];
  cats: { name: string; pool: number[]; served: number }[];
}

export function deckDrawKey(userId: string | undefined, deckId: string): string {
  return `vts_deck_draw_${userId ?? 'anon'}_${deckId}`;
}

// The pass as a string — what goes to localStorage and, unchanged, to the
// account. One shape, so the two copies are always mergeable with each other.
export function serializeDraw(state: DrawState): string {
  const stored: StoredDraw = {
    v: 1,
    mode: state.mode,
    pool: state.pool,
    cats: state.cats.map((c) => ({ name: c.name, pool: c.pool, served: c.served })),
  };
  return JSON.stringify(stored);
}

export function saveDraw(userId: string | undefined, deckId: string, state: DrawState): void {
  try {
    localStorage.setItem(deckDrawKey(userId, deckId), serializeDraw(state));
  } catch {
    /* ignore quota / disabled storage — the pass simply restarts, as it used to */
  }
}

export function clearDraw(userId: string | undefined, deckId: string): void {
  try {
    localStorage.removeItem(deckDrawKey(userId, deckId));
  } catch {
    /* ignore */
  }
}

function parseStored(raw: string | null): StoredDraw | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<StoredDraw>;
    if (!p || p.v !== 1 || (p.mode !== 'even' && p.mode !== 'blueprint')) return null;
    const nums = (x: unknown) => (Array.isArray(x) ? x.filter((n): n is number => typeof n === 'number') : []);
    return {
      v: 1,
      mode: p.mode,
      pool: nums(p.pool),
      cats: Array.isArray(p.cats)
        ? p.cats
            .filter((c): c is { name: string; pool: number[]; served: number } => !!c && typeof c.name === 'string')
            .map((c) => ({
              name: c.name,
              pool: nums(c.pool),
              served: Number.isFinite(c.served) ? Math.max(0, Math.floor(c.served)) : 0,
            }))
        : [],
    };
  } catch {
    return null;
  }
}

// Lay a stored pass over a freshly built one, filtered to the deck as it stands
// NOW — so a question that has since been deleted drops out and one that has
// been added is picked up by the next pass rather than smuggled into this one.
// A pass stored in the other mode is ignored: switching mode is a deliberate
// act, and a half-served even pass says nothing about where a blueprint draw
// should be.
function applyStored(fresh: DrawState, stored: StoredDraw | null): DrawState {
  if (!stored || stored.mode !== fresh.mode) return fresh;

  const live = new Set(fresh.all);
  const pool = stored.pool.filter((s) => live.has(s));
  // An empty stored pool is a pass that finished, so the fresh shuffle stands.
  if (pool.length > 0) fresh.pool = pool;

  for (const c of fresh.cats) {
    const s = stored.cats.find((x) => x.name === c.name);
    if (!s) continue;
    const area = new Set(c.all);
    const p = s.pool.filter((x) => area.has(x));
    if (p.length > 0) c.pool = p;
    // `served` is what keeps the areas in their blueprint proportions, so it
    // carries over even when that area's pass has run out and been reshuffled —
    // otherwise every visit would start by serving the heaviest area again.
    c.served = s.served;
  }
  return fresh;
}

/**
 * The draw to carry on with on THIS device: where it left off if there is a
 * saved pass in this mode, and a fresh one otherwise. The account copy is
 * folded in afterwards by `reconcileDraw`, once it has been fetched — this is
 * the instant start, so the first question does not wait on the network.
 */
export function loadDraw(
  userId: string | undefined,
  deckId: string,
  questions: DrawQuestion[],
  categories: string[],
  weights: CategoryWeights,
  mode: DrawMode,
): DrawState {
  const fresh = buildDraw(questions, categories, weights, mode);
  return applyStored(fresh, parseStored(readLocal(userId, deckId)));
}

function readLocal(userId: string | undefined, deckId: string): string | null {
  try {
    return localStorage.getItem(deckDrawKey(userId, deckId));
  } catch {
    return null;
  }
}

/**
 * Merge what one device has left with what another device left on the account.
 *
 * TWO REMAINDERS INTERSECT TO THE UNION OF WHAT WAS ASKED, which is exactly the
 * merge wanted: a question either device has already served drops out, and
 * nothing is resurrected. The one case that must not be intersected is a pass
 * that has just (re)started — a full pool is not evidence that nothing has been
 * asked, it is evidence that a round finished — so a full side yields to the
 * side that is mid-round rather than cutting it down to a stale remainder.
 */
function mergeRemaining(remote: number[], local: number[], size: number): number[] {
  if (remote.length >= size) return local;
  if (local.length >= size) return remote;
  const seen = new Set(local);
  const both = remote.filter((s) => seen.has(s));
  // Disjoint remainders mean everything has been asked on one device or the
  // other; the shorter one is closest to a finished round, and finishing it
  // reshuffles.
  if (both.length > 0) return both;
  return remote.length <= local.length ? remote : local;
}

/**
 * Fold the account's pass into this device's, so studying on a phone and a
 * laptop works through one deck between them. Returns the state to carry on
 * with; the caller writes it back to both copies.
 */
export function reconcileDraw(local: DrawState, remoteRaw: string | null): DrawState {
  const stored = parseStored(remoteRaw);
  if (!stored || stored.mode !== local.mode) return local;

  const live = new Set(local.all);
  const remotePool = stored.pool.filter((s) => live.has(s));
  if (remotePool.length > 0) local.pool = mergeRemaining(remotePool, local.pool, local.all.length);

  for (const c of local.cats) {
    const s = stored.cats.find((x) => x.name === c.name);
    if (!s) continue;
    const area = new Set(c.all);
    const remoteArea = s.pool.filter((x) => area.has(x));
    if (remoteArea.length > 0) c.pool = mergeRemaining(remoteArea, c.pool, c.all.length);
    // The further-along count wins: it is the one that has served more, and
    // under-counting would start the next visit by serving that area again.
    c.served = Math.max(c.served, s.served);
  }
  return local;
}
