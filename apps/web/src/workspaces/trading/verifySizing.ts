import {
  costOfUnits,
  perStepValue,
  sizeForAccountPct,
  unitsForCost,
  type PipRounding,
  type SizingInputs,
} from './sizing';
import * as server from '../../../../api/src/trading/sizing';
import {
  DEFAULT_PRESETS,
  accountPctSize,
  costOfSize,
  ladderFor,
  ladderKind,
  resolveMode,
  roundingFor,
  unitsForPreset,
} from './ticketPresets';
import type { DeskInstrument, TicketPresets } from '../../api/types';

// Offline check of position sizing — and of the ONE thing a typecheck cannot
// catch here: that the browser's copy and the server's copy agree.
//
// The order ticket sizes in the browser on every quote tick and a Founder join
// sizes on the server at the moment the order goes out, so the pure math exists
// in two files (`workspaces/trading/sizing.ts` and `api/src/trading/sizing.ts`,
// the same mirroring `pips.ts` and `forex.ts` already use). This script imports
// BOTH and runs every fixture through each, so a change made to one and not the
// other fails here rather than in production as a size nobody meant.
//
//     npm run verify:sizing            (root or @vts/web)
//
// Exits non-zero on the first mismatch. Reads no network and no database.

let failures = 0;

function check(name: string, actual: string, expected: string): void {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(62)} ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`,
  );
}

const round = (n: number | null, dp = 6): string => (n == null ? 'null' : String(Number(n.toFixed(dp))));

// ---- the fixture ----------------------------------------------------------
//
// The figures the owner reported off a live ticket, so the arithmetic here is
// checked against what the terminal actually showed: a $1,797.10 account,
// EUR/USD at 1.1684, and OANDA's own 2% margin requirement on that pair. NONE
// of it is a rule — the margin rate is an INPUT here exactly as it is in the
// app, which is read from the venue and never assumed.
const SPEC = {
  tradeUnitsPrecision: 0,
  minimumTradeSize: 1,
  maximumOrderUnits: null as number | null,
  marginRate: 0.02,
};

const BASE: SizingInputs = {
  spec: SPEC,
  price: 1.1684,
  factor: 1,
  step: 0.0001, // a pip on a currency pair
  accountValue: 1797.1,
  spot: false,
};

const NO_ROUNDING: PipRounding = { enabled: false, increment: 0.5 };
const HALF: PipRounding = { enabled: true, increment: 0.5 };

// Every fixture runs through BOTH copies. `both` returns the browser's answer
// and fails loudly if the server's differs by so much as a rounding artifact.
function both(name: string, run: (m: typeof server) => number | null): number | null {
  const web = run(
    { costOfUnits, perStepValue, sizeForAccountPct, unitsForCost } as unknown as typeof server,
  );
  const api = run(server);
  const same = round(web, 10) === round(api, 10);
  if (!same) {
    failures += 1;
    console.log(`FAIL ${`${name} — web and server disagree`.padEnd(62)} ${round(web)} vs ${round(api)}`);
  }
  return web;
}

// ---- what the existing readings already are -------------------------------
//
// The ticket showed 1,000 units of EUR/USD as $0.10/pip with ~$23.37 of margin,
// ~1.3% of the account. Account % is built on exactly these, so if they move,
// everything below is wrong too.
{
  console.log('\n-- the readings Account % is built on --');
  check('1,000 units is $0.10 a pip', round(both('perStep', (m) => m.perStepValue(1000, BASE))), '0.1');
  check('1,000 units ties up $23.37', round(both('cost', (m) => m.costOfUnits(1000, BASE)), 2), '23.37');
  check(
    'which is 1.3% of the account',
    round(both('pct', (m) => (m.costOfUnits(1000, BASE) ?? 0) / 1797.1 * 100), 1),
    '1.3',
  );
  // The inverse is exact, which is what lets a percentage be turned into a size
  // through the same path the margin figure comes out of.
  check(
    'unitsForCost inverts costOfUnits exactly',
    round(both('inverse', (m) => m.unitsForCost(m.costOfUnits(1000, BASE) ?? 0, BASE))),
    '1000',
  );
  // A spot account commits the whole cost: no margin rate is involved, and none
  // is required.
  const spot: SizingInputs = { ...BASE, spot: true, spec: { ...SPEC, marginRate: 1 } };
  check(
    'a spot account commits the whole cost',
    round(both('spot cost', (m) => m.costOfUnits(1000, spot)), 2),
    '1168.4',
  );
}

// ---- Account %, with no rounding ------------------------------------------
{
  console.log('\n-- Account % --');
  const half = sizeForAccountPct(50, BASE, NO_ROUNDING);
  both('50% units', (m) => m.sizeForAccountPct(50, BASE, NO_ROUNDING).units);
  both('50% actual', (m) => m.sizeForAccountPct(50, BASE, NO_ROUNDING).actualPct);
  check('50% of $1,797.10 targets $898.55 of margin', round(half.targetCost, 2), '898.55');
  check('which is 38,452 units', round(half.units), '38452');
  check('worth $3.8452 a pip', round(half.perStep), '3.8452');
  check('tying up $898.55', round(half.cost, 2), '898.55');
  // The ACTUAL share, recomputed from the size that would be sent — a hair under
  // the target because whole units are floored, never rounded up past it.
  check('and reading 50.0% actual', round(half.actualPct, 4), '49.9998');
  check('nothing went wrong', String(half.problem), 'null');
  check('and it was not rounded', String(half.rounded), 'false');

  // GROWTH AND LOSS MOVE THE SIZE. This is the whole reason the percentage
  // rather than the units is what gets stored.
  const grown = sizeForAccountPct(50, { ...BASE, accountValue: 1797.1 * 2 }, NO_ROUNDING);
  const shrunk = sizeForAccountPct(50, { ...BASE, accountValue: 1797.1 / 2 }, NO_ROUNDING);
  check('doubling the account doubles the size', round(grown.units), '76904');
  check('halving the account halves it', round(shrunk.units), '19226');
  check('the share itself does not move', round(grown.actualPct, 3), round(half.actualPct, 3));

  // Half the percentage is half the size, on the same account.
  check('25% is half of 50%', round(sizeForAccountPct(25, BASE, NO_ROUNDING).units), '19226');
}

// ---- rounding the money per pip -------------------------------------------
{
  console.log('\n-- $/pip rounding --');
  const rounded = sizeForAccountPct(50, BASE, HALF);
  both('rounded units', (m) => m.sizeForAccountPct(50, BASE, HALF).units);
  both('rounded actual', (m) => m.sizeForAccountPct(50, BASE, HALF).actualPct);
  // The owner's own example: $3.82/pip with $0.50 rounding becomes $3.50/pip.
  check('$3.8452 a pip floors to $3.50', round(rounded.perStep), '3.5');
  check('which is 35,000 units', round(rounded.units), '35000');
  check('the size is marked as rounded', String(rounded.rounded), 'true');
  // AND THE PERCENTAGE REPORTED IS WHAT IT ACTUALLY CAME TO. Rounding down
  // deliberately leaves the trade under the target, and repeating the target
  // here would hide exactly that.
  check('and it reports 45.5%, not the 50% asked for', round(rounded.actualPct, 1), '45.5');
  check('margin follows the size, not the target', round(rounded.cost, 2), '817.88');
  check('the target it was measured against is unchanged', round(rounded.targetCost, 2), '898.55');

  // FLOOR, NEVER NEAREST. Checked across a sweep rather than on one number,
  // because "it rounded up once" is the failure that would matter.
  let everLarger = false;
  for (let pct = 1; pct <= 100; pct += 1) {
    const a = sizeForAccountPct(pct, BASE, NO_ROUNDING);
    const b = sizeForAccountPct(pct, BASE, HALF);
    if (a.units != null && b.units != null && b.units > a.units + 1e-9) everLarger = true;
    if (a.perStep != null && b.perStep != null && b.perStep > a.perStep + 1e-9) everLarger = true;
  }
  check('rounding never increases the size, at any percentage', String(everLarger), 'false');

  // A number already on an increment must not lose one to a float artifact:
  // 4.0 / 0.5 lands on 7.999999999999999 as readily as on 8.
  const exact: SizingInputs = { ...BASE, accountValue: 1000, price: 1, factor: 1 };
  const onIncrement = sizeForAccountPct(
    // 1000 × 8% = $80 of margin at 2% = 4,000 units = $0.40/pip on a 0.0001 step
    8,
    exact,
    { enabled: true, increment: 0.4 },
  );
  check('a value already on the increment keeps it', round(onIncrement.perStep), '0.4');

  // Smaller than one increment: refuse, never send a zero and never round up.
  const tiny = sizeForAccountPct(1, { ...BASE, accountValue: 5 }, HALF);
  check('below one increment is refused', String(tiny.problem), 'rounding-zero');
  check('with no size attached', String(tiny.units), 'null');
  check('but the target it could not reach is still reported', round(tiny.targetCost, 4), '0.05');
}

// ---- everything that must refuse rather than guess ------------------------
{
  console.log('\n-- refusals --');
  const p = (r: { problem: string | null; units: number | null }) => `${r.problem}/${r.units}`;
  check('zero percent', p(sizeForAccountPct(0, BASE, NO_ROUNDING)), 'invalid-pct/null');
  check('a negative percent', p(sizeForAccountPct(-5, BASE, NO_ROUNDING)), 'invalid-pct/null');
  check('more than the whole account', p(sizeForAccountPct(150, BASE, NO_ROUNDING)), 'invalid-pct/null');
  check(
    'no instrument',
    p(sizeForAccountPct(50, { ...BASE, spec: null }, NO_ROUNDING)),
    'no-instrument/null',
  );
  check(
    'no account value',
    p(sizeForAccountPct(50, { ...BASE, accountValue: null }, NO_ROUNDING)),
    'no-account-value/null',
  );
  check(
    'no quote',
    p(sizeForAccountPct(50, { ...BASE, price: null }, NO_ROUNDING)),
    'no-quote/null',
  );
  check(
    'no conversion factor',
    p(sizeForAccountPct(50, { ...BASE, factor: null }, NO_ROUNDING)),
    'no-quote/null',
  );
  // NEVER ASSUMED. A venue that does not state a margin requirement is a
  // refusal, not a 2% guess.
  check(
    'no margin requirement stated',
    p(sizeForAccountPct(50, { ...BASE, spec: { ...SPEC, marginRate: null } }, NO_ROUNDING)),
    'no-margin-rate/null',
  );
  // Below the venue's minimum: refused rather than raised to it, because raising
  // it spends more of the account than was asked for.
  check(
    'below the venue minimum',
    p(sizeForAccountPct(1, { ...BASE, accountValue: 5, spec: { ...SPEC, minimumTradeSize: 1000 } }, NO_ROUNDING)),
    'below-minimum/null',
  );
}

// ---- the venue's own ceiling ----------------------------------------------
{
  console.log('\n-- the venue ceiling --');
  const capped = sizeForAccountPct(
    50,
    { ...BASE, spec: { ...SPEC, maximumOrderUnits: 10_000 } },
    NO_ROUNDING,
  );
  check('a size over the maximum is clamped down', round(capped.units), '10000');
  check('and says so', String(capped.capped), 'true');
  // The percentage then reports what the clamped size actually uses, so the cap
  // is visible rather than silent.
  check('with the actual share it uses', round(capped.actualPct, 2), '13');
}

// ---- fractional instruments ------------------------------------------------
{
  console.log('\n-- a fractionally-sized instrument --');
  // A spot coin at $50,000, 8 decimals of size precision, on a $1,797.10 account.
  const coin: SizingInputs = {
    spec: { tradeUnitsPrecision: 8, minimumTradeSize: 0.0001, maximumOrderUnits: null, marginRate: 1 },
    price: 50_000,
    factor: 1,
    step: 1, // one whole point of price, never a pip — crypto has no pip
    accountValue: 1797.1,
    spot: true,
  };
  const tenth = sizeForAccountPct(10, coin, NO_ROUNDING);
  both('coin units', (m) => m.sizeForAccountPct(10, coin, NO_ROUNDING).units);
  check('10% of the account buys 0.00359 of it', round(tenth.units, 8), '0.0035942');
  check('costing $179.71', round(tenth.cost, 2), '179.71');
  check('and reading 10%', round(tenth.actualPct, 4), '10');
  // A size is floored to the venue's precision, never rounded up past the share.
  check('the size carries no more decimals than the venue takes', String((tenth.units ?? 0) * 1e8 % 1), '0');
}

// ---- the preset ladders, including the two that already existed -----------
//
// Account % is a THIRD mode beside Units and $ per pip, not a replacement, so
// what those two do is checked here as well: the regression that would matter is
// the new one quietly changing the old ones.
{
  console.log('\n-- preset modes --');
  const spec = { ...SPEC, minimumTradeSize: 1 } as unknown as DeskInstrument;
  const inputs = { ...BASE, spec };
  const presets = (patch: Partial<TicketPresets>): TicketPresets => ({ ...DEFAULT_PRESETS, ...patch });

  // A units preset is the number on the button, untouched.
  check('a units preset is its own number', round(unitsForPreset(25_000, 'units', inputs)), '25000');
  check('a fractional preset likewise', round(unitsForPreset(0.05, 'fractional', inputs)), '0.05');
  // A $ per pip preset inverts the pip value: $5 a pip at $0.0001 a unit.
  check('$5 a pip is 50,000 units', round(unitsForPreset(5, 'step', inputs)), '50000');
  // Money spent buys what it buys, floored so it never spends more.
  check('$500 spent buys 427 units at 1.1684', round(unitsForPreset(500, 'cost', inputs)), '427');
  // And the new one dispatches to the canonical percentage path.
  check('a percentage preset routes to Account %', round(unitsForPreset(50, 'pct', inputs, NO_ROUNDING)), '38452');
  check(
    'and carries the rounding when it is on',
    round(unitsForPreset(50, 'pct', inputs, HALF)),
    '35000',
  );
  check(
    'which is the same answer accountPctSize gives',
    round(accountPctSize(50, inputs, HALF).units),
    '35000',
  );

  // The mode → ladder mapping, so a stored mode still reaches its own buttons.
  check('units mode uses the whole-unit ladder', ladderKind('units', spec), 'units');
  check('per_step mode uses the money ladder', ladderKind('per_step', spec), 'step');
  check('account_pct mode uses the percentage ladder', ladderKind('account_pct', spec), 'pct');
  check('cost mode uses the spend ladder', ladderKind('cost', spec), 'cost');
  // A stored mode survives being read back on a margin account; only 'cost',
  // which cannot apply there, falls back — exactly as it always did.
  check('account_pct holds on a margin account', resolveMode(presets({ mode: 'account_pct' }), false), 'account_pct');
  check('cost still falls back off spot', resolveMode(presets({ mode: 'cost' }), false), 'units');
  check('an unset mode is unchanged', resolveMode(presets({}), false), 'units');

  // A saved ladder from before this feature still reads back as it did, and an
  // account that never set a percentage ladder gets the built-in one.
  check('a stored units ladder is kept', ladderFor(presets({ units: [500, 1500] }), 'units').join(','), '500,1500');
  check('an unset percentage ladder falls back to the built-in one', ladderFor(presets({}), 'pct').length > 0 ? 'yes' : 'no', 'yes');
  // Rounding defaults to off with a $0.50 increment, so a row saved before this
  // existed behaves exactly as it did.
  check('rounding is off by default', String(roundingFor(DEFAULT_PRESETS).enabled), 'false');
  check('at a $0.50 increment', round(roundingFor(DEFAULT_PRESETS).increment), '0.5');

  // costOfSize is one line over the canonical path, so the ticket's own margin
  // reading and a chip's cannot disagree.
  check('costOfSize is costOfUnits', round(costOfSize(1000, inputs), 6), round(costOfUnits(1000, inputs), 6));
}

console.log('');
if (failures > 0) {
  console.log(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log('All checks passed.');
