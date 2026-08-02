import type { UserRow } from '../db/schema.js';
import { config } from '../config.js';
import { DEMO_USERNAME } from '../demo/identity.js';
import { LEGAL_VERSION } from '../legal/version.js';
import { DEFAULT_FEATURES, type UserFeatures } from '../features/service.js';
// tiers.ts, not memberships/service.ts — the service asks this module who is an
// admin, so importing it back here would be a cycle. tiers.ts is pure data.
import { FREE_MEMBERSHIP_VIEW, type MembershipView } from '../memberships/tiers.js';
import { membershipBadgeKey } from '../badges/service.js';

// The company email domain that gates the Employee Portal (EMPLOYEE_EMAIL_DOMAIN).
export const COMPANY_EMAIL_DOMAIN = config.EMPLOYEE_EMAIL_DOMAIN;

export type WorkspaceKey = 'trading' | 'studies';

// The optional features a user turns on for themselves. Which parts of the
// terminal are optional at all lives in features/service.ts; roles and features
// are separate axes — a role says what you are allowed to do, a feature says
// what you have asked to see.

// The terminal owner's account, identified by the immutable created username
// (matches the first-boot seed, ADMIN_USERNAME). Only the owner may grant the
// founder / software_developer roles.
const OWNER_USERNAME = (process.env.ADMIN_USERNAME || 'andrew').trim().toLowerCase();

export function isOwnerUser(u: Pick<UserRow, 'username' | 'createdUsername'>): boolean {
  return (u.createdUsername ?? u.username).trim().toLowerCase() === OWNER_USERNAME;
}

// Granular, assigned roles. A user can hold any combination. The model is a
// ladder of trust:
//   • founder            — sits above admin; the terminal's owners. Founder-level
//                          also carries every admin capability plus the
//                          founder-only tools (Founder Terminal: AI Instructions,
//                          Site Wording, View as role, the site-wording editor).
//   • software_developer — permission-equivalent to founder (same access).
//   • admin              — user/team management and the Admin Terminal.
//   • employee           — grants access to the separate, hardened Employee
//                          Portal at /employee. It unlocks nothing inside the
//                          main terminal; it only makes the employee sign-in at
//                          that URL possible (a second, independent
//                          authentication). Only a founder-level user can grant
//                          it, and the demo can never hold it.
//   • member             — the baseline. Every signed-in user is at least a
//                          member and sees every non-admin workspace (Trading,
//                          Studies, My Terminal, Site Help).
//
// Retired: `funded`. The Funded (prop-challenge) tracker used to be revealed by
// an admin-granted role; it is now a per-user opt-in under Advanced Trading (see
// features/service.ts), so the role is gone and the opt-in is the only gate.
// Migration 0083 carried every role-holder over to the feature.
export const ROLE_KEYS = [
  'founder',
  'software_developer',
  'admin',
  'employee',
  'member',
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_LABELS: Record<RoleKey, string> = {
  founder: 'Founder',
  software_developer: 'Software Developer',
  admin: 'Admin',
  employee: 'Employee',
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
// software_developer role. Founder-level is the gate for the Founder Terminal and
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

// Workspace access by ROLE. No role stands between a member and Trading or
// Studies — what gates Trading now is the per-user opt-in (Premium Features),
// checked by requireWorkspace in the middleware, not a role. The Admin Terminal
// and Founder Terminal are gated separately (isAdmin / isFounder).
export function canAccessWorkspace(_roles: RoleKey[], _ws: WorkspaceKey): boolean {
  return true;
}

// Whether a sign-in email is on the company domain. Note that `seed.ts`
// backfills every account without an email to <username>@<company domain>, so
// this test on its own is close to "every account" — it is a NARROWING
// condition, never a grant. It is paired with the explicit `employee` role
// below, and both must hold.
export function isCompanyEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith(`@${COMPANY_EMAIL_DOMAIN}`);
}

// Whether the account may sign in to the Employee Portal at /employee. Two
// independent conditions, both required:
//
//   1. the `employee` role, granted per person by a founder — NOT implied by
//      admin or founder level, because the employee surface is a separate,
//      explicitly-granted zone; and
//   2. a sign-in email on the company domain, so an outside collaborator on a
//      personal address can never enter it whatever roles they hold.
//
// Holding both grants nothing inside the main terminal — it only reveals the
// launch section in My Terminal and lets the separate sign-in at /employee
// succeed (which additionally requires an active employee profile and a second
// factor). Never true for the demo.
export function canAccessEmployeePortal(
  roles: RoleKey[],
  email: string | null | undefined,
): boolean {
  return roles.includes('employee') && isCompanyEmail(email);
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
  // The user has not yet accepted the currently-effective Terms of Service and
  // Privacy Policy (their stored version differs from LEGAL_VERSION). When true,
  // the client gates them into the acceptance screen before the terminal loads.
  // Never true for the read-only demo (it operates on nothing to consent to).
  mustAcceptTerms: boolean;
  isDemo: boolean; // the public, read-only demo account
  access: {
    label: string;
    workspaces: WorkspaceKey[];
    readOnlyWorkspaces: WorkspaceKey[];
    // The optional features this user has turned on for themselves (My Terminal ▸
    // Feature Access). Drives which workspaces the sidebar draws; the server is
    // still the enforcer on every endpoint.
    features: UserFeatures;
    // Whether the Funded (prop-challenge) section is revealed — the Funded
    // opt-in, which is nested under Advanced Trading. Never true for the demo.
    funded: boolean;
    // Whether the separate Employee Portal (/employee) launch link is revealed.
    // Only says the link is shown — reaching the terminal still requires a fresh,
    // independent sign-in there. Never true for the demo.
    employee: boolean;
    // Whether the user carries admin capability (admin or founder-level).
    admin: boolean;
    // Whether the user is founder-level (founder or software_developer).
    founder: boolean;
    // Whether this is the terminal owner account (the only account that can grant
    // the Founder / Software Developer roles).
    owner: boolean;
    // The paid tier this account holds and which paid features it reaches.
    // Separate from `features` above: features are what the user has ASKED to
    // see, this is what they are ALLOWED to see. The server enforces it on every
    // endpoint; this copy only drives locks and upgrade prompts in the UI.
    membership: MembershipView;
  };
}

// A tier's badge is earned, not assigned: it is appended on read rather than
// stored in users.badges, so it appears and disappears with the membership and
// there is no row to go stale when one lapses.
function withMembershipBadge(assigned: string[], tier: string): string[] {
  const key = membershipBadgeKey(tier);
  if (!key || assigned.includes(key)) return assigned;
  return [...assigned, key];
}

// `teamName`, `features` and `membership` are resolved by the caller (routes),
// since this module stays free of database access.
export function toPublicUser(
  u: UserRow,
  teamName?: string | null,
  features: UserFeatures = DEFAULT_FEATURES,
  membership: MembershipView = FREE_MEMBERSHIP_VIEW,
): PublicUser {
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
    // The stored badges plus the one their tier earns them. Added here rather
    // than left to the client so every surface that renders a name gets it from
    // one place — and so it can never be out of step with the tier, since both
    // come off the same payload.
    badges: withMembershipBadge(parseBadges(u), membership.tier),
    teamId: u.teamId ?? null,
    teamName: teamName ?? null,
    viewBrokerage: u.viewBrokerage,
    mustChangePassword: u.mustChangePassword,
    // The demo has nothing to consent to (it can't operate on anything and the
    // demo guard blocks the accept write anyway), so it is never gated.
    mustAcceptTerms: !isDemo && u.termsAcceptedVersion !== LEGAL_VERSION,
    isDemo,
    access: {
      label: accessLabel(roles),
      workspaces,
      // The public demo is a look-only presentation: every workspace it can
      // reach is read-only, so the UI hides all add/edit/delete controls (the
      // demoGuard already refuses the writes server-side regardless).
      readOnlyWorkspaces: isDemo ? workspaces : workspaces.filter((ws) => isWorkspaceReadOnly(roles, ws)),
      features,
      funded: !isDemo && features.funded,
      employee: !isDemo && canAccessEmployeePortal(roles, u.email),
      admin: !isDemo && isAdmin(roles),
      founder: !isDemo && isFounder(roles),
      owner: !isDemo && isOwnerUser(u),
      membership,
    },
  };
}
