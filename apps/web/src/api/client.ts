import type {
  AdminUser,
  BrokerStatus,
  KiaDashboard,
  RemovedKiaDeal,
  RemovedTodoItem,
  RoleKey,
  TodoSection,
  User,
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
  brokerStatus(): Promise<{ brokers: BrokerStatus[]; stage: number; note: string }> {
    return request('/api/brokers/status');
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
};

// Append ?month=YYYY-MM when a specific month is being viewed.
function monthQuery(month?: string): string {
  return month ? `?month=${encodeURIComponent(month)}` : '';
}
