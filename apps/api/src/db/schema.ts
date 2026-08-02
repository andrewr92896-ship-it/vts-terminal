import { sqliteTable, text, integer, real, primaryKey, unique } from 'drizzle-orm/sqlite-core';

// The four roles match the prototype's access matrix exactly.
export const ROLES = ['Admin', 'Trader', 'Sales', 'Viewer'] as const;
export type Role = (typeof ROLES)[number];

// ---- Trading teams ----
// Admin-managed groups a trader belongs to. Each user is a member of at most one
// team (users.team_id below). Teams partition the shared terminal into competing
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
  // back to their initial. Kept inline (no object store) since the terminal is a
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
  // Legal acceptance. `termsAcceptedVersion` records the version string of the
  // Terms of Service / Privacy Policy the user last accepted (see LEGAL_VERSION
  // in legal/version.ts). When it does not equal the current LEGAL_VERSION, the
  // user is gated into the acceptance screen before they can operate the terminal
  // (so bumping the docs re-prompts everyone). Null = never accepted.
  termsAcceptedVersion: text('terms_accepted_version'),
  termsAcceptedAt: integer('terms_accepted_at', { mode: 'timestamp_ms' }),
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

// Per-user, revocable bearer tokens for the read-only mobile/home-screen widget
// (`GET /api/widget/positions`). The terminal's own API is otherwise httpOnly
// cookie-only, which a native iOS widget extension / Scriptable can't present.
// Like sessions, we store only the SHA-256 hash of the token; the raw token is
// shown to the user exactly once when generated. A token grants read-only access
// to the owner's own Live Wall (their team's open positions) — never broker keys
// or any write. One active token per user (regenerating replaces it).
export const widgetTokens = sqliteTable('widget_tokens', {
  id: text('id').primaryKey(), // sha256(token)
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
});
export type WidgetTokenRow = typeof widgetTokens.$inferSelect;

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
  // Soft delete: when set, the trade is hidden from the Trade Log / History but
  // kept so it can be restored from the Deleted Trades section. Null = live.
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
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
  // Soft delete: when set, the position is hidden from the Trade Log / History
  // but kept so it can be restored from the Deleted Trades section (and its key
  // still dedupes the backfill, so a deleted trade never re-imports). Null = live.
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
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
  // "Count trades since": only trades that opened on/after this instant are
  // counted in the Trade Log, History, and the closed-trade backfill for this
  // connection. Lets a trader mark their real start on a broker account so an
  // earlier learning/practice phase (funded, traded, withdrawn) never pollutes
  // their stats. Null = count everything (the default, unchanged behaviour).
  historyStartAt: integer('history_start_at', { mode: 'timestamp_ms' }),
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

// ---- Trading — desk settings (per trader, with a shared default) ----
// Each trader has their own desk settings, keyed by `id = userId`, that govern
// their own view of the desk (break-even scoring + the test-trade floor). The
// legacy `id = 'desk'` row is kept as the DEFAULT that a trader who has never
// customized falls back to (see trading/settings.ts). A trader's own settings
// can be changed by that trader, and — for any teammate — by the team leader,
// the Chief Analyst / Chief Strategist, and admins (see trading/deskAccess.ts).
// The break-even buffer marks a barely-moved trade as flat (neither win nor
// loss). `breakEvenMode` picks how the buffer is measured:
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
  // Ignore broker fills smaller than this many units in the Trade Log / History
  // (stats and list) — the desk's "these are test trades" floor, so 1-unit
  // connection tests don't skew win rate, profit factor, or pips. 0 = keep all.
  minTradeUnits: real('min_trade_units').notNull().default(0),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type TradingDeskSettingsRow = typeof tradingDeskSettings.$inferSelect;

// Per-instrument break-even buffers: an override that governs a single
// instrument (e.g. EUR/USD gets a 2-pip buffer while the default is 0.05%).
// Scoped to an owner — a trader's own userId, or the constant 'desk' for the
// shared default set. Composite primary key (owner + instrument), so each owner
// has at most one buffer per instrument.
export const tradingBeOverrides = sqliteTable(
  'trading_be_overrides',
  {
    // The owning trader's userId, or 'desk' for the shared default set.
    ownerId: text('owner_id').notNull().default('desk'),
    instrument: text('instrument').notNull(),
    mode: text('mode').notNull().default('percent'),
    pct: real('pct').notNull().default(0),
    amount: real('amount').notNull().default(0),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.ownerId, t.instrument] }) }),
);
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
// Per-user trading-session windows (e.g. London Open) with a directional bias
// and a per-weekday schedule per instrument. Times are 'HH:MM' in Eastern Time;
// status (active / opening / idle) is computed from the current ET time.
//
// `neutral` is retained in the enum for backward compatibility with rows created
// before it was dropped from the UI — the app coerces it to `both` on read and
// never offers it for new sessions (see trading/sessions.ts).
export const SESSION_BIASES = ['bull', 'bear', 'both', 'neutral'] as const;
export type SessionBias = (typeof SESSION_BIASES)[number];

export const tradingSessions = sqliteTable('trading_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  instrument: text('instrument'),
  openTime: text('open_time').notNull().default('09:30'), // ET 'HH:MM' — representative window (earliest enabled day)
  closeTime: text('close_time').notNull().default('11:00'),
  // Per-weekday schedule as JSON: { "mon": {"open":"09:30","close":"11:00"}, ... }
  // Only enabled weekdays (mon–fri) are present. Null/empty falls back to the
  // representative open_time/close_time applied to every weekday (legacy rows).
  days: text('days'),
  // Whether this session's schedule was filled from the instrument's full market
  // hours (via the AI market-hours lookup) rather than hand-set windows.
  marketHours: integer('market_hours', { mode: 'boolean' }).notNull().default(false),
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
// all traders. Anyone in the Trading workspace can read them; posting or editing
// is behind the workspace write guard, and the demo is refused by demoGuard
// (every non-GET). authorId is nullable and set to NULL when its author is
// deleted, so the shared feed survives.
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

// The intake conversation for a bug report: reporter ('user') and assistant
// ('ai') turns during intake, plus human admin replies ('admin') once an admin
// responds from the Bug Reports section. Oldest-first by createdAt.
export const bugReportMessages = sqliteTable('bug_report_messages', {
  id: text('id').primaryKey(),
  reportId: text('report_id')
    .notNull()
    .references(() => bugReports.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'ai' | 'admin'
  body: text('body').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export type BugReportMessageRow = typeof bugReportMessages.$inferSelect;

// ---- General support requests (from the chat-bubble Support tab) ----
// The Support tab runs an AI intake that first collects the details a user's
// request needs, then routes it to the right admin section: a bug goes to Bug
// Reports (bugReports), a suggestion goes to Suggestions (suggestions), and a
// general support question lands here and shows in the admin Support section.
// `status`: 'submitted' once filed, 'resolved' when an admin closes it out.
export const SUPPORT_REQUEST_STATUSES = ['submitted', 'resolved'] as const;
export type SupportRequestStatus = (typeof SUPPORT_REQUEST_STATUSES)[number];

export const supportRequests = sqliteTable('support_requests', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  author: text('author').notNull(),
  teamId: text('team_id'),
  summary: text('summary').notNull(),
  status: text('status').notNull().default('submitted'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type SupportRequestRow = typeof supportRequests.$inferSelect;

// The intake conversation for a general support request: alternating user and
// assistant ('ai') turns, oldest-first by createdAt.
export const supportRequestMessages = sqliteTable('support_request_messages', {
  id: text('id').primaryKey(),
  requestId: text('request_id')
    .notNull()
    .references(() => supportRequests.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'ai'
  body: text('body').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export type SupportRequestMessageRow = typeof supportRequestMessages.$inferSelect;

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

// One row per user holding their Strategy Session notification preferences: buzz
// me when one of my sessions opens, when it closes, and/or a configurable number
// of minutes before it opens. Defaults are all-off — a user opts in from the
// Trading Alerts screen. The background session watch (trading/sessionWatch.ts)
// reads these and fires the owner's own notifications.
export const sessionAlertPrefs = sqliteTable('session_alert_prefs', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  notifyOpen: integer('notify_open', { mode: 'boolean' }).notNull().default(false),
  notifyClose: integer('notify_close', { mode: 'boolean' }).notNull().default(false),
  notifyPreOpen: integer('notify_pre_open', { mode: 'boolean' }).notNull().default(false),
  preOpenLeadMin: integer('pre_open_lead_min').notNull().default(30),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type SessionAlertPrefRow = typeof sessionAlertPrefs.$inferSelect;

// ---- Feature Access (My Terminal ▸ Premium Features) ----
// One row per user recording which optional parts of the terminal they have turned
// on for themselves. Everything here is OFF for a new account — Markets,
// Investments, Studies, My Terminal and Site Help need no row and are never listed
// here, because every account has them.
//
// `funded` is nested under `advancedTrading`: the challenge tracker is part of
// the desk, so it can never be on while the desk is off (the service enforces
// that, not just the UI). `tradingAckAt` stamps when the user acknowledged that
// Advanced Trading places real orders with their own broker — the desk cannot be
// switched on without it, and the stamp is kept after an opt-out so re-enabling
// does not ask again.
//
// Turning a feature off only hides it. No trade, account or setting is touched,
// so flipping it back on restores the workspace exactly as it was.
export const userFeatures = sqliteTable('user_features', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  advancedTrading: integer('advanced_trading', { mode: 'boolean' }).notNull().default(false),
  funded: integer('funded', { mode: 'boolean' }).notNull().default(false),
  tradingAckAt: integer('trading_ack_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type UserFeatureRow = typeof userFeatures.$inferSelect;

// ---- Trading — Market Data board layout ----
// One row per trader holding how they have arranged the Market Data screen:
// which series are pinned to the strip (ordered), which they removed from the
// board entirely, and any metric they typed in themselves. The series catalog
// itself lives in code (trading/marketData.ts) — this is only the personal
// arrangement over it, so a catalog change never invalidates a saved layout
// (unknown ids are dropped on read). A user with no row gets the default pins.
// All three columns are JSON text: `pinned`/`hidden` are string arrays of series
// ids, `custom` an array of user-authored metric objects.
export const marketDataLayout = sqliteTable('market_data_layout', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  pinned: text('pinned').notNull().default('[]'),
  hidden: text('hidden').notNull().default('[]'),
  custom: text('custom').notNull().default('[]'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type MarketDataLayoutRow = typeof marketDataLayout.$inferSelect;

// ---- Trading — Market News live-stream setup, one row per trader ----
// A trader's personal view state over the Market News stream wall: which
// streams are open (and in what order), which one is docked to the corner, the
// desired column count, and per-channel go-live alert toggles. Purely personal
// — never shared.
//
// The channel catalog itself is NOT here: it lives in code
// (trading/marketNewsStreams.ts) and is identical for everyone, because live
// status costs API quota per distinct channel and a fixed catalog is what keeps
// that cost independent of how many people use the terminal. These columns only
// ever hold catalog keys; anything else is dropped on read. `watching` is a
// JSON string array, `notify` a JSON map of channel-key → boolean, and `docked`
// a single channel key or null.
export const marketNewsStreams = sqliteTable('market_news_streams', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  watching: text('watching').notNull().default('[]'),
  docked: text('docked'),
  cols: integer('cols').notNull().default(2),
  notify: text('notify').notNull().default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type MarketNewsStreamsRow = typeof marketNewsStreams.$inferSelect;

// ---- Trading — Market News live-stream channels (team-owned) ----
// The channels on the stream wall. A trader pastes a YouTube link and the
// channel appears for their whole desk, so the list is scoped by `team_id` — the
// same boundary trade data uses. A trader on no team gets their own scope key
// (`user:<id>`), matching how scopedTraderIds treats a team-less viewer.
//
// `key` is what a saved `watching` / `notify` entry references, and is stable
// for the life of the row: the four starter channels are seeded with their old
// slugs ('fed', 'reuters', …) so tiles a trader already had open keep working.
//
// `channel_id` is the `UC…` id the keyless embed player needs. It is filled at
// add time when the pasted URL carried it outright, otherwise resolved once
// afterwards; '' means the tile links out until that resolution lands.
export const marketNewsChannels = sqliteTable('market_news_channels', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull(),
  key: text('key').notNull(),
  name: text('name').notNull(),
  handle: text('handle').notNull().default(''),
  channelId: text('channel_id').notNull().default(''),
  // Marks a channel that broadcasts continuously, shown as the 24/7 tag.
  alwaysOn: integer('always_on', { mode: 'boolean' }).notNull().default(false),
  // Who added it; null once that account is deleted — the channel belongs to the
  // desk, not to the person who happened to paste the link.
  addedBy: text('added_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type MarketNewsChannelRow = typeof marketNewsChannels.$inferSelect;

// ---- Trading — the Trade Desk's order journal ----
// Every order this terminal sends to a broker, and what came back. This is an
// append-only record of *our* instructions, deliberately separate from
// `trading_positions` (which mirrors what the broker says exists): a rejected or
// cancelled order never becomes a position, and those are exactly the rows worth
// keeping when working out what happened. One row is written per attempt —
// before the broker answers the row does not exist, after it the row is stamped
// once and never rewritten.
export const TRADE_ORDER_KINDS = ['entry', 'close', 'modify', 'cancel'] as const;
export type TradeOrderKind = (typeof TRADE_ORDER_KINDS)[number];
export const TRADE_ORDER_TYPES = ['market', 'limit', 'stop'] as const;
export type TradeOrderType = (typeof TRADE_ORDER_TYPES)[number];
// 'filled'   — the broker filled it (money moved)
// 'accepted' — a resting order is now working on the book
// 'rejected' — the broker refused it; `error` says why
export const TRADE_ORDER_STATUSES = ['filled', 'accepted', 'rejected'] as const;
export type TradeOrderStatus = (typeof TRADE_ORDER_STATUSES)[number];

export const tradingOrders = sqliteTable('trading_orders', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  connectionId: text('connection_id').notNull(),
  broker: text('broker').notNull().default('oanda'),
  kind: text('kind').$type<TradeOrderKind>().notNull().default('entry'),
  instrument: text('instrument').notNull(),
  side: text('side').$type<TradeSide>(), // null for a modify/cancel
  orderType: text('order_type').$type<TradeOrderType>(),
  units: real('units'), // absolute size requested
  requestedPrice: real('requested_price'), // limit/stop price, null for market
  takeProfit: real('take_profit'),
  stopLoss: real('stop_loss'),
  status: text('status').$type<TradeOrderStatus>().notNull(),
  // The broker's own ids, so a row can be tied back to the account's history.
  brokerOrderId: text('broker_order_id'),
  brokerTradeId: text('broker_trade_id'),
  fillPrice: real('fill_price'),
  realizedPl: real('realized_pl'), // set on a close
  // The broker's refusal reason ("INSUFFICIENT_MARGIN", "MARKET_HALTED", ...)
  // alongside the message shown to the trader.
  errorCode: text('error_code'),
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export type TradingOrderRow = typeof tradingOrders.$inferSelect;

// ---- Trading — user-authored price alerts ----
// A personal "notify me when X crosses a level" rule, created in-terminal (the
// closest thing to a TradingView alert we can offer, since the embedded chart is
// a sandboxed iframe we can't drive). The price-alert watch evaluates each rule
// against live OANDA prices; on a genuine CROSS through `threshold` it buzzes
// only its owner (push + Pushover) and drops a row into that owner's alerts
// feed. `condition` is directional (cross up = `above`, cross down = `below`),
// so `lastSide` records which side price sat on last tick — a rule only fires on
// a transition, never on a level that was already passed when it was created.
export const PRICE_ALERT_CONDITIONS = ['above', 'below'] as const;
export type PriceAlertCondition = (typeof PRICE_ALERT_CONDITIONS)[number];
export const PRICE_ALERT_REPEATS = ['once', 'always'] as const;
export type PriceAlertRepeat = (typeof PRICE_ALERT_REPEATS)[number];
// The side of the threshold price is currently on. Same members as the
// condition, but a distinct concept (observed state vs. the rule's trigger).
export const PRICE_ALERT_SIDES = ['above', 'below'] as const;
export type PriceAlertSide = (typeof PRICE_ALERT_SIDES)[number];

export const priceAlerts = sqliteTable('price_alerts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  symbol: text('symbol').notNull(), // TradingView form, e.g. "OANDA:EURUSD"
  condition: text('condition', { enum: PRICE_ALERT_CONDITIONS }).notNull(),
  threshold: real('threshold').notNull(),
  repeat: text('repeat', { enum: PRICE_ALERT_REPEATS }).notNull().default('once'),
  note: text('note'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  lastSide: text('last_side', { enum: PRICE_ALERT_SIDES }), // null until first observed
  lastPrice: real('last_price'),
  lastFiredAt: integer('last_fired_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type PriceAlertRow = typeof priceAlerts.$inferSelect;

// ---- Investments — the long-term portfolio tracker ----
// Everything below belongs to the Investments workspace: a read-only tracker for
// 401(k), IRA, ESA and brokerage money. It displays and educates; it never places
// an order and never moves money, so there is deliberately no credential column
// anywhere in here and no table that could carry one. Every row is owner-scoped
// by `user_id` — unlike Trading, an investment account is personal and is never
// shown to a teammate.

export const INVESTMENT_ACCOUNT_KINDS = [
  '401k',
  'roth_401k',
  '403b',
  'ira',
  'roth_ira',
  'sep_ira',
  'simple_ira',
  'hsa',
  'esa',
  '529',
  'brokerage',
  'other',
] as const;
export type InvestmentAccountKind = (typeof INVESTMENT_ACCOUNT_KINDS)[number];

// How an account's data got here. Only `manual` exists today — the aggregator
// paths (Plaid / SnapTrade) are the planned read-only connection and are named
// now so wiring one later is a new value rather than a new column.
export const INVESTMENT_ACCOUNT_SOURCES = ['manual', 'plaid', 'snaptrade'] as const;
export type InvestmentAccountSource = (typeof INVESTMENT_ACCOUNT_SOURCES)[number];

// One row per account the user tracks. `cash_balance` is the uninvested cash
// sitting in the account, which counts toward its value but is not a holding.
export const investmentAccounts = sqliteTable('investment_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: INVESTMENT_ACCOUNT_KINDS }).notNull().default('brokerage'),
  label: text('label').notNull(), // the user's own name for it, e.g. "Fidelity 401(k)"
  institution: text('institution'), // e.g. "Fidelity" — free text, optional
  source: text('source', { enum: INVESTMENT_ACCOUNT_SOURCES }).notNull().default('manual'),
  cashBalance: real('cash_balance').notNull().default(0),
  note: text('note'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type InvestmentAccountRow = typeof investmentAccounts.$inferSelect;

// What a holding is, for the Allocation screen. Deliberately coarse and
// self-declared: without a data provider nothing here can be looked up, so the
// user states it and the screen reports what they stated rather than guessing a
// classification and presenting it as fact.
export const INVESTMENT_ASSET_CLASSES = [
  'us_stock',
  'intl_stock',
  'bond',
  'cash',
  'real_estate',
  'commodity',
  'crypto',
  'target_date',
  'other',
] as const;
export type InvestmentAssetClass = (typeof INVESTMENT_ASSET_CLASSES)[number];

// A position inside an account. `symbol` is nullable on purpose: plenty of 401(k)
// menus hold collective trusts and target-date funds that have a name but no
// public ticker, and refusing those would make the tracker useless for exactly
// the accounts it exists to track. `name` is what always renders.
//
// `manual_price` is the per-share mark the user entered, with `manual_price_at`
// stamping when. A live quote overlays it when one can be fetched; when none can
// be, this is what the holding is worth and every surface says so rather than
// implying the figure is live.
export const investmentHoldings = sqliteTable('investment_holdings', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id')
    .notNull()
    .references(() => investmentAccounts.id, { onDelete: 'cascade' }),
  symbol: text('symbol'), // uppercase ticker, or null for an unlisted fund
  name: text('name').notNull(),
  assetClass: text('asset_class', { enum: INVESTMENT_ASSET_CLASSES }).notNull().default('other'),
  quantity: real('quantity').notNull().default(0),
  costBasis: real('cost_basis'), // total dollars paid, not per share; null if unknown
  manualPrice: real('manual_price'),
  manualPriceAt: integer('manual_price_at', { mode: 'timestamp_ms' }),
  sector: text('sector'), // optional, user-stated
  region: text('region'), // optional, user-stated
  note: text('note'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type InvestmentHoldingRow = typeof investmentHoldings.$inferSelect;

export const INVESTMENT_TX_KINDS = [
  'contribution',
  'employer_match',
  'dividend',
  'interest',
  'buy',
  'sell',
  'fee',
  'withdrawal',
] as const;
export type InvestmentTxKind = (typeof INVESTMENT_TX_KINDS)[number];

// Money moving into, out of, or around an account. This is what makes
// Contributions & Goals and Dividends & Income real rather than estimated.
//
// `symbol` is denormalized rather than derived through `holding_id` so a
// dividend keeps naming what paid it after the holding is sold and deleted —
// income history that vanishes when you close a position is worse than none.
// `tax_year` is stored separately from `occurred_at` because a contribution made
// in January can be designated to the previous tax year, and the annual limit is
// scored on the designation, not the calendar date.
export const investmentTransactions = sqliteTable('investment_transactions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id')
    .notNull()
    .references(() => investmentAccounts.id, { onDelete: 'cascade' }),
  holdingId: text('holding_id').references(() => investmentHoldings.id, { onDelete: 'set null' }),
  kind: text('kind', { enum: INVESTMENT_TX_KINDS }).notNull(),
  amount: real('amount').notNull(), // dollars, always positive; `kind` gives direction
  quantity: real('quantity'), // shares, for buy/sell
  symbol: text('symbol'),
  occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
  taxYear: integer('tax_year'), // the year this counts against, for contributions
  note: text('note'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type InvestmentTransactionRow = typeof investmentTransactions.$inferSelect;

// One dated reading of the whole portfolio, which is what Performance is drawn
// from. Deliberately whole-portfolio rather than per-account: an account opened
// last month would otherwise leave a hole in the history the day it appeared.
//
// Keyed on an ET calendar date (`on_date`, "YYYY-MM-DD") rather than a timestamp
// so a day has exactly one reading no matter how often the screen is opened, and
// so the series means the same thing to a user in any timezone — the same reason
// trade stamps are Eastern everywhere else in the terminal.
//
// `contributed_to_date` is what makes the "what you put in vs. what the market
// did" split honest: without it, a rising line cannot be told from a line that
// rose only because money was added.
export const investmentSnapshots = sqliteTable(
  'investment_snapshots',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    onDate: text('on_date').notNull(), // ET calendar date, "YYYY-MM-DD"
    value: real('value').notNull(),
    costBasis: real('cost_basis'),
    contributedToDate: real('contributed_to_date'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({ userDate: unique('investment_snapshots_user_date').on(t.userId, t.onDate) }),
);
export type InvestmentSnapshotRow = typeof investmentSnapshots.$inferSelect;

export const INVESTMENT_GOAL_KINDS = ['retirement', 'education', 'general'] as const;
export type InvestmentGoalKind = (typeof INVESTMENT_GOAL_KINDS)[number];

// A savings target. `account_id` is nullable — a goal either tracks one account
// or the whole portfolio.
export const investmentGoals = sqliteTable('investment_goals', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').references(() => investmentAccounts.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: INVESTMENT_GOAL_KINDS }).notNull().default('general'),
  label: text('label').notNull(),
  targetAmount: real('target_amount').notNull(),
  targetDate: text('target_date'), // "YYYY-MM-DD", or null for no deadline
  note: text('note'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type InvestmentGoalRow = typeof investmentGoals.$inferSelect;

// ---- Net Worth — everything you own minus everything you owe ----
// My Terminal's whole-life roll-up. What is stored here is only the part nothing
// else in the terminal knows about: a house, a car, a mortgage, a card balance.
// The investment portfolio and the trading account are read live at request time
// from the tables that already own them, because copying those figures into a
// row here would give the terminal two answers to the same question and the
// stale one would win about half the time.

export const NET_WORTH_KINDS = ['asset', 'liability'] as const;
export type NetWorthKind = (typeof NET_WORTH_KINDS)[number];

// Deliberately no "investments" or "brokerage" category: those are pulled in
// automatically, and offering a category for them would invite double-counting
// the largest number on the screen.
export const NET_WORTH_CATEGORIES = [
  'cash',
  'real_estate',
  'vehicle',
  'crypto',
  'business',
  'valuables',
  'retirement_other',
  'other_asset',
  'mortgage',
  'auto_loan',
  'student_loan',
  'credit_card',
  'personal_loan',
  'other_debt',
] as const;
export type NetWorthCategory = (typeof NET_WORTH_CATEGORIES)[number];

// `value` is always POSITIVE; `kind` says which side of the ledger it falls on.
// Storing a debt as a negative reads fine right up until something sums the
// column without checking `kind`, and then the mistake is invisible.
export const netWorthItems = sqliteTable('net_worth_items', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: NET_WORTH_KINDS }).notNull(),
  category: text('category', { enum: NET_WORTH_CATEGORIES }).notNull().default('other_asset'),
  label: text('label').notNull(),
  value: real('value').notNull().default(0),
  note: text('note'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type NetWorthItemRow = typeof netWorthItems.$inferSelect;

// One dated reading of the whole picture — what the trend line is drawn from.
// Assets and liabilities are stored separately rather than only their
// difference: a net worth that moved because a debt was paid down is a different
// story from one that moved because a house was revalued, and a single column
// cannot tell them apart afterwards.
export const netWorthSnapshots = sqliteTable(
  'net_worth_snapshots',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    onDate: text('on_date').notNull(), // ET calendar date, "YYYY-MM-DD"
    assets: real('assets').notNull(),
    liabilities: real('liabilities').notNull(),
    netWorth: real('net_worth').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({ userDate: unique('net_worth_snapshots_user_date').on(t.userId, t.onDate) }),
);
export type NetWorthSnapshotRow = typeof netWorthSnapshots.$inferSelect;

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
// played with the same auto-rotate flashcard experience the terminal has always
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
  // 'new' until an admin has dealt with the lead, then 'handled'. Added so the
  // Administrator Log can show a request as open and let it be closed without
  // deleting the lead — before this the only way to clear one was to throw the
  // person's contact details away.
  status: text('status').notNull().default('new'),
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

// ---- My Terminal: user-created Trading Teams ----
// A "Trading Team" is a small, user-owned group created from the My Terminal
// workspace — distinct from the admin-managed trading_teams above. Any signed-in
// user can create ONE (becoming its leader); a user belongs to at most one
// (enforced by the unique userId on user_team_members). The leader assigns
// cosmetic badges and per-member permissions, and can hand leadership to another
// member. Capped at five members (enforced in the service).
export const userTeams = sqliteTable('user_teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  // The current team leader (a users.id). Always also present as a member row.
  leaderId: text('leader_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type UserTeamRow = typeof userTeams.$inferSelect;

// One row per member of a user Trading Team. `userId` is unique across the whole
// table, so a user can be in at most one team. `badge` is a cosmetic title label
// (e.g. "Chief Strategist"), null for none. The boolean columns are the leader-
// granted permissions; the leader implicitly has them all (checked via
// userTeams.leaderId, not these flags).
export const userTeamMembers = sqliteTable('user_team_members', {
  id: text('id').primaryKey(),
  teamId: text('team_id')
    .notNull()
    .references(() => userTeams.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  badge: text('badge'), // cosmetic title, e.g. "Chief Strategist"; null for none
  canCreateStudyGuides: integer('can_create_study_guides', { mode: 'boolean' }).notNull().default(false),
  canInvite: integer('can_invite', { mode: 'boolean' }).notNull().default(false),
  canManageBadges: integer('can_manage_badges', { mode: 'boolean' }).notNull().default(false),
  canRemoveMembers: integer('can_remove_members', { mode: 'boolean' }).notNull().default(false),
  canEditTeam: integer('can_edit_team', { mode: 'boolean' }).notNull().default(false),
  // Remove any teammate's trade from the Trade Log / History (the leader always can).
  canDeleteTrades: integer('can_delete_trades', { mode: 'boolean' }).notNull().default(false),
  joinedAt: integer('joined_at', { mode: 'timestamp_ms' }).notNull(),
});
export type UserTeamMemberRow = typeof userTeamMembers.$inferSelect;

// A pending invitation to join a user Trading Team, addressed to a resolved
// user (looked up from the username the inviter typed). Status walks
// pending → accepted | declined. One live invite per (team, invited user).
export const userTeamInvites = sqliteTable(
  'user_team_invites',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => userTeams.id, { onDelete: 'cascade' }),
    invitedUserId: text('invited_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    invitedBy: text('invited_by').references(() => users.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('pending'), // 'pending' | 'accepted' | 'declined'
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({ teamInvitee: unique().on(t.teamId, t.invitedUserId) }),
);
export type UserTeamInviteRow = typeof userTeamInvites.$inferSelect;

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

// ---- Message templates (admin copy library) ----
// A shared library of reusable text-message (SMS) and email templates that
// admins copy out of the terminal (e.g. an onboarding text, a follow-up email).
// Authoring is founder-level only (software developers), but every admin can
// read and copy them. Templates are site-wide (not per-user): `createdBy` is set
// to null if the author's account is later deleted, so a template survives its
// author. `subject` is used by email templates for the subject line (null for a
// plain text-message template). Rendered in Admin ▸ Message Templates.
export const MESSAGE_TEMPLATE_KINDS = ['sms', 'email'] as const;
export type MessageTemplateKind = (typeof MESSAGE_TEMPLATE_KINDS)[number];

export const messageTemplates = sqliteTable('message_templates', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: MESSAGE_TEMPLATE_KINDS }).notNull().default('sms'),
  title: text('title').notNull(),
  subject: text('subject'), // email subject line; null for a text-message template
  body: text('body').notNull(),
  // The software developer who authored it; null once that account is deleted.
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdByName: text('created_by_name'), // denormalized author name (survives rename/delete)
  position: integer('position').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type MessageTemplateRow = typeof messageTemplates.$inferSelect;

// ---- Employee portal (vitalistradingsystems.com/employee) ----
//
// The employee portal is a deliberately separate, hardened surface: its own URL,
// its own bundle, its own API namespace and — critically — its own sessions.
// A main-terminal login grants nothing here; an employee re-authenticates at
// /employee and that session is tracked in `employee_sessions` below, never in
// `sessions`. Everything in this block exists to keep that boundary auditable.

export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contractor', 'intern'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYEE_STATUSES = ['active', 'suspended', 'offboarded'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

// Where someone is working from today — the directory's "Working" column. This
// is a courtesy signal the employee sets themselves, not attendance tracking:
// nothing records when it changed, and nobody but the person can set it.
export const WORKING_STATUSES = ['in_office', 'remote', 'away'] as const;
export type WorkingStatus = (typeof WORKING_STATUSES)[number];

// One row per terminal user granted employee-portal access. Presence of the row is
// the HR record; the `employee` role on the user is the access grant. Both must
// line up (role + an `active` profile) for a sign-in to succeed, so revoking
// either one locks the person out immediately.
export const employeeProfiles = sqliteTable('employee_profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  employeeNo: text('employee_no'),
  title: text('title'),
  department: text('department'),
  workEmail: text('work_email'),
  workPhone: text('work_phone'),
  location: text('location'),
  // Another employee's users.id, or null. Shown in the directory.
  managerId: text('manager_id').references(() => users.id, { onDelete: 'set null' }),
  employmentType: text('employment_type', { enum: EMPLOYMENT_TYPES }).notNull().default('full_time'),
  startedOn: text('started_on'), // ISO date (YYYY-MM-DD); no time component needed
  status: text('status', { enum: EMPLOYEE_STATUSES }).notNull().default('active'),
  // Set by the employee themselves; see WORKING_STATUSES.
  workingStatus: text('working_status', { enum: WORKING_STATUSES }).notNull().default('in_office'),
  // HR/administrator *of the employee portal* — may manage people, announcements
  // and documents in it. Distinct from the main terminal's admin role; founder-level
  // users are treated as portal admins implicitly.
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }),
  lastLoginIp: text('last_login_ip'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type EmployeeProfileRow = typeof employeeProfiles.$inferSelect;

// Employee-portal sessions. Same hardening as the main `sessions` table (only
// the SHA-256 of the cookie token is stored) plus a short absolute lifetime and
// an idle timeout enforced on lookup. `stage` is 'pending_2fa' for a session
// that has passed the password check but still owes us the emailed sign-in
// code — such a session may only reach the verification endpoints.
export const EMPLOYEE_SESSION_STAGES = ['pending_2fa', 'active'] as const;
export type EmployeeSessionStage = (typeof EMPLOYEE_SESSION_STAGES)[number];

export const employeeSessions = sqliteTable('employee_sessions', {
  id: text('id').primaryKey(), // sha256(token)
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  stage: text('stage', { enum: EMPLOYEE_SESSION_STAGES }).notNull().default('active'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  // The pending sign-in code, kept on the session rather than the profile: a
  // code belongs to one sign-in attempt in one browser, so a second attempt
  // elsewhere gets its own and neither can consume the other's. Only the
  // SHA-256 is stored — the plaintext exists in the employee's inbox and
  // nowhere else. All three are cleared the moment the session goes active.
  otpCodeHash: text('otp_code_hash'),
  otpExpiresAt: integer('otp_expires_at', { mode: 'timestamp_ms' }),
  // Wrong guesses against the current code. A small ceiling here stops a
  // six-digit code being brute-forced within its own validity window, before
  // the account-wide lockout ladder would notice.
  otpAttempts: integer('otp_attempts').notNull().default(0),
  // When the current code was sent — throttles "resend" so the endpoint cannot
  // be used to mail-bomb someone.
  otpSentAt: integer('otp_sent_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
});
export type EmployeeSessionRow = typeof employeeSessions.$inferSelect;

// A browser the employee ticked "remember this device" on. Holding a live token
// here lets that browser skip the emailed code for EMPLOYEE_REMEMBER_DEVICE_DAYS
// — the password is still required every time, so this shortens the second
// factor's cadence rather than removing it.
//
// The token lives in its own long-lived cookie, separate from the session
// cookie, and only its SHA-256 is stored. Every trusted device is listed on the
// employee's Security screen and can be revoked individually; a portal admin
// can drop all of someone's at once.
export const employeeTrustedDevices = sqliteTable('employee_trusted_devices', {
  id: text('id').primaryKey(), // sha256(token)
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
});
export type EmployeeTrustedDeviceRow = typeof employeeTrustedDevices.$inferSelect;

// Failed-sign-in counters for the progressive lockout. `id` is the throttle key:
// "user:<userId>" or "ip:<address>" — both are tracked, so neither spraying one
// account from many addresses nor many accounts from one address gets free tries.
export const employeeLoginAttempts = sqliteTable('employee_login_attempts', {
  id: text('id').primaryKey(),
  fails: integer('fails').notNull().default(0),
  firstFailAt: integer('first_fail_at', { mode: 'timestamp_ms' }).notNull(),
  lastFailAt: integer('last_fail_at', { mode: 'timestamp_ms' }).notNull(),
  lockedUntil: integer('locked_until', { mode: 'timestamp_ms' }),
});
export type EmployeeLoginAttemptRow = typeof employeeLoginAttempts.$inferSelect;

// Append-only audit trail for the employee portal. Every sign-in (successful or
// not), every lockout, every refusal and every write is recorded here. Rows are
// never rewritten — `userId` is nullable because a failed sign-in may not resolve
// to an account, and the attempted identifier is kept in `actor` instead.
export const employeeAuditLog = sqliteTable('employee_audit_log', {
  id: text('id').primaryKey(),
  at: integer('at', { mode: 'timestamp_ms' }).notNull(),
  userId: text('user_id'),
  actor: text('actor'), // display name, or the identifier a failed sign-in used
  action: text('action').notNull(), // e.g. 'login.success', 'document.deleted'
  target: text('target'), // what was acted on (an id or a name)
  detail: text('detail'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  ok: integer('ok', { mode: 'boolean' }).notNull().default(true),
});
export type EmployeeAuditRow = typeof employeeAuditLog.$inferSelect;

// Internal announcements, posted by an employee-portal admin and visible to
// every employee. Separate from the main terminal's `announcements` table so
// internal staff communication never leaks into the member-facing site.
export const employeeAnnouncements = sqliteTable('employee_announcements', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
  authorName: text('author_name'), // denormalized so a post survives its author
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type EmployeeAnnouncementRow = typeof employeeAnnouncements.$inferSelect;

// Internal documents: handbook sections, policies, forms and process guides.
// Either inline text (`body`) or a pointer to an external file (`linkUrl`).
export const EMPLOYEE_DOC_CATEGORIES = ['policy', 'handbook', 'form', 'guide', 'other'] as const;
export type EmployeeDocCategory = (typeof EMPLOYEE_DOC_CATEGORIES)[number];

export const employeeDocuments = sqliteTable('employee_documents', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  category: text('category', { enum: EMPLOYEE_DOC_CATEGORIES }).notNull().default('policy'),
  summary: text('summary'),
  body: text('body'),
  linkUrl: text('link_url'),
  authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
  authorName: text('author_name'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type EmployeeDocumentRow = typeof employeeDocuments.$inferSelect;

// Personal tasks on the employee portal — the "My tasks" card.
//
// A task always belongs to exactly one person: `userId` is the assignee, and
// nobody but them (and a portal admin) ever sees it. Two ways one appears:
//
//   • an employee adds their own, and `assignedBy` is themselves; or
//   • a portal admin assigns it — to one person, or to every active employee, in
//     which case one row per person is written rather than a shared row. That
//     matters: each person then completes their own copy independently, and
//     removing one employee's task cannot disturb anyone else's.
//
// `doneAt` is a timestamp rather than a boolean so the record answers "when",
// not just "whether".
export const employeeTasks = sqliteTable('employee_tasks', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  detail: text('detail'),
  dueOn: text('due_on'), // ISO date (YYYY-MM-DD); no time component needed
  doneAt: integer('done_at', { mode: 'timestamp_ms' }),
  // Who set it. Null once that account is deleted; the name is kept alongside so
  // the task still says where it came from.
  assignedBy: text('assigned_by').references(() => users.id, { onDelete: 'set null' }),
  assignedByName: text('assigned_by_name'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type EmployeeTaskRow = typeof employeeTasks.$inferSelect;

// ---- Memberships (the paid tiers) ----
//
// One row per user holding the tier they have been granted and when it runs out.
// This is the paywall's storage, and it is deliberately NOT the whole answer to
// "what tier is this account" — memberships/service.ts resolves that, because
// admins, software developers and founders are always Max by virtue of their
// role and never need a row.
//
// `expiresAt` null means indefinite. Who may grant that is a rule, not a
// preference: an admin is capped at six months, while founder-level users may
// grant any length including forever (assertCanGrantMembership). Every manual
// grant carries a `note` saying why — required, because a membership handed out
// without a stated reason is exactly what the Administrator Log exists to catch.
export const MEMBERSHIP_TIERS = ['free', 'premium', 'max'] as const;
export type MembershipTier = (typeof MEMBERSHIP_TIERS)[number];

export const userMemberships = sqliteTable('user_memberships', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  tier: text('tier').notNull().default('free'),
  // Null = indefinite. A past timestamp means the grant has lapsed and the
  // account reads Free again; nothing sweeps the row, the resolver just checks.
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  // How the tier was arrived at: 'manual' (an admin granted it), 'grandfather'
  // (carried over when the paywall shipped), or 'billing' (a future Stripe /
  // StoreKit subscription — nothing writes this yet).
  source: text('source').notNull().default('manual'),
  // Why it was granted. Required on a manual grant.
  note: text('note'),
  // Who granted it. Null once that account is deleted; the name is kept beside
  // it so the record still says where the grant came from.
  grantedBy: text('granted_by').references(() => users.id, { onDelete: 'set null' }),
  grantedByName: text('granted_by_name'),
  grantedAt: integer('granted_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type UserMembershipRow = typeof userMemberships.$inferSelect;

// ---- Administrator Log ----
//
// The record of what admins DO. Append-only in spirit: a row is created and may
// later be resolved, never rewritten to say something else happened.
//
// It holds administrative ACTIONS only — chiefly manual membership grants. The
// bug reports, support requests and early-access leads that also appear on the
// Administrator Log screen are deliberately NOT copied in here: they are
// projected at read time from their own tables (adminLog.ts), so closing a bug
// report in the Bug Reports screen turns its log entry green by itself. Storing
// a second copy of their state is how two screens end up disagreeing about
// whether a ticket is open.
//
// `state` drives the colour, and the three are distinct meanings rather than a
// severity ladder: 'open' (red) still needs somebody, 'resolved' (green) was
// dealt with, 'info' (gray) is a record of something that happened and asks
// nothing of anyone.
export const ADMIN_LOG_STATES = ['open', 'resolved', 'info'] as const;
export type AdminLogState = (typeof ADMIN_LOG_STATES)[number];

export const adminLog = sqliteTable('admin_log', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(), // 'membership.granted' | 'membership.revoked' | …
  state: text('state').notNull().default('info'),
  title: text('title').notNull(),
  detail: text('detail'),
  // Who acted, and who it was done to. Both keep a denormalized name so the log
  // still reads correctly after a rename or a deleted account.
  actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
  actorName: text('actor_name'),
  targetUserId: text('target_user_id').references(() => users.id, { onDelete: 'set null' }),
  targetName: text('target_name'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
  resolvedBy: text('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  resolvedByName: text('resolved_by_name'),
});
export type AdminLogRow = typeof adminLog.$inferSelect;

// ---- Developer Blog ----
//
// The Developer Terminal's idea board. A post is written either by a signed-in
// founder-level user or by "VTS Development" — the terminal's own development
// account, which is what Claude Code posts as. That is an `authorKind`, not a
// real user row, deliberately: there is no account to sign in as, so nothing can
// authenticate as VTS Development and no password exists to leak.
export const DEV_BLOG_AUTHORS = ['user', 'vts_development'] as const;
export type DevBlogAuthorKind = (typeof DEV_BLOG_AUTHORS)[number];

export const devBlogPosts = sqliteTable('dev_blog_posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  authorKind: text('author_kind').notNull().default('user'),
  authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
  authorName: text('author_name').notNull(),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  // Set on a post that came from a checked-in seed entry (devBlog/seeded.ts), so
  // reseeding on boot updates that post instead of adding a duplicate. Null for
  // anything typed into the screen.
  seedKey: text('seed_key').unique(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export type DevBlogPostRow = typeof devBlogPosts.$inferSelect;

export const devBlogReplies = sqliteTable('dev_blog_replies', {
  id: text('id').primaryKey(),
  postId: text('post_id')
    .notNull()
    .references(() => devBlogPosts.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  authorKind: text('author_kind').notNull().default('user'),
  authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
  authorName: text('author_name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export type DevBlogReplyRow = typeof devBlogReplies.$inferSelect;
