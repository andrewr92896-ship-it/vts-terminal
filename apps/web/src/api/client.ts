import type {
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
  BrokerStatus,
  ChallengeData,
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
  DeskSettings,
  ManualPosition,
  ManualPositionInput,
  AnalyzePositionResult,
  OwnedBrokerConnection,
  TruthPost,
  HistoryData,
  SessionInput,
  StrategySession,
  MarketHoursResult,
  SessionAlertPrefs,
  TradingBoard,
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
  DeskInstrument,
  DeskQuote,
  DeskWorkingOrder,
  DeskOrderRecord,
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
  NavOrderOverride,
} from './types';

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
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
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
    throw new ApiError(res.status, message);
  }

  return body as T;
}

export const api = {
  me(): Promise<{ user: User }> {
    return request('/api/auth/me');
  },
  login(email: string, password: string): Promise<{ user: User }> {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
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
  // My Portal ▸ Feature Access — the optional parts of the portal this user has
  // turned on. `me()` already carries them on user.access.features; these two are
  // for the screen that edits them.
  features(): Promise<{ features: UserFeatures }> {
    return request('/api/features');
  },
  saveFeatures(patch: {
    advancedTrading?: boolean;
    funded?: boolean;
    acknowledgeTrading?: boolean;
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
  }): Promise<{ user: User }> {
    return request('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
  // ---- My Portal: user-created Trading Teams ----
  myPortal(): Promise<MyPortalData> {
    return request('/api/my-portal/team');
  },
  myPortalConfig(): Promise<{ badgePresets: string[]; maxMembers: number }> {
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
  adminAiPrompts(): Promise<{ prompts: AiPrompt[] }> {
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
  // ---- Sidebar layout (workspace + section ordering) ----
  // Any signed-in user reads the effective order; only a founder can change it.
  navLayout(): Promise<{ order: NavOrderOverride | null }> {
    return request('/api/nav-layout');
  },
  adminSaveNavLayout(order: NavOrderOverride): Promise<{ ok: boolean; order: NavOrderOverride }> {
    return request('/api/admin/nav-layout', { method: 'PUT', body: JSON.stringify(order) });
  },
  adminResetNavLayout(): Promise<{ ok: boolean; order: null }> {
    return request('/api/admin/nav-layout', { method: 'DELETE' });
  },
  brokerStatus(): Promise<{ brokers: BrokerStatus[]; stage: number; note: string }> {
    return request('/api/brokers/status');
  },
  askAi(messages: { role: 'user' | 'assistant'; content: string }[], workspace?: string): Promise<{ reply: string }> {
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
  studyTutorChat(messages: { role: 'user' | 'assistant'; content: string }[]): Promise<{ reply: string }> {
    return request('/api/ai/tutor', { method: 'POST', body: JSON.stringify({ messages }) });
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
  marketHours(symbol: string): Promise<MarketHoursResult> {
    return request('/api/trading/market-hours', { method: 'POST', body: JSON.stringify({ symbol }) });
  },
  sessionAlertPrefs(): Promise<{ prefs: SessionAlertPrefs }> {
    return request('/api/trading/session-alert-prefs');
  },
  saveSessionAlertPrefs(prefs: SessionAlertPrefs): Promise<{ prefs: SessionAlertPrefs }> {
    return request('/api/trading/session-alert-prefs', { method: 'PUT', body: JSON.stringify(prefs) });
  },
  tradingBoards(): Promise<{ boards: TradingBoard[] }> {
    return request('/api/trading/boards');
  },
  createBoard(input: BoardInput): Promise<{ board: TradingBoard; boards: TradingBoard[] }> {
    return request('/api/trading/boards', { method: 'POST', body: JSON.stringify(input) });
  },
  updateBoard(id: string, patch: BoardInput): Promise<{ board: TradingBoard; boards: TradingBoard[] }> {
    return request(`/api/trading/boards/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  removeBoard(id: string): Promise<{ boards: TradingBoard[] }> {
    return request(`/api/trading/boards/${id}`, { method: 'DELETE' });
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
  tradingChallenge(): Promise<ChallengeData> {
    return request('/api/trading/challenge');
  },
  tradingMetricsBrief(): Promise<{ brief: string }> {
    return request('/api/trading/metrics/brief', { method: 'POST', body: JSON.stringify({}) });
  },
  updateChallenge(patch: ChallengeInput): Promise<ChallengeData> {
    return request('/api/trading/challenge', { method: 'PATCH', body: JSON.stringify(patch) });
  },
  syncChallengeEquity(): Promise<ChallengeData> {
    return request('/api/trading/challenge/sync-equity', { method: 'POST', body: JSON.stringify({}) });
  },
  // Read the current balance off an FTP-account screenshot and set the equity.
  analyzeChallengeBalance(image: { imageBase64: string; mediaType: string }): Promise<AnalyzeAccountResult> {
    return request('/api/trading/challenge/analyze', { method: 'POST', body: JSON.stringify(image) });
  },
  // Live OANDA account capital (full traders only — 403 for view-only).
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
  // Admin: every teammate's connection, and rename/pause any of them.
  allConnections(): Promise<{ connections: OwnedBrokerConnection[] }> {
    return request('/api/trading/connections/all');
  },
  adminUpdateConnection(id: string, patch: { label?: string; active?: boolean; historyStartAt?: number | null }): Promise<{ connections: OwnedBrokerConnection[] }> {
    return request(`/api/trading/connections/${id}/admin`, { method: 'PATCH', body: JSON.stringify(patch) });
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
  // In-portal notifications (top-bar bell).
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
  }> {
    return request('/api/chat/activity');
  },
  tradingTruth(): Promise<{ posts: TruthPost[] }> {
    return request('/api/trading/truth');
  },
  // ---- Feedback: suggestions ----
  sendSuggestion(body: string): Promise<{ suggestion: Suggestion }> {
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
  ): Promise<{ needMore: boolean; reply: string; submitted: boolean }> {
    return request('/api/support/message', { method: 'POST', body: JSON.stringify({ kind, messages }) });
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
  // Edit a study game: rename, replace its questions, and/or set its categories.
  updateStudyDeck(
    id: string,
    patch: {
      name?: string;
      description?: string | null;
      categories?: string[];
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
  pushoverTest(): Promise<{ ok: true }> {
    return request('/api/pushover/test', { method: 'POST', body: JSON.stringify({}) });
  },
  // ---- Per-user notification preferences ----
  notificationPrefs(): Promise<{ targets: NotifTarget[]; prefs: Record<string, NotifPrefFlags> }> {
    return request('/api/notification-prefs');
  },
  setNotificationPref(targetUserId: string, flags: NotifPrefFlags): Promise<{ ok: true }> {
    return request(`/api/notification-prefs/${targetUserId}`, {
      method: 'PUT',
      body: JSON.stringify(flags),
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
};
