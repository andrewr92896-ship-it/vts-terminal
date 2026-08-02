import type {
  Membership,
  MembershipTier,
  MembershipView,
  PremiumFeature,
  RoleKey,
  User,
  UserFeatures,
} from '../api/types';
import type { WorkspaceKey } from '../theme/themes';

// Mirror of the backend role model (auth/rbac.ts). The backend is the real
// enforcer; this drives UI gating, the admin role pickers, and the "view as"
// preview.

export const ALL_ROLES: RoleKey[] = [
  'founder',
  'software_developer',
  'admin',
  'employee',
  'member',
];

export const ROLE_LABELS: Record<RoleKey, string> = {
  founder: 'Founder',
  software_developer: 'Software Developer',
  admin: 'Admin',
  employee: 'Employee',
  member: 'Member',
};

// Short descriptions shown next to each role in the admin picker.
export const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
  founder: 'Full access, incl. the Developer Terminal. Granted only by the owner.',
  software_developer: 'Founder-equivalent access. Granted only by the owner.',
  admin: 'Manage users and teams (Admin Terminal). Granted by a founder.',
  employee:
    'Reveals the Employee Portal section in My Terminal. Also requires a company email address, and its own sign-in plus a second factor at /employee.',
  member: 'Baseline access to every standard workspace.',
};

// Founder-level: founder or the permission-equivalent software_developer role.
export function isFounder(roles: RoleKey[]): boolean {
  return roles.includes('founder') || roles.includes('software_developer');
}

// Admin capability. Founder-level users are a superset of admins.
export function isAdmin(roles: RoleKey[]): boolean {
  return roles.includes('admin') || isFounder(roles);
}

// Whether a workspace is reachable, given the user's roles AND the features they
// have turned on. Two separate axes: a role says what you are allowed to do, a
// feature says what you have asked to see.
//
// `features` is REQUIRED rather than optional, and deliberately so. It used to be
// optional, and every caller that forgot it got a silent `false` for Advanced
// Trading — which is how the whole Notifications & connections panel (phone
// alerts, Pushover, the positions widget, broker connections) and the trade alert
// sound went invisible for every account at once, with nothing failing loudly.
// Keep it required so the compiler catches the next one.
export function canAccessWorkspace(
  roles: RoleKey[],
  ws: WorkspaceKey,
  features: UserFeatures,
): boolean {
  // The Founder Terminal is founder-level only.
  if (ws === 'founder') return isFounder(roles);
  // The Admin Terminal is for admins (founder-level included).
  if (ws === 'admin') return isAdmin(roles);
  // Advanced Trading is opt-in — the one workspace a signed-in user does not get
  // by default, because it places real orders. Everything else (Markets,
  // Investments, Studies, My Terminal, Site Help) is included with every account.
  if (ws === 'trading') return !!features.advancedTrading;
  return true;
}

// Whether the Funded (prop-challenge) section is revealed: the nested opt-in,
// which the service will not store enabled unless Advanced Trading is on too.
// The server is the enforcer; this drives nav/screen gating.
export function canAccessFunded(features: UserFeatures): boolean {
  return !!features.funded;
}

// The company email domain that gates the Employee Portal. Mirrors the backend's
// EMPLOYEE_EMAIL_DOMAIN default — the server is the enforcer and reads the real
// (env-configurable) value, so a mismatch here only affects whether the nav
// section is drawn, never whether /employee lets someone in.
export const COMPANY_EMAIL_DOMAIN = 'vitalistradingsystems.com';

export function isCompanyEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith(`@${COMPANY_EMAIL_DOMAIN}`);
}

// Whether to show the My Terminal ▸ Employee Portal section. Two conditions, both
// required: the `employee` role — NOT implied by admin or founder level, since
// the employee surface is a separate, explicitly-granted zone — and a sign-in
// email on the company domain. Mirror of the backend's canAccessEmployeePortal;
// revealing the section grants nothing on its own, since /employee has its own
// sign-in and re-checks both conditions there.
export function canAccessEmployeePortal(
  roles: RoleKey[],
  email: string | null | undefined,
): boolean {
  return roles.includes('employee') && isCompanyEmail(email);
}

// No workspace has a read-only role variant anymore (the old trading_viewer role
// is retired). Kept as a stable export; the demo's read-only presentation is
// driven by user.isDemo elsewhere, not by roles.
export function isWorkspaceReadOnly(_roles: RoleKey[], _ws: WorkspaceKey): boolean {
  return false;
}

// The workspaces this user may open, given their roles and their feature
// opt-ins. Advanced Trading is absent until they turn it on.
export function workspacesForRoles(roles: RoleKey[], features: UserFeatures): WorkspaceKey[] {
  return ALL_WORKSPACES.filter((ws) => canAccessWorkspace(roles, ws, features));
}

// Every workspace in the order the sidebar gates them. (Actual display order is
// driven by the NAV array; this list only decides which a user may see.)
export const ALL_WORKSPACES: WorkspaceKey[] = [
  'markets',
  'trading',
  'investments',
  'studies',
  'myportal',
  'help',
  'admin',
  'founder',
];

// Which roles a given actor may grant/revoke (mirror of the backend's
// assertCanAssignRoles). The owner grants everything; a founder grants
// admin/employee/member; a plain admin grants only member. Drives which role
// options the admin Users picker shows to the acting user.
export function canGrantRole(
  actor: { owner: boolean; founder: boolean },
  role: RoleKey,
): boolean {
  if (role === 'founder' || role === 'software_developer') return actor.owner;
  if (role === 'admin' || role === 'employee') return actor.founder;
  return true; // member
}

// A short human summary of a set of roles, for the user badge / footer.
export function rolesSummary(roles: RoleKey[]): string {
  if (isFounder(roles)) return 'Founder';
  if (roles.includes('admin')) return 'Administrator';
  return 'Member';
}

// ---- Memberships (the paid tiers) ----
//
// Mirror of apps/api/src/memberships/tiers.ts. Everything here only decides what
// the UI DRAWS — a lock, an upgrade prompt, a dimmed row. The server re-checks
// every paid endpoint and answers 402, so a client that skipped these calls
// entirely would still be refused.

export const TIER_LABELS: Record<MembershipTier, string> = {
  free: 'Free',
  premium: 'Premium',
  max: 'Max',
};

// What the upgrade prompt calls each paid feature. Plain statements of what the
// feature is, never instructions for using it.
export const FEATURE_LABELS: Record<PremiumFeature, string> = {
  ai: 'VTS AI',
  brokerConnections: 'Broker connections',
  funded: 'Funded Account tracking',
  studyCreation: 'Study creation',
  customBoards: 'Custom Live Wall boards',
  teams: 'Trading teams',
  premiumBadges: 'Badges',
  strategySessions: 'Strategy Sessions',
};

// The colour a tier is drawn in across the terminal — the sidebar rows, the
// membership card, the badges.
//
// Free is null rather than a colour: an unpaid section takes the workspace's own
// accent like everything else, so the colours mark what COSTS something instead
// of painting the whole sidebar.
export const TIER_COLORS: Record<MembershipTier, string | null> = {
  free: null,
  // Gold — the same yellow as the Premium star badge.
  premium: '#EBCB74',
  // Diamond blue, matching the Max diamond badge. Deliberately icier than the
  // Markets workspace accent (#5AC8FA) so a Max section is not mistaken for a
  // Markets one.
  max: '#B9F2FF',
};

// Which paid feature gates each sidebar SECTION, by screen key.
//
// Only sections that are wholly gated appear here. Three paid features are
// absent on purpose because no section maps to them: `ai` is the top-bar button,
// `brokerConnections` lives inside My Terminal ▸ Settings, and `premiumBadges` is
// a per-member setting. `customBoards` is absent too, and that one is the
// interesting case — the Live Wall itself is free (a free account gets the preset
// boards, a working screen), and only SAVING your own arrangement is paid. So
// colouring the whole section would overstate the paywall.
export const SECTION_FEATURE: Record<string, PremiumFeature> = {
  sessions: 'strategySessions',
  prop: 'funded',
  st_decks: 'studyCreation',
  my_team: 'teams',
};

// The same, for a whole WORKSPACE. Empty today — no workspace is entirely paid,
// and marking one that is not would be a false claim about every free section
// inside it (Advanced Trading holds the Trade Desk, Trade Analysis, alerts and
// the manual book, none of which cost anything beyond the opt-in). It is the
// seam for when one is: add a key here and its row colours automatically.
export const WORKSPACE_FEATURE: Record<string, PremiumFeature> = {};

// The colour a sidebar row should take, or null for the default treatment.
// Reads the tier off the membership payload the SERVER computed, so moving a
// feature between tiers recolours the sidebar with nothing here to update.
export function tierColorFor(
  key: string,
  map: Record<string, PremiumFeature>,
  membership: MembershipView | undefined,
): string | null {
  const feature = map[key];
  if (!feature || !membership) return null;
  return TIER_COLORS[membership.featureTiers[feature]] ?? null;
}

// Whether this user reaches a paid feature. Reads the entitlement map the server
// computed rather than comparing tiers here, so moving a feature between tiers
// is a server-side change alone and this file never goes stale.
export function hasEntitlement(user: User | null, feature: PremiumFeature): boolean {
  return !!user?.access.membership.entitlements[feature];
}

// Whether the membership is a real paid grant rather than something the account
// gets for being staff. Used where the screen should say "you hold Max because
// you are an administrator" instead of showing a renewal date that does not
// exist.
export function isStaffMembership(membership: Membership): boolean {
  return membership.source === 'role' || membership.source === 'demo';
}
