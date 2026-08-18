import { weightedCategories, type CategoryWeights } from './examWeights';

// How the study game picks the next question.
//
// Two modes, and the difference is the whole point:
//
//  * `even` — what the game has always done. One shuffled pass over every
//    question in the deck, so each question comes up once before any comes up
//    twice. The MIX that produces is whatever mix the deck holds: a deck with
//    100 questions in each of four areas serves them a quarter each, however
//    the exam actually splits.
//  * `blueprint` — the mix the exam asks for. The next question is taken from
//    whichever weighted area is furthest behind its share (highest averages,
//    the same rule `allocateDraw` composes a practice test with), and then from
//    that area's OWN shuffled pass — so a 30% area comes up twice as often as a
//    15% one, and within an area every question is still seen before any
//    repeats.
//
// The learner chooses per game, and `even` is the default: a deck whose
// question mix already matches its blueprint plays identically either way, and
// nobody's game changes on deploy.
//
// Areas carrying no weight are off the exam, so a blueprint draw never serves
// them. A blueprint that no question in the deck matches falls back to the even
// pass rather than serving nothing.

export type DrawMode = 'even' | 'blueprint';

interface CatPool {
  name: string;
  weight: number;
  all: number[]; // every question index in this area
  pool: number[]; // what is left of the current pass, popped from the end
  served: number; // how many this run has drawn from it
}

export interface DrawState {
  mode: DrawMode;
  all: number[]; // every question index
  pool: number[]; // the even pass
  cats: CatPool[]; // the weighted areas, when a blueprint draw is possible
}

export function shuffledIndices(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
 * Build the draw for a deck. `topics` is each question's category, by index —
 * matched to the deck's category names the way the rest of the study code
 * matches them (trimmed, case-insensitively).
 */
export function buildDraw(
  topics: string[],
  categories: string[],
  weights: CategoryWeights,
  mode: DrawMode,
): DrawState {
  const state: DrawState = {
    mode,
    all: Array.from({ length: topics.length }, (_, i) => i),
    pool: shuffledIndices(topics.length),
    cats: [],
  };
  if (mode !== 'blueprint') return state;

  const byTopic = new Map<string, number[]>();
  topics.forEach((t, i) => {
    const k = key(t);
    const list = byTopic.get(k);
    if (list) list.push(i);
    else byTopic.set(k, [i]);
  });

  for (const c of weightedCategories(categories, weights)) {
    if (c.weight <= 0) continue;
    const all = byTopic.get(key(c.name)) ?? [];
    if (all.length === 0) continue;
    state.cats.push({ name: c.name, weight: c.weight, all, pool: shuffle(all), served: 0 });
  }
  return state;
}

// Whether a blueprint draw would actually do anything on this deck: at least
// one weighted area has questions to serve. Deliberately does NOT build a draw
// — this is read on every render of the game screen, and building one shuffles
// every question in the deck.
export function canDrawByBlueprint(topics: string[], categories: string[], weights: CategoryWeights): boolean {
  const present = new Set(topics.map(key));
  return weightedCategories(categories, weights).some((c) => c.weight > 0 && present.has(key(c.name)));
}

/**
 * The next question's index, or null on an empty deck. Mutates the state: a
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
      const idx = best.pool.pop();
      if (idx != null) {
        best.served += 1;
        return idx;
      }
    }
  }

  if (state.pool.length === 0) state.pool = shuffle(state.all);
  const idx = state.pool.pop();
  return idx == null ? null : idx;
}

// Take one question out of whatever is left of the current pass — used when a
// question is restored from a saved session, so it does not come straight back
// round as the next one drawn.
export function dropIndex(state: DrawState, index: number): void {
  state.pool = state.pool.filter((i) => i !== index);
  for (const c of state.cats) c.pool = c.pool.filter((i) => i !== index);
}
