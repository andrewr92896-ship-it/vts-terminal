import type { AdminUser, BrokerStatus, KiaDashboard, RoleKey, TodoSection, User } from './types';

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
  removeTodoItem(id: string): Promise<{ sections: TodoSection[] }> {
    return request(`/api/todo/items/${id}`, { method: 'DELETE' });
  },
  kiaDashboard(): Promise<KiaDashboard> {
    return request('/api/kia/dashboard');
  },
  kiaAddDeal(deal: {
    customer?: string;
    model: string;
    type: 'New' | 'Used';
    profit: number;
    soldAt?: string;
  }): Promise<KiaDashboard> {
    return request('/api/kia/deals', { method: 'POST', body: JSON.stringify(deal) });
  },
  kiaRemoveDeal(id: string): Promise<KiaDashboard> {
    return request(`/api/kia/deals/${id}`, { method: 'DELETE' });
  },
  kiaUpdateSettings(patch: { goalUnits?: number; reviewCount?: number }): Promise<KiaDashboard> {
    return request('/api/kia/settings', { method: 'PATCH', body: JSON.stringify(patch) });
  },
};
