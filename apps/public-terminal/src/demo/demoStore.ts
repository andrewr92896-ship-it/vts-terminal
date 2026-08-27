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

// ---- Writes -----------------------------------------------------------------
//
// Each one mutates module state and returns the same payload its read returns,
// because that is what the screens re-render from.

const writes: Record<string, (args: any[]) => unknown> = {
  generalNews: ([topic]) => ({ headlines: clone(topic === 'politics' ? DEMO_POLITICS : DEMO_WORLD) }),
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
  deck('demo-deck-1', 'Market terminology', 'The vocabulary a new trader meets first — orders, spreads, sessions and sizing.', ['Orders', 'Pricing', 'Sessions', 'Risk'], 48),
  deck('demo-deck-2', 'Reading an economic calendar', 'What each release measures, who publishes it, and how often it is revised.', ['Inflation', 'Labor', 'Policy'], 32),
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

const capitalTotal = (value: number) => ({ value, mode: 'manual' as const, stated: 1, unstated: 0, mixedCurrency: false });

const reads: Record<string, () => unknown> = {
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
  investmentContributions: () => ({ taxYear: new Date().getFullYear(), limitsKnown: true, latestLimitYear: new Date().getFullYear(), groups: [], goals: [], uncappedContributed: 0 }),
  investmentDividends: () => {
    const entries = DEMO_DIVIDENDS;
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
