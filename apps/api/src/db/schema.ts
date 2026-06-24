import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';

// The four roles match the prototype's access matrix exactly.
export const ROLES = ['Admin', 'Trader', 'Sales', 'Viewer'] as const;
export type Role = (typeof ROLES)[number];

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  // The username the account was created with. Never changes when the user
  // renames themselves, so admins can always identify the account. Nullable
  // for rows created before this column existed (backfilled in migration).
  createdUsername: text('created_username'),
  displayName: text('display_name').notNull(),
  email: text('email'),
  passwordHash: text('password_hash').notNull(),
  // Legacy single-role column. Superseded by `roles` (JSON array) below and no
  // longer read by the app; kept with its default so old rows stay valid.
  role: text('role', { enum: ROLES }).notNull().default('Viewer'),
  // Granular, admin-assigned roles as a JSON array of role keys
  // (see auth/rbac.ts ROLE_KEYS), e.g. ["admin"] or ["sales","studies"].
  roles: text('roles'),
  // Brokerage balances are hidden by default. This flag is the dedicated
  // grant required to view balances and account detail (Stage 2 onward).
  viewBrokerage: integer('view_brokerage', { mode: 'boolean' })
    .notNull()
    .default(false),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  mustChangePassword: integer('must_change_password', { mode: 'boolean' })
    .notNull()
    .default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

// Server-side sessions. The cookie holds a random token; we store only the
// SHA-256 hash of it here, so a database leak does not expose live sessions.
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), // sha256(token)
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
  userAgent: text('user_agent'),
});

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;

// ---- To Do List ----
// Section render/behavior types, mirroring the prototype:
//   one     - one-time checkbox tasks
//   note    - reflective notes shown as bullet dots (Life Changes), not checkable
//   daily   - daily reference list shown as dashes, not checkable
//   routine - recurring checkbox tasks with a reset interval and due date
//   deals   - working deals (Kia), placeholder section
export const SECTION_TYPES = ['one', 'note', 'daily', 'routine', 'deals'] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const todoSections = sqliteTable('todo_sections', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  n: integer('n').notNull(), // section number shown to the user
  icon: text('icon').notNull(),
  title: text('title').notNull(),
  type: text('type', { enum: SECTION_TYPES }).notNull(),
  tag: text('tag'), // 'kia' | 'trading' | null — for cross-listing in those workspaces
  life: integer('life', { mode: 'boolean' }).notNull().default(false),
  position: integer('position').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const todoItems = sqliteTable('todo_items', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  sectionId: text('section_id')
    .notNull()
    .references(() => todoSections.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  position: integer('position').notNull(),
  hyphen: integer('hyphen', { mode: 'boolean' }).notNull().default(false),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  // Recurring tasks only: dueAt is the next due date (stored as UTC midnight
  // of the Eastern-Time calendar day); intervalDays is the reset interval.
  dueAt: integer('due_at', { mode: 'timestamp_ms' }),
  intervalDays: integer('interval_days'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export type TodoSectionRow = typeof todoSections.$inferSelect;
export type TodoItemRow = typeof todoItems.$inferSelect;

// ---- Kia Sales ----
// Per-user Kia settings: the legacy goal/review fallback plus the editable pay
// plan (commission rate, bonus tiers, and the review requirement).
export const kiaSettings = sqliteTable('kia_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  goalUnits: integer('goal_units').notNull().default(12),
  reviewCount: integer('review_count').notNull().default(5),
  // Pay plan ----------------------------------------------------------------
  // 'total' = one rate on each deal's total profit (front+back, the default);
  // 'split' = separate rates on front-end and back-end profit.
  commissionMode: text('commission_mode', { enum: ['total', 'split'] })
    .notNull()
    .default('total'),
  // Commission stored in basis points (1350 = 13.5%) to avoid float drift.
  commissionBp: integer('commission_bp').notNull().default(1350),
  commissionFrontBp: integer('commission_front_bp').notNull().default(0),
  commissionBackBp: integer('commission_back_bp').notNull().default(0),
  // Minimum commission per deal in whole US dollars (a "mini"): when the
  // percentage on a thin deal comes out lower, the salesperson still earns
  // this floor. Defaults to $200.
  miniAmount: integer('mini_amount').notNull().default(200),
  // Whether the unit bonus requires a minimum review percentage at all.
  reviewRequired: integer('review_required', { mode: 'boolean' }).notNull().default(true),
  reviewReqPct: integer('review_req_pct').notNull().default(50),
  // JSON array of { units, amount } bonus tiers; null falls back to defaults.
  bonusTiers: text('bonus_tiers'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

// Per-month goal and review count, so each month's dashboard stands on its own.
export const kiaMonthSettings = sqliteTable(
  'kia_month_settings',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    month: text('month').notNull(), // 'YYYY-MM' (Eastern Time)
    goalUnits: integer('goal_units').notNull().default(12),
    reviewCount: integer('review_count').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.month] }) }),
);

export const kiaDeals = sqliteTable('kia_deals', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  customer: text('customer').notNull(),
  model: text('model').notNull(),
  type: text('type', { enum: ['New', 'Used'] }).notNull(),
  profit: integer('profit').notNull(), // total profit (front+back), whole US dollars
  // Optional front/back split, used by split-commission pay plans. Null when
  // the deal was entered as a single total.
  frontProfit: integer('front_profit'),
  backProfit: integer('back_profit'),
  soldAt: integer('sold_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export type KiaSettingsRow = typeof kiaSettings.$inferSelect;
export type KiaMonthSettingsRow = typeof kiaMonthSettings.$inferSelect;
export type KiaDealRow = typeof kiaDeals.$inferSelect;

// ---- Vitalis Wealth Management ----
// Per-user client list for the advisory practice. Like every other workspace,
// each row is keyed by userId so a new user's list starts empty. Account value
// is stored as whole US dollars (integer); contact fields are optional.
export const WEALTH_CLIENT_STATUSES = ['prospect', 'onboarding', 'active', 'inactive'] as const;
export type WealthClientStatus = (typeof WEALTH_CLIENT_STATUSES)[number];

export const wealthClients = sqliteTable('wealth_clients', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  // Assets under management for this client, in whole US dollars. Null when
  // not yet known (e.g. a prospect).
  accountValue: integer('account_value'),
  status: text('status', { enum: WEALTH_CLIENT_STATUSES }).notNull().default('prospect'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export type WealthClientRow = typeof wealthClients.$inferSelect;

// ---- Trading — Trade Log ----
// Per-user record of trades (the trader's own log), keyed by userId so a new
// user starts empty. Prices and sizes are stored as reals (forex/crypto prices
// need decimals, so the whole-dollar integer convention used for Kia/Wealth
// does not apply here); realized P/L is a real in account currency. The planned
// (alert) entry is what the broker position feed cannot supply — it is recorded
// here so slippage (entry vs. plan) can be computed for the Trade Log.
export const TRADE_SIDES = ['long', 'short'] as const;
export type TradeSide = (typeof TRADE_SIDES)[number];
export const TRADE_STATUSES = ['open', 'closed'] as const;
export type TradeStatus = (typeof TRADE_STATUSES)[number];

export const tradingTrades = sqliteTable('trading_trades', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  broker: text('broker'), // one of the broker keys, or null for a manual entry
  instrument: text('instrument').notNull(),
  side: text('side', { enum: TRADE_SIDES }).notNull().default('long'),
  status: text('status', { enum: TRADE_STATUSES }).notNull().default('closed'),
  plannedEntry: real('planned_entry'), // the alert/intended price; null if none
  entryPrice: real('entry_price').notNull(), // actual average fill
  exitPrice: real('exit_price'), // null while the trade is open
  takeProfit: real('take_profit'),
  stopLoss: real('stop_loss'),
  units: real('units').notNull().default(0), // lots / contracts / shares
  realizedPl: real('realized_pl'), // account currency; null while open / unknown
  strategy: text('strategy'),
  timeframe: text('timeframe'),
  openedAt: integer('opened_at', { mode: 'timestamp_ms' }).notNull(),
  closedAt: integer('closed_at', { mode: 'timestamp_ms' }),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export type TradingTradeRow = typeof tradingTrades.$inferSelect;

// ---- Trading — TradingView alerts (the FTP/prop replacement) ----
// FTP/Match-Trader has no usable API, so prop trades come in as TradingView
// alert webhooks instead. Each alert is stored here (attributed to the owner),
// the owner pastes a chart screenshot, and Claude (Opus 4.8 vision) analyzes
// it — optionally auto-creating a trading_trades row. Status walks
// new → analyzed (or dismissed).
export const ALERT_STATUSES = ['new', 'analyzed', 'dismissed'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const tradingAlerts = sqliteTable('trading_alerts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  source: text('source').notNull().default('tradingview'),
  instrument: text('instrument'),
  side: text('side', { enum: TRADE_SIDES }),
  price: real('price'), // the alert/intended price
  strategy: text('strategy'),
  timeframe: text('timeframe'),
  message: text('message'), // human-readable alert text
  payload: text('payload'), // raw JSON the webhook received
  status: text('status', { enum: ALERT_STATUSES }).notNull().default('new'),
  analysis: text('analysis'), // Claude's analysis JSON, null until analyzed
  analyzedAt: integer('analyzed_at', { mode: 'timestamp_ms' }),
  tradeId: text('trade_id'), // the trading_trades row this created, if any
  receivedAt: integer('received_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export type TradingAlertRow = typeof tradingAlerts.$inferSelect;

// ---- TradingView webhook ingestion (raw alert store) ----
// Standalone landing table for alerts posted to POST /api/tv-webhook. Not keyed
// to a user — it is a raw ingestion log. The parsed trade fields are captured
// alongside the full raw payload exactly as received.
export const tvAlerts = sqliteTable('tv_alerts', {
  id: text('id').primaryKey(),
  strategy: text('strategy'),
  symbol: text('symbol'),
  side: text('side'),
  entry: real('entry'),
  takeProfit: real('take_profit'),
  stopLoss: real('stop_loss'),
  alertPrice: real('alert_price'),
  alertTime: text('alert_time'), // the alert's own time, as TradingView sent it
  receivedAt: integer('received_at', { mode: 'timestamp_ms' }).notNull(),
  payload: text('payload').notNull(), // the raw request body, verbatim
});

export type TvAlertRow = typeof tvAlerts.$inferSelect;

// ---- Trading — broker positions & History ----
// Snapshot of the open positions shown on the Live Wall (which streams live and
// stores nothing), so closures can be detected: each Live Wall refresh upserts
// the open rows, and any row whose broker still responded but is no longer
// present is flipped to 'closed' — auto-populating History. Keyed to the owner
// (the admin account holder). Exit price / realized P/L are the last values
// seen while the position was open (approximate; can be reconciled against a
// broker's closed-trade history later).
export const POSITION_STATUSES = ['open', 'closed'] as const;
export type PositionStatus = (typeof POSITION_STATUSES)[number];

export const tradingPositions = sqliteTable('trading_positions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  key: text('key').notNull(), // `${broker}:${brokerTradeId}` — identifies the position
  broker: text('broker').notNull(),
  instrument: text('instrument').notNull(),
  side: text('side', { enum: TRADE_SIDES }).notNull().default('long'),
  units: real('units').notNull().default(0),
  plannedEntry: real('planned_entry'),
  entryPrice: real('entry_price').notNull(),
  takeProfit: real('take_profit'),
  stopLoss: real('stop_loss'),
  currentPrice: real('current_price'), // last seen mark while open
  unrealizedPl: real('unrealized_pl'), // last seen open P/L while open
  exitPrice: real('exit_price'), // set on close (= last currentPrice)
  realizedPl: real('realized_pl'), // set on close (= last unrealizedPl)
  strategy: text('strategy'),
  timeframe: text('timeframe'),
  status: text('status', { enum: POSITION_STATUSES }).notNull().default('open'),
  openedAt: integer('opened_at', { mode: 'timestamp_ms' }),
  firstSeenAt: integer('first_seen_at', { mode: 'timestamp_ms' }).notNull(),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
  closedAt: integer('closed_at', { mode: 'timestamp_ms' }),
  // The broker connection this position came from — the "source" used by the
  // close reconciler (a position only closes if its source responded).
  connectionId: text('connection_id'),
});

export type TradingPositionRow = typeof tradingPositions.$inferSelect;

// ---- Per-user broker connections (encrypted credentials) ----
// Each trader attaches their own broker API keys as a named connection (e.g.
// "Andrew's Trades"). Credentials are stored AES-256-GCM encrypted in
// `secret_enc`; `summary` holds a non-secret display hint only. The Live Wall
// and History are driven by the calling user's active connections.
export const BROKER_CONNECTION_KINDS = ['oanda', 'kraken'] as const;
export type BrokerConnectionKind = (typeof BROKER_CONNECTION_KINDS)[number];

export const brokerConnections = sqliteTable('broker_connections', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  broker: text('broker', { enum: BROKER_CONNECTION_KINDS }).notNull(),
  label: text('label').notNull(),
  secretEnc: text('secret_enc').notNull(), // encrypted JSON of the credentials
  summary: text('summary'), // non-secret hint, e.g. "Practice · 001-…-001"
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  lastStatus: text('last_status', { enum: ['unknown', 'ok', 'error'] })
    .notNull()
    .default('unknown'),
  lastError: text('last_error'),
  lastCheckedAt: integer('last_checked_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export type BrokerConnectionRow = typeof brokerConnections.$inferSelect;

// ---- Trading — prop-firm challenge (Account Metrics) ----
// One challenge per user (the FTP-style funded-account challenge). Drawdown and
// target percentages are stored as basis points (1000 = 10%); money is stored
// as reals (challenge equity is tracked to the cent). Equity is maintained by
// the trader (FTP has no API) or pulled from the Trade Log.
export const tradingChallenges = sqliteTable('trading_challenges', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  label: text('label').notNull().default('FTP Challenge'),
  accountSize: real('account_size').notNull().default(200000),
  targetBp: integer('target_bp').notNull().default(1000), // profit target, 10%
  dailyDdBp: integer('daily_dd_bp').notNull().default(400), // daily drawdown, 4%
  maxDdBp: integer('max_dd_bp').notNull().default(600), // max/trailing drawdown, 6%
  trailing: integer('trailing', { mode: 'boolean' }).notNull().default(true),
  currentEquity: real('current_equity').notNull().default(200000),
  peakEquity: real('peak_equity').notNull().default(200000), // for trailing DD
  dayStartEquity: real('day_start_equity').notNull().default(200000), // for daily DD
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export type TradingChallengeRow = typeof tradingChallenges.$inferSelect;

// ---- Personal Finance ----
// Per-user settings for how Funded Trading Plus (a simulation) earnings scale
// into real take-home. Testing phase: simulated P/L ÷ divisor (18 by default).
// Funded phase: P/L × payout (80% by default).
export const FTP_PHASES = ['testing', 'funded'] as const;
export type FtpPhase = (typeof FTP_PHASES)[number];

export const financeSettings = sqliteTable('finance_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  ftpPhase: text('ftp_phase', { enum: FTP_PHASES }).notNull().default('testing'),
  ftpDivisor: real('ftp_divisor').notNull().default(18),
  ftpPayoutBp: integer('ftp_payout_bp').notNull().default(8000), // 80%
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

// Recurring monthly expenses, each with the day of month it leaves the bank.
export const financeExpenses = sqliteTable('finance_expenses', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  amount: real('amount').notNull().default(0),
  dayOfMonth: integer('day_of_month').notNull().default(1), // 1–31
  category: text('category'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

// Net-worth line items: assets (positive contribution) and liabilities.
export const NET_WORTH_KINDS = ['asset', 'liability'] as const;
export type NetWorthKind = (typeof NET_WORTH_KINDS)[number];

export const financeNetWorth = sqliteTable('finance_net_worth', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  amount: real('amount').notNull().default(0), // stored positive; kind sets sign
  kind: text('kind', { enum: NET_WORTH_KINDS }).notNull().default('asset'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export type FinanceSettingsRow = typeof financeSettings.$inferSelect;
export type FinanceExpenseRow = typeof financeExpenses.$inferSelect;
export type FinanceNetWorthRow = typeof financeNetWorth.$inferSelect;

// ---- Trading — Strategy Sessions ----
// Per-user trading-session windows (e.g. London Open) with a bias and bull/bear
// playbooks per instrument. Times are 'HH:MM' in Eastern Time; status (active /
// opening / idle) is computed from the current ET time.
export const SESSION_BIASES = ['bull', 'bear', 'both', 'neutral'] as const;
export type SessionBias = (typeof SESSION_BIASES)[number];

export const tradingSessions = sqliteTable('trading_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  instrument: text('instrument'),
  openTime: text('open_time').notNull().default('09:30'), // ET 'HH:MM'
  closeTime: text('close_time').notNull().default('11:00'),
  timeframe: text('timeframe'),
  bias: text('bias', { enum: SESSION_BIASES }).notNull().default('neutral'),
  bullPlan: text('bull_plan'),
  bearPlan: text('bear_plan'),
  notes: text('notes'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export type TradingSessionRow = typeof tradingSessions.$inferSelect;

// ---- Market News (a shared desk feed: headlines + economic calendar) ----
// Unlike the per-user trading data, news and calendar events are shared across
// all traders. Anyone in the Trading workspace can read them; only writers
// (not trading_viewer) can post or edit. authorId is nullable and set to NULL
// when its author is deleted, so the shared feed survives.
export const NEWS_IMPACTS = ['high', 'medium', 'low'] as const;
export type NewsImpact = (typeof NEWS_IMPACTS)[number];
export const NEWS_BIASES = ['bullish', 'bearish', 'neutral'] as const;
export type NewsBias = (typeof NEWS_BIASES)[number];
export const NEWS_CATEGORIES = ['markets', 'geopolitical', 'economic', 'crypto', 'other'] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export const tradingNews = sqliteTable('trading_news', {
  id: text('id').primaryKey(),
  authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  body: text('body'),
  source: text('source'),
  url: text('url'),
  category: text('category', { enum: NEWS_CATEGORIES }).notNull().default('markets'),
  impact: text('impact', { enum: NEWS_IMPACTS }).notNull().default('medium'),
  bias: text('bias', { enum: NEWS_BIASES }).notNull().default('neutral'),
  publishedAt: integer('published_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type TradingNewsRow = typeof tradingNews.$inferSelect;

export const tradingCalendar = sqliteTable('trading_calendar', {
  id: text('id').primaryKey(),
  authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  country: text('country'),
  impact: text('impact', { enum: NEWS_IMPACTS }).notNull().default('medium'),
  eventTime: integer('event_time', { mode: 'timestamp_ms' }).notNull(), // displayed in ET
  forecast: text('forecast'),
  previous: text('previous'),
  actual: text('actual'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type TradingCalendarRow = typeof tradingCalendar.$inferSelect;

// ---- Wealth — Model Portfolios & target allocations (per advisor) ----
// A model portfolio is a named target allocation an advisor maintains; each
// allocation row is a sleeve (asset class / holding) with a target weight in
// basis points (10000 = 100%). Both are scoped to the owning user.
export const PORTFOLIO_RISKS = [
  'conservative',
  'moderate_conservative',
  'moderate',
  'moderate_aggressive',
  'aggressive',
] as const;
export type PortfolioRisk = (typeof PORTFOLIO_RISKS)[number];

export const ASSET_CLASSES = [
  'us_equity',
  'intl_equity',
  'fixed_income',
  'real_assets',
  'cash',
  'alternative',
  'other',
] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export const wealthPortfolios = sqliteTable('wealth_portfolios', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  risk: text('risk', { enum: PORTFOLIO_RISKS }).notNull().default('moderate'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type WealthPortfolioRow = typeof wealthPortfolios.$inferSelect;

export const wealthAllocations = sqliteTable('wealth_allocations', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  portfolioId: text('portfolio_id')
    .notNull()
    .references(() => wealthPortfolios.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  assetClass: text('asset_class', { enum: ASSET_CLASSES }).notNull().default('other'),
  targetBp: integer('target_bp').notNull().default(0), // basis points; 10000 = 100%
  position: integer('position').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export type WealthAllocationRow = typeof wealthAllocations.$inferSelect;

// ---- Wealth — Planning (retirement projection scenarios, per advisor) ----
// A scenario stores the inputs of a retirement projection; the math is computed
// on read. Money is whole US dollars; rates are basis points (600 = 6.00%).
// clientId optionally ties a scenario to a client (loose link, no FK).
export const wealthPlans = sqliteTable('wealth_plans', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  clientId: text('client_id'),
  currentAge: integer('current_age').notNull().default(35),
  retirementAge: integer('retirement_age').notNull().default(65),
  endAge: integer('end_age').notNull().default(90),
  currentSavings: integer('current_savings').notNull().default(0),
  annualContribution: integer('annual_contribution').notNull().default(0),
  returnBp: integer('return_bp').notNull().default(600),
  inflationBp: integer('inflation_bp').notNull().default(250),
  incomeGoal: integer('income_goal').notNull().default(60000),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type WealthPlanRow = typeof wealthPlans.$inferSelect;

// ---- Wealth — Compliance (RIA recordkeeping register, per advisor) ----
// Each row is a compliance obligation/record (a filing, disclosure, policy,
// client document, or review) with a status and optional due date. Overdue is
// derived (status != complete and dueAt in the past). clientId is a loose link.
export const COMPLIANCE_CATEGORIES = ['filing', 'disclosure', 'policy', 'client_doc', 'review', 'other'] as const;
export type ComplianceCategory = (typeof COMPLIANCE_CATEGORIES)[number];
export const COMPLIANCE_STATUSES = ['not_started', 'in_progress', 'complete'] as const;
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

export const wealthCompliance = sqliteTable('wealth_compliance', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  category: text('category', { enum: COMPLIANCE_CATEGORIES }).notNull().default('filing'),
  title: text('title').notNull(),
  status: text('status', { enum: COMPLIANCE_STATUSES }).notNull().default('not_started'),
  dueAt: integer('due_at', { mode: 'timestamp_ms' }),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  clientId: text('client_id'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type WealthComplianceRow = typeof wealthCompliance.$inferSelect;

// ---- Chat & Announcements ----
// A shared desk chat with two channels: 'trading' (gated to the Trading
// workspace) and 'general' (any signed-in user). Messages denormalize the
// author's display name so the feed survives a later rename. Announcements are
// a separate, admin-managed broadcast list shown to everyone.
export const chatMessages = sqliteTable('chat_messages', {
  id: text('id').primaryKey(),
  channel: text('channel').notNull(), // 'trading' | 'general'
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  author: text('author').notNull(), // denormalized display name
  body: text('body').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export type ChatMessageRow = typeof chatMessages.$inferSelect;

export const announcements = sqliteTable('announcements', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  author: text('author').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export type AnnouncementRow = typeof announcements.$inferSelect;

// ---- AI usage (per-user guardrails) ----
// One row per Claude call, used to enforce a monthly cap. `kind` records which
// feature made the call (ask, kia, analyze, news_brief, todo_command, ...).
export const aiUsage = sqliteTable('ai_usage', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export type AiUsageRow = typeof aiUsage.$inferSelect;
