import { sqliteTable, text, integer, real, primaryKey, unique } from 'drizzle-orm/sqlite-core';

// The four roles match the prototype's access matrix exactly.
export const ROLES = ['Admin', 'Trader', 'Sales', 'Viewer'] as const;
export type Role = (typeof ROLES)[number];

// ---- Trading teams ----
// Admin-managed groups a trader belongs to. Each user is a member of at most one
// team (users.team_id below). Teams partition the shared portal into competing
// desks: the Studies leaderboards rank a learner only against their own team,
// while the Trading data (Live Wall presets, Trade Desk, alerts, sessions,
// funded, etc.) stays shared across every team. Only admins create/rename/delete
// teams and assign members. The default team ("Vitalis Trading Team") is seeded
// on boot; see teams/service.ts DEFAULT_TEAM_ID.
export const tradingTeams = sqliteTable('trading_teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type TradingTeamRow = typeof tradingTeams.$inferSelect;

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  // The username the account was created with. Never changes when the user
  // renames themselves, so admins can always identify the account. Nullable
  // for rows created before this column existed (backfilled in migration).
  createdUsername: text('created_username'),
  displayName: text('display_name').notNull(),
  email: text('email'),
  // Optional profile picture, stored as a small data URL (a client-resized
  // JPEG/PNG, ~128px). Null when the user has not set one — the UI then falls
  // back to their initial. Kept inline (no object store) since the portal is a
  // single-service deploy with no blob storage configured.
  avatar: text('avatar'),
  passwordHash: text('password_hash').notNull(),
  // Legacy single-role column. Superseded by `roles` (JSON array) below and no
  // longer read by the app; kept with its default so old rows stay valid.
  role: text('role', { enum: ROLES }).notNull().default('Viewer'),
  // Granular, admin-assigned roles as a JSON array of role keys
  // (see auth/rbac.ts ROLE_KEYS), e.g. ["admin"] or ["sales","studies"].
  roles: text('roles'),
  // The trading team this user belongs to (trading_teams.id), or null for none.
  // Admin-assigned. Scopes both the Studies leaderboards and all trade data (Live
  // Wall, Trade Log, History, broker capital) to teammates — a user sees only
  // their own team's trades, or just their own when they have no team.
  teamId: text('team_id'),
  // Admin-assigned recognition badges, stored as a JSON array of badge_types.key
  // (e.g. ["early"]). Rendered as small icons next to the user's name. Auto
  // badges (e.g. the Admin shield, derived from the admin role) are added on top
  // of these at serialization time and are not stored here. Null/absent = none.
  badges: text('badges'),
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
//   deals   - working deals, placeholder section
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
  tag: text('tag'), // 'trading' | null — for cross-listing in that workspace
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

// ---- Trading — Trade Log ----
// Per-user record of trades (the trader's own log), keyed by userId so a new
// user starts empty. Prices and sizes are stored as reals (forex/crypto prices
// need decimals, so a whole-dollar integer convention does not apply here);
// realized P/L is a real in account currency. The planned
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
// desk, not to one trader. The break-even buffer marks a barely-moved trade as
// flat (neither win nor loss). `breakEvenMode` picks how the buffer is measured:
//   • 'percent' — ±`breakEvenPct` of the entry→exit price move (the original)
//   • 'dollars' — realized P/L within ±`breakEvenAmount`
//   • 'pips'    — an entry→exit move within ±`breakEvenAmount` pips (forex)
// A zero buffer in the active mode disables break-even, so every scored trade is
// a win or a loss exactly as before.
export const tradingDeskSettings = sqliteTable('trading_desk_settings', {
  id: text('id').primaryKey(),
  breakEvenPct: real('break_even_pct').notNull().default(0),
  breakEvenMode: text('break_even_mode').notNull().default('percent'),
  breakEvenAmount: real('break_even_amount').notNull().default(0),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type TradingDeskSettingsRow = typeof tradingDeskSettings.$inferSelect;

// Per-instrument break-even buffers: an override that governs a single
// instrument (e.g. EUR/USD gets a 2-pip buffer while the desk default is 0.05%).
// Desk-wide like the default settings — the same override applies to every
// trader's view. `instrument` is the canonical symbol (upper-cased) and the
// primary key, so one instrument has at most one override.
export const tradingBeOverrides = sqliteTable('trading_be_overrides', {
  instrument: text('instrument').primaryKey(),
  mode: text('mode').notNull().default('percent'),
  pct: real('pct').notNull().default(0),
  amount: real('amount').notNull().default(0),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type TradingBeOverrideRow = typeof tradingBeOverrides.$inferSelect;

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

// ---- Live Wall boards (per-user customizable chart/watchlist layouts) ----
// Each row is a saved board "preset": a drag-resize grid of chart and
// watchlist tiles the trader arranges on the Live Wall. The whole arrangement
// (tiles, their positions/sizes, and each tile's config — symbol, timeframe,
// candle style, indicators) is stored as one JSON blob in `layout`, so the
// grid can evolve without a migration per field. Exactly one board per user
// may be the default (enforced in the service, not the schema).
export const tradingBoards = sqliteTable('trading_boards', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  // JSON: { tiles: BoardTile[] }. Opaque to the DB; validated in the route.
  layout: text('layout').notNull().default('{"tiles":[]}'),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export type TradingBoardRow = typeof tradingBoards.$inferSelect;

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
  // Claude's read of how this story could affect the desk's trading. Distinct
  // from `body` (the raw source excerpt) so the UI never mislabels an excerpt as
  // an AI note. Null until the background reader tags it.
  tradeNote: text('trade_note'),
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
  // A plain-language, layman explanation of what this release is (AI-filled,
  // deduped by title across recurring events). Null until the reader tags it.
  explainer: text('explainer'),
  // Where the event came from (e.g. "Forex Factory"). Null for hand-added events.
  source: text('source'),
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

// ---- Chat & Announcements ----
// A shared desk chat with two channels: 'trading' (gated to the Trading
// workspace) and 'general' (any signed-in user). Messages denormalize the
// author's display name so the feed survives a later rename. Announcements are
// a separate, admin-managed broadcast list shown to everyone.
export const chatMessages = sqliteTable('chat_messages', {
  id: text('id').primaryKey(),
  // The chat channel. Historically 'trading' | 'general'; the team chat now uses
  // 'team' and scopes every message to one trading team via `teamId`, so a desk
  // only ever sees its own conversation.
  channel: text('channel').notNull(),
  // The trading team this message belongs to (users.team_id at send time). Null
  // for the legacy 'trading'/'general' channels. Team-chat reads filter on it.
  teamId: text('team_id'),
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

// ---- Feedback: suggestions & bug reports (from the Site Help workspace) ----
// A member sends a suggestion or a bug report from Site Help; both land in the
// Admin workspace (Suggestions / Bug Reports sections). Suggestions are a plain
// note. Bug reports carry an AI-assisted intake conversation (see
// bugReportMessages) so the reporter is asked for clarification when needed and
// thanked once the ticket is complete. Author display name is denormalized so
// the admin view survives a later rename.
export const FEEDBACK_STATUSES = ['new', 'reviewed'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const suggestions = sqliteTable('suggestions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  author: text('author').notNull(),
  teamId: text('team_id'),
  body: text('body').notNull(),
  status: text('status').notNull().default('new'), // 'new' | 'reviewed'
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export type SuggestionRow = typeof suggestions.$inferSelect;

// One bug report. `status`: 'open' while the AI is still gathering detail from
// the reporter; 'submitted' once the AI has enough and the ticket is filed for
// the admins; 'resolved' when an admin marks it done. `summary` is the first
// line of the reporter's initial message, for the admin list.
export const BUG_REPORT_STATUSES = ['open', 'submitted', 'resolved'] as const;
export type BugReportStatus = (typeof BUG_REPORT_STATUSES)[number];

export const bugReports = sqliteTable('bug_reports', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  author: text('author').notNull(),
  teamId: text('team_id'),
  summary: text('summary').notNull(),
  status: text('status').notNull().default('open'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type BugReportRow = typeof bugReports.$inferSelect;

// The intake conversation for a bug report: alternating reporter ('user') and
// assistant ('ai') turns, oldest-first by createdAt.
export const bugReportMessages = sqliteTable('bug_report_messages', {
  id: text('id').primaryKey(),
  reportId: text('report_id')
    .notNull()
    .references(() => bugReports.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'ai'
  body: text('body').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export type BugReportMessageRow = typeof bugReportMessages.$inferSelect;

// ---- AI usage (per-user guardrails) ----
// One row per Claude call, used to enforce a monthly cap. `kind` records which
// feature made the call (ask, analyze, news_brief, todo_command, ...).
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
// by VTS AI when the word is added, and the topic is a short label so the deck's
// topic filter still works. Synced per user so a custom deck follows the learner
// across devices.
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
// id refers to a question in the learner’s study set. Synced
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
// question bank and the matching question ids are stored here as a
// JSON array of integers, so the subsection can be drilled like any built-in
// category and syncs across devices. `questionIds` refers to ids in the static
// bank.
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

// ---- Per-user notification preferences ----
// One row per (recipient, watched-trader) pair. Lets a trader pick which
// teammate they want trade notifications about and, per teammate, which trade
// events buzz them: a fresh fill (open), a close, and each stop/target action
// split into placed-vs-moved for both SL and TP. A missing row means "notify me
// about everything for that trader" — the historical default — so a user who
// never opens the settings keeps getting the full team feed. Both foreign keys
// cascade, so a row is removed when either the recipient or the watched trader
// is deleted.
export const notificationPrefs = sqliteTable(
  'notification_prefs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }), // the recipient
    targetUserId: text('target_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }), // the trader being watched
    notifyOpen: integer('notify_open', { mode: 'boolean' }).notNull().default(true),
    notifyClose: integer('notify_close', { mode: 'boolean' }).notNull().default(true),
    notifyPlaceSl: integer('notify_place_sl', { mode: 'boolean' }).notNull().default(true),
    notifyMoveSl: integer('notify_move_sl', { mode: 'boolean' }).notNull().default(true),
    notifyPlaceTp: integer('notify_place_tp', { mode: 'boolean' }).notNull().default(true),
    notifyMoveTp: integer('notify_move_tp', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({ userTarget: unique().on(t.userId, t.targetUserId) }),
);
export type NotificationPrefRow = typeof notificationPrefs.$inferSelect;

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

// ---- Studies: banked Study Game runs (per user) ----
// A snapshot of a completed Study Game run, saved to the leaderboard when the
// learner resets their progress. Each row preserves that session's headline
// numbers so a reset keeps the run on the board as a "past run" rather than
// erasing it. `best_step` is the highest overall level step (0..59) reached.
export const studyGameRuns = sqliteTable('study_game_runs', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  attempted: integer('attempted').notNull(),
  correct: integer('correct').notNull(),
  bestStep: integer('best_step').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export type StudyGameRunRow = typeof studyGameRuns.$inferSelect;

// ---- Team-authored study games (decks) ----
// Any team can
// build its own study game: questions AI-generated from a topic, or parsed by
// Claude from an uploaded text file. A deck is team-SHARED — any member creates
// it, the whole team plays it — and gets the same level/streak/leaderboard
// level-up mechanics. All rows are scoped by teamId.
export const studyDecks = sqliteTable('study_decks', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  // The member who built it; null if that account is later deleted.
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  source: text('source').notNull(), // 'ai_topic' | 'upload' | 'sample'
  isSample: integer('is_sample', { mode: 'boolean' }).notNull().default(false),
  categories: text('categories').notNull(), // JSON string[] of this deck's category names
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type StudyDeckRow = typeof studyDecks.$inferSelect;

export const studyDeckQuestions = sqliteTable('study_deck_questions', {
  id: text('id').primaryKey(),
  deckId: text('deck_id')
    .notNull()
    .references(() => studyDecks.id, { onDelete: 'cascade' }),
  teamId: text('team_id').notNull(), // denormalized for team-scoped guards
  seq: integer('seq').notNull(), // stable question number within the deck
  topic: text('topic').notNull(), // one of the deck's categories
  stem: text('stem').notNull(),
  options: text('options').notNull(), // JSON [{label,text} x4]
  answer: text('answer').notNull(), // 'A' | 'B' | 'C' | 'D'
  explanation: text('explanation'),
  // The name of the game this question originally came from, when this deck is a
  // merge of several games (null otherwise). Powers the optional "guess the
  // source" play mode.
  sourceName: text('source_name'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export type StudyDeckQuestionRow = typeof studyDeckQuestions.$inferSelect;

// Per-user, per-deck game state (mirror of study_game). One row per (user, deck).
export const studyDeckGame = sqliteTable(
  'study_deck_game',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deckId: text('deck_id')
      .notNull()
      .references(() => studyDecks.id, { onDelete: 'cascade' }),
    state: text('state').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.deckId] }) }),
);
export type StudyDeckGameRow = typeof studyDeckGame.$inferSelect;

// Banked runs for a deck (mirror of study_game_runs), for the deck leaderboard.
export const studyDeckRuns = sqliteTable('study_deck_runs', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  deckId: text('deck_id')
    .notNull()
    .references(() => studyDecks.id, { onDelete: 'cascade' }),
  attempted: integer('attempted').notNull(),
  correct: integer('correct').notNull(),
  bestStep: integer('best_step').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export type StudyDeckRunRow = typeof studyDeckRuns.$inferSelect;

// ---- Team-authored flashcard sets ----
// A team builds its own flashcard set: term/definition cards typed in by hand,
// AI-generated from a topic, or parsed by Claude from an uploaded text file. A
// set is team-SHARED — any member builds it, the whole team studies it — and is
// played with the same auto-rotate flashcard experience the portal has always
// had. All rows are scoped by teamId.
export const studyFlashcardSets = sqliteTable('study_flashcard_sets', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  // The member who built it; null if that account is later deleted.
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  source: text('source').notNull(), // 'manual' | 'ai_topic' | 'upload' | 'sample'
  topics: text('topics').notNull(), // JSON string[] of this set's topic names
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type StudyFlashcardSetRow = typeof studyFlashcardSets.$inferSelect;

export const studyFlashcardCards = sqliteTable('study_flashcard_cards', {
  id: text('id').primaryKey(),
  setId: text('set_id')
    .notNull()
    .references(() => studyFlashcardSets.id, { onDelete: 'cascade' }),
  teamId: text('team_id').notNull(), // denormalized for team-scoped guards
  seq: integer('seq').notNull(), // stable card number within the set
  term: text('term').notNull(),
  def: text('def').notNull(),
  topic: text('topic'), // optional topic label; null groups under "General"
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export type StudyFlashcardCardRow = typeof studyFlashcardCards.$inferSelect;

// ---- Team-authored study guides (presentations) ----
// A team builds a slide-deck study guide — a presentation of titled slides, each
// with a body and an optional screenshot — through a back-and-forth conversation
// with Claude that drafts and revises the slides. A guide is team-SHARED: any
// member builds it, the whole team can present it. Slides (including the base64
// screenshot data URLs) are stored as one JSON blob so the guide travels as a
// unit; `slideCount` is denormalized so the list view never parses the blob.
export const studyGuides = sqliteTable('study_guides', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  // The member who built it; null if that account is later deleted.
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  slides: text('slides').notNull(), // JSON [{ title, body, image? } ...]
  slideCount: integer('slide_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type StudyGuideRow = typeof studyGuides.$inferSelect;

// ---- Studies: completed mock tests (per user) ----
// One row per finished mock test (a graded exam drawn to
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

// ---- Studies: in-progress mock test (per user) ----
// At most one row per user holding the serialized state of a test currently in
// progress (the drawn question ids, answers so far, the current index, and the
// start time), so an unfinished sitting follows the learner across devices just
// like the Study Game state. The row is deleted when the test is submitted or
// abandoned. The shape is owned by the web client; the server
// stores and returns it verbatim.
export const studyTestProgress = sqliteTable('study_test_progress', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  state: text('state').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type StudyTestProgressRow = typeof studyTestProgress.$inferSelect;

// ---- Early access requests ----
// Submissions from the public "Request Early Access" form on the login screen.
// No account is created — these are leads an admin reviews in the Admin
// workspace. `lastName` and `phone` are optional; `phone` is where the person
// wants a text message if accepted. `source` is the free-text "how did you hear
// about the platform" answer.
export const earlyAccessRequests = sqliteTable('early_access_requests', {
  id: text('id').primaryKey(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name'),
  email: text('email').notNull(),
  phone: text('phone'),
  source: text('source').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export type EarlyAccessRequestRow = typeof earlyAccessRequests.$inferSelect;

// ---- App settings (generic key/value store) ----
// A small key/value table for admin-editable site configuration that used to be
// hardcoded in source: AI system-prompt overrides (keys "ai.<id>") and editable
// site copy such as the How-to walkthroughs (keys "howto.<screen>"). `value` is
// opaque text — a plain string for a prompt, or JSON for structured content.
// Absence of a key means "use the built-in default" — nothing is seeded here, so
// the code defaults always apply until an admin overrides them.
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type AppSettingRow = typeof appSettings.$inferSelect;

// ---- Patch notes (release notes, admin-authored) ----
// The changelog the owner writes on each release. Unlike the old compiled-in
// PATCH_NOTES array, these are authored in the Admin workspace: an admin drafts
// an entry, reviews it, then releases it. Only 'published' notes appear in Site
// Help. `notes` is a JSON array of bullet strings; `dateLabel` is the free-text
// date shown (e.g. "July 17, 2026"); `position` orders entries (higher = newer).
export const PATCH_NOTE_STATUSES = ['draft', 'published'] as const;
export type PatchNoteStatus = (typeof PATCH_NOTE_STATUSES)[number];

export const patchNotes = sqliteTable('patch_notes', {
  id: text('id').primaryKey(),
  version: text('version').notNull(),
  dateLabel: text('date_label').notNull(),
  notes: text('notes').notNull(), // JSON string[] of bullet points
  status: text('status', { enum: PATCH_NOTE_STATUSES }).notNull().default('draft'),
  position: integer('position').notNull().default(0),
  publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type PatchNoteRow = typeof patchNotes.$inferSelect;

// ---- Badge types (recognition icons shown next to a user's name) ----
// An admin-managed registry of the badges that can appear next to a member's
// name (e.g. a star for early-release members, a shield for admins). Two are
// seeded and marked builtin so they can't be deleted; admins can create their
// own. `icon` is an Icon glyph name (see web components/Icon), `color` a hex
// accent. `autoRole`, when set to a role key (e.g. "admin"), means every user
// holding that role shows the badge automatically — otherwise the badge is
// assigned per user (users.badges).
export const badgeTypes = sqliteTable('badge_types', {
  id: text('id').primaryKey(),
  // Stable key referenced by users.badges (e.g. "early", "admin"). Lowercase.
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  icon: text('icon').notNull(),
  color: text('color').notNull().default('#EBCB74'),
  description: text('description'),
  // A role key that auto-grants this badge to every holder (e.g. "admin"), or
  // null for a manually-assigned badge.
  autoRole: text('auto_role'),
  // Builtin badges (early, admin) can be edited but not deleted.
  builtin: integer('builtin', { mode: 'boolean' }).notNull().default(false),
  position: integer('position').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type BadgeTypeRow = typeof badgeTypes.$inferSelect;
