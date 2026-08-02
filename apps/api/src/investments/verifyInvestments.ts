import {
  allocateBy,
  concentrationFlags,
  last12MonthKeys,
  project,
  summarizePerformance,
  totalPortfolio,
  valueHolding,
  type HoldingValue,
  type PricedHolding,
} from './math.js';
import { contributionLimit, hasLimitsFor, limitGroupFor } from './limits.js';

// Offline check of the Investments portfolio math (`math.ts`, `limits.ts`).
//
// The things worth getting wrong quietly here are the ones that make a tracker
// lie rather than crash: valuing an unpriced holding at zero (which silently
// understates a portfolio), claiming a day move computed over a sliver of the
// book, or reporting a rise as market gain when it was just money being added.
// None of that can be caught by running the app — every figure looks plausible.
//
//     npm run verify:investments           (root or @vts/api)
//
// Exits non-zero on the first mismatch. Reads no network and no database.

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}\n       expected ${e}\n       actual   ${a}`);
  }
}

function close(label: string, actual: number | null, expected: number, tol = 0.01): void {
  if (actual != null && Math.abs(actual - expected) <= tol) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}\n       expected ~${expected}\n       actual   ${actual}`);
  }
}

function holding(over: Partial<PricedHolding> = {}): PricedHolding {
  return {
    id: 'h',
    accountId: 'a',
    symbol: 'VTI',
    name: 'Vanguard Total Market',
    assetClass: 'us_stock',
    quantity: 10,
    costBasis: 1000,
    price: 150,
    priceSource: 'live',
    previousClose: 148,
    sector: null,
    region: null,
    ...over,
  };
}

console.log('\nHolding valuation');
{
  const v = valueHolding(holding());
  check('value = quantity x price', v.value, 1500);
  check('gain = value - cost basis', v.gain, 500);
  close('gain % over cost basis', v.gainPct, 50);
  close('day change = (price - prev close) x quantity', v.dayChange, 20);
  close('day change %', v.dayChangePct, 1.3514);

  // The rule the whole module exists for: no price is not zero.
  const unpriced = valueHolding(holding({ price: null, priceSource: 'none', previousClose: null }));
  check('an unpriced holding has a null value, not 0', unpriced.value, null);
  check('an unpriced holding has no gain', unpriced.gain, null);

  const noPrevClose = valueHolding(holding({ previousClose: null }));
  check('no previous close means no day move is claimed', noPrevClose.dayChange, null);

  const noBasis = valueHolding(holding({ costBasis: null }));
  check('no cost basis means no gain is claimed', noBasis.gain, null);

  const zeroBasis = valueHolding(holding({ costBasis: 0 }));
  check('a zero cost basis does not divide by zero', zeroBasis.gainPct, null);
}

console.log('\nPortfolio totals');
{
  const holdings: HoldingValue[] = [
    valueHolding(holding({ id: '1', quantity: 10, price: 150, costBasis: 1000, previousClose: 148 })),
    // Priced from the user's own figure: counts toward value, but carries no
    // previous close, so it must not drag the day-move coverage upward.
    valueHolding(
      holding({ id: '2', quantity: 5, price: 100, costBasis: 400, priceSource: 'manual', previousClose: null }),
    ),
    // No price at all: excluded from value entirely and counted.
    valueHolding(holding({ id: '3', price: null, priceSource: 'none', previousClose: null })),
  ];
  const t = totalPortfolio(holdings, 250);

  check('value = priced holdings + cash', t.value, 1500 + 500 + 250);
  check('cash is carried through', t.cash, 250);
  check('cost basis counts only holdings that have one', t.costBasis, 1400);
  check('gain = value - basis over those holdings', t.gain, 600);
  check('unpriced holdings are counted, not valued', t.unpricedCount, 1);
  check('manual and live prices are counted separately', [t.manualCount, t.livePricedCount], [1, 1]);
  close('day change covers only the holding that had a previous close', t.dayChange, 20);
  // 1500 of 2000 in priced holdings — cash is excluded from the denominator
  // because cash has no day move to cover.
  close('day-change coverage is a fraction of priced holding value', t.dayChangeCoverage, 0.75);

  const empty = totalPortfolio([], 0);
  check('an empty portfolio reports no gain percentage rather than 0%', empty.gainPct, null);
  check('an empty portfolio has zero day-change coverage', empty.dayChangeCoverage, 0);
}

console.log('\nAllocation');
{
  const holdings: HoldingValue[] = [
    valueHolding(holding({ id: '1', assetClass: 'us_stock', quantity: 10, price: 100, sector: 'Tech' })),
    valueHolding(holding({ id: '2', assetClass: 'bond', quantity: 10, price: 50, sector: null })),
    valueHolding(holding({ id: '3', assetClass: 'us_stock', quantity: 10, price: 50, sector: 'tech' })),
    valueHolding(holding({ id: '4', price: null, priceSource: 'none' })),
  ];

  const byClass = allocateBy(holdings, 'assetClass', 100);
  check(
    'buckets by asset class, cash included, largest first',
    byClass.map((b) => [b.key, b.value]),
    [
      ['us_stock', 1500],
      ['bond', 500],
      ['cash', 100],
    ],
  );
  close('percentages are over the allocated total', byClass[0]!.pct, (1500 / 2100) * 100);
  check('an unpriced holding is not allocated', byClass.reduce((s, b) => s + b.value, 0), 2100);

  const bySector = allocateBy(holdings, 'sector');
  check(
    'sector buckets fold case and label uncategorised holdings honestly',
    bySector.map((b) => [b.label, b.value]),
    [
      ['Tech', 1500],
      ['Not set', 500],
    ],
  );
}

console.log('\nConcentration flags');
{
  const one = valueHolding(holding({ id: '1', name: 'Acme', quantity: 10, price: 100 }));
  const two = valueHolding(holding({ id: '2', name: 'Beta', assetClass: 'bond', quantity: 1, price: 100 }));
  const byClass = allocateBy([one, two], 'assetClass');
  const flags = concentrationFlags([one, two], byClass, 1100);

  const texts = flags.map((f) => f.text);
  check('names the single biggest holding as a fact', texts[0], '91% of your portfolio is in a single holding — Acme.');
  // The regulatory line for the whole workspace: describe, never advise.
  const advice = /should|recommend|consider|trim|buy|sell|rebalance|we suggest/i;
  check('no flag contains advice language', texts.some((t) => advice.test(t)), false);

  // Build a portfolio of N equally-sized holdings, each in its own asset class.
  const evenBook = (n: number): HoldingValue[] => {
    const classes = ['us_stock', 'bond', 'intl_stock', 'real_estate', 'commodity'] as const;
    return Array.from({ length: n }, (_, i) =>
      valueHolding(holding({ id: String(i), assetClass: classes[i % classes.length], quantity: 1, price: 100 })),
    );
  };
  const flagsFor = (book: HoldingValue[]) =>
    concentrationFlags(book, allocateBy(book, 'assetClass'), book.length * 100);

  // The reason the threshold is not a flat 25%: an even four-holding portfolio
  // has every position at exactly 25%, and flagging that teaches the user to
  // ignore the panel.
  check('an even 4-holding portfolio is not called concentrated', flagsFor(evenBook(4)).length, 0);
  check('an even 5-holding portfolio is not called concentrated', flagsFor(evenBook(5)).length, 0);

  // But large in absolute terms is still worth stating, however few you hold.
  const half = [
    valueHolding(holding({ id: '1', name: 'Acme', quantity: 1, price: 500 })),
    valueHolding(holding({ id: '2', name: 'Beta', assetClass: 'bond', quantity: 1, price: 500 })),
  ];
  check(
    'half the portfolio in one holding is flagged even with only two',
    flagsFor(half).some((f) => f.text.includes('Acme')),
    true,
  );

  // And disproportionate relative to an even split is flagged too.
  const lopsided = [
    valueHolding(holding({ id: '1', name: 'Acme', quantity: 1, price: 300 })),
    ...Array.from({ length: 7 }, (_, i) =>
      valueHolding(holding({ id: `f${i}`, name: `F${i}`, assetClass: 'bond', quantity: 1, price: 100 })),
    ),
  ];
  check(
    'a 30% position among eight holdings is flagged',
    flagsFor(lopsided).some((f) => f.text.includes('Acme')),
    true,
  );
}

console.log('\nPerformance split');
{
  // Value went 10,000 -> 12,000, but 1,500 of that was money added. The market
  // did 500, not 2,000. Getting this backwards is the most common way a tracker
  // flatters its owner.
  const points = [
    { onDate: '2026-01-01', value: 10000, contributedToDate: 0 },
    { onDate: '2026-07-01', value: 12000, contributedToDate: 1500 },
  ];
  const s = summarizePerformance(points, 1500)!;
  check('start and end values', [s.startValue, s.endValue], [10000, 12000]);
  check('contributions inside the window', s.contributed, 1500);
  check('market gain excludes what was added', s.marketGain, 500);
  close('market gain % is over the money that was at work', s.marketGainPct, (500 / 11500) * 100);
  check('day count between readings', s.days, 181);

  check('a single reading is not a performance history', summarizePerformance([points[0]!], 0), null);

  // A portfolio that only grew because money went in shows a flat market.
  const flat = summarizePerformance(
    [
      { onDate: '2026-01-01', value: 1000, contributedToDate: 0 },
      { onDate: '2026-02-01', value: 2000, contributedToDate: 1000 },
    ],
    1000,
  )!;
  check('money in with no market move reports zero market gain', flat.marketGain, 0);
}

console.log('\nIncome months');
{
  const months = last12MonthKeys('2026-08-02');
  check('twelve buckets', months.length, 12);
  // The bug this exists to catch: on a UTC server the obvious implementation
  // shifted every bucket back a month, so the current month was absent and this
  // month's dividends silently vanished from the chart, the total and the yield.
  check('ends on the month the ET date falls in', months[months.length - 1], '2026-08');
  check('starts eleven months earlier', months[0], '2025-09');
  check('rolls over the year boundary', last12MonthKeys('2026-01-15')[11], '2026-01');
  check('and backwards across it', last12MonthKeys('2026-01-15')[0], '2025-02');
  check('December does not overflow into month 13', last12MonthKeys('2026-12-31')[11], '2026-12');
  check('every key is well formed', months.every((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m)), true);
}

console.log('\nProjections');
{
  const pts = project(10000, 0, 12, 1);
  // 10,000 at 1%/month for 12 months = 10000 * 1.01^12
  close('compound growth with no contributions', pts[pts.length - 1]!.value, 10000 * Math.pow(1.01, 12));
  check('starts at today', pts[0], { year: 0, value: 10000, contributed: 0 });
  check('one point per year plus today', pts.length, 2);

  const withAdds = project(0, 100, 0, 2);
  check('at a 0% rate the value is just what was added', withAdds[withAdds.length - 1]!.value, 2400);
  check('contributions are tracked cumulatively', withAdds[withAdds.length - 1]!.contributed, 2400);

  const negative = project(1000, 0, -10, 1);
  check('a negative rate is allowed and shrinks the balance', negative[1]!.value < 1000, true);
}

console.log('\nContribution limits');
{
  check('401(k) and 403(b) share one elective-deferral group', [
    limitGroupFor('401k'),
    limitGroupFor('roth_401k'),
    limitGroupFor('403b'),
  ], ['workplace', 'workplace', 'workplace']);
  check('traditional and Roth IRAs share one limit', [limitGroupFor('ira'), limitGroupFor('roth_ira')], ['ira', 'ira']);
  check('a taxable brokerage has no annual cap to score', limitGroupFor('brokerage'), null);
  check('a 529 is not scored against a federal annual cap', limitGroupFor('529'), null);

  check('a stored year reports its figures', contributionLimit('ira', 2026)?.limit, 7500);
  // The rule that matters: never substitute a neighbouring year's number.
  check('an unknown year reports no limit rather than a guess', contributionLimit('ira', 2030), null);
  check('hasLimitsFor agrees', [hasLimitsFor(2026), hasLimitsFor(2030)], [true, false]);
  check('catch-up is reported separately, never folded in', contributionLimit('workplace', 2026)?.catchUp50, 8000);
}

console.log('');
if (failures > 0) {
  console.error(`${failures} check(s) failed.\n`);
  process.exit(1);
}
console.log('All Investments math checks passed.\n');
