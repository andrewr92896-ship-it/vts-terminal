// The demo's data.
//
// Everything here is FICTIONAL and lives in module memory: a reload re-imports
// the module and the visitor starts over, which is what "nothing is saved"
// means without any storage to clear. Nothing in this file reaches a network.
//
// It is written to be plausible rather than flattering — a losing month, a
// prediction that did not come true, an unpriced holding — because a showcase
// that only ever shows wins reads as a mock-up, and because the terminal's own
// rule is that a figure nobody could measure is never dressed up as one.

const DAY = 86_400_000;
const now = Date.now();
const ago = (days: number, hours = 0) => now - days * DAY - hours * 3_600_000;
const day = (offset: number) => new Date(now - offset * DAY).toISOString().slice(0, 10);

const ME = { ownerId: 'demo-user', owner: 'demo', ownerName: 'Demo Trader', isMine: true };

// ---- Trades -----------------------------------------------------------------

type Seed = {
  instrument: string; side: 'long' | 'short'; entry: number; exit: number;
  units: number; pl: number; tp: number | null; sl: number | null;
  strategy: string; timeframe: string; opened: number; held: number;
};

const TRADE_SEEDS: Seed[] = [
  { instrument: 'EUR/USD', side: 'long', entry: 1.1642, exit: 1.1698, units: 20000, pl: 112, tp: 1.1705, sl: 1.1608, strategy: 'London open', timeframe: 'M15', opened: ago(2, 6), held: 4 },
  { instrument: 'GBP/USD', side: 'short', entry: 1.3612, exit: 1.3571, units: 15000, pl: 61.5, tp: 1.3555, sl: 1.3648, strategy: 'Range fade', timeframe: 'M30', opened: ago(3, 9), held: 6 },
  { instrument: 'XAU/USD', side: 'long', entry: 4612.4, exit: 4588.1, units: 5, pl: -121.5, tp: 4680, sl: 4586, strategy: 'Breakout', timeframe: 'H1', opened: ago(4, 2), held: 3 },
  { instrument: 'USD/JPY', side: 'long', entry: 151.22, exit: 151.86, units: 10000, pl: 42.1, tp: 152.0, sl: 150.8, strategy: 'Trend follow', timeframe: 'H1', opened: ago(6, 1), held: 9 },
  { instrument: 'NAS100', side: 'short', entry: 19_310, exit: 19_388, units: 2, pl: -156, tp: 19_180, sl: 19_390, strategy: 'Fade the gap', timeframe: 'M15', opened: ago(7, 4), held: 2 },
  { instrument: 'EUR/USD', side: 'short', entry: 1.1721, exit: 1.1684, units: 25000, pl: 92.5, tp: 1.1670, sl: 1.1748, strategy: 'London open', timeframe: 'M15', opened: ago(9, 5), held: 5 },
  { instrument: 'AUD/USD', side: 'long', entry: 0.6588, exit: 0.6588, units: 20000, pl: 0, tp: 0.6640, sl: 0.6552, strategy: 'Breakout', timeframe: 'M30', opened: ago(11, 3), held: 7 },
  { instrument: 'XAU/USD', side: 'long', entry: 4540.8, exit: 4602.2, units: 4, pl: 245.6, tp: 4610, sl: 4512, strategy: 'Trend follow', timeframe: 'H4', opened: ago(13, 2), held: 26 },
  { instrument: 'GBP/JPY', side: 'short', entry: 205.44, exit: 206.02, units: 8000, pl: -30.6, tp: 204.2, sl: 206.1, strategy: 'Range fade', timeframe: 'H1', opened: ago(16, 6), held: 11 },
  { instrument: 'EUR/USD', side: 'long', entry: 1.1588, exit: 1.1631, units: 20000, pl: 86, tp: 1.1640, sl: 1.1560, strategy: 'London open', timeframe: 'M15', opened: ago(18, 7), held: 4 },
];

const code = (openedAt: number, n: number) => {
  const d = new Date(openedAt);
  const p = (v: number) => String(v).padStart(2, '0');
  return `${p(d.getMonth() + 1)}${p(d.getDate())}${String(d.getFullYear()).slice(2)}-${n}`;
};

const tradeFrom = (seed: Seed, index: number) => ({
  ...ME,
  id: `demo-trade-${index + 1}`,
  broker: null,
  instrument: seed.instrument,
  side: seed.side,
  status: 'closed' as const,
  plannedEntry: seed.entry,
  entryPrice: seed.entry,
  exitPrice: seed.exit,
  takeProfit: seed.tp,
  stopLoss: seed.sl,
  units: seed.units,
  slippage: 0,
  realizedPl: seed.pl,
  unrealizedPl: null,
  strategy: seed.strategy,
  timeframe: seed.timeframe,
  openedAt: seed.opened,
  closedAt: seed.opened + seed.held * 3_600_000,
  notes: null,
  createdAt: seed.opened,
  updatedAt: seed.opened + seed.held * 3_600_000,
  editable: true,
  source: 'manual' as const,
  code: code(seed.opened, index + 1),
});

// ---- The mutable demo state -------------------------------------------------
//
// Plain module state on purpose. A reload resets it; nothing is written to
// storage, so there is nothing that can outlive the visit.

export const demoState = {
  trades: TRADE_SEEDS.map(tradeFrom) as any[],
  deleted: [] as any[],
  nextId: 100,
  todo: [
    { id: 'd1', code: 'A1', text: 'Review yesterday’s EUR/USD entries', marker: 'none', checkable: true, done: true, recurring: false, timer: null, overdue: false, dueToday: false },
    { id: 'd2', code: 'A2', text: 'Mark up the gold H4 chart before the open', marker: 'none', checkable: true, done: false, recurring: false, timer: null, overdue: false, dueToday: true },
    { id: 'd3', code: 'A3', text: 'Write this week’s prediction before Monday', marker: 'none', checkable: true, done: false, recurring: false, timer: null, overdue: false, dueToday: false },
  ] as any[],
  netWorthItems: [
    { id: 'nw1', kind: 'asset', category: 'cash', label: 'Checking account', value: 8400, note: null, active: true, sortOrder: 0, updatedAt: ago(1) },
    { id: 'nw2', kind: 'asset', category: 'savings', label: 'Emergency fund', value: 15_000, note: '6 months of expenses', active: true, sortOrder: 1, updatedAt: ago(1) },
    { id: 'nw3', kind: 'asset', category: 'vehicle', label: 'Car', value: 18_500, note: null, active: true, sortOrder: 2, updatedAt: ago(20) },
    { id: 'nw4', kind: 'liability', category: 'auto_loan', label: 'Car loan', value: 11_200, note: null, active: true, sortOrder: 3, updatedAt: ago(20) },
    { id: 'nw5', kind: 'liability', category: 'credit_card', label: 'Credit card', value: 1450, note: null, active: true, sortOrder: 4, updatedAt: ago(2) },
  ] as any[],
  budgetCategories: [
    { id: 'bc1', name: 'Salary', kind: 'income', monthlyLimit: 520_000, icon: null, sortOrder: 0, archived: false },
    { id: 'bc2', name: 'Rent', kind: 'expense', monthlyLimit: 165_000, icon: null, sortOrder: 1, archived: false },
    { id: 'bc3', name: 'Groceries', kind: 'expense', monthlyLimit: 60_000, icon: null, sortOrder: 2, archived: false },
    { id: 'bc4', name: 'Transport', kind: 'expense', monthlyLimit: 24_000, icon: null, sortOrder: 3, archived: false },
    { id: 'bc5', name: 'Software & data', kind: 'expense', monthlyLimit: 18_000, icon: null, sortOrder: 4, archived: false },
  ] as any[],
  budgetEntries: [
    { id: 'be1', categoryId: 'bc1', amountCents: 520_000, note: 'Monthly salary', occurredOn: day(20), source: 'manual' },
    { id: 'be2', categoryId: 'bc2', amountCents: 165_000, note: null, occurredOn: day(19), source: 'manual' },
    { id: 'be3', categoryId: 'bc3', amountCents: 21_450, note: null, occurredOn: day(14), source: 'manual' },
    { id: 'be4', categoryId: 'bc3', amountCents: 18_720, note: null, occurredOn: day(6), source: 'manual' },
    { id: 'be5', categoryId: 'bc4', amountCents: 9_400, note: 'Fuel', occurredOn: day(9), source: 'manual' },
    { id: 'be6', categoryId: 'bc5', amountCents: 14_900, note: 'Charting subscription', occurredOn: day(17), source: 'manual' },
  ] as any[],
  notes: [] as any[],
};

// ---- Trading notes ----------------------------------------------------------
//
// One settled hit, one settled miss, one that could not be settled, and one
// still open. `unsettleable` is deliberately present and is never counted as a
// miss — the same rule the private terminal follows.

const weekKey = (offset: number) => {
  const d = new Date(now - offset * 7 * DAY);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / DAY - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

const note = (over: Record<string, unknown>) => ({
  ...ME, kind: 'prediction', visibility: 'private', title: '', body: null,
  instrument: null, direction: null, targetPrice: null, confidence: 3,
  weekKey: weekKey(0), windowOpensAt: ago(5), deadlineAt: ago(1), openPrice: null,
  locked: true, revealed: true, autoSettles: true, outcome: null, settledAt: null,
  settledBy: null, settlePrice: null, settleNote: null, reflection: null,
  reflectedAt: null, awaiting: null, createdAt: ago(6), updatedAt: ago(1), ...over,
});

demoState.notes = [
  note({ id: 'dn1', title: 'Euro grinds higher into the ECB', instrument: 'EUR/USD', direction: 'up', confidence: 4, openPrice: 1.1602, outcome: 'hit', settledAt: ago(1), settledBy: 'auto', settlePrice: 1.1668, reflection: 'Sized too small for how sure I was.' }),
  note({ id: 'dn2', title: 'Gold pulls back from the highs', instrument: 'XAU/USD', direction: 'down', confidence: 3, openPrice: 4590.2, outcome: 'miss', settledAt: ago(1), settledBy: 'auto', settlePrice: 4641.8, reflection: 'Called the level, not the timing.' }),
  note({ id: 'dn3', title: 'Choppy, rangebound week across the majors', instrument: null, direction: null, confidence: 2, autoSettles: false, outcome: 'unsettleable', settledAt: ago(1), settledBy: 'self', settleNote: 'No instrument or level named, so nothing to measure it against.' }),
  note({ id: 'dn4', title: 'Dollar index holds its trend line', instrument: 'USD/JPY', direction: 'up', confidence: 3, weekKey: weekKey(0), windowOpensAt: ago(1), deadlineAt: now + 4 * DAY, openPrice: 151.44, locked: true, revealed: true, awaiting: 'settle', createdAt: ago(2), updatedAt: ago(2) }),
  note({ id: 'dn5', kind: 'observation', title: 'Spreads widen sharply in the last hour of New York', body: 'Worth avoiding entries after 15:30 ET on thinner days.', instrument: null, direction: null, confidence: null, windowOpensAt: null, deadlineAt: null, autoSettles: false, locked: false, revealed: true, createdAt: ago(8), updatedAt: ago(8) }),
];

// ---- Investments ------------------------------------------------------------

const holding = (over: Record<string, unknown>) => ({
  id: '', accountId: 'ia1', accountLabel: '401(k) · Fidelity', symbol: null, name: '',
  assetClass: 'fund', quantity: 0, costBasis: null, price: null, priceSource: 'manual',
  previousClose: null, sector: null, region: 'US', value: null, gain: null, gainPct: null,
  dayChange: null, dayChangePct: null, manualPrice: null, manualPriceAt: ago(3),
  note: null, createdAt: ago(400), updatedAt: ago(3), ...over,
});

export const demoAccounts = [
  { id: 'ia1', kind: 'four01k', label: '401(k) · Fidelity', institution: 'Fidelity', source: 'manual', cashBalance: 1_240, note: null, createdAt: ago(900), updatedAt: ago(3) },
  { id: 'ia2', kind: 'roth_ira', label: 'Roth IRA', institution: 'Schwab', source: 'manual', cashBalance: 480, note: null, createdAt: ago(700), updatedAt: ago(3) },
  { id: 'ia3', kind: 'brokerage', label: 'Taxable brokerage', institution: 'Schwab', source: 'manual', cashBalance: 2_100, note: null, createdAt: ago(500), updatedAt: ago(3) },
];

export const demoHoldings = [
  holding({ id: 'ih1', symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', assetClass: 'equity', quantity: 210, costBasis: 41_800, price: 268.4, priceSource: 'live', previousClose: 266.9, sector: 'Diversified' }),
  holding({ id: 'ih2', accountId: 'ia2', accountLabel: 'Roth IRA', symbol: 'VXUS', name: 'Vanguard Total International Stock ETF', assetClass: 'equity', quantity: 140, costBasis: 8_900, price: 68.2, priceSource: 'live', previousClose: 67.9, region: 'International' }),
  holding({ id: 'ih3', accountId: 'ia3', accountLabel: 'Taxable brokerage', symbol: 'BND', name: 'Vanguard Total Bond Market ETF', assetClass: 'bond', quantity: 95, costBasis: 7_400, price: 74.1, priceSource: 'live', previousClose: 74.3, sector: 'Fixed income' }),
  // Deliberately unpriced: a collective trust with no ticker, which no free
  // provider can price. It is COUNTED and named rather than valued at zero.
  holding({ id: 'ih4', name: 'Target Retirement 2055 Trust', assetClass: 'fund', quantity: 1_120, costBasis: 22_600, price: null, priceSource: 'none' }),
];

export { now as DEMO_NOW, ago as demoAgo, day as demoDay };
