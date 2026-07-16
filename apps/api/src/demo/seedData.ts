import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  todoSections,
  todoItems,
  tradingAlerts,
  wealthClients,
  wealthPortfolios,
  wealthAllocations,
  wealthPlans,
  wealthCompliance,
  tradingTrades,
  tradingSessions,
  tradingNews,
  tradingCalendar,
  tradingPositions,
  tradingChallenges,
  financeSettings,
  financeExpenses,
  financeNetWorth,
  brokerConnections,
  aiUsage,
} from '../db/schema.js';
import type { AnalyzeResult } from '../ai/claude.js';

import {
  addExpense,
  addNetWorth,
  updateSettings as updateFinanceSettings,
} from '../finance/service.js';
import { addClient } from '../wealth/service.js';
import { addPortfolio, addAllocation, getPortfolios } from '../wealth/portfolios.js';
import { addPlan } from '../wealth/planning.js';
import { addItem as addComplianceItem } from '../wealth/compliance.js';
import { addTrade } from '../trading/trades.js';
import { addSession } from '../trading/sessions.js';
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
    wealthAllocations,
    wealthCompliance,
    wealthPlans,
    wealthPortfolios,
    wealthClients,
    tradingAlerts,
    tradingSessions,
    tradingTrades,
    tradingPositions,
    tradingChallenges,
    financeExpenses,
    financeNetWorth,
    financeSettings,
    brokerConnections,
    aiUsage,
  ];
  for (const t of tables) {
    try {
      await db.delete(t).where(eq((t as unknown as { userId: typeof todoItems.userId }).userId, userId));
    } catch (err) {
      console.error('demo clear failed for a table:', err);
    }
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
  // ---- Finance ----
  try {
    const expenses: Array<{ label: string; amount: number; dayOfMonth: number; category: string }> = [
      { label: 'Mortgage', amount: 2150, dayOfMonth: 1, category: 'Housing' },
      { label: 'Car Insurance', amount: 168, dayOfMonth: 5, category: 'Insurance' },
      { label: 'Electric (PSE&G)', amount: 142, dayOfMonth: 8, category: 'Utilities' },
      { label: 'Internet (Fios)', amount: 89, dayOfMonth: 10, category: 'Utilities' },
      { label: 'Phone (Verizon)', amount: 95, dayOfMonth: 12, category: 'Utilities' },
      { label: 'Gym Membership', amount: 45, dayOfMonth: 15, category: 'Health' },
      { label: 'Student Loan', amount: 312, dayOfMonth: 18, category: 'Debt' },
      { label: 'Streaming Bundle', amount: 38, dayOfMonth: 20, category: 'Entertainment' },
      { label: 'Groceries (budget)', amount: 650, dayOfMonth: 22, category: 'Food' },
      { label: 'Pet Insurance', amount: 52, dayOfMonth: 26, category: 'Insurance' },
    ];
    for (const e of expenses) {
      await addExpense(userId, {
        label: e.label,
        amount: e.amount,
        dayOfMonth: e.dayOfMonth,
        category: e.category,
      });
    }

    const netWorth: Array<{ label: string; amount: number; kind: 'asset' | 'liability' }> = [
      { label: 'Brokerage (Schwab)', amount: 48200, kind: 'asset' },
      { label: 'Roth IRA', amount: 31500, kind: 'asset' },
      { label: 'Home Equity', amount: 92000, kind: 'asset' },
      { label: 'Emergency Fund (HYSA)', amount: 18000, kind: 'asset' },
      { label: 'Mortgage Balance', amount: 268000, kind: 'liability' },
      { label: 'Auto Loan', amount: 14300, kind: 'liability' },
      { label: 'Student Loans', amount: 21750, kind: 'liability' },
    ];
    for (const n of netWorth) {
      await addNetWorth(userId, { label: n.label, amount: n.amount, kind: n.kind });
    }

    // Funded FTP account: payout is 80% of the prop-account P/L. This is the
    // main income line that lands "left after bills" in a realistic range.
    await updateFinanceSettings(userId, { ftpPhase: 'funded', ftpDivisor: 18, ftpPayoutPct: 80 });
  } catch (err) {
    console.error('demo seed finance failed:', err);
  }

  // ---- Wealth ----
  try {
    const clients: Array<{
      name: string;
      email: string;
      phone: string;
      accountValue: number;
      status: 'prospect' | 'onboarding' | 'active' | 'inactive';
      notes: string;
    }> = [
      {
        name: 'Robert & Linda Carmichael',
        email: 'carmichael.family@example.com',
        phone: '(201) 555-0142',
        accountValue: 1280000,
        status: 'active',
        notes: 'Retired couple, conservative income focus. Annual review in Q3.',
      },
      {
        name: 'Sofia Mendez',
        email: 'sofia.mendez@example.com',
        phone: '(908) 555-0188',
        accountValue: 615000,
        status: 'active',
        notes: 'Tech executive, growth tilt, maxing backdoor Roth.',
      },
      {
        name: 'James Okafor',
        email: 'j.okafor@example.com',
        phone: '(732) 555-0119',
        accountValue: 340000,
        status: 'onboarding',
        notes: 'Rollover from former 401(k) in progress.',
      },
      {
        name: 'The Whitmore Trust',
        email: 'trustee@example.com',
        phone: '(609) 555-0173',
        accountValue: 2150000,
        status: 'active',
        notes: 'Multi-generational trust; coordinate with estate attorney.',
      },
      {
        name: 'Aaron Kelly',
        email: 'aaron.kelly@example.com',
        phone: '(862) 555-0150',
        accountValue: 0,
        status: 'prospect',
        notes: 'Referral from Sofia Mendez. Intro meeting scheduled.',
      },
    ];
    for (const c of clients) {
      await addClient(userId, c);
    }

    // Two model portfolios, each with 3-4 sleeves (target weights in bps).
    const models: Array<{
      name: string;
      risk:
        | 'conservative'
        | 'moderate_conservative'
        | 'moderate'
        | 'moderate_aggressive'
        | 'aggressive';
      notes: string;
      sleeves: Array<{
        name: string;
        assetClass:
          | 'us_equity'
          | 'intl_equity'
          | 'fixed_income'
          | 'real_assets'
          | 'cash'
          | 'alternative'
          | 'other';
        targetBp: number;
      }>;
    }> = [
      {
        name: 'Core Growth 80/20',
        risk: 'moderate_aggressive',
        notes: 'Long-horizon accumulation sleeve.',
        sleeves: [
          { name: 'US Total Market', assetClass: 'us_equity', targetBp: 4500 },
          { name: 'International Developed', assetClass: 'intl_equity', targetBp: 2500 },
          { name: 'Aggregate Bond', assetClass: 'fixed_income', targetBp: 2000 },
          { name: 'REIT Sleeve', assetClass: 'real_assets', targetBp: 1000 },
        ],
      },
      {
        name: 'Income & Preservation 40/60',
        risk: 'moderate_conservative',
        notes: 'Near-retirement income tilt.',
        sleeves: [
          { name: 'Dividend Equity', assetClass: 'us_equity', targetBp: 3000 },
          { name: 'Intermediate Bond', assetClass: 'fixed_income', targetBp: 4500 },
          { name: 'Short-Term Cash', assetClass: 'cash', targetBp: 1500 },
          { name: 'Inflation-Protected', assetClass: 'real_assets', targetBp: 1000 },
        ],
      },
    ];
    for (const m of models) {
      const before = (await getPortfolios(userId)).portfolios.map((p) => p.id);
      await addPortfolio(userId, { name: m.name, risk: m.risk, notes: m.notes });
      const after = await getPortfolios(userId);
      const created =
        after.portfolios.find((p) => p.name === m.name && !before.includes(p.id)) ??
        after.portfolios.find((p) => p.name === m.name);
      if (created) {
        for (const s of m.sleeves) {
          await addAllocation(userId, created.id, {
            name: s.name,
            assetClass: s.assetClass,
            targetBp: s.targetBp,
          });
        }
      }
    }

    // Planning scenarios (money in whole dollars, rates in bps).
    await addPlan(userId, {
      name: 'Mendez, Retire at 60',
      currentAge: 42,
      retirementAge: 60,
      endAge: 92,
      currentSavings: 615000,
      annualContribution: 46000,
      returnBp: 650,
      inflationBp: 250,
      incomeGoal: 140000,
    });
    await addPlan(userId, {
      name: 'Okafor, Catch-Up Plan',
      currentAge: 51,
      retirementAge: 67,
      endAge: 90,
      currentSavings: 340000,
      annualContribution: 30000,
      returnBp: 600,
      inflationBp: 250,
      incomeGoal: 85000,
    });
    await addPlan(userId, {
      name: 'Carmichael, Drawdown',
      currentAge: 68,
      retirementAge: 68,
      endAge: 95,
      currentSavings: 1280000,
      annualContribution: 0,
      returnBp: 450,
      inflationBp: 250,
      incomeGoal: 90000,
    });

    // Compliance items with due dates (ms epoch).
    const now = Date.now();
    await addComplianceItem(userId, {
      category: 'filing',
      title: 'Form ADV Annual Amendment',
      status: 'in_progress',
      dueAt: now + 21 * DAY_MS,
      notes: 'Annual updating amendment within 90 days of fiscal year end.',
    });
    await addComplianceItem(userId, {
      category: 'review',
      title: 'Quarterly Account Suitability Review',
      status: 'not_started',
      dueAt: now + 9 * DAY_MS,
      notes: 'Review discretionary accounts against IPS.',
    });
    await addComplianceItem(userId, {
      category: 'disclosure',
      title: 'Deliver Updated Form CRS to New Clients',
      status: 'complete',
      dueAt: now - 5 * DAY_MS,
    });
  } catch (err) {
    console.error('demo seed wealth failed:', err);
  }

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

    // Funded (FTP) prop-account trades closed this month. Their raw P/L drives
    // the Personal Finance "FTP payout" income (scaled by the payout percent),
    // which is what puts the monthly "left after bills" comfortably positive.
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
      { text: 'Finalize Q3 client review deck', done: false },
      { text: 'Submit Form ADV amendment', done: false },
      { text: 'Renew Series 65 registration', done: true },
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
}
