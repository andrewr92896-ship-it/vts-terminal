import type { UserRow } from '../db/schema.js';
import { DEMO_USERNAME } from '../demo/identity.js';

export type WorkspaceKey = 'trading' | 'studies';

// The portal owner's account, identified by the immutable created username
// (matches the first-boot seed, ADMIN_USERNAME). Only the owner may grant the
// founder / software_developer roles.
const OWNER_USERNAME = (process.env.ADMIN_USERNAME || 'andrew').trim().toLowerCase();

export function isOwnerUser(u: Pick<UserRow, 'username' | 'createdUsername'>): boolean {
  return (u.createdUsername ?? u.username).trim().toLowerCase() === OWNER_USERNAME;
}

// Granular, assigned roles. A user can hold any combination. The model is a
// ladder of trust:
//   • founder            — sits above admin; the portal's owners. Founder-level
//                          also carries every admin capability plus the
//                          founder-only tools (Founder Portal: AI Instructions,
//                          Site Wording, View as role, the site-wording editor).
//   • software_developer — permission-equivalent to founder (same access).
//   • admin              — user/team management and the Admin Portal.
//   • funded             — reveals the private Funded (prop-challenge) section in
//                          Trading. Only a founder-level user can grant it.
//   • member             — the baseline. Every signed-in user is at least a
//                          member and sees every non-admin workspace (Trading,
//                          Studies, My Portal, Site Help).
export const ROLE_KEYS = [
  'founder',
  'software_developer',
  'admin',
  'funded',
  'member',
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_LABELS: Record<RoleKey, string> = {
  founder: 'Founder',
  software_developer: 'Software Developer',
  admin: 'Admin',
  funded: 'Funded',
  member: 'Member',
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

// Founder-level access: the founder role itself or the permission-equivalent
// software_developer role. Founder-level is the gate for the Founder Portal and
// every founder-only tool.
export function isFounder(roles: RoleKey[]): boolean {
  return roles.includes('founder') || roles.includes('software_developer');
}

// Admin capability. Founder-level users are a superset of admins, so they pass
// every admin guard as well.
export function isAdmin(roles: RoleKey[]): boolean {
  return roles.includes('admin') || isFounder(roles);
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

// Workspace access under the Member = full-access model: every signed-in user
// (member and up) can reach Trading and Studies. The Admin Portal and Founder
// Portal are gated separately (isAdmin / isFounder), not through this function.
export function canAccessWorkspace(_roles: RoleKey[], _ws: WorkspaceKey): boolean {
  return true;
}

// The private Funded section (the prop-firm challenge dashboard) is an add-on
// inside Trading, revealed only to holders of the `funded` role (admins and
// founder-level users included). It grants no workspace on its own and is never
// shown to the demo.
export function canAccessFunded(roles: RoleKey[]): boolean {
  return isAdmin(roles) || roles.includes('funded');
}

// No workspace has a read-only role variant anymore (the old trading_viewer
// role is retired). Kept as a stable export so write guards still compile; the
// demo's read-only presentation is handled by the demo guard, not here.
export function isWorkspaceReadOnly(_roles: RoleKey[], _ws: WorkspaceKey): boolean {
  return false;
}

// Ordered as the sidebar shows them. Every member reaches both workspaces.
export function workspacesForRoles(_roles: RoleKey[]): WorkspaceKey[] {
  return ['trading', 'studies'];
}

function accessLabel(roles: RoleKey[]): string {
  if (isFounder(roles)) return 'Founder — full access';
  if (roles.includes('admin')) return 'Administrator — full access';
  return 'Member';
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
    // Whether the user carries admin capability (admin or founder-level).
    admin: boolean;
    // Whether the user is founder-level (founder or software_developer).
    founder: boolean;
    // Whether this is the portal owner account (the only account that can grant
    // the Founder / Software Developer roles).
    owner: boolean;
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
      admin: !isDemo && isAdmin(roles),
      founder: !isDemo && isFounder(roles),
      owner: !isDemo && isOwnerUser(u),
    },
  };
}
