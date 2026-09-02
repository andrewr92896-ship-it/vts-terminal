// Protective-order placement rules — the one place the desk decides whether a
// stop or a target would fire the moment it was set.
//
// **THIS FILE IS A MIRROR OF `apps/api/src/trading/protection.ts` AND MUST STAY
// BYTE-FOR-BYTE IDENTICAL BELOW THIS HEADER.** The order ticket and the position
// editor judge a level in the browser on every quote tick, and the server judges
// it again at the moment the order goes out; those are two genuine places, and
// the repo's answer to that (the same one `sizing.ts`, `pips.ts` and `forex.ts`
// already use) is one mirrored pure module plus a verify script that runs BOTH
// against the same fixtures.
// `npm run verify:protection` imports the two files and fails the moment they
// disagree — so change one and change the other.
//
// Pure and deliberately import-free: nothing here reads an API, a clock or a
// component, which is what lets the server carry the same file.

/** How far a protective level must sit from the price it triggers against. One
 *  pip on a genuine currency pair, one whole point on anything else — the
 *  owner's own figure (2026-08), after a stop typed at the live price took a
 *  position out the moment it was set. */
export const MIN_TRIGGER_STEPS = 1;

export interface TriggerCheckInput {
  side: 'long' | 'short';
  /** The two sides of the book. Null when there was no quote to read. */
  bid: number | null;
  ask: number | null;
  /** One pip on a currency pair, one whole point on anything else. */
  step: number;
  /** What to call that step in a refusal. */
  stepLabel: 'pip' | 'point';
  /** undefined = not being set; null = being removed. Neither is checked. */
  stopLoss?: number | null;
  takeProfit?: number | null;
}

/**
 * The price a protective order on this position triggers against.
 *
 * **A LONG'S PROTECTIVE ORDERS FIRE ON THE BID AND A SHORT'S ON THE ASK**, and
 * that asymmetry is the whole reason this module exists. A long is opened at the
 * ask and closed at the bid, so a stop measured against the ask looks safely
 * below the market while already sitting at or above the price it is actually
 * watched against. Every spread is a band where a level passes the entry-side
 * check and triggers instantly.
 */
export function triggerPrice(side: 'long' | 'short', bid: number | null, ask: number | null): number | null {
  const price = side === 'long' ? bid : ask;
  return price != null && Number.isFinite(price) && price > 0 ? price : null;
}

// Enough decimals to print the level the way the venue quotes it, derived from
// the step rather than passed in — a mirrored module must not take a formatter.
function decimalsFor(step: number): number {
  if (!(step > 0)) return 5;
  if (step >= 1) return 2;
  return Math.min(8, Math.round(-Math.log10(step)) + 1);
}

function px(v: number, step: number): string {
  return v.toFixed(decimalsFor(step));
}

/**
 * Whether either protective level would fire the moment it was set, or sits
 * closer than the minimum distance to the price it is watched against.
 *
 * Returns the plain-language refusal, or null when there is nothing to refuse.
 *
 * **A MISSING QUOTE IS NOT A REFUSAL.** With no price to judge against there is
 * no judgement to make, and blocking a stop because a quote failed would be a
 * terminal that stops a trader protecting a live position at the moment the feed
 * is worst. The venue still rules on what it receives.
 *
 * **DIRECTION AGAINST THE ENTRY IS A DIFFERENT QUESTION AND IS NOT ASKED HERE.**
 * Moving a long's stop above its entry is a trader taking risk off, which is
 * ordinary and must stay allowed; what is refused is a level on the wrong side
 * of the CURRENT market, or within one step of it.
 */
export function triggerProblem(input: TriggerCheckInput): string | null {
  const mark = triggerPrice(input.side, input.bid, input.ask);
  if (mark == null) return null;
  const step = input.step > 0 ? input.step : 0.0001;
  const gap = step * MIN_TRIGGER_STEPS;
  // Prices are rounded to the venue's own precision before they get here, so a
  // level exactly one step away must pass rather than lose to binary float.
  const slack = gap * 1e-6;
  const long = input.side === 'long';
  const unit = `${MIN_TRIGGER_STEPS} ${input.stepLabel}${MIN_TRIGGER_STEPS === 1 ? '' : 's'}`;
  const buy = long ? 'buy' : 'sell';
  const at = `The market is at ${px(mark, step)}.`;

  const sl = input.stopLoss;
  if (sl != null && Number.isFinite(sl)) {
    const limit = long ? mark - gap : mark + gap;
    const bad = long ? sl > limit + slack : sl < limit - slack;
    if (bad) {
      return (
        `A ${buy}'s stop loss has to sit at least ${unit} ${long ? 'below' : 'above'} the price it is measured against. ` +
        `${at} ${px(sl, step)} would trigger straight away — the furthest ${long ? 'up' : 'down'} it can go right now is ${px(limit, step)}.`
      );
    }
  }

  const tp = input.takeProfit;
  if (tp != null && Number.isFinite(tp)) {
    const limit = long ? mark + gap : mark - gap;
    const bad = long ? tp < limit - slack : tp > limit + slack;
    if (bad) {
      return (
        `A ${buy}'s take profit has to sit at least ${unit} ${long ? 'above' : 'below'} the price it is measured against. ` +
        `${at} ${px(tp, step)} would trigger straight away — the ${long ? 'lowest' : 'highest'} it can go right now is ${px(limit, step)}.`
      );
    }
  }
  return null;
}

/** The step a movement of this instrument is read in: a pip on a genuine
 *  currency pair, one whole point on anything else. `pipSize` is the venue's own
 *  pip location and is only ever read for a pair — the terminal never sizes a
 *  point from it (OANDA reports 0.01 for gold, which would quote a point in
 *  cents). */
export function protectionStep(isForexPair: boolean, pipSize: number | null | undefined): {
  step: number;
  stepLabel: 'pip' | 'point';
} {
  if (!isForexPair) return { step: 1, stepLabel: 'point' };
  const pip = pipSize != null && pipSize > 0 ? pipSize : 0.0001;
  return { step: pip, stepLabel: 'pip' };
}
