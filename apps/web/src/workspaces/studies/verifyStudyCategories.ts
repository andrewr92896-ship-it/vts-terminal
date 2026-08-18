// Offline checks for the two halves of category-aware study play: how the game
// picks its next question (deckDraw) and what the category breakdown reports
// (CategoryBreakdown). Neither can be checked by looking at the running app —
// the draw is a proportion that only appears over hundreds of questions, and
// the report's arithmetic is right or wrong in ways a screenshot cannot show.
//
//   npm run verify:study-categories
//
// The fixtures are the shape that prompted the work: a Series 65 game with four
// weighted areas holding an equal number of questions each, plus a 0% area.
// That deck serves every area a quarter of the time on an even draw while the
// exam gives them 15/25/30/30 — the divergence the "% of your answers" column
// exists to show, and the one the blueprint draw removes.

import { buildDraw, canDrawByBlueprint, drawNext } from './deckDraw';
import { buildCategoryReport } from './CategoryBreakdown';
import { emptyDeckGame, recordDeckAnswer } from './studyEngine';

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    console.log(`  ok   ${name}`);
    return;
  }
  failures++;
  console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
}

const CATS = ['Warm-up', 'Economic Factors', 'Investment Vehicles', 'Client Recommendations', 'Laws'];
const WEIGHTS = {
  'Warm-up': 0,
  'Economic Factors': 15,
  'Investment Vehicles': 25,
  'Client Recommendations': 30,
  Laws: 30,
};
const PER_AREA = 100;
const topics: string[] = [];
for (const c of CATS.slice(1)) for (let i = 0; i < PER_AREA; i++) topics.push(c);

console.log('\nThe draw');
check('a blueprint draw is possible on this deck', canDrawByBlueprint(topics, CATS, WEIGHTS));

const state = buildDraw(topics, CATS, WEIGHTS, 'blueprint');
const DRAWS = 1000;
const byArea = new Map<string, number>();
const byQuestion = new Map<number, number>();
for (let i = 0; i < DRAWS; i++) {
  const idx = drawNext(state);
  if (idx == null) break;
  byArea.set(topics[idx], (byArea.get(topics[idx]) ?? 0) + 1);
  byQuestion.set(idx, (byQuestion.get(idx) ?? 0) + 1);
}
const sharePct = (name: string) => (100 * (byArea.get(name) ?? 0)) / DRAWS;
for (const [name, weight] of [
  ['Economic Factors', 15],
  ['Investment Vehicles', 25],
  ['Client Recommendations', 30],
  ['Laws', 30],
] as const) {
  check(`${name} is drawn ${weight}% of the time`, Math.abs(sharePct(name) - weight) <= 0.5, sharePct(name));
}
// An area carrying no weight is off the exam, so a blueprint draw never serves
// it — however many questions the deck holds for it.
check('a 0% area is never drawn', !byArea.has('Warm-up'));

// Within an area every question is seen before any comes round again, so after
// d draws from an area of PER_AREA nothing may have been served more than
// ceil(d / PER_AREA) times. This is what stops a heavily-weighted area becoming
// the same handful of questions over and over.
let earlyRepeats = 0;
for (const [area, drawn] of byArea.entries()) {
  const cap = Math.ceil(drawn / PER_AREA);
  for (const [idx, n] of byQuestion.entries()) if (topics[idx] === area && n > cap) earlyRepeats++;
}
check('no question repeats before its area has been through a full pass', earlyRepeats === 0, earlyRepeats);

// The even draw is exactly what it always was: one pass over the whole deck.
const even = buildDraw(topics, CATS, WEIGHTS, 'even');
const seenEven = new Set<number>();
for (let i = 0; i < topics.length; i++) {
  const idx = drawNext(even);
  if (idx != null) seenEven.add(idx);
}
check('an even pass covers every question exactly once', seenEven.size === topics.length, seenEven.size);

// A blueprint no question matches must not leave the game with nothing to ask.
const mismatched = buildDraw(['Something else'], CATS, WEIGHTS, 'blueprint');
check('an unmatched blueprint falls back to the even pass', drawNext(mismatched) === 0);

console.log('\nThe report');
let game = emptyDeckGame(CATS);
for (let i = 0; i < 30; i++) game = recordDeckAnswer(game, 'Economic Factors', true); // 100% of 30
for (let i = 0; i < 20; i++) game = recordDeckAnswer(game, 'Laws', i < 10); // 50% of 20
for (let i = 0; i < 10; i++) game = recordDeckAnswer(game, 'Investment Vehicles', i < 8); // 80% of 10
const report = buildCategoryReport(CATS, WEIGHTS, game);

check('the game reads as weighted', report.weighted && report.score != null);
const covered = report.rows.filter((r) => r.answered > 0);
const available = covered.reduce((a, r) => a + (r.pointsAvailable ?? 0), 0);
check('the covered areas total 100 points', Math.abs(available - 100) < 1e-9, available);
check(
  'the points earned add up to the score',
  Math.abs(covered.reduce((a, r) => a + (r.pointsEarned ?? 0), 0) - (report.score ?? 0)) < 1e-9,
  report.score,
);
// The rule the whole feature rests on: an area never asked about is rescaled
// out and named, never scored as a zero the learner has to explain.
check('an unpractised area is named rather than scored', report.uncovered.includes('Client Recommendations'), report.uncovered);
check(
  'an unpractised area carries no points at all',
  report.rows.find((r) => r.name === 'Client Recommendations')?.pointsAvailable === null,
);
// The exam share is the blueprint's, not the rescaled points — they differ
// whenever something is unpractised, and reading one as the other would say the
// exam had changed shape.
check('the exam share stays the blueprint share', Math.round(report.rows.find((r) => r.name === 'Economic Factors')!.share!) === 15);
check(
  'the practice share is what was actually asked',
  Math.round(report.rows.find((r) => r.name === 'Economic Factors')!.askedShare!) === 50,
);
check('the focus list leads with the costliest area', report.focus[0]?.name === 'Laws', report.focus);

const blank = buildCategoryReport(CATS, WEIGHTS, emptyDeckGame(CATS));
check('a game not yet played still lists every weighted area', blank.rows.length === 4, blank.rows.map((r) => r.name));
check('a game not yet played has no score', blank.score === null);

let plain = emptyDeckGame(['A', 'B']);
for (let i = 0; i < 4; i++) plain = recordDeckAnswer(plain, 'A', i < 3);
const unweighted = buildCategoryReport(['A', 'B'], null, plain);
check('an unweighted game reports no weighted score', !unweighted.weighted && unweighted.score === null);
check('an unweighted game still reports its accuracy', Math.round(unweighted.rows.find((r) => r.name === 'A')!.accuracy!) === 75);

console.log(failures === 0 ? '\n✓ study category checks passed\n' : `\n✗ ${failures} check(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
