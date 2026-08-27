// Offline checks for how a set of trades reports what it MOVED.
//
// The bug this exists to prevent: every movement figure on the desk was a pip
// sum written as `if (pips != null) sum += p`, and `tradePips` returns null for
// anything that is not a currency pair. So gold, the indices and crypto were
// dropped from the total in silence — a group made only of them printed
// "(0 pips)", a measured zero standing in for a figure that was never measured,
// and a MIXED group printed a pip figure covering only part of the money on its
// own row, with nothing saying so.
//
// None of that is visible from a passing typecheck or from looking at the
// running app on a forex-only desk, which is the owner's own. It shows up the
// first time somebody trades gold beside EUR/USD.
import { fmtMovement, hasAnyMovement, negMovement, netMovement, tradePips, tradePoints } from './pips';
import { groupTrades } from './tradeBreakdown';
import type { BreakEvenConfig } from './outcome';
import { profitFactorStats } from './tradeStats';

let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  }
};

type T = {
  side: 'long' | 'short';
  entryPrice: number | null;
  exitPrice: number | null;
  instrument: string;
  status: 'closed';
  realizedPl: number | null;
  units: number | null;
  strategy: string | null;
};
const trade = (instrument: string, side: T['side'], entryPrice: number, exitPrice: number, realizedPl: number, strategy = 'S'): T =>
  ({ side, entryPrice, exitPrice, instrument, status: 'closed', realizedPl, units: 1000, strategy });

// 20 pips on a 4-decimal pair, 10 pips on a JPY pair, 24.3 points on gold.
const EUR = trade('EUR/USD', 'long', 1.1000, 1.1020, 120);
const JPY = trade('USD/JPY', 'short', 150.20, 150.10, 60);
const GOLD = trade('XAU/USD', 'long', 4612.4, 4588.1, -121.5, 'Breakout');
const NAS = trade('NAS100', 'short', 19_310, 19_388, -156, 'Breakout');

// No break-even buffer, so a win is a win and a loss is a loss — this file is
// about the movement figure, not about outcome classification.
const config: BreakEvenConfig = { base: { mode: 'dollars', pct: 0, amount: 0 }, overrides: {} };

console.log('what a set of trades moved');

// One trade, each unit.
// Pip math is a division, so it lands a hair off 20 — compared with a
// tolerance rather than by equality, like every other price figure here.
check('a currency pair moves in pips', Math.abs(tradePips(EUR.side, EUR.entryPrice, EUR.exitPrice, EUR.instrument)! - 20) < 1e-6);
check('a currency pair has no point reading', tradePoints(EUR.side, EUR.entryPrice, EUR.exitPrice, EUR.instrument) === null);
check('a JPY pair uses the 0.01 pip', Math.abs(tradePips(JPY.side, JPY.entryPrice, JPY.exitPrice, JPY.instrument)! - 10) < 1e-9);
check('gold moves in points', Math.abs(tradePoints(GOLD.side, GOLD.entryPrice, GOLD.exitPrice, GOLD.instrument)! - -24.3) < 1e-9);
check('gold has no pip reading', tradePips(GOLD.side, GOLD.entryPrice, GOLD.exitPrice, GOLD.instrument) === null);
check('a point is one whole unit of price, not a cent', tradePoints(GOLD.side, GOLD.entryPrice, GOLD.exitPrice, GOLD.instrument)! > -100);
check('a short that fell is a positive move', tradePoints(NAS.side, NAS.entryPrice, NAS.exitPrice, NAS.instrument)! < 0);

// The null legs are the whole point: absent, never zero.
{
  const pairsOnly = netMovement([EUR, JPY]);
  check('a forex-only set states pips and NO points', pairsOnly.pips === 30 && pairsOnly.points === null, pairsOnly);

  const metalsOnly = netMovement([GOLD, NAS]);
  check('a set with no pair states points and NO pips', metalsOnly.pips === null, metalsOnly);
  check('  and the point figure is real, not zero', metalsOnly.points === -102.3, metalsOnly);

  const mixed = netMovement([EUR, JPY, GOLD, NAS]);
  check('a mixed set states BOTH, never one standing for the whole', mixed.pips === 30 && mixed.points === -102.3, mixed);

  const nothing = netMovement([]);
  check('an empty set states neither', nothing.pips === null && nothing.points === null, nothing);
}

// A set that moved but has no pair must still report — the old `hasAnyPips`
// answered false here and hid a figure that was perfectly measurable.
check('a desk trading only gold reports a movement', hasAnyMovement([GOLD]) === true);
check('a desk with nothing priced reports none', hasAnyMovement([]) === false);

// Formatting: no empty parentheses, no invented zero, both units when both apply.
check('nothing measured renders as an empty string', fmtMovement({ pips: null, points: null }) === '');
check('pips alone', fmtMovement({ pips: 30, points: null }, true) === '(+30 pips)', fmtMovement({ pips: 30, points: null }, true));
check('points alone', fmtMovement({ pips: null, points: -102.3 }, true) === '(-102.3 pts)', fmtMovement({ pips: null, points: -102.3 }, true));
check(
  'both, separated and never added',
  fmtMovement({ pips: 30, points: -102.3 }, true) === '(+30 pips · -102.3 pts)',
  fmtMovement({ pips: 30, points: -102.3 }, true),
);
check('negating flips both legs and leaves a null alone', JSON.stringify(negMovement({ pips: 30, points: null })) === '{"pips":-30,"points":null}');

// The breakdown is where the zero was visible: "XAU/USD  2 · 1W 1L  $124.1  (0 pips)".
{
  const byInstrument = groupTrades([EUR, GOLD, NAS] as never[], (t) => (t as T).instrument, true, config);
  const gold = byInstrument.find((g) => g.label === 'XAU/USD')!;
  check('a gold row states no pips at all', gold.move.pips === null, gold.move);
  check('  and states its real point move', Math.abs(gold.move.points! - -24.3) < 1e-9, gold.move);
  check('  so the row renders points, not "(0 pips)"', fmtMovement(gold.move, true) === '(-24.3 pts)', fmtMovement(gold.move, true));

  const eur = byInstrument.find((g) => g.label === 'EUR/USD')!;
  check('a forex row is unchanged', fmtMovement(eur.move, true) === '(+20 pips)', fmtMovement(eur.move, true));

  // A strategy row holding one gold and one index trade: both non-pairs.
  const byStrategy = groupTrades([EUR, GOLD, NAS] as never[], (t) => (t as T).strategy, true, config);
  const breakout = byStrategy.find((g) => g.label === 'Breakout')!;
  check('a strategy row of two non-pairs states points for both', Math.abs(breakout.move.points! - -102.3) < 1e-9, breakout.move);
  check('  and claims no pips', breakout.move.pips === null, breakout.move);
}

// Gross profit and gross loss carried the same drop.
{
  const pf = profitFactorStats([EUR, JPY, GOLD, NAS] as never[], config);
  check('gross profit states the winners’ pips', pf.grossProfitMove.pips === 30, pf.grossProfitMove);
  check('  and no points, because both winners were pairs', pf.grossProfitMove.points === null, pf.grossProfitMove);
  check('gross loss states the losers’ points', Math.abs(pf.grossLossMove.points! - 102.3) < 1e-9, pf.grossLossMove);
  check('  and no pips, because no pair lost', pf.grossLossMove.pips === null, pf.grossLossMove);
  // Printed negative, as the card does.
  check(
    '  and prints as a loss',
    fmtMovement(negMovement(pf.grossLossMove)) === '(-102.3 pts)',
    fmtMovement(negMovement(pf.grossLossMove)),
  );

  // Nothing measured at all must not become a zero anywhere.
  const none = profitFactorStats([] as never[], config);
  check('an empty desk claims no movement', fmtMovement(none.grossProfitMove) === '' && fmtMovement(none.grossLossMove) === '');
}

console.log(failures === 0 ? '\n✓ movement checks passed' : `\n✗ ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
