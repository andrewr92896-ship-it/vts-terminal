// Identity of the public, read-only demo account. Kept in its own tiny module
// (no heavy imports) so the seeder, auth routes, and rbac can all share it
// without pulling in the demo guard's dependencies.

export const DEMO_USERNAME = 'demo';
export const DEMO_DISPLAY_NAME = 'Demo User';

// Bump this whenever the demo's seeded data changes. On boot, seedDemo() wipes
// and re-seeds the demo account when the stored version differs, so tweaks to
// the simulated data take effect on the next deploy without a manual reset.
export const DEMO_SEED_VERSION = 7;

// The demo account has its own team so its sample study game (and any leaderboard
// activity) stays isolated from the real owner's team — otherwise the default
// team-seeding would adopt the team-less demo into the owner's Vitalis team.
export const DEMO_TEAM_ID = 'team-demo';
export const DEMO_TEAM_NAME = 'Demo Team';

// The roles the demo account holds: a plain member, so a reviewer sees every
// standard workspace (Trading, Studies, My Terminal, Site Help) but never the
// Admin or Founder terminals. It never holds `funded` — the Funded section is
// private and must stay hidden in the demo — nor any admin/founder role.
export const DEMO_ROLES = ['member'] as const;

export function isDemoUser(user: { username?: string } | null | undefined): boolean {
  return !!user && user.username === DEMO_USERNAME;
}
