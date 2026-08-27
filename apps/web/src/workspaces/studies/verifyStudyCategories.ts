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

import {
  buildDraw,
  canDrawByBlueprint,
  clearDraw,
  drawNext,
  loadDraw,
  passRemaining,
  saveDraw,
} from './deckDraw';
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
// `seq` is deliberately not the array position: a real deck's seqs are stable
// ids with gaps in them, and the draw is keyed by seq.
const questions: { seq: number; topic: string }[] = [];
for (const c of CATS.slice(1)) for (let i = 0; i < PER_AREA; i++) questions.push({ seq: 1000 + questions.length * 3, topic: c });
const topicOf = new Map(questions.map((q) => [q.seq, q.topic]));

console.log('\nThe draw');
check('a blueprint draw is possible on this deck', canDrawByBlueprint(questions, CATS, WEIGHTS));

const state = buildDraw(questions, CATS, WEIGHTS, 'blueprint');
const DRAWS = 1000;
const byArea = new Map<string, number>();
const byQuestion = new Map<number, number>();
for (let i = 0; i < DRAWS; i++) {
  const seq = drawNext(state);
  if (seq == null) break;
  const area = topicOf.get(seq)!;
  byArea.set(area, (byArea.get(area) ?? 0) + 1);
  byQuestion.set(seq, (byQuestion.get(seq) ?? 0) + 1);
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
  for (const [seq, n] of byQuestion.entries()) if (topicOf.get(seq) === area && n > cap) earlyRepeats++;
}
check('no question repeats before its area has been through a full pass', earlyRepeats === 0, earlyRepeats);

// The even draw is exactly what it always was: one pass over the whole deck.
const even = buildDraw(questions, CATS, WEIGHTS, 'even');
const seenEven = new Set<number>();
for (let i = 0; i < questions.length; i++) {
  const seq = drawNext(even);
  if (seq != null) seenEven.add(seq);
}
check('an even pass covers every question exactly once', seenEven.size === questions.length, seenEven.size);

// A blueprint no question matches must not leave the game with nothing to ask.
const mismatched = buildDraw([{ seq: 7, topic: 'Something else' }], CATS, WEIGHTS, 'blueprint');
check('an unmatched blueprint falls back to the even pass', drawNext(mismatched) === 7);

// ---- The pass survives leaving the screen ----
//
// This is the check that matters most here, because its absence is invisible
// from inside the app: every visit reshuffled the deck and started again, so a
// learner answering twenty questions a sitting was really being sampled WITH
// replacement — heavy repeats, and questions they never once saw. Nothing
// looked broken; the shuffle was fine and was being thrown away.
console.log('\nThe pass across visits');

// localStorage does not exist in Node, so stand one up. The module only ever
// uses getItem/setItem/removeItem.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const USER = 'u1';
const DECK = 'd1';
clearDraw(USER, DECK);

// A sitting: draw 30, saving as the game does, then "leave and come back".
let visit = loadDraw(USER, DECK, questions, CATS, WEIGHTS, 'even');
const firstSitting: number[] = [];
for (let i = 0; i < 30; i++) {
  const seq = drawNext(visit)!;
  firstSitting.push(seq);
  saveDraw(USER, DECK, visit);
}
check('the pass has shrunk by what was asked', passRemaining(visit) === questions.length - 30, passRemaining(visit));

visit = loadDraw(USER, DECK, questions, CATS, WEIGHTS, 'even');
check('coming back carries on rather than restarting', passRemaining(visit) === questions.length - 30, passRemaining(visit));

const asked = new Set(firstSitting);
const secondSitting: number[] = [];
for (let i = 0; i < 30; i++) {
  const seq = drawNext(visit)!;
  secondSitting.push(seq);
  saveDraw(USER, DECK, visit);
}
check('nothing from the first sitting comes back in the second', secondSitting.every((s) => !asked.has(s)));

// Work all the way through, across a fresh "visit" every ten questions, and
// every question in the deck must have been asked exactly once.
const seen = new Map<number, number>();
for (const s of [...firstSitting, ...secondSitting]) seen.set(s, 1);
let drawn = firstSitting.length + secondSitting.length;
while (drawn < questions.length) {
  visit = loadDraw(USER, DECK, questions, CATS, WEIGHTS, 'even');
  for (let i = 0; i < 10 && drawn < questions.length; i++, drawn++) {
    const seq = drawNext(visit)!;
    seen.set(seq, (seen.get(seq) ?? 0) + 1);
    saveDraw(USER, DECK, visit);
  }
}
check('a whole deck is worked through across many visits', seen.size === questions.length, seen.size);
check('and nothing was asked twice on the way', [...seen.values()].every((n) => n === 1));

// A finished pass reshuffles rather than running dry.
visit = loadDraw(USER, DECK, questions, CATS, WEIGHTS, 'even');
check('the round after a finished one is a full one', passRemaining(visit) === questions.length, passRemaining(visit));

// A question deleted from the deck drops out of a saved pass; the rest of the
// pass is kept rather than thrown away with it.
//
// The two cases are separated deliberately, and the counts are EXACT. Deleting
// question 0 and allowing a +/-1 slack looked equivalent and was flaky: the pass
// is shuffled, so about one run in eighty had already served question 0, the
// pool was a question longer than the slack allowed, and the check failed for a
// reason that had nothing to do with the behaviour it names. A tolerance wide
// enough to cover both cases would also stop distinguishing them. So pick the
// question by whether it was served, and assert the exact figure.
clearDraw(USER, DECK);
let editing = loadDraw(USER, DECK, questions, CATS, WEIGHTS, 'even');
const served = new Set<number>();
for (let i = 0; i < 5; i++) served.add(drawNext(editing)!);
saveDraw(USER, DECK, editing);

// Still in the pass: the pass loses that one question and keeps the rest.
const pending = questions.find((q) => !served.has(q.seq))!;
const trimmed = questions.filter((q) => q.seq !== pending.seq);
const afterEdit = loadDraw(USER, DECK, trimmed, CATS, WEIGHTS, 'even');
check(
  'a deleted question leaves the saved pass without resetting it',
  passRemaining(afterEdit) === trimmed.length - 5,
  passRemaining(afterEdit),
);
check('a deleted question is never served', !afterEdit.pool.includes(pending.seq));

// Already served: it was not in the pass, so removing it takes nothing out of
// it — and must not be read as a reason to reshuffle either.
const alreadyAsked = questions.find((q) => served.has(q.seq))!;
const withoutAsked = questions.filter((q) => q.seq !== alreadyAsked.seq);
const afterAskedEdit = loadDraw(USER, DECK, withoutAsked, CATS, WEIGHTS, 'even');
check(
  'deleting an already-served question leaves the pass alone',
  passRemaining(afterAskedEdit) === questions.length - 5,
  passRemaining(afterAskedEdit),
);
check('a deleted served question is never served again', !afterAskedEdit.pool.includes(alreadyAsked.seq));

// A pass saved in one mode is not carried into the other: a half-served even
// pass says nothing about where a blueprint draw should be.
const other = loadDraw(USER, DECK, questions, CATS, WEIGHTS, 'blueprint');
check('switching mode starts that mode fresh', passRemaining(other) === questions.length, passRemaining(other));

// Blueprint proportions have to hold ACROSS visits too — the served counts are
// what keeps the areas in step, so they carry over with the pass.
clearDraw(USER, DECK);
const areaTally = new Map<string, number>();
for (let v = 0; v < 25; v++) {
  const bp = loadDraw(USER, DECK, questions, CATS, WEIGHTS, 'blueprint');
  for (let i = 0; i < 20; i++) {
    const seq = drawNext(bp)!;
    areaTally.set(topicOf.get(seq)!, (areaTally.get(topicOf.get(seq)!) ?? 0) + 1);
    saveDraw(USER, DECK, bp);
  }
}
for (const [name, weight] of [
  ['Economic Factors', 15],
  ['Investment Vehicles', 25],
  ['Client Recommendations', 30],
  ['Laws', 30],
] as const) {
  const got = (100 * (areaTally.get(name) ?? 0)) / 500;
  check(`${name} holds its ${weight}% share across 25 visits`, Math.abs(got - weight) <= 1, got);
}

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
