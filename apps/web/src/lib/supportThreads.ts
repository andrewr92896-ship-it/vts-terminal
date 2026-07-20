import type { SupportKind } from '../api/types';

// Local persistence for the corner-bubble Support tab.
//
// The Support intake is stateless on the server (it only persists once an intake
// is complete and filed to the admins). That meant closing the chat bubble threw
// away an in-progress conversation and anything typed but not sent. To fix that,
// every Support conversation is kept here as a "thread" in localStorage, scoped
// to the signed-in user, so the user can:
//   • reopen an in-progress request and keep talking where they left off,
//   • see a list of their previous requests at the top of the Support tab, and
//   • have whatever they typed but didn't send restored (the per-thread draft).
//
// This is a client-side convenience layer only — the admin-facing filing flow is
// unchanged. Demo accounts never persist anything (they're read-only).

export interface SupportMsg {
  role: 'user' | 'ai';
  body: string;
}

export interface SupportThread {
  id: string;
  kind: SupportKind;
  messages: SupportMsg[];
  /** Text typed into the composer but not yet sent — restored on reopen. */
  draft: string;
  /** True once the intake was filed to the admins. */
  submitted: boolean;
  createdAt: number;
  updatedAt: number;
}

// Keep a bounded history so storage never grows without limit.
const MAX_THREADS = 25;

function threadsKey(userId: string): string {
  return `vts-support-threads:${userId}`;
}

function activeKey(userId: string): string {
  return `vts-support-active:${userId}`;
}

export function newThreadId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through to the timestamp id */
  }
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isThread(v: unknown): v is SupportThread {
  if (!v || typeof v !== 'object') return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.id === 'string' &&
    (t.kind === 'bug' || t.kind === 'suggestion' || t.kind === 'support') &&
    Array.isArray(t.messages)
  );
}

export function loadThreads(userId: string): SupportThread[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(threadsKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isThread)
      .map((t) => ({
        id: t.id,
        kind: t.kind,
        messages: t.messages.filter(
          (m): m is SupportMsg =>
            !!m && (m.role === 'user' || m.role === 'ai') && typeof m.body === 'string',
        ),
        draft: typeof t.draft === 'string' ? t.draft : '',
        submitted: t.submitted === true,
        createdAt: typeof t.createdAt === 'number' ? t.createdAt : Date.now(),
        updatedAt: typeof t.updatedAt === 'number' ? t.updatedAt : Date.now(),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveThreads(userId: string, threads: SupportThread[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const trimmed = [...threads].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_THREADS);
    localStorage.setItem(threadsKey(userId), JSON.stringify(trimmed));
  } catch {
    /* storage may be full or blocked — the in-memory copy still works this session */
  }
}

export function loadActiveId(userId: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(activeKey(userId));
  } catch {
    return null;
  }
}

export function saveActiveId(userId: string, id: string | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (id) localStorage.setItem(activeKey(userId), id);
    else localStorage.removeItem(activeKey(userId));
  } catch {
    /* storage may be blocked */
  }
}

// A short label for a thread in the history list — the reporter's first line, or
// a fallback based on the category when they haven't typed anything yet.
export function threadTitle(t: SupportThread, fallback: string): string {
  const firstUser = t.messages.find((m) => m.role === 'user')?.body?.trim();
  const source = firstUser || t.draft.trim();
  const line = source.split('\n')[0]?.trim();
  return line ? (line.length > 60 ? `${line.slice(0, 60)}…` : line) : fallback;
}
