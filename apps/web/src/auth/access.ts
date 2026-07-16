import type { RoleKey } from '../api/types';
import type { WorkspaceKey } from '../theme/themes';

// Mirror of the backend role model (auth/rbac.ts). The backend is the real
// enforcer; this drives UI gating, the admin role pickers, and the "view as"
// preview.

export const ALL_ROLES: RoleKey[] = [
  'admin',
  'trading',
  'trading_viewer',
  'studies',
  'todo',
  'wealth',
  'finance',
];

export const ROLE_LABELS: Record<RoleKey, string> = {
  admin: 'Admin',
  trading: 'Trading',
  trading_viewer: 'Trading (View only)',
  studies: 'Studies',
  todo: 'To Do',
  wealth: 'Wealth Management',
  finance: 'Finance',
};

// Short descriptions shown next to each role in the admin picker.
export const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
  admin: 'Manage users and see every workspace',
  trading: 'Trading workspace (full access)',
  trading_viewer: 'Trading workspace (read-only)',
  studies: 'Studies workspace',
  todo: 'Personal To Do List workspace',
  wealth: 'Vitalis Retirement & Wealth Management workspace',
  finance: 'Personal Finance workspace',
};

export function isAdmin(roles: RoleKey[]): boolean {
  return roles.includes('admin');
}

const WORKSPACE_GRANTS: Record<WorkspaceKey, RoleKey[]> = {
  trading: ['trading', 'trading_viewer'],
  todo: ['todo'],
  studies: ['studies'],
  // The Vitalis Trading Systems LLC business workspace is owner-only for now:
  // no dedicated role grants it, so only admins see it (isAdmin short-circuits).
  llc: [],
  wealth: ['wealth'],
  finance: ['finance'],
};

export function canAccessWorkspace(roles: RoleKey[], ws: WorkspaceKey): boolean {
  if (isAdmin(roles)) return true;
  return WORKSPACE_GRANTS[ws].some((r) => roles.includes(r));
}

// Trading is read-only when the user only has the viewer role (mirror of the
// backend auth/rbac.ts). Used to hide compose/edit controls for viewers; the
// server still enforces it on every write.
export function isWorkspaceReadOnly(roles: RoleKey[], ws: WorkspaceKey): boolean {
  if (ws !== 'trading') return false;
  if (isAdmin(roles) || roles.includes('trading')) return false;
  return roles.includes('trading_viewer');
}

// Ordered as the sidebar shows them. Wealth Management and Finance are removed
// from the Meridian nav; the LLC business workspace is added (admin-only).
export function workspacesForRoles(roles: RoleKey[]): WorkspaceKey[] {
  const order: WorkspaceKey[] = ['trading', 'studies', 'todo', 'llc'];
  return order.filter((ws) => canAccessWorkspace(roles, ws));
}

// A short human summary of a set of roles, for the user badge / footer.
export function rolesSummary(roles: RoleKey[]): string {
  if (isAdmin(roles)) return 'Administrator';
  if (roles.length === 0) return 'No roles';
  return roles.map((r) => ROLE_LABELS[r]).join(' · ');
}
