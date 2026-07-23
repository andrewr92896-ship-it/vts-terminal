import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { studyDecks, tradingTeams } from '../db/schema.js';
import { createDeck, updateDeck, type DeckQuestionInput } from './deckStore.js';
import { getSetting, setSetting } from '../settings/service.js';

// ---- Built-in ("baked-in") example study games ----
// Code-owned example games seeded into EVERY team so new users can see how the
// Study Game feature works. Unlike a team's own games these are:
//   • Non-removable and non-editable — the routes block delete/patch on any deck
//     whose `source` is BAKED_IN_SOURCE (see routes/studies.ts). They can only
//     change here, in code, and re-sync on deploy.
//   • Seeded into all teams on boot (ensureBakedInGamesAllTeams) and lazily into
//     any brand-new team the first time its Studies deck list is fetched
//     (ensureBakedInGamesForTeam, called from the GET /api/studies/decks route).
//
// To change the content: edit the game below and bump BAKED_IN_VERSION — a
// deploy then re-syncs every existing team's copy in place (the deck id is
// unchanged, so players keep their progress). Adding a brand-new game just needs
// a new entry in BAKED_IN_GAMES (no version bump required for teams to pick it
// up, since seeding is create-if-missing).

// The `source` marker that flags a deck as a built-in example. Users can never
// create a deck with this source (the routes only ever pass ai_topic / upload /
// merged), so it uniquely identifies the seeded games.
export const BAKED_IN_SOURCE = 'baked_in';

// Bump whenever the CONTENT of a baked-in game below changes, so the next deploy
// re-syncs every team's copy to match. Creating a fresh copy for a team that
// lacks one does not need a bump.
export const BAKED_IN_VERSION = 1;

// Where the last-applied content version is remembered (app_settings key).
const VERSION_KEY = 'seed.bakedInGames.version';

export interface BakedGame {
  name: string;
  description: string;
  categories: string[];
  questions: DeckQuestionInput[];
}

export function isBakedInSource(source: string | null | undefined): boolean {
  return source === BAKED_IN_SOURCE;
}

// A plain-English glossary game covering the vocabulary a user runs into around
// the portal. STRICTLY definitional — every question asks "what does this term
// mean", never what to do with it — so it carries no financial/investment advice.
const MARKET_TERMINOLOGY_101: BakedGame = {
  name: 'Market Terminology 101',
  description:
    'A quick, plain-English glossary game — orders, quotes, and the common trading vocabulary you’ll see around the portal. A built-in example so you can see how Study Games work. Educational only — not financial advice.',
  categories: ['Orders & Execution', 'Prices & Quotes', 'Market Structure', 'Positions & Risk', 'Instruments'],
  questions: [
    // ---- Orders & Execution ----
    {
      topic: 'Orders & Execution',
      stem: 'A “market order” is an instruction to…',
      options: [
        { label: 'A', text: 'Buy or sell immediately at the best price currently available' },
        { label: 'B', text: 'Execute only at a specific future time' },
        { label: 'C', text: 'Guarantee an exact price no matter what' },
        { label: 'D', text: 'Cancel every other open order' },
      ],
      answer: 'A',
      explanation: 'A market order fills right away at the current market price — it prioritizes speed over price.',
    },
    {
      topic: 'Orders & Execution',
      stem: 'A “limit order” is an order to buy or sell…',
      options: [
        { label: 'A', text: 'Only at a specified price or better' },
        { label: 'B', text: 'At any price, right now' },
        { label: 'C', text: 'Only at the market close' },
        { label: 'D', text: 'At a random price chosen by the broker' },
      ],
      answer: 'A',
      explanation: 'A limit order sets the worst acceptable price; it will not fill beyond that limit.',
    },
    {
      topic: 'Orders & Execution',
      stem: 'A “stop-loss” order is designed to…',
      options: [
        { label: 'A', text: 'Trigger an order once price reaches a set level, to cap a loss' },
        { label: 'B', text: 'Guarantee a profit on the trade' },
        { label: 'C', text: 'Pause trading for the day' },
        { label: 'D', text: 'Double the size of the position' },
      ],
      answer: 'A',
      explanation: 'A stop order activates when price hits the stop level; a stop-loss is used to limit downside.',
    },
    {
      topic: 'Orders & Execution',
      stem: 'In trading, a “fill” refers to…',
      options: [
        { label: 'A', text: 'The completion (execution) of an order' },
        { label: 'B', text: 'An order that never executed' },
        { label: 'C', text: 'A type of price chart' },
        { label: 'D', text: 'A news headline' },
      ],
      answer: 'A',
      explanation: 'A fill is an order being executed; a partial fill is only part of it being completed.',
    },
    {
      topic: 'Orders & Execution',
      stem: '“Slippage” is…',
      options: [
        { label: 'A', text: 'The difference between the expected price and the price a trade actually executes at' },
        { label: 'B', text: 'A fixed fee the broker charges' },
        { label: 'C', text: 'A chart pattern' },
        { label: 'D', text: 'The midpoint of the bid and ask' },
      ],
      answer: 'A',
      explanation: 'Slippage is the gap between the price you expected and the price you got, common in fast markets.',
    },

    // ---- Prices & Quotes ----
    {
      topic: 'Prices & Quotes',
      stem: 'The “bid” price is…',
      options: [
        { label: 'A', text: 'The highest price a buyer is currently willing to pay' },
        { label: 'B', text: 'The lowest price a seller will accept' },
        { label: 'C', text: 'The last traded price' },
        { label: 'D', text: 'The day’s high' },
      ],
      answer: 'A',
      explanation: 'The bid is the best current buyer’s price; you generally sell into the bid.',
    },
    {
      topic: 'Prices & Quotes',
      stem: 'The “ask” (or “offer”) price is…',
      options: [
        { label: 'A', text: 'The lowest price a seller is currently willing to accept' },
        { label: 'B', text: 'The highest price a buyer will pay' },
        { label: 'C', text: 'The opening price of the day' },
        { label: 'D', text: 'The total volume traded' },
      ],
      answer: 'A',
      explanation: 'The ask is the best current seller’s price; you generally buy at the ask.',
    },
    {
      topic: 'Prices & Quotes',
      stem: 'The “bid-ask spread” is…',
      options: [
        { label: 'A', text: 'The difference between the bid price and the ask price' },
        { label: 'B', text: 'The day’s total price range' },
        { label: 'C', text: 'The broker’s commission' },
        { label: 'D', text: 'A dividend payment' },
      ],
      answer: 'A',
      explanation: 'The spread is the gap between the best buy and best sell price — a rough cost of trading.',
    },
    {
      topic: 'Prices & Quotes',
      stem: 'In forex, a “pip” is…',
      options: [
        { label: 'A', text: 'A standard smallest unit of price movement for a currency pair' },
        { label: 'B', text: 'A type of order' },
        { label: 'C', text: 'A trading session' },
        { label: 'D', text: 'A brokerage firm' },
      ],
      answer: 'A',
      explanation: 'A pip is the standard small increment a currency pair moves — often the 4th decimal place.',
    },
    {
      topic: 'Prices & Quotes',
      stem: '“Volume” measures…',
      options: [
        { label: 'A', text: 'The number of shares or contracts traded in a period' },
        { label: 'B', text: 'The change in price since yesterday' },
        { label: 'C', text: 'The number of companies listed' },
        { label: 'D', text: 'The size of the bid-ask spread' },
      ],
      answer: 'A',
      explanation: 'Volume is how much of something was traded during a period.',
    },
    {
      topic: 'Prices & Quotes',
      stem: 'A “tick” is…',
      options: [
        { label: 'A', text: 'A single minimum up or down movement in a security’s price' },
        { label: 'B', text: 'A one-hour candlestick' },
        { label: 'C', text: 'A dividend payment' },
        { label: 'D', text: 'A market index' },
      ],
      answer: 'A',
      explanation: 'A tick is the smallest increment a price can change by.',
    },

    // ---- Market Structure ----
    {
      topic: 'Market Structure',
      stem: 'A “bull market” describes a market with…',
      options: [
        { label: 'A', text: 'Generally rising prices over time' },
        { label: 'B', text: 'Generally falling prices over time' },
        { label: 'C', text: 'No trading activity' },
        { label: 'D', text: 'A permanent closure' },
      ],
      answer: 'A',
      explanation: 'A bull market trends upward; a bear market trends downward.',
    },
    {
      topic: 'Market Structure',
      stem: 'A “bear market” describes a market with…',
      options: [
        { label: 'A', text: 'Generally falling prices over time' },
        { label: 'B', text: 'Generally rising prices over time' },
        { label: 'C', text: 'A public holiday' },
        { label: 'D', text: 'A stock split' },
      ],
      answer: 'A',
      explanation: 'A bear market trends downward, often defined as a sustained decline from recent highs.',
    },
    {
      topic: 'Market Structure',
      stem: '“Liquidity” refers to…',
      options: [
        { label: 'A', text: 'How easily an asset can be bought or sold without moving its price much' },
        { label: 'B', text: 'A company’s dividend yield' },
        { label: 'C', text: 'The number of employees a company has' },
        { label: 'D', text: 'The company’s price-to-earnings ratio' },
      ],
      answer: 'A',
      explanation: 'A liquid market has plenty of buyers and sellers, so trades fill easily near the quoted price.',
    },
    {
      topic: 'Market Structure',
      stem: '“Volatility” is a measure of…',
      options: [
        { label: 'A', text: 'How much and how quickly a price moves up and down' },
        { label: 'B', text: 'The total value of a market' },
        { label: 'C', text: 'The hours an exchange is open' },
        { label: 'D', text: 'The size of the bid' },
      ],
      answer: 'A',
      explanation: 'Higher volatility means larger, faster price swings.',
    },
    {
      topic: 'Market Structure',
      stem: 'A stock “exchange” is…',
      options: [
        { label: 'A', text: 'A marketplace where securities are bought and sold' },
        { label: 'B', text: 'A type of order' },
        { label: 'C', text: 'A government tax form' },
        { label: 'D', text: 'A broker’s commission' },
      ],
      answer: 'A',
      explanation: 'Exchanges (e.g. the NYSE or Nasdaq) are the venues where securities trade.',
    },
    {
      topic: 'Market Structure',
      stem: 'A “broker” is…',
      options: [
        { label: 'A', text: 'An intermediary that executes buy and sell orders for clients' },
        { label: 'B', text: 'A government regulator' },
        { label: 'C', text: 'A stock market index' },
        { label: 'D', text: 'A charting tool' },
      ],
      answer: 'A',
      explanation: 'A broker routes your orders to the market; some also custody your account.',
    },
    {
      topic: 'Market Structure',
      stem: 'A “market maker” is a firm that…',
      options: [
        { label: 'A', text: 'Continuously quotes both buy and sell prices to provide liquidity' },
        { label: 'B', text: 'Sets national tax policy' },
        { label: 'C', text: 'Audits public companies' },
        { label: 'D', text: 'Writes financial news' },
      ],
      answer: 'A',
      explanation: 'Market makers stand ready to buy and sell, which keeps a market liquid.',
    },

    // ---- Positions & Risk ----
    {
      topic: 'Positions & Risk',
      stem: 'To be “long” a position means you…',
      options: [
        { label: 'A', text: 'Own (or have bought) an asset, benefiting if its price rises' },
        { label: 'B', text: 'Have sold it short' },
        { label: 'C', text: 'Hold only cash' },
        { label: 'D', text: 'Owe a dividend' },
      ],
      answer: 'A',
      explanation: 'A long position profits when the price goes up.',
    },
    {
      topic: 'Positions & Risk',
      stem: 'To “short” (sell short) an asset means you…',
      options: [
        { label: 'A', text: 'Sell a borrowed asset, aiming to buy it back later at a lower price' },
        { label: 'B', text: 'Buy and hold it forever' },
        { label: 'C', text: 'Pay the company a dividend' },
        { label: 'D', text: 'Lend money to your broker' },
      ],
      answer: 'A',
      explanation: 'A short position profits when the price goes down.',
    },
    {
      topic: 'Positions & Risk',
      stem: '“Leverage” in trading is…',
      options: [
        { label: 'A', text: 'Using borrowed funds to control a larger position' },
        { label: 'B', text: 'A guaranteed profit' },
        { label: 'C', text: 'A type of price chart' },
        { label: 'D', text: 'A tax deduction' },
      ],
      answer: 'A',
      explanation: 'Leverage magnifies both gains and losses relative to the money you put up.',
    },
    {
      topic: 'Positions & Risk',
      stem: '“Margin” refers to…',
      options: [
        { label: 'A', text: 'Money a trader must deposit to open a leveraged position' },
        { label: 'B', text: 'The profit earned on a trade' },
        { label: 'C', text: 'The bid-ask spread' },
        { label: 'D', text: 'A dividend payment' },
      ],
      answer: 'A',
      explanation: 'Margin is the collateral required to hold a leveraged position.',
    },
    {
      topic: 'Positions & Risk',
      stem: 'A “drawdown” is…',
      options: [
        { label: 'A', text: 'The decline from a peak to a later low in account value' },
        { label: 'B', text: 'A type of buy order' },
        { label: 'C', text: 'The market’s opening bell' },
        { label: 'D', text: 'A dividend schedule' },
      ],
      answer: 'A',
      explanation: 'Drawdown measures how far an account has fallen from its high-water mark.',
    },
    {
      topic: 'Positions & Risk',
      stem: '“Unrealized” profit or loss is…',
      options: [
        { label: 'A', text: 'The gain or loss on a position that is still open' },
        { label: 'B', text: 'Profit already banked by closing the trade' },
        { label: 'C', text: 'A fee charged by the broker' },
        { label: 'D', text: 'A tax owed to the government' },
      ],
      answer: 'A',
      explanation: 'Unrealized P/L is “on paper” until the position is closed, when it becomes realized.',
    },

    // ---- Instruments ----
    {
      topic: 'Instruments',
      stem: 'A “share” of stock represents…',
      options: [
        { label: 'A', text: 'A unit of ownership in a company' },
        { label: 'B', text: 'A loan made to a company' },
        { label: 'C', text: 'A unit of currency' },
        { label: 'D', text: 'A physical commodity' },
      ],
      answer: 'A',
      explanation: 'Owning shares means owning a small piece of the company.',
    },
    {
      topic: 'Instruments',
      stem: 'A “dividend” is…',
      options: [
        { label: 'A', text: 'A portion of a company’s earnings paid out to shareholders' },
        { label: 'B', text: 'A trading commission' },
        { label: 'C', text: 'A type of stop order' },
        { label: 'D', text: 'Interest paid on a bank loan' },
      ],
      answer: 'A',
      explanation: 'Dividends distribute some of a company’s profit to its shareholders, often quarterly.',
    },
    {
      topic: 'Instruments',
      stem: 'A forex currency pair such as EUR/USD quotes…',
      options: [
        { label: 'A', text: 'The value of one currency in terms of another' },
        { label: 'B', text: 'A single company’s stock price' },
        { label: 'C', text: 'A government bond’s yield' },
        { label: 'D', text: 'The weight of a commodity' },
      ],
      answer: 'A',
      explanation: 'A pair shows how much of the quote currency (USD) it takes to buy one of the base currency (EUR).',
    },
    {
      topic: 'Instruments',
      stem: 'A market “index” (e.g. the S&P 500) is…',
      options: [
        { label: 'A', text: 'A measurement of the combined value of a group of securities' },
        { label: 'B', text: 'A single company' },
        { label: 'C', text: 'A brokerage firm' },
        { label: 'D', text: 'A type of order' },
      ],
      answer: 'A',
      explanation: 'An index tracks a basket of securities to represent a market or segment of it.',
    },
    {
      topic: 'Instruments',
      stem: 'An “ETF” (exchange-traded fund) is…',
      options: [
        { label: 'A', text: 'A basket of securities that trades on an exchange like a stock' },
        { label: 'B', text: 'A private loan between two people' },
        { label: 'C', text: 'A single government bond' },
        { label: 'D', text: 'A foreign currency' },
      ],
      answer: 'A',
      explanation: 'An ETF holds many underlying assets but trades in one place, like a single stock.',
    },
  ],
};

// Every built-in example game. Add new games here.
export const BAKED_IN_GAMES: BakedGame[] = [MARKET_TERMINOLOGY_101];

// Ensure a single team has each built-in game. Create-if-missing by default;
// when `forceSync` is set, an existing copy is rewritten in place to match the
// code (same deck id, so players keep their progress). Called lazily from the
// deck-list route for brand-new teams, and by ensureBakedInGamesAllTeams on boot.
export async function ensureBakedInGamesForTeam(
  teamId: string,
  opts: { forceSync?: boolean } = {},
): Promise<void> {
  for (const game of BAKED_IN_GAMES) {
    const existing = (
      await db
        .select({ id: studyDecks.id })
        .from(studyDecks)
        .where(
          and(
            eq(studyDecks.teamId, teamId),
            eq(studyDecks.source, BAKED_IN_SOURCE),
            eq(studyDecks.name, game.name),
          ),
        )
        .limit(1)
    )[0];

    if (!existing) {
      await createDeck({
        teamId,
        name: game.name,
        description: game.description,
        createdBy: null, // system-provided, not authored by a member
        source: BAKED_IN_SOURCE,
        isSample: true,
        categories: game.categories,
        questions: game.questions,
      });
    } else if (opts.forceSync) {
      // Rewrite the content to match code. isAdmin=true bypasses the ownership
      // check in updateDeck; the userId is unused when isAdmin is true.
      await updateDeck(existing.id, teamId, 'system', true, {
        name: game.name,
        description: game.description,
        categories: game.categories,
        questions: game.questions,
      });
    }
  }
}

// Seed the built-in games into EVERY team. Runs on boot. Content is re-synced
// across all teams only when BAKED_IN_VERSION has advanced past what was last
// applied; otherwise it just fills in any team that is missing a copy. Each team
// is isolated so one failure never blocks the rest.
export async function ensureBakedInGamesAllTeams(): Promise<void> {
  const applied = Number((await getSetting(VERSION_KEY)) ?? '0') || 0;
  const forceSync = applied < BAKED_IN_VERSION;

  const teams = await db.select({ id: tradingTeams.id }).from(tradingTeams);
  for (const t of teams) {
    try {
      await ensureBakedInGamesForTeam(t.id, { forceSync });
    } catch (err) {
      console.error(`Baked-in study game seed failed for team ${t.id}:`, err);
    }
  }

  if (forceSync) await setSetting(VERSION_KEY, String(BAKED_IN_VERSION));
}
