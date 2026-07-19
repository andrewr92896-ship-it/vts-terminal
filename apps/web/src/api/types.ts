import type { WorkspaceKey } from '../theme/themes';

// Granular, admin-assigned roles (mirror of backend auth/rbac.ts ROLE_KEYS).
// A user can hold any combination.
export type RoleKey =
  | 'admin'
  | 'trading'
  | 'trading_viewer'
  | 'funded'
  | 'studies';

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
  // Current session block (up to 100 questions, resets every 100). Only live
  // rows carry it — a banked run has no live block, so these are null/0.
  sessionScore: number | null; // % correct in the current block
  sessionAttempted: number; // answers in the current block (0..100)
  sessionCorrect: number; // correct answers in the current block
  archived: boolean; // true for a banked (reset) run
  when: number | null; // when the run was banked (ms); null for live rows
  isMe: boolean; // the caller's current live row
}

// ---- Studies: mock tests (mirror of apps/api/src/studies/tests.ts) ----
// Per-topic correct/total for a finished test, keyed by topic name.
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
  // The user's profile picture as a data URL, or null when unset.
  avatarUrl: string | null;
  roles: RoleKey[];
  // Admin-assigned recognition badge keys (see BadgeType). Unioned with the
  // auto badges from the badge registry when rendered next to the name.
  badges: string[];
  // The trading team the user belongs to (or null). Scopes the Studies
  // leaderboards to teammates; the Trading workspace itself stays shared.
  teamId: string | null;
  teamName: string | null;
  viewBrokerage: boolean;
  mustChangePassword: boolean;
  isDemo: boolean; // the public, read-only demo account
  access: {
    label: string;
    workspaces: WorkspaceKey[];
    readOnlyWorkspaces: WorkspaceKey[];
    // Whether the private Funded (prop-challenge) section is revealed. Never true
    // for the demo account.
    funded: boolean;
  };
}

// A member of a team, as shown in the admin Teams roster.
export interface TeamMember {
  id: string;
  displayName: string;
  username: string;
  roles: RoleKey[];
  active: boolean;
}

// A trading team as shown in the admin team-management panel (mirror of the
// backend TeamView).
export interface Team {
  id: string;
  name: string;
  memberCount: number;
  members: TeamMember[];
  createdAt: number;
}

// A recognition badge type (mirror of the backend BadgeTypeView). Rendered as a
// small icon next to a member's name. `autoRole`, when set, means everyone with
// that role shows the badge automatically.
export interface BadgeType {
  id: string;
  key: string;
  label: string;
  icon: string;
  color: string;
  description: string | null;
  autoRole: string | null;
  builtin: boolean;
  position: number;
}

// One editable AI system prompt (mirror of the backend admin ai-prompts view).
export interface AiPrompt {
  id: string;
  label: string;
  group: string;
  description: string;
  def: string; // the built-in default
  placeholder: string | null;
  multiline: boolean;
  value: string; // the effective text (override or default)
  overridden: boolean;
}

// One release note (mirror of the backend PatchNoteView).
export interface PatchNoteEntry {
  id: string;
  version: string;
  dateLabel: string;
  notes: string[];
  status: 'draft' | 'published';
  position: number;
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

// A team reference attached to leaderboard responses so the board can be
// labelled with the team it's scoped to.
export interface TeamRef {
  id: string;
  name: string;
}

// A public early-access lead submitted from the login screen (mirror of the
// backend EarlyAccessView).
export interface EarlyAccessRequest {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  phone: string | null;
  source: string;
  createdAt: number;
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
  badges: string[];
  teamId: string | null;
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
// question ids Claude classified into it from the study set.
export interface StudySection {
  id: string;
  name: string;
  questionIds: number[];
}

// ---- Team-authored study games (decks) ----
// A quiz a team built for itself (AI-generated or from an uploaded file). Shared
// across the whole team; played with the level-up mechanics.
export interface DeckQuestion {
  seq: number;
  topic: string;
  stem: string;
  options: { label: 'A' | 'B' | 'C' | 'D'; text: string }[];
  answer: 'A' | 'B' | 'C' | 'D';
  explanation: string | null;
  // The game this question originally came from, on a combined ("merged") game
  // (null/absent otherwise). Powers the optional "guess the source" play mode.
  sourceName?: string | null;
}

export interface TeamDeck {
  id: string;
  name: string;
  description: string | null;
  source: string; // 'ai_topic' | 'upload' | 'sample'
  isSample: boolean;
  categories: string[];
  questionCount: number;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: number;
}

export interface TeamDeckDetail extends TeamDeck {
  questions: DeckQuestion[];
}

// ---- Team-authored flashcard sets ----
// A term/definition set a team built for itself (typed in, AI-generated, or from
// an uploaded file). Shared across the whole team; studied with the auto-rotate
// flashcard experience.
export interface Flashcard {
  seq: number;
  term: string;
  def: string;
  topic: string | null;
}

export interface TeamFlashcardSet {
  id: string;
  name: string;
  description: string | null;
  source: string; // 'manual' | 'ai_topic' | 'upload' | 'sample'
  topics: string[];
  cardCount: number;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: number;
}

export interface TeamFlashcardSetDetail extends TeamFlashcardSet {
  cards: Flashcard[];
}

// A card as typed/reviewed in the composer before a set is created (no seq yet
// for hand-typed rows; the preview step assigns seq for the review list).
export interface FlashcardInput {
  term: string;
  def: string;
  topic?: string | null;
}

// ---- Team-authored study guides (slide presentations) ----
// A study guide a team built: an ordered slideshow of slides, each with a title,
// a body, and an optional screenshot. Built through a back-and-forth chat with
// VTS AI (which drafts the slide text) plus screenshots the author attaches.
export interface GuideSlide {
  title: string;
  body: string;
  // A base64 data URL of a screenshot the author attached, or null/absent.
  image?: string | null;
}

export interface StudyGuide {
  id: string;
  name: string;
  description: string | null;
  slideCount: number;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface StudyGuideDetail extends StudyGuide {
  slides: GuideSlide[];
}

// One slide as the guide-builder conversation returns it: the model echoes the
// `id` of a slide it kept (so the client can preserve an attached screenshot) or
// the literal "new" for a slide it just created.
export interface GuideDraftSlide {
  id: string;
  title: string;
  body: string;
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

// A trader's position designation (Chief Strategist / Chief Analyst), mirror of
// the backend TradeDesignation. When a position's owner holds one of these
// badges, the position is coloured with it across the desk (Live Wall, Trade
// Log, History). `icon`/`color` come live from the badge registry.
export interface TradeDesignation {
  key: string;
  label: string;
  color: string;
  icon: string;
  emoji: string;
}

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
  designation?: TradeDesignation | null; // owner's Chief Strategist/Analyst badge
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
  // Every instrument the desk has traded (from the Trade Log + History), so the
  // per-instrument buffer picker can offer them. Auto-derived server-side.
  instruments: string[];
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

// ---- Trading — Live Wall boards (mirror of apps/api/src/trading/boards.ts) ----
// A saved, customizable grid of chart/watchlist tiles the trader arranges on
// the Live Wall ("presets").
export type BoardTileKind = 'chart' | 'watchlist' | 'positions' | 'news' | 'calendar' | 'alerts';

export interface BoardTile {
  id: string;
  kind: BoardTileKind;
  // Grid geometry (react-grid-layout units).
  x: number;
  y: number;
  w: number;
  h: number;
  // Chart tiles
  symbol?: string; // TradingView symbol, e.g. "OANDA:EURUSD"
  interval?: string; // TradingView interval, e.g. "15", "60", "D"
  style?: string; // candle style code (1 = candles, 8 = Heikin Ashi, …)
  studies?: string[]; // indicator ids, e.g. "RSI@tv-basicstudies"
  // Watchlist tiles
  symbols?: string[];
  title?: string;
  // 'scroll' (the auto-scrolling ticker tape, default) or 'static' (a stationary
  // quote list with every symbol visible at once).
  watchlistMode?: 'scroll' | 'static';
  // Positions tiles — how the open positions are laid out inside the tile:
  // 'list' (the compact default) or 'cards' (the full Live Wall trading cards).
  // The '-expand' variants use the same layouts but grow the tile vertically to
  // fit every open trade (no inner scroll) instead of scrolling in a fixed cell.
  positionsView?: 'list' | 'cards' | 'list-expand' | 'cards-expand';
  // News tiles — which topic subfeed to show ('all' or a NEWS_FEEDS key, e.g.
  // 'fed', 'eurusd', 'btc'). Undefined → all headlines.
  newsFeed?: string;
  // News & Calendar tiles — the lowest impact to show: 'all', 'medhigh'
  // (medium & up, the default) or 'high' (high only).
  minImpact?: 'all' | 'medhigh' | 'high';
  // Alerts tiles — which TradingView alerts to show: 'active' (every
  // non-dismissed alert, the default) or 'new' (unanalyzed alerts only).
  alertsFilter?: 'active' | 'new';
}

export interface BoardLayout {
  tiles: BoardTile[];
}

export interface TradingBoard {
  id: string;
  name: string;
  layout: BoardLayout;
  isDefault: boolean;
  updatedAt: number;
}

export interface BoardInput {
  name?: string;
  layout?: BoardLayout;
  isDefault?: boolean;
}

// ---- Trading — Market News (mirror of apps/api/src/trading/news.ts) ----
export type NewsImpact = 'high' | 'medium' | 'low';
export type NewsBias = 'bullish' | 'bearish' | 'neutral';
export type NewsCategory = 'markets' | 'geopolitical' | 'economic' | 'crypto' | 'other';

export interface NewsItem {
  id: string;
  title: string;
  body: string | null;
  tradeNote: string | null;
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
  explainer: string | null;
  source: string | null;
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
  designation: TradeDesignation | null; // owner's Chief Strategist/Analyst badge
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
// The Team Chat message. Scoped to the sender's trading team; the avatar is the
// sender's current profile picture (data URL) or null.
export interface ChatMessage {
  id: string;
  author: string;
  avatar: string | null;
  // The sender's roles + assigned badge keys, so their recognition icons render
  // next to the name in the feed.
  roles: RoleKey[];
  badges: string[];
  body: string;
  createdAt: number;
  mine: boolean;
}

// The team-chat feed response. `eligible` is false when the viewer is not on a
// trading team (see `reason`), so the UI can explain the trading-team feature.
export type TeamChatReason = 'ok' | 'no_trading' | 'no_team';
export interface TeamChatFeed {
  eligible: boolean;
  reason: TeamChatReason;
  teamName: string | null;
  messages: ChatMessage[];
}

// One in-portal notification (shown in the top-bar bell). Chat notifications
// carry the teammate's avatar; suggestion/bug notifications are admin-only.
export type NotificationKind = 'chat' | 'suggestion' | 'bug';
export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  author: string;
  avatar: string | null;
  createdAt: number;
}

export interface Announcement {
  id: string;
  author: string;
  title: string;
  body: string;
  createdAt: number;
}

// ---- Feedback: suggestions & bug reports (mirror of apps/api/src/feedback) ----
export interface Suggestion {
  id: string;
  author: string;
  body: string;
  status: string; // 'new' | 'reviewed'
  createdAt: number;
}

export interface BugMessage {
  id: string;
  role: 'user' | 'ai';
  body: string;
  createdAt: number;
}
export interface BugReport {
  id: string;
  author: string;
  summary: string;
  status: string; // 'open' | 'submitted' | 'resolved'
  createdAt: number;
  updatedAt: number;
  messages: BugMessage[];
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
  designation: TradeDesignation | null; // owner's Chief Strategist/Analyst badge
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
