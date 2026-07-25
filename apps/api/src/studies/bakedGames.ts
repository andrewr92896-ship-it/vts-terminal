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

// A self-referential game that teaches the Study Game feature itself — levels,
// streaks, scoring, leaderboards, and where to build your own. Grounded in the
// real mechanics (gameEngine.ts) and the real Studies sections (theme/nav.ts).
const HOW_STUDY_GAMES_WORK: BakedGame = {
  name: 'How Study Games Work',
  description:
    'Learn the Study Game feature by playing it: levels, streaks, scoring, leaderboards, and how to build your own. A built-in example that teaches the mechanics as you go.',
  categories: ['Playing', 'Leveling Up', 'Streaks & Scoring', 'Building & Studying'],
  questions: [
    // ---- Playing ----
    {
      topic: 'Playing',
      stem: 'What is a Study Game on this portal?',
      options: [
        { label: 'A', text: 'A quiz your team builds and plays together' },
        { label: 'B', text: 'A single-player arcade game' },
        { label: 'C', text: 'A live trading simulator' },
        { label: 'D', text: 'A pre-recorded video course' },
      ],
      answer: 'A',
      explanation: 'Every study game is a quiz your team creates — there’s no hardcoded subject.',
    },
    {
      topic: 'Playing',
      stem: 'Where do a Study Game’s questions come from?',
      options: [
        { label: 'A', text: 'Your team makes them — typed in, AI-generated, or uploaded' },
        { label: 'B', text: 'They are built into the app' },
        { label: 'C', text: 'They come from the market news feed' },
        { label: 'D', text: 'Random internet trivia' },
      ],
      answer: 'A',
      explanation: 'All study content is team-built. (This built-in example is the one exception, to show you how it works.)',
    },
    {
      topic: 'Playing',
      stem: 'Who can see and play your team’s Study Games?',
      options: [
        { label: 'A', text: 'Your team — study content is scoped to your team' },
        { label: 'B', text: 'Everyone on the whole platform' },
        { label: 'C', text: 'Only admins' },
        { label: 'D', text: 'The general public' },
      ],
      answer: 'A',
      explanation: 'A team only ever sees its own games, flashcards, and guides.',
    },
    {
      topic: 'Playing',
      stem: 'Besides playing it, how else can the same study game be used?',
      options: [
        { label: 'A', text: 'As a graded Test Mode and as a Progress summary' },
        { label: 'B', text: 'As a live-trading mode' },
        { label: 'C', text: 'As a team chat room' },
        { label: 'D', text: 'As a broker connection' },
      ],
      answer: 'A',
      explanation: 'The same game can be played as a quiz, taken as a graded test, or reviewed as a progress summary.',
    },
    {
      topic: 'Playing',
      stem: 'If a question trips you up, what can you do to revisit it later?',
      options: [
        { label: 'A', text: 'Star it so it’s saved to come back to' },
        { label: 'B', text: 'Screenshot it and email an admin' },
        { label: 'C', text: 'Delete it from the game' },
        { label: 'D', text: 'Nothing — questions can’t be flagged' },
      ],
      answer: 'A',
      explanation: 'Starring a question flags it; your starred set follows you across devices.',
    },

    // ---- Leveling Up ----
    {
      topic: 'Leveling Up',
      stem: 'How do you level up in a Study Game?',
      options: [
        { label: 'A', text: 'By answering questions correctly' },
        { label: 'B', text: 'By spending points you buy' },
        { label: 'C', text: 'By waiting a day between sessions' },
        { label: 'D', text: 'By inviting new members' },
      ],
      answer: 'A',
      explanation: 'Advancement is a running count of your correct answers.',
    },
    {
      topic: 'Leveling Up',
      stem: 'What is the very first level on the ladder?',
      options: [
        { label: 'A', text: '🥚 Egg' },
        { label: 'B', text: '💎 Diamond' },
        { label: 'C', text: 'Bronze Rookie' },
        { label: 'D', text: 'Level 0' },
      ],
      answer: 'A',
      explanation: 'The ladder starts at Egg and climbs through twelve themed levels.',
    },
    {
      topic: 'Leveling Up',
      stem: 'What is the highest, fully-maxed level?',
      options: [
        { label: 'A', text: '💎 Diamond (five stars)' },
        { label: 'B', text: '🥚 Egg' },
        { label: 'C', text: '⚫ Onyx' },
        { label: 'D', text: 'Gold' },
      ],
      answer: 'A',
      explanation: 'The top of the ladder is Diamond at five stars.',
    },
    {
      topic: 'Leveling Up',
      stem: 'How many stars (sub-levels) does each main level hold?',
      options: [
        { label: 'A', text: 'Five' },
        { label: 'B', text: 'Three' },
        { label: 'C', text: 'Ten' },
        { label: 'D', text: 'One' },
      ],
      answer: 'A',
      explanation: 'Each of the twelve levels has five sub-levels, shown as stars.',
    },
    {
      topic: 'Leveling Up',
      stem: 'As you climb, each new sub-level requires…',
      options: [
        { label: 'A', text: 'Slightly more correct answers than the one before' },
        { label: 'B', text: 'Fewer answers each time' },
        { label: 'C', text: 'Exactly the same number every time' },
        { label: 'D', text: 'A payment to continue' },
      ],
      answer: 'A',
      explanation: 'Each sub-level costs one more correct answer than the last, so higher levels take longer.',
    },
    {
      topic: 'Leveling Up',
      stem: 'As your level rises, the Studies section…',
      options: [
        { label: 'A', text: 'Recolors live to match your current level' },
        { label: 'B', text: 'Locks you out until tomorrow' },
        { label: 'C', text: 'Resets your team' },
        { label: 'D', text: 'Turns the sound off' },
      ],
      answer: 'A',
      explanation: 'The Studies workspace shades live to your current Study-Game level.',
    },

    // ---- Streaks & Scoring ----
    {
      topic: 'Streaks & Scoring',
      stem: 'What is a “streak”?',
      options: [
        { label: 'A', text: 'A run of consecutive correct answers' },
        { label: 'B', text: 'How many days in a row you log in' },
        { label: 'C', text: 'Your total number of questions' },
        { label: 'D', text: 'Your rank on the team' },
      ],
      answer: 'A',
      explanation: 'A streak counts how many correct answers you’ve gotten in a row.',
    },
    {
      topic: 'Streaks & Scoring',
      stem: 'What happens to your streak when you get one question wrong?',
      options: [
        { label: 'A', text: 'It resets to zero' },
        { label: 'B', text: 'Nothing changes' },
        { label: 'C', text: 'It doubles' },
        { label: 'D', text: 'It pauses for a day' },
      ],
      answer: 'A',
      explanation: 'A single wrong answer resets the streak and its multiplier.',
    },
    {
      topic: 'Streaks & Scoring',
      stem: 'How many correct answers in a row bump your streak multiplier up a tier?',
      options: [
        { label: 'A', text: 'Five' },
        { label: 'B', text: 'Two' },
        { label: 'C', text: 'Twenty' },
        { label: 'D', text: 'One hundred' },
      ],
      answer: 'A',
      explanation: 'Every 5 in a row raises the multiplier — 5 → ×2, 10 → ×3, and so on.',
    },
    {
      topic: 'Streaks & Scoring',
      stem: 'What does the streak multiplier actually do?',
      options: [
        { label: 'A', text: 'Makes each correct answer count for more toward your level' },
        { label: 'B', text: 'Pays out real money' },
        { label: 'C', text: 'Unlocks other teams’ games' },
        { label: 'D', text: 'Changes the questions' },
      ],
      answer: 'A',
      explanation: 'The multiplier scales your level progress; lifetime accuracy still counts each answer once.',
    },
    {
      topic: 'Streaks & Scoring',
      stem: 'On a Study Game leaderboard, who are you ranked against?',
      options: [
        { label: 'A', text: 'Your own team' },
        { label: 'B', text: 'The entire platform' },
        { label: 'C', text: 'Random strangers' },
        { label: 'D', text: 'Only yourself' },
      ],
      answer: 'A',
      explanation: 'Leaderboards are scoped to your team.',
    },

    // ---- Building & Studying ----
    {
      topic: 'Building & Studying',
      stem: 'Which section do you use to make your own study games?',
      options: [
        { label: 'A', text: 'Study Creation' },
        { label: 'B', text: 'Live Wall' },
        { label: 'C', text: 'Market News' },
        { label: 'D', text: 'Admin Portal' },
      ],
      answer: 'A',
      explanation: 'Study Creation is the make-and-manage section for games, flashcard sets, and study guides.',
    },
    {
      topic: 'Building & Studying',
      stem: 'Which is a valid way to build a study game in Study Creation?',
      options: [
        { label: 'A', text: 'Type questions in, generate them from a topic with AI, or upload a file' },
        { label: 'B', text: 'Only by paying a fee' },
        { label: 'C', text: 'Only an admin can build one' },
        { label: 'D', text: 'They can’t be created — only played' },
      ],
      answer: 'A',
      explanation: 'You can hand-type questions, AI-generate them from a topic, or upload a text file.',
    },
    {
      topic: 'Building & Studying',
      stem: 'What are Flashcards for?',
      options: [
        { label: 'A', text: 'Studying term/definition cards with an auto-rotating player' },
        { label: 'B', text: 'Placing trades' },
        { label: 'C', text: 'Sending team chat messages' },
        { label: 'D', text: 'Scheduling trading sessions' },
      ],
      answer: 'A',
      explanation: 'Flashcards flip through term/definition pairs to help you memorize.',
    },
    {
      topic: 'Building & Studying',
      stem: 'This “How Study Games Work” game is…',
      options: [
        { label: 'A', text: 'A permanent built-in example, so everyone can learn the feature' },
        { label: 'B', text: 'A game you’re expected to delete' },
        { label: 'C', text: 'A live trading alert' },
        { label: 'D', text: 'A one-time pop-up' },
      ],
      answer: 'A',
      explanation: 'It’s tagged “Built-in” and can’t be removed — it’s here to teach the feature.',
    },
  ],
};

// An onboarding game about the portal itself — the workspaces, the key sections,
// and how VTS is meant to be used. Section names match theme/nav.ts exactly.
const VTS_PORTAL_101: BakedGame = {
  name: 'VTS Portal 101',
  description:
    'Get oriented: the workspaces, the sections you’ll use most, and how the portal is meant to be used. A built-in tour so new members can find their way around.',
  categories: ['Getting Around', 'Trading Workspace', 'Studies Workspace', 'Help & Account'],
  questions: [
    // ---- Getting Around ----
    {
      topic: 'Getting Around',
      stem: 'How is the portal organized?',
      options: [
        { label: 'A', text: 'Into workspaces, each with its own sections in the sidebar' },
        { label: 'B', text: 'As one long single page' },
        { label: 'C', text: 'As a set of email threads' },
        { label: 'D', text: 'Only as pop-up windows' },
      ],
      answer: 'A',
      explanation: 'Each workspace (Trading, Studies, Site Help, …) has its own sidebar sections.',
    },
    {
      topic: 'Getting Around',
      stem: 'Which workspace is pinned to the very top of the sidebar?',
      options: [
        { label: 'A', text: 'My Portal' },
        { label: 'B', text: 'Trading' },
        { label: 'C', text: 'Admin Portal' },
        { label: 'D', text: 'Site Help' },
      ],
      answer: 'A',
      explanation: 'My Portal — your personal workspace — sits at the top of the list.',
    },
    {
      topic: 'Getting Around',
      stem: 'Can you install VTS on your device like an app?',
      options: [
        { label: 'A', text: 'Yes — it’s a PWA you can install to your home screen' },
        { label: 'B', text: 'No, it only works in a browser tab' },
        { label: 'C', text: 'Only on Windows' },
        { label: 'D', text: 'Only from the App Store today' },
      ],
      answer: 'A',
      explanation: 'The portal is a PWA — installable, with web push notifications.',
    },
    {
      topic: 'Getting Around',
      stem: 'How does the portal send you trade and alert notifications?',
      options: [
        { label: 'A', text: 'Web push and Pushover' },
        { label: 'B', text: 'Fax' },
        { label: 'C', text: 'It never sends notifications' },
        { label: 'D', text: 'Postal mail' },
      ],
      answer: 'A',
      explanation: 'Notifications go out via web push and Pushover.',
    },
    {
      topic: 'Getting Around',
      stem: 'Need a quick answer about the portal? You can…',
      options: [
        { label: 'A', text: 'Ask the built-in Ask Claude assistant' },
        { label: 'B', text: 'Call a phone hotline' },
        { label: 'C', text: 'There is no help available' },
        { label: 'D', text: 'Only wait for an email reply' },
      ],
      answer: 'A',
      explanation: 'The Ask Claude panel answers questions about the portal.',
    },

    // ---- Trading Workspace ----
    {
      topic: 'Trading Workspace',
      stem: 'Which Trading section shows live open positions?',
      options: [
        { label: 'A', text: 'Live Wall' },
        { label: 'B', text: 'Market News' },
        { label: 'C', text: 'To Do' },
        { label: 'D', text: 'Strategy Sessions' },
      ],
      answer: 'A',
      explanation: 'The Live Wall streams your team’s open positions.',
    },
    {
      topic: 'Trading Workspace',
      stem: 'Where do you review your trade log and history?',
      options: [
        { label: 'A', text: 'Trade Desk' },
        { label: 'B', text: 'Flashcards' },
        { label: 'C', text: 'Announcements' },
        { label: 'D', text: 'Preferences' },
      ],
      answer: 'A',
      explanation: 'The Trade Desk merges the trade log, history, and live brokers.',
    },
    {
      topic: 'Trading Workspace',
      stem: 'What are “Strategy Sessions”?',
      options: [
        { label: 'A', text: 'Named trading windows with a bias and a weekly schedule' },
        { label: 'B', text: 'Study quizzes' },
        { label: 'C', text: 'Team chat rooms' },
        { label: 'D', text: 'Broker fee tiers' },
      ],
      answer: 'A',
      explanation: 'Sessions define per-weekday ET windows with a Bull / Bear / Two-way bias.',
    },
    {
      topic: 'Trading Workspace',
      stem: 'Where do you read market headlines and the economic calendar?',
      options: [
        { label: 'A', text: 'Market News' },
        { label: 'B', text: 'Subjects' },
        { label: 'C', text: 'Live Wall' },
        { label: 'D', text: 'Badges' },
      ],
      answer: 'A',
      explanation: 'Market News carries the headline feed and the economic calendar.',
    },
    {
      topic: 'Trading Workspace',
      stem: 'Does VTS place or execute trades for you?',
      options: [
        { label: 'A', text: 'No — it displays your positions and P&L; it doesn’t place trades' },
        { label: 'B', text: 'Yes, it’s a full brokerage' },
        { label: 'C', text: 'Yes, but only for crypto' },
        { label: 'D', text: 'Yes, automatically from alerts' },
      ],
      answer: 'A',
      explanation: 'The portal is a read-only tracker — it shows positions and P&L, it doesn’t move money or place orders.',
    },

    // ---- Studies Workspace ----
    {
      topic: 'Studies Workspace',
      stem: 'What lives in the Studies workspace?',
      options: [
        { label: 'A', text: 'Team-built study games, flashcards, practice tests, and guides' },
        { label: 'B', text: 'Live trades and broker keys' },
        { label: 'C', text: 'User management tools' },
        { label: 'D', text: 'The economic calendar' },
      ],
      answer: 'A',
      explanation: 'Studies holds your team’s games, flashcard sets, practice tests, and study presentations.',
    },
    {
      topic: 'Studies Workspace',
      stem: 'Where do you build your own study games and flashcard sets?',
      options: [
        { label: 'A', text: 'Study Creation' },
        { label: 'B', text: 'Subjects' },
        { label: 'C', text: 'Progress' },
        { label: 'D', text: 'Practice Tests' },
      ],
      answer: 'A',
      explanation: 'Study Creation is the make-and-manage section for all study content.',
    },
    {
      topic: 'Studies Workspace',
      stem: 'What does the “Practice Tests” section do?',
      options: [
        { label: 'A', text: 'Lets you take a graded test drawn from your team’s study games' },
        { label: 'B', text: 'Places practice trades' },
        { label: 'C', text: 'Opens a team chat' },
        { label: 'D', text: 'Plays training videos' },
      ],
      answer: 'A',
      explanation: 'Practice Tests turn a study game into a graded exam with a pass line.',
    },
    {
      topic: 'Studies Workspace',
      stem: 'Where do you track how your studying is going over time?',
      options: [
        { label: 'A', text: 'The Progress section' },
        { label: 'B', text: 'The Live Wall' },
        { label: 'C', text: 'To Do' },
        { label: 'D', text: 'Badges' },
      ],
      answer: 'A',
      explanation: 'Progress summarizes your study-game stats and level.',
    },

    // ---- Help & Account ----
    {
      topic: 'Help & Account',
      stem: 'Where do you report a bug or send a suggestion?',
      options: [
        { label: 'A', text: 'Site Help' },
        { label: 'B', text: 'Live Wall' },
        { label: 'C', text: 'Trade Desk' },
        { label: 'D', text: 'Strategy Sessions' },
      ],
      answer: 'A',
      explanation: 'Site Help has How-to guides, Announcements, Patch notes, and the bug / suggestion forms.',
    },
    {
      topic: 'Help & Account',
      stem: 'Where do you find how-to guides and patch notes?',
      options: [
        { label: 'A', text: 'Site Help' },
        { label: 'B', text: 'Market News' },
        { label: 'C', text: 'My Portal' },
        { label: 'D', text: 'Admin Portal' },
      ],
      answer: 'A',
      explanation: 'Site Help is available to every signed-in user.',
    },
    {
      topic: 'Help & Account',
      stem: 'Where do you manage your own preferences and account settings?',
      options: [
        { label: 'A', text: 'My Portal' },
        { label: 'B', text: 'Admin Portal' },
        { label: 'C', text: 'Trade Desk' },
        { label: 'D', text: 'Market News' },
      ],
      answer: 'A',
      explanation: 'My Portal holds your Trading Team, Preferences, and Settings.',
    },
    {
      topic: 'Help & Account',
      stem: 'What is a “Trading Team”?',
      options: [
        { label: 'A', text: 'A group you belong to that scopes your trades, chat, and study leaderboards' },
        { label: 'B', text: 'A paid subscription tier' },
        { label: 'C', text: 'A type of trade order' },
        { label: 'D', text: 'A news source' },
      ],
      answer: 'A',
      explanation: 'Teams scope trade data, team chat, and Studies leaderboards to your teammates.',
    },
    {
      topic: 'Help & Account',
      stem: 'The version pill at the top of the screen shows…',
      options: [
        { label: 'A', text: 'The current app version' },
        { label: 'B', text: 'Your account balance' },
        { label: 'C', text: 'The current time' },
        { label: 'D', text: 'Your study level' },
      ],
      answer: 'A',
      explanation: 'It shows which build of the portal you’re on.',
    },
  ],
};

// An educational game on the core ideas of Dave Ramsey's personal-finance
// philosophy — the Baby Steps order, the debt snowball, budgeting, investing,
// insurance, and mortgages. Every question is framed as "what Ramsey says" so it
// teaches ABOUT his approach rather than giving advice, and it carries the
// standard not-affiliated / not-advice framing. Written in our own words (no
// verbatim book text); trademarked program names appear only referentially.
const DAVE_RAMSEY_MONEY_PRINCIPLES: BakedGame = {
  name: "Dave Ramsey's Money Principles",
  description:
    "Learn the core ideas of Dave Ramsey's money philosophy — the Baby Steps order, the debt snowball, budgeting, investing, insurance, and mortgages — taught through plain-English questions. A built-in example game. Educational only; not financial advice, and not affiliated with or endorsed by Dave Ramsey or Ramsey Solutions.",
  categories: ["Emergency Fund & Order", "Getting Out of Debt", "Credit & Cars", "Budgeting", "Investing & Retirement", "Insurance", "Buying a Home", "Kids & College", "Big Picture & Mindset"],
  questions: [
    // ---- Emergency Fund & Order ----
    {
      topic: "Emergency Fund & Order",
      stem: "How much does Ramsey say to save in a starter emergency fund BEFORE you start attacking your debt?",
      options: [
        { label: "A", text: "$5,000" },
        { label: "B", text: "$100" },
        { label: "C", text: "$1,000" },
        { label: "D", text: "One month of pay" },
      ],
      answer: "C",
      explanation: "Ramsey says a small $1,000 buffer stops a minor surprise from sending you back to credit cards while you focus on debt.",
    },
    {
      topic: "Emergency Fund & Order",
      stem: "Once you're debt-free (except the house), how big does Ramsey say your fully funded emergency fund should be?",
      options: [
        { label: "A", text: "3–6 months of expenses" },
        { label: "B", text: "Still $1,000" },
        { label: "C", text: "12 months of income" },
        { label: "D", text: "Whatever fits in checking" },
      ],
      answer: "A",
      explanation: "After debt is gone, grow the fund to 3–6 months of living expenses so a job loss or big bill doesn't create new debt.",
    },
    {
      topic: "Emergency Fund & Order",
      stem: "If your household spends about $4,000 a month, roughly how much should a fully funded emergency fund hold?",
      options: [
        { label: "A", text: "$1,000" },
        { label: "B", text: "$12,000–$24,000" },
        { label: "C", text: "$4,000" },
        { label: "D", text: "$50,000 or more" },
      ],
      answer: "B",
      explanation: "3–6 months of expenses at $4,000/month is about $12,000–$24,000.",
    },
    {
      topic: "Emergency Fund & Order",
      stem: "Where does Ramsey say to keep your emergency fund so it's safe and ready?",
      options: [
        { label: "A", text: "Invested in stock mutual funds" },
        { label: "B", text: "Lent to family for interest" },
        { label: "C", text: "In cryptocurrency" },
        { label: "D", text: "In a money-market or high-yield savings account" },
      ],
      answer: "D",
      explanation: "Ramsey says it must be liquid and safe — not invested or at risk of dropping right when you need it.",
    },
    {
      topic: "Emergency Fund & Order",
      stem: "You have credit-card debt and nothing saved. What does Ramsey say to do FIRST?",
      options: [
        { label: "A", text: "Invest for retirement" },
        { label: "B", text: "Save 6 months of expenses" },
        { label: "C", text: "Save a small $1,000 buffer, then attack the debt" },
        { label: "D", text: "Pay minimums and save aggressively at once" },
      ],
      answer: "C",
      explanation: "Get the $1,000 starter fund, then throw everything at the debt — one focused goal at a time.",
    },
    {
      topic: "Emergency Fund & Order",
      stem: "According to Ramsey, should you keep investing for retirement while aggressively paying off consumer debt?",
      options: [
        { label: "A", text: "Yes, always invest first" },
        { label: "B", text: "Invest exactly 15% no matter what" },
        { label: "C", text: "Only invest in crypto" },
        { label: "D", text: "No — pause investing and put everything toward the debt" },
      ],
      answer: "D",
      explanation: "Ramsey says temporarily stop investing during debt payoff so all your money attacks the debt and you finish faster.",
    },
    {
      topic: "Emergency Fund & Order",
      stem: "Which comes first in Ramsey's plan — a full 3–6 month emergency fund, or investing 15% for retirement?",
      options: [
        { label: "A", text: "Invest first" },
        { label: "B", text: "Do both at the same time" },
        { label: "C", text: "Neither is a priority" },
        { label: "D", text: "Build the full emergency fund first" },
      ],
      answer: "D",
      explanation: "Order matters: finish the full emergency fund before you start investing 15% for retirement.",
    },
    {
      topic: "Emergency Fund & Order",
      stem: "Which sequence matches Ramsey's order of priorities?",
      options: [
        { label: "A", text: "Invest, then pay off debt, then save an emergency fund" },
        { label: "B", text: "Pay off the house, then save, then invest" },
        { label: "C", text: "$1,000 starter fund, then pay off debt, then full emergency fund, then invest 15%" },
        { label: "D", text: "Emergency fund, then college, then debt" },
      ],
      answer: "C",
      explanation: "Starter fund → attack debt → full emergency fund → invest 15%. One focused step at a time.",
    },
    // ---- Getting Out of Debt ----
    {
      topic: "Getting Out of Debt",
      stem: "In Ramsey's debt payoff method, which debt do you throw extra money at first?",
      options: [
        { label: "A", text: "The one with the smallest balance" },
        { label: "B", text: "The one with the highest interest rate" },
        { label: "C", text: "The largest balance" },
        { label: "D", text: "The newest debt" },
      ],
      answer: "A",
      explanation: "Pay minimums on everything, then attack the smallest balance first — regardless of interest rate. That's the debt snowball.",
    },
    {
      topic: "Getting Out of Debt",
      stem: "Why does Ramsey say to pay the smallest balance first instead of the highest interest rate?",
      options: [
        { label: "A", text: "It saves the most interest" },
        { label: "B", text: "Banks demand it" },
        { label: "C", text: "It's required by law" },
        { label: "D", text: "Quick wins build momentum and keep you motivated" },
      ],
      answer: "D",
      explanation: "Ramsey treats money as mostly behavior — knocking out a whole debt early gives a win that keeps you going.",
    },
    {
      topic: "Getting Out of Debt",
      stem: "You just paid off your smallest debt. What do you do with the money that was going to it?",
      options: [
        { label: "A", text: "Add it to your fun budget" },
        { label: "B", text: "Save it" },
        { label: "C", text: "Roll it onto the next-smallest debt" },
        { label: "D", text: "Split it evenly across all remaining debts" },
      ],
      answer: "C",
      explanation: "You 'snowball' that freed-up payment onto the next debt, so each payoff makes the next one faster.",
    },
    {
      topic: "Getting Out of Debt",
      stem: "When you list your debts to pay off, which one do you leave OUT of the plan?",
      options: [
        { label: "A", text: "Your car loan" },
        { label: "B", text: "Your home mortgage" },
        { label: "C", text: "Your student loans" },
        { label: "D", text: "Your medical bills" },
      ],
      answer: "B",
      explanation: "The mortgage is tackled much later — after retirement and college saving. Every other debt goes in the snowball.",
    },
    {
      topic: "Getting Out of Debt",
      stem: "A lender offers a consolidation loan to combine all your debts. What's Ramsey's take?",
      options: [
        { label: "A", text: "It doesn't fix the spending habits that created the debt" },
        { label: "B", text: "Do it right away" },
        { label: "C", text: "It erases the debt instantly" },
        { label: "D", text: "It's required before you start" },
      ],
      answer: "A",
      explanation: "Consolidation just moves debt around; without changed behavior, the debt usually comes right back.",
    },
    {
      topic: "Getting Out of Debt",
      stem: "You get a surprise $3,000 tax refund while paying off debt. What best fits Ramsey's plan?",
      options: [
        { label: "A", text: "Invest it in stocks" },
        { label: "B", text: "Throw it at your smallest remaining debt" },
        { label: "C", text: "Save it for later" },
        { label: "D", text: "Take a vacation" },
      ],
      answer: "B",
      explanation: "Unexpected money accelerates your current goal — during payoff, that means attacking a debt.",
    },
    {
      topic: "Getting Out of Debt",
      stem: "What does Ramsey mean by 'gazelle intensity'?",
      options: [
        { label: "A", text: "Investing aggressively" },
        { label: "B", text: "Paying only the minimums" },
        { label: "C", text: "A category of mutual fund" },
        { label: "D", text: "Attacking debt with fierce, all-out focus" },
      ],
      answer: "D",
      explanation: "Like a gazelle sprinting from a predator — get out of debt fast, with total focus and sacrifice.",
    },
    {
      topic: "Getting Out of Debt",
      stem: "'Beans and rice, rice and beans' is shorthand for what?",
      options: [
        { label: "A", text: "A specific diet" },
        { label: "B", text: "A grocery app" },
        { label: "C", text: "Temporarily cutting spending to the basics to kill debt fast" },
        { label: "D", text: "A restaurant discount" },
      ],
      answer: "C",
      explanation: "It means living lean for a season — cut the extras — so you can pour money at the debt.",
    },
    // ---- Credit & Cars ----
    {
      topic: "Credit & Cars",
      stem: "What does Ramsey recommend doing with credit cards?",
      options: [
        { label: "A", text: "Use them for points and pay them off monthly" },
        { label: "B", text: "Keep one for emergencies" },
        { label: "C", text: "Open several to build credit" },
        { label: "D", text: "Get rid of them and pay with cash or debit" },
      ],
      answer: "D",
      explanation: "He opposes all consumer debt — spend money you have, and let your emergency fund handle emergencies.",
    },
    {
      topic: "Credit & Cars",
      stem: "According to Ramsey, what does a FICO credit score actually measure?",
      options: [
        { label: "A", text: "How much you've borrowed and interacted with debt" },
        { label: "B", text: "How responsible you are" },
        { label: "C", text: "How wealthy you are" },
        { label: "D", text: "Your net worth" },
      ],
      answer: "A",
      explanation: "He argues a credit score just reflects your history with debt — not wealth — and says you don't need one.",
    },
    {
      topic: "Credit & Cars",
      stem: "What's Ramsey's advice for buying a car?",
      options: [
        { label: "A", text: "Lease a new one every few years" },
        { label: "B", text: "Finance a new car over 72 months" },
        { label: "C", text: "Use a home-equity loan" },
        { label: "D", text: "Pay cash for a reliable used car" },
      ],
      answer: "D",
      explanation: "New cars lose value fast; pay cash and buy used. He calls leasing 'fleecing.'",
    },
    // ---- Budgeting ----
    {
      topic: "Budgeting",
      stem: "In a zero-based budget, what should your income minus all your planned spending, saving, and giving equal?",
      options: [
        { label: "A", text: "10% left over as a cushion" },
        { label: "B", text: "Zero" },
        { label: "C", text: "Your savings rate" },
        { label: "D", text: "One month's expenses" },
      ],
      answer: "B",
      explanation: "Give every single dollar a job before the month begins — income minus outgo equals zero.",
    },
    {
      topic: "Budgeting",
      stem: "When money is tight, which expenses does Ramsey say to cover FIRST (the 'Four Walls')?",
      options: [
        { label: "A", text: "Rent, cable, phone, internet" },
        { label: "B", text: "Food, utilities, shelter, transportation" },
        { label: "C", text: "Minimum debt payments" },
        { label: "D", text: "Streaming, dining, and subscriptions" },
      ],
      answer: "B",
      explanation: "Take care of survival first — food, utilities, shelter, transportation — before any other bill.",
    },
    {
      topic: "Budgeting",
      stem: "What problem does the cash 'envelope system' solve?",
      options: [
        { label: "A", text: "Overspending in categories like groceries and dining out" },
        { label: "B", text: "Earning more interest" },
        { label: "C", text: "Filing your taxes" },
        { label: "D", text: "Building your credit score" },
      ],
      answer: "A",
      explanation: "When the cash in a category's envelope is gone, you stop — it makes overspending impossible.",
    },
    {
      topic: "Budgeting",
      stem: "You know you'll need about $1,200 for car repairs and Christmas later this year. What does Ramsey suggest?",
      options: [
        { label: "A", text: "Save a little each month in a 'sinking fund'" },
        { label: "B", text: "Put it on a credit card when it comes" },
        { label: "C", text: "Take a small loan" },
        { label: "D", text: "Ignore it until it happens" },
      ],
      answer: "A",
      explanation: "A sinking fund saves gradually toward a known future cost, so it's cash-ready and never becomes debt.",
    },
    {
      topic: "Budgeting",
      stem: "In Ramsey's approach, what's the main point of budgeting every dollar before the month starts?",
      options: [
        { label: "A", text: "To feel restricted" },
        { label: "B", text: "To impress your bank" },
        { label: "C", text: "To tell your money where to go instead of wondering where it went" },
        { label: "D", text: "To raise your credit score" },
      ],
      answer: "C",
      explanation: "A written plan gives you control — you decide on purpose rather than react at the end of the month.",
    },
    // ---- Investing & Retirement ----
    {
      topic: "Investing & Retirement",
      stem: "Once you're debt-free with a full emergency fund, what percent of income does Ramsey say to invest for retirement?",
      options: [
        { label: "A", text: "5%" },
        { label: "B", text: "15%" },
        { label: "C", text: "10%" },
        { label: "D", text: "25%" },
      ],
      answer: "B",
      explanation: "Invest 15% of gross household income for retirement at that stage — enough to build real wealth without starving the budget.",
    },
    {
      topic: "Investing & Retirement",
      stem: "If your employer matches your 401(k), what does Ramsey say to fund FIRST?",
      options: [
        { label: "A", text: "The 401(k) up to the full match" },
        { label: "B", text: "A Roth IRA" },
        { label: "C", text: "Individual stocks" },
        { label: "D", text: "A regular savings account" },
      ],
      answer: "A",
      explanation: "Grab the free match first — it's an instant, guaranteed return — then move on.",
    },
    {
      topic: "Investing & Retirement",
      stem: "After you've captured the full employer match, where does Ramsey say to put money next?",
      options: [
        { label: "A", text: "A Roth IRA" },
        { label: "B", text: "A whole life policy" },
        { label: "C", text: "Bonds" },
        { label: "D", text: "A checking account" },
      ],
      answer: "A",
      explanation: "Fund a Roth IRA next for tax-free growth, then return to the 401(k) to reach 15%.",
    },
    {
      topic: "Investing & Retirement",
      stem: "Why does Ramsey favor a Roth account?",
      options: [
        { label: "A", text: "You can withdraw anytime with no rules" },
        { label: "B", text: "It has no contribution limit" },
        { label: "C", text: "It guarantees a 12% return" },
        { label: "D", text: "Qualified retirement withdrawals come out tax-free" },
      ],
      answer: "D",
      explanation: "You invest after-tax dollars now so the growth and retirement withdrawals are tax-free later.",
    },
    {
      topic: "Investing & Retirement",
      stem: "Ramsey says to spread your stock mutual funds across which four types?",
      options: [
        { label: "A", text: "Growth, growth & income, aggressive growth, international" },
        { label: "B", text: "Tech, healthcare, energy, finance" },
        { label: "C", text: "Large, mid, small, micro" },
        { label: "D", text: "Stocks, bonds, gold, cash" },
      ],
      answer: "A",
      explanation: "He splits roughly evenly (about 25% each) across growth, growth & income, aggressive growth, and international funds.",
    },
    {
      topic: "Investing & Retirement",
      stem: "What kind of investments does Ramsey steer people toward for retirement?",
      options: [
        { label: "A", text: "Individual hot stocks" },
        { label: "B", text: "Options and day-trading" },
        { label: "C", text: "Long-term stock mutual funds held steadily" },
        { label: "D", text: "Whatever is trending" },
      ],
      answer: "C",
      explanation: "He favors boring, consistent investing in diversified mutual funds over picking single stocks.",
    },
    {
      topic: "Investing & Retirement",
      stem: "A coworker pushes a 'hot' single stock. What matches Ramsey's approach?",
      options: [
        { label: "A", text: "Keep investing steadily in diversified mutual funds" },
        { label: "B", text: "Put your whole 15% into that one stock" },
        { label: "C", text: "Borrow money to buy more of it" },
        { label: "D", text: "Day-trade it for quick gains" },
      ],
      answer: "A",
      explanation: "Ramsey favors steady, diversified mutual-fund investing over betting on any single stock.",
    },
    {
      topic: "Investing & Retirement",
      stem: "What long-term average annual stock-market return does Ramsey commonly cite (a figure many experts dispute)?",
      options: [
        { label: "A", text: "4%" },
        { label: "B", text: "12%" },
        { label: "C", text: "7%" },
        { label: "D", text: "20%" },
      ],
      answer: "B",
      explanation: "He cites ~12% from the S&P 500's long-run average; critics say a lower, inflation-adjusted number is more realistic.",
    },
    {
      topic: "Investing & Retirement",
      stem: "Ramsey has controversially claimed retirees can safely withdraw what percent of savings each year?",
      options: [
        { label: "A", text: "3%" },
        { label: "B", text: "4%" },
        { label: "C", text: "8%" },
        { label: "D", text: "15%" },
      ],
      answer: "C",
      explanation: "He's said 8%; most researchers consider that too high and suggest ~4% or less. Don't treat 8% as a safe rule — it's here so you know the debate.",
    },
    // ---- Insurance ----
    {
      topic: "Insurance",
      stem: "What kind of life insurance does Ramsey recommend?",
      options: [
        { label: "A", text: "Whole life" },
        { label: "B", text: "Term life" },
        { label: "C", text: "Universal life" },
        { label: "D", text: "Variable life" },
      ],
      answer: "B",
      explanation: "Buy level term life; skip cash-value policies like whole life.",
    },
    {
      topic: "Insurance",
      stem: "How much term life coverage does Ramsey suggest carrying?",
      options: [
        { label: "A", text: "1–2 times your income" },
        { label: "B", text: "10–12 times your income" },
        { label: "C", text: "50 times your income" },
        { label: "D", text: "A flat $100,000" },
      ],
      answer: "B",
      explanation: "About 10–12x your annual income, on a 15–20 year term, so your family is protected if you're gone.",
    },
    {
      topic: "Insurance",
      stem: "Why does Ramsey tell people to avoid whole life / cash-value insurance?",
      options: [
        { label: "A", text: "It's illegal" },
        { label: "B", text: "It's cheaper than term" },
        { label: "C", text: "It has no death benefit" },
        { label: "D", text: "It's costly and mixes insurance with a poor investment" },
      ],
      answer: "D",
      explanation: "'Buy term and invest the difference' — the cash-value version is expensive and a weak investment.",
    },
    {
      topic: "Insurance",
      stem: "What's the real job of life insurance in Ramsey's plan?",
      options: [
        { label: "A", text: "To build cash value" },
        { label: "B", text: "To raise your credit" },
        { label: "C", text: "To replace your income so your family is protected" },
        { label: "D", text: "To lower your taxes" },
      ],
      answer: "C",
      explanation: "It exists to protect the people who depend on your income — that's the whole point.",
    },
    // ---- Buying a Home ----
    {
      topic: "Buying a Home",
      stem: "What type of mortgage does Ramsey recommend?",
      options: [
        { label: "A", text: "A 30-year fixed" },
        { label: "B", text: "An adjustable-rate mortgage" },
        { label: "C", text: "A 15-year fixed-rate" },
        { label: "D", text: "An interest-only loan" },
      ],
      answer: "C",
      explanation: "Only a 15-year fixed — you pay far less interest and own the home much sooner.",
    },
    {
      topic: "Buying a Home",
      stem: "Ramsey says your monthly house payment should be no more than what share of your take-home pay?",
      options: [
        { label: "A", text: "50%" },
        { label: "B", text: "40%" },
        { label: "C", text: "25%" },
        { label: "D", text: "10%" },
      ],
      answer: "C",
      explanation: "Keep it at or below 25% of monthly take-home pay so the house doesn't squeeze the rest of your life.",
    },
    {
      topic: "Buying a Home",
      stem: "When financing a home, how much does Ramsey suggest putting down to avoid PMI?",
      options: [
        { label: "A", text: "Nothing" },
        { label: "B", text: "3%" },
        { label: "C", text: "5%" },
        { label: "D", text: "At least 20%" },
      ],
      answer: "D",
      explanation: "A 20% down payment avoids private mortgage insurance (PMI), an extra monthly cost that protects the lender, not you.",
    },
    {
      topic: "Buying a Home",
      stem: "Where does paying off the house fall in Ramsey's order of priorities?",
      options: [
        { label: "A", text: "Before building an emergency fund" },
        { label: "B", text: "First, before anything else" },
        { label: "C", text: "After you're investing for retirement and saving for kids' college" },
        { label: "D", text: "You never pay it off" },
      ],
      answer: "C",
      explanation: "The mortgage is the last debt — knocked out after you're investing 15% and saving for college.",
    },
    // ---- Kids & College ----
    {
      topic: "Kids & College",
      stem: "What accounts does Ramsey point to for saving for a child's college?",
      options: [
        { label: "A", text: "A whole life policy" },
        { label: "B", text: "An ESA (Education Savings Account) and/or a 529 plan" },
        { label: "C", text: "A regular checking account" },
        { label: "D", text: "A credit-card rewards account" },
      ],
      answer: "B",
      explanation: "Use tax-advantaged college accounts (ESA/529) — not insurance or plain savings.",
    },
    {
      topic: "Kids & College",
      stem: "What's Ramsey's stance on student loans?",
      options: [
        { label: "A", text: "They're 'good debt'" },
        { label: "B", text: "Take the maximum offered" },
        { label: "C", text: "Only federal ones are fine" },
        { label: "D", text: "Avoid them — cash-flow school, use scholarships and cheaper options" },
      ],
      answer: "D",
      explanation: "He rejects the idea of 'good debt' — pay for school with savings, work, scholarships, and affordable choices.",
    },
    {
      topic: "Kids & College",
      stem: "Do you save for your kids' college before or after funding your own retirement?",
      options: [
        { label: "A", text: "After you're investing 15% for retirement" },
        { label: "B", text: "At the same time" },
        { label: "C", text: "Before" },
        { label: "D", text: "You skip retirement for college" },
      ],
      answer: "A",
      explanation: "Fund retirement (15%) first, then college — you can borrow for school, but you can't borrow for retirement.",
    },
    // ---- Big Picture & Mindset ----
    {
      topic: "Big Picture & Mindset",
      stem: "What does Ramsey say is the ultimate purpose of getting your money in order?",
      options: [
        { label: "A", text: "To retire by 40" },
        { label: "B", text: "To build wealth so you can live and give generously" },
        { label: "C", text: "To buy luxury goods" },
        { label: "D", text: "To beat the stock market" },
      ],
      answer: "B",
      explanation: "The final goal is building wealth and giving — money is a tool to be generous, not the point itself.",
    },
    {
      topic: "Big Picture & Mindset",
      stem: "Ramsey famously says personal finance is mostly about what?",
      options: [
        { label: "A", text: "Your behavior and habits" },
        { label: "B", text: "Complicated math" },
        { label: "C", text: "Picking the right stocks" },
        { label: "D", text: "How much you earn" },
      ],
      answer: "A",
      explanation: "His line: money is '80% behavior, 20% head knowledge' — habits beat math.",
    },
    {
      topic: "Big Picture & Mindset",
      stem: "In Ramsey's National Study of Millionaires, how did most build their wealth?",
      options: [
        { label: "A", text: "Inheriting it" },
        { label: "B", text: "Steadily investing over time (often a workplace 401(k))" },
        { label: "C", text: "Lottery or windfalls" },
        { label: "D", text: "One big risky bet" },
      ],
      answer: "B",
      explanation: "8 in 10 invested in a 401(k) and built wealth consistently — there was no shortcut.",
    },
    {
      topic: "Big Picture & Mindset",
      stem: "What did that same study find about inheritance?",
      options: [
        { label: "A", text: "Most inherited their wealth" },
        { label: "B", text: "79% received no inheritance at all" },
        { label: "C", text: "Half inherited over $1 million" },
        { label: "D", text: "Inheritance was the top factor" },
      ],
      answer: "B",
      explanation: "79% got no inheritance — the wealth was built, not handed down.",
    },
    {
      topic: "Big Picture & Mindset",
      stem: "What kinds of jobs did most of the millionaires in the study have?",
      options: [
        { label: "A", text: "Celebrities and pro athletes" },
        { label: "B", text: "Mostly doctors and lawyers" },
        { label: "C", text: "Only CEOs and executives" },
        { label: "D", text: "Ordinary careers like engineer, accountant, and teacher" },
      ],
      answer: "D",
      explanation: "The top careers were everyday jobs — engineer, accountant, teacher — not glamorous or ultra-high-paying ones.",
    },
    {
      topic: "Big Picture & Mindset",
      stem: "According to Baby Steps Millionaires, how fast did many millionaires pay off their homes?",
      options: [
        { label: "A", text: "In about 10–11 years" },
        { label: "B", text: "In about 30 years" },
        { label: "C", text: "They never did" },
        { label: "D", text: "In about 25 years" },
      ],
      answer: "A",
      explanation: "Many paid off the mortgage in roughly a decade — far faster than the standard 30 years.",
    },
  ],
};

// Every built-in example game. Add new games here — a team that lacks any of
// them gets it created on the next boot or Studies visit (create-if-missing), so
// adding a game needs no version bump; only CHANGING a game's content does.
export const BAKED_IN_GAMES: BakedGame[] = [
  MARKET_TERMINOLOGY_101,
  HOW_STUDY_GAMES_WORK,
  VTS_PORTAL_101,
  DAVE_RAMSEY_MONEY_PRINCIPLES,
];

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
