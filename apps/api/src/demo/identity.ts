// Identity of the public, read-only demo account. Kept in its own tiny module
// (no heavy imports) so the seeder, auth routes, and rbac can all share it
// without pulling in the demo guard's dependencies.

export const DEMO_USERNAME = 'demo';
export const DEMO_DISPLAY_NAME = 'Demo User';

// Bump this whenever the demo's seeded data changes. On boot, seedDemo() wipes
// and re-seeds the demo account when the stored version differs, so tweaks to
// the simulated data take effect on the next deploy without a manual reset.
export const DEMO_SEED_VERSION = 5;

// The demo account has its own team so its sample study game (and any leaderboard
// activity) stays isolated from the real owner's team — otherwise the default
// team-seeding would adopt the team-less demo into the owner's Vitalis team.
export const DEMO_TEAM_ID = 'team-demo';
export const DEMO_TEAM_NAME = 'Demo Team';

// The roles the demo account holds: every workspace except admin (so a reviewer
// sees the whole product but never the real user-management screen).
export const DEMO_ROLES = ['trading', 'sales', 'studies', 'todo', 'wealth', 'finance'] as const;

export function isDemoUser(user: { username?: string } | null | undefined): boolean {
  return !!user && user.username === DEMO_USERNAME;
}
