import type {
  AdminUser,
  AiUsage,
  AlertsData,
  BrokerConnection,
  BrokerStatus,
  ChallengeData,
  ChallengeInput,
  ConnectionInput,
  Expense,
  FinanceCommandResult,
  FinanceOverview,
  FtpPhase,
  HistoryData,
  NetWorthData,
  NetWorthKind,
  SessionInput,
  StrategySession,
  StudyQuizResult,
  MarketNewsData,
  NewsDraft,
  NewsInput,
  EventInput,
  LiveWall,
  TradeInput,
  TradeCommandResult,
  TradeLogData,
  RemovedTrade,
  KiaDashboard,
  KiaCommandResult,
  KiaDealParseResult,
  RemovedKiaDeal,
  RemovedTodoItem,
  PracticeOverview,
  WealthCommandResult,
  PortfoliosData,
  PortfolioInput,
  AllocationInput,
  PlansData,
  PlanInput,
  ComplianceData,
  ComplianceInput,
  RemovedWealthClient,
  RoleKey,
  TodoItemState,
  TodoCommandResult,
  TodoSection,
  User,
  WealthClientStatus,
  WealthClientsData,
} from './types';

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
  login(username: string, password: string): Promise<{ user: User }> {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },
  logout(): Promise<{ ok: boolean }> {
    return request('/api/auth/logout', { method: 'POST' });
  },
  changePassword(currentPassword: string, newPassword: string): Promise<{ user: User }> {
    return request('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },
  updateProfile(patch: { username?: string; displayName?: string }): Promise<{ user: User }> {
    return request('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
  adminListUsers(): Promise<{ users: AdminUser[] }> {
    return request('/api/admin/users');
  },
  adminCreateUser(input: {
    username: string;
    displayName: string;
    password: string;
    roles: RoleKey[];
    viewBrokerage?: boolean;
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
      roles?: RoleKey[];
      active?: boolean;
      viewBrokerage?: boolean;
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
  brokerStatus(): Promise<{ brokers: BrokerStatus[]; stage: number; note: string }> {
    return request('/api/brokers/status');
  },
  askAi(messages: { role: 'user' | 'assistant'; content: string }[], workspace?: string): Promise<{ reply: string }> {
    return request('/api/ai/ask', { method: 'POST', body: JSON.stringify({ messages, workspace }) });
  },
  aiAct(workspace: string, message: string): Promise<{ reply: string; applied: string[]; skipped: string[] }> {
    return request('/api/ai/act', { method: 'POST', body: JSON.stringify({ workspace, message }) });
  },
  aiUsage(): Promise<AiUsage> {
    return request('/api/ai/usage');
  },
  askKia(messages: { role: 'user' | 'assistant'; content: string }[]): Promise<{ reply: string }> {
    return request('/api/ai/kia', { method: 'POST', body: JSON.stringify({ messages }) });
  },
  studyTutor(body: {
    explain?: { stem: string; options: { label: string; text: string }[]; answer: string; topic?: string };
    ask?: string;
  }): Promise<{ reply: string }> {
    return request('/api/ai/tutor', { method: 'POST', body: JSON.stringify(body) });
  },
  studyQuiz(body: { topic?: string; count?: number }): Promise<StudyQuizResult> {
    return request('/api/ai/quiz', { method: 'POST', body: JSON.stringify(body) });
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
  marketNews(): Promise<MarketNewsData> {
    return request('/api/trading/news');
  },
  addNews(input: NewsInput): Promise<MarketNewsData> {
    return request('/api/trading/news', { method: 'POST', body: JSON.stringify(input) });
  },
  draftNews(blurb: string): Promise<{ draft: NewsDraft }> {
    return request('/api/trading/news/draft', { method: 'POST', body: JSON.stringify({ blurb }) });
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
  newsBrief(): Promise<{ brief: string }> {
    return request('/api/trading/news/brief', { method: 'POST', body: JSON.stringify({}) });
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
  addTrade(trade: TradeInput): Promise<TradeLogData> {
    return request('/api/trading/trades', { method: 'POST', body: JSON.stringify(trade) });
  },
  parseTrade(note: string): Promise<TradeCommandResult> {
    return request('/api/trading/trades/parse', { method: 'POST', body: JSON.stringify({ note }) });
  },
  tradeLogBrief(): Promise<{ brief: string }> {
    return request('/api/trading/trades/brief', { method: 'POST', body: JSON.stringify({}) });
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
  analyzeAlert(id: string, image: { imageBase64: string; mediaType: string }): Promise<AlertsData> {
    return request(`/api/trading/alerts/${id}/analyze`, { method: 'POST', body: JSON.stringify(image) });
  },
  dismissAlert(id: string): Promise<AlertsData> {
    return request(`/api/trading/alerts/${id}/dismiss`, { method: 'POST', body: JSON.stringify({}) });
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
  kiaDashboard(month?: string): Promise<KiaDashboard> {
    return request(`/api/kia/dashboard${monthQuery(month)}`);
  },
  kiaParseDeal(note: string): Promise<KiaDealParseResult> {
    return request('/api/kia/deals/parse', { method: 'POST', body: JSON.stringify({ note }) });
  },
  kiaCommand(note: string): Promise<KiaCommandResult> {
    return request('/api/kia/command', { method: 'POST', body: JSON.stringify({ note }) });
  },
  kiaBrief(month?: string): Promise<{ brief: string }> {
    return request(`/api/kia/brief${monthQuery(month)}`, { method: 'POST', body: JSON.stringify({}) });
  },
  kiaAddDeal(
    deal: {
      customer?: string;
      model: string;
      type: 'New' | 'Used';
      profit?: number;
      frontProfit?: number;
      backProfit?: number;
      soldAt?: string;
    },
    month?: string,
  ): Promise<KiaDashboard> {
    return request(`/api/kia/deals${monthQuery(month)}`, {
      method: 'POST',
      body: JSON.stringify(deal),
    });
  },
  kiaUpdateDeal(
    id: string,
    patch: {
      customer?: string;
      model?: string;
      type?: 'New' | 'Used';
      profit?: number;
      frontProfit?: number;
      backProfit?: number;
      soldAt?: string;
    },
    month?: string,
  ): Promise<KiaDashboard> {
    return request(`/api/kia/deals/${id}${monthQuery(month)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
  kiaRemoveDeal(
    id: string,
    month?: string,
  ): Promise<KiaDashboard & { removed: RemovedKiaDeal | null }> {
    return request(`/api/kia/deals/${id}${monthQuery(month)}`, { method: 'DELETE' });
  },
  kiaRestoreDeal(deal: RemovedKiaDeal, month?: string): Promise<KiaDashboard> {
    return request(`/api/kia/deals/restore${monthQuery(month)}`, {
      method: 'POST',
      body: JSON.stringify(deal),
    });
  },
  kiaUpdateSettings(
    patch: { goalUnits?: number; reviewCount?: number },
    month?: string,
  ): Promise<KiaDashboard> {
    return request(`/api/kia/settings${monthQuery(month)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
  kiaUpdatePayPlan(
    patch: {
      commissionMode?: 'total' | 'split';
      commissionPct?: number;
      commissionFrontPct?: number;
      commissionBackPct?: number;
      miniAmount?: number;
      reviewRequired?: boolean;
      reviewReqPct?: number;
      bonusTiers?: { units: number; amount: number }[];
    },
    month?: string,
  ): Promise<KiaDashboard> {
    return request(`/api/kia/payplan${monthQuery(month)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
  // ---- Personal Finance ----
  financeOverview(): Promise<FinanceOverview> {
    return request('/api/finance/overview');
  },
  financeOverviewBrief(): Promise<{ brief: string }> {
    return request('/api/finance/overview/brief', { method: 'POST', body: JSON.stringify({}) });
  },
  financeCommand(note: string): Promise<FinanceCommandResult> {
    return request('/api/finance/command', { method: 'POST', body: JSON.stringify({ note }) });
  },
  financeUpdateSettings(patch: { ftpPhase?: FtpPhase; ftpDivisor?: number; ftpPayoutPct?: number }): Promise<FinanceOverview> {
    return request('/api/finance/settings', { method: 'PATCH', body: JSON.stringify(patch) });
  },
  financeExpenses(): Promise<{ expenses: Expense[] }> {
    return request('/api/finance/expenses');
  },
  financeAddExpense(input: { label: string; amount: number; dayOfMonth: number; category?: string | null }): Promise<{ expenses: Expense[] }> {
    return request('/api/finance/expenses', { method: 'POST', body: JSON.stringify(input) });
  },
  financeUpdateExpense(id: string, patch: { label?: string; amount?: number; dayOfMonth?: number; category?: string | null; active?: boolean }): Promise<{ expenses: Expense[] }> {
    return request(`/api/finance/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  financeRemoveExpense(id: string): Promise<{ expenses: Expense[] }> {
    return request(`/api/finance/expenses/${id}`, { method: 'DELETE' });
  },
  financeNetWorth(): Promise<NetWorthData> {
    return request('/api/finance/net-worth');
  },
  financeAddNetWorth(input: { label: string; amount: number; kind: NetWorthKind }): Promise<NetWorthData> {
    return request('/api/finance/net-worth', { method: 'POST', body: JSON.stringify(input) });
  },
  financeUpdateNetWorth(id: string, patch: { label?: string; amount?: number; kind?: NetWorthKind }): Promise<NetWorthData> {
    return request(`/api/finance/net-worth/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  financeRemoveNetWorth(id: string): Promise<NetWorthData> {
    return request(`/api/finance/net-worth/${id}`, { method: 'DELETE' });
  },
  wealthOverview(): Promise<PracticeOverview> {
    return request('/api/wealth/overview');
  },
  wealthOverviewBrief(): Promise<{ brief: string }> {
    return request('/api/wealth/overview/brief', { method: 'POST', body: JSON.stringify({}) });
  },
  wealthCommand(note: string): Promise<WealthCommandResult> {
    return request('/api/wealth/command', { method: 'POST', body: JSON.stringify({ note }) });
  },
  wealthPortfolios(): Promise<PortfoliosData> {
    return request('/api/wealth/portfolios');
  },
  wealthAddPortfolio(input: PortfolioInput): Promise<PortfoliosData> {
    return request('/api/wealth/portfolios', { method: 'POST', body: JSON.stringify(input) });
  },
  wealthUpdatePortfolio(id: string, patch: PortfolioInput): Promise<PortfoliosData> {
    return request(`/api/wealth/portfolios/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  wealthRemovePortfolio(id: string): Promise<PortfoliosData> {
    return request(`/api/wealth/portfolios/${id}`, { method: 'DELETE' });
  },
  wealthAddAllocation(portfolioId: string, input: AllocationInput): Promise<PortfoliosData> {
    return request(`/api/wealth/portfolios/${portfolioId}/allocations`, { method: 'POST', body: JSON.stringify(input) });
  },
  wealthUpdateAllocation(id: string, patch: AllocationInput): Promise<PortfoliosData> {
    return request(`/api/wealth/allocations/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  wealthRemoveAllocation(id: string): Promise<PortfoliosData> {
    return request(`/api/wealth/allocations/${id}`, { method: 'DELETE' });
  },
  wealthPlans(): Promise<PlansData> {
    return request('/api/wealth/plans');
  },
  wealthAddPlan(input: PlanInput): Promise<PlansData> {
    return request('/api/wealth/plans', { method: 'POST', body: JSON.stringify(input) });
  },
  wealthUpdatePlan(id: string, patch: PlanInput): Promise<PlansData> {
    return request(`/api/wealth/plans/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  wealthRemovePlan(id: string): Promise<PlansData> {
    return request(`/api/wealth/plans/${id}`, { method: 'DELETE' });
  },
  wealthCompliance(): Promise<ComplianceData> {
    return request('/api/wealth/compliance');
  },
  wealthAddCompliance(input: ComplianceInput): Promise<ComplianceData> {
    return request('/api/wealth/compliance', { method: 'POST', body: JSON.stringify(input) });
  },
  wealthUpdateCompliance(id: string, patch: ComplianceInput): Promise<ComplianceData> {
    return request(`/api/wealth/compliance/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  wealthRemoveCompliance(id: string): Promise<ComplianceData> {
    return request(`/api/wealth/compliance/${id}`, { method: 'DELETE' });
  },
  wealthClients(): Promise<WealthClientsData> {
    return request('/api/wealth/clients');
  },
  wealthAddClient(client: {
    name: string;
    email?: string;
    phone?: string;
    accountValue?: number;
    status?: WealthClientStatus;
    notes?: string;
  }): Promise<WealthClientsData> {
    return request('/api/wealth/clients', {
      method: 'POST',
      body: JSON.stringify(client),
    });
  },
  wealthUpdateClient(
    id: string,
    patch: {
      name?: string;
      email?: string;
      phone?: string;
      accountValue?: number | null;
      status?: WealthClientStatus;
      notes?: string;
    },
  ): Promise<WealthClientsData> {
    return request(`/api/wealth/clients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
  wealthRemoveClient(
    id: string,
  ): Promise<WealthClientsData & { removed: RemovedWealthClient | null }> {
    return request(`/api/wealth/clients/${id}`, { method: 'DELETE' });
  },
  wealthRestoreClient(client: RemovedWealthClient): Promise<WealthClientsData> {
    return request('/api/wealth/clients/restore', {
      method: 'POST',
      body: JSON.stringify(client),
    });
  },
};

// Append ?month=YYYY-MM when a specific month is being viewed.
function monthQuery(month?: string): string {
  return month ? `?month=${encodeURIComponent(month)}` : '';
}
