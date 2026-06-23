import type { RoleKey } from '../api/types';
import type { WorkspaceKey } from '../theme/themes';

// Mirror of the backend role model (auth/rbac.ts). The backend is the real
// enforcer; this drives UI gating, the admin role pickers, and the "view as"
// preview.

export const ALL_ROLES: RoleKey[] = [
  'admin',
  'trading',
  'trading_viewer',
  'sales',
  'studies',
  'todo',
  'wealth',
  'finance',
];

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

// Short descriptions shown next to each role in the admin picker.
export const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
  admin: 'Manage users and see every workspace',
  trading: 'Trading workspace (full access)',
  trading_viewer: 'Trading workspace (read-only)',
  sales: 'Kia Sales workspace',
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

// Ordered as the switcher shows them.
export function workspacesForRoles(roles: RoleKey[]): WorkspaceKey[] {
  const order: WorkspaceKey[] = ['todo', 'kia', 'trading', 'wealth', 'finance', 'studies'];
  return order.filter((ws) => canAccessWorkspace(roles, ws));
}

// A short human summary of a set of roles, for the user badge / footer.
export function rolesSummary(roles: RoleKey[]): string {
  if (isAdmin(roles)) return 'Administrator';
  if (roles.length === 0) return 'No roles';
  return roles.map((r) => ROLE_LABELS[r]).join(' · ');
}
