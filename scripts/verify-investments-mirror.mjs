#!/usr/bin/env node
// The public API's portfolio math is a VERBATIM MIRROR of the private one, and
// this is what makes that safe.
//
// It has to be a copy: the public API is forbidden from importing private
// application code, and that boundary is a flat rule on purpose — one with
// judgement calls in it stops being a boundary. So the risk this check exists
// for is drift, and drift here is silent: two screens would quietly disagree
// about what a portfolio is worth, with neither one erroring.
//
// Two assertions, and the first is the strong one:
//
//   1. The two files are byte-for-byte identical below their headers. A
//      behavioural check can only cover the cases somebody thought of; equality
//      covers every case there will ever be.
//   2. Both are then run through the same fixtures, so a mirror that somehow
//      passed the text check while behaving differently — a differing compiler
//      target, a changed import — still fails here.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const PRIVATE = fileURLToPath(new URL('../apps/api/src/investments/math.ts', import.meta.url));
const PUBLIC = fileURLToPath(new URL('../apps/public-api/src/investmentsMath.ts', import.meta.url));
// Both files begin their shared body at this declaration. Everything above it is
// the header each side needs for itself — one imports the asset-class list, the
// other declares it — and is deliberately allowed to differ.
const BODY_STARTS_AT = 'export type PriceSource';

let failures = 0;
const check = (name, ok, detail) => {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${detail}`}`);
  }
};

const bodyOf = (source, path) => {
  const at = source.indexOf(BODY_STARTS_AT);
  if (at < 0) throw new Error(`${path} no longer starts its body with "${BODY_STARTS_AT}" — the mirror check cannot compare them.`);
  return source.slice(at);
};

console.log('investments math mirror');

const privateSource = await readFile(PRIVATE, 'utf8');
const publicSource = await readFile(PUBLIC, 'utf8');
const privateBody = bodyOf(privateSource, 'apps/api/src/investments/math.ts');
const publicBody = bodyOf(publicSource, 'apps/public-api/src/investmentsMath.ts');

if (privateBody === publicBody) {
  check('the two files are identical below their headers', true);
} else {
  // Name the first differing line, because "they differ" over 370 lines is not
  // something anybody can act on.
  const a = privateBody.split('\n');
  const b = publicBody.split('\n');
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const line = i + privateSource.slice(0, privateSource.indexOf(BODY_STARTS_AT)).split('\n').length;
  check('the two files are identical below their headers', false,
    `first difference at math.ts line ~${line}\n         private: ${JSON.stringify(a[i] ?? '(end of file)')}\n          public: ${JSON.stringify(b[i] ?? '(end of file)')}`);
  console.log('\n  → Regenerate the mirror from the source rather than editing it by hand:');
  console.log('    the header of investmentsMath.ts is kept, everything from');
  console.log(`    "${BODY_STARTS_AT}" down is copied out of math.ts.`);
}

// Behaviour, over the cases the rules are actually about.
const priv = await import('../apps/api/src/investments/math.ts');
const pub = await import('../apps/public-api/src/investmentsMath.ts');

const holding = (over = {}) => ({
  id: 'h', accountId: 'a', symbol: 'AAA', name: 'A fund', assetClass: 'us_stock',
  quantity: 10, costBasis: 1_000, price: 150, priceSource: 'live', previousClose: 145,
  sector: null, region: null, ...over,
});

const FIXTURES = [
  ['a priced holding', [holding()], 0],
  ['an UNPRICED holding is excluded and counted, never zero', [holding({ price: null, priceSource: 'none' })], 0],
  ['a mix of priced and unpriced', [holding(), holding({ id: 'h2', price: null, priceSource: 'none' })], 500],
  ['a manually priced holding', [holding({ priceSource: 'manual', previousClose: null })], 0],
  ['no cost basis', [holding({ costBasis: null })], 0],
  ['a zero cost basis does not divide', [holding({ costBasis: 0 })], 0],
  ['cash only, no holdings', [], 2_500],
  ['nothing at all', [], 0],
];

for (const [name, holdings, cash] of FIXTURES) {
  const a = priv.totalPortfolio(holdings.map(priv.valueHolding), cash);
  const b = pub.totalPortfolio(holdings.map(pub.valueHolding), cash);
  check(`totals agree — ${name}`, JSON.stringify(a) === JSON.stringify(b), `\n         private: ${JSON.stringify(a)}\n          public: ${JSON.stringify(b)}`);
}

for (const dimension of ['assetClass', 'sector', 'region']) {
  const holdings = [
    holding(),
    holding({ id: 'h2', assetClass: 'crypto', sector: 'Tech', region: 'US', price: 20, quantity: 3 }),
    holding({ id: 'h3', assetClass: 'bond', sector: null, region: null, price: null, priceSource: 'none' }),
  ];
  const a = priv.allocateBy(holdings.map(priv.valueHolding), dimension, 1_000);
  const b = pub.allocateBy(holdings.map(pub.valueHolding), dimension, 1_000);
  check(`allocation agrees by ${dimension}`, JSON.stringify(a) === JSON.stringify(b));
}

{
  const holdings = [holding({ quantity: 100 }), holding({ id: 'h2', quantity: 1, price: 5 })].map(priv.valueHolding);
  const pubHoldings = [holding({ quantity: 100 }), holding({ id: 'h2', quantity: 1, price: 5 })].map(pub.valueHolding);
  const total = priv.totalPortfolio(holdings, 0).value;
  const a = priv.concentrationFlags(holdings, priv.allocateBy(holdings, 'assetClass', 0), total);
  const b = pub.concentrationFlags(pubHoldings, pub.allocateBy(pubHoldings, 'assetClass', 0), total);
  check('concentration observations agree', JSON.stringify(a) === JSON.stringify(b));
  // The regulatory posture of the whole workspace: these describe, never advise.
  check('and stay descriptive rather than advisory',
    a.every((f) => !/should|consider|recommend|ought|trim|rebalance|buy|sell/i.test(f.text)),
    JSON.stringify(a.map((f) => f.text)));
}

{
  const points = [
    { onDate: '2026-01-31', value: 10_000, contributions: 0 },
    { onDate: '2026-02-28', value: 11_000, contributions: 500 },
    { onDate: '2026-03-31', value: 10_500, contributions: 0 },
  ];
  check('performance summaries agree',
    JSON.stringify(priv.summarizePerformance(points)) === JSON.stringify(pub.summarizePerformance(points)));
  check('the last twelve month keys agree',
    JSON.stringify(priv.last12MonthKeys('2026-08-28')) === JSON.stringify(pub.last12MonthKeys('2026-08-28')));
  check('projections agree',
    JSON.stringify(priv.project(10_000, 500, 7, 10)) === JSON.stringify(pub.project(10_000, 500, 7, 10)));
}

check('the asset-class labels agree', JSON.stringify(priv.ASSET_CLASS_LABELS) === JSON.stringify(pub.ASSET_CLASS_LABELS));

console.log(failures === 0 ? '\n✓ investments math mirror verified' : `\n✗ ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
