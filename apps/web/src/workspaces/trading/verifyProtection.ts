import { MIN_TRIGGER_STEPS, protectionStep, triggerPrice, triggerProblem } from './protection';
import * as server from '../../../../api/src/trading/protection';

// Offline check of the protective-order rules — and of the ONE thing a
// typecheck cannot catch here: that the browser's copy and the server's copy
// agree about every level.
//
// What this exists for, in one sentence: a stop typed at the price on the screen
// took a live position out the moment it was set, because the desk only ever
// checked a level against the price the trade OPENED at. A long opens at the ask
// and its stop is watched against the bid, so every spread was a band in which a
// level passed validation and triggered instantly.
//
//     npm run verify:protection        (root or @vts/web)
//
// Exits non-zero on the first mismatch. Reads no network and no database.

let failures = 0;

function check(name: string, actual: string, expected: string): void {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(72)} ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`,
  );
}

// Both mirrors, over the same input. `refused`/`allowed` is what the fixtures
// assert; the message itself is compared separately so a wording change on one
// side alone still fails.
function both(input: server.TriggerCheckInput): string {
  const web = triggerProblem(input);
  const api = server.triggerProblem(input);
  if (web !== api) {
    failures += 1;
    console.log(`FAIL mirrors disagree\n  web: ${JSON.stringify(web)}\n  api: ${JSON.stringify(api)}`);
    return 'MIRROR-MISMATCH';
  }
  return web == null ? 'allowed' : 'refused';
}

const FX = { step: 0.0001, stepLabel: 'pip' as const };

console.log('\n---- the owner\'s own case: a stop typed at the live price ----\n');
// EUR/USD quoted 1.10000 / 1.10020. A long is filled at the ask and its stop is
// watched against the BID, so a stop at the bid — or anywhere in the spread —
// is already at the trigger even though it is below the fill.
const buy = { side: 'long' as const, bid: 1.1, ask: 1.1002, ...FX };
check('a buy stop AT the live bid is refused', both({ ...buy, stopLoss: 1.1 }), 'refused');
check('a buy stop inside the spread is refused', both({ ...buy, stopLoss: 1.1001 }), 'refused');
check('a buy stop below the fill but above the bid is refused', both({ ...buy, stopLoss: 1.10015 }), 'refused');
check('a buy stop half a pip below the bid is refused', both({ ...buy, stopLoss: 1.09995 }), 'refused');
check('a buy stop exactly one pip below the bid is allowed', both({ ...buy, stopLoss: 1.0999 }), 'allowed');
check('a buy stop well below is allowed', both({ ...buy, stopLoss: 1.095 }), 'allowed');

const sell = { side: 'short' as const, bid: 1.1, ask: 1.1002, ...FX };
check('a sell stop AT the live ask is refused', both({ ...sell, stopLoss: 1.1002 }), 'refused');
check('a sell stop inside the spread is refused', both({ ...sell, stopLoss: 1.1001 }), 'refused');
check('a sell stop exactly one pip above the ask is allowed', both({ ...sell, stopLoss: 1.1003 }), 'allowed');
check('a sell stop well above is allowed', both({ ...sell, stopLoss: 1.105 }), 'allowed');

console.log('\n---- targets, which trigger against the same side ----\n');
check('a buy target AT the live bid is refused', both({ ...buy, takeProfit: 1.1 }), 'refused');
check('a buy target one pip above the bid is allowed', both({ ...buy, takeProfit: 1.1001 }), 'allowed');
check('a sell target AT the live ask is refused', both({ ...sell, takeProfit: 1.1002 }), 'refused');
check('a sell target one pip below the ask is allowed', both({ ...sell, takeProfit: 1.1001 }), 'allowed');
// The one that would be wrong if the target were measured against the entry:
// a sell target BELOW the market is where a target belongs, and must pass.
check('a sell target well below the market is allowed', both({ ...sell, takeProfit: 1.09 }), 'allowed');
check('a buy target well above the market is allowed', both({ ...buy, takeProfit: 1.11 }), 'allowed');

console.log('\n---- what is deliberately NOT refused ----\n');
// A trader moving a long's stop up to lock in profit is ordinary risk
// management. Direction against the ENTRY is a different question, asked only
// when an order is placed — never here, or a trailing stop would be impossible.
check('a buy stop above the original entry is allowed', both({ ...buy, stopLoss: 1.0995 }), 'allowed');
// No quote is no judgement. Blocking a stop because the feed failed would stop a
// trader protecting a live position at the moment the feed is worst.
check('no bid leaves a buy unjudged', both({ ...buy, bid: null, stopLoss: 1.5 }), 'allowed');
check('no ask leaves a sell unjudged', both({ ...sell, ask: null, stopLoss: 0.5 }), 'allowed');
// Removing a level (null) and leaving it alone (undefined) are both untouched.
check('removing a stop is allowed', both({ ...buy, stopLoss: null }), 'allowed');
check('changing nothing is allowed', both({ ...buy }), 'allowed');
// A long is judged against the bid, so a missing ASK is irrelevant to it.
check('a buy is judged with no ask at all', both({ ...buy, ask: null, stopLoss: 1.1 }), 'refused');

console.log('\n---- JPY, gold and crypto: the step is not always 0.0001 ----\n');
const jpy = { side: 'long' as const, bid: 150.0, ask: 150.02, step: 0.01, stepLabel: 'pip' as const };
check('a JPY stop at the bid is refused', both({ ...jpy, stopLoss: 150.0 }), 'refused');
check('a JPY stop half a pip below is refused', both({ ...jpy, stopLoss: 149.995 }), 'refused');
check('a JPY stop one pip below is allowed', both({ ...jpy, stopLoss: 149.99 }), 'allowed');
// Anything that is not a genuine pair reads in whole POINTS, never the venue's
// pipLocation — OANDA reports 0.01 for gold, which would quote a point in cents.
const btc = { side: 'long' as const, bid: 60000, ask: 60010, step: 1, stepLabel: 'point' as const };
check('a crypto stop at the bid is refused', both({ ...btc, stopLoss: 60000 }), 'refused');
check('a crypto stop half a point below is refused', both({ ...btc, stopLoss: 59999.5 }), 'refused');
check('a crypto stop one point below is allowed', both({ ...btc, stopLoss: 59999 }), 'allowed');

console.log('\n---- the step, and the two helpers ----\n');
check('a currency pair steps in pips', JSON.stringify(protectionStep(true, 0.0001)), JSON.stringify({ step: 0.0001, stepLabel: 'pip' }));
check('a JPY pair takes the venue pip size', JSON.stringify(protectionStep(true, 0.01)), JSON.stringify({ step: 0.01, stepLabel: 'pip' }));
check('a pair with no stated pip falls back', JSON.stringify(protectionStep(true, null)), JSON.stringify({ step: 0.0001, stepLabel: 'pip' }));
check('gold steps in whole points, NOT its pipLocation', JSON.stringify(protectionStep(false, 0.01)), JSON.stringify({ step: 1, stepLabel: 'point' }));
check('crypto steps in whole points', JSON.stringify(protectionStep(false, null)), JSON.stringify({ step: 1, stepLabel: 'point' }));
check('the two step helpers mirror', JSON.stringify(protectionStep(false, 0.01)), JSON.stringify(server.protectionStep(false, 0.01)));
check('a long is measured against the bid', String(triggerPrice('long', 1.1, 1.2)), '1.1');
check('a short is measured against the ask', String(triggerPrice('short', 1.1, 1.2)), '1.2');
check('a zero price is no price', String(triggerPrice('long', 0, 1.2)), 'null');
check('triggerPrice mirrors', String(triggerPrice('short', 1.1, 1.2)), String(server.triggerPrice('short', 1.1, 1.2)));
check('the minimum distance mirrors', String(MIN_TRIGGER_STEPS), String(server.MIN_TRIGGER_STEPS));

console.log('\n---- the refusal says what to do, and both copies say it identically ----\n');
const message = triggerProblem({ ...buy, stopLoss: 1.1 }) ?? '';
check('it names the market price', String(message.includes('1.10000')), 'true');
check('it names the furthest the level can go', String(message.includes('1.09990')), 'true');
check('it says the level would trigger straight away', String(message.includes('trigger straight away')), 'true');
check('the server words it identically', message, server.triggerProblem({ ...buy, stopLoss: 1.1 }) ?? '');

console.log('');
if (failures > 0) {
  console.log(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log('All checks passed.');
