import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { fundedAccounts, tradingChallenges, type UserRow } from '../db/schema.js';
import { getUserFeatures } from '../features/service.js';
import { getPortfolio } from '../investments/service.js';
import { getOandaCapital } from '../trading/capital.js';
import { getLiveWall } from '../trading/service.js';
import { listDeskHoldings } from '../trading/orderDesk.js';
import { getAllActiveDecrypted } from '../trading/connections.js';

// My Terminal ▸ Investment Holdings — the one screen that puts the trading desk
// and the long-term portfolio side by side.
//
// The whole difficulty of this screen is in one question: what does it mean to
// add a trading account to an investment portfolio? Get it wrong and the number
// is not slightly off, it is nonsense.
//
//   • A trading position's NOTIONAL is not money the trader owns. 100,000 units
//     of EUR/USD is a leveraged exposure, not $100k of anyone's savings. Adding
//     notional to a portfolio value would overstate it by an order of magnitude,
//     and it would look entirely plausible while doing it.
//   • What IS comparable is the account's own equity — NAV, which is balance
//     plus open P/L, the money actually in the account — and, on a spot account,
//     the coins it holds outright.
//
// So the combined figure adds portfolio value + trading account equity + spot
// holdings, and nothing else. Open positions are listed because a trader wants
// to see them, but they are shown as exposure, never summed into the total.
//
// Two more things are deliberately excluded from the total and named on screen
// rather than dropped silently:
//   • a hand-kept manual book, which has no account balance to read; and
//   • a funded/prop challenge account, whose balance is the FIRM's capital, not
//     the trader's. Counting it would be the single most flattering error this
//     screen could make.

export interface CombinedHoldingRow {
  key: string;
  name: string;
  symbol: string | null;
  detail: string; // the account or broker it sits in
  value: number | null;
  gain: number | null;
  gainPct: number | null;
  side: 'investment' | 'position' | 'spot';
}

export interface MyHoldingsInvestments {
  value: number;
  costBasis: number;
  gain: number;
  gainPct: number | null;
  dayChange: number;
  dayChangeCoverage: number;
  accountsCount: number;
  holdingsCount: number;
  unpricedCount: number;
}

export interface MyHoldingsTrading {
  /** Whether the user has opted into Advanced Trading at all. */
  enabled: boolean;
  /** Whether they have a broker connection that can report an account value. */
  brokerConfigured: boolean;
  /** OANDA NAV across the user's own accounts — null if they share no currency. */
  accountValue: number | null;
  currency: string | null;
  /** Open P/L across those accounts, already inside accountValue. */
  unrealizedPl: number | null;
  /** Realized P/L from trades closed since ET midnight. */
  realizedToday: number | null;
  /** Value of coins held outright on a spot account. */
  spotValue: number;
  openPositionCount: number;
  positions: CombinedHoldingRow[];
  /** Things left out of the total, in words, so the screen can say why. */
  excluded: string[];
}

export interface MyHoldingsPayload {
  investments: MyHoldingsInvestments;
  trading: MyHoldingsTrading;
  /**
   * The two halves added together — null when they cannot honestly be added,
   * which happens when a trading account reports a currency other than USD.
   * `combinedNote` says which.
   */
  combinedValue: number | null;
  combinedNote: string | null;
  top: CombinedHoldingRow[];
  asOf: number;
}

/** The portfolio's biggest holdings and the desk's positions, largest first. */
function rankRows(rows: CombinedHoldingRow[], limit: number): CombinedHoldingRow[] {
  return [...rows].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity)).slice(0, limit);
}

export async function getMyHoldings(user: UserRow): Promise<MyHoldingsPayload> {
  const features = await getUserFeatures(user.id);

  // The investments half is always read — it is included with every account.
  // `recordSnapshot` is deliberately NOT set: this screen is a reader, and the
  // daily performance reading belongs to the Investments workspace itself. Two
  // writers for one row is how a snapshot ends up reflecting whichever screen
  // was opened last.
  const portfolio = await getPortfolio(user.id);

  const investments: MyHoldingsInvestments = {
    value: portfolio.totals.value,
    costBasis: portfolio.totals.costBasis,
    gain: portfolio.totals.gain,
    gainPct: portfolio.totals.gainPct,
    dayChange: portfolio.totals.dayChange,
    dayChangeCoverage: portfolio.totals.dayChangeCoverage,
    accountsCount: portfolio.accounts.filter((a) => a.active).length,
    holdingsCount: portfolio.holdings.length,
    unpricedCount: portfolio.totals.unpricedCount,
  };

  const investmentRows: CombinedHoldingRow[] = portfolio.holdings.map((h) => ({
    key: `inv:${h.id}`,
    name: h.name,
    symbol: h.symbol,
    detail: h.accountLabel,
    value: h.value,
    gain: h.gain,
    gainPct: h.gainPct,
    side: 'investment',
  }));

  const trading: MyHoldingsTrading = {
    enabled: features.advancedTrading,
    brokerConfigured: false,
    accountValue: null,
    currency: null,
    unrealizedPl: null,
    realizedToday: null,
    spotValue: 0,
    openPositionCount: 0,
    positions: [],
    excluded: [],
  };

  if (features.advancedTrading) {
    // `teamId: null` scopes every read below to this user alone. The Live Wall is
    // a team board by design; this screen is not — it is one person's own money,
    // and a teammate's account has no business in it.
    const viewer = { id: user.id, teamId: null };
    const [capital, wall, spot, conns] = await Promise.all([
      getOandaCapital(viewer).catch(() => null),
      getLiveWall(user).catch(() => null),
      listDeskHoldings(user.id).catch(() => []),
      getAllActiveDecrypted(new Set([user.id])).catch(() => []),
    ]);

    if (capital) {
      trading.brokerConfigured = capital.configured;
      trading.accountValue = capital.nav;
      trading.currency = capital.currency;
      trading.unrealizedPl = capital.unrealizedPl;
      trading.realizedToday = capital.pnl?.daily ?? null;
      // getOandaCapital only combines when every responding account shares one
      // currency; a null NAV with accounts present means exactly that.
      if (capital.configured && capital.nav == null && capital.accounts.length > 1) {
        trading.excluded.push('trading accounts in more than one currency, which cannot be added together');
      }
    }

    trading.spotValue = spot.reduce((s, h) => s + (h.value ?? 0), 0);
    for (const h of spot) {
      trading.positions.push({
        key: `spot:${h.connectionId}:${h.asset}`,
        name: h.asset,
        symbol: h.asset,
        detail: `${h.connectionLabel} · held outright`,
        value: h.value,
        gain: null,
        gainPct: null,
        side: 'spot',
      });
    }

    // Only a real broker feed counts. `getLiveWall` falls back to a
    // representative sample when nothing is connected, and a sample position has
    // no place on a screen about what someone actually owns.
    if (wall && wall.source === 'live') {
      const mine = wall.trades.filter((t) => t.ownerId === user.id);
      trading.openPositionCount = mine.length;
      for (const t of mine) {
        trading.positions.push({
          key: `pos:${t.id}`,
          name: t.instrument,
          symbol: t.instrument,
          detail: `${t.brokerName} · ${t.side} ${t.units.toLocaleString('en-US')}`,
          // Deliberately null: an open position's notional is not a value that
          // can sit in this column beside a fund's worth. Its P/L is the number
          // that means something, and it is carried in `gain`.
          value: null,
          gain: t.unrealizedPl,
          gainPct: null,
          side: 'position',
        });
      }
    }

    const manualCount = conns.filter((c) => c.broker === 'manual').length;
    if (manualCount > 0) {
      trading.excluded.push(
        manualCount === 1
          ? 'a hand-kept book, which has no account balance to read'
          : `${manualCount} hand-kept books, which have no account balance to read`,
      );
    }

    // These are checked against the tables rather than against the opt-in.
    // Saying a funded challenge is left out of someone's total when they do not
    // have one is not caution — it is a false statement about their money, and
    // it makes every other line here less believable.
    const [books, challenge] = await Promise.all([
      db.select({ id: fundedAccounts.id }).from(fundedAccounts).where(eq(fundedAccounts.userId, user.id)),
      db
        .select({ id: tradingChallenges.userId })
        .from(tradingChallenges)
        .where(eq(tradingChallenges.userId, user.id))
        .limit(1),
    ]);
    if (books.length > 0) {
      trading.excluded.push(
        books.length === 1
          ? 'a Manual Trades account, whose balance you keep by hand'
          : `${books.length} Manual Trades accounts, whose balances you keep by hand`,
      );
    }
    if (challenge.length > 0) {
      trading.excluded.push("a funded challenge account, whose balance is the firm's capital rather than yours");
    }
  }

  // Add the two halves only where that is meaningful. A non-USD trading account
  // is not added to a USD portfolio — the number would be wrong in a way nobody
  // could see.
  let combinedValue: number | null = investments.value;
  let combinedNote: string | null = null;

  if (features.advancedTrading) {
    const tradingSide = (trading.accountValue ?? 0) + trading.spotValue;
    if (trading.currency && trading.currency !== 'USD') {
      combinedValue = null;
      combinedNote = `Your trading account reports in ${trading.currency}, so it is not added to a portfolio tracked in USD.`;
    } else if (trading.brokerConfigured && trading.accountValue == null) {
      combinedValue = null;
      combinedNote = 'One of your trading accounts could not be read just now, so a combined total would be short.';
    } else {
      combinedValue = investments.value + tradingSide;
    }
  }

  return {
    investments,
    trading,
    combinedValue,
    combinedNote,
    // An unpriced investment has no value to rank by, so it is left out of a
    // list titled "biggest" rather than appearing at the bottom with a dash. The
    // unpriced banner is what tells the user about it.
    top: rankRows(
      [...investmentRows.filter((r) => r.value != null), ...trading.positions],
      8,
    ),
    asOf: Date.now(),
  };
}
