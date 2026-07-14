import type { WorkspaceKey } from '../theme/themes';

// Granular, admin-assigned roles (mirror of backend auth/rbac.ts ROLE_KEYS).
// A user can hold any combination.
export type RoleKey =
  | 'admin'
  | 'trading'
  | 'trading_viewer'
  | 'sales'
  | 'studies'
  | 'todo'
  | 'wealth'
  | 'finance';

// One row in the Study Game high-score table. Mirrors the backend's
// LeaderboardEntry (studies/game.ts). A row is either a player's current live
// run or a past run they banked by resetting.
export interface LeaderboardEntry {
  id: string; // unique row id: "live:<userId>" or "run:<runId>"
  userId: string;
  name: string;
  score: number | null; // lifetime accuracy % (correct / attempted)
  attempted: number; // questions answered in this run
  correct: number; // correct answers in this run
  bestStep: number; // highest overall level step reached (0..59)
  archived: boolean; // true for a banked (reset) run
  when: number | null; // when the run was banked (ms); null for live rows
  isMe: boolean; // the caller's current live row
}

// ---- Studies: mock tests (mirror of apps/api/src/studies/tests.ts) ----
// Per-topic correct/total for a finished test, keyed by Series 65 topic name.
export type TestBreakdown = Record<string, { correct: number; total: number }>;

// One finished mock test, stamped with the learner's attempt number.
export interface TestResult {
  id: string;
  attempt: number; // this learner's Nth completed test
  score: number; // percent correct, 0..100
  correct: number;
  total: number;
  breakdown: TestBreakdown;
  passed: boolean;
  durationMs: number | null;
  createdAt: number;
}

// One player's best test on the high-score board.
export interface TestLeaderboardEntry {
  userId: string;
  name: string;
  score: number;
  correct: number;
  total: number;
  attempt: number; // the attempt number that produced this best score
  attempts: number; // total tests finished
  passed: boolean;
  createdAt: number;
  isMe: boolean;
}

// Matches the backend's PublicUser shape (auth/rbac.ts).
export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  roles: RoleKey[];
  viewBrokerage: boolean;
  mustChangePassword: boolean;
  isDemo: boolean; // the public, read-only demo account
  access: {
    label: string;
    workspaces: WorkspaceKey[];
    readOnlyWorkspaces: WorkspaceKey[];
  };
}

// Admin user-management view (matches the backend AdminUserView). Includes
// the original created username, which never changes when a user renames.
export interface AdminUser {
  id: string;
  username: string;
  createdUsername: string;
  displayName: string;
  email: string | null;
  roles: RoleKey[];
  active: boolean;
  viewBrokerage: boolean;
  mustChangePassword: boolean;
  createdAt: number;
}

// Raw data returned when an item is removed, so the client can offer "undo".
export interface RemovedTodoItem {
  id: string;
  sectionId: string;
  text: string;
  position: number;
  hyphen: boolean;
  done: boolean;
  dueAt: number | null;
  intervalDays: number | null;
}

export interface RemovedKiaDeal {
  id: string;
  customer: string;
  model: string;
  type: 'New' | 'Used';
  profit: number;
  frontProfit: number | null;
  backProfit: number | null;
  soldAt: number;
}

// The prior state of a toggled item, returned so the client can offer an Undo.
export interface TodoItemState {
  id: string;
  done: boolean;
  dueAt: number | null;
}

// Result of running a Claude command-bar instruction over the list.
export interface TodoCommandResult {
  sections: TodoSection[];
  applied: string[];
  skipped: string[];
  reply: string;
}

// Current user's AI usage against the monthly cap.
export interface AiUsage {
  used: number;
  limit: number;
  remaining: number;
}

export type TodoMarker = 'check' | 'dash' | 'dot';

export interface TodoItem {
  id: string;
  code: string;
  text: string;
  marker: TodoMarker;
  checkable: boolean;
  done: boolean;
  recurring: boolean;
  timer: string | null;
  overdue: boolean;
  dueToday: boolean;
}

// A learner-defined Study Game subsection: a named focus area backed by the
// question ids Claude classified into it from the static Series 65 bank.
export interface StudySection {
  id: string;
  name: string;
  questionIds: number[];
}

export interface TodoSection {
  id: string;
  n: number;
  icon: string;
  title: string;
  type: 'one' | 'note' | 'daily' | 'routine' | 'deals';
  tag: string | null;
  life: boolean;
  count: number;
  empty: boolean;
  items: TodoItem[];
}

export interface KiaDeal {
  id: string;
  customer: string;
  model: string;
  type: 'New' | 'Used';
  profit: number;
  frontProfit: number | null;
  backProfit: number | null;
  dateLabel: string;
  soldAt: number;
}

export interface KiaMetrics {
  units: number;
  goalUnits: number;
  toGoal: number;
  unitPct: number;
  totalProfit: number;
  commission: number;
  commissionRate: number;
  reviewCount: number;
  reviewPct: number;
  reviewReq: number;
  reviewRequired: boolean;
  reviewOk: boolean;
  bonusTiers: { units: number; amount: number }[];
  bonusEarned: number;
  tierHitUnits: number | null;
  nextBonus: { units: number; amount: number; toGo: number } | null;
  daysInMonth: number;
  dayOfMonth: number;
  daysLeft: number;
  paceUnits: number;
  paceProfit: number;
  paceComm: number;
  onPace: boolean;
}

export interface KiaMonthOption {
  key: string; // 'YYYY-MM'
  label: string; // e.g. 'June 2026'
}

export interface KiaMonthSummary {
  month: string;
  label: string;
  units: number;
  totalProfit: number;
  commission: number;
}

export interface KiaBonusTier {
  units: number;
  amount: number;
}

export interface KiaPayPlan {
  commissionMode: 'total' | 'split';
  commissionRate: number; // total mode fraction, e.g. 0.135
  frontRate: number; // split mode: front-end fraction
  backRate: number; // split mode: back-end fraction
  reviewRequired: boolean;
  reviewReqPct: number;
  bonusTiers: KiaBonusTier[];
  miniAmount: number; // minimum commission per deal (a "mini"), whole dollars
}

export interface KiaDashboard {
  month: string; // the month currently shown, 'YYYY-MM'
  months: KiaMonthOption[]; // selectable months, newest first
  history: KiaMonthSummary[]; // per-month totals, newest first
  deals: KiaDeal[];
  metrics: KiaMetrics;
  settings: { goalUnits: number; reviewCount: number };
  payPlan: KiaPayPlan;
  hideComm: boolean; // per-account: dollar figures hidden on the dashboard
}

// Result of logging a deal from a plain-English note via Claude.
export interface KiaDealParseResult {
  dashboard: KiaDashboard | null; // refreshed when a deal was logged
  logged: boolean;
  reply: string;
}

// Result of running a Claude command-bar instruction over the month.
export interface KiaCommandResult {
  dashboard: KiaDashboard; // refreshed dashboard for the viewed month
  applied: string[];
  skipped: string[];
  reply: string;
}

// ---- Vitalis Wealth Management ----
export type WealthClientStatus = 'prospect' | 'onboarding' | 'active' | 'inactive';

export interface WealthClient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  accountValue: number | null; // whole US dollars, null when not recorded
  status: WealthClientStatus;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface WealthSummary {
  totalClients: number;
  totalAum: number;
  activeClients: number;
}

export interface WealthClientsData {
  clients: WealthClient[];
  summary: WealthSummary;
}

// ---- Wealth — Model Portfolios (mirror of apps/api/src/wealth/portfolios.ts) ----
export type PortfolioRisk =
  | 'conservative'
  | 'moderate_conservative'
  | 'moderate'
  | 'moderate_aggressive'
  | 'aggressive';
export type AssetClass =
  | 'us_equity'
  | 'intl_equity'
  | 'fixed_income'
  | 'real_assets'
  | 'cash'
  | 'alternative'
  | 'other';

export interface Allocation {
  id: string;
  name: string;
  assetClass: AssetClass;
  targetBp: number;
  position: number;
}
export interface ClassWeight {
  assetClass: AssetClass;
  bp: number;
}
export interface Portfolio {
  id: string;
  name: string;
  risk: PortfolioRisk;
  notes: string | null;
  allocations: Allocation[];
  totalBp: number;
  balanced: boolean;
  byClass: ClassWeight[];
  createdAt: number;
  updatedAt: number;
}
export interface PortfoliosData {
  portfolios: Portfolio[];
}
export interface PortfolioInput {
  name?: string;
  risk?: PortfolioRisk;
  notes?: string | null;
}
export interface AllocationInput {
  name?: string;
  assetClass?: AssetClass;
  targetBp?: number;
}

// ---- Wealth — Planning (mirror of apps/api/src/wealth/planning.ts) ----
export interface PlanProjection {
  yearsToRetirement: number;
  yearsInRetirement: number;
  balanceAtRetirement: number;
  realBalanceAtRetirement: number;
  sustainableIncome: number;
  fourPctIncome: number;
  incomeGoal: number;
  gap: number;
  onTrack: boolean;
  series: { age: number; balance: number }[];
}
export interface Plan {
  id: string;
  name: string;
  clientId: string | null;
  currentAge: number;
  retirementAge: number;
  endAge: number;
  currentSavings: number;
  annualContribution: number;
  returnBp: number;
  inflationBp: number;
  incomeGoal: number;
  projection: PlanProjection;
  createdAt: number;
  updatedAt: number;
}
export interface PlansData {
  plans: Plan[];
}
export interface PlanInput {
  name?: string;
  clientId?: string | null;
  currentAge?: number;
  retirementAge?: number;
  endAge?: number;
  currentSavings?: number;
  annualContribution?: number;
  returnBp?: number;
  inflationBp?: number;
  incomeGoal?: number;
}

// ---- Wealth — Compliance (mirror of apps/api/src/wealth/compliance.ts) ----
export type ComplianceCategory = 'filing' | 'disclosure' | 'policy' | 'client_doc' | 'review' | 'other';
export type ComplianceStatus = 'not_started' | 'in_progress' | 'complete';
export interface ComplianceItem {
  id: string;
  category: ComplianceCategory;
  title: string;
  status: ComplianceStatus;
  overdue: boolean;
  dueAt: number | null;
  completedAt: number | null;
  clientId: string | null;
  notes: string | null;
  updatedAt: number;
}
export interface ComplianceSummary {
  total: number;
  complete: number;
  open: number;
  overdue: number;
  nextDueAt: number | null;
}
export interface ComplianceData {
  items: ComplianceItem[];
  summary: ComplianceSummary;
}
export interface ComplianceInput {
  category?: ComplianceCategory;
  title?: string;
  status?: ComplianceStatus;
  dueAt?: number | null;
  clientId?: string | null;
  notes?: string | null;
}

// ---- Wealth — Practice Overview (mirror of apps/api/src/wealth/service.ts) ----
export interface PracticeStatusBreakdown {
  status: WealthClientStatus;
  count: number;
  aum: number;
}
export interface PracticeTopClient {
  id: string;
  name: string;
  status: WealthClientStatus;
  accountValue: number;
}
export interface PracticeRecentClient {
  id: string;
  name: string;
  status: WealthClientStatus;
  updatedAt: number;
}
export interface PracticeOverview {
  summary: WealthSummary;
  avgAccount: number;
  largestAccount: number;
  pipelineValue: number;
  pipelineCount: number;
  breakdown: PracticeStatusBreakdown[];
  topClients: PracticeTopClient[];
  recent: PracticeRecentClient[];
}

// Raw data returned when a client is removed, so the client can offer "undo".
export interface RemovedWealthClient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  accountValue: number | null;
  status: WealthClientStatus;
  notes: string | null;
  createdAt: number;
}

export interface BrokerStatus {
  key: string;
  name: string;
  short: string;
  platform: string;
  kind: string;
  status: 'live' | 'pending' | 'unconfigured' | 'error';
  balance: string | null;
  lastSyncAt: string | null;
}

// ---- Trading — Live Wall (mirror of apps/api/src/trading/types.ts) ----
export type TradeSide = 'long' | 'short';
export type BrokerKey = 'ftp' | 'oanda' | 'kraken' | 'tradestation';

// Forex pip math attached to currency-pair positions (mirror of
// apps/api/src/trading/forex.ts). Money fields are null when balances are hidden.
export interface ForexLeg {
  pips: number;
  money: number | null;
}
export interface ForexMetrics {
  pipSize: number;
  accountCurrency: string;
  pipsOpen: number | null; // open P/L distance in pips (signed)
  moneyPerPip: number | null; // account-currency value of one pip
  risk: ForexLeg | null; // entry -> stop loss
  reward: ForexLeg | null; // entry -> take profit
  rr: number | null; // reward-to-risk (e.g. 2 means 1:2)
}

export interface LiveTrade {
  id: string;
  ownerId: string; // the teammate whose broker account this position is on
  owner: string; // that teammate's username, shown on the position
  broker: BrokerKey;
  brokerName: string;
  instrument: string;
  side: TradeSide;
  units: number;
  plannedEntry: number | null;
  entryPrice: number;
  currentPrice: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  trailingStopLoss: number | null; // trailing-stop trigger price, when the broker reports one
  slippage: number | null;
  unrealizedPl: number | null; // null when balances are hidden
  strategy: string | null;
  timeframe: string | null;
  openedAt: number | null;
  forex?: ForexMetrics | null; // present only for genuine currency pairs
}

export interface BrokerLiveResult {
  connectionId: string;
  ownerId: string; // the teammate who owns this connection
  owner: string; // that teammate's username
  broker: BrokerKey;
  name: string;
  platform: string;
  kind: string;
  configured: boolean;
  ok: boolean;
  error: string | null;
  count: number;
}

// How the desk-wide break-even buffer is measured.
export type BreakEvenMode = 'percent' | 'dollars' | 'pips';

// A per-instrument break-even buffer that overrides the desk default for one
// instrument. Desk-wide, like the default.
export interface BreakEvenOverride {
  instrument: string;
  mode: BreakEvenMode;
  pct: number;
  amount: number;
}

export interface LiveWall {
  source: 'live' | 'sample';
  generatedAt: number;
  canSeeBalances: boolean;
  brokers: BrokerLiveResult[];
  trades: LiveTrade[];
  note: string | null;
  breakEvenPct: number; // desk-wide break-even band (percent of price move)
  breakEvenMode: BreakEvenMode;
  breakEvenAmount: number; // dollar or pip band (used in 'dollars' / 'pips' mode)
  breakEvenOverrides: BreakEvenOverride[]; // per-instrument buffers
}

// Desk-wide trading settings, shared across the whole team.
export interface DeskSettings {
  breakEvenMode: BreakEvenMode;
  breakEvenPct: number;
  breakEvenAmount: number;
  breakEvenOverrides: BreakEvenOverride[];
}

// ---- Trading — broker connections (mirror of apps/api/src/trading/connections.ts) ----
export type BrokerConnectionKind = 'oanda' | 'kraken' | 'manual';

export interface BrokerConnection {
  id: string;
  broker: BrokerConnectionKind;
  label: string;
  summary: string | null;
  env: 'practice' | 'live' | null; // OANDA environment, for restoring it on edit
  active: boolean;
  lastStatus: 'unknown' | 'ok' | 'error';
  lastError: string | null;
  lastCheckedAt: number | null;
  createdAt: number;
}

export interface ConnectionInput {
  broker?: BrokerConnectionKind;
  label?: string;
  active?: boolean;
  creds?: Record<string, string>;
}

// A hand-entered open position on a manual broker connection (mirror of
// apps/api/src/trading/manual.ts ManualPositionView).
export interface ManualPosition {
  id: string;
  connectionId: string;
  instrument: string;
  side: TradeSide;
  units: number;
  entryPrice: number;
  currentPrice: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  trailingStopLoss: number | null;
  plannedEntry: number | null;
  openedAt: number | null;
}
export interface ManualPositionInput {
  instrument: string;
  side: TradeSide;
  units: number;
  entryPrice: number;
  currentPrice?: number | null;
  takeProfit?: number | null;
  stopLoss?: number | null;
  trailingStopLoss?: number | null;
  plannedEntry?: number | null;
  openedAt?: number;
}

// What Claude read off an order/positions screenshot (mirror of the backend
// ParsedPosition). Returned alongside the saved positions so the UI can show a
// "read EUR/USD long @ 1.0840" confirmation.
export interface ParsedPosition {
  instrument: string | null;
  side: 'long' | 'short' | 'unknown';
  units: number | null;
  entryPrice: number | null;
  currentPrice: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  summary: string;
}
export interface AnalyzePositionResult {
  positions: ManualPosition[];
  parsed: ParsedPosition;
  model: string;
}

// A broker connection tagged with its owner (admin "team connections" view).
export interface OwnedBrokerConnection extends BrokerConnection {
  ownerId: string;
  owner: string;
}

// ---- Trading — Account Metrics / challenge (mirror of apps/api/src/trading/challenge.ts) ----
export interface ChallengeMetrics {
  profit: number | null;
  profitPct: number;
  targetAmount: number | null;
  targetEquity: number | null;
  toTarget: number | null;
  progressPct: number;
  maxDdAmount: number | null;
  maxFloor: number | null;
  maxHeadroom: number | null;
  maxHeadroomPct: number;
  dailyDdAmount: number | null;
  dailyFloor: number | null;
  dailyHeadroom: number | null;
  dailyHeadroomPct: number;
  status: 'active' | 'passed' | 'breached';
  breaches: { target: boolean; daily: boolean; max: boolean };
}

export interface ChallengeData {
  label: string;
  trailing: boolean;
  startedAt: number;
  targetPct: number;
  dailyDdPct: number;
  maxDdPct: number;
  canSeeBalances: boolean;
  accountSize: number | null;
  equity: number | null;
  peakEquity: number | null;
  dayStartEquity: number | null;
  metrics: ChallengeMetrics;
}

export interface ChallengeInput {
  label?: string;
  accountSize?: number;
  targetPct?: number;
  dailyDdPct?: number;
  maxDdPct?: number;
  trailing?: boolean;
  currentEquity?: number;
  peakEquity?: number;
  dayStartEquity?: number;
  startedAt?: number;
}

// What Claude read off an FTP/funded-account balance screenshot, returned with
// the refreshed challenge after the equity is set from it.
export interface ParsedAccount {
  balance: number | null;
  equity: number | null;
  summary: string;
}
export interface AnalyzeAccountResult {
  challenge: ChallengeData;
  parsed: ParsedAccount;
  model: string;
}

// ---- Trading — live OANDA account capital (mirror of apps/api/src/trading/capital.ts) ----
// Capital gained from trades over rolling windows (trade-only, so deposits and
// withdrawals never count as a gain).
export interface OandaPnl {
  daily: number; // since the start of today (Eastern Time)
  weekly: number; // last 7 days
  monthly: number; // last 30 days
}
export interface OandaCapitalAccount {
  connectionId: string;
  label: string;
  owner: string; // the trader who owns this broker connection
  currency: string;
  balance: number | null;
  nav: number | null; // balance + open P/L — the "capital" figure
  unrealizedPl: number | null;
  marginUsed: number | null;
  marginAvailable: number | null;
  openTradeCount: number | null;
  pnl: OandaPnl | null;
  ok: boolean;
  error: string | null;
}
export interface OandaCapital {
  configured: boolean;
  accounts: OandaCapitalAccount[];
  currency: string | null;
  balance: number | null;
  nav: number | null;
  unrealizedPl: number | null;
  pnl: OandaPnl | null;
  generatedAt: number;
}

// ---- Trading — Funded platforms (mirror of apps/api/src/trading/funded.ts) ----
export type FundedTradeStatus = 'open' | 'closed';
export interface FundedTrade {
  id: string;
  accountId: string;
  instrument: string;
  side: TradeSide;
  units: number;
  entryPrice: number | null;
  exitPrice: number | null;
  realizedPl: number | null;
  status: FundedTradeStatus; // 'open' = a live position shown on the Live Wall
  openedAt: number | null;
  closedAt: number | null;
  notes: string | null;
  createdAt: number;
}
export interface FundedAccount {
  id: string;
  platform: string;
  label: string;
  currency: string;
  balance: number | null;
  startingBalance: number | null;
  notes: string | null;
  realizedPl: number;
  tradeCount: number;
  pnl: OandaPnl; // capital gained from trades over today / 7d / 30d windows
  trades: FundedTrade[];
  createdAt: number;
  updatedAt: number;
}
export interface FundedData {
  accounts: FundedAccount[];
}
export interface FundedAccountInput {
  platform?: string;
  label?: string;
  currency?: string;
  balance?: number | null;
  startingBalance?: number | null;
  notes?: string | null;
}
export interface FundedTradeInput {
  instrument: string;
  side?: TradeSide;
  units?: number | null;
  entryPrice?: number | null;
  exitPrice?: number | null;
  realizedPl?: number | null;
  openedAt?: number | null;
  closedAt?: number | null;
  notes?: string | null;
}
// Result of importing trades from a funded-account screenshot.
export interface FundedImportResult {
  funded: FundedData;
  added: number;
  skipped: number; // duplicates of trades already on the account (by time + profit)
  ignored: number; // rows that weren't real trades (no instrument/P/L)
  balanceSet: number | null; // the account balance, when the screenshot showed one
  summary: string;
  model: string;
}
// Result of reading a single OPEN position off an active-trade screenshot and
// logging it as a live funded position (shown on the Live Wall).
export interface FundedPositionResult {
  funded: FundedData;
  parsed: {
    instrument: string | null;
    side: 'long' | 'short' | 'unknown';
    units: number | null;
    entryPrice: number | null;
    currentPrice: number | null;
    takeProfit: number | null;
    stopLoss: number | null;
    summary: string;
  };
  model: string;
}
// Result of closing an OPEN funded position from a trade-result screenshot: the
// trade is finalized with the exit price / P/L read off the image.
export interface FundedCloseResult {
  funded: FundedData;
  closed: boolean;
  result: { exitPrice: number | null; realizedPl: number | null; closedAt: number | null } | null;
  summary: string;
  model: string;
}

// ---- Personal Finance (mirror of apps/api/src/finance/service.ts) ----
export type FtpPhase = 'testing' | 'funded';
export type NetWorthKind = 'asset' | 'liability';

export interface FinanceOverview {
  month: string;
  monthLabel: string;
  todayDay: number;
  settings: { ftpPhase: FtpPhase; ftpDivisor: number; ftpPayoutPct: number };
  earnings: { kiaCommission: number; tradingReal: number; ftpRaw: number; ftpScaled: number; total: number };
  expenses: { total: number; paid: number; upcoming: number; count: number };
  net: number;
  billsCoveredPct: number;
  netWorth: { assets: number; liabilities: number; total: number };
}

export interface Expense {
  id: string;
  label: string;
  amount: number;
  dayOfMonth: number;
  category: string | null;
  active: boolean;
}

export interface NetWorthItem {
  id: string;
  label: string;
  amount: number;
  kind: NetWorthKind;
}

export interface NetWorthData {
  items: NetWorthItem[];
  assets: number;
  liabilities: number;
  total: number;
}

// ---- Trading — Strategy Sessions (mirror of apps/api/src/trading/sessions.ts) ----
export type SessionBias = 'bull' | 'bear' | 'both' | 'neutral';
export type SessionStatus = 'active' | 'opening' | 'idle';

export interface StrategySession {
  id: string;
  name: string;
  instrument: string | null;
  openTime: string;
  closeTime: string;
  timeframe: string | null;
  bias: SessionBias;
  bullPlan: string | null;
  bearPlan: string | null;
  notes: string | null;
  active: boolean;
  status: SessionStatus;
  minsToOpen: number | null;
}

export interface SessionInput {
  name?: string;
  instrument?: string | null;
  openTime?: string;
  closeTime?: string;
  timeframe?: string | null;
  bias?: SessionBias;
  bullPlan?: string | null;
  bearPlan?: string | null;
  notes?: string | null;
  active?: boolean;
}

// ---- Trading — Market News (mirror of apps/api/src/trading/news.ts) ----
export type NewsImpact = 'high' | 'medium' | 'low';
export type NewsBias = 'bullish' | 'bearish' | 'neutral';
export type NewsCategory = 'markets' | 'geopolitical' | 'economic' | 'crypto' | 'other';

export interface NewsItem {
  id: string;
  title: string;
  body: string | null;
  source: string | null;
  url: string | null;
  category: NewsCategory;
  impact: NewsImpact;
  bias: NewsBias;
  publishedAt: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  country: string | null;
  impact: NewsImpact;
  eventTime: number;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
}

export interface MarketNewsData {
  headlines: NewsItem[];
  calendar: CalendarEvent[];
}

export interface NewsInput {
  title?: string;
  body?: string | null;
  source?: string | null;
  url?: string | null;
  category?: NewsCategory;
  impact?: NewsImpact;
  bias?: NewsBias;
  publishedAt?: number;
}

export interface EventInput {
  title?: string;
  country?: string | null;
  impact?: NewsImpact;
  eventTime?: number;
  forecast?: string | null;
  previous?: string | null;
  actual?: string | null;
}

// ---- Trading — Trade Log (mirror of apps/api/src/trading/trades.ts) ----
export type TradeStatus = 'open' | 'closed';

export interface TradeRecord {
  id: string;
  ownerId: string; // the user who logged the trade
  owner: string; // that user's username, shown on the trade
  isMine: boolean; // the viewing user owns this trade (may edit/remove it)
  broker: string | null;
  instrument: string;
  side: TradeSide;
  status: TradeStatus;
  plannedEntry: number | null;
  entryPrice: number;
  exitPrice: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  units: number;
  slippage: number | null;
  realizedPl: number | null; // null only while open / unknown — shared with the desk
  strategy: string | null;
  timeframe: string | null;
  openedAt: number;
  closedAt: number | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
  editable: boolean; // hand-logged trades are editable; broker-imported rows are read-only
  source: 'manual' | 'broker'; // where the row came from
  code: string | null; // desk code MMDDYY-N
}

export interface TradeSummary {
  total: number;
  open: number;
  closed: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  totalRealizedPl: number | null;
  avgSlippage: number | null;
}

export interface TradeLogData {
  trades: TradeRecord[];
  summary: TradeSummary;
  breakEvenPct: number;
  breakEvenMode: BreakEvenMode;
  breakEvenAmount: number;
  breakEvenOverrides: BreakEvenOverride[];
}

// Raw data returned when a trade is removed, so the client can offer undo.
export interface RemovedTrade {
  id: string;
  broker: string | null;
  instrument: string;
  side: TradeSide;
  status: TradeStatus;
  plannedEntry: number | null;
  entryPrice: number;
  exitPrice: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  units: number;
  realizedPl: number | null;
  strategy: string | null;
  timeframe: string | null;
  openedAt: number;
  closedAt: number | null;
  notes: string | null;
  createdAt: number;
}

// ---- Trading — TradingView alerts (mirror of apps/api/src/trading/alerts.ts) ----
export type AlertStatus = 'new' | 'analyzed' | 'dismissed';

export interface TradeAnalysis {
  instrument: string | null;
  side: 'long' | 'short' | 'unknown';
  plannedEntry: number | null;
  actualFill: number | null;
  exit: number | null;
  slippage: string;
  setupQuality: string;
  risk: string;
  verdict: 'good' | 'acceptable' | 'poor' | 'unclear';
  summary: string;
}

export interface AnalyzeResult {
  raw: string;
  parsed: TradeAnalysis | null;
  model: string;
}

export interface AlertRecord {
  id: string;
  source: string;
  instrument: string | null;
  side: TradeSide | null;
  price: number | null;
  strategy: string | null;
  timeframe: string | null;
  message: string | null;
  status: AlertStatus;
  analysis: AnalyzeResult | null;
  analyzedAt: number | null;
  tradeId: string | null;
  receivedAt: number;
}

export interface AlertsData {
  alerts: AlertRecord[];
  aiConfigured: boolean;
}

// ---- Chat + announcements (mirror of apps/api/src/chat) ----
export type ChatChannel = 'trading' | 'general';
export interface ChatMessage {
  id: string;
  channel: ChatChannel;
  author: string;
  body: string;
  createdAt: number;
  mine: boolean;
}
export interface Announcement {
  id: string;
  author: string;
  title: string;
  body: string;
  createdAt: number;
}

// A Trump Truth Social post pulled by the live feed (mirror of
// apps/api/src/trading/feeds.ts TruthPostView).
export interface TruthPost {
  id: string;
  author: string;
  content: string;
  url: string | null;
  postedAt: number;
}

// Desk-wide trading signal the client polls to chime on a new TradingView alert
// (mirror of apps/api/src/trading/alerts.ts AlertSignal).
export interface TradingSignals {
  lastAlertAt: number | null;
  alertCount: number;
}

// ---- Trading — History (mirror of apps/api/src/trading/history.ts) ----
export interface HistoryRecord {
  id: string;
  ownerId: string; // the teammate whose account this closed trade was on
  owner: string; // that teammate's username, shown on the row
  isMine: boolean; // the viewing user owns this trade
  broker: string;
  instrument: string;
  side: TradeSide;
  units: number;
  plannedEntry: number | null;
  entryPrice: number;
  exitPrice: number | null;
  slippage: number | null;
  realizedPl: number | null;
  strategy: string | null;
  timeframe: string | null;
  openedAt: number | null;
  closedAt: number | null;
  code: string | null; // desk code MMDDYY-N
}

export interface HistoryGroup {
  label: string;
  count: number;
  wins: number;
  losses: number;
  breakeven: number;
  realizedPl: number | null;
  pips: number; // net entry→exit move across the group's forex trades, in pips
}

export interface HistorySummary {
  closed: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  totalRealizedPl: number | null;
  byStrategy: HistoryGroup[];
  byInstrument: HistoryGroup[];
}

export interface HistoryData {
  trades: HistoryRecord[];
  summary: HistorySummary;
  breakEvenPct: number;
  breakEvenMode: BreakEvenMode;
  breakEvenAmount: number;
  breakEvenOverrides: BreakEvenOverride[];
}

// Fields accepted when creating/editing a trade.
export interface TradeInput {
  broker?: string | null;
  instrument?: string;
  side?: TradeSide;
  status?: TradeStatus;
  plannedEntry?: number | null;
  entryPrice?: number;
  exitPrice?: number | null;
  takeProfit?: number | null;
  stopLoss?: number | null;
  units?: number;
  realizedPl?: number | null;
  strategy?: string | null;
  timeframe?: string | null;
  openedAt?: number;
  closedAt?: number | null;
  notes?: string | null;
}
