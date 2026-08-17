import { and, desc, eq, gt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { fundedAccounts, fundedTrades, type TradeSide } from '../db/schema.js';
import { getActiveDecrypted, type OandaCreds } from './connections.js';
import { recordCredentialUse, type AuditActor } from './credentialAudit.js';
import { fetchOandaQuotes, type OandaQuote } from './brokers/oandaOrders.js';
import { resolveOandaPricingConfig } from './priceSource.js';
import { forexPair, pipSizeFor, quoteCurrencyOf } from './forex.js';
import { commissionFor, decomposeReentry } from './reentryMath.js';
import { etDayStamp } from './etTime.js';

export { commissionFor, decomposeReentry };

// The re-entry check — what getting back into a funded trade you just closed
// would cost, right now.
//
// A trader who has to come off a funded position for the 5pm ET rollover needs
// one number before deciding to re-enter: how much worse than the exit is it to
// get back on. That number has three parts, and the whole design here is that
// they ITEMIZE WITHOUT DOUBLE-COUNTING:
//
//   drift      the market moving away from your exit, measured against the SAME
//              SIDE you exited at (a long exits at the bid, so it is compared
//              with the current bid; a short exits at the ask)
//   spread     what crossing back costs — ask minus bid, one time
//   commission the firm's round-turn charge for the new position
//
// They reconcile by construction: for a long, drift + spread is exactly
// `ask - exit`, which is the real price cost of being out and getting back in.
// For a short it is exactly `exit - bid`. That identity is the reason drift is
// measured same-side rather than against the mid — measured against the mid,
// half a spread would be counted twice.
//
// Sign convention throughout: POSITIVE MEANS WORSE. A negative drift is the
// market having moved in your favour while you were flat, which makes re-entry
// cheaper than the exit, and is exactly as useful to know.

// How far back to look. A re-entry decision is a right-now decision: a trade
// closed yesterday is a trade you did not re-enter.
const LOOKBACK_HOURS = 18;

export type ReentryUnit = 'pips' | 'points';

export interface ReentryLeg {
  price: number; // in instrument price terms
  units: number; // that distance in pips (a currency pair) or points (anything else)
  money: number | null; // in the funded account's currency; null when it cannot be stated
}

export interface ReentryCheck {
  tradeId: string;
  accountId: string;
  accountLabel: string;
  platform: string;
  currency: string;
  instrument: string;
  side: TradeSide;
  size: number; // units of the closed position, the size a re-entry would restore
  exitPrice: number;
  closedAt: number;
  realizedPl: number | null;
  // Live quote. Absent when nothing could price the instrument — the check then
  // renders as "not priced" rather than as a cost of zero.
  bid: number | null;
  ask: number | null;
  // The price a re-entry would actually transact at: the ask to go long again,
  // the bid to go short again.
  reentryPrice: number | null;
  unit: ReentryUnit;
  drift: ReentryLeg | null;
  spread: ReentryLeg | null;
  // Round-turn commission on a re-entry of this size. Null with a reason when
  // the account states no rate, or the instrument is not sized in standard lots.
  commission: number | null;
  commissionNote: string | null;
  // drift + spread + commission. NULL when any part of it is unknown — an
  // incomplete total is refused rather than approximated, the same rule Net
  // Worth follows, because a total silently missing commission reads complete.
  total: number | null;
  // What priced it, so the reader knows whose spread they are looking at.
  source: 'broker' | 'install' | null;
}

export interface ReentryReport {
  checks: ReentryCheck[];
  // Set when there is nothing at all to price against, so the screen can say
  // which of the two it is instead of drawing an empty panel.
  priceSource: 'broker' | 'install' | null;
}

// Live two-sided quotes, preferring the trader's OWN OANDA connection: the whole
// point of the spread line is what THEY would pay to cross, and that is their
// entity's spread rather than the install's. Falls back to the install pricing
// account so a trader between connections still gets drift and spread from
// somewhere, and the payload says which — a figure whose source is unstated is
// a figure the reader cannot judge.
async function quotesFor(
  userId: string,
  instruments: string[],
  actor: AuditActor,
): Promise<{ quotes: Map<string, OandaQuote>; source: 'broker' | 'install' | null }> {
  const out = new Map<string, OandaQuote>();
  if (instruments.length === 0) return { quotes: out, source: null };

  // `deferred` so the audit row is written after OANDA answers and carries the
  // real outcome — a refused read is still a use of the credential, and saying
  // so is the point of the individual `quotes` purpose.
  const conns = await getActiveDecrypted(userId, { purpose: 'quotes', actor, deferred: true });
  const oanda = conns.find((c) => c.broker === 'oanda');
  if (oanda) {
    const creds = oanda.creds as OandaCreds;
    const cfg = {
      token: creds.token,
      accountId: creds.accountId,
      base: creds.env === 'live' ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com',
    };
    try {
      const rows = await fetchOandaQuotes(cfg, instruments);
      recordCredentialUse({
        connectionId: oanda.id,
        ownerUserId: userId,
        purpose: 'quotes',
        actor,
        ok: true,
      });
      for (const q of rows) out.set(q.instrument.toUpperCase(), q);
      if (out.size > 0) return { quotes: out, source: 'broker' };
    } catch (err) {
      recordCredentialUse({
        connectionId: oanda.id,
        ownerUserId: userId,
        purpose: 'quotes',
        actor,
        ok: false,
        error: err instanceof Error ? err.message : 'quote read failed',
      });
      // Fall through to the install source rather than reporting nothing: an
      // entity that does not carry this instrument is the common case here.
    }
  }

  const cfg = resolveOandaPricingConfig();
  if (!cfg) return { quotes: out, source: null };
  try {
    for (const q of await fetchOandaQuotes(cfg, instruments)) out.set(q.instrument.toUpperCase(), q);
  } catch {
    return { quotes: out, source: null };
  }
  return { quotes: out, source: out.size > 0 ? 'install' : null };
}

// Everything the caller closed on the funded book recently, priced for re-entry.
// The trader's own rows only: every query filters on the caller, and there is no
// parameter that could widen it.
export async function getReentryChecks(userId: string, actor: AuditActor, now: Date = new Date()): Promise<ReentryReport> {
  const since = new Date(now.getTime() - LOOKBACK_HOURS * 3_600_000);
  const rows = await db
    .select({ t: fundedTrades, a: fundedAccounts })
    .from(fundedTrades)
    .innerJoin(fundedAccounts, eq(fundedAccounts.id, fundedTrades.accountId))
    .where(
      and(
        eq(fundedTrades.userId, userId),
        eq(fundedTrades.status, 'closed'),
        gt(fundedTrades.closedAt, since),
      ),
    )
    .orderBy(desc(fundedTrades.closedAt));

  const usable = rows.filter((r) => r.t.exitPrice != null && r.t.closedAt != null);
  if (usable.length === 0) return { checks: [], priceSource: null };

  const instruments = [...new Set(usable.map((r) => r.t.instrument))];
  const { quotes, source } = await quotesFor(userId, instruments, actor);

  const checks: ReentryCheck[] = usable.map((r) => {
    const instrument = r.t.instrument;
    const side: TradeSide = r.t.side === 'short' ? 'short' : 'long';
    const exitPrice = r.t.exitPrice!;
    const size = Math.abs(r.t.units || 0);
    const pair = forexPair(instrument);
    // A pair speaks pips; everything else speaks points, where a point is one
    // whole unit of price. The same switch the rest of the terminal makes.
    const unit: ReentryUnit = pair ? 'pips' : 'points';
    const step = pair ? pipSizeFor(pair[1]) : 1;

    const q = quotes.get(instrument.toUpperCase());
    const bid = q?.bid ?? null;
    const ask = q?.ask ?? null;

    // Money is only stated when the instrument is quoted in the account's own
    // currency, where a price move times the size IS the money with no rate
    // involved. Anything else would need a conversion this has no source for,
    // and a converted-at-a-guess figure is worse than pips alone.
    const quoteCcy = quoteCurrencyOf(instrument);
    const canPriceMoney = quoteCcy != null && quoteCcy === r.a.currency.toUpperCase() && size > 0;
    const leg = (price: number): ReentryLeg => ({
      price,
      units: price / step,
      money: canPriceMoney ? price * size : null,
    });

    const commission = commissionFor(instrument, size, r.a.commissionPerLot);

    let drift: ReentryLeg | null = null;
    let spread: ReentryLeg | null = null;
    let reentryPrice: number | null = null;
    if (bid != null && ask != null) {
      const d = decomposeReentry(side, exitPrice, bid, ask);
      drift = leg(d.driftPrice);
      spread = leg(d.spreadPrice);
      reentryPrice = d.reentryPrice;
    }

    const total =
      drift?.money != null && spread?.money != null && commission.money != null
        ? drift.money + spread.money + commission.money
        : null;

    return {
      tradeId: r.t.id,
      accountId: r.a.id,
      accountLabel: r.a.label,
      platform: r.a.platform,
      currency: r.a.currency,
      instrument,
      side,
      size,
      exitPrice,
      closedAt: r.t.closedAt!.getTime(),
      realizedPl: r.t.realizedPl,
      bid,
      ask,
      reentryPrice,
      unit,
      drift,
      spread,
      commission: commission.money,
      commissionNote: commission.note,
      total,
      source: bid != null && ask != null ? source : null,
    };
  });

  return { checks, priceSource: source };
}

// Whether a closed funded trade falls in today's Eastern calendar day. Exported
// for the screen, which leads with the ones closed today — that is the set a
// rollover close produces, and the reason this panel exists.
export function closedToday(closedAt: number, now: Date = new Date()): boolean {
  return etDayStamp(new Date(closedAt)) === etDayStamp(now);
}
