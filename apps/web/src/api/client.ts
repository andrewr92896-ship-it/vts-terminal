import type {
  AdminUser,
  EarlyAccessRequest,
  AiUsage,
  AlertsData,
  Announcement,
  ChatMessage,
  TeamChatFeed,
  NotificationItem,
  Suggestion,
  BugReport,
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
  TradingBoard,
  BoardInput,
  MarketNewsData,
  NewsInput,
  EventInput,
  LiveWall,
  TradeInput,
  TradeLogData,
  RemovedTrade,
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
  StudyGuide,
  StudyGuideDetail,
  GuideSlide,
  GuideDraftSlide,
  TradingSignals,
  User,
} from './types';

// A flashcard the user added to their own deck; topic matches the Series 65
// topics so it filters alongside the built-in cards.
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

// The team-gated Series 65 bank payload (the licensed content, served only to
// the owner's team). Shapes come from the studies meta module so the study
// screens and this client agree on one type.
import type { Series65Question, VocabCard } from '../workspaces/studies/series65Meta';
export interface Series65BankResponse {
  questions: Series65Question[];
  explanations: Record<number, string>;
  vocab: VocabCard[];
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
  // bundled defaults. Values are JSON blobs keyed by screen.
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
  // Desk-wide trading settings (shared across the team).
  deskSettings(): Promise<DeskSettings> {
    return request('/api/trading/desk-settings');
  },
  updateDeskSettings(patch: Partial<DeskSettings>): Promise<DeskSettings> {
    return request('/api/trading/desk-settings', { method: 'PATCH', body: JSON.stringify(patch) });
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
  adminUpdateConnection(id: string, patch: { label?: string; active?: boolean }): Promise<{ connections: OwnedBrokerConnection[] }> {
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
  tradingAlerts(): Promise<AlertsData> {
    return request('/api/trading/alerts');
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
  hubActivity(): Promise<{ chat: number; announcements: number; suggestions: number; bugs: number }> {
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
  adminSetBugStatus(id: string, status: 'open' | 'submitted' | 'resolved'): Promise<{ reports: BugReport[] }> {
    return request(`/api/admin/bugs/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  },
  adminDeleteBug(id: string): Promise<{ reports: BugReport[] }> {
    return request(`/api/admin/bugs/${id}`, { method: 'DELETE' });
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
  // The team-gated Series 65 question bank + explanations + vocabulary. Only the
  // owner's team may load it (the server returns 403 otherwise); the licensed
  // content never ships in the bundle.
  series65Bank(): Promise<Series65BankResponse> {
    return request('/api/studies/series65/bank');
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
  // Starred quiz questions (ids into the static Series 65 question bank).
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
  // the whole team and played with the same mechanics as the Series 65 game.
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
