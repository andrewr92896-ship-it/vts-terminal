import type { Role, UserRow } from '../db/schema.js';

export type WorkspaceKey = 'trading' | 'kia' | 'todo' | 'studies';
export type ListScope = 'all' | 'trading' | 'kia' | 'none';

interface AccessRule {
  ws: { trading: boolean; kia: boolean; todo: boolean };
  lists: ListScope;
  readOnly: boolean;
  label: string;
}

// Mirrors the prototype's ACCESS matrix exactly. Studies is available to
// every role, so it is not listed here (handled in workspacesFor).
export const ACCESS: Record<Role, AccessRule> = {
  Admin: {
    ws: { trading: true, kia: true, todo: true },
    lists: 'all',
    readOnly: false,
    label: 'Full access — every workspace and all to-do lists',
  },
  Trader: {
    ws: { trading: true, kia: false, todo: true },
    lists: 'trading',
    readOnly: false,
    label: 'Trading workspace + Trading and personal to-do lists',
  },
  Sales: {
    ws: { trading: false, kia: true, todo: true },
    lists: 'kia',
    readOnly: false,
    label: 'Kia workspace + Kia and personal to-do lists',
  },
  Viewer: {
    ws: { trading: true, kia: false, todo: false },
    lists: 'none',
    readOnly: true,
    label: 'Read-only Trading; no personal to-do lists',
  },
};

// Ordered as the top-bar switcher shows them: To Do, Kia, Trading, Studies.
export function workspacesFor(role: Role): WorkspaceKey[] {
  const a = ACCESS[role] ?? ACCESS.Viewer;
  const out: WorkspaceKey[] = [];
  if (a.ws.todo) out.push('todo');
  if (a.ws.kia) out.push('kia');
  if (a.ws.trading) out.push('trading');
  out.push('studies'); // always available
  return out;
}

export function canAccessWorkspace(role: Role, ws: WorkspaceKey): boolean {
  if (ws === 'studies') return true;
  return !!ACCESS[role]?.ws[ws];
}

// The shape of the user safe to send to the browser. No password hash,
// no internal timestamps the client does not need.
export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  role: Role;
  readOnly: boolean;
  viewBrokerage: boolean;
  mustChangePassword: boolean;
  access: {
    label: string;
    lists: ListScope;
    workspaces: WorkspaceKey[];
  };
}

export function toPublicUser(u: UserRow): PublicUser {
  const a = ACCESS[u.role] ?? ACCESS.Viewer;
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    email: u.email,
    role: u.role,
    readOnly: a.readOnly,
    viewBrokerage: u.viewBrokerage,
    mustChangePassword: u.mustChangePassword,
    access: {
      label: a.label,
      lists: a.lists,
      workspaces: workspacesFor(u.role),
    },
  };
}
