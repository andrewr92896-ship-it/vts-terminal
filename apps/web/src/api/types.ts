import type { WorkspaceKey } from '../theme/themes';

// Granular, admin-assigned roles (mirror of backend auth/rbac.ts ROLE_KEYS).
// A user can hold any combination. (`funded` is retired — the Funded tracker is
// a per-user opt-in under Advanced Trading now, not a granted role.)
export type RoleKey =
  | 'founder'
  | 'software_developer'
  | 'admin'
  | 'employee'
  | 'member';

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

// The optional parts of the terminal a user turns on for themselves in My Terminal ▸
// Feature Access. Everything else — Markets, Investments, Studies, My Terminal,
// Site Help — is included with every account and never appears here. Funded is
// nested under Advanced Trading and cannot be on without it. Matches the
// backend's UserFeatures (features/service.ts).
export interface UserFeatures {
  advancedTrading: boolean;
  funded: boolean;
  // When the user acknowledged what the trading desk does (ms), or null.
  tradingAckAt: number | null;
  // Private mode. Retired as a switch — trade visibility is self-only now, so
  // there was nothing left for it to hide. Still sent by the server, still
  // stored, but nothing in the UI reads it.
  shareBook: boolean;
  // When the user acknowledged what sharing exposes (ms), or null.
  bookAckAt: number | null;
  // Trading Teams — GRANTED by a software developer, never chosen. This is the
  // one flag on this object the user cannot change about themselves, and it is
  // what every team surface in the terminal is hidden behind. False for almost
  // every account at launch; founder-level accounts always read true.
  tradingTeams: boolean;
}

// Matches the backend's PublicUser shape (auth/rbac.ts).
export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  // Off the public study leaderboards. Set in My Terminal ▸ Preferences; the
  // board still shows you your own row either way.
  hideFromLeaderboards: boolean;
  // The user's profile picture as a data URL, or null when unset.
  avatarUrl: string | null;
  roles: RoleKey[];
  // Admin-assigned recognition badge keys (see BadgeType). Unioned with the
  // auto badges from the badge registry when rendered next to the name.
  badges: string[];
  // The clock this user reads the terminal on — 'auto' (follow the device) or an
  // IANA zone name. Stored on the account, so it follows them between devices.
  // Never null: an account that has never chosen gets the Eastern default.
  displayTimezone: string;
  // The screen the terminal opens on (My Terminal ▸ Settings), as raw
  // workspace/section keys. Null = never chosen, which keeps the original
  // behaviour. Resolved at launch rather than trusted: what this account can
  // reach depends on roles, opt-ins and membership, all of which can move after
  // the choice was stored, so an unreachable home falls back.
  homeWorkspace: string | null;
  homeScreen: string | null;
  // The trading team the user belongs to (or null). Scopes the Studies
  // leaderboards to teammates; the Trading workspace itself stays shared.
  teamId: string | null;
  teamName: string | null;
  viewBrokerage: boolean;
  mustChangePassword: boolean;
  // The user has not yet accepted the current Terms of Service / Privacy Policy.
  // When true, App gates them into the acceptance screen before the terminal
  // renders. Never true for the read-only demo.
  mustAcceptTerms: boolean;
  isDemo: boolean; // the public, read-only demo account
  // The developer preview this SESSION is in ('free' | 'premium' | 'max' |
  // 'public'), or null. Set server-side, so everything above already reports the
  // previewed account: the roles, the workspaces and the membership are all what
  // that tier really gets, which is what makes a preview the production
  // experience rather than a costume.
  //
  // Its presence is the authority to change or leave one, because previewing as
  // the public narrows `roles` to a plain member and a role check would take the
  // way out with it.
  preview: PreviewMode | null;
  /** Whether this account may enter a preview — decided from its REAL roles. */
  canPreview: boolean;
  access: {
    label: string;
    workspaces: WorkspaceKey[];
    readOnlyWorkspaces: WorkspaceKey[];
    // The optional features this user has turned on for themselves (My Terminal ▸
    // Feature Access). Drives which workspaces the sidebar draws; the server
    // re-checks every endpoint regardless.
    features: UserFeatures;
    // Whether the Funded (prop-challenge) section is revealed — the Funded
    // opt-in, nested under Advanced Trading. Never true for the demo account.
    funded: boolean;
    // Whether the Employee Portal (/employee) launch row is revealed. Reaching
    // that terminal still requires a separate sign-in there. Never true for the demo.
    employee: boolean;
    // Whether the user carries admin capability (admin or founder-level).
    admin: boolean;
    // Whether the user is founder-level (founder or software_developer).
    founder: boolean;
    // Whether this is the terminal owner account (only the owner can grant the
    // Founder / Software Developer roles).
    owner: boolean;
    // The paid tier this account holds and which paid features it reaches.
    // Separate axis from `features` above: features are what the user has ASKED
    // to see, this is what they are ALLOWED to see.
    membership: MembershipView;
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

// ---- My Terminal: user-created Trading Teams (mirror of userTeams/service.ts) ----
export interface TeamMemberPermissions {
  canCreateStudyGuides: boolean;
  canInvite: boolean;
  canManageBadges: boolean;
  canRemoveMembers: boolean;
  canEditTeam: boolean;
  canDeleteTrades: boolean; // remove/restore any teammate's trade (the leader always can)
}
export interface UserTeamMember {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isLeader: boolean;
  badge: string | null;
  // The colour this person's open positions are washed in on every trade tile.
  // The key says which swatch is selected; the hex is what the tiles are drawn
  // in. Both come from the server — the palette lives there and nowhere else, so
  // a swatch can never be a colour the wall does not paint.
  tileColor: string | null;
  tileColorHex: string | null;
  permissions: TeamMemberPermissions;
  joinedAt: number;
}
export interface UserTeamInvite {
  id: string;
  invitedUserId: string;
  username: string;
  displayName: string;
  status: string;
  createdAt: number;
}
export interface MyTeam {
  id: string;
  name: string;
  leaderId: string;
  isLeader: boolean;
  myPermissions: TeamMemberPermissions;
  members: UserTeamMember[];
  invites: UserTeamInvite[];
  // Tile colours for the positions that belong to nobody in particular. Funded
  // always resolves to a hex (the gray those tiles have always carried); manual
  // is null until somebody chooses one.
  fundedTileColor: string | null;
  fundedTileColorHex: string;
  manualTileColor: string | null;
  manualTileColorHex: string | null;
  createdAt: number;
}
// One choice in the trade tile palette, exactly as the server sends it.
export interface TileColorOption {
  key: string;
  label: string;
  hex: string;
}
export interface IncomingInvite {
  id: string;
  teamId: string;
  teamName: string;
  invitedByName: string | null;
  createdAt: number;
}
export interface MyPortalData {
  team: MyTeam | null;
  incomingInvites: IncomingInvite[];
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
  /** 'new' until an admin has dealt with the lead, then 'handled'. */
  status: string;
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
  /**
   * The paid tier this account holds. Resolved rather than read off a row:
   * admins, developers and founders are always Max by role and have no stored
   * grant, so a missing membership does not mean Free.
   */
  membership: Membership;
  /**
   * Whether this account has been granted Trading Teams. Resolved the same way
   * membership is — founder-level accounts hold it by role with no stored row —
   * so false really means "cannot see teams", not "no row yet". Granted from
   * Admin ▸ Users by a software developer, and nowhere else.
   */
  tradingTeams: boolean;
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
export interface AiBudget {
  used: number;
  limit: number;
  remaining: number;
}

// Two separate monthly allowances: a text question and a screenshot read cost an
// order of magnitude apart, so they are counted apart. The flat used/limit/
// remaining mirror the TEXT budget, which is what an ordinary question spends.
export interface AiUsage {
  used: number;
  limit: number;
  remaining: number;
  text: AiBudget;
  vision: AiBudget;
  // Background AI the terminal ran on its own schedule this month. Admins only;
  // null for everyone else. Not a budget — nothing caps it.
  system: number | null;
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
  // What each category is worth when a practice test is scored the way the real
  // exam is — {categoryName: weight}, as the author typed them. Null = the
  // author never set weights, so the game scores plainly. Deliberately NOT the
  // same as every weight being zero, which is a game with nothing on the paper.
  categoryWeights: Record<string, number> | null;
  questionCount: number;
  // Whether this game has a leaderboard at all: built-in games (ranked across
  // every copy on the install) and package-backed ones (ranked among the
  // package's own audience) do; a legacy user-made game does not, and its
  // endpoint answers 404 so the tab can be hidden rather than opened empty.
  hasLeaderboard: boolean;
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
  // The slide's stable stored identity, assigned by the server. Round-trip it
  // on save: a lesson refers to slides by this, so dropping it would leave the
  // lesson describing slides that no longer exist. Absent on legacy slides
  // written before ids existed, and on a slide just added in the editor.
  id?: string | null;
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
// 'manual' is a hand-kept position on a manual connection — the server has sent
// it since manual books existed (trading/manual.ts) and this mirror simply
// omitted it, so a screen comparing against it got a type error for a value that
// genuinely arrives.
export type BrokerKey = 'ftp' | 'oanda' | 'kraken' | 'tradestation' | 'manual';

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
  id: string; // `${connectionId}:${broker}:${brokerTradeId}`
  connectionId: string; // the broker connection this position came from
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
  // The colour this tile is washed in — whose position it is, or that it is a
  // funded / manual one. Resolved server-side from the group's palette, so no
  // screen maps a person to a colour and two surfaces cannot disagree about
  // whose trade is whose. Absent/null = no wash, the appearance every tile had
  // before the group set any colours.
  tileColor?: string | null;
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
  // 'sample' means this desk has never connected a broker, so the wall previews
  // itself with representative trades. 'unavailable' means one IS connected and
  // cannot be read — never sample data in that case, because invented positions
  // would hide the broken feed the trader has to go and fix.
  source: 'live' | 'sample' | 'unavailable';
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

// A trader who appears in the desk-settings "whose settings" picker.
export interface DeskMember {
  id: string;
  name: string;
}

// A trader's own desk settings. Each trader has their own; a desk lead (team
// leader / admin) can also view and change a teammate's (see `userId` /
// `editableMembers`).
export interface DeskSettings {
  breakEvenMode: BreakEvenMode;
  breakEvenPct: number;
  breakEvenAmount: number;
  breakEvenOverrides: BreakEvenOverride[];
  // Ignore broker fills under this many units in the Trade Log / History (the
  // trader's "test trade" floor). 0 = keep everything.
  minTradeUnits: number;
  // Every instrument the team has traded (from the Trade Log + History), so the
  // per-instrument buffer picker can offer them. Auto-derived server-side.
  instruments: string[];
  // Response-only: the trader these settings belong to, and the roster the
  // caller may switch between (their whole team if a desk lead, else just self).
  userId?: string;
  editableMembers?: DeskMember[];
}

// ---- Trading — the Trade Desk (live order placement) ----
// Mirrors apps/api/src/trading/orderDesk.ts + brokers/oandaOrders.ts. Only the
// trader's OWN accounts appear here: teammates' positions are read from the
// team-scoped Live Wall, and there is no path that trades anyone else's account.

export type DeskOrderType = 'market' | 'limit' | 'stop';
export type DeskOrderKind = 'entry' | 'close' | 'modify' | 'cancel';
export type DeskOrderStatus = 'filled' | 'accepted' | 'rejected';

export interface DeskAccount {
  connectionId: string;
  label: string;
  broker: string; // 'oanda' | 'kraken' — which venue this account is at
  env: 'practice' | 'live';
  accountTail: string; // tail of the broker account id (or API key), shown as "••…"
  // True where a buy commits the full cash cost and a sell disposes of something
  // already held (crypto spot), false where the account posts margin.
  spot: boolean;
  // How many protective orders the venue attaches to an entry: OANDA takes a
  // stop *and* a target, crypto spot takes exactly one.
  maxProtectiveOrders: number;
  // Whether a live position's stop/target can be moved after the fact.
  canAmendProtection: boolean;
  currency: string;
  balance: number | null;
  nav: number | null;
  unrealizedPl: number | null;
  marginUsed: number | null;
  marginAvailable: number | null;
  openTradeCount: number | null;
  ok: boolean;
  error: string | null;
}

export interface DeskInstrument {
  symbol: string; // "EUR_USD", "XBTUSD"
  instrument: string; // "EUR/USD", "BTC/USD"
  displayName: string;
  type: string; // CURRENCY / CFD / METAL / CRYPTO
  pipSize: number;
  displayPrecision: number; // max decimals a price may carry
  tradeUnitsPrecision: number; // max decimals a size may carry
  minimumTradeSize: number;
  maximumOrderUnits: number | null;
  marginRate: number | null;
  // Minimum order *value* in the quote currency, where the venue has one — a
  // size above the minimum size can still be worth too little to accept.
  minimumOrderCost: number | null;
  // False when the venue has restricted the instrument (a crypto pair in
  // cancel-only or post-only). A closed market is a property of the quote.
  tradeable: boolean;
}

// A coin a spot account holds. Spot has no position to close: what you own is a
// balance, and selling it is an ordinary order placed from the ticket.
export interface DeskHolding {
  connectionId: string;
  connectionLabel: string;
  currency: string;
  asset: string; // "BTC", or "BTC.S" when staked
  instrument: string | null; // the pair it can be priced and sold through
  units: number;
  onOrder: number; // already committed to a resting order
  price: number | null;
  value: number | null;
  staked: boolean; // staked balances cannot be sold without unstaking first
  minimumTradeSize: number | null;
}

export interface DeskQuote {
  instrument: string;
  bid: number | null;
  ask: number | null;
  spread: number | null;
  tradeable: boolean;
  time: number | null;
  // Quote currency → account currency, so a stop can be priced in real money on
  // any instrument (not just the ones quoted in the account's own currency).
  quoteHomeFactor: number | null;
}

// The order ticket's quick-size buttons, as this trader has set them up (mirror
// of apps/api/src/trading/ticketPresets.ts). A null ladder means "the built-in
// one" — the defaults live in the web (workspaces/trading/ticketPresets.ts),
// because that is where they are rendered from before this ever loads.
export type TicketPresetMode = 'units' | 'per_step' | 'cost';

export interface TicketPresets {
  mode: TicketPresetMode | null;
  units: number[] | null;
  fractional: number[] | null;
  step: number[] | null;
  cost: number[] | null;
  showMargin: boolean;
  /** At or above this share of free margin (cash, on spot) a preset reads red. */
  marginWarnPct: number;
}

export interface DeskWorkingOrder {
  id: string;
  connectionId: string;
  connectionLabel: string;
  type: string; // LIMIT / STOP / MARKET_IF_TOUCHED
  instrument: string;
  units: number; // signed: + long / − short
  price: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  timeInForce: string | null;
  createdAt: number | null;
  tradeId: string | null;
}

// One row of the order journal — every order sent, including the refused ones.
export interface DeskOrderRecord {
  id: string;
  connectionId: string;
  broker: string;
  kind: DeskOrderKind;
  instrument: string;
  side: TradeSide | null;
  orderType: DeskOrderType | null;
  units: number | null;
  requestedPrice: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  status: DeskOrderStatus;
  brokerOrderId: string | null;
  brokerTradeId: string | null;
  fillPrice: number | null;
  realizedPl: number | null;
  errorCode: string | null;
  error: string | null;
  createdAt: number;
}

export interface PlaceOrderInput {
  connectionId: string;
  instrument: string;
  side: TradeSide;
  units: number;
  type: DeskOrderType;
  price?: number | null;
  takeProfit?: number | null;
  stopLoss?: number | null;
}

export interface PlaceOrderResult {
  status: 'filled' | 'accepted';
  orderId: string | null;
  tradeId: string | null;
  fillPrice: number | null;
  units: number | null;
  instrument: string;
  side: TradeSide;
  env: 'practice' | 'live';
}

export interface CloseOrderInput {
  connectionId: string;
  tradeId: string;
  instrument: string;
  units?: number | null; // omitted = close the whole position
}

export interface CloseOrderResult {
  closedUnits: number | null;
  price: number | null;
  realizedPl: number | null;
  partial: boolean;
}

export interface ModifyPositionInput {
  connectionId: string;
  tradeId: string;
  instrument: string;
  // Omit to leave alone; null to remove that order.
  takeProfit?: number | null;
  stopLoss?: number | null;
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
  // "Count trades since" cutoff (ms); trades before it are excluded from the
  // Trade Log / History for this connection. Null = count everything.
  historyStartAt: number | null;
  createdAt: number;
}

export interface ConnectionInput {
  broker?: BrokerConnectionKind;
  label?: string;
  active?: boolean;
  creds?: Record<string, string>;
  historyStartAt?: number | null;
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

// One funded (prop-firm) account. There can be several — the trader's own, and
// their teammates' on a desk holding the Trading Teams grant. `isMine` is the
// server's answer to "may I edit this", not a UI convenience.
export interface ChallengeData {
  id: string;
  ownerId: string;
  owner: string;
  isMine: boolean;
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

// Every funded account the viewer may see, their own first.
export interface ChallengesData {
  challenges: ChallengeData[];
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
  // The stop and target held at the prop firm, read off the screenshot the
  // position was imported from. Null means none is known of.
  stopLoss: number | null;
  takeProfit: number | null;
  status: FundedTradeStatus; // 'open' = a live position shown on the Live Wall
  openedAt: number | null;
  closedAt: number | null;
  notes: string | null;
  createdAt: number;
}
export interface FundedAccount {
  id: string;
  // Whose account this is. The funded book is shared across a desk holding the
  // Trading Teams grant, so a card says whose it is; `isMine` is the server's
  // answer to "may I edit this".
  ownerId: string;
  owner: string;
  isMine: boolean;
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
  // The colour funded tiles carry, so the live positions on this screen read the
  // same as the ones on the Live Wall. Every position here is funded, so it is
  // one colour for the screen rather than one per row.
  fundedTileColor: string | null;
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
export type SessionBias = 'bull' | 'bear' | 'both';
export type SessionStatus = 'active' | 'opening' | 'idle';
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export interface DayWindow {
  open: string; // ET 'HH:MM'
  close: string;
  allDay?: boolean; // full 24 hours (open/close ignored)
}
export type WeekSchedule = Partial<Record<Weekday, DayWindow>>;

export interface StrategySession {
  id: string;
  name: string;
  instrument: string | null;
  days: WeekSchedule; // enabled weekdays with their windows
  marketHours: boolean; // filled from the instrument's full market hours
  bias: SessionBias;
  notes: string | null;
  active: boolean;
  status: SessionStatus;
  minsToOpen: number | null;
}

export interface SessionInput {
  name?: string;
  instrument?: string | null;
  days?: WeekSchedule;
  marketHours?: boolean;
  bias?: SessionBias;
  notes?: string | null;
  active?: boolean;
}

// Market-hours lookup result (per weekday ET window) for filling a session.
export interface MarketHoursDay {
  day: Weekday;
  open: string;
  close: string;
}
export interface MarketHoursResult {
  days: MarketHoursDay[];
  note: string;
  model: string;
}

// A user's Strategy Session notification preferences (Trading Alerts screen).
export interface SessionAlertPrefs {
  notifyOpen: boolean;
  notifyClose: boolean;
  notifyPreOpen: boolean;
  preOpenLeadMin: number;
}

// ---- Trading — Live Wall boards (mirror of apps/api/src/trading/boards.ts) ----
// A saved, customizable grid of chart/watchlist tiles the trader arranges on
// the Live Wall ("presets").
// Every kind of tile the wall can carry. The catalog that says what each one is
// called, which group it belongs to and what it costs lives in
// workspaces/trading/tileCatalog.ts; the server's gate mirror is
// apps/api/src/trading/boardTiles.ts. Add a kind in all three.
export type BoardTileKind =
  // Markets — public data, included with every account.
  | 'chart'
  | 'watchlist'
  | 'news'
  | 'calendar'
  | 'marketdata'
  | 'streams'
  | 'clock'
  // The desk — behind the Advanced Trading opt-in.
  | 'ticket'
  | 'positions'
  | 'metrics'
  | 'alerts'
  | 'tradelog'
  | 'closed'
  | 'sessions'
  | 'funded'
  | 'challenge'
  | 'capital'
  // Personal — the user's own money, lists and reading.
  | 'networth'
  | 'portfolio'
  | 'todo'
  | 'notes'
  | 'dividends'
  | 'announcements'
  | 'patchnotes'
  // Studies and the team.
  | 'studystats'
  | 'flashcards'
  | 'leaderboard'
  | 'teamchat';

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
  // Market Data tiles — the series ids to show, in order. Unknown ids are
  // dropped on read (the same rule the Market Data layout follows), so a catalog
  // change never invalidates a saved board.
  seriesIds?: string[];
  // Live-stream tiles — which channel to play, by its catalog `key`. Whether the
  // viewer may play it is their entitlement, re-checked server-side.
  channelKey?: string;
  // Notes tiles — the text itself, saved with the board rather than in a table
  // of its own. A board is already per-user JSON, so a scratchpad needs no
  // migration; the trade-off is that the note belongs to the board it sits on.
  noteText?: string;
  // Study tiles — which study game / flashcard set to report on. Undefined →
  // whichever the learner most recently played.
  deckId?: string;
  // Funded tiles — which funded account to report on. Undefined → all of them.
  accountId?: string;
  // Clock tiles — IANA zone names to show beside the market sessions.
  clockZones?: string[];
  // Feed-shaped tiles (closed trades, announcements, team chat, to do) — how many
  // rows to draw before the tile scrolls.
  limit?: number;
  // To Do tiles — which section to show. Undefined → every section.
  todoSectionId?: string;
  // Trade History / closed-trade tiles — the window they score.
  range?: '7d' | '30d' | '90d' | 'all';
  // Order ticket tiles — the instrument the ticket is set to, in display form
  // ("EUR/USD"). Per tile, so a board can carry a forex ticket beside a crypto
  // one. Deliberately not `symbol`, which is a TradingView symbol elsewhere.
  instrument?: string;
  // Desk Metrics — whose figures this tile reports. A trader's ownerId, or
  // absent/'' for the whole desk. Stored on the tile so a board can carry
  // several of them, each pinned to a different trader, and each stays where it
  // was left. Emptied when a board is shared: a teammate's id means nothing on
  // somebody else's screen.
  trader?: string;
  // How large this tile's contents are drawn, 0.5–2 (absent = 1). Below 1 the
  // tile lays out in a bigger box and is painted down to fit, so it carries
  // more; above 1 it carries less, larger.
  zoom?: number;
}

export interface BoardLayout {
  tiles: BoardTile[];
  // The workspace width in grid columns — the dotted workspace area the board
  // is arranged inside (ChartBoard). Absent = 12, the width every earlier board
  // was built on; wider packs more, narrower columns onto the same screen so a
  // television shows tiles side by side. Phones ignore it (one flattened
  // column).
  cols?: number;
}

export interface TradingBoard {
  id: string;
  name: string;
  layout: BoardLayout;
  isDefault: boolean;
  // The board a PHONE opens on, kept separately from the desktop default: a
  // board is arranged against a screen, and a dense desktop wall flattened into
  // one phone column is not the board anybody wants in their hand. No board
  // carrying it falls back to `isDefault`.
  isDefaultPhone: boolean;
  updatedAt: number;
  /** Published to this team, or null when private. */
  sharedTeamId: string | null;
  /** Who published it. Present only on a teammate's board. */
  sharedBy?: string;
}

// Every board response carries both lists: the reader's own, and what their
// teammates have published. One shape so the picker is never rendering a stale
// half of the menu after a save.
export interface BoardsResponse {
  boards: TradingBoard[];
  teamBoards: TradingBoard[];
  /** Whether the reader is on a team, i.e. has anybody to publish a layout to. */
  onTeam: boolean;
}

export interface BoardInput {
  name?: string;
  layout?: BoardLayout;
  isDefault?: boolean;
  isDefaultPhone?: boolean;
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
  // Whether the server is AI-tagging headlines right now (opt-in, and off by
  // default). Gates the directional cue on both news surfaces: a bias stored
  // while tagging was on is real, while an untagged headline's 'neutral' is only
  // the column default, so the cue is drawn for all of them or none.
  aiTagging: boolean;
}

// A followed YouTube channel on the Market News live-stream wall. Identity
// fields are the trader's saved config; the live-state fields are attached by
// the server (offline for everyone until a go-live poller is wired — see
// `liveConfigured` on the payload).
export interface StreamChannel {
  key: string;
  name: string;
  handle: string;
  channelId: string;
  // Broadcasts continuously (a 24/7 stream) rather than only when there is
  // something to cover. A catalog fact, not a live reading.
  alwaysOn?: boolean;
  // Included with every account (Yahoo Finance) versus part of the paid wall. A
  // fact about the CHANNEL, not the viewer — every paid row is marked for
  // everybody, including a Max member, so the rail says what each row costs.
  // Whether this viewer may open it is their entitlement, checked separately.
  free?: boolean;
  live: boolean;
  streamTitle?: string;
  viewers?: string;
  lastLive?: string;
  lastTitle?: string;
  // The video this channel is broadcasting (or has scheduled), but only when the
  // server resolved it from somewhere authoritative. Absent does NOT mean the
  // channel is dark — the server can establish that a channel is live without
  // naming a video id it trusts, and the tile then plays the channel-based
  // embed. Playing a wrongly-guessed id renders "This video is unavailable".
  liveVideoId?: string;
  // A resolved video that has not started yet: embeddable (YouTube's own
  // waiting room, which rolls into the stream by itself) but not badged LIVE.
  upcoming?: boolean;
  // Broadcasting, but the channel has restricted embedding — no player on this
  // site can show it. The tile says so and links out instead of rendering
  // YouTube's bare "Video unavailable", which looks like a fault and is not one.
  embedBlocked?: boolean;
  // True once the server has actually read this channel's live state. Absent
  // means "not looked at yet", which is why the tile still falls back to the
  // optimistic embed rather than claiming the channel is dark.
  liveChecked?: boolean;
}

// A trader's personal view over the stream wall — the only part that persists
// per user. The channel catalog is server-side and identical for everyone.
export interface MarketNewsView {
  watching: string[];
  docked: string | null;
  cols: number;
  notify: Record<string, boolean>;
}

// What the screen receives: the catalog with live-state, plus that view state.
export interface MarketNewsStreams extends MarketNewsView {
  channels: StreamChannel[];
  // How many channels this account may play at once — one on free, a wall on
  // Premium and above. Sent by the server rather than derived here, so moving
  // the limit never leaves the client stale (same rule as `featureTiers`).
  maxWatching: number;
}

export interface MarketNewsStreamsPayload {
  streams: MarketNewsStreams;
  // False until a server-side YouTube poller populates viewer counts and go-live
  // pushes. Whether a channel is *playing* no longer depends on it — that is
  // resolved keylessly per channel — so this now only governs the extras.
  liveConfigured: boolean;
  // The FOMC statement schedule, for the Federal Reserve tile's countdown.
  fomc?: { meetings: string[]; meetingYear: number };
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

// ---- Trading — Market Data (mirror of apps/api/src/trading/marketData.ts and
// apps/api/src/trading/marketDataLayout.ts) ----
export type MarketGroupKey =
  | 'policy'
  | 'inflation'
  | 'labor'
  | 'yields'
  | 'fx'
  | 'commod'
  | 'crypto'
  | 'equity'
  | 'macro'
  | 'session';

export type MarketFreshness = 'live' | 'manual' | 'stale';

export interface MarketReview {
  body: string; // who publishes it — 'FOMC', 'BLS', 'Cboe', …
  last: string; // ISO date, or a cadence phrase ('continuous', 'daily · 3:30 PM')
  next: string; // ISO date, 'fomc' (= the next Fed meeting), or '' for tbc
}

export interface MarketSeries {
  id: string;
  group: MarketGroupKey;
  label: string;
  value: string; // display-ready; empty on a session row (computed from the clock)
  unit: string;
  asOf: string;
  source: MarketFreshness;
  money: boolean; // masked in privacy mode
  session: [number, number] | null; // ET minutes-of-day [open, close]
  changes: [string, string, string, string, string]; // 1D, 1W, 1M, YTD, 1Y
  review: MarketReview;
  // False once `value`/`changes` come from a real feed (the FX, dollar-index and
  // crypto rows are quoted from OANDA). True while they are the design's
  // placeholder figures.
  sample: boolean;
}

export interface MarketDataPayload {
  groups: { key: MarketGroupKey; label: string }[];
  series: MarketSeries[];
  periods: string[];
  defaultPins: string[];
  meetings: string[]; // FOMC statement dates as 'MM-DD', 2:00 PM ET
  meetingYear: number;
  // True while ANY series is still showing placeholder figures. The per-series
  // `sample` flag is the precise version.
  sampleValues: boolean;
}

// A metric the trader entered themselves, for anything the feeds don't carry.
export interface CustomMetric {
  id: string;
  group: MarketGroupKey;
  label: string;
  value: string;
  unit: string;
  asOf: string;
  delta: string;
}

export interface MarketDataLayout {
  pinned: string[]; // ordered series ids on the strip
  hidden: string[]; // series removed from the board
  custom: CustomMetric[];
}

// ---- Trading — Trade Log (mirror of apps/api/src/trading/trades.ts) ----
export type TradeStatus = 'open' | 'closed';

export interface TradeRecord {
  id: string;
  ownerId: string; // the user who logged the trade
  owner: string; // that user's username, shown on the trade
  ownerName: string; // that user's display name (preferred for labels/pickers)
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
  unrealizedPl: number | null; // live open P/L for an open broker position; null when closed/manual
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

// A soft-deleted trade shown in the Deleted Trades section (mirror of
// apps/api/src/trading/deleted.ts DeletedTradeRecord).
export interface DeletedTradeRecord {
  id: string;
  kind: 'manual' | 'broker';
  ownerId: string;
  owner: string;
  isMine: boolean;
  broker: string | null;
  instrument: string;
  side: TradeSide;
  status: TradeStatus;
  units: number;
  entryPrice: number;
  exitPrice: number | null;
  realizedPl: number | null;
  openedAt: number | null;
  closedAt: number | null; // null when the trade was still open at deletion
  deletedAt: number;
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
  totalUnrealizedPl: number | null; // desk-wide open (unrealized) P/L across open positions
  avgSlippage: number | null;
}

// What a trade view LEFT OUT, and why. Mirrors the server's ExcludedTrades.
//
// The Trade Log and its metrics are a narrowed view of the desk's real trades: a
// connection's "count trades since" cutoff hides an earlier phase, and the
// "ignore test trades" floor hides connection-test fills. Both are deliberate,
// and both were silent — an export headed "2026-06-01 to 2026-08-09" listed no
// June trades while nine real ones sat behind a July cutoff, which reads as
// "there were no June trades" rather than "June is not being counted".
export interface ExcludedTrades {
  beforeCutoff: number; // opened before their connection's "count trades since"
  belowFloor: number; // under the desk's "test trade" floor
  // The cutoff instant when every exclusion shares one, so a screen can name a
  // date. Null when several connections cut off on different dates.
  cutoffFrom: number | null;
}

export interface TradeLogData {
  trades: TradeRecord[];
  summary: TradeSummary;
  breakEvenPct: number;
  breakEvenMode: BreakEvenMode;
  breakEvenAmount: number;
  breakEvenOverrides: BreakEvenOverride[];
  minTradeUnits: number; // "test trade" floor; sub-floor broker fills already excluded
  excluded: ExcludedTrades; // what this view left out, and why
  // The viewer may remove a teammate's trade, not just their own (team leader,
  // a member granted "Delete trades", or an admin).
  canDeleteAny: boolean;
}

// ---- Trading — the viewer's own capital (mirror of apps/api/src/trading/traderCapital.ts) ----
// Deposited, withdrawn, and what their connected accounts hold right now. Always
// the CALLER'S own — a teammate's deposits are their business.
export type CapitalMode = 'manual' | 'synced';
export interface CapitalFigure {
  value: number | null; // what to show; null = not stated
  mode: CapitalMode;
  manual: number | null; // the typed figure, kept while synced
  synced: number | null; // the last good broker reading
}
export interface TraderCapital {
  deposited: CapitalFigure;
  withdrawn: CapitalFigure;
  // NAV summed across the viewer's own connected accounts. Null when nothing is
  // connected, nothing answered, or the accounts are kept in mixed currencies.
  total: number | null;
  accounts: number;
  unreadable: number; // connected accounts that did not answer, left out of the total
  currency: string | null;
  canSync: boolean; // a connected OANDA account exists to sync from
  syncedAt: number | null;
  otherTransfers: number; // funding events that were not client deposits/withdrawals
  note: string | null; // why a synced figure is stale or partial
}
export interface CapitalPatch {
  deposited?: number | null; // a number also returns the figure to manual mode
  withdrawn?: number | null;
  depositedSync?: boolean;
  withdrawnSync?: boolean;
}

// The Deleted Trades payload — soft-deleted rows plus the viewer's reach over
// them (whoever may delete a teammate's trade may also restore it).
export interface DeletedTradesData {
  trades: DeletedTradeRecord[];
  canDeleteAny: boolean;
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

// ---- Trading — user-authored price alerts (mirror of apps/api/src/trading/priceAlerts.ts) ----
// A personal "notify me when X crosses a level" rule, evaluated server-side.
export type PriceAlertCondition = 'above' | 'below';
export type PriceAlertRepeat = 'once' | 'always';
export type PriceAlertSide = 'above' | 'below';

export interface PriceAlert {
  id: string;
  symbol: string; // TradingView form, e.g. "OANDA:EURUSD"
  condition: PriceAlertCondition;
  threshold: number;
  repeat: PriceAlertRepeat;
  note: string | null;
  active: boolean;
  lastSide: PriceAlertSide | null;
  lastPrice: number | null;
  lastFiredAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface PriceAlertInput {
  symbol: string;
  condition: PriceAlertCondition;
  threshold: number;
  repeat?: PriceAlertRepeat;
  note?: string | null;
}

// The price-alerts list plus whether the site's OANDA price source is configured
// (when false, alerts can be saved but forex/metals/index rules won't fire).
// This is a site-level setting — a user's own broker connection has no bearing on
// it, and never did anything for anyone but themselves.
export interface PriceAlertsData {
  alerts: PriceAlert[];
  priceSource: boolean;
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
// `unavailable` is the launch state for almost every account: Trading Teams are
// hidden behind a developer grant, so the chat panel hides the tab entirely
// rather than explaining a feature the reader cannot have.
export type TeamChatReason = 'ok' | 'unavailable' | 'no_trading' | 'no_team';
export interface TeamChatFeed {
  eligible: boolean;
  reason: TeamChatReason;
  teamName: string | null;
  messages: ChatMessage[];
}

// One in-terminal notification (shown in the top-bar bell). Chat notifications
// carry the teammate's avatar; suggestion/bug notifications are admin-only.
export type NotificationKind = 'chat' | 'suggestion' | 'bug' | 'support' | 'violation';
export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  author: string;
  avatar: string | null;
  createdAt: number;
}

// ---- AI guardrails ----

// What the server sends back when VTS AI refused a financial-advice request.
// Present on an otherwise-normal AI reply: the refusal still reaches the user,
// and this is what draws the warning beneath it.
export interface GuardrailHit {
  violationId: string;
  /** Whether this one carried the 30-minute pause (the second in 24 hours). */
  timedOut: boolean;
  timeoutUntil: number | null;
}

export type ViolationStatus = 'open' | 'dismissed' | 'warned' | 'actioned';

// One recorded guardrail violation, for Admin ▸ Rule Breaking. Carries the
// conversation that produced it — the only AI conversation the terminal stores.
export interface AiViolation {
  id: string;
  userId: string;
  userName: string;
  surface: string;
  conversation: { role: string; content: string }[];
  reply: string;
  timedOut: boolean;
  timeoutUntil: number | null;
  status: ViolationStatus;
  reviewedByName: string | null;
  reviewedAt: number | null;
  reviewNote: string | null;
  /** The user pressed "I think the AI made a mistake". */
  disputed: boolean;
  disputedAt: number | null;
  disputeNote: string | null;
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

// ---- Admin message templates (copy library) ----
export type MessageTemplateKind = 'sms' | 'email';

export interface MessageTemplate {
  id: string;
  kind: MessageTemplateKind;
  title: string;
  subject: string | null; // email subject line; null for a text-message template
  body: string;
  createdByName: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface BugMessage {
  id: string;
  role: 'user' | 'ai' | 'admin';
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

// ---- Support tab (chat bubble) — bug / suggestion / general support intake ----
export type SupportKind = 'bug' | 'suggestion' | 'support';

// A general support request (kind 'support'), shown in the admin Support
// section with its AI intake thread. Bugs and suggestions from the Support tab
// are routed to the Bug Reports and Suggestions sections respectively.
export interface SupportRequest {
  id: string;
  author: string;
  summary: string;
  status: string; // 'submitted' | 'resolved'
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
  minTradeUnits: number; // "test trade" floor; sub-floor broker fills already excluded
  excluded: ExcludedTrades; // what this view left out, and why
  // The viewer may remove a teammate's closed trade, not just their own.
  canDeleteAny: boolean;
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

// ---- Investments — the long-term portfolio tracker ----
// Mirrors apps/api/src/investments/*. Every figure here is per-user: this
// workspace has no team scope, unlike Trading.

export type InvestmentAccountKind =
  | '401k'
  | 'roth_401k'
  | '403b'
  | 'ira'
  | 'roth_ira'
  | 'sep_ira'
  | 'simple_ira'
  | 'hsa'
  | 'esa'
  | '529'
  | 'brokerage'
  | 'other';

export type InvestmentAssetClass =
  | 'us_stock'
  | 'intl_stock'
  | 'bond'
  | 'cash'
  | 'real_estate'
  | 'commodity'
  | 'crypto'
  | 'target_date'
  | 'other';

export type InvestmentTxKind =
  | 'contribution'
  | 'employer_match'
  | 'dividend'
  | 'interest'
  | 'buy'
  | 'sell'
  | 'fee'
  | 'withdrawal';

export type InvestmentGoalKind = 'retirement' | 'education' | 'general';

// Where a holding's price came from. `none` means no price exists at all — such
// a holding is excluded from every total rather than counted as zero, which is
// why the screens report `unpricedCount` beside any figure.
export type InvestmentPriceSource = 'live' | 'manual' | 'none';

export interface InvestmentAccount {
  id: string;
  kind: InvestmentAccountKind;
  label: string;
  institution: string | null;
  source: 'manual' | 'plaid' | 'snaptrade';
  cashBalance: number;
  note: string | null;
  active: boolean;
  sortOrder: number;
  value: number;
  holdingsCount: number;
  unpricedCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface InvestmentHolding {
  id: string;
  accountId: string;
  accountLabel: string;
  symbol: string | null;
  name: string;
  assetClass: InvestmentAssetClass;
  quantity: number;
  costBasis: number | null;
  price: number | null;
  priceSource: InvestmentPriceSource;
  previousClose: number | null;
  sector: string | null;
  region: string | null;
  value: number | null;
  gain: number | null;
  gainPct: number | null;
  dayChange: number | null;
  dayChangePct: number | null;
  manualPrice: number | null;
  manualPriceAt: number | null;
  note: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface InvestmentTotals {
  value: number;
  cash: number;
  costBasis: number;
  gain: number;
  gainPct: number | null;
  dayChange: number;
  /** 0..1 — the share of holding value the day move actually covers. */
  dayChangeCoverage: number;
  unpricedCount: number;
  manualCount: number;
  livePricedCount: number;
}

export interface InvestmentBucket {
  key: string;
  label: string;
  value: number;
  pct: number;
}

export interface InvestmentFlag {
  severity: 'note' | 'watch';
  text: string;
}

export interface InvestmentPortfolio {
  accounts: InvestmentAccount[];
  holdings: InvestmentHolding[];
  totals: InvestmentTotals;
  allocation: {
    byClass: InvestmentBucket[];
    bySector: InvestmentBucket[];
    byRegion: InvestmentBucket[];
    flags: InvestmentFlag[];
  };
  livePricesConfigured: boolean;
  asOf: number;
}

export interface InvestmentAccountInput {
  kind: InvestmentAccountKind;
  label: string;
  institution?: string | null;
  cashBalance?: number;
  note?: string | null;
  active?: boolean;
  sortOrder?: number;
}

export interface InvestmentHoldingInput {
  accountId: string;
  symbol?: string | null;
  name: string;
  assetClass: InvestmentAssetClass;
  quantity: number;
  costBasis?: number | null;
  manualPrice?: number | null;
  sector?: string | null;
  region?: string | null;
  note?: string | null;
}

export interface InvestmentTransaction {
  id: string;
  accountId: string;
  accountLabel: string;
  holdingId: string | null;
  kind: InvestmentTxKind;
  amount: number;
  quantity: number | null;
  symbol: string | null;
  occurredAt: number;
  taxYear: number | null;
  note: string | null;
}

export interface InvestmentTransactionInput {
  accountId: string;
  holdingId?: string | null;
  kind: InvestmentTxKind;
  amount: number;
  quantity?: number | null;
  symbol?: string | null;
  occurredAt: number;
  taxYear?: number | null;
  note?: string | null;
}

export interface InvestmentContributionGroup {
  group: string;
  label: string;
  contributed: number;
  employerMatch: number;
  /** Null when the catalog has no IRS figures for that tax year. */
  limit: number | null;
  catchUp: number | null;
  /** The age catch-up starts at — 55 for an HSA, 50 for everything else. */
  catchUpFromAge: number | null;
  /** SECURE 2.0's ages 60–63 amount. It REPLACES the ordinary catch-up. */
  catchUp60to63: number | null;
  limitNote?: string;
  remaining: number | null;
  pct: number | null;
}

export interface InvestmentGoal {
  id: string;
  accountId: string | null;
  accountLabel: string | null;
  kind: InvestmentGoalKind;
  label: string;
  targetAmount: number;
  targetDate: string | null;
  note: string | null;
  current: number;
  pct: number;
}

export interface InvestmentGoalInput {
  accountId?: string | null;
  kind: InvestmentGoalKind;
  label: string;
  targetAmount: number;
  targetDate?: string | null;
  note?: string | null;
}

export interface InvestmentContributions {
  taxYear: number;
  limitsKnown: boolean;
  latestLimitYear: number;
  groups: InvestmentContributionGroup[];
  goals: InvestmentGoal[];
  uncappedContributed: number;
}

export interface InvestmentSnapshotPoint {
  onDate: string;
  value: number;
  contributedToDate: number | null;
}

export interface InvestmentPerformanceSummary {
  startValue: number;
  endValue: number;
  contributed: number;
  marketGain: number;
  marketGainPct: number | null;
  days: number;
}

export interface InvestmentPerformance {
  points: InvestmentSnapshotPoint[];
  summary: InvestmentPerformanceSummary | null;
  totalDays: number;
  rangeDays: number;
}

export interface InvestmentDividends {
  entries: InvestmentTransaction[];
  monthly: { month: string; amount: number }[];
  totalLast12: number;
  totalAllTime: number;
  trailingYieldPct: number | null;
  bySymbol: { symbol: string; amount: number }[];
}

export interface InvestmentProjectionPoint {
  year: number;
  value: number;
  contributed: number;
}

export interface InvestmentProjection {
  points: InvestmentProjectionPoint[];
  startValue: number;
  monthlyContribution: number;
  annualRatePct: number;
  years: number;
}

// ---- My Terminal ▸ Net Worth ----
// Everything you own minus everything you owe. Mirrors
// apps/api/src/myportal/netWorth.ts.

export type NetWorthKind = 'asset' | 'liability';

export type NetWorthCategory =
  | 'cash'
  | 'real_estate'
  | 'vehicle'
  | 'crypto'
  | 'business'
  | 'valuables'
  | 'retirement_other'
  | 'other_asset'
  | 'mortgage'
  | 'auto_loan'
  | 'student_loan'
  | 'credit_card'
  | 'personal_loan'
  | 'other_debt';

export interface NetWorthItem {
  id: string;
  kind: NetWorthKind;
  category: NetWorthCategory;
  label: string;
  /** Always positive; `kind` carries which side of the ledger it is on. */
  value: number;
  note: string | null;
  active: boolean;
  sortOrder: number;
  updatedAt: number;
}

export interface NetWorthItemInput {
  kind: NetWorthKind;
  category: NetWorthCategory;
  label: string;
  value: number;
  note?: string | null;
  active?: boolean;
  sortOrder?: number;
}

export interface NetWorthTracked {
  investments: number;
  trading: number;
  tradingEnabled: boolean;
  /** False when the tracked side could not be totalled; `note` says why. */
  available: boolean;
  note: string | null;
}

export interface NetWorthPoint {
  onDate: string;
  assets: number;
  liabilities: number;
  netWorth: number;
}

export interface NetWorth {
  tracked: NetWorthTracked;
  assets: NetWorthItem[];
  liabilities: NetWorthItem[];
  totals: {
    assets: number;
    liabilities: number;
    /** Null when the tracked side is incomplete — a total with a hole in it
     *  is worse than none, because it looks complete. */
    netWorth: number | null;
    manualAssets: number;
  };
  history: NetWorthPoint[];
  totalDays: number;
  asOf: number;
}

// ---- Memberships (the paid tiers) ----
// Mirrors apps/api/src/memberships/tiers.ts. The server is the enforcer; these
// values only drive locks and upgrade prompts in the UI.

export const MEMBERSHIP_TIERS = ['free', 'premium', 'max'] as const;
export type MembershipTier = (typeof MEMBERSHIP_TIERS)[number];

// Ordered Max first, then Premium — matching how the sidebar stacks its sections
// and how the tier boxes read on the Premium Features screen.
export const PREMIUM_FEATURES = [
  'ai',
  'studyAsk',
  'tradeDesk',
  'teams',
  'teamChat',
  'customStreams',
  // Max because they hold a credential of the USER'S — the rule on the server's
  // FEATURE_TIER: anything somebody pastes a key of their own into is top tier.
  'brokerConnections',
  'pushover',
  'funded',
  'studyExplain',
  'studyCreation',
  'customBoards',
  'premiumBadges',
  'strategySessions',
  'marketData',
  'presetStreams',
  'suggestions',
  'supportChat',
  'alertSettings',
] as const;
export type PremiumFeature = (typeof PREMIUM_FEATURES)[number];

export interface Membership {
  tier: MembershipTier;
  /** Null = never expires. */
  expiresAt: number | null;
  source: 'role' | 'demo' | 'manual' | 'grandfather' | 'billing' | 'none';
  note: string | null;
  grantedByName: string | null;
  grantedAt: number | null;
}

export interface MembershipView extends Membership {
  entitlements: Record<PremiumFeature, boolean>;
  /**
   * Which tier each paid feature needs — what the feature COSTS, as opposed to
   * `entitlements`, which is what this account can reach. The sidebar colours a
   * section by this, so a Max member still sees which sections are paid.
   */
  featureTiers: Record<PremiumFeature, MembershipTier>;
}

// ---- Administrator Log ----
// Mirrors apps/api/src/admin/adminLog.ts. `state` drives the colour: open is
// red (still needs somebody), resolved is green (dealt with), info is gray (a
// record of something that happened, asking nothing of anyone).
export type AdminLogState = 'open' | 'resolved' | 'info';

export interface AdminLogEntry {
  id: string;
  kind: string;
  state: AdminLogState;
  title: string;
  detail: string | null;
  actorName: string | null;
  targetName: string | null;
  createdAt: number;
  resolvedAt: number | null;
  resolvedByName: string | null;
  /** Set on an entry projected from a ticket, so the screen can point at the section that closes it. */
  source: 'bug' | 'support' | 'early_access' | null;
  sourceId: string | null;
}

// ---- Developer Blog ----
// Mirrors apps/api/src/devBlog/service.ts.
export type DevBlogAuthorKind = 'user' | 'vts_development';

export interface DevBlogReply {
  id: string;
  body: string;
  authorKind: DevBlogAuthorKind;
  authorName: string;
  authorAvatar: string | null;
  createdAt: number;
  mine: boolean;
}

export interface DevBlogPost {
  id: string;
  title: string;
  body: string;
  authorKind: DevBlogAuthorKind;
  authorName: string;
  authorAvatar: string | null;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  mine: boolean;
  replies: DevBlogReply[];
}

// ---- credential use audit ----
//
// Every use of a stored broker credential, so the person who owns the key can
// answer "was my key used?". Background polling arrives pre-aggregated by the
// hour (`aggregated: true`, `count` > 1) — the server does not log one row per
// poll, or a 10-second reconcile would write thousands a day per connection.
export type CredentialAuditPurpose =
  | 'order_place'
  | 'order_close'
  | 'order_amend'
  | 'order_cancel'
  | 'desk_read'
  | 'holdings'
  | 'quotes'
  | 'wall_read'
  | 'reconcile'
  | 'backfill'
  | 'capital';

export interface CredentialAuditEntry {
  id: string;
  connectionId: string;
  ownerUserId: string;
  owner: string;
  actorUserId: string | null;
  // Username of whoever caused it; null means the terminal did it on its own
  // schedule rather than a person.
  actor: string | null;
  purpose: CredentialAuditPurpose;
  sourceIp: string | null;
  occurredAt: number;
  count: number;
  aggregated: boolean;
  ok: boolean;
  error: string | null;
}

// ---- Finances: budgeting ----
//
// Money is CENTS everywhere on these types, as integers. The API takes dollars
// on the way in (what the user typed) and answers in cents; conversion happens
// at the edges so nothing in between can drift.
export type BudgetKind = 'income' | 'expense';

export interface BudgetCategory {
  id: string;
  name: string;
  kind: BudgetKind;
  /** Expected monthly figure in cents, or null for "no target". */
  monthlyLimit: number | null;
  icon: string | null;
  sortOrder: number;
  archived: boolean;
  actualCents: number;
  entryCount: number;
}

export interface BudgetEntry {
  id: string;
  categoryId: string;
  categoryName: string;
  kind: BudgetKind;
  amountCents: number;
  note: string | null;
  occurredOn: string;
  source: string;
}

export interface BudgetMonth {
  month: string;
  categories: BudgetCategory[];
  entries: BudgetEntry[];
  incomeCents: number;
  spentCents: number;
  netCents: number;
  plannedIncomeCents: number;
  plannedSpendCents: number;
  plannedNetCents: number;
  /** Whether any expense category has a target — see the service comment. */
  hasTargets: boolean;
}

// ---- Live Wall templates ----
//
// The default layouts a free account chooses between. Editable from the
// Developer Terminal; draft-then-publish, so a half-arranged board never reaches
// a member (see trading/wallTemplates.ts).
export interface TemplateTile {
  kind: BoardTileKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What a member's layout picker offers — published layouts only. */
export interface PublishedWallTemplate {
  key: string;
  label: string;
  blurb: string;
  tiles: TemplateTile[];
}

/** The Developer Terminal's view, drafts included. */
export interface WallTemplate {
  id: string;
  key: string;
  label: string;
  blurb: string;
  published: TemplateTile[];
  draft: TemplateTile[];
  hasDraft: boolean;
  hidden: boolean;
  sortOrder: number;
  updatedAt: number;
}

// ---- Study Packages: import ----
// Mirrors apps/api/src/studies/packageFormat.ts. The server is the authority —
// it re-validates before it writes, and assigns every stored id and sequence.

export interface PackageIssue {
  code: string;
  message: string;
  ids?: string[];
}

export interface PackagePreview {
  name: string;
  subject: string;
  questionCount: number;
  categories: { id: string; name: string; weight: number | null; target: number | null; found: number }[];
  categoryWeightMode: string | null;
  explanationMode: string | null;
  flashcardCount: number;
  slideCount: number;
  lessonCount: number;
}

export interface ImportedQuestionView {
  id: string;
  categoryId: string | null;
  stem: string;
  options: { label: string; text: string }[];
  answer: string;
  explanation: string | null;
}

export interface PackageValidation {
  ok: boolean;
  /** Named checks that came back clean, for the "what passed" half of the report. */
  passed: string[];
  errors: PackageIssue[];
  warnings: PackageIssue[];
  preview: PackagePreview | null;
  questions: ImportedQuestionView[];
  /**
   * What the validator SAW, as opposed to what it decided — versions, ids,
   * counts and part indices, and no package content at all.
   *
   * Two uses, both of which need it present on every run including a failed
   * one: the founder-only diagnostics panel, and the machine context a bug
   * report carries so the reporter does not have to find any of this by hand.
   */
  diagnostics: PackageDiagnostics;
}

export interface PackageDiagnostics {
  documents: { index: number; format: string | null; schemaVersion: number | null; blueprintId: string | null; bytes: number }[];
  multipart: { parts: number; expected: number | null; received: number[]; missing: number[] } | null;
  expectedBlueprintId: string;
  expectedSchemaVersion: number;
  categoryTargets: { id: string; name: string; target: number | null; found: number }[];
}

/** The plan a package is checked against — the wizard's blueprint, flattened. */
export interface ImportBlueprintPayload {
  blueprintId: string;
  categoriesLocked: boolean;
  categories: { id: string; name: string; weight: number | null }[];
  questionTargets: Record<string, number> | null;
  totalQuestions: number | null;
  explanationsRequired: boolean;
  wantQuestions: boolean;
  wantFlashcards: boolean;
  wantPresentation: boolean;
  wantLessons: boolean;
  name: string;
  subject?: string;
  audience?: string | null;
  depth?: string | null;
  categoryWeightMode?: string | null;
  explanationMode?: string | null;
}

export interface ManualPackagePayload {
  name: string;
  subject?: string;
  depth?: string | null;
  categoryWeightMode?: string | null;
  explanationMode?: string | null;
  categories: { id: string; name: string; weight: number | null }[];
  questions: {
    categoryId?: string | null;
    stem: string;
    options: { label: string; text: string }[];
    answer: string;
    explanation?: string | null;
  }[];
  presentation?: { title: string; slides: { title: string; body: string }[] } | null;
}

/**
 * Machine context attached to a bug report from Studies.
 *
 * Mirrors the server's whitelist (api/support/studyContext.ts), which is the
 * enforcer: anything not on this list is stripped there. Ids, versions, counts
 * and codes only — never study content. `sample` is the one exception and is
 * filled solely by an explicit press of "include a small sample".
 */
export interface StudyBugContext {
  screen?: string;
  step?: string;
  component?: string;
  blueprintVersion?: number;
  formatVersion?: number;
  draftId?: string;
  packageId?: string;
  source?: 'upload' | 'paste' | 'fixture';
  parts?: number;
  expectedParts?: number;
  missingParts?: number[];
  errorCodes?: string[];
  errorMessages?: string[];
  errorId?: string;
  apiStatus?: number;
  appVersion?: string;
  tier?: string;
  isDemo?: boolean;
  previewAs?: string;
  flags?: string[];
  sample?: string;
  sampleLabel?: string;
}

/** What a founder-level account can ask to be treated as, for testing. */
export type PreviewMode = 'free' | 'premium' | 'max' | 'public';

export const PREVIEW_LABELS: Record<PreviewMode, string> = {
  free: 'Free account',
  premium: 'Premium member',
  max: 'Max member',
  public: 'Member of the public',
};

/** A package's sharing and publication state, for developer diagnostics. */
export interface StudyPackageState {
  id: string;
  name: string;
  ownerUserId: string;
  visibility: string;
  archivedAt: number | null;
  formatVersion: number;
  shares: { id: string; recipientUserId: string; status: string; createdAt: number }[];
  submissions: {
    id: string;
    status: string;
    submittedAt: number;
    reviewedAt: number | null;
    attestationVersion: string;
  }[];
  libraryAdds: string[];
  /** Who the package leaderboard ranks — the answer package access actually gives. */
  leaderboardAudience: string[];
}

export interface StudyPackageSummary {
  id: string;
  name: string;
  subject: string | null;
  questionCount?: number;
}

// ---- Study Packages: the owner's library, sharing, and the VTS Study Library ----

/** private → shared → submitted → public. Four distinct states, never merged. */
export type StudyPackageVisibility = 'private' | 'shared' | 'submitted' | 'public';

export interface StudyPackage {
  id: string;
  name: string;
  description: string | null;
  subject: string | null;
  audience: string | null;
  depth: string | null;
  formatVersion: number;
  visibility: StudyPackageVisibility;
  archived: boolean;
  archivedAt: number | null;
  ownerUserId: string;
  ownerName: string | null;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  hasDeck: boolean;
  hasFlashcards: boolean;
  hasGuide: boolean;
  lessonCount: number;
  /** Whether the viewer owns it — only an owner can share, submit or archive. */
  mine: boolean;
  sharedWith: number;
}

export interface StudyPackageDetail extends StudyPackage {
  categories: { id: string; seq: number; name: string; weight: number | null }[];
  lessons: { id: string; seq: number; title: string; objective: string | null; body: string | null }[];
  deckId: string | null;
  flashcardSetId: string | null;
  guideId: string | null;
}

export type StudyShareStatus = 'pending' | 'accepted' | 'declined';

export interface StudyShare {
  id: string;
  packageId: string;
  packageName: string;
  packageSubject: string | null;
  status: StudyShareStatus;
  /** Who it is with, or who it came from, depending on which list this is. */
  personName: string;
  personUsername: string;
  createdAt: number;
  respondedAt: number | null;
}

export type StudySubmissionStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested' | 'withdrawn';

export interface StudySubmission {
  id: string;
  packageId: string;
  packageName: string;
  packageSubject: string | null;
  status: StudySubmissionStatus;
  submittedAt: number;
  reviewedAt: number | null;
  adminNote: string | null;
  attestationVersion: string;
  submitterName: string | null;
  /** When this publication ended, if it has. `status` stays 'approved'. */
  withdrawnAt: number | null;
  withdrawnByName: string | null;
  /** Whether the creator withdrew it, rather than an administrator. */
  withdrawnByOwner: boolean;
}

export interface StudyLibraryEntry {
  packageId: string;
  name: string;
  subject: string | null;
  description: string | null;
  depth: string | null;
  ownerName: string | null;
  questionCount: number;
  added: boolean;
  publishedAt: number;
}
