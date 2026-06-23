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
  | 'wealth';

// Matches the backend's PublicUser shape (auth/rbac.ts).
export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  roles: RoleKey[];
  viewBrokerage: boolean;
  mustChangePassword: boolean;
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
}

export interface KiaDashboard {
  month: string; // the month currently shown, 'YYYY-MM'
  months: KiaMonthOption[]; // selectable months, newest first
  history: KiaMonthSummary[]; // per-month totals, newest first
  deals: KiaDeal[];
  metrics: KiaMetrics;
  settings: { goalUnits: number; reviewCount: number };
  payPlan: KiaPayPlan;
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

export interface LiveTrade {
  id: string;
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
  slippage: number | null;
  unrealizedPl: number | null; // null when balances are hidden
  strategy: string | null;
  timeframe: string | null;
  openedAt: number | null;
}

export interface BrokerLiveResult {
  connectionId: string;
  broker: BrokerKey;
  name: string;
  platform: string;
  kind: string;
  configured: boolean;
  ok: boolean;
  error: string | null;
  count: number;
}

export interface LiveWall {
  source: 'live' | 'sample';
  generatedAt: number;
  canSeeBalances: boolean;
  brokers: BrokerLiveResult[];
  trades: LiveTrade[];
  note: string | null;
}

// ---- Trading — broker connections (mirror of apps/api/src/trading/connections.ts) ----
export type BrokerConnectionKind = 'oanda' | 'kraken';

export interface BrokerConnection {
  id: string;
  broker: BrokerConnectionKind;
  label: string;
  summary: string | null;
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

// ---- Trading — Trade Log (mirror of apps/api/src/trading/trades.ts) ----
export type TradeStatus = 'open' | 'closed';

export interface TradeRecord {
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
  slippage: number | null;
  realizedPl: number | null; // null when balances are hidden
  strategy: string | null;
  timeframe: string | null;
  openedAt: number;
  closedAt: number | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TradeSummary {
  total: number;
  open: number;
  closed: number;
  wins: number;
  losses: number;
  winRate: number;
  totalRealizedPl: number | null;
  avgSlippage: number | null;
}

export interface TradeLogData {
  trades: TradeRecord[];
  summary: TradeSummary;
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

// ---- Trading — History (mirror of apps/api/src/trading/history.ts) ----
export interface HistoryRecord {
  id: string;
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
}

export interface HistoryGroup {
  label: string;
  count: number;
  wins: number;
  losses: number;
  realizedPl: number | null;
}

export interface HistorySummary {
  closed: number;
  wins: number;
  losses: number;
  winRate: number;
  totalRealizedPl: number | null;
  byStrategy: HistoryGroup[];
  byInstrument: HistoryGroup[];
}

export interface HistoryData {
  trades: HistoryRecord[];
  summary: HistorySummary;
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
