// Category weights: scoring a practice test the way the real exam scores it.
//
// A study game already knows its categories and which one every question sits
// in. What it could not say is that the exam behind it gives those categories
// DIFFERENT SHARES of the paper — the Series 65 devotes a set percentage of its
// questions to each topic area — so a raw "18 of 20 correct" on a sample that
// happened to draw eight questions from one easy area is not the score that
// exam would give.
//
// Two things follow from that, and they are separate:
//
//  1. THE DRAW mirrors the blueprint. A 20-question sitting on a 15% category
//     draws about three from it. This is what makes the sitting resemble the
//     real paper, and it is why weights are not just arithmetic applied at the
//     end.
//  2. THE SCORE is the weighted mean of each category's accuracy — and it does
//     NOT depend on how many questions were drawn from each. That is the whole
//     point of weighting: getting four of five right in a 15% area is worth 15%
//     × 80% whether the draw took five questions from it or fifty. The draw
//     only decides how PRECISE each category's accuracy estimate is.
//
// Weights are stored raw, as the author typed them, and normalized here. So a
// list totalling 95 or 103 still scores correctly, and a category removed after
// the fact cannot leave a weight behind that counts toward the denominator.

export type CategoryWeights = Record<string, number> | null;

export interface WeightedCategory {
  name: string;
  weight: number; // as the author typed it
  share: number; // 0..1, normalized across the weighted categories
}

// Look a weight up case-insensitively, the way the rest of the study code
// matches category names (a question's topic and the stored category list can
// differ in case).
function weightFor(weights: Record<string, number>, name: string): number {
  const direct = weights[name];
  if (typeof direct === 'number' && Number.isFinite(direct) && direct >= 0) return direct;
  const lower = name.trim().toLowerCase();
  for (const [k, v] of Object.entries(weights)) {
    if (k.trim().toLowerCase() === lower) {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    }
  }
  return 0;
}

// Every category with its weight and its normalized share. Categories the
// author left at zero are included with a share of 0 — they are excluded from
// the exam on purpose, which is a statement worth showing rather than a gap.
export function weightedCategories(categories: string[], weights: CategoryWeights): WeightedCategory[] {
  if (!weights) return [];
  const withWeight = categories.map((name) => ({ name, weight: weightFor(weights, name) }));
  const total = withWeight.reduce((a, c) => a + c.weight, 0);
  return withWeight.map((c) => ({ ...c, share: total > 0 ? c.weight / total : 0 }));
}

// Whether this game can be sat as a weighted test at all: weights are set and at
// least one category carries a non-zero one. A game whose weights are all zero
// has nothing on the paper, so it falls back to plain scoring.
export function hasUsableWeights(categories: string[], weights: CategoryWeights): boolean {
  return weightedCategories(categories, weights).some((c) => c.weight > 0);
}

// The total the author has typed, which the editor shows so they can make it
// read 100. Not enforced — see the module note on normalization.
export function weightTotal(categories: string[], weights: CategoryWeights): number {
  if (!weights) return 0;
  return categories.reduce((a, c) => a + weightFor(weights, c), 0);
}

// ---- The draw ----

export interface DrawAllocation {
  name: string;
  wanted: number; // what the blueprint asked for at this test length
  drawn: number; // what the deck could actually supply
}

/**
 * How many questions each category contributes to a sitting of `size`.
 *
 * Highest-averages allocation (repeatedly give the next question to whichever
 * category has the worst questions-per-weight so far), capped by what each
 * category actually holds. Chosen over the more familiar largest-remainder
 * method because capacity falls out of it for free: a category with only two
 * questions simply stops winning rounds, and the questions it cannot supply go
 * on to whichever category is next most under-served — still in blueprint
 * order, rather than to whoever happens to be first in the list.
 *
 * Always sums to `size`, or to everything the deck holds when that is less.
 * Deterministic: ties break on the larger weight, then the name, so the same
 * game and the same length always compose the same paper.
 */
export function allocateDraw(
  entries: { name: string; weight: number; available: number }[],
  size: number,
): Map<string, number> {
  const pool = entries.filter((e) => e.weight > 0 && e.available > 0);
  const out = new Map<string, number>();
  for (const e of pool) out.set(e.name, 0);
  if (pool.length === 0 || size <= 0) return out;

  for (let i = 0; i < size; i++) {
    let best: { name: string; weight: number } | null = null;
    let bestQuotient = -1;
    for (const e of pool) {
      const taken = out.get(e.name) ?? 0;
      if (taken >= e.available) continue;
      const quotient = e.weight / (taken + 1);
      if (
        quotient > bestQuotient ||
        (quotient === bestQuotient &&
          best !== null &&
          (e.weight > best.weight || (e.weight === best.weight && e.name < best.name)))
      ) {
        bestQuotient = quotient;
        best = { name: e.name, weight: e.weight };
      }
    }
    if (!best) break; // the deck ran out before the test length was reached
    out.set(best.name, (out.get(best.name) ?? 0) + 1);
  }
  return out;
}

/**
 * Draw a blueprint-shaped sitting from a deck's questions.
 *
 * Returns the drawn questions (shuffled together, so categories are not served
 * in blocks) and what each category contributed against what the blueprint
 * asked for — the shortfalls are worth showing, since a 15% category the deck
 * can only supply two questions for is a noisy estimate of that 15%.
 */
export function drawWeighted<T>(
  questions: T[],
  topicOf: (q: T) => string,
  categories: string[],
  weights: CategoryWeights,
  size: number,
  shuffle: <U>(a: U[]) => U[],
): { questions: T[]; allocations: DrawAllocation[] } {
  const byTopic = new Map<string, T[]>();
  for (const q of questions) {
    const key = (topicOf(q) || 'General').trim().toLowerCase();
    const list = byTopic.get(key);
    if (list) list.push(q);
    else byTopic.set(key, [q]);
  }

  const weighted = weightedCategories(categories, weights);
  const entries = weighted.map((c) => ({
    name: c.name,
    weight: c.weight,
    available: (byTopic.get(c.name.trim().toLowerCase()) ?? []).length,
  }));

  const alloc = allocateDraw(entries, size);
  const totalWeight = entries.reduce((a, e) => a + e.weight, 0);

  const drawn: T[] = [];
  const allocations: DrawAllocation[] = [];
  for (const e of entries) {
    if (e.weight <= 0) continue;
    const take = alloc.get(e.name) ?? 0;
    const pool = byTopic.get(e.name.trim().toLowerCase()) ?? [];
    drawn.push(...shuffle(pool).slice(0, take));
    allocations.push({
      name: e.name,
      // What a deck with unlimited questions would have supplied — the honest
      // comparison for a shortfall, and never more than the category holds in
      // the ideal case where it holds enough.
      wanted: totalWeight > 0 ? Math.round((size * e.weight) / totalWeight) : 0,
      drawn: take,
    });
  }

  return { questions: shuffle(drawn), allocations };
}

// ---- The score ----

export interface CategoryResult {
  name: string;
  weight: number;
  share: number; // 0..1 of the weight actually in play (covered categories only)
  correct: number;
  total: number;
  accuracy: number | null; // % correct within the category, null when not covered
  pointsAvailable: number; // of 100, what this category could contribute
  pointsEarned: number; // of 100, what it did contribute
}

export interface WeightedResult {
  score: number; // 0..100, the weighted score
  categories: CategoryResult[];
  // Weighted categories the sitting drew nothing from. Their weight is
  // redistributed across the rest rather than scored as zero — see below.
  uncovered: string[];
}

/**
 * The weighted score: each category's accuracy times its share of the paper.
 *
 * A category the sitting never drew from is NOT scored as zero. Its weight is
 * taken out of the denominator and the rest rescaled, so the score is measured
 * only over what the learner was actually asked. Scoring an undrawn category as
 * zero would mark somebody down for a question they were never given — on a
 * short sitting that is most of the paper, and the number would read as a real
 * exam result while being nothing of the kind. Which categories went uncovered
 * is returned so the screen can say so.
 *
 * Returns null when nothing weighted was covered at all.
 */
export function weightedResult(
  categories: string[],
  weights: CategoryWeights,
  tally: Map<string, { correct: number; total: number }>,
): WeightedResult | null {
  const weighted = weightedCategories(categories, weights).filter((c) => c.weight > 0);
  if (weighted.length === 0) return null;

  const readTally = (name: string) => {
    const direct = tally.get(name);
    if (direct) return direct;
    const lower = name.trim().toLowerCase();
    for (const [k, v] of tally.entries()) if (k.trim().toLowerCase() === lower) return v;
    return { correct: 0, total: 0 };
  };

  const covered = weighted.filter((c) => readTally(c.name).total > 0);
  const inPlay = covered.reduce((a, c) => a + c.weight, 0);
  if (inPlay <= 0) return null;

  let score = 0;
  const results: CategoryResult[] = weighted.map((c) => {
    const t = readTally(c.name);
    const accuracy = t.total > 0 ? (100 * t.correct) / t.total : null;
    const share = t.total > 0 ? c.weight / inPlay : 0;
    const pointsAvailable = share * 100;
    const pointsEarned = accuracy == null ? 0 : (share * accuracy);
    score += pointsEarned;
    return {
      name: c.name,
      weight: c.weight,
      share,
      correct: t.correct,
      total: t.total,
      accuracy,
      pointsAvailable,
      pointsEarned,
    };
  });

  return {
    score,
    categories: results,
    uncovered: weighted.filter((c) => readTally(c.name).total === 0).map((c) => c.name),
  };
}
