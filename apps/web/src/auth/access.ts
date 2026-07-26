import type { RoleKey } from '../api/types';
import type { WorkspaceKey } from '../theme/themes';

// Mirror of the backend role model (auth/rbac.ts). The backend is the real
// enforcer; this drives UI gating, the admin role pickers, and the "view as"
// preview.

export const ALL_ROLES: RoleKey[] = [
  'founder',
  'software_developer',
  'admin',
  'funded',
  'employee',
  'member',
];

export const ROLE_LABELS: Record<RoleKey, string> = {
  founder: 'Founder',
  software_developer: 'Software Developer',
  admin: 'Admin',
  funded: 'Funded',
  employee: 'Employee',
  member: 'Member',
};

// Short descriptions shown next to each role in the admin picker.
export const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
  founder: 'Full access, incl. the Developer Portal. Granted only by the owner.',
  software_developer: 'Founder-equivalent access. Granted only by the owner.',
  admin: 'Manage users and teams (Admin Portal). Granted by a founder.',
  funded: 'Private — reveals the Funded (prop-challenge) section in Trading.',
  employee:
    'Reveals the Employee Portal section in My Portal. Also requires a company email address, and its own sign-in plus a second factor at /employee.',
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

export function canAccessWorkspace(roles: RoleKey[], ws: WorkspaceKey): boolean {
  // The Founder Portal is founder-level only.
  if (ws === 'founder') return isFounder(roles);
  // The Admin Portal is for admins (founder-level included).
  if (ws === 'admin') return isAdmin(roles);
  // Every other workspace (Trading, Studies, My Portal, Site Help) is open to
  // every signed-in user under the Member = full-access model.
  return true;
}

// The private Funded (prop-challenge) section is revealed to holders of the
// `funded` role (admins and founder-level included). Mirror of the backend
// canAccessFunded; the server is the enforcer, this just drives nav/screen
// gating and the "view as" preview.
export function canAccessFunded(roles: RoleKey[]): boolean {
  return isAdmin(roles) || roles.includes('funded');
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

// Whether to show the My Portal ▸ Employee Portal section. Two conditions, both
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

// Ordered as the sidebar shows them. Every member reaches Advanced Trading,
// Investments, Studies, My Portal and Site Help; the Admin and Founder portals
// come last for those roles. (Actual sidebar order is driven by the NAV array;
// this list only gates which workspaces a user may see.)
export function workspacesForRoles(roles: RoleKey[]): WorkspaceKey[] {
  const order: WorkspaceKey[] = [
    'trading',
    'investments',
    'studies',
    'myportal',
    'help',
    'admin',
    'founder',
  ];
  return order.filter((ws) => canAccessWorkspace(roles, ws));
}

// Which roles a given actor may grant/revoke (mirror of the backend's
// assertCanAssignRoles). The owner grants everything; a founder grants
// admin/funded/member; a plain admin grants only member. Drives which role
// options the admin Users picker shows to the acting user.
export function canGrantRole(
  actor: { owner: boolean; founder: boolean },
  role: RoleKey,
): boolean {
  if (role === 'founder' || role === 'software_developer') return actor.owner;
  if (role === 'admin' || role === 'funded' || role === 'employee') return actor.founder;
  return true; // member
}

// A short human summary of a set of roles, for the user badge / footer.
export function rolesSummary(roles: RoleKey[]): string {
  if (isFounder(roles)) return 'Founder';
  if (roles.includes('admin')) return 'Administrator';
  return 'Member';
}
