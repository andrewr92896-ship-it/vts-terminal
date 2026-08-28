import type {
  ImportBlueprintPayload,
  ManualPackagePayload,
  PackageValidation,
  PreviewMode,
  StudyLibraryEntry,
  StudyPackage,
  StudyPackageDetail,
  StudyPackageState,
  DevEnvironment,
  StudyBugContext,
  StudyShare,
  StudySubmission,
  StudySubmissionStatus,
  BudgetMonth,
  PublishedWallTemplate,
  TemplateTile,
  WallTemplate,
  NewsItem,
  AiViolation,
  GuardrailHit,
  ViolationStatus,
  AdminUser,
  UserFeatures,
  EarlyAccessRequest,
  AiUsage,
  AlertsData,
  PriceAlert,
  PriceAlertInput,
  PriceAlertsData,
  Announcement,
  ChatMessage,
  TeamChatFeed,
  NotificationItem,
  Suggestion,
  BugReport,
  MessageTemplate,
  MessageTemplateKind,
  SupportKind,
  SupportRequest,
  BrokerConnection,
  FounderAccountView,
  FounderLinks,
  FounderShareConfig,
  FounderTestPlan,
  FounderInvite,
  FounderPerson,
  FounderTradeEvent,
  FounderTradePrefs,
  FounderSizePreview,
  FounderTradePrefsPatch,
  BrokerStatus,
  ChallengeData,
  ChallengesData,
  ChallengeInput,
  AnalyzeAccountResult,
  OandaCapital,
  FundedData,
  FundedAccountInput,
  FundedTradeInput,
  FundedImportResult,
  FundedPositionResult,
  FundedCloseResult,
  ConnectionInput,
  CapitalPatch,
  DeskSettings,
  TraderCapital,
  ManualPosition,
  ManualPositionInput,
  AnalyzePositionResult,
  CredentialAuditEntry,
  OwnedBrokerConnection,
  TruthPost,
  HistoryData,
  SessionInput,
  StrategySession,
  NotesData,
  NoteInput,
  NoteKind,
  NoteOutcome,
  NoteVisibility,
  TradingNote,
  MarketHoursResult,
  SessionAlertPrefs,
  RolloverPlan,
  RolloverPlanInput,
  ReentryReport,
  TradingBoard,
  BoardsResponse,
  BoardInput,
  MarketNewsData,
  MarketNewsView,
  MarketNewsStreamsPayload,
  MarketDataPayload,
  MarketDataLayout,
  NewsInput,
  EventInput,
  LiveWall,
  DeskAccount,
  DeskHolding,
  DeskInstrument,
  DeskQuote,
  DeskWorkingOrder,
  DeskOrderRecord,
  TicketPresets,
  PlaceOrderInput,
  PlaceOrderResult,
  CloseOrderInput,
  CloseOrderResult,
  ModifyPositionInput,
  TradeInput,
  TradeLogData,
  RemovedTrade,
  DeletedTradesData,
  LeaderboardEntry,
  Team,
  TeamRef,
  BadgeType,
  AiPrompt,
  PatchNoteEntry,
  TestBreakdown,
  TestLeaderboardEntry,
  TestResult,
  RemovedTodoItem,
  RoleKey,
  TodoItemState,
  TodoCommandResult,
  TodoSection,
  StudySection,
  DeckQuestion,
  TeamDeck,
  TeamDeckDetail,
  Flashcard,
  FlashcardInput,
  TeamFlashcardSet,
  TeamFlashcardSetDetail,
  StudyGuide,
  StudyGuideDetail,
  GuideSlide,
  GuideDraftSlide,
  TradingSignals,
  User,
  MyPortalData,
  MyTeam,
  TeamMemberPermissions,
  TileColorOption,
  InvestmentPortfolio,
  InvestmentAccountInput,
  InvestmentHoldingInput,
  InvestmentTransaction,
  InvestmentTransactionInput,
  InvestmentContributions,
  InvestmentGoalInput,
  InvestmentPerformance,
  InvestmentDividends,
  InvestmentProjection,
  NetWorth,
  NetWorthItemInput,
  MembershipTier,
  AdminLogEntry,
  DevBlogPost,
} from './types';

export type TerminalLoginResponse =
  | { requiresTwoFactor: true; sentTo: string; rememberDays: number }
  | { requiresTwoFactor: false; user: User };

// A flashcard the user added to their own personal deck (a term, a definition,
// and an optional topic label).
export interface CustomVocabCard {
  term: string;
  def: string;
  topic: string;
}

// A teammate a trader can choose to be notified about, and the per-event toggles
// they can set for that teammate. `isSelf` marks the trader's own row.
export interface NotifTarget {
  id: string;
  name: string;
  isSelf: boolean;
}
export interface NotifPrefFlags {
  open: boolean;
  close: boolean;
  placeSl: boolean;
  moveSl: boolean;
  placeTp: boolean;
  moveTp: boolean;
}

// How a Pushover test is sent. Mirrors the server's PushoverTestKind.
export type PushoverTestKind = 'standard' | 'repeating';

// How loud one trade event is. Mirrors the server's NotifLevel, and the order
// here is the order the picker draws — quietest first.
export const NOTIF_LEVELS = ['silent', 'normal', 'alert', 'repeating'] as const;
export type NotifLevel = (typeof NOTIF_LEVELS)[number];
export type NotifPrefLevels = Record<keyof NotifPrefFlags, NotifLevel>;

// A repeating alert still sounding on this user's phone.
export interface LiveAlert {
  id: string;
  title: string;
  body: string;
  kind: string;
  createdAt: number;
  expiresAt: number;
}

export interface AlertRepeatPrefs {
  repeatEverySeconds: number;
  repeatForSeconds: number;
  // The master switch for this ACCOUNT (phone alerts are per device), and
  // whether somebody else in your private group may buzz your phone.
  accountAlerts: boolean;
  groupAlerts: boolean;
}

// How loud a group nudge is sent. No message ever travels — the notification
// says who sent it and nothing more.
export type GroupAlertKind = 'standard' | 'repeating';


// Status of the caller's home-screen widget token (never the token itself,
// which is shown once at generation). `exists` drives the Regenerate/Revoke UI.
export interface WidgetTokenStatus {
  exists: boolean;
  createdAt: number | null;
  lastUsedAt: number | null;
}

// The payload for the Market News "AI overview" — whatever the active feed is
// currently showing, sent for Claude to summarize.
export interface FeedBriefPayload {
  label: string;
  headlines?: { title: string; category?: string; impact?: string; bias?: string; source?: string }[];
  events?: { when: string; country?: string; title: string; impact?: string; forecast?: string; previous?: string; actual?: string }[];
  posts?: { content: string }[];
}

export class ApiError extends Error {
  status: number;
  /**
   * The parsed error body, when the server sent one.
   *
   * `request` already parses it to pull `error` out for the message, so carrying
   * it costs nothing and saves a second round-trip whenever a failure has
   * structure worth reading — the guardrail pause sends back `timeoutUntil`, and
   * the paywall sends back `upgrade`. Callers should still treat it as unknown
   * and narrow it themselves; nothing guarantees a shape.
   */
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// All requests go through the Vite proxy (/api -> backend) so the session
// cookie is same-origin. credentials:'include' keeps it flowing. The JSON
// content-type is set only when there is a body — Fastify rejects an empty
// body when content-type is application/json (so bodiless PATCH/DELETE 400).
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers,
  });

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const message =
      (body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : null) || `Request failed (${res.status})`;
    throw new ApiError(res.status, message, body);
  }

  return body as T;
}

export const api = {
  me(): Promise<{ user: User }> {
    return request('/api/auth/me');
  },
  login(email: string, password: string): Promise<TerminalLoginResponse> {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  verifyTwoFactor(code: string, remember: boolean): Promise<{ user: User }> {
    return request('/api/auth/two-factor/verify', {
      method: 'POST',
      body: JSON.stringify({ code, remember }),
    });
  },
  resendTwoFactor(): Promise<{ ok: true; sentTo: string }> {
    return request('/api/auth/two-factor/resend', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
  forgotPassword(email: string): Promise<{ ok: true; message: string }> {
    return request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },
  logout(): Promise<{ ok: boolean }> {
    return request('/api/auth/logout', { method: 'POST' });
  },
  // Record that the user has reviewed and accepted the current Terms of Service
  // and Privacy Policy. Clears `mustAcceptTerms` on the returned user.
  acceptTerms(): Promise<{ user: User }> {
    return request('/api/auth/accept-terms', { method: 'POST', body: JSON.stringify({}) });
  },
  // My Terminal ▸ Premium Features — the optional parts of the terminal this user has
  // turned on. `me()` already carries them on user.access.features; these two are
  // for the screen that edits them.
  features(): Promise<{ features: UserFeatures }> {
    return request('/api/features');
  },
  saveFeatures(patch: {
    advancedTrading?: boolean;
    funded?: boolean;
    acknowledgeTrading?: boolean;
    // Private mode. Lives on this row, but is edited from Trading Team.
    shareBook?: boolean;
    acknowledgeBook?: boolean;
  }): Promise<{ features: UserFeatures }> {
    return request('/api/features', { method: 'PUT', body: JSON.stringify(patch) });
  },
  demoLogin(): Promise<{ user: User }> {
    return request('/api/auth/demo', { method: 'POST', body: JSON.stringify({}) });
  },
  changePassword(currentPassword: string, newPassword: string): Promise<{ user: User }> {
    return request('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },
  updateProfile(patch: {
    username?: string;
    displayName?: string;
    email?: string;
    // A data URL to set the profile picture, or '' to remove it.
    avatar?: string;
    // 'auto', or an IANA zone name. The server refuses a name it cannot format.
    displayTimezone?: string;
    // The screen the terminal opens on. Nullable together — clearing the home
    // page means going back to the default, which is both set to null.
    homeWorkspace?: string | null;
    homeScreen?: string | null;
    hideFromLeaderboards?: boolean;
  }): Promise<{ user: User }> {
    return request('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
  // ---- My Terminal: user-created Trading Teams ----
  myPortal(): Promise<MyPortalData> {
    return request('/api/my-portal/team');
  },
  myPortalConfig(): Promise<{ badgePresets: string[]; maxMembers: number; tileColors: TileColorOption[] }> {
    return request('/api/my-portal/config');
  },
  createMyTeam(name: string): Promise<{ team: MyTeam }> {
    return request('/api/my-portal/team', { method: 'POST', body: JSON.stringify({ name }) });
  },
  renameMyTeam(name: string): Promise<{ team: MyTeam }> {
    return request('/api/my-portal/team/rename', { method: 'POST', body: JSON.stringify({ name }) });
  },
  inviteToMyTeam(username: string): Promise<{ team: MyTeam }> {
    return request('/api/my-portal/team/invite', { method: 'POST', body: JSON.stringify({ username }) });
  },
  cancelMyTeamInvite(inviteId: string): Promise<{ team: MyTeam }> {
    return request(`/api/my-portal/team/invites/${encodeURIComponent(inviteId)}/cancel`, { method: 'POST' });
  },
  respondMyTeamInvite(inviteId: string, accept: boolean): Promise<MyPortalData> {
    return request(`/api/my-portal/invites/${encodeURIComponent(inviteId)}/respond`, {
      method: 'POST',
      body: JSON.stringify({ accept }),
    });
  },
  leaveMyTeam(): Promise<{ ok: true }> {
    return request('/api/my-portal/team/leave', { method: 'POST' });
  },
  removeMyTeamMember(userId: string): Promise<{ team: MyTeam }> {
    return request(`/api/my-portal/team/members/${encodeURIComponent(userId)}/remove`, { method: 'POST' });
  },
  transferMyTeamLeadership(userId: string): Promise<{ team: MyTeam }> {
    return request('/api/my-portal/team/transfer', { method: 'POST', body: JSON.stringify({ userId }) });
  },
  setMyTeamMemberBadge(userId: string, badge: string | null): Promise<{ team: MyTeam }> {
    return request(`/api/my-portal/team/members/${encodeURIComponent(userId)}/badge`, {
      method: 'POST',
      body: JSON.stringify({ badge }),
    });
  },
  // The colour one person's open positions are washed in on every trade tile.
  // Leader-only, enforced server-side. `null` clears it back to no wash.
  setMyTeamMemberTileColor(userId: string, color: string | null): Promise<{ team: MyTeam }> {
    return request(`/api/my-portal/team/members/${encodeURIComponent(userId)}/tile-color`, {
      method: 'POST',
      body: JSON.stringify({ color }),
    });
  },
  // The funded and manual tile colours — group-wide, not tied to a person. An
  // omitted key is left alone, so setting one never blanks the other.
  setMyTeamTileColors(patch: { funded?: string | null; manual?: string | null }): Promise<{ team: MyTeam }> {
    return request('/api/my-portal/team/tile-colors', { method: 'POST', body: JSON.stringify(patch) });
  },
  setMyTeamMemberPermissions(
    userId: string,
    perms: Partial<TeamMemberPermissions>,
  ): Promise<{ team: MyTeam }> {
    return request(`/api/my-portal/team/members/${encodeURIComponent(userId)}/permissions`, {
      method: 'POST',
      body: JSON.stringify(perms),
    });
  },

  // ---- Early access ----
  // Public: submit a request from the login screen. No auth.
  requestEarlyAccess(input: {
    firstName: string;
    lastName?: string;
    email: string;
    phone?: string;
    source: string;
  }): Promise<{ ok: true }> {
    return request('/api/early-access', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  // Admin: review and clear the submitted leads.
  adminListEarlyAccess(): Promise<{ requests: EarlyAccessRequest[] }> {
    return request('/api/admin/early-access');
  },
  adminDeleteEarlyAccess(id: string): Promise<{ ok: boolean }> {
    return request(`/api/admin/early-access/${id}`, { method: 'DELETE' });
  },
  adminListUsers(): Promise<{ users: AdminUser[] }> {
    return request('/api/admin/users');
  },
  adminCreateUser(input: {
    username: string;
    displayName: string;
    email: string;
    password: string;
    roles: RoleKey[];
    viewBrokerage?: boolean;
    teamId?: string | null;
  }): Promise<{ user: AdminUser }> {
    return request('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  adminUpdateUser(
    id: string,
    patch: {
      displayName?: string;
      email?: string;
      roles?: RoleKey[];
      badges?: string[];
      active?: boolean;
      viewBrokerage?: boolean;
      teamId?: string | null;
      password?: string;
    },
  ): Promise<{ user: AdminUser }> {
    return request(`/api/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
  adminDeleteUser(id: string): Promise<{ ok: boolean }> {
    return request(`/api/admin/users/${id}`, { method: 'DELETE' });
  },

  // ---- Trading teams (admin) ----
  adminListTeams(): Promise<{ teams: Team[] }> {
    return request('/api/admin/teams');
  },
  adminCreateTeam(name: string): Promise<{ team: Team; teams: Team[] }> {
    return request('/api/admin/teams', { method: 'POST', body: JSON.stringify({ name }) });
  },
  adminRenameTeam(id: string, name: string): Promise<{ team: Team; teams: Team[] }> {
    return request(`/api/admin/teams/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
  },
  adminDeleteTeam(id: string): Promise<{ ok: boolean; teams: Team[] }> {
    return request(`/api/admin/teams/${id}`, { method: 'DELETE' });
  },

  // ---- Badges (recognition icons next to a member's name) ----
  // The badge registry, for rendering the icons (any signed-in user).
  badges(): Promise<{ badges: BadgeType[] }> {
    return request('/api/badges');
  },
  adminCreateBadge(input: {
    label: string;
    icon: string;
    color?: string;
    description?: string | null;
  }): Promise<{ badge: BadgeType; badges: BadgeType[] }> {
    return request('/api/admin/badge-types', { method: 'POST', body: JSON.stringify(input) });
  },
  adminUpdateBadge(
    id: string,
    patch: { label?: string; icon?: string; color?: string; description?: string | null },
  ): Promise<{ badge: BadgeType; badges: BadgeType[] }> {
    return request(`/api/admin/badge-types/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  adminDeleteBadge(id: string): Promise<{ ok: boolean; badges: BadgeType[] }> {
    return request(`/api/admin/badge-types/${id}`, { method: 'DELETE' });
  },

  // ---- AI instructions (admin-editable system prompts) ----
  // `guardrails` is the read-only financial-advice block welded onto every
  // prompt at send time. There is deliberately no method to change it.
  adminAiPrompts(): Promise<{ prompts: AiPrompt[]; guardrails: string }> {
    return request('/api/admin/ai-prompts');
  },
  adminSaveAiPrompt(id: string, value: string): Promise<{ value: string; overridden: boolean }> {
    return request(`/api/admin/ai-prompts/${id}`, { method: 'PUT', body: JSON.stringify({ value }) });
  },
  adminResetAiPrompt(id: string): Promise<{ value: string; overridden: boolean }> {
    return request(`/api/admin/ai-prompts/${id}`, { method: 'DELETE' });
  },

  // ---- Message templates (admin copy library) ----
  // Every admin can read/copy; only software developers (founder-level) may
  // create/edit/delete — the write routes are founder-gated server-side.
  adminMessageTemplates(): Promise<{ templates: MessageTemplate[] }> {
    return request('/api/admin/message-templates');
  },
  adminCreateMessageTemplate(input: {
    kind: MessageTemplateKind;
    title: string;
    subject?: string | null;
    body: string;
  }): Promise<{ templates: MessageTemplate[] }> {
    return request('/api/admin/message-templates', { method: 'POST', body: JSON.stringify(input) });
  },
  adminUpdateMessageTemplate(
    id: string,
    patch: { kind?: MessageTemplateKind; title?: string; subject?: string | null; body?: string },
  ): Promise<{ templates: MessageTemplate[] }> {
    return request(`/api/admin/message-templates/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  adminDeleteMessageTemplate(id: string): Promise<{ templates: MessageTemplate[] }> {
    return request(`/api/admin/message-templates/${id}`, { method: 'DELETE' });
  },

  // ---- Patch notes ----
  // Published release notes for members (Site Help).
  patchNotes(): Promise<{ notes: PatchNoteEntry[] }> {
    return request('/api/patch-notes');
  },
  adminPatchNotes(): Promise<{ notes: PatchNoteEntry[] }> {
    return request('/api/admin/patch-notes');
  },
  adminCreatePatchNote(input: {
    version: string;
    dateLabel?: string;
    notes: string[];
  }): Promise<{ note: PatchNoteEntry; notes: PatchNoteEntry[] }> {
    return request('/api/admin/patch-notes', { method: 'POST', body: JSON.stringify(input) });
  },
  adminUpdatePatchNote(
    id: string,
    patch: { version?: string; dateLabel?: string; notes?: string[] },
  ): Promise<{ note: PatchNoteEntry; notes: PatchNoteEntry[] }> {
    return request(`/api/admin/patch-notes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  adminSetPatchNoteStatus(
    id: string,
    status: 'draft' | 'published',
  ): Promise<{ note: PatchNoteEntry; notes: PatchNoteEntry[] }> {
    return request(`/api/admin/patch-notes/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
  },
  adminDeletePatchNote(id: string): Promise<{ ok: boolean; notes: PatchNoteEntry[] }> {
    return request(`/api/admin/patch-notes/${id}`, { method: 'DELETE' });
  },

  // ---- Editable site content (How-to overrides) ----
  // Members read the merged content; the client applies overrides over its
  // bundled defaults. `howto` values are JSON blobs keyed by screen.
  siteContent(): Promise<{ howto: Record<string, string> }> {
    return request('/api/site-content');
  },
  adminSiteContent(): Promise<{ howto: Record<string, string> }> {
    return request('/api/admin/site-content');
  },
  adminSaveHowto(screen: string, value: string): Promise<{ ok: boolean; cleared: boolean }> {
    return request(`/api/admin/site-content/howto/${screen}`, { method: 'PUT', body: JSON.stringify({ value }) });
  },
  adminResetHowto(screen: string): Promise<{ ok: boolean }> {
    return request(`/api/admin/site-content/howto/${screen}`, { method: 'DELETE' });
  },
  brokerStatus(): Promise<{ brokers: BrokerStatus[]; stage: number; note: string }> {
    return request('/api/brokers/status');
  },
  // `guardrail` is present only when the reply was a refusal of a
  // financial-advice request — the reply itself still comes back either way.
  askAi(
    messages: { role: 'user' | 'assistant'; content: string }[],
    workspace?: string,
  ): Promise<{ reply: string; guardrail?: GuardrailHit }> {
    return request('/api/ai/ask', { method: 'POST', body: JSON.stringify({ messages, workspace }) });
  },
  aiUsage(): Promise<AiUsage> {
    return request('/api/ai/usage');
  },
  studyTutor(body: {
    explain?: { stem: string; options: { label: string; text: string }[]; answer: string; topic?: string };
    ask?: string;
  }): Promise<{ reply: string }> {
    return request('/api/ai/tutor', { method: 'POST', body: JSON.stringify(body) });
  },
  // Multi-turn study tutor chat (back-and-forth about a question or term).
  // `seed` marks the canned one-tap opener, which is the Premium half of the
  // tutor; anything the learner typed is the Max half. The server decides from
  // the shape of the request, so this flag only ever costs less when it is
  // telling the truth.
  studyTutorChat(
    messages: { role: 'user' | 'assistant'; content: string }[],
    opts?: { seed?: boolean },
  ): Promise<{ reply: string }> {
    return request('/api/ai/tutor', { method: 'POST', body: JSON.stringify({ messages, seed: opts?.seed }) });
  },
  liveWall(): Promise<LiveWall> {
    return request('/api/trading/live');
  },
  // ---- Trade Desk (live order placement, the caller's own accounts only) ----
  deskAccounts(): Promise<{ accounts: DeskAccount[] }> {
    return request('/api/trading/desk/accounts');
  },
  deskInstruments(connectionId: string): Promise<{ instruments: DeskInstrument[] }> {
    return request(`/api/trading/desk/instruments?connectionId=${encodeURIComponent(connectionId)}`);
  },
  deskQuotes(connectionId: string, instruments: string[]): Promise<{ quotes: DeskQuote[] }> {
    const list = encodeURIComponent(instruments.join(','));
    return request(`/api/trading/desk/quotes?connectionId=${encodeURIComponent(connectionId)}&instruments=${list}`);
  },
  deskWorkingOrders(): Promise<{ orders: DeskWorkingOrder[] }> {
    return request('/api/trading/desk/orders');
  },
  // What the caller's spot (crypto) accounts hold. Read-only: selling a holding
  // goes through the ordinary order ticket, review step included.
  deskHoldings(): Promise<{ holdings: DeskHolding[] }> {
    return request('/api/trading/desk/holdings');
  },
  deskOrderJournal(): Promise<{ orders: DeskOrderRecord[] }> {
    return request('/api/trading/desk/journal');
  },
  placeDeskOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
    return request('/api/trading/desk/orders', { method: 'POST', body: JSON.stringify(input) });
  },
  closeDeskPosition(input: CloseOrderInput): Promise<CloseOrderResult> {
    return request('/api/trading/desk/close', { method: 'POST', body: JSON.stringify(input) });
  },
  modifyDeskPosition(input: ModifyPositionInput): Promise<{ ok: boolean }> {
    return request('/api/trading/desk/position', { method: 'PATCH', body: JSON.stringify(input) });
  },
  cancelDeskOrder(connectionId: string, orderId: string, instrument?: string): Promise<{ ok: boolean }> {
    return request('/api/trading/desk/cancel', {
      method: 'POST',
      body: JSON.stringify({ connectionId, orderId, instrument }),
    });
  },

  // ---- Founder trade coordination ----
  // Every one of these is founder-only on the SERVER; the terminal hiding the
  // feature from everybody else is what makes that hiding cosmetic rather than
  // the protection. A non-Founder calling any of them gets a 403.
  //
  // `founderPending` is the one the blocking modal polls: it answers with what
  // is still owed, oldest first, and is the only thing that decides whether the
  // modal is up — which is why an unresolved workflow survives a refresh.
  founderPending(): Promise<{
    invites: FounderInvite[];
    prefs: FounderTradePrefs;
    accounts: FounderAccountView[];
    canTrade: boolean;
  }> {
    return request('/api/founder-trades/pending');
  },
  founderTrades(): Promise<{
    invites: FounderInvite[];
    recipients: FounderPerson[];
    prefs: FounderTradePrefs;
    accounts: FounderAccountView[];
    canTrade: boolean;
    config: FounderShareConfig;
    links: FounderLinks;
  }> {
    return request('/api/founder-trades');
  },
  // Whose trades reach whom, both directions in one read. Either party can set
  // a link, so "receive their trades" needs nothing from their account.
  founderLinks(): Promise<{ links: FounderLinks }> {
    return request('/api/founder-trades/links');
  },
  setFounderLink(senderUserId: string, recipientUserId: string, on: boolean): Promise<{ links: FounderLinks }> {
    return request('/api/founder-trades/links', {
      method: 'PUT',
      body: JSON.stringify({ senderUserId, recipientUserId, on }),
    });
  },
  // What travels with an invitation — Founder-set and applying to everybody.
  founderConfig(): Promise<{ config: FounderShareConfig }> {
    return request('/api/founder-trades/config');
  },
  saveFounderConfig(patch: Partial<FounderShareConfig>): Promise<{ config: FounderShareConfig }> {
    return request('/api/founder-trades/config', { method: 'PUT', body: JSON.stringify(patch) });
  },
  // What a test WOULD place — the pair, the size, the levels — so the button can
  // say so before a real order is sent.
  founderTestPlan(): Promise<{ plan: FounderTestPlan }> {
    return request('/api/founder-trades/test');
  },
  runFounderTest(): Promise<{ invite: FounderInvite; plan: FounderTestPlan }> {
    return request('/api/founder-trades/test', { method: 'POST' });
  },
  founderRecipients(): Promise<{ recipients: FounderPerson[] }> {
    return request('/api/founder-trades/recipients');
  },
  founderPrefs(): Promise<{ prefs: FounderTradePrefs; accounts: FounderAccountView[]; canTrade: boolean }> {
    return request('/api/founder-trades/prefs');
  },
  // What a join would currently be sized at, joining nothing.
  founderSizePreview(): Promise<{ preview: FounderSizePreview }> {
    return request('/api/founder-trades/size-preview');
  },
  saveFounderPrefs(patch: FounderTradePrefsPatch): Promise<{ prefs: FounderTradePrefs }> {
    return request('/api/founder-trades/prefs', { method: 'PUT', body: JSON.stringify(patch) });
  },
  founderInvite(id: string): Promise<{ invite: FounderInvite; events: FounderTradeEvent[] }> {
    return request(`/api/founder-trades/${id}`);
  },
  founderProof(id: string): Promise<{ image: string }> {
    return request(`/api/founder-trades/${id}/proof`);
  },
  // Raising the same invitation twice returns the one that already exists, so a
  // retried request never puts a second modal in front of the recipient.
  createFounderInvite(recipientUserId: string, sourceOrderId: string): Promise<{ invite: FounderInvite }> {
    return request('/api/founder-trades', {
      method: 'POST',
      body: JSON.stringify({ recipientUserId, sourceOrderId }),
    });
  },
  // The press that authorizes one order: the instrument, direction and stop come
  // from the invitation, the size from the caller's own settings.
  joinFounderTrade(id: string): Promise<{ invite: FounderInvite }> {
    return request(`/api/founder-trades/${id}/join`, { method: 'POST' });
  },
  // Declining deliberately does not end the workflow — the funded question is
  // separate and still owed afterwards.
  declineFounderTrade(id: string): Promise<{ invite: FounderInvite }> {
    return request(`/api/founder-trades/${id}/decline`, { method: 'POST' });
  },
  founderFundedDecision(id: string, decision: 'yes' | 'no'): Promise<{ invite: FounderInvite }> {
    return request(`/api/founder-trades/${id}/funded`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    });
  },
  // The screenshot is what completes the funded branch — not the YES before it.
  uploadFounderProof(id: string, image: string): Promise<{ invite: FounderInvite }> {
    return request(`/api/founder-trades/${id}/proof`, { method: 'POST', body: JSON.stringify({ image }) });
  },
  // ---- Home-screen widget token (read-only bearer for the phone widget) ----
  widgetTokenStatus(): Promise<WidgetTokenStatus> {
    return request('/api/widget/token');
  },
  // Generate (or regenerate) the token — the raw value is returned exactly once.
  generateWidgetToken(): Promise<{ token: string }> {
    return request('/api/widget/token', { method: 'POST', body: JSON.stringify({}) });
  },
  revokeWidgetToken(): Promise<{ ok: boolean }> {
    return request('/api/widget/token', { method: 'DELETE' });
  },
  tradeLog(): Promise<TradeLogData> {
    return request('/api/trading/trades');
  },
  tradingHistory(): Promise<HistoryData> {
    return request('/api/trading/history');
  },
  // Delete a recorded closed trade (e.g. a test trade); returns refreshed History.
  removeHistoryTrade(id: string): Promise<HistoryData> {
    return request(`/api/trading/history/${id}`, { method: 'DELETE' });
  },
  // Edit a recorded closed trade (correct exit/P-L/strategy/dates); returns History.
  updateHistoryTrade(id: string, patch: Partial<TradeInput>): Promise<HistoryData> {
    return request(`/api/trading/history/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  // Per-trader desk settings. Omit `userId` for your own; a desk lead may pass a
  // teammate's id to read or change theirs.
  deskSettings(userId?: string): Promise<DeskSettings> {
    const q = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    return request(`/api/trading/desk-settings${q}`);
  },
  updateDeskSettings(patch: Partial<DeskSettings>, userId?: string): Promise<DeskSettings> {
    const body = userId ? { ...patch, userId } : patch;
    return request('/api/trading/desk-settings', { method: 'PATCH', body: JSON.stringify(body) });
  },
  // The order ticket's quick-size buttons. Always the caller's own — there is no
  // `userId` here and no route that would take one.
  ticketPresets(): Promise<TicketPresets> {
    return request('/api/trading/ticket-presets');
  },
  saveTicketPresets(patch: Partial<TicketPresets>): Promise<TicketPresets> {
    return request('/api/trading/ticket-presets', { method: 'PUT', body: JSON.stringify(patch) });
  },
  // Capital: what was put into each broker account and taken back out, plus
  // what those accounts hold right now. `userId` follows the trader filter — a
  // person's id, or the literal 'desk' for everyone the caller can see;
  // omitted, it is the caller's own.
  traderCapital(userId?: string): Promise<TraderCapital> {
    return request(`/api/trading/capital${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`);
  },
  updateTraderCapital(patch: CapitalPatch): Promise<TraderCapital> {
    return request('/api/trading/capital', { method: 'PATCH', body: JSON.stringify(patch) });
  },
  // Turn syncing on for one account's figure and pull it from the broker now.
  syncTraderCapital(
    account: string,
    figure: 'deposited' | 'withdrawn',
    userId?: string,
  ): Promise<TraderCapital> {
    return request('/api/trading/capital/sync', {
      method: 'POST',
      body: JSON.stringify({ account, figure, userId }),
    });
  },
  tradingSessions(): Promise<{ sessions: StrategySession[] }> {
    return request('/api/trading/sessions');
  },
  addSession(input: SessionInput): Promise<{ sessions: StrategySession[] }> {
    return request('/api/trading/sessions', { method: 'POST', body: JSON.stringify(input) });
  },
  updateSession(id: string, patch: SessionInput): Promise<{ sessions: StrategySession[] }> {
    return request(`/api/trading/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  removeSession(id: string): Promise<{ sessions: StrategySession[] }> {
    return request(`/api/trading/sessions/${id}`, { method: 'DELETE' });
  },
  // ---- Trading Notes ----
  // One read serves the whole screen (the week board, the reflection queue, the
  // viewer's own record and the observations feed), so the screen can never
  // render half of itself from a partly-failed set of round trips.
  tradingNotes(week?: string): Promise<NotesData> {
    return request(`/api/trading/notes${week ? `?week=${encodeURIComponent(week)}` : ''}`);
  },
  createNote(input: NoteInput & { kind: NoteKind; title: string }): Promise<{ note: TradingNote }> {
    return request('/api/trading/notes', { method: 'POST', body: JSON.stringify(input) });
  },
  updateNote(id: string, patch: NoteInput): Promise<{ note: TradingNote }> {
    return request(`/api/trading/notes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  setNoteVisibility(id: string, visibility: NoteVisibility): Promise<{ note: TradingNote }> {
    return request(`/api/trading/notes/${id}/visibility`, {
      method: 'POST',
      body: JSON.stringify({ visibility }),
    });
  },
  settleNote(id: string, outcome: NoteOutcome, reflection?: string | null): Promise<{ note: TradingNote }> {
    return request(`/api/trading/notes/${id}/settle`, {
      method: 'POST',
      body: JSON.stringify({ outcome, reflection }),
    });
  },
  reflectOnNote(id: string, reflection: string): Promise<{ note: TradingNote }> {
    return request(`/api/trading/notes/${id}/reflect`, {
      method: 'POST',
      body: JSON.stringify({ reflection }),
    });
  },
  removeNote(id: string): Promise<{ ok: true }> {
    return request(`/api/trading/notes/${id}`, { method: 'DELETE' });
  },
  marketHours(symbol: string): Promise<MarketHoursResult> {
    return request('/api/trading/market-hours', { method: 'POST', body: JSON.stringify({ symbol }) });
  },
  sessionAlertPrefs(): Promise<{ prefs: SessionAlertPrefs }> {
    return request('/api/trading/session-alert-prefs');
  },
  saveSessionAlertPrefs(prefs: SessionAlertPrefs): Promise<{ prefs: SessionAlertPrefs }> {
    return request('/api/trading/session-alert-prefs', { method: 'PUT', body: JSON.stringify(prefs) });
  },
  // Rollover close — the timed alerts around the 5pm ET rollover. The save takes
  // a patch: the server merges onto what is stored, so sending one event never
  // resets the other two.
  rolloverPlan(): Promise<{ plan: RolloverPlan }> {
    return request('/api/trading/rollover');
  },
  saveRolloverPlan(patch: RolloverPlanInput): Promise<{ plan: RolloverPlan }> {
    return request('/api/trading/rollover', { method: 'PUT', body: JSON.stringify(patch) });
  },
  // What re-entering a recently closed funded trade would cost right now.
  fundedReentry(): Promise<ReentryReport> {
    return request('/api/trading/funded/reentry');
  },
  // Every board response carries `teamBoards` — what this reader's teammates
  // have published — so the picker never needs a second round trip to fill its
  // "Shared with your team" group.
  tradingBoards(): Promise<BoardsResponse> {
    return request('/api/trading/boards');
  },
  createBoard(input: BoardInput): Promise<{ board: TradingBoard } & BoardsResponse> {
    return request('/api/trading/boards', { method: 'POST', body: JSON.stringify(input) });
  },
  updateBoard(id: string, patch: BoardInput): Promise<{ board: TradingBoard } & BoardsResponse> {
    return request(`/api/trading/boards/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  removeBoard(id: string): Promise<BoardsResponse> {
    return request(`/api/trading/boards/${id}`, { method: 'DELETE' });
  },
  // Publish one of your layouts to your team, or take it back. Publishing
  // strips a notes tile's text server-side — an arrangement is shared, never
  // somebody's scratchpad.
  shareBoard(id: string, shared: boolean): Promise<BoardsResponse> {
    return request(`/api/trading/boards/${id}/share`, { method: 'POST', body: JSON.stringify({ shared }) });
  },
  // Take a copy of a teammate's layout into your own boards.
  copyTeamBoard(id: string): Promise<{ board: TradingBoard } & BoardsResponse> {
    return request(`/api/trading/boards/${id}/copy`, { method: 'POST', body: JSON.stringify({}) });
  },
  marketNews(): Promise<MarketNewsData> {
    return request('/api/trading/news');
  },
  // This trader's Market News live-stream setup (followed channels + view state).
  marketNewsStreams(): Promise<MarketNewsStreamsPayload> {
    return request('/api/trading/market-news/streams');
  },
  // Only the view state is saved — the channel catalog lives on the server.
  // The channel list belongs to the desk: adding one shows it to every teammate.
  addMarketNewsChannel(input: {
    url: string;
    name?: string;
    alwaysOn?: boolean;
  }): Promise<MarketNewsStreamsPayload> {
    return request('/api/trading/market-news/channels', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  updateMarketNewsChannel(
    key: string,
    patch: { name?: string; alwaysOn?: boolean },
  ): Promise<MarketNewsStreamsPayload> {
    return request(`/api/trading/market-news/channels/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
  removeMarketNewsChannel(key: string): Promise<MarketNewsStreamsPayload> {
    return request(`/api/trading/market-news/channels/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    });
  },
  saveMarketNewsStreams(view: MarketNewsView): Promise<MarketNewsStreamsPayload> {
    return request('/api/trading/market-news/streams', {
      method: 'PUT',
      body: JSON.stringify(view),
    });
  },
  marketData(): Promise<MarketDataPayload> {
    return request('/api/trading/market-data');
  },
  marketDataLayout(): Promise<{ layout: MarketDataLayout }> {
    return request('/api/trading/market-data/layout');
  },
  saveMarketDataLayout(layout: MarketDataLayout): Promise<{ layout: MarketDataLayout }> {
    return request('/api/trading/market-data/layout', {
      method: 'PUT',
      body: JSON.stringify(layout),
    });
  },
  addNews(input: NewsInput): Promise<MarketNewsData> {
    return request('/api/trading/news', { method: 'POST', body: JSON.stringify(input) });
  },
  updateNews(id: string, patch: NewsInput): Promise<MarketNewsData> {
    return request(`/api/trading/news/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  removeNews(id: string): Promise<MarketNewsData> {
    return request(`/api/trading/news/${id}`, { method: 'DELETE' });
  },
  addCalendarEvent(input: EventInput): Promise<MarketNewsData> {
    return request('/api/trading/calendar', { method: 'POST', body: JSON.stringify(input) });
  },
  updateCalendarEvent(id: string, patch: EventInput): Promise<MarketNewsData> {
    return request(`/api/trading/calendar/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  removeCalendarEvent(id: string): Promise<MarketNewsData> {
    return request(`/api/trading/calendar/${id}`, { method: 'DELETE' });
  },
  feedBrief(payload: FeedBriefPayload): Promise<{ brief: string }> {
    return request('/api/trading/feed/brief', { method: 'POST', body: JSON.stringify(payload) });
  },
  // Every funded account the caller may see — their own, plus their teammates'
  // on a desk holding the Trading Teams grant. Each write below names one by id;
  // the server matches it against the caller, so a teammate's is read-only.
  tradingChallenges(): Promise<ChallengesData> {
    return request('/api/trading/challenge');
  },
  addChallenge(input: ChallengeInput = {}): Promise<ChallengesData> {
    return request('/api/trading/challenge', { method: 'POST', body: JSON.stringify(input) });
  },
  removeChallenge(id: string): Promise<ChallengesData> {
    return request(`/api/trading/challenge/${id}`, { method: 'DELETE' });
  },
  tradingMetricsBrief(): Promise<{ brief: string }> {
    return request('/api/trading/metrics/brief', { method: 'POST', body: JSON.stringify({}) });
  },
  updateChallenge(id: string, patch: ChallengeInput): Promise<ChallengeData> {
    return request(`/api/trading/challenge/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  syncChallengeEquity(id: string): Promise<ChallengeData> {
    return request(`/api/trading/challenge/${id}/sync-equity`, { method: 'POST', body: JSON.stringify({}) });
  },
  // Read the current balance off an FTP-account screenshot and set the equity.
  analyzeChallengeBalance(id: string, image: { imageBase64: string; mediaType: string }): Promise<AnalyzeAccountResult> {
    return request(`/api/trading/challenge/${id}/analyze`, { method: 'POST', body: JSON.stringify(image) });
  },
  // Live OANDA account capital.
  oandaCapital(): Promise<OandaCapital> {
    return request('/api/trading/oanda-capital');
  },
  // ---- Funded platforms ----
  funded(): Promise<FundedData> {
    return request('/api/trading/funded');
  },
  addFundedAccount(input: FundedAccountInput): Promise<FundedData> {
    return request('/api/trading/funded/accounts', { method: 'POST', body: JSON.stringify(input) });
  },
  updateFundedAccount(id: string, patch: FundedAccountInput): Promise<FundedData> {
    return request(`/api/trading/funded/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  removeFundedAccount(id: string): Promise<FundedData> {
    return request(`/api/trading/funded/accounts/${id}`, { method: 'DELETE' });
  },
  addFundedTrade(accountId: string, input: FundedTradeInput): Promise<FundedData> {
    return request(`/api/trading/funded/accounts/${accountId}/trades`, { method: 'POST', body: JSON.stringify(input) });
  },
  removeFundedTrade(id: string): Promise<FundedData> {
    return request(`/api/trading/funded/trades/${id}`, { method: 'DELETE' });
  },
  // Set a funded position's stop/target by hand, when the screenshot import read
  // one wrong or the platform showed it somewhere the picture did not reach.
  // Omit a level to leave it alone; pass null to clear it.
  setFundedTradeProtection(
    tradeId: string,
    patch: { stopLoss?: number | null; takeProfit?: number | null },
  ): Promise<FundedData> {
    return request(`/api/trading/funded/trades/${tradeId}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  // Close an open funded position from a trade-result screenshot: Claude reads the
  // exit price / P/L and finalizes that one trade (dropping it off the Live Wall).
  closeFundedTrade(tradeId: string, image: { imageBase64: string; mediaType: string }): Promise<FundedCloseResult> {
    return request(`/api/trading/funded/trades/${tradeId}/close`, { method: 'POST', body: JSON.stringify(image) });
  },
  // Import trades from a funded-account trade-history screenshot (dedup applied).
  importFundedTrades(accountId: string, image: { imageBase64: string; mediaType: string }): Promise<FundedImportResult> {
    return request(`/api/trading/funded/accounts/${accountId}/import`, { method: 'POST', body: JSON.stringify(image) });
  },
  // Read a single OPEN position off an active-trade screenshot and track it live
  // on the Live Wall (fill price + lot size + side), marked against OANDA prices.
  analyzeFundedPosition(accountId: string, image: { imageBase64: string; mediaType: string }): Promise<FundedPositionResult> {
    return request(`/api/trading/funded/accounts/${accountId}/positions/analyze`, { method: 'POST', body: JSON.stringify(image) });
  },
  tradingConnections(): Promise<{ connections: BrokerConnection[] }> {
    return request('/api/trading/connections');
  },
  addConnection(input: { broker: string; label: string; creds: Record<string, string> }): Promise<{ connections: BrokerConnection[] }> {
    return request('/api/trading/connections', { method: 'POST', body: JSON.stringify(input) });
  },
  updateConnection(id: string, patch: ConnectionInput): Promise<{ connections: BrokerConnection[] }> {
    return request(`/api/trading/connections/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  removeConnection(id: string): Promise<{ connections: BrokerConnection[] }> {
    return request(`/api/trading/connections/${id}`, { method: 'DELETE' });
  },
  connectionPositions(connectionId: string): Promise<{ positions: ManualPosition[] }> {
    return request(`/api/trading/connections/${connectionId}/positions`);
  },
  addPosition(connectionId: string, input: ManualPositionInput): Promise<{ positions: ManualPosition[] }> {
    return request(`/api/trading/connections/${connectionId}/positions`, { method: 'POST', body: JSON.stringify(input) });
  },
  updatePosition(positionId: string, patch: Partial<ManualPositionInput>): Promise<{ positions: ManualPosition[] }> {
    return request(`/api/trading/positions/${positionId}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  removePosition(positionId: string): Promise<{ positions: ManualPosition[] }> {
    return request(`/api/trading/positions/${positionId}`, { method: 'DELETE' });
  },
  // Read an open position off a broker/order screenshot and save it as a manual
  // position (for funded accounts with no API access).
  analyzePosition(connectionId: string, image: { imageBase64: string; mediaType: string }): Promise<AnalyzePositionResult> {
    return request(`/api/trading/connections/${connectionId}/positions/analyze`, {
      method: 'POST',
      body: JSON.stringify(image),
    });
  },
  // Every use of this user's own broker credentials. The server scopes it to the
  // session — there is no way to ask about somebody else's.
  credentialAudit(): Promise<{ entries: CredentialAuditEntry[] }> {
    return request('/api/trading/credential-audit');
  },
  // Admin: everyone's, for a support case or an incident.
  allCredentialAudit(): Promise<{ entries: CredentialAuditEntry[] }> {
    return request('/api/trading/credential-audit/all');
  },
  // Admin: every teammate's connection, and rename/pause any of them.
  allConnections(): Promise<{ connections: OwnedBrokerConnection[] }> {
    return request('/api/trading/connections/all');
  },
  adminUpdateConnection(id: string, patch: { label?: string; active?: boolean; historyStartAt?: number | null }): Promise<{ connections: OwnedBrokerConnection[] }> {
    return request(`/api/trading/connections/${id}/admin`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  // Removes the connection only — closed trades survive it. The server refuses
  // an active connection and a hand-kept book that still holds positions.
  adminRemoveConnection(id: string): Promise<{ connections: OwnedBrokerConnection[] }> {
    return request(`/api/trading/connections/${id}/admin`, { method: 'DELETE' });
  },
  addTrade(trade: TradeInput): Promise<TradeLogData> {
    return request('/api/trading/trades', { method: 'POST', body: JSON.stringify(trade) });
  },
  updateTrade(id: string, patch: TradeInput): Promise<TradeLogData> {
    return request(`/api/trading/trades/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  removeTrade(id: string): Promise<TradeLogData & { removed: RemovedTrade | null }> {
    return request(`/api/trading/trades/${id}`, { method: 'DELETE' });
  },
  restoreTrade(trade: RemovedTrade): Promise<TradeLogData> {
    return request('/api/trading/trades/restore', { method: 'POST', body: JSON.stringify(trade) });
  },
  deletedTrades(): Promise<DeletedTradesData> {
    return request('/api/trading/deleted-trades');
  },
  restoreDeletedTrade(id: string): Promise<DeletedTradesData> {
    return request(`/api/trading/deleted-trades/${id}/restore`, { method: 'POST' });
  },
  tradingAlerts(): Promise<AlertsData> {
    return request('/api/trading/alerts');
  },
  // ---- User-authored price alerts ----
  priceAlerts(): Promise<PriceAlertsData> {
    return request('/api/trading/price-alerts');
  },
  createPriceAlert(input: PriceAlertInput): Promise<{ alert: PriceAlert; alerts: PriceAlert[] }> {
    return request('/api/trading/price-alerts', { method: 'POST', body: JSON.stringify(input) });
  },
  updatePriceAlert(
    id: string,
    patch: Partial<PriceAlertInput> & { active?: boolean },
  ): Promise<{ alert: PriceAlert; alerts: PriceAlert[] }> {
    return request(`/api/trading/price-alerts/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
  },
  deletePriceAlert(id: string): Promise<{ alerts: PriceAlert[] }> {
    return request(`/api/trading/price-alerts/${id}`, { method: 'DELETE' });
  },
  // ---- Investments (the long-term portfolio tracker) ----
  // Every write returns the recomputed portfolio, so a screen never has to
  // re-request it separately and can never render a stale total beside a fresh
  // list. Investments is included with every account — nothing here is gated on
  // a feature opt-in.
  investmentPortfolio(): Promise<InvestmentPortfolio> {
    return request('/api/investments/portfolio');
  },
  createInvestmentAccount(input: InvestmentAccountInput): Promise<{ id: string; portfolio: InvestmentPortfolio }> {
    return request('/api/investments/accounts', { method: 'POST', body: JSON.stringify(input) });
  },
  updateInvestmentAccount(
    id: string,
    patch: Partial<InvestmentAccountInput>,
  ): Promise<{ portfolio: InvestmentPortfolio }> {
    return request(`/api/investments/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  deleteInvestmentAccount(id: string): Promise<{ portfolio: InvestmentPortfolio }> {
    return request(`/api/investments/accounts/${id}`, { method: 'DELETE' });
  },
  createInvestmentHolding(input: InvestmentHoldingInput): Promise<{ id: string; portfolio: InvestmentPortfolio }> {
    return request('/api/investments/holdings', { method: 'POST', body: JSON.stringify(input) });
  },
  updateInvestmentHolding(
    id: string,
    patch: Partial<InvestmentHoldingInput>,
  ): Promise<{ portfolio: InvestmentPortfolio }> {
    return request(`/api/investments/holdings/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  deleteInvestmentHolding(id: string): Promise<{ portfolio: InvestmentPortfolio }> {
    return request(`/api/investments/holdings/${id}`, { method: 'DELETE' });
  },
  investmentTransactions(accountId?: string): Promise<{ entries: InvestmentTransaction[] }> {
    const q = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';
    return request(`/api/investments/transactions${q}`);
  },
  createInvestmentTransaction(
    input: InvestmentTransactionInput,
  ): Promise<{ id: string; entries: InvestmentTransaction[] }> {
    return request('/api/investments/transactions', { method: 'POST', body: JSON.stringify(input) });
  },
  deleteInvestmentTransaction(id: string): Promise<{ entries: InvestmentTransaction[] }> {
    return request(`/api/investments/transactions/${id}`, { method: 'DELETE' });
  },
  investmentContributions(taxYear: number): Promise<InvestmentContributions> {
    return request(`/api/investments/contributions?taxYear=${taxYear}`);
  },
  createInvestmentGoal(input: InvestmentGoalInput): Promise<{ id: string }> {
    return request('/api/investments/goals', { method: 'POST', body: JSON.stringify(input) });
  },
  deleteInvestmentGoal(id: string): Promise<{ ok: boolean }> {
    return request(`/api/investments/goals/${id}`, { method: 'DELETE' });
  },
  investmentPerformance(days: number): Promise<InvestmentPerformance> {
    return request(`/api/investments/performance?days=${days}`);
  },
  investmentDividends(): Promise<InvestmentDividends> {
    return request('/api/investments/dividends');
  },
  investmentProjection(opts: {
    monthlyContribution: number;
    annualRatePct: number;
    years: number;
  }): Promise<InvestmentProjection> {
    const q = new URLSearchParams({
      monthlyContribution: String(opts.monthlyContribution),
      annualRatePct: String(opts.annualRatePct),
      years: String(opts.years),
    });
    return request(`/api/investments/projection?${q}`);
  },
  // My Terminal ▸ Net Worth. Every write returns the recomputed picture, so the
  // screen can never render a stale total beside a fresh list.
  netWorth(days = 365): Promise<NetWorth> {
    return request(`/api/my-portal/net-worth?days=${days}`);
  },
  createNetWorthItem(input: NetWorthItemInput): Promise<NetWorth & { id: string }> {
    return request('/api/my-portal/net-worth/items', { method: 'POST', body: JSON.stringify(input) });
  },
  updateNetWorthItem(id: string, patch: Partial<NetWorthItemInput>): Promise<NetWorth> {
    return request(`/api/my-portal/net-worth/items/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  deleteNetWorthItem(id: string): Promise<NetWorth> {
    return request(`/api/my-portal/net-worth/items/${id}`, { method: 'DELETE' });
  },
  // ---- Team chat ----
  teamChat(): Promise<TeamChatFeed> {
    return request('/api/chat/team');
  },
  sendTeamChat(body: string): Promise<{ messages: ChatMessage[] }> {
    return request('/api/chat/team', { method: 'POST', body: JSON.stringify({ body }) });
  },
  deleteTeamChat(id: string): Promise<{ messages: ChatMessage[] }> {
    return request(`/api/chat/team/${id}`, { method: 'DELETE' });
  },
  // In-terminal notifications (top-bar bell).
  notifications(): Promise<{ items: NotificationItem[]; latestAt: number }> {
    return request('/api/notifications');
  },
  // `bugsAwaiting` is a live count of bug reports still waiting on a person (not
  // resolved, no admin reply after the reporter's last message) — the others are
  // last-activity timestamps.
  hubActivity(): Promise<{
    chat: number;
    announcements: number;
    suggestions: number;
    bugs: number;
    bugsAwaiting: number;
    support: number;
    violations: number;
    // Live count of guardrail violations still awaiting review — same shape as
    // bugsAwaiting, so reviewing the last one clears the sidebar dot.
    violationsOpen: number;
  }> {
    return request('/api/chat/activity');
  },

  // ---- AI guardrails ----

  /** The caller's own AI standing — non-null when they are inside a pause. */
  aiGuardrailStatus(): Promise<{ timeoutUntil: number | null }> {
    return request('/api/ai/guardrail/status');
  },
  /** "I think the AI made a mistake" — flags the violation for a human. */
  disputeGuardrail(violationId: string, note?: string): Promise<{ ok: true }> {
    return request(`/api/ai/guardrail/${violationId}/dispute`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
  },
  listAiViolations(): Promise<{ violations: AiViolation[] }> {
    return request('/api/admin/ai-violations');
  },
  reviewAiViolation(
    id: string,
    input: { status: ViolationStatus; note?: string; clearTimeout?: boolean },
  ): Promise<{ violations: AiViolation[] }> {
    return request(`/api/admin/ai-violations/${id}/review`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  // World / politics headlines for the News workspace. Deliberately thinner than
  // the market feed — headlines only, no calendar and no instrument relevance.
  generalNews(topic: 'world' | 'politics'): Promise<{ headlines: NewsItem[] }> {
    return request(`/api/news/general?topic=${encodeURIComponent(topic)}`);
  },
  // ---- Finances: budget ----
  //
  // Every write answers with the whole month, so the screen never has to merge
  // a partial response into local state and cannot drift from the server.
  budgetMonth(month?: string): Promise<BudgetMonth> {
    return request(`/api/finances/budget${month ? `?month=${encodeURIComponent(month)}` : ''}`);
  },
  addBudgetCategory(input: {
    name: string;
    kind: 'income' | 'expense';
    monthlyLimit?: number | null;
  }): Promise<BudgetMonth> {
    return request('/api/finances/budget/categories', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  updateBudgetCategory(
    id: string,
    patch: { name?: string; monthlyLimit?: number | null; archived?: boolean },
    month?: string,
  ): Promise<BudgetMonth> {
    return request(
      `/api/finances/budget/categories/${id}${month ? `?month=${encodeURIComponent(month)}` : ''}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
  },
  removeBudgetCategory(id: string, month?: string): Promise<BudgetMonth> {
    return request(
      `/api/finances/budget/categories/${id}${month ? `?month=${encodeURIComponent(month)}` : ''}`,
      { method: 'DELETE' },
    );
  },
  addBudgetEntry(input: {
    categoryId: string;
    amount: number;
    note?: string | null;
    occurredOn?: string;
  }): Promise<BudgetMonth> {
    return request('/api/finances/budget/entries', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  removeBudgetEntry(id: string, month?: string): Promise<BudgetMonth> {
    return request(
      `/api/finances/budget/entries/${id}${month ? `?month=${encodeURIComponent(month)}` : ''}`,
      { method: 'DELETE' },
    );
  },

  // ---- Live Wall templates ----
  //
  // The member read returns PUBLISHED layouts only; a draft is never on this
  // response. Every developer write answers with the whole list.
  wallTemplates(): Promise<{ templates: PublishedWallTemplate[] }> {
    return request('/api/wall-templates');
  },
  adminWallTemplates(): Promise<{ templates: WallTemplate[] }> {
    return request('/api/admin/wall-templates');
  },
  createWallTemplate(input: { key: string; label: string; blurb: string }): Promise<{ templates: WallTemplate[] }> {
    return request('/api/admin/wall-templates', { method: 'POST', body: JSON.stringify(input) });
  },
  saveWallTemplateDraft(
    id: string,
    patch: { label?: string; blurb?: string; tiles?: TemplateTile[]; hidden?: boolean },
  ): Promise<{ templates: WallTemplate[] }> {
    return request(`/api/admin/wall-templates/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  publishWallTemplate(id: string): Promise<{ templates: WallTemplate[] }> {
    return request(`/api/admin/wall-templates/${id}/publish`, { method: 'POST' });
  },
  discardWallTemplateDraft(id: string): Promise<{ templates: WallTemplate[] }> {
    return request(`/api/admin/wall-templates/${id}/discard`, { method: 'POST' });
  },
  removeWallTemplate(id: string): Promise<{ templates: WallTemplate[] }> {
    return request(`/api/admin/wall-templates/${id}`, { method: 'DELETE' });
  },

  tradingTruth(): Promise<{ posts: TruthPost[] }> {
    return request('/api/trading/truth');
  },
  // ---- Feedback: suggestions ----
  // `notice` is what the caller SHOWS after a send, when the answering service has
  // something to say beyond "sent". The private API never sets it, so the screen falls
  // back to its own wording; the public demo sets it to say the send went nowhere real.
  sendSuggestion(body: string): Promise<{ suggestion: Suggestion; notice?: string }> {
    return request('/api/feedback/suggestions', { method: 'POST', body: JSON.stringify({ body }) });
  },
  adminSuggestions(): Promise<{ suggestions: Suggestion[] }> {
    return request('/api/admin/suggestions');
  },
  adminSetSuggestionStatus(id: string, status: 'new' | 'reviewed'): Promise<{ suggestions: Suggestion[] }> {
    return request(`/api/admin/suggestions/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  },
  adminDeleteSuggestion(id: string): Promise<{ suggestions: Suggestion[] }> {
    return request(`/api/admin/suggestions/${id}`, { method: 'DELETE' });
  },
  // ---- Feedback: bug reports (AI intake) ----
  createBugReport(body: string): Promise<{ report: BugReport }> {
    return request('/api/feedback/bugs', { method: 'POST', body: JSON.stringify({ body }) });
  },
  replyBugReport(id: string, body: string): Promise<{ report: BugReport }> {
    return request(`/api/feedback/bugs/${id}/reply`, { method: 'POST', body: JSON.stringify({ body }) });
  },
  myBugReports(): Promise<{ reports: BugReport[] }> {
    return request('/api/feedback/bugs');
  },
  adminBugReports(): Promise<{ reports: BugReport[] }> {
    return request('/api/admin/bugs');
  },
  adminReplyBug(id: string, body: string): Promise<{ reports: BugReport[] }> {
    return request(`/api/admin/bugs/${id}/reply`, { method: 'POST', body: JSON.stringify({ body }) });
  },
  adminSetBugStatus(id: string, status: 'open' | 'submitted' | 'resolved'): Promise<{ reports: BugReport[] }> {
    return request(`/api/admin/bugs/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  },
  adminDeleteBug(id: string): Promise<{ reports: BugReport[] }> {
    return request(`/api/admin/bugs/${id}`, { method: 'DELETE' });
  },
  // ---- Support tab (bubble) intake + admin Support section ----
  // One turn of the AI intake. Send the whole conversation so far; when the
  // intake is complete the server files it to the matching admin section and
  // returns submitted=true.
  supportMessage(
    kind: SupportKind,
    messages: { role: 'user' | 'ai'; body: string }[],
    // Machine context, on a BUG only. The server whitelists it and ignores it
    // on any other kind — see api/support/studyContext.
    context?: StudyBugContext,
  ): Promise<{ needMore: boolean; reply: string; submitted: boolean }> {
    return request('/api/support/message', {
      method: 'POST',
      body: JSON.stringify({ kind, messages, context }),
    });
  },
  adminSupportRequests(): Promise<{ requests: SupportRequest[] }> {
    return request('/api/admin/support');
  },
  adminSetSupportStatus(id: string, status: 'submitted' | 'resolved'): Promise<{ requests: SupportRequest[] }> {
    return request(`/api/admin/support/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  },
  adminDeleteSupport(id: string): Promise<{ requests: SupportRequest[] }> {
    return request(`/api/admin/support/${id}`, { method: 'DELETE' });
  },
  studyLearned(): Promise<{ terms: string[] }> {
    return request('/api/studies/learned');
  },
  addLearnedTerm(term: string): Promise<{ terms: string[] }> {
    return request('/api/studies/learned', { method: 'POST', body: JSON.stringify({ term }) });
  },
  removeLearnedTerm(term: string): Promise<{ terms: string[] }> {
    return request(`/api/studies/learned?term=${encodeURIComponent(term)}`, { method: 'DELETE' });
  },
  studyGame(): Promise<{ state: string | null }> {
    return request('/api/studies/game');
  },
  saveStudyGame(state: string): Promise<{ ok: true }> {
    return request('/api/studies/game', { method: 'PUT', body: JSON.stringify({ state }) });
  },
  // Bank the given Study Game run to the leaderboard as a past run (used when the
  // learner resets their progress, so the session is preserved rather than lost).
  archiveStudyGame(state: string): Promise<{ ok: true }> {
    return request('/api/studies/game/archive', { method: 'POST', body: JSON.stringify({ state }) });
  },
  studyLeaderboard(): Promise<{ entries: LeaderboardEntry[]; team: TeamRef | null }> {
    return request('/api/studies/leaderboard');
  },
  // Record a finished 100-question mock test; returns it stamped with the
  // server-assigned attempt number.
  recordStudyTest(input: {
    score: number;
    correct: number;
    total: number;
    passed: boolean;
    durationMs: number | null;
    breakdown: TestBreakdown;
  }): Promise<{ result: TestResult }> {
    return request('/api/studies/tests', { method: 'POST', body: JSON.stringify(input) });
  },
  // The test high-score board plus the caller's own attempt history.
  studyTestLeaderboard(): Promise<{ entries: TestLeaderboardEntry[]; mine: TestResult[]; team: TeamRef | null }> {
    return request('/api/studies/tests/leaderboard');
  },
  // In-progress test state, synced to the account so an unfinished sitting
  // follows the learner across devices.
  studyTestProgress(): Promise<{ state: string | null }> {
    return request('/api/studies/tests/progress');
  },
  saveStudyTestProgress(state: string): Promise<{ ok: true }> {
    return request('/api/studies/tests/progress', { method: 'PUT', body: JSON.stringify({ state }) });
  },
  clearStudyTestProgress(): Promise<{ ok: true }> {
    return request('/api/studies/tests/progress', { method: 'DELETE' });
  },
  // Custom flashcard deck (user-added words with AI-generated definitions).
  studyVocab(): Promise<{ cards: CustomVocabCard[] }> {
    return request('/api/studies/vocab');
  },
  // Add a word. With a definition, it is stored as typed; without one, the
  // server generates the definition and topic with Claude.
  addVocabWord(term: string, def?: string): Promise<{ cards: CustomVocabCard[] }> {
    const body = def && def.trim() ? { term, def: def.trim() } : { term };
    return request('/api/studies/vocab', { method: 'POST', body: JSON.stringify(body) });
  },
  removeVocabWord(term: string): Promise<{ cards: CustomVocabCard[] }> {
    return request(`/api/studies/vocab?term=${encodeURIComponent(term)}`, { method: 'DELETE' });
  },
  // Starred quiz questions (per-user, by question id).
  studyStarred(): Promise<{ ids: number[] }> {
    return request('/api/studies/starred');
  },
  addStarredQuestion(id: number): Promise<{ ids: number[] }> {
    return request('/api/studies/starred', { method: 'POST', body: JSON.stringify({ id }) });
  },
  removeStarredQuestion(id: number): Promise<{ ids: number[] }> {
    return request(`/api/studies/starred?id=${id}`, { method: 'DELETE' });
  },
  // Custom quiz subsections (learner-defined focus areas classified by Claude).
  studySections(): Promise<{ sections: StudySection[] }> {
    return request('/api/studies/sections');
  },
  createStudySection(
    name: string,
    questions: { id: number; stem: string; topic: string }[],
  ): Promise<{ section: StudySection; sections: StudySection[] }> {
    return request('/api/studies/sections', {
      method: 'POST',
      body: JSON.stringify({ name, questions }),
    });
  },
  deleteStudySection(id: string): Promise<{ sections: StudySection[] }> {
    return request(`/api/studies/sections?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  // ---- Team study games (decks) ----
  // Team-built quizzes (AI-generated or from an uploaded file), shared across
  // the whole team and played with the level-up mechanics.
  studyDecks(): Promise<{ decks: TeamDeck[] }> {
    return request('/api/studies/decks');
  },
  generateStudyDeck(input: {
    name: string;
    topic: string;
    instructions?: string;
    count: number;
  }): Promise<{ deck: TeamDeckDetail; decks: TeamDeck[] }> {
    return request('/api/studies/decks/generate', { method: 'POST', body: JSON.stringify(input) });
  },
  // Step one of a file upload: AI formats the file text into questions the
  // author reviews before anything is saved (no deck is created yet).
  previewStudyDeck(input: {
    text: string;
    instructions?: string;
  }): Promise<{ questions: DeckQuestion[] }> {
    return request('/api/studies/decks/import/preview', { method: 'POST', body: JSON.stringify(input) });
  },
  // Step two: the author confirms the reviewed questions and the deck is created.
  confirmStudyDeck(input: {
    name: string;
    questions: DeckQuestion[];
  }): Promise<{ deck: TeamDeckDetail; decks: TeamDeck[] }> {
    return request('/api/studies/decks/import/confirm', { method: 'POST', body: JSON.stringify(input) });
  },
  studyDeck(id: string): Promise<{ deck: TeamDeckDetail }> {
    return request(`/api/studies/decks/${encodeURIComponent(id)}`);
  },
  // Edit a study game: rename, replace its questions, and/or set its categories
  // and their scoring weights (null turns weighting off; omitting leaves it).
  updateStudyDeck(
    id: string,
    patch: {
      name?: string;
      description?: string | null;
      categories?: string[];
      categoryWeights?: Record<string, number> | null;
      questions?: {
        topic: string;
        stem: string;
        options: { label: 'A' | 'B' | 'C' | 'D'; text: string }[];
        answer: 'A' | 'B' | 'C' | 'D';
        explanation?: string | null;
        sourceName?: string | null;
      }[];
    },
  ): Promise<{ deck: TeamDeckDetail; decks: TeamDeck[] }> {
    return request(`/api/studies/decks/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  // Combine several games into one new game with all their questions.
  mergeStudyDecks(input: { name: string; deckIds: string[]; tagSource?: boolean }): Promise<{ deck: TeamDeckDetail; decks: TeamDeck[] }> {
    return request('/api/studies/decks/merge', { method: 'POST', body: JSON.stringify(input) });
  },
  // AI auto-categorize a game's questions — returns one {id, topic} per question
  // for the author to review before saving.
  categorizeStudyDeck(input: {
    questions: { id: number; stem: string }[];
    categories?: string[];
    instructions?: string;
  }): Promise<{ assignments: { id: number; topic: string }[] }> {
    return request('/api/studies/decks/categorize', { method: 'POST', body: JSON.stringify(input) });
  },
  // AI correct-answer audit — review a game's questions and return any flagged
  // problems (a wrong answer key above all). Read-only; does not modify the game.
  auditStudyDeck(input: {
    questions: {
      id: number;
      stem: string;
      options: { label: 'A' | 'B' | 'C' | 'D'; text: string }[];
      answer: 'A' | 'B' | 'C' | 'D';
      explanation?: string | null;
    }[];
  }): Promise<{
    issues: { id: number; severity: 'high' | 'low'; problem: string; suggestedAnswer: 'A' | 'B' | 'C' | 'D' | null }[];
  }> {
    return request('/api/studies/decks/audit', { method: 'POST', body: JSON.stringify(input) });
  },
  deleteStudyDeck(id: string): Promise<{ decks: TeamDeck[] }> {
    return request(`/api/studies/decks/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  studyDeckGame(id: string): Promise<{ state: string | null }> {
    return request(`/api/studies/decks/${encodeURIComponent(id)}/game`);
  },
  saveStudyDeckGame(id: string, state: string): Promise<{ ok: true }> {
    return request(`/api/studies/decks/${encodeURIComponent(id)}/game`, {
      method: 'PUT',
      body: JSON.stringify({ state }),
    });
  },
  archiveStudyDeckGame(id: string, state: string): Promise<{ ok: true }> {
    return request(`/api/studies/decks/${encodeURIComponent(id)}/game/archive`, {
      method: 'POST',
      body: JSON.stringify({ state }),
    });
  },
  studyDeckLeaderboard(id: string): Promise<{ entries: LeaderboardEntry[] }> {
    return request(`/api/studies/decks/${encodeURIComponent(id)}/leaderboard`);
  },
  // ---- Team flashcard sets ----
  // Team-built term/definition sets (typed in, AI-generated, or from an uploaded
  // file), shared across the whole team and studied with auto-rotate.
  studyFlashcardSets(): Promise<{ sets: TeamFlashcardSet[] }> {
    return request('/api/studies/flashcards');
  },
  // Create a set from cards the client supplies (hand-typed, or the reviewed
  // output of a file upload / study-game extraction).
  createFlashcardSet(input: {
    name: string;
    description?: string;
    source?: 'manual' | 'upload' | 'from_game';
    cards: FlashcardInput[];
  }): Promise<{ set: TeamFlashcardSetDetail; sets: TeamFlashcardSet[] }> {
    return request('/api/studies/flashcards', { method: 'POST', body: JSON.stringify(input) });
  },
  // Generate flashcards from one of the team's study games (AI pulls the
  // vocabulary). Returns cards to review before creating the set.
  flashcardsFromGame(input: { deckId: string; instructions?: string }): Promise<{ cards: Flashcard[]; deckName: string }> {
    return request('/api/studies/flashcards/from-deck', { method: 'POST', body: JSON.stringify(input) });
  },
  generateFlashcardSet(input: {
    name: string;
    topic: string;
    instructions?: string;
    count: number;
  }): Promise<{ set: TeamFlashcardSetDetail; sets: TeamFlashcardSet[] }> {
    return request('/api/studies/flashcards/generate', { method: 'POST', body: JSON.stringify(input) });
  },
  // Step one of a file upload: AI formats the file text into cards the author
  // reviews before anything is saved (no set is created yet).
  previewFlashcardSet(input: {
    text: string;
    instructions?: string;
  }): Promise<{ cards: Flashcard[] }> {
    return request('/api/studies/flashcards/import/preview', { method: 'POST', body: JSON.stringify(input) });
  },
  studyFlashcardSet(id: string): Promise<{ set: TeamFlashcardSetDetail }> {
    return request(`/api/studies/flashcards/${encodeURIComponent(id)}`);
  },
  // Edit a flashcard set: rename and/or replace its cards.
  updateFlashcardSet(
    id: string,
    patch: { name?: string; description?: string | null; cards?: FlashcardInput[] },
  ): Promise<{ set: TeamFlashcardSetDetail; sets: TeamFlashcardSet[] }> {
    return request(`/api/studies/flashcards/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  deleteFlashcardSet(id: string): Promise<{ sets: TeamFlashcardSet[] }> {
    return request(`/api/studies/flashcards/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  // ---- Team study guides (slide presentations) ----
  // A team builds a study guide by conversing with VTS AI (which drafts the slide
  // text) and attaching its own screenshots, then presents it like a slideshow.
  studyGuides(): Promise<{ guides: StudyGuide[] }> {
    return request('/api/studies/guides');
  },
  // One turn of the guide-builder conversation. Sends the running transcript
  // (assistant turns carry the model's prior JSON) and gets back the reply plus
  // the complete current slide draft.
  studyGuideChat(
    messages: { role: 'user' | 'assistant'; content: string }[],
  ): Promise<{ reply: string; slides: GuideDraftSlide[] }> {
    return request('/api/studies/guides/chat', { method: 'POST', body: JSON.stringify({ messages }) });
  },
  saveStudyGuide(input: {
    name: string;
    description?: string;
    slides: GuideSlide[];
  }): Promise<{ guide: StudyGuideDetail; guides: StudyGuide[] }> {
    return request('/api/studies/guides', { method: 'POST', body: JSON.stringify(input) });
  },
  studyGuide(id: string): Promise<{ guide: StudyGuideDetail }> {
    return request(`/api/studies/guides/${encodeURIComponent(id)}`);
  },
  updateStudyGuide(
    id: string,
    patch: { name?: string; description?: string | null; slides?: GuideSlide[] },
  ): Promise<{ guide: StudyGuideDetail; guides: StudyGuide[] }> {
    return request(`/api/studies/guides/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  },
  deleteStudyGuide(id: string): Promise<{ guides: StudyGuide[] }> {
    return request(`/api/studies/guides/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  announcements(): Promise<{ announcements: Announcement[]; canManage: boolean }> {
    return request('/api/announcements');
  },
  addAnnouncement(title: string, body: string): Promise<{ announcements: Announcement[] }> {
    return request('/api/announcements', { method: 'POST', body: JSON.stringify({ title, body }) });
  },
  removeAnnouncement(id: string): Promise<{ announcements: Announcement[] }> {
    return request(`/api/announcements/${id}`, { method: 'DELETE' });
  },
  tradingSignals(): Promise<TradingSignals> {
    return request('/api/trading/signals');
  },
  analyzeAlert(id: string, image: { imageBase64: string; mediaType: string }): Promise<AlertsData> {
    return request(`/api/trading/alerts/${id}/analyze`, { method: 'POST', body: JSON.stringify(image) });
  },
  dismissAlert(id: string): Promise<AlertsData> {
    return request(`/api/trading/alerts/${id}/dismiss`, { method: 'POST', body: JSON.stringify({}) });
  },
  // ---- Phone push (Web Push) ----
  pushStatus(): Promise<{ configured: boolean; publicKey: string | null; subscribed: boolean }> {
    return request('/api/push/status');
  },
  pushSubscribe(sub: PushSubscriptionJSON): Promise<{ ok: true }> {
    return request('/api/push/subscribe', { method: 'POST', body: JSON.stringify(sub) });
  },
  pushUnsubscribe(endpoint: string): Promise<{ ok: true }> {
    return request('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) });
  },
  pushTest(): Promise<{ ok: true }> {
    return request('/api/push/test', { method: 'POST', body: JSON.stringify({}) });
  },
  // ---- Memberships (admin) ----
  // Granting requires a note saying why; the server refuses without one, and an
  // admin is capped at six months while founder-level users may grant forever.
  grantMembership(
    userId: string,
    input: { tier: MembershipTier; expiresAt: number | null; note: string },
  ): Promise<{ user: AdminUser; users: AdminUser[] }> {
    return request(`/api/admin/users/${userId}/membership`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  // Grant or revoke Trading Teams. Founder-level only on the server — teams are
  // hidden at launch and handed out by hand, so this is deliberately not
  // something every admin can do. Not a membership: there is no tier that buys
  // it and no expiry.
  setTradingTeamsGrant(userId: string, granted: boolean): Promise<{ users: AdminUser[] }> {
    return request(`/api/admin/users/${userId}/trading-teams`, {
      method: 'POST',
      body: JSON.stringify({ granted }),
    });
  },

  // ---- Administrator Log ----
  adminLog(): Promise<{ entries: AdminLogEntry[] }> {
    return request('/api/admin/log');
  },
  resolveAdminLogEntry(id: string): Promise<{ entries: AdminLogEntry[] }> {
    return request(`/api/admin/log/${id}/resolve`, { method: 'POST', body: JSON.stringify({}) });
  },
  setEarlyAccessStatus(id: string, status: 'new' | 'handled'): Promise<{ requests: EarlyAccessRequest[] }> {
    return request(`/api/admin/early-access/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  },

  // ---- Developer Blog (founder-level) ----
  devBlog(): Promise<{ posts: DevBlogPost[] }> {
    return request('/api/dev-blog');
  },
  createDevBlogPost(input: {
    title: string;
    body: string;
    asDevelopment?: boolean;
    pinned?: boolean;
  }): Promise<{ posts: DevBlogPost[] }> {
    return request('/api/dev-blog', { method: 'POST', body: JSON.stringify(input) });
  },
  updateDevBlogPost(
    id: string,
    patch: { title?: string; body?: string; pinned?: boolean },
  ): Promise<{ posts: DevBlogPost[] }> {
    return request(`/api/dev-blog/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  deleteDevBlogPost(id: string): Promise<{ posts: DevBlogPost[] }> {
    return request(`/api/dev-blog/${id}`, { method: 'DELETE' });
  },
  replyToDevBlogPost(
    id: string,
    body: string,
    asDevelopment?: boolean,
  ): Promise<{ posts: DevBlogPost[] }> {
    return request(`/api/dev-blog/${id}/replies`, {
      method: 'POST',
      body: JSON.stringify({ body, asDevelopment }),
    });
  },
  deleteDevBlogReply(id: string): Promise<{ posts: DevBlogPost[] }> {
    return request(`/api/dev-blog/replies/${id}`, { method: 'DELETE' });
  },

  // ---- Administrator chat ----
  // One install-wide room for founders, developers and admins. Not team-scoped,
  // unlike the team chat: an admin on one desk needs to reach one on another.
  adminChat(): Promise<{ messages: ChatMessage[] }> {
    return request('/api/chat/admin');
  },
  sendAdminChat(body: string): Promise<{ messages: ChatMessage[] }> {
    return request('/api/chat/admin', { method: 'POST', body: JSON.stringify({ body }) });
  },
  deleteAdminChat(id: string): Promise<{ messages: ChatMessage[] }> {
    return request(`/api/chat/admin/${id}`, { method: 'DELETE' });
  },

  // ---- Pushover (custom-sound notifications) ----
  pushoverStatus(): Promise<{ configured: boolean; connected: boolean }> {
    return request('/api/pushover/status');
  },
  pushoverConnect(userKey: string): Promise<{ ok: true }> {
    return request('/api/pushover/connect', { method: 'POST', body: JSON.stringify({ userKey }) });
  },
  pushoverDisconnect(): Promise<{ ok: true }> {
    return request('/api/pushover/connect', { method: 'DELETE' });
  },
  // 'standard' goes out exactly the way a real trade notification does;
  // 'emergency' repeats until acknowledged in the Pushover app, which is the
  // only level iOS lets through silent mode and Focus.
  pushoverTest(kind: PushoverTestKind = 'standard'): Promise<{ ok: true }> {
    return request('/api/pushover/test', { method: 'POST', body: JSON.stringify({ kind }) });
  },
  // ---- Per-user notification preferences ----
  notificationPrefs(): Promise<{
    targets: NotifTarget[];
    prefs: Record<string, NotifPrefFlags>;
    levels: Record<string, NotifPrefLevels>;
  }> {
    return request('/api/notification-prefs');
  },
  // Flags and levels are saved together — the panel holds both, and sending only
  // half would leave the server guessing at the other.
  setNotificationPref(
    targetUserId: string,
    flags: NotifPrefFlags,
    levels: NotifPrefLevels,
  ): Promise<{ ok: true }> {
    return request(`/api/notification-prefs/${targetUserId}`, {
      method: 'PUT',
      body: JSON.stringify({ flags, levels }),
    });
  },
  // ---- Repeating alerts ----
  alertRepeatPrefs(): Promise<{ prefs: AlertRepeatPrefs }> {
    return request('/api/pushover/repeat-prefs');
  },
  saveAlertRepeatPrefs(prefs: Partial<AlertRepeatPrefs>): Promise<{ prefs: AlertRepeatPrefs }> {
    return request('/api/pushover/repeat-prefs', { method: 'PUT', body: JSON.stringify(prefs) });
  },
  // Nudge people in your private group — everybody, or the ones you pick.
  // An empty `userIds` means everybody, which is also what an older bundle
  // sends by omitting it entirely.
  //
  // Answers with how many people it actually reached, so the sender is told the
  // truth rather than a cheerful "sent" when the recipients have group alerts
  // switched off.
  sendGroupAlert(kind: GroupAlertKind, userIds: string[] = []): Promise<{ recipients: number }> {
    return request('/api/notifications/group-alert', {
      method: 'POST',
      body: JSON.stringify({ kind, userIds }),
    });
  },
  liveAlerts(): Promise<{ alerts: LiveAlert[] }> {
    return request('/api/pushover/live-alerts');
  },
  // No id clears everything still repeating — what "I have opened the terminal"
  // means.
  acknowledgeAlerts(id?: string): Promise<{ cleared: number }> {
    return request('/api/pushover/acknowledge', {
      method: 'POST',
      body: JSON.stringify(id ? { id } : {}),
    });
  },
  getTodo(): Promise<{ sections: TodoSection[] }> {
    return request('/api/todo');
  },
  addTodoItem(sectionId: string, text: string): Promise<{ sections: TodoSection[] }> {
    return request('/api/todo/items', {
      method: 'POST',
      body: JSON.stringify({ sectionId, text }),
    });
  },
  addTodoSection(
    title: string,
    type?: 'one' | 'daily' | 'note',
    icon?: string,
  ): Promise<{ sections: TodoSection[] }> {
    return request('/api/todo/sections', {
      method: 'POST',
      body: JSON.stringify({ title, type, icon }),
    });
  },
  moveTodoItem(
    id: string,
    to: 'top' | 'bottom' | 'up' | 'down',
    by?: number,
  ): Promise<{ sections: TodoSection[] }> {
    return request(`/api/todo/items/${id}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ to, by }),
    });
  },
  toggleTodoItem(id: string): Promise<{ sections: TodoSection[]; previous: TodoItemState }> {
    return request(`/api/todo/items/${id}/toggle`, { method: 'PATCH' });
  },
  // Undo a check/uncheck by restoring the item's prior state.
  setTodoItemState(prev: TodoItemState): Promise<{ sections: TodoSection[] }> {
    return request(`/api/todo/items/${prev.id}/state`, {
      method: 'POST',
      body: JSON.stringify({ done: prev.done, dueAt: prev.dueAt }),
    });
  },
  todoCommand(command: string): Promise<TodoCommandResult> {
    return request('/api/todo/command', { method: 'POST', body: JSON.stringify({ command }) });
  },
  removeTodoItem(
    id: string,
  ): Promise<{ sections: TodoSection[]; removed: RemovedTodoItem | null }> {
    return request(`/api/todo/items/${id}`, { method: 'DELETE' });
  },
  restoreTodoItem(item: RemovedTodoItem): Promise<{ sections: TodoSection[] }> {
    return request('/api/todo/items/restore', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  },

  // ---- Study Packages ----
  // Validate reads and reports; commit writes. Nothing is created by validating,
  // so a creator can paste, read the errors, fix them with their AI and paste
  // again without leaving anything behind. Neither call touches VTS AI.
  validateStudyPackage(
    documents: string[],
    blueprint: ImportBlueprintPayload,
  ): Promise<{ result: PackageValidation }> {
    return request('/api/studies/packages/import/validate', {
      method: 'POST',
      body: JSON.stringify({ documents, blueprint }),
    });
  },
  commitStudyPackage(
    documents: string[],
    blueprint: ImportBlueprintPayload,
    // Only for the hybrid where the AI wrote the extras and the creator typed
    // the questions. They are created in the same transaction as the import.
    manualQuestions?: ManualPackagePayload['questions'],
  ): Promise<{ package: { id: string; name: string } }> {
    return request('/api/studies/packages/import/commit', {
      method: 'POST',
      body: JSON.stringify({ documents, blueprint, manualQuestions }),
    });
  },
  // Finishing a package: adding a part it was created without. Same payload as
  // the import above, aimed at a package that already exists — it ADDS and
  // never replaces, so a part that is already there is refused by name.
  addToStudyPackage(
    id: string,
    documents: string[],
    blueprint: ImportBlueprintPayload,
    manualQuestions?: ManualPackagePayload['questions'],
  ): Promise<{ package: { id: string; name: string } }> {
    return request(`/api/studies/packages/${encodeURIComponent(id)}/add`, {
      method: 'POST',
      body: JSON.stringify({ documents, blueprint, manualQuestions }),
    });
  },
  // The wizard's manual ending: the same transactional creator, given questions
  // that were typed in rather than imported.
  createManualStudyPackage(payload: ManualPackagePayload): Promise<{ package: { id: string; name: string } }> {
    return request('/api/studies/packages/manual', { method: 'POST', body: JSON.stringify(payload) });
  },
  // Renaming a package, or changing what it says it is about. Its CONTENT is
  // edited through the ordinary makers, which list package-backed rows.
  updateStudyPackage(
    id: string,
    patch: { name?: string; subject?: string | null; description?: string | null },
  ): Promise<{ package: StudyPackageDetail }> {
    return request(`/api/studies/packages/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  // The library: a person's own packages, the ones handed to them, and the ones
  // they took from the VTS Study Library. Archived ones are asked for
  // separately, which is how an owner finds one to restore.
  listStudyPackages(archived = false): Promise<{ packages: StudyPackage[]; archived: boolean }> {
    return request(`/api/studies/packages${archived ? '?archived=true' : ''}`);
  },
  getStudyPackage(id: string): Promise<{ package: StudyPackageDetail }> {
    return request(`/api/studies/packages/${encodeURIComponent(id)}`);
  },
  archiveStudyPackage(id: string): Promise<{ package: StudyPackageDetail; packages: StudyPackage[] }> {
    return request(`/api/studies/packages/${encodeURIComponent(id)}/archive`, { method: 'POST' });
  },
  unarchiveStudyPackage(id: string): Promise<{ package: StudyPackageDetail; packages: StudyPackage[] }> {
    return request(`/api/studies/packages/${encodeURIComponent(id)}/unarchive`, { method: 'POST' });
  },

  // ---- Sharing ----
  // By username. The server resolves it against the real user table, so a typo
  // finds nobody and says so rather than handing the package to somebody else.
  shareStudyPackage(
    id: string,
    handle: string,
  ): Promise<{ share: StudyShare; alreadyShared: boolean; shares: StudyShare[]; package: StudyPackageDetail }> {
    return request(`/api/studies/packages/${encodeURIComponent(id)}/share`, {
      method: 'POST',
      body: JSON.stringify({ handle }),
    });
  },
  listStudyPackageShares(id: string): Promise<{ shares: StudyShare[] }> {
    return request(`/api/studies/packages/${encodeURIComponent(id)}/shares`);
  },
  // Taking access back. The recipient's progress is deliberately untouched.
  revokeStudyPackageShare(
    id: string,
    shareId: string,
  ): Promise<{ shares: StudyShare[]; package: StudyPackageDetail }> {
    return request(`/api/studies/packages/${encodeURIComponent(id)}/shares/${encodeURIComponent(shareId)}`, {
      method: 'DELETE',
    });
  },
  sharedStudyPackages(): Promise<{ pending: StudyShare[]; accepted: StudyShare[] }> {
    return request('/api/studies/shared-with-me');
  },
  respondToStudyShare(
    shareId: string,
    accept: boolean,
  ): Promise<{ pending: StudyShare[]; accepted: StudyShare[]; packages: StudyPackage[] }> {
    return request(`/api/studies/shares/${encodeURIComponent(shareId)}/respond`, {
      method: 'POST',
      body: JSON.stringify({ accept }),
    });
  },

  // ---- The VTS Study Library ----
  // Submitting is not publishing: an administrator reads it and decides.
  studyLibraryAttestations(): Promise<{ version: string; statements: string[] }> {
    return request('/api/studies/library/attestations');
  },
  submitStudyPackage(id: string): Promise<{ submission: StudySubmission; package: StudyPackageDetail }> {
    return request(`/api/studies/packages/${encodeURIComponent(id)}/submit`, {
      method: 'POST',
      body: JSON.stringify({ attested: true }),
    });
  },
  withdrawStudyPackage(id: string): Promise<{ package: StudyPackageDetail; submissions: StudySubmission[] }> {
    return request(`/api/studies/packages/${encodeURIComponent(id)}/withdraw`, { method: 'POST' });
  },
  // Stop distributing your own published package. Deliberately distinct from
  // `withdrawStudyPackage`, which takes back a request nobody has reviewed yet:
  // this one is about something already in the library.
  withdrawStudyPackageFromLibrary(
    id: string,
  ): Promise<{ package: StudyPackageDetail; submissions: StudySubmission[] }> {
    return request(`/api/studies/packages/${encodeURIComponent(id)}/withdraw-from-library`, { method: 'POST' });
  },
  studyPackageSubmissions(id: string): Promise<{ submissions: StudySubmission[] }> {
    return request(`/api/studies/packages/${encodeURIComponent(id)}/submissions`);
  },
  browseStudyLibrary(): Promise<{ entries: StudyLibraryEntry[] }> {
    return request('/api/studies/library');
  },
  // No copy is made — the learner studies the same package everybody else does.
  addStudyLibraryPackage(id: string): Promise<{ entries: StudyLibraryEntry[]; packages: StudyPackage[] }> {
    return request(`/api/studies/library/${encodeURIComponent(id)}/add`, { method: 'POST' });
  },
  removeStudyLibraryPackage(id: string): Promise<{ entries: StudyLibraryEntry[]; packages: StudyPackage[] }> {
    return request(`/api/studies/library/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  // ---- Moderation (admins) ----
  adminStudySubmissions(status?: StudySubmissionStatus): Promise<{ submissions: StudySubmission[] }> {
    return request(`/api/studies/admin/submissions${status ? `?status=${encodeURIComponent(status)}` : ''}`);
  },
  reviewStudySubmission(
    id: string,
    decision: 'approved' | 'rejected' | 'changes_requested',
    note?: string | null,
  ): Promise<{ submission: StudySubmission; submissions: StudySubmission[] }> {
    return request(`/api/studies/admin/submissions/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, note: note ?? null }),
    });
  },
  unpublishStudyPackage(id: string): Promise<{ ok: true }> {
    return request(`/api/studies/admin/packages/${encodeURIComponent(id)}/unpublish`, { method: 'POST' });
  },

  // ---- Developer capabilities ----
  // The same production terminal, seen as somebody else. The preview is stored
  // on the SESSION server-side, so the API answers as that account too — the
  // guards refuse, the payloads narrow, the 402s fire. Nothing about the real
  // account is written, and leaving is one call.
  setPreview(mode: PreviewMode): Promise<{ preview: PreviewMode }> {
    return request('/api/dev/preview', { method: 'POST', body: JSON.stringify({ mode }) });
  },
  exitPreview(): Promise<{ preview: null }> {
    return request('/api/dev/preview', { method: 'DELETE' });
  },
  studyFixtures(): Promise<{ schemaVersion: number; fixtures: { kind: string; label: string }[] }> {
    return request('/api/dev/study/fixtures');
  },
  // Returns the documents a creator would have pasted — the fixture then goes
  // through the ordinary validate-then-confirm path with no shortcut around it.
  buildStudyFixture(
    kind: string,
    name: string,
    subject: string,
    blueprint: ImportBlueprintPayload,
  ): Promise<{ kind: string; label: string; documents: string[] }> {
    return request('/api/dev/study/fixtures', {
      method: 'POST',
      body: JSON.stringify({ kind, name, subject, blueprint }),
    });
  },
  // Which database is this deployment serving, and what is in it? Read-only,
  // and it never returns a connection string.
  devEnvironment(): Promise<DevEnvironment> {
    return request('/api/dev/environment');
  },
  studyPackageState(id: string): Promise<{ state: StudyPackageState }> {
    return request(`/api/dev/study/packages/${encodeURIComponent(id)}/state`);
  },
};
