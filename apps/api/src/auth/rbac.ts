import type { UserRow } from '../db/schema.js';
import { DEMO_USERNAME } from '../demo/identity.js';

export type WorkspaceKey = 'trading' | 'studies';

// Granular, admin-assigned roles. A user can hold any combination. `admin`
// grants everything (including user management); `trading_viewer` is read-only
// Trading access.
export const ROLE_KEYS = [
  'admin',
  'trading',
  'trading_viewer',
  'funded',
  'studies',
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_LABELS: Record<RoleKey, string> = {
  admin: 'Admin',
  trading: 'Trading',
  trading_viewer: 'Trading (View only)',
  funded: 'Funded',
  studies: 'Studies',
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

// Parse the stored JSON `badges` array (admin-assigned recognition badge keys)
// into a clean, de-duplicated list of strings. Auto badges (e.g. the Admin
// shield derived from the admin role) are added by the client from the badge
// registry, not stored here.
export function parseBadges(u: { badges?: string | null }): string[] {
  if (!u.badges) return [];
  try {
    const raw = JSON.parse(u.badges);
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.filter((b): b is string => typeof b === 'string'))];
  } catch {
    return [];
  }
}

// Which role keys grant access to a given workspace (admin grants all).
const WORKSPACE_GRANTS: Record<WorkspaceKey, RoleKey[]> = {
  trading: ['trading', 'trading_viewer'],
  studies: ['studies'],
};

export function canAccessWorkspace(roles: RoleKey[], ws: WorkspaceKey): boolean {
  if (isAdmin(roles)) return true;
  return WORKSPACE_GRANTS[ws].some((r) => roles.includes(r));
}

// The private Funded section (the prop-firm challenge dashboard) is an add-on
// inside Trading, revealed only to holders of the admin-assigned `funded` role
// (admins included). It grants no workspace on its own — a funded user still
// needs Trading access to reach the section, and it is never shown to the demo.
export function canAccessFunded(roles: RoleKey[]): boolean {
  return isAdmin(roles) || roles.includes('funded');
}

// Trading is read-only when the user only has the viewer role (and is not an
// admin or full trader). No other workspace has a read-only variant.
export function isWorkspaceReadOnly(roles: RoleKey[], ws: WorkspaceKey): boolean {
  if (ws !== 'trading') return false;
  if (isAdmin(roles) || roles.includes('trading')) return false;
  return roles.includes('trading_viewer');
}

// Ordered as the sidebar shows them.
export function workspacesForRoles(roles: RoleKey[]): WorkspaceKey[] {
  const order: WorkspaceKey[] = ['trading', 'studies'];
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
  // The user's profile picture as a data URL, or null when unset.
  avatarUrl: string | null;
  roles: RoleKey[];
  // Admin-assigned recognition badge keys (see badge_types). The client unions
  // these with any auto badges (e.g. the Admin shield) from the badge registry
  // when rendering the icons next to the name.
  badges: string[];
  // The trading team the user belongs to (or null). Scopes the Studies
  // leaderboards; the name is resolved from trading_teams by the caller.
  teamId: string | null;
  teamName: string | null;
  viewBrokerage: boolean;
  mustChangePassword: boolean;
  isDemo: boolean; // the public, read-only demo account
  access: {
    label: string;
    workspaces: WorkspaceKey[];
    readOnlyWorkspaces: WorkspaceKey[];
    // Whether the private Funded (prop-challenge) section is revealed. Never true
    // for the demo account.
    funded: boolean;
  };
}

// `teamName` is resolved by the caller (routes) from the user's teamId, since
// this module stays free of database access.
export function toPublicUser(u: UserRow, teamName?: string | null): PublicUser {
  const roles = parseRoles(u);
  const workspaces = workspacesForRoles(roles);
  const isDemo = u.username === DEMO_USERNAME;
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    // The demo account stores its seed version in the email column; never expose it.
    email: u.username === DEMO_USERNAME ? null : u.email,
    avatarUrl: u.avatar ?? null,
    roles,
    badges: parseBadges(u),
    teamId: u.teamId ?? null,
    teamName: teamName ?? null,
    viewBrokerage: u.viewBrokerage,
    mustChangePassword: u.mustChangePassword,
    isDemo,
    access: {
      label: accessLabel(roles),
      workspaces,
      // The public demo is a look-only presentation: every workspace it can
      // reach is read-only, so the UI hides all add/edit/delete controls (the
      // demoGuard already refuses the writes server-side regardless).
      readOnlyWorkspaces: isDemo ? workspaces : workspaces.filter((ws) => isWorkspaceReadOnly(roles, ws)),
      funded: !isDemo && canAccessFunded(roles),
    },
  };
}
