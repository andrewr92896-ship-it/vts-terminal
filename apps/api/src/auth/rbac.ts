import type { UserRow } from '../db/schema.js';

export type WorkspaceKey = 'trading' | 'kia' | 'todo' | 'studies' | 'wealth' | 'finance';

// Granular, admin-assigned roles. A user can hold any combination. `admin`
// grants everything (including user management); `trading_viewer` is read-only
// Trading access.
export const ROLE_KEYS = [
  'admin',
  'trading',
  'trading_viewer',
  'sales',
  'studies',
  'todo',
  'wealth',
  'finance',
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_LABELS: Record<RoleKey, string> = {
  admin: 'Admin',
  trading: 'Trading',
  trading_viewer: 'Trading (View only)',
  sales: 'Sales',
  studies: 'Studies',
  todo: 'To Do',
  wealth: 'Wealth Management',
  finance: 'Finance',
};

export function isRoleKey(v: unknown): v is RoleKey {
  return typeof v === 'string' && (ROLE_KEYS as readonly string[]).includes(v);
}

// Parse the stored JSON `roles` array into a clean, de-duplicated RoleKey list.
export function parseRoles(u: Pick<UserRow, 'roles'>): RoleKey[] {
  if (!u.roles) return [];
  try {
    const raw = JSON.parse(u.roles);
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.filter(isRoleKey))];
  } catch {
    return [];
  }
}

export function isAdmin(roles: RoleKey[]): boolean {
  return roles.includes('admin');
}

// Which role keys grant access to a given workspace (admin grants all).
const WORKSPACE_GRANTS: Record<WorkspaceKey, RoleKey[]> = {
  trading: ['trading', 'trading_viewer'],
  kia: ['sales'],
  todo: ['todo'],
  studies: ['studies'],
  wealth: ['wealth'],
  finance: ['finance'],
};

export function canAccessWorkspace(roles: RoleKey[], ws: WorkspaceKey): boolean {
  if (isAdmin(roles)) return true;
  return WORKSPACE_GRANTS[ws].some((r) => roles.includes(r));
}

// Trading is read-only when the user only has the viewer role (and is not an
// admin or full trader). No other workspace has a read-only variant.
export function isWorkspaceReadOnly(roles: RoleKey[], ws: WorkspaceKey): boolean {
  if (ws !== 'trading') return false;
  if (isAdmin(roles) || roles.includes('trading')) return false;
  return roles.includes('trading_viewer');
}

// Ordered as the top-bar switcher shows them.
export function workspacesForRoles(roles: RoleKey[]): WorkspaceKey[] {
  const order: WorkspaceKey[] = ['todo', 'kia', 'trading', 'wealth', 'finance', 'studies'];
  return order.filter((ws) => canAccessWorkspace(roles, ws));
}

function accessLabel(roles: RoleKey[]): string {
  if (isAdmin(roles)) return 'Administrator — full access';
  if (roles.length === 0) return 'No roles assigned yet';
  return roles.map((r) => ROLE_LABELS[r]).join(' · ');
}

// The shape of the user safe to send to the browser. No password hash,
// no internal timestamps the client does not need.
export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  roles: RoleKey[];
  viewBrokerage: boolean;
  mustChangePassword: boolean;
  access: {
    label: string;
    workspaces: WorkspaceKey[];
    readOnlyWorkspaces: WorkspaceKey[];
  };
}

export function toPublicUser(u: UserRow): PublicUser {
  const roles = parseRoles(u);
  const workspaces = workspacesForRoles(roles);
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    email: u.email,
    roles,
    viewBrokerage: u.viewBrokerage,
    mustChangePassword: u.mustChangePassword,
    access: {
      label: accessLabel(roles),
      workspaces,
      readOnlyWorkspaces: workspaces.filter((ws) => isWorkspaceReadOnly(roles, ws)),
    },
  };
}
