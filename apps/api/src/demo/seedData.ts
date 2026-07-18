import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  todoSections,
  todoItems,
  tradingAlerts,
  tradingTrades,
  tradingSessions,
  tradingNews,
  tradingCalendar,
  tradingPositions,
  tradingChallenges,
  fundedAccounts,
  fundedTrades,
  brokerConnections,
  aiUsage,
  studyDecks,
  studyDeckGame,
  studyDeckRuns,
} from '../db/schema.js';
import type { AnalyzeResult } from '../ai/claude.js';
import { createDeck } from '../studies/deckStore.js';
import { DEMO_TEAM_ID } from './identity.js';

import { addTrade } from '../trading/trades.js';
import { addSession } from '../trading/sessions.js';
import { addFundedAccount, addFundedTrade } from '../trading/funded.js';
import { ensureSeed as ensureTodoSeed } from '../todo/service.js';

// One-time seeding of a read-only public DEMO user so every workspace looks
// alive for a reviewer. Runs once when the demo user is first created, no
// per-row idempotency. Each workspace is wrapped in its own try/catch so a
// single failure never aborts the rest. All data below is clearly fictional.

const DAY_MS = 86_400_000;

// Remove every row the seeder owns for this user, so the demo can be refreshed
// to the latest seed on deploy without piling up duplicates. Scoped strictly by
// userId, and child tables are cleared before their parents. Each delete is
// best-effort so one failure does not block the rest.
export async function clearDemoData(userId: string): Promise<void> {
  const tables = [
    todoItems,
    todoSections,
    tradingAlerts,
    tradingSessions,
    tradingTrades,
    tradingPositions,
    tradingChallenges,
    fundedTrades,
    fundedAccounts,
    brokerConnections,
    aiUsage,
    studyDeckGame,
    studyDeckRuns,
  ];
  for (const t of tables) {
    try {
      await db.delete(t).where(eq((t as unknown as { userId: typeof todoItems.userId }).userId, userId));
    } catch (err) {
      console.error('demo clear failed for a table:', err);
    }
  }
  // The demo's sample study deck is keyed by createdBy (not userId); deleting it
  // cascades its questions/state/runs. Cleared here so a re-seed doesn't pile up
  // duplicate sample decks across deploys.
  try {
    await db.delete(studyDecks).where(eq(studyDecks.createdBy, userId));
  } catch (err) {
    console.error('demo clear failed for the sample study deck:', err);
  }
  // The shared Market News feed keys ownership on `authorId`, not `userId`, so
  // its two tables are cleared explicitly. Historically they were listed above
  // and silently failed to clear (no `userId` column), which let seeded sample
  // headlines/events accumulate in the shared feed across deploys — this purges
  // any that a demo seed authored.
  for (const t of [tradingNews, tradingCalendar]) {
    try {
      await db.delete(t).where(eq(t.authorId, userId));
    } catch (err) {
      console.error('demo clear failed for a table:', err);
    }
  }
}

export async function seedDemoData(userId: string): Promise<void> {
  // ---- Trading ----
  try {
    const now = Date.now();
    // Six trades: forex pairs, one index, one crypto; mix of open/closed.
    await addTrade(userId, {
      broker: 'oanda',
      instrument: 'EUR/USD',
      side: 'long',
      status: 'closed',
      plannedEntry: 1.0825,
      entryPrice: 1.0828,
      exitPrice: 1.0901,
      takeProfit: 1.0905,
      stopLoss: 1.0795,
      units: 50000,
      realizedPl: 365,
      strategy: 'London breakout',
      timeframe: 'M15',
      openedAt: now - 12 * DAY_MS,
      closedAt: now - 12 * DAY_MS + 4 * 3_600_000,
      notes: 'Clean breakout above Asian range, scaled out at target.',
    });
    await addTrade(userId, {
      broker: 'oanda',
      instrument: 'GBP/JPY',
      side: 'short',
      status: 'closed',
      plannedEntry: 191.4,
      entryPrice: 191.32,
      exitPrice: 190.55,
      takeProfit: 190.4,
      stopLoss: 191.95,
      units: 20000,
      realizedPl: -154,
      strategy: 'Trend pullback',
      timeframe: 'H1',
      openedAt: now - 9 * DAY_MS,
      closedAt: now - 9 * DAY_MS + 6 * 3_600_000,
      notes: 'Stopped early on news spike; thesis invalidated.',
    });
    await addTrade(userId, {
      broker: 'oanda',
      instrument: 'USD/CAD',
      side: 'long',
      status: 'closed',
      plannedEntry: 1.362,
      entryPrice: 1.3622,
      exitPrice: 1.3688,
      takeProfit: 1.369,
      stopLoss: 1.3585,
      units: 40000,
      realizedPl: 264,
      strategy: 'Range reversal',
      timeframe: 'M30',
      openedAt: now - 6 * DAY_MS,
      closedAt: now - 6 * DAY_MS + 8 * 3_600_000,
      notes: 'Bounced off weekly support, held to TP.',
    });
    await addTrade(userId, {
      broker: 'oanda',
      instrument: 'US100',
      side: 'long',
      status: 'open',
      plannedEntry: 19850,
      entryPrice: 19862,
      takeProfit: 20150,
      stopLoss: 19720,
      units: 2,
      strategy: 'Momentum continuation',
      timeframe: 'H4',
      openedAt: now - 2 * DAY_MS,
      notes: 'Holding into earnings season; trailing stop active.',
    });
    await addTrade(userId, {
      broker: 'kraken',
      instrument: 'BTC/USD',
      side: 'long',
      status: 'open',
      plannedEntry: 61200,
      entryPrice: 61340,
      takeProfit: 65000,
      stopLoss: 59500,
      units: 0.25,
      strategy: 'Swing accumulation',
      timeframe: 'D1',
      openedAt: now - 1 * DAY_MS,
      notes: 'Adding on the reclaim of the prior range high.',
    });
    await addTrade(userId, {
      broker: 'oanda',
      instrument: 'AUD/USD',
      side: 'short',
      status: 'closed',
      plannedEntry: 0.6645,
      entryPrice: 0.6643,
      exitPrice: 0.6601,
      takeProfit: 0.6595,
      stopLoss: 0.6675,
      units: 35000,
      realizedPl: 147,
      strategy: 'Supply retest',
      timeframe: 'M15',
      openedAt: now - 4 * DAY_MS,
      closedAt: now - 4 * DAY_MS + 3 * 3_600_000,
      notes: 'Rejected daily supply, partial fill at target.',
    });

    // A batch of prop-account trades closed this month, so the demo's Manual
    // Trades book and history look active.
    const ftpResults: Array<{
      instrument: string;
      side: 'long' | 'short';
      entry: number;
      exit: number;
      pl: number;
      tf: string;
      strat: string;
      day: number;
    }> = [
      { instrument: 'US30', side: 'long', entry: 38950, exit: 39180, pl: 1240, tf: 'H1', strat: 'Trend continuation', day: 6 },
      { instrument: 'GBP/USD', side: 'long', entry: 1.271, exit: 1.2762, pl: 880, tf: 'M30', strat: 'Breakout retest', day: 4 },
      { instrument: 'XAU/USD', side: 'long', entry: 2318, exit: 2331, pl: 620, tf: 'H1', strat: 'Pullback long', day: 3 },
      { instrument: 'USD/CHF', side: 'short', entry: 0.9042, exit: 0.9061, pl: -340, tf: 'M15', strat: 'Failed reversal', day: 1 },
    ];
    for (const r of ftpResults) {
      await addTrade(userId, {
        broker: 'ftp',
        instrument: r.instrument,
        side: r.side,
        status: 'closed',
        entryPrice: r.entry,
        exitPrice: r.exit,
        realizedPl: r.pl,
        strategy: r.strat,
        timeframe: r.tf,
        openedAt: now - r.day * DAY_MS,
        closedAt: now - r.day * DAY_MS + 3 * 3_600_000,
      });
    }

    // Two strategy sessions (ET windows).
    await addSession(userId, {
      name: 'London Open',
      instrument: 'EUR/USD',
      openTime: '03:00',
      closeTime: '05:00',
      timeframe: 'M15',
      bias: 'both',
      bullPlan: 'Buy the breakout above the Asian session high on a retest with volume.',
      bearPlan: 'Sell rejection of the Asian high; target the session VWAP.',
      notes: 'Highest volatility window, size accordingly.',
      active: true,
    });
    await addSession(userId, {
      name: 'NY Open',
      instrument: 'US100',
      openTime: '09:30',
      closeTime: '11:00',
      timeframe: 'M5',
      bias: 'bull',
      bullPlan: 'Continuation of the premarket trend after the first 15-minute range breaks.',
      bearPlan: 'Fade exhaustion gaps back to prior close.',
      notes: 'Avoid the first 2 minutes; let the auction settle.',
      active: true,
    });

    // Market News (headlines + economic calendar) is intentionally NOT seeded.
    // That feed is shared across the whole desk — not per user — so any rows
    // seeded here would surface as "sample" news in the owner's real Market
    // News too. In production it is populated live by the background pollers
    // (curated RSS headlines, the Forex Factory calendar, and Truth Social).

    // Three TradingView alerts: one already analyzed (with a linked trade), two new.
    const analyzedTradeId = await addTrade(userId, {
      broker: 'ftp',
      instrument: 'EUR/USD',
      side: 'long',
      status: 'closed',
      plannedEntry: 1.085,
      entryPrice: 1.0853,
      exitPrice: 1.0912,
      strategy: 'Breakout',
      timeframe: 'M15',
      openedAt: now - 3 * DAY_MS,
      closedAt: now - 3 * DAY_MS + 5 * 3_600_000,
      notes: 'Auto-created from analyzed TradingView alert.',
    });

    const analysis: AnalyzeResult = {
      raw: 'Long EUR/USD breakout. Fill at 1.0853 vs alert 1.0850, minimal slippage. Setup was a clean retest of the broken Asian range high with a tight stop. Exit at 1.0912 captured the measured move. Good execution.',
      parsed: {
        instrument: 'EUR/USD',
        side: 'long',
        plannedEntry: 1.085,
        actualFill: 1.0853,
        exit: 1.0912,
        slippage: '0.3 pips of positive slippage vs the alert price, negligible.',
        setupQuality: 'Valid breakout-retest; entry aligned with the alert and session bias.',
        risk: 'Stop placed below the retest low (~1.0820); ~0.3% account risk. Reasonable.',
        verdict: 'good',
        summary: 'Well-executed London breakout long with minimal slippage and a clean exit at target.',
      },
      model: 'claude-opus-4-8',
    };

    const alertNow = new Date();
    const seedAlert = async (input: {
      instrument: string;
      side: 'long' | 'short';
      price: number;
      strategy: string;
      timeframe: string;
      message: string;
      receivedAtMs: number;
      status: 'new' | 'analyzed';
      analysis?: AnalyzeResult;
      analyzedAtMs?: number;
      tradeId?: string;
    }): Promise<void> => {
      const payload = JSON.stringify({
        instrument: input.instrument,
        side: input.side,
        price: input.price,
        strategy: input.strategy,
        timeframe: input.timeframe,
        message: input.message,
      });
      await db.insert(tradingAlerts).values({
        id: crypto.randomUUID(),
        userId,
        source: 'tradingview',
        instrument: input.instrument,
        side: input.side,
        price: input.price,
        strategy: input.strategy,
        timeframe: input.timeframe,
        message: input.message,
        payload,
        status: input.status,
        analysis: input.analysis ? JSON.stringify(input.analysis) : null,
        analyzedAt: input.analyzedAtMs != null ? new Date(input.analyzedAtMs) : null,
        tradeId: input.tradeId ?? null,
        receivedAt: new Date(input.receivedAtMs),
        createdAt: alertNow,
        updatedAt: alertNow,
      });
    };

    await seedAlert({
      instrument: 'EUR/USD',
      side: 'long',
      price: 1.085,
      strategy: 'Breakout',
      timeframe: 'M15',
      message: 'BUY EUR/USD, breakout retest confirmed',
      receivedAtMs: now - 3 * DAY_MS,
      status: 'analyzed',
      analysis,
      analyzedAtMs: now - 3 * DAY_MS + 10 * 60_000,
      tradeId: analyzedTradeId,
    });
    await seedAlert({
      instrument: 'GBP/JPY',
      side: 'short',
      price: 191.4,
      strategy: 'Trend pullback',
      timeframe: 'H1',
      message: 'SELL GBP/JPY, rejection at supply',
      receivedAtMs: now - 90 * 60_000,
      status: 'new',
    });
    await seedAlert({
      instrument: 'US100',
      side: 'long',
      price: 19850,
      strategy: 'Momentum continuation',
      timeframe: 'H4',
      message: 'BUY US100, momentum continuation above range',
      receivedAtMs: now - 25 * 60_000,
      status: 'new',
    });
  } catch (err) {
    console.error('demo seed trading failed:', err);
  }

  // ---- Manual Trades ----
  // A couple of hand-kept accounts with logged trades, so the Manual Trades tab
  // (the renamed, self-managed "Funded" section) looks alive for a reviewer.
  // Deliberately generic personal accounts — no prop/funded-platform framing.
  try {
    const now = Date.now();
    const seedAccount = async (
      account: { platform: string; label: string; balance: number; startingBalance: number },
      trades: Array<{
        instrument: string;
        side: 'long' | 'short';
        units: number;
        entry: number;
        exit?: number;
        pl?: number;
        day: number;
        open?: boolean;
      }>,
    ): Promise<void> => {
      const data = await addFundedAccount(userId, {
        platform: account.platform,
        label: account.label,
        currency: 'USD',
        balance: account.balance,
        startingBalance: account.startingBalance,
      });
      const created = data.accounts.find((a) => a.label === account.label);
      if (!created) return;
      for (const t of trades) {
        await addFundedTrade(userId, created.id, {
          instrument: t.instrument,
          side: t.side,
          units: t.units,
          entryPrice: t.entry,
          exitPrice: t.open ? undefined : t.exit,
          realizedPl: t.open ? undefined : t.pl,
          status: t.open ? 'open' : 'closed',
          openedAt: now - t.day * DAY_MS,
          closedAt: t.open ? undefined : now - t.day * DAY_MS + 4 * 3_600_000,
        });
      }
    };

    await seedAccount(
      { platform: 'OANDA', label: 'Swing Book', balance: 26680, startingBalance: 25000 },
      [
        { instrument: 'EUR/USD', side: 'long', units: 30000, entry: 1.0812, exit: 1.0868, pl: 168, day: 12 },
        { instrument: 'US30', side: 'long', units: 2, entry: 38720, exit: 38510, pl: -210, day: 9 },
        { instrument: 'XAU/USD', side: 'long', units: 4, entry: 2306, exit: 2338, pl: 640, day: 6 },
        { instrument: 'GBP/USD', side: 'short', units: 25000, entry: 1.2745, exit: 1.2701, pl: 275, day: 3 },
        { instrument: 'USD/JPY', side: 'long', units: 20000, entry: 156.2, day: 1, open: true },
      ],
    );

    await seedAccount(
      { platform: 'Manual', label: 'Index Futures', balance: 7420, startingBalance: 5000 },
      [
        { instrument: 'NAS100', side: 'long', units: 1, entry: 19620, exit: 19910, pl: 580, day: 8 },
        { instrument: 'US30', side: 'short', units: 1, entry: 39050, exit: 39180, pl: -130, day: 5 },
        { instrument: 'SPX500', side: 'long', units: 2, entry: 5412, exit: 5449, pl: 370, day: 2 },
      ],
    );
  } catch (err) {
    console.error('demo seed manual trades failed:', err);
  }

  // ---- Todo ----
  try {
    // Let the standard starter sections (which include 'Priority') be created.
    await ensureTodoSeed(userId);

    const sections = await db
      .select()
      .from(todoSections)
      .where(eq(todoSections.userId, userId));

    const findSection = (title: string) => sections.find((s) => s.title === title);

    // Add items directly so done/undone state can be set precisely. Each item
    // is a one-time checkable task in its section.
    const seedItems = async (
      title: string,
      items: Array<{ text: string; done: boolean }>,
    ): Promise<void> => {
      const sec = findSection(title);
      if (!sec) return;
      const stamp = new Date();
      for (let i = 0; i < items.length; i++) {
        await db.insert(todoItems).values({
          id: crypto.randomUUID(),
          userId,
          sectionId: sec.id,
          text: items[i].text,
          position: i,
          hyphen: false,
          done: items[i].done,
          dueAt: null,
          intervalDays: null,
          createdAt: stamp,
        });
      }
    };

    await seedItems('Priority', [
      { text: 'Review this week’s trade log for slippage', done: false },
      { text: 'Update the funded challenge equity', done: false },
      { text: 'Renew registration', done: true },
    ]);
    await seedItems('Finance', [
      { text: 'Rebalance Roth IRA to target allocation', done: false },
      { text: 'Set up automatic HYSA transfer', done: true },
      { text: 'Review credit report', done: false },
    ]);
    await seedItems('Personal / Home', [
      { text: 'Schedule HVAC maintenance', done: false },
      { text: 'Replace smoke detector batteries', done: true },
    ]);
  } catch (err) {
    console.error('demo seed todo failed:', err);
  }

  // ---- Team Study Games (sample) ----
  try {
    await seedDemoStudyDeck(userId);
  } catch (err) {
    console.error('demo seed study deck failed:', err);
  }
}

// A neutral, clearly non-financial sample study game so the demo shows a live,
// playable team game without any pre-made financial content or advice. These are
// plain educational definitions of common chart-reading terms — no
// buy/sell recommendations, no financial advice.
const TA_SAMPLE_QUESTIONS = [
  {
    topic: 'Concepts',
    stem: 'On a price chart, what does a “support level” describe?',
    options: [
      { label: 'A' as const, text: 'A price area where declines have historically tended to pause' },
      { label: 'B' as const, text: 'The highest price ever reached' },
      { label: 'C' as const, text: 'A guaranteed floor the price cannot fall below' },
      { label: 'D' as const, text: 'The average trading volume' },
    ],
    answer: 'A' as const,
    explanation: 'Support is simply an area where buying interest has historically slowed a decline — not a guarantee.',
  },
  {
    topic: 'Concepts',
    stem: '“Resistance” on a chart refers to a price area where…',
    options: [
      { label: 'A' as const, text: 'Advances have historically tended to stall' },
      { label: 'B' as const, text: 'Trading is not allowed' },
      { label: 'C' as const, text: 'The market always reverses' },
      { label: 'D' as const, text: 'Dividends are paid' },
    ],
    answer: 'A' as const,
    explanation: 'Resistance is an area where selling has historically slowed an advance.',
  },
  {
    topic: 'Indicators',
    stem: 'A “moving average” is calculated by…',
    options: [
      { label: 'A' as const, text: 'Averaging the price over a set number of periods' },
      { label: 'B' as const, text: 'Counting the number of trades in a day' },
      { label: 'C' as const, text: 'Adding all dividends together' },
      { label: 'D' as const, text: 'Measuring a company’s revenue' },
    ],
    answer: 'A' as const,
    explanation: 'A moving average smooths price by averaging it over a chosen window of periods.',
  },
  {
    topic: 'Indicators',
    stem: 'The RSI (Relative Strength Index) is an oscillator that ranges between…',
    options: [
      { label: 'A' as const, text: '0 and 100' },
      { label: 'B' as const, text: '-1 and 1' },
      { label: 'C' as const, text: '0 and 10' },
      { label: 'D' as const, text: 'Any value with no bounds' },
    ],
    answer: 'A' as const,
    explanation: 'RSI is bounded between 0 and 100.',
  },
  {
    topic: 'Concepts',
    stem: 'On a stock chart, “volume” measures…',
    options: [
      { label: 'A' as const, text: 'The number of shares or contracts traded in a period' },
      { label: 'B' as const, text: 'The price change since yesterday' },
      { label: 'C' as const, text: 'The company’s total assets' },
      { label: 'D' as const, text: 'The number of employees' },
    ],
    answer: 'A' as const,
    explanation: 'Volume is how much was traded during the period.',
  },
  {
    topic: 'Candlesticks',
    stem: 'The “body” of a candlestick shows…',
    options: [
      { label: 'A' as const, text: 'The range between the open and the close' },
      { label: 'B' as const, text: 'The highest and lowest prices only' },
      { label: 'C' as const, text: 'The trading volume' },
      { label: 'D' as const, text: 'The dividend yield' },
    ],
    answer: 'A' as const,
    explanation: 'A candle’s body spans its open and close; the wicks show the high and low.',
  },
  {
    topic: 'Candlesticks',
    stem: 'A “doji” candlestick forms when…',
    options: [
      { label: 'A' as const, text: 'The open and close are nearly equal' },
      { label: 'B' as const, text: 'The price doubles' },
      { label: 'C' as const, text: 'Volume is zero' },
      { label: 'D' as const, text: 'The market is closed' },
    ],
    answer: 'A' as const,
    explanation: 'A doji has a very small body because the open and close are almost the same.',
  },
  {
    topic: 'Patterns',
    stem: 'The “head and shoulders” is most commonly described as a…',
    options: [
      { label: 'A' as const, text: 'Reversal pattern' },
      { label: 'B' as const, text: 'Type of moving average' },
      { label: 'C' as const, text: 'Volume indicator' },
      { label: 'D' as const, text: 'Dividend schedule' },
    ],
    answer: 'A' as const,
    explanation: 'It is classically discussed as a reversal pattern.',
  },
  {
    topic: 'Concepts',
    stem: 'A “trend line” on a chart is drawn to…',
    options: [
      { label: 'A' as const, text: 'Connect a series of highs or lows to show direction' },
      { label: 'B' as const, text: 'Mark where a company was founded' },
      { label: 'C' as const, text: 'Show the exact future price' },
      { label: 'D' as const, text: 'Separate two trading days' },
    ],
    answer: 'A' as const,
    explanation: 'A trend line connects successive highs or lows to visualize direction.',
  },
  {
    topic: 'Concepts',
    stem: 'A “breakout” generally refers to price…',
    options: [
      { label: 'A' as const, text: 'Moving beyond a defined support or resistance level' },
      { label: 'B' as const, text: 'Staying exactly flat all day' },
      { label: 'C' as const, text: 'Being delisted' },
      { label: 'D' as const, text: 'Paying a special dividend' },
    ],
    answer: 'A' as const,
    explanation: 'A breakout is price moving past a previously established support or resistance area.',
  },
];

async function seedDemoStudyDeck(userId: string): Promise<void> {
  await createDeck({
    teamId: DEMO_TEAM_ID,
    name: 'Technical Analysis Basics',
    description: 'A friendly sample study game on common chart-reading terms. Educational only — not financial advice.',
    createdBy: userId,
    source: 'sample',
    isSample: true,
    questions: TA_SAMPLE_QUESTIONS,
  });
}
