// The demo's request layer.
//
// `demoCall` answers a client method by name, exactly as the network adapter
// would. Reads are DERIVED from the seeded state rather than stored alongside
// it, so a write and the figure it changes cannot disagree — press "log a
// trade" and the win rate above it moves, because both come from one array.
//
// Unhandled names return an empty-but-correctly-shaped payload rather than
// throwing: a demo visitor clicking into a corner nobody seeded should meet an
// empty screen, never a stack trace.
import { demoAccounts, demoHoldings, demoState, demoAgo, demoDay } from './demoSeed';
import { DEMO_QUESTIONS } from './demoQuestions';

const clone = <T>(value: T): T => structuredClone(value);
const nextId = (prefix: string) => `${prefix}-${demoState.nextId++}`;
const num = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

// ---- Derived reads ----------------------------------------------------------

// A trade is a win, a loss or a break-even. The band is the terminal's own
// default (0 = exact), so a flat trade reads as break-even and not as a loss.
function tradeSummary(trades: any[]) {
  const closed = trades.filter((t) => t.status === 'closed');
  const wins = closed.filter((t) => num(t.realizedPl) > 0).length;
  const losses = closed.filter((t) => num(t.realizedPl) < 0).length;
  const breakeven = closed.length - wins - losses;
  const scored = wins + losses;
  return {
    total: trades.length,
    open: trades.length - closed.length,
    closed: closed.length,
    wins, losses, breakeven,
    winRate: scored ? wins / scored : 0,
    totalRealizedPl: closed.reduce((sum, t) => sum + num(t.realizedPl), 0),
    totalUnrealizedPl: 0,
    avgSlippage: 0,
  };
}

const excluded = { beforeCutoff: 0, belowFloor: 0, cutoffFrom: null };
const beSettings = { breakEvenPct: 0, breakEvenMode: 'percent' as const, breakEvenAmount: 0, breakEvenOverrides: [], minTradeUnits: 0 };

const tradeLog = () => ({ trades: clone(demoState.trades), summary: tradeSummary(demoState.trades), ...beSettings, excluded, canDeleteAny: false });

function group(trades: any[], key: (t: any) => string) {
  const map = new Map<string, any>();
  for (const t of trades) {
    const k = key(t) || '—';
    const row = map.get(k) ?? { key: k, label: k, trades: 0, wins: 0, losses: 0, breakeven: 0, winRate: 0, realizedPl: 0 };
    row.trades += 1;
    const pl = num(t.realizedPl);
    if (pl > 0) row.wins += 1; else if (pl < 0) row.losses += 1; else row.breakeven += 1;
    row.realizedPl += pl;
    map.set(k, row);
  }
  return [...map.values()].map((row) => ({ ...row, winRate: row.wins + row.losses ? row.wins / (row.wins + row.losses) : 0 }));
}

const tradeHistory = () => {
  const closed = demoState.trades.filter((t) => t.status === 'closed');
  return {
    trades: clone(closed),
    summary: { ...tradeSummary(closed), byStrategy: group(closed, (t) => t.strategy), byInstrument: group(closed, (t) => t.instrument) },
    ...beSettings, excluded, canDeleteAny: false,
  };
};

const todo = () => ({ sections: [{ id: 'demo-todo', n: 1, icon: 'list-todo', title: 'To Do', type: 'one', tag: 'trading', life: false, count: demoState.todo.filter((i) => !i.done).length, empty: !demoState.todo.length, items: clone(demoState.todo) }] });

function netWorth() {
  const active = demoState.netWorthItems.filter((i) => i.active);
  const assets = active.filter((i) => i.kind === 'asset').reduce((s, i) => s + i.value, 0);
  const liabilities = active.filter((i) => i.kind === 'liability').reduce((s, i) => s + i.value, 0);
  const investments = portfolio().totals.value;
  return {
    tracked: { investments, trading: 0, tradingEnabled: false, available: true, note: null },
    assets: clone(active.filter((i) => i.kind === 'asset')),
    liabilities: clone(active.filter((i) => i.kind === 'liability')),
    totals: { assets: assets + investments, liabilities, netWorth: assets + investments - liabilities, manualAssets: assets },
    history: Array.from({ length: 12 }, (_, i) => {
      const value = assets + investments - liabilities;
      return { onDate: new Date(demoAgo((11 - i) * 30)).toISOString().slice(0, 10), assets: Math.round((assets + investments) * (0.88 + i * 0.011)), liabilities: Math.round(liabilities * (1.1 - i * 0.009)), netWorth: Math.round(value * (0.85 + i * 0.014)) };
    }),
    totalDays: 360,
    asOf: Date.now(),
  };
}

function budget() {
  const entries = demoState.budgetEntries.map((e) => {
    const category = demoState.budgetCategories.find((c) => c.id === e.categoryId);
    return { ...e, categoryName: category?.name ?? 'Uncategorised', kind: category?.kind ?? 'expense' };
  });
  const categories = demoState.budgetCategories.map((c) => {
    const own = entries.filter((e) => e.categoryId === c.id);
    return { ...c, actualCents: own.reduce((s, e) => s + e.amountCents, 0), entryCount: own.length };
  });
  const sum = (kind: string) => entries.filter((e) => e.kind === kind).reduce((s, e) => s + e.amountCents, 0);
  const planned = (kind: string) => categories.filter((c) => c.kind === kind).reduce((s, c) => s + (c.monthlyLimit ?? 0), 0);
  const incomeCents = sum('income'); const spentCents = sum('expense');
  return {
    month: demoDay(0).slice(0, 7), categories: clone(categories), entries: clone(entries),
    incomeCents, spentCents, netCents: incomeCents - spentCents,
    plannedIncomeCents: planned('income'), plannedSpendCents: planned('expense'),
    plannedNetCents: planned('income') - planned('expense'),
    hasTargets: categories.some((c) => c.kind === 'expense' && c.monthlyLimit != null),
  };
}

function portfolio() {
  const holdings = demoHoldings.map((h) => {
    const value = h.price == null ? null : h.price * h.quantity;
    const gain = value == null || h.costBasis == null ? null : value - h.costBasis;
    const dayChange = h.price == null || h.previousClose == null ? null : (h.price - h.previousClose) * h.quantity;
    return { ...h, value, gain, gainPct: gain == null || !h.costBasis ? null : (gain / h.costBasis) * 100, dayChange, dayChangePct: h.previousClose ? ((h.price ?? 0) - h.previousClose) / h.previousClose * 100 : null };
  });
  // An unpriced holding is COUNTED and left out of the totals, never valued at
  // zero — the one thing a tracker must not do.
  const priced = holdings.filter((h) => h.value != null);
  const cash = demoAccounts.reduce((s, a) => s + a.cashBalance, 0);
  const value = priced.reduce((s, h) => s + (h.value ?? 0), 0) + cash;
  const costBasis = priced.reduce((s, h) => s + (h.costBasis ?? 0), 0);
  const gain = value - cash - costBasis;
  const bucket = (key: (h: any) => string) => {
    const map = new Map<string, number>();
    for (const h of priced) map.set(key(h), (map.get(key(h)) ?? 0) + (h.value ?? 0));
    const total = [...map.values()].reduce((s, v) => s + v, 0) || 1;
    return [...map.entries()].map(([k, v]) => ({ key: k, label: k, value: v, pct: (v / total) * 100 }));
  };
  return {
    accounts: clone(demoAccounts), holdings: clone(holdings),
    totals: {
      value, cash, costBasis, gain, gainPct: costBasis ? (gain / costBasis) * 100 : null,
      dayChange: priced.reduce((s, h) => s + (h.dayChange ?? 0), 0),
      dayChangeCoverage: priced.length / (holdings.length || 1),
      unpricedCount: holdings.length - priced.length,
      manualCount: holdings.filter((h) => h.priceSource === 'manual').length,
      livePricedCount: holdings.filter((h) => h.priceSource === 'live').length,
    },
    allocation: { byClass: bucket((h) => h.assetClass), bySector: bucket((h) => h.sector ?? 'Unclassified'), byRegion: bucket((h) => h.region ?? 'Unclassified'), flags: [] },
    livePricesConfigured: true, asOf: Date.now(),
  };
}

function notes() {
  const week = demoState.notes.filter((n) => n.kind === 'prediction');
  const scored = week.filter((n) => n.outcome === 'hit' || n.outcome === 'miss');
  const hits = week.filter((n) => n.outcome === 'hit').length;
  return {
    week: { weekKey: week[0]?.weekKey ?? '', startsOn: demoDay(6), endsOn: demoDay(0), prevWeek: '', nextWeek: '', isCurrent: true, notes: clone(week) },
    queue: clone(week.filter((n) => n.awaiting)),
    stats: {
      scored: scored.length, hits, misses: scored.length - hits,
      partial: week.filter((n) => n.outcome === 'partial').length,
      // Never folded into the hit rate. Nothing was established either way.
      unsettleable: week.filter((n) => n.outcome === 'unsettleable').length,
      open: week.filter((n) => !n.outcome).length,
      hitRate: scored.length ? Math.round((hits / scored.length) * 1000) / 10 : null,
      calibration: [],
    },
    observations: clone(demoState.notes.filter((n) => n.kind === 'observation')),
    tradeLinks: [],
  };
}

// A year of quarterly distributions, so the yield and the monthly bars have
// something real to be derived from rather than being typed in as totals.
const DEMO_DIVIDENDS = [0, 3, 6, 9].flatMap((quarter, index) => ([
  { id: `dv-${index}-a`, accountId: 'ia1', kind: 'dividend', symbol: 'VTI', amount: 184.2 + index * 6, quantity: null, price: null, occurredAt: new Date(demoAgo(quarter * 30 + 12)).toISOString().slice(0, 10), taxYear: new Date().getFullYear(), note: null, createdAt: demoAgo(quarter * 30 + 12) },
  { id: `dv-${index}-b`, accountId: 'ia3', kind: 'dividend', symbol: 'BND', amount: 22.4 + index * 1.2, quantity: null, price: null, occurredAt: new Date(demoAgo(quarter * 30 + 5)).toISOString().slice(0, 10), taxYear: new Date().getFullYear(), note: null, createdAt: demoAgo(quarter * 30 + 5) },
])) as any[];

// Contributions and goals are seeded EMPTY on purpose — they are the two things
// a visitor is most likely to add themselves, and an empty list is what makes
// "add one and watch the figure move" the first thing they see.
const DEMO_CONTRIBUTIONS: any[] = [];
const DEMO_GOALS: any[] = [];
const DEMO_PRICE_ALERTS: any[] = [];

// A bug report a demo visitor files is kept for the session, like every other
// demo write. `myBugReports` is a fixture-only name otherwise, so the report
// would be accepted and then not be in the list it was just added to.
const DEMO_BUG_REPORTS: any[] = [];
const DEMO_SUGGESTIONS: any[] = [];

// ADMIN EDITING, INSIDE THE DEMO (owner instruction, 2026-08). The public
// terminal has no Admin workspace and must not gain one — administration code is
// absent from the public bundle by construction, not hidden — so what is
// demonstrated instead is the ADMINISTRATIVE ACT, on the very screens the notice
// appears on: post an announcement on Announcements, publish a note on Patch
// notes. The screens are the portal's own; all that changes is that the demo
// answers `canManage: true` and then answers the writes.
const DEMO_ANNOUNCEMENTS: any[] = [
  { id: 'demo-ann-1', title: 'Early Access is opening in waves', body: 'We are letting people in a handful at a time so support stays answerable. If you have asked, you are on the list.', author: 'VTS', createdAt: Date.now() - 26 * 3600_000 },
  { id: 'demo-ann-2', title: 'Market Data now covers the Treasury curve', body: 'Two-year through thirty-year, with the 2s10s and 3m10y spreads derived from the rows beside them rather than read separately.', author: 'VTS', createdAt: Date.now() - 5 * 86400_000 },
];
const DEMO_PATCH_NOTES: any[] = [
  { id: 'demo-pn-1', version: 'Beta V 7.64', dateLabel: 'August 28, 2026', notes: ['My Terminal is customizable — pin any section onto it.', 'Settings became its own workspace.', 'The Live Wall is editable here.'], publishedAt: Date.now() - 3600_000 },
];

// ---- Writes -----------------------------------------------------------------
//
// Each one mutates module state and returns the same payload its read returns,
// because that is what the screens re-render from.

const writes: Record<string, (args: any[]) => unknown> = {
  generalNews: ([topic]) => ({ headlines: clone(topic === 'politics' ? DEMO_POLITICS : DEMO_WORLD) }),
  studyDeck: ([id]) => {
    const found = DEMO_DECKS.find((d) => d.id === id) ?? DEMO_DECKS[0]!;
    return { deck: { ...clone(found), questions: found.id === 'demo-deck-1' ? clone(DEMO_QUESTIONS) : [] } };
  },
  // Progress is per visit, like everything else here.
  studyDeckGame: () => ({ state: demoState.gameState }),
  saveStudyDeckGame: ([, state]) => { demoState.gameState = typeof state === 'string' ? state : null; return { ok: true }; },
  studyDeckLeaderboard: () => ({ rows: [] }),
  addTrade: ([input]) => {
    const entry = num(input?.entryPrice); const exit = input?.exitPrice == null ? null : num(input.exitPrice);
    demoState.trades.unshift({
      id: nextId('demo-trade'), ownerId: 'demo-user', owner: 'demo', ownerName: 'Demo Trader', isMine: true,
      broker: input?.broker ?? null, instrument: String(input?.instrument ?? 'EUR/USD'), side: input?.side ?? 'long',
      status: input?.status ?? (exit == null ? 'open' : 'closed'), plannedEntry: input?.plannedEntry ?? null,
      entryPrice: entry, exitPrice: exit, takeProfit: input?.takeProfit ?? null, stopLoss: input?.stopLoss ?? null,
      units: num(input?.units), slippage: 0, realizedPl: input?.realizedPl == null ? null : num(input.realizedPl),
      unrealizedPl: null, strategy: input?.strategy ?? null, timeframe: input?.timeframe ?? null,
      openedAt: num(input?.openedAt, Date.now()), closedAt: exit == null ? null : Date.now(),
      notes: input?.notes ?? null, createdAt: Date.now(), updatedAt: Date.now(),
      editable: true, source: 'manual', code: null,
    });
    return tradeLog();
  },
  updateTrade: ([id, patch]) => {
    const row = demoState.trades.find((t) => t.id === id);
    if (row) Object.assign(row, patch, { updatedAt: Date.now() });
    return tradeLog();
  },
  removeTrade: ([id]) => {
    const index = demoState.trades.findIndex((t) => t.id === id);
    if (index >= 0) {
      const [row] = demoState.trades.splice(index, 1);
      demoState.deleted.unshift({ id: row.id, kind: 'manual', ownerId: row.ownerId, owner: row.owner, isMine: true, broker: row.broker, instrument: row.instrument, side: row.side, status: row.status, units: row.units, entryPrice: row.entryPrice, exitPrice: row.exitPrice, realizedPl: row.realizedPl, openedAt: row.openedAt, closedAt: row.closedAt, deletedAt: Date.now() });
    }
    return tradeLog();
  },
  restoreDeletedTrade: ([id]) => {
    const index = demoState.deleted.findIndex((t) => t.id === id);
    if (index >= 0) demoState.deleted.splice(index, 1);
    return { trades: clone(demoState.deleted), canDeleteAny: false };
  },
  addTodoItem: ([, text]) => {
    demoState.todo.push({ id: nextId('demo-todo'), code: '', text: String(text ?? '').trim() || 'New item', marker: 'none', checkable: true, done: false, recurring: false, timer: null, overdue: false, dueToday: false });
    return todo();
  },
  toggleTodoItem: ([id]) => {
    const item = demoState.todo.find((i) => i.id === id);
    if (item) item.done = !item.done;
    return todo();
  },
  removeTodoItem: ([id]) => {
    const index = demoState.todo.findIndex((i) => i.id === id);
    if (index >= 0) demoState.todo.splice(index, 1);
    return todo();
  },
  createNetWorthItem: ([input]) => {
    demoState.netWorthItems.push({ id: nextId('demo-nw'), kind: input?.kind ?? 'asset', category: input?.category ?? 'cash', label: String(input?.label ?? 'New item'), value: Math.abs(num(input?.value)), note: input?.note ?? null, active: true, sortOrder: demoState.netWorthItems.length, updatedAt: Date.now() });
    return netWorth();
  },
  updateNetWorthItem: ([id, patch]) => {
    const row = demoState.netWorthItems.find((i) => i.id === id);
    if (row) Object.assign(row, patch, { value: Math.abs(num(patch?.value, row.value)), updatedAt: Date.now() });
    return netWorth();
  },
  deleteNetWorthItem: ([id]) => {
    const index = demoState.netWorthItems.findIndex((i) => i.id === id);
    if (index >= 0) demoState.netWorthItems.splice(index, 1);
    return netWorth();
  },
  addBudgetCategory: ([input]) => {
    demoState.budgetCategories.push({ id: nextId('demo-bc'), name: String(input?.name ?? 'New category'), kind: input?.kind ?? 'expense', monthlyLimit: input?.monthlyLimit ?? null, icon: null, sortOrder: demoState.budgetCategories.length, archived: false });
    return budget();
  },
  addBudgetEntry: ([input]) => {
    demoState.budgetEntries.unshift({ id: nextId('demo-be'), categoryId: String(input?.categoryId ?? demoState.budgetCategories[0]?.id), amountCents: Math.abs(Math.round(num(input?.amount) * 100)) || num(input?.amountCents), note: input?.note ?? null, occurredOn: input?.occurredOn ?? demoDay(0), source: 'manual' });
    return budget();
  },
  removeBudgetEntry: ([id]) => {
    const index = demoState.budgetEntries.findIndex((e) => e.id === id);
    if (index >= 0) demoState.budgetEntries.splice(index, 1);
    return budget();
  },
  // ---- Investments ----------------------------------------------------------
  //
  // WITHOUT THESE THE WORKSPACE BREAKS IN THE DEMO, and it breaks silently: an
  // unhandled name answers with an empty-but-generic payload, so
  // `const { portfolio } = await api.createInvestmentAccount(...)` destructures
  // `undefined` and the screen publishes nothing. The demo is the showcase, and
  // Investments is the workspace a visitor is most likely to try adding to.
  //
  // Each one mutates the seeded arrays that `portfolio()` already derives from,
  // so the totals, the allocation and the unpriced count all move with the write
  // rather than being patched separately.
  createInvestmentAccount: ([input]) => {
    const id = nextId('demo-ia');
    demoAccounts.push({ id, kind: String(input?.kind ?? 'brokerage'), label: String(input?.label ?? 'New account'),
      institution: input?.institution ?? null, source: 'manual', cashBalance: num(input?.cashBalance),
      note: input?.note ?? null, createdAt: Date.now(), updatedAt: Date.now() });
    return { id, portfolio: portfolio() };
  },
  updateInvestmentAccount: ([id, patch]) => {
    const row = demoAccounts.find((a) => a.id === id);
    if (row) Object.assign(row, patch, { cashBalance: num(patch?.cashBalance, row.cashBalance), updatedAt: Date.now() });
    return { portfolio: portfolio() };
  },
  deleteInvestmentAccount: ([id]) => {
    const index = demoAccounts.findIndex((a) => a.id === id);
    if (index >= 0) demoAccounts.splice(index, 1);
    // The holdings go with the account they were in — leaving them would put a
    // holding in the totals that belongs to an account no longer on the screen.
    for (let i = demoHoldings.length - 1; i >= 0; i -= 1) {
      if (demoHoldings[i]!.accountId === id) demoHoldings.splice(i, 1);
    }
    return { portfolio: portfolio() };
  },
  createInvestmentHolding: ([input]) => {
    const id = nextId('demo-ih');
    const account = demoAccounts.find((a) => a.id === input?.accountId) ?? demoAccounts[0];
    const price = input?.manualPrice == null ? null : num(input.manualPrice);
    demoHoldings.push({
      id, accountId: account?.id ?? 'ia1', accountLabel: account?.label ?? '',
      symbol: input?.symbol ?? null, name: String(input?.name ?? 'New holding'),
      assetClass: String(input?.assetClass ?? 'fund'), quantity: num(input?.quantity),
      costBasis: input?.costBasis == null ? null : num(input.costBasis),
      // NO LIVE QUOTES in the demo, so a holding is priced from what was typed or
      // it is UNPRICED — which `portfolio()` counts and leaves out of the totals
      // rather than valuing at zero. Adding one with no price is the honest way
      // to show that behaviour.
      price, priceSource: price == null ? 'none' : 'manual', previousClose: null,
      sector: input?.sector ?? null, region: input?.region ?? null,
      value: null, gain: null, gainPct: null, dayChange: null, dayChangePct: null,
      manualPrice: price, manualPriceAt: price == null ? null : Date.now(),
      note: input?.note ?? null, createdAt: Date.now(), updatedAt: Date.now(),
    });
    return { id, portfolio: portfolio() };
  },
  updateInvestmentHolding: ([id, patch]) => {
    const row = demoHoldings.find((h) => h.id === id);
    if (row) {
      const price = patch?.manualPrice === undefined ? row.price : (patch.manualPrice == null ? null : num(patch.manualPrice));
      Object.assign(row, patch, { price, manualPrice: price, priceSource: price == null ? 'none' : 'manual',
        quantity: num(patch?.quantity, row.quantity), updatedAt: Date.now() });
    }
    return { portfolio: portfolio() };
  },
  deleteInvestmentHolding: ([id]) => {
    const index = demoHoldings.findIndex((h) => h.id === id);
    if (index >= 0) demoHoldings.splice(index, 1);
    return { portfolio: portfolio() };
  },
  createInvestmentTransaction: ([input]) => {
    const id = nextId('demo-itx');
    const occurredAt = new Date(num(input?.occurredAt, Date.now())).toISOString().slice(0, 10);
    const row = { id, accountId: input?.accountId ?? demoAccounts[0]?.id, kind: String(input?.kind ?? 'contribution'),
      symbol: input?.symbol ?? null, amount: Math.abs(num(input?.amount)), quantity: input?.quantity ?? null,
      price: input?.price ?? null, occurredAt, taxYear: input?.taxYear ?? new Date().getFullYear(),
      note: input?.note ?? null, createdAt: Date.now() };
    // A dividend belongs on the Dividends screen and a contribution on
    // Contributions, so each lands where its own screen reads from — otherwise
    // the entry is recorded and then appears nowhere.
    (row.kind === 'dividend' ? DEMO_DIVIDENDS : DEMO_CONTRIBUTIONS).unshift(row);
    return { id, entries: clone(row.kind === 'dividend' ? DEMO_DIVIDENDS : DEMO_CONTRIBUTIONS) };
  },
  deleteInvestmentTransaction: ([id]) => {
    for (const list of [DEMO_DIVIDENDS, DEMO_CONTRIBUTIONS]) {
      const index = list.findIndex((e) => e.id === id);
      if (index >= 0) { list.splice(index, 1); return { entries: clone(list) }; }
    }
    return { entries: clone(DEMO_DIVIDENDS) };
  },
  // The chart tile's price-alert control. The real one needs a server-side
  // watch and a delivery channel, neither of which the public terminal has —
  // but the tile is the portal's own, so the control is there, and a control
  // that appears and silently does nothing is the one thing this demo must not
  // do. It records the alert like every other demo write and resets with the
  // rest of the session.
  createPriceAlert: ([input]) => {
    const id = nextId('demo-alert');
    DEMO_PRICE_ALERTS.push({ id, symbol: String(input?.symbol ?? ''),
      condition: String(input?.condition ?? 'above'), threshold: num(input?.threshold),
      repeat: input?.repeat === true, createdAt: Date.now() });
    return { id, ok: true };
  },
  createInvestmentGoal: ([input]) => {
    const id = nextId('demo-goal');
    DEMO_GOALS.push({ id, label: String(input?.label ?? 'New goal'), kind: input?.kind ?? null,
      targetAmount: input?.targetAmount == null ? null : num(input.targetAmount),
      targetDate: input?.targetDate ?? null, targetYear: input?.targetYear ?? null,
      note: input?.note ?? null, createdAt: Date.now() });
    return { id };
  },
  deleteInvestmentGoal: ([id]) => {
    const index = DEMO_GOALS.findIndex((g) => g.id === id);
    if (index >= 0) DEMO_GOALS.splice(index, 1);
    return { ok: true };
  },
  // Undo. The item is rebuilt from what the delete handed back, so pressing undo
  // puts back the row that was removed rather than a fresh one.
  restoreTodoItem: ([item]) => {
    if (item?.id && !demoState.todo.some((i) => i.id === item.id)) {
      demoState.todo.splice(Math.min(num(item.position, demoState.todo.length), demoState.todo.length), 0, {
        id: item.id, code: '', text: String(item.text ?? ''), marker: 'none', checkable: true,
        done: item.done === true, recurring: false, timer: null, overdue: false, dueToday: false,
      });
    }
    return todo();
  },
  // ---- The hand-kept funded book ---------------------------------------------
  //
  // Manual Trades is a retained nav row, so a visitor can reach it and press
  // Add. Every write returns the same payload the read returns, and the
  // account's headline figures are derived from its trades — log one and the
  // balance above it moves.
  addFundedAccount: ([input]) => {
    DEMO_FUNDED_ACCOUNTS.push({
      id: nextId('demo-fa'), ownerId: 'demo-user', owner: 'demo', isMine: true,
      platform: String(input?.platform ?? 'Hand-kept'), label: String(input?.label ?? 'New book'),
      currency: String(input?.currency ?? 'USD'), startingBalance: num(input?.startingBalance),
      balance: num(input?.startingBalance), commissionPerLot: input?.commissionPerLot ?? null,
      notes: input?.notes ?? null, realizedPl: 0, tradeCount: 0,
      pnl: { daily: 0, weekly: 0, monthly: 0 }, trades: [],
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    return funded();
  },
  updateFundedAccount: ([id, patch]) => {
    const row = DEMO_FUNDED_ACCOUNTS.find((a) => a.id === id);
    if (row) Object.assign(row, patch, { updatedAt: Date.now() });
    return funded();
  },
  removeFundedAccount: ([id]) => {
    const index = DEMO_FUNDED_ACCOUNTS.findIndex((a) => a.id === id);
    if (index >= 0) DEMO_FUNDED_ACCOUNTS.splice(index, 1);
    return funded();
  },
  addFundedTrade: ([accountId, input]) => {
    const account = DEMO_FUNDED_ACCOUNTS.find((a) => a.id === accountId) ?? DEMO_FUNDED_ACCOUNTS[0];
    if (account) {
      account.trades.unshift({
        id: nextId('demo-ft'), instrument: String(input?.instrument ?? 'EUR/USD'),
        side: input?.side === 'short' ? 'short' : 'long', units: num(input?.units),
        entryPrice: num(input?.entryPrice), exitPrice: input?.exitPrice == null ? null : num(input.exitPrice),
        stopLoss: input?.stopLoss ?? null, takeProfit: input?.takeProfit ?? null,
        // Null realized P/L on an OPEN trade, never zero: a position that has
        // not closed has not made or lost anything yet, and a zero would score
        // as a break-even in every figure that reads it.
        realizedPl: input?.exitPrice == null ? null : num(input?.realizedPl),
        openedAt: Date.now(), closedAt: input?.exitPrice == null ? null : Date.now(),
      });
    }
    return funded();
  },
  removeFundedTrade: ([id]) => {
    for (const account of DEMO_FUNDED_ACCOUNTS) {
      const index = account.trades.findIndex((t: any) => t.id === id);
      if (index >= 0) { account.trades.splice(index, 1); break; }
    }
    return funded();
  },
  // ---- Reporting a bug, and sending a suggestion ------------------------------
  //
  // Reporting a bug is free on every account and is the one thing a visitor
  // evaluating the product is most likely to try. Unhandled, `createBugReport`
  // answered without a `report`, and the screen prepends that `undefined`
  // straight into the list it renders.
  createBugReport: ([body]) => {
    const now = Date.now();
    const report = { id: nextId('demo-bug'), author: 'Demo Trader', status: 'open',
      summary: (String(body ?? '').split('\n')[0] || 'Bug report').slice(0, 140), createdAt: now, updatedAt: now,
      messages: [{ id: nextId('demo-msg'), role: 'user', body: String(body ?? ''), createdAt: now }] };
    DEMO_BUG_REPORTS.unshift(report);
    return { report: clone(report) };
  },
  replyBugReport: ([id, body]) => {
    const report = DEMO_BUG_REPORTS.find((r) => r.id === id);
    if (report) {
      report.messages.push({ id: nextId('demo-msg'), role: 'user', body: String(body ?? ''), createdAt: Date.now() });
      report.updatedAt = Date.now();
    }
    return { report: clone(report ?? { id, author: 'Demo Trader', status: 'open', summary: '', createdAt: Date.now(), updatedAt: Date.now(), messages: [] }) };
  },
  announcements: () => ({ announcements: DEMO_ANNOUNCEMENTS.map(clone), canManage: true }),
  addAnnouncement: ([title, body]) => {
    DEMO_ANNOUNCEMENTS.unshift({ id: nextId('demo-ann'), title: String(title ?? ''), body: String(body ?? ''), author: 'Demo Trader', createdAt: Date.now() });
    return { announcements: DEMO_ANNOUNCEMENTS.map(clone), canManage: true };
  },
  removeAnnouncement: ([id]) => {
    const at = DEMO_ANNOUNCEMENTS.findIndex((a) => a.id === id);
    if (at >= 0) DEMO_ANNOUNCEMENTS.splice(at, 1);
    return { announcements: DEMO_ANNOUNCEMENTS.map(clone), canManage: true };
  },
  patchNotes: () => ({ notes: DEMO_PATCH_NOTES.map(clone), canManage: true }),
  publishPatchNote: ([version, dateLabel, notes]) => {
    DEMO_PATCH_NOTES.unshift({
      id: nextId('demo-pn'),
      version: String(version ?? ''),
      // An empty date is left EMPTY rather than filled in with today: the screen
      // renders whatever it is given, and inventing a date on a note somebody
      // deliberately left undated is the terminal making something up.
      dateLabel: String(dateLabel ?? ''),
      notes: Array.isArray(notes) ? notes.map((n: unknown) => String(n)) : [],
      publishedAt: Date.now(),
    });
    return { notes: DEMO_PATCH_NOTES.map(clone), canManage: true };
  },
  sendSuggestion: ([body]) => {
    const suggestion = { id: nextId('demo-sug'), body: String(body ?? ''), author: 'Demo Trader', status: 'new', createdAt: Date.now() };
    DEMO_SUGGESTIONS.unshift(suggestion);
    // The send genuinely worked — the suggestion is in demo state and is listed back.
    // What it did NOT do is reach anybody, and the visitor has to be told that outright.
    return {
      suggestion: clone(suggestion),
      notice: 'Sent — for demonstration purposes only. Nothing here reaches us, and it resets when you leave. Suggestions will be available to Early Access members.',
    };
  },
  createNote: ([input]) => {
    demoState.notes.unshift({
      id: nextId('demo-note'), ownerId: 'demo-user', owner: 'demo', ownerName: 'Demo Trader', isMine: true,
      kind: input?.kind ?? 'prediction', visibility: 'private', title: String(input?.title ?? ''), body: input?.body ?? null,
      instrument: input?.instrument ?? null, direction: input?.direction ?? null, targetPrice: input?.targetPrice ?? null,
      confidence: input?.confidence ?? null, weekKey: input?.weekKey ?? demoState.notes[0]?.weekKey ?? '',
      windowOpensAt: Date.now(), deadlineAt: Date.now() + 5 * 86_400_000, openPrice: null,
      locked: false, revealed: true, autoSettles: false, outcome: null, settledAt: null, settledBy: null,
      settlePrice: null, settleNote: null, reflection: null, reflectedAt: null, awaiting: 'settle',
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    return { note: clone(demoState.notes[0]) };
  },
};

// ---- Study, funded and general-news seeds ------------------------------------

const deck = (id: string, name: string, description: string, categories: string[], questionCount: number) => ({
  id, name, description, source: 'ai_topic', isSample: false, categories,
  categoryWeights: null, questionCount, hasLeaderboard: false,
  createdBy: 'demo-user', createdByName: 'Demo Trader', createdAt: demoAgo(30),
});

const DEMO_DECKS = [
  deck('demo-deck-1', 'Market terminology', 'The vocabulary a new trader meets first — orders, spreads, sessions and sizing.', ['Orders', 'Pricing', 'Sessions', 'Risk'], DEMO_QUESTIONS.length),
  deck('demo-deck-2', 'Reading an economic calendar', 'What each release measures, who publishes it, and how often it is revised.', ['Inflation', 'Labor', 'Policy'], 0),
];

const DEMO_SETS = [
  { id: 'demo-set-1', name: 'Currency pair nicknames', description: 'Cable, Fiber, Loonie — and what each one actually is.', source: 'manual', topics: ['Majors', 'Crosses'], cardCount: 24, createdBy: 'demo-user', createdByName: 'Demo Trader', createdAt: demoAgo(24) },
  { id: 'demo-set-2', name: 'Session hours', description: 'When Tokyo, London and New York open and close, in Eastern time.', source: 'manual', topics: ['Sessions'], cardCount: 18, createdBy: 'demo-user', createdByName: 'Demo Trader', createdAt: demoAgo(12) },
];

// Wire-service reporting only, and deliberately without a bias glyph, an impact
// chip or a read-through: a flood or an election has no market read-through the
// terminal could honestly supply, so it reports and stops.
const wire = (id: string, title: string, body: string, source: string, hours: number) =>
  ({ id, title, body, tradeNote: null, source, url: null, category: 'markets', impact: 'low', bias: 'neutral', publishedAt: Date.now() - hours * 3_600_000 });

const DEMO_WORLD = [
  wire('w1', 'Aid convoys reach flood-hit districts as waters recede', 'Officials said access had improved along the main road corridor.', 'Fictional Wire', 2),
  wire('w2', 'Shipping association reports lower delays at major container ports', 'Waiting times fell for a third consecutive week.', 'Fictional Wire', 7),
  wire('w3', 'Health ministry publishes annual vaccination coverage figures', 'Coverage was broadly unchanged from the previous year.', 'Fictional Wire', 20),
];
const DEMO_POLITICS = [
  wire('p1', 'Budget committee sets date for the next round of hearings', 'The schedule was published without further comment.', 'Fictional Wire', 3),
  wire('p2', 'Trade delegation concludes three days of talks', 'Both sides described the discussions as procedural.', 'Fictional Wire', 11),
];

const fundedTrade = (id: string, instrument: string, side: 'long'|'short', units: number, entry: number, exit: number|null, pl: number|null, days: number) => ({
  id, accountId: 'demo-funded-1', instrument, side, units, entryPrice: entry, exitPrice: exit,
  realizedPl: pl, stopLoss: null, takeProfit: null, status: exit == null ? 'open' : 'closed',
  openedAt: demoAgo(days), closedAt: exit == null ? null : demoAgo(days) + 5 * 3_600_000,
  notes: null, createdAt: demoAgo(days),
});

// A hand-kept book with trades in it, so the screen shows what it is for rather
// than an empty state.
const DEMO_FUNDED_ACCOUNTS: any[] = [{
  id: 'demo-funded-1', ownerId: 'demo-user', owner: 'demo', isMine: true,
  platform: 'Hand-kept', label: 'Practice book', currency: 'USD',
  balance: 12_480, startingBalance: 12_000, commissionPerLot: null, notes: null,
  realizedPl: 480, tradeCount: 3, pnl: { daily: 0, weekly: 186, monthly: 480 },
  trades: [
    fundedTrade('demo-ft-1', 'EUR/USD', 'long', 20_000, 1.1631, 1.1674, 86, 3),
    fundedTrade('demo-ft-2', 'NAS100', 'short', 1, 19_402, 19_302, 100, 6),
    fundedTrade('demo-ft-3', 'XAU/USD', 'long', 3, 4_598.2, null, null, 1),
  ],
  createdAt: demoAgo(60), updatedAt: demoAgo(1),
}];

// The account's headline figures are DERIVED from its trades, so logging one
// moves the balance above it rather than leaving the two to disagree.
function fundedAccounts() {
  return DEMO_FUNDED_ACCOUNTS.map((account) => {
    const closed = account.trades.filter((t: any) => t.exitPrice != null);
    const realizedPl = closed.reduce((sum: number, t: any) => sum + num(t.realizedPl), 0);
    return { ...account, realizedPl, tradeCount: account.trades.length,
      balance: num(account.startingBalance) + realizedPl,
      pnl: { ...account.pnl, monthly: realizedPl } };
  });
}
const funded = () => ({ accounts: clone(fundedAccounts()), fundedTileColor: null });

const capitalTotal = (value: number) => ({ value, mode: 'manual' as const, stated: 1, unstated: 0, mixedCurrency: false });

const reads: Record<string, () => unknown> = {
  funded,
  myBugReports: () => ({ reports: clone(DEMO_BUG_REPORTS) }),
  studyDecks: () => ({ decks: clone(DEMO_DECKS) }),
  studyGames: () => ({ decks: clone(DEMO_DECKS) }),
  studyFlashcardSets: () => ({ sets: clone(DEMO_SETS) }),
  teamFlashcardSets: () => ({ sets: clone(DEMO_SETS) }),
  traderCapital: () => ({
    userId: 'demo-user', traders: 1,
    deposited: capitalTotal(25_000), withdrawn: capitalTotal(4_000),
    breakdown: [{ accountKey: 'other', label: 'Hand-kept book', broker: null, connected: false, currency: 'USD', deposited: 25_000, withdrawn: 4_000, depositedSync: false, withdrawnSync: false, syncable: false, canEdit: false, nav: null, syncedAt: null, note: null }],
    total: 27_412.6, accounts: 1, unreadable: 0, currency: 'USD', canSync: false, syncedAt: null,
    otherTransfers: 0, note: null, canEdit: false,
  }),
  tradeLog, tradeHistory, getTodo: todo, netWorth, budgetMonth: budget,
  investmentPortfolio: portfolio, tradingNotes: notes,
  deletedTrades: () => ({ trades: clone(demoState.deleted), canDeleteAny: false }),
  // DERIVED from what has actually been recorded, so adding a contribution or a
  // goal moves the figure above it. Returning a fixed empty shape here would let
  // a visitor add one, be told it saved, and see nothing appear — which reads as
  // a broken screen rather than a demo.
  investmentContributions: () => {
    const year = new Date().getFullYear();
    const mine = DEMO_CONTRIBUTIONS.filter((e) => (e.taxYear ?? year) === year);
    const contributed = mine.reduce((sum, e) => sum + num(e.amount), 0);
    return {
      taxYear: year, limitsKnown: true, latestLimitYear: year,
      groups: [],
      // SHAPED THE WAY THE SCREEN READS A GOAL, not the way one is stored.
      // `current` and `pct` are derived here exactly as the live route derives
      // them; handing back the stored row instead threw
      // `goal.pct.toFixed is not a function` and blanked the screen the moment
      // somebody added one. It was invisible while the demo hid its own add
      // button — the count this used to be checked by was happy either way.
      goals: DEMO_GOALS.map((g) => {
        const current = portfolio().totals.value;
        return { ...clone(g), accountId: g.accountId ?? null, accountLabel: null,
          kind: g.kind ?? 'custom', targetDate: g.targetDate ?? null, current,
          pct: g.targetAmount > 0 ? Math.min(100, (current / g.targetAmount) * 100) : 0 };
      }),
      // No limit is claimed for these, so everything recorded is uncapped —
      // stating a cap the demo has no catalog behind would be inventing a
      // figure, which is the one thing these screens must not do.
      uncappedContributed: contributed,
    };
  },
  investmentDividends: () => {
    const entries = clone(DEMO_DIVIDENDS);
    const total = entries.reduce((sum, e) => sum + e.amount, 0);
    const monthly = [...new Set(entries.map((e) => e.occurredAt.slice(0, 7)))].sort()
      .map((month) => ({ month, amount: entries.filter((e) => e.occurredAt.startsWith(month)).reduce((s, e) => s + e.amount, 0) }));
    const bySymbol = [...new Set(entries.map((e) => e.symbol))]
      .map((symbol) => ({ symbol: symbol!, amount: entries.filter((e) => e.symbol === symbol).reduce((s, e) => s + e.amount, 0) }));
    const value = portfolio().totals.value;
    return { entries: clone(entries), monthly, totalLast12: total, totalAllTime: total, trailingYieldPct: value ? (total / value) * 100 : null, bySymbol };
  },
  investmentPerformance: () => {
    const end = portfolio().totals.value;
    const points = Array.from({ length: 13 }, (_, i) => ({ onDate: new Date(demoAgo((12 - i) * 30)).toISOString().slice(0, 10), value: Math.round(end * (0.82 + i * 0.015)), contributedToDate: 500 * i }));
    const start = points[0]!.value;
    const contributed = points.at(-1)!.contributedToDate!;
    const marketGain = end - start - contributed;
    return { points, summary: { startValue: start, endValue: end, contributed, marketGain, marketGainPct: start ? (marketGain / start) * 100 : null }, totalDays: 390, rangeDays: 390 };
  },
};

/** Answers a client method in demo mode, or reports that it has no fixture. */
export function demoCall(name: string, args: any[]): { handled: boolean; value?: unknown } {
  const write = writes[name];
  if (write) return { handled: true, value: write(args) };
  const read = reads[name];
  if (read) return { handled: true, value: read() };
  return { handled: false };
}
