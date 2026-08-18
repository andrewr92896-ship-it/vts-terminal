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

// ---- Keeping the pass across visits ----

interface StoredDraw {
  v: 1;
  mode: DrawMode;
  pool: number[];
  cats: { name: string; pool: number[]; served: number }[];
}

export function deckDrawKey(userId: string | undefined, deckId: string): string {
  return `vts_deck_draw_${userId ?? 'anon'}_${deckId}`;
}

export function saveDraw(userId: string | undefined, deckId: string, state: DrawState): void {
  try {
    const stored: StoredDraw = {
      v: 1,
      mode: state.mode,
      pool: state.pool,
      cats: state.cats.map((c) => ({ name: c.name, pool: c.pool, served: c.served })),
    };
    localStorage.setItem(deckDrawKey(userId, deckId), JSON.stringify(stored));
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

function readStored(userId: string | undefined, deckId: string): StoredDraw | null {
  try {
    const raw = localStorage.getItem(deckDrawKey(userId, deckId));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<StoredDraw>;
    if (!p || p.v !== 1 || (p.mode !== 'even' && p.mode !== 'blueprint')) return null;
    return {
      v: 1,
      mode: p.mode,
      pool: Array.isArray(p.pool) ? p.pool.filter((n): n is number => typeof n === 'number') : [],
      cats: Array.isArray(p.cats)
        ? p.cats
            .filter((c): c is { name: string; pool: number[]; served: number } => !!c && typeof c.name === 'string')
            .map((c) => ({
              name: c.name,
              pool: Array.isArray(c.pool) ? c.pool.filter((n): n is number => typeof n === 'number') : [],
              served: Number.isFinite(c.served) ? Math.max(0, Math.floor(c.served)) : 0,
            }))
        : [],
    };
  } catch {
    return null;
  }
}

/**
 * The draw to carry on with: where the learner left off if there is a saved
 * pass in this mode, and a fresh one otherwise.
 *
 * A saved pass is filtered against the deck as it is NOW, so a question that
 * has since been deleted drops out and one that has been added is picked up on
 * the next pass rather than being smuggled into this one. A pass saved in the
 * other mode is not converted — switching mode is a deliberate act, and a
 * half-served even pass says nothing about where a blueprint draw should be.
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
  const stored = readStored(userId, deckId);
  if (!stored || stored.mode !== mode) return fresh;

  const live = new Set(fresh.all);
  const restoredPool = stored.pool.filter((s) => live.has(s));
  // An empty stored pool is a pass that finished, so the fresh shuffle stands.
  if (restoredPool.length > 0) fresh.pool = restoredPool;

  for (const c of fresh.cats) {
    const s = stored.cats.find((x) => x.name === c.name);
    if (!s) continue;
    const area = new Set(c.all);
    const pool = s.pool.filter((x) => area.has(x));
    if (pool.length > 0) c.pool = pool;
    // `served` is what keeps the areas in their blueprint proportions, so it
    // carries over even when that area's pass has run out and been reshuffled —
    // otherwise every visit would start by serving the heaviest area twice.
    c.served = s.served;
  }
  return fresh;
}
