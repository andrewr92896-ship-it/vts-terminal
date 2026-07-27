// The employee portal's API client. Deliberately separate from the main
// portal's `api/client.ts`: different endpoints, different session, and one
// extra obligation the main client does not have — every write must echo the
// per-session CSRF token in a custom header.

const CSRF_HEADER = 'x-vts-employee-csrf';

// Held in memory only. Not localStorage, not a cookie: a token that survives the
// tab is a token that can be stolen from storage later. A page reload re-reads
// it from GET /session, which needs the httpOnly cookie the browser holds.
let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export class EmployeeApiError extends Error {
  status: number;
  /** Set to 'totp' when the server wants an authenticator code next. */
  need?: string;
  retryAfter?: number;

  constructor(message: string, status: number, extra?: { need?: string; retryAfter?: number }) {
    super(message);
    this.status = status;
    this.need = extra?.need;
    this.retryAfter = extra?.retryAfter;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers[CSRF_HEADER] = csrfToken;

  const res = await fetch(`/api/employee${path}`, {
    method,
    credentials: 'include',
    // The employee surface is never cached anywhere, at any layer.
    cache: 'no-store',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const p = payload as { error?: string; need?: string; retryAfter?: number } | null;
    throw new EmployeeApiError(p?.error || `Request failed (${res.status})`, res.status, {
      need: p?.need,
      retryAfter: p?.retryAfter,
    });
  }
  return payload as T;
}

// ---- Shapes (mirror of apps/api/src/employee/service.ts) ----

export type EmploymentType = 'full_time' | 'part_time' | 'contractor' | 'intern';
export type EmployeeStatus = 'active' | 'suspended' | 'offboarded';
export type DocCategory = 'policy' | 'handbook' | 'form' | 'guide' | 'other';

export interface EmployeeMe {
  userId: string;
  name: string;
  loginEmail: string | null;
  avatarUrl: string | null;
  title: string | null;
  department: string | null;
  workEmail: string | null;
  workPhone: string | null;
  location: string | null;
  employeeNo: string | null;
  employmentType: EmploymentType;
  startedOn: string | null;
  status: EmployeeStatus;
  managerName: string | null;
  isPortalAdmin: boolean;
  /** Founder-level — gates the inline wording editor. Narrower than isPortalAdmin. */
  isDeveloper: boolean;
  twoFactorEnrolled: boolean;
  recoveryCodesLeft: number;
  lastLoginAt: number | null;
  lastLoginIp: string | null;
}

export interface DirectoryEntry {
  userId: string;
  name: string;
  avatarUrl: string | null;
  title: string | null;
  department: string | null;
  workEmail: string | null;
  workPhone: string | null;
  location: string | null;
  employmentType: EmploymentType;
  startedOn: string | null;
  managerName: string | null;
  isPortalAdmin: boolean;
  isMe: boolean;
}

export interface PersonView extends DirectoryEntry {
  status: EmployeeStatus;
  employeeNo: string | null;
  managerId: string | null;
  twoFactorEnrolled: boolean;
  lastLoginAt: number | null;
  accountActive: boolean;
  hasRole: boolean;
}

export interface CandidateView {
  userId: string;
  name: string;
  username: string;
  email: string | null;
}

export interface AnnouncementView {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  authorName: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DocumentView {
  id: string;
  title: string;
  category: DocCategory;
  summary: string | null;
  body: string | null;
  linkUrl: string | null;
  authorName: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TaskView {
  id: string;
  title: string;
  detail: string | null;
  dueOn: string | null;
  doneAt: number | null;
  assignedByName: string | null;
  /** Someone else set this, rather than the employee adding it themselves. */
  assigned: boolean;
  createdAt: number;
}

export interface TaskInput {
  title: string;
  detail?: string | null;
  dueOn?: string | null;
}

export interface SessionView {
  id: string;
  current: boolean;
  ip: string | null;
  userAgent: string | null;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
}

export interface AuditEntry {
  id: string;
  at: number;
  userId: string | null;
  actor: string | null;
  action: string;
  target: string | null;
  detail: string | null;
  ip: string | null;
  ok: boolean;
}

export interface SessionState {
  authenticated: boolean;
  stage?: 'pending_2fa' | 'active';
  requires2fa: boolean;
  csrfToken?: string;
  me?: EmployeeMe | null;
}

export interface LoginResult {
  status: 'ok' | 'enroll_required';
  csrfToken: string;
  me?: EmployeeMe;
}

export interface OverviewData {
  me: EmployeeMe;
  announcements: AnnouncementView[];
  counts: { people: number; documents: number };
  security: { sessionHours: number; idleMinutes: number; requires2fa: boolean };
}

export interface ProfilePatch {
  employeeNo?: string | null;
  title?: string | null;
  department?: string | null;
  workEmail?: string | null;
  workPhone?: string | null;
  location?: string | null;
  managerId?: string | null;
  employmentType?: EmploymentType;
  startedOn?: string | null;
  status?: EmployeeStatus;
  isAdmin?: boolean;
}

export interface PeopleData {
  people: PersonView[];
  candidates: CandidateView[];
}

export const employeeApi = {
  // ---- session ----
  session: () => request<SessionState>('GET', '/session'),
  login: (email: string, password: string, code?: string) =>
    request<LoginResult>('POST', '/login', { email, password, ...(code ? { code } : {}) }),
  logout: () => request<{ ok: true }>('POST', '/logout'),

  // ---- two-factor ----
  beginEnroll: () => request<{ secret: string; otpauthUrl: string }>('POST', '/2fa/begin'),
  completeEnroll: (code: string) =>
    request<{ recoveryCodes: string[]; me: EmployeeMe }>('POST', '/2fa/complete', { code }),
  regenerateRecovery: (code: string) =>
    request<{ recoveryCodes: string[] }>('POST', '/2fa/recovery', { code }),

  // ---- content ----
  overview: () => request<OverviewData>('GET', '/overview'),
  directory: () => request<{ people: DirectoryEntry[] }>('GET', '/directory'),
  copy: () => request<{ copy: Record<string, string> }>('GET', '/copy'),
  // Wording writes. Founder-level only server-side, and confined to the `emp.`
  // namespace — the UI gate is a convenience, not the control.
  saveCopy: (key: string, value: string) =>
    request<{ ok: true; cleared: boolean }>('PUT', `/copy/${encodeURIComponent(key)}`, { value }),
  resetCopy: (key: string) =>
    request<{ ok: true }>('DELETE', `/copy/${encodeURIComponent(key)}`),

  // ---- tasks ----
  tasks: () => request<{ tasks: TaskView[] }>('GET', '/tasks'),
  addTask: (input: TaskInput) => request<{ tasks: TaskView[] }>('POST', '/tasks', input),
  setTaskDone: (id: string, done: boolean) =>
    request<{ tasks: TaskView[] }>('PATCH', `/tasks/${id}`, { done }),
  deleteTask: (id: string) => request<{ tasks: TaskView[] }>('DELETE', `/tasks/${id}`),
  assignTask: (input: TaskInput & { userId?: string; everyone?: boolean }) =>
    request<{ assigned: number; tasks: TaskView[] }>('POST', '/admin/tasks', input),

  announcements: () => request<{ announcements: AnnouncementView[] }>('GET', '/announcements'),
  createAnnouncement: (input: { title: string; body: string; pinned?: boolean }) =>
    request<{ announcement: AnnouncementView }>('POST', '/announcements', input),
  updateAnnouncement: (id: string, patch: { title?: string; body?: string; pinned?: boolean }) =>
    request<{ announcements: AnnouncementView[] }>('PATCH', `/announcements/${id}`, patch),
  deleteAnnouncement: (id: string) => request<{ ok: true }>('DELETE', `/announcements/${id}`),

  documents: () => request<{ documents: DocumentView[] }>('GET', '/documents'),
  createDocument: (input: {
    title: string;
    category: DocCategory;
    summary?: string | null;
    body?: string | null;
    linkUrl?: string | null;
  }) => request<{ document: DocumentView }>('POST', '/documents', input),
  updateDocument: (
    id: string,
    patch: {
      title?: string;
      category?: DocCategory;
      summary?: string | null;
      body?: string | null;
      linkUrl?: string | null;
    },
  ) => request<{ documents: DocumentView[] }>('PATCH', `/documents/${id}`, patch),
  deleteDocument: (id: string) => request<{ ok: true }>('DELETE', `/documents/${id}`),

  // ---- own security ----
  sessions: () => request<{ sessions: SessionView[] }>('GET', '/sessions'),
  revokeSession: (id: string) => request<{ ok: true }>('DELETE', `/sessions/${id}`),
  audit: (scope: 'mine' | 'all' = 'mine') =>
    request<{ scope: string; entries: AuditEntry[] }>('GET', `/audit?scope=${scope}`),

  // ---- people (portal admins) ----
  people: () => request<PeopleData>('GET', '/admin/people'),
  grantAccess: (userId: string, details: ProfilePatch) =>
    request<PeopleData>('POST', '/admin/people', { userId, ...details }),
  updatePerson: (userId: string, patch: ProfilePatch) =>
    request<PeopleData>('PATCH', `/admin/people/${userId}`, patch),
  resetTwoFactor: (userId: string) =>
    request<PeopleData>('POST', `/admin/people/${userId}/reset-2fa`),
  revokeAccess: (userId: string) => request<PeopleData>('DELETE', `/admin/people/${userId}`),
};
