import type {
  AdminUser,
  AlertsData,
  BrokerConnection,
  BrokerStatus,
  ChallengeData,
  ChallengeInput,
  ConnectionInput,
  Expense,
  FinanceOverview,
  FtpPhase,
  HistoryData,
  NetWorthData,
  NetWorthKind,
  LiveWall,
  TradeInput,
  TradeLogData,
  RemovedTrade,
  KiaDashboard,
  RemovedKiaDeal,
  RemovedTodoItem,
  RemovedWealthClient,
  RoleKey,
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
  liveWall(): Promise<LiveWall> {
    return request('/api/trading/live');
  },
  tradeLog(): Promise<TradeLogData> {
    return request('/api/trading/trades');
  },
  tradingHistory(): Promise<HistoryData> {
    return request('/api/trading/history');
  },
  tradingChallenge(): Promise<ChallengeData> {
    return request('/api/trading/challenge');
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
  toggleTodoItem(id: string): Promise<{ sections: TodoSection[] }> {
    return request(`/api/todo/items/${id}/toggle`, { method: 'PATCH' });
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
