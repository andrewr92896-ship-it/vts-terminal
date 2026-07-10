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
  // UI preference: whether the salesperson has hidden the dollar figures
  // (profit/commission) on their dashboard. Stored per account so the choice
  // follows them across devices and survives tab switches.
  hideComm: integer('hide_comm', { mode: 'boolean' }).notNull().default(false),
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
  trailingStopLoss: real('trailing_stop_loss'), // trailing-stop trigger price, when the broker reports one
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
export const BROKER_CONNECTION_KINDS = ['oanda', 'kraken', 'manual'] as const;
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

// ---- Trading: manual broker positions ----
// A "manual" broker connection has no API credentials; the trader enters their
// open positions by hand and they render on the Live Wall exactly like a
// broker-streamed position (with the same forex pip math). Each row belongs to
// one manual connection (and its owner). Prices and sizes are reals, matching
// the rest of the Trading tables.
export const manualPositions = sqliteTable('manual_positions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  connectionId: text('connection_id')
    .notNull()
    .references(() => brokerConnections.id, { onDelete: 'cascade' }),
  instrument: text('instrument').notNull(),
  side: text('side', { enum: TRADE_SIDES }).notNull().default('long'),
  units: real('units').notNull().default(0),
  entryPrice: real('entry_price').notNull(),
  currentPrice: real('current_price'), // latest mark, when the trader supplies it
  takeProfit: real('take_profit'),
  stopLoss: real('stop_loss'),
  trailingStopLoss: real('trailing_stop_loss'), // trailing-stop trigger price, when supplied
  plannedEntry: real('planned_entry'), // the alert/intended price; null if none
  openedAt: integer('opened_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export type ManualPositionRow = typeof manualPositions.$inferSelect;

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

// ---- Trading — desk-wide settings (shared across the whole trading team) ----
// A single-row table (id = 'desk') holding settings that apply to the shared
// desk, not to one trader. `breakEvenPct` is the break-even band as a percent of
// price move (entry → exit): a closed trade whose move is within ±breakEvenPct
// counts as a break-even trade — neither a win nor a loss. 0 disables the band,
// so every scored trade is a win or a loss exactly as before.
export const tradingDeskSettings = sqliteTable('trading_desk_settings', {
  id: text('id').primaryKey(),
  breakEvenPct: real('break_even_pct').notNull().default(0),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type TradingDeskSettingsRow = typeof tradingDeskSettings.$inferSelect;

// ---- Trading — Funded platforms (manual / screenshot-tracked prop accounts) ----
// Funded prop accounts (FTP and other funded platforms) are tracked separately
// from the Live Wall / Trade Log because they have no usable API: the trader
// keeps the balance current by hand and logs trades from screenshots Claude
// parses. Each account belongs to one user. Balance is a real in account
// currency; null until the trader sets it.
export const fundedAccounts = sqliteTable('funded_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull().default('FTP'), // e.g. "FTP", "Topstep", "Apex"
  label: text('label').notNull(), // the trader's name for this account
  currency: text('currency').notNull().default('USD'),
  balance: real('balance'), // current account balance, kept current by hand
  startingBalance: real('starting_balance'), // the account's funded size
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type FundedAccountRow = typeof fundedAccounts.$inferSelect;

// A funded trade is either a completed/closed trade (the default — logged from a
// trade-history screenshot or by hand) or a still-OPEN position (read off an
// active-trade screenshot) that we mark live on the Live Wall against the desk's
// OANDA price until it's closed.
export const FUNDED_TRADE_STATUSES = ['open', 'closed'] as const;
export type FundedTradeStatus = (typeof FUNDED_TRADE_STATUSES)[number];

// One trade on a funded account, entered by hand or read off a screenshot by
// Claude. `dedupKey` is a stable hash of the trade's identifying fields so
// re-posting the same screenshot does not double-log a trade (a unique index on
// (account_id, dedup_key) backs an upsert-ignore).
export const fundedTrades = sqliteTable('funded_trades', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id')
    .notNull()
    .references(() => fundedAccounts.id, { onDelete: 'cascade' }),
  instrument: text('instrument').notNull(),
  side: text('side', { enum: TRADE_SIDES }).notNull().default('long'),
  units: real('units').notNull().default(0),
  entryPrice: real('entry_price'),
  exitPrice: real('exit_price'),
  realizedPl: real('realized_pl'),
  // 'open' = a live position tracked on the Live Wall; 'closed' = a completed
  // trade. Defaults to 'closed' so every existing row stays a historical trade.
  status: text('status', { enum: FUNDED_TRADE_STATUSES }).notNull().default('closed'),
  openedAt: integer('opened_at', { mode: 'timestamp_ms' }),
  closedAt: integer('closed_at', { mode: 'timestamp_ms' }),
  dedupKey: text('dedup_key').notNull(),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export type FundedTradeRow = typeof fundedTrades.$inferSelect;

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

// ---- Truth Social feed (best-effort poll of a single public account) ----
// A scheduled poller mirrors the latest public posts into this table so the
// Market News area can show them. externalId is the upstream status id and is
// used to dedupe across polls; content is plain text (HTML stripped).
export const truthPosts = sqliteTable('truth_posts', {
  id: text('id').primaryKey(),
  externalId: text('external_id').notNull(),
  author: text('author').notNull(),
  content: text('content').notNull(),
  url: text('url'),
  postedAt: integer('posted_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export type TruthPostRow = typeof truthPosts.$inferSelect;

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

// ---- Studies: learned flashcard terms (per user) ----
// One row per vocabulary term the user has marked as known, so their flashcard
// progress follows them across devices. The client also keeps a local copy for
// instant feedback and offline use.
export const studyLearned = sqliteTable('study_learned', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  term: text('term').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export type StudyLearnedRow = typeof studyLearned.$inferSelect;

// ---- Studies: custom flashcard terms (per user) ----
// Words the user added to their own flashcard deck. The definition is generated
// by the study tutor (Claude) when the word is added, and the topic places it
// under one of the four Series 65 areas so the deck's topic filter still works.
// Synced per user so a custom deck follows the learner across devices.
export const studyVocab = sqliteTable('study_vocab', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  term: text('term').notNull(),
  def: text('def').notNull(),
  topic: text('topic').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export type StudyVocabRow = typeof studyVocab.$inferSelect;

// ---- Studies: starred quiz questions (per user) ----
// One row per Study Game question the learner flagged to revisit. The question
// id refers to the static Series 65 question bank (series65Questions.ts). Synced
// per user so the starred set follows the learner across devices.
export const studyStarred = sqliteTable('study_starred', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  questionId: integer('question_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export type StudyStarredRow = typeof studyStarred.$inferSelect;

// ---- Studies: custom quiz subsections (per user) ----
// A learner-defined focus area within the Study Game (e.g. "Bonds",
// "Compliance"). When the subsection is created, Claude classifies the static
// Series 65 question bank and the matching question ids are stored here as a
// JSON array of integers, so the subsection can be drilled like any built-in
// category and syncs across devices. `questionIds` refers to ids in the static
// bank (web: series65Questions.ts).
export const studySections = sqliteTable('study_sections', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  questionIds: text('question_ids').notNull(), // JSON array of ints
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export type StudySectionRow = typeof studySections.$inferSelect;

// ---- Web Push subscriptions (per user, per device) ----
// One row per browser/device the user has opted into phone push from. The
// endpoint is the unique push URL; p256dh/auth are the client's encryption keys
// (all non-secret to us — they only let our server reach that one device). A
// user can have several (phone, laptop). Pruned when the push service reports
// the subscription is gone.
export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;

// ---- Pushover (per user) ----
// One row per user who has connected Pushover for trade/alert notifications with
// a custom sound. Stores only their Pushover "user key" (not a secret to us —
// it just addresses their devices through our application token).
export const pushoverUsers = sqliteTable('pushover_users', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  userKey: text('user_key').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export type PushoverUserRow = typeof pushoverUsers.$inferSelect;

// One row per user holding the serialized Study Game state (per-category levels,
// scores, and answer history), so quiz progress follows the learner across
// devices instead of living only in that browser's localStorage.
export const studyGame = sqliteTable('study_game', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  state: text('state').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type StudyGameRow = typeof studyGame.$inferSelect;

// ---- Studies: completed mock tests (per user) ----
// One row per finished Series 65 mock test (a fixed 100-question exam drawn to
// the real exam blueprint: 25 Investments, 30 Client Management, 30 Regulations
// & Ethics, 15 Economics). Each row records the final score and the learner's
// attempt number (their Nth completed test), so the test leaderboard can show a
// player's best run and at which attempt they got it. `breakdown` is a JSON map
// of per-topic { correct, total }.
export const studyTests = sqliteTable('study_tests', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  attempt: integer('attempt').notNull(), // 1-indexed: this user's Nth completed test
  score: integer('score').notNull(), // percent correct, 0..100
  correct: integer('correct').notNull(),
  total: integer('total').notNull(),
  breakdown: text('breakdown').notNull(), // JSON: { [topic]: { correct, total } }
  passed: integer('passed', { mode: 'boolean' }).notNull(),
  durationMs: integer('duration_ms'), // wall-clock time to complete, when recorded
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export type StudyTestRow = typeof studyTests.$inferSelect;
