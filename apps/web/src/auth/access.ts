import type { RoleKey } from '../api/types';
import type { WorkspaceKey } from '../theme/themes';

// Mirror of the backend role model (auth/rbac.ts). The backend is the real
// enforcer; this drives UI gating, the admin role pickers, and the "view as"
// preview.

export const ALL_ROLES: RoleKey[] = [
  'admin',
  'trading',
  'trading_viewer',
  'funded',
  'studies',
];

export const ROLE_LABELS: Record<RoleKey, string> = {
  admin: 'Admin',
  trading: 'Trading',
  trading_viewer: 'Trading (View only)',
  funded: 'Funded',
  studies: 'Studies',
};

// Short descriptions shown next to each role in the admin picker.
export const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
  admin: 'Manage users and see every workspace',
  trading: 'Trading workspace (full access)',
  trading_viewer: 'Trading workspace (read-only)',
  funded: 'Private — reveals the Funded (prop-challenge) section in Trading',
  studies: 'Studies workspace',
};

export function isAdmin(roles: RoleKey[]): boolean {
  return roles.includes('admin');
}

// The owner's trading team. The Series 65 study track is licensed content the
// owner keeps within this team only; every other team builds its own study
// games. Mirrors the backend DEFAULT_TEAM_ID (apps/api/src/teams/service.ts) and
// canUseSeries65 (apps/api/src/studies/access.ts) — the server is the enforcer,
// this just drives the UI (hiding the Series 65 hub card and nav sections).
export const SERIES65_TEAM_ID = 'team-vitalis';

export function canUseSeries65(
  user: { teamId: string | null; isDemo: boolean } | null | undefined,
): boolean {
  if (!user || user.isDemo) return false;
  return user.teamId === SERIES65_TEAM_ID;
}

const WORKSPACE_GRANTS: Record<WorkspaceKey, RoleKey[]> = {
  trading: ['trading', 'trading_viewer'],
  studies: ['studies'],
  // The Admin workspace is reserved for admins; no member role grants it. The
  // isAdmin short-circuit in canAccessWorkspace is what actually lets admins in.
  admin: [],
  // Site Help is open to everyone signed in (handled in canAccessWorkspace).
  help: [],
};

export function canAccessWorkspace(roles: RoleKey[], ws: WorkspaceKey): boolean {
  // Site Help is available to every signed-in user, whatever their roles.
  if (ws === 'help') return true;
  if (isAdmin(roles)) return true;
  return WORKSPACE_GRANTS[ws].some((r) => roles.includes(r));
}

// The private Funded (prop-challenge) section is revealed to holders of the
// admin-assigned `funded` role (admins included). Mirror of the backend
// canAccessFunded; the server is the enforcer, this just drives nav/screen
// gating and the "view as" preview.
export function canAccessFunded(roles: RoleKey[]): boolean {
  return isAdmin(roles) || roles.includes('funded');
}

// Trading is read-only when the user only has the viewer role (mirror of the
// backend auth/rbac.ts). Used to hide compose/edit controls for viewers; the
// server still enforces it on every write.
export function isWorkspaceReadOnly(roles: RoleKey[], ws: WorkspaceKey): boolean {
  if (ws !== 'trading') return false;
  if (isAdmin(roles) || roles.includes('trading')) return false;
  return roles.includes('trading_viewer');
}

// Ordered as the sidebar shows them. Site Help is available to everyone; the
// Admin workspace comes last and only for admins.
export function workspacesForRoles(roles: RoleKey[]): WorkspaceKey[] {
  const order: WorkspaceKey[] = ['trading', 'studies', 'help', 'admin'];
  return order.filter((ws) => canAccessWorkspace(roles, ws));
}

// A short human summary of a set of roles, for the user badge / footer.
export function rolesSummary(roles: RoleKey[]): string {
  if (isAdmin(roles)) return 'Administrator';
  if (roles.length === 0) return 'No roles';
  return roles.map((r) => ROLE_LABELS[r]).join(' · ');
}
