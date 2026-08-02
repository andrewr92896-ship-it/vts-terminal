import { and, eq, ne } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, type UserRow } from '../db/schema.js';
import { isAdmin, parseBadges, parseRoles } from '../auth/rbac.js';
import { DEMO_USERNAME } from '../demo/identity.js';
import { getUserTeamContext } from '../userTeams/service.js';
import { DESIGNATION_BADGE_KEYS } from '../badges/designations.js';

// Who may change whose desk settings.
//
// A trader can always change their own. On top of that, a trader's settings can
// be changed for them by a teammate who leads the desk: the My Terminal team
// leader, or a holder of a position-designation badge (Chief Analyst / Chief
// Strategist). Admins and founder-level users can change anyone's. This mirrors
// how designations already mark leadership on the desk (see designations.ts).

// Whether `actor` carries a Chief Analyst / Chief Strategist designation badge.
function hasDesignation(actor: UserRow): boolean {
  const held = new Set(parseBadges(actor));
  return DESIGNATION_BADGE_KEYS.some((k) => held.has(k));
}

// Whether `actor` is a "desk lead" — empowered to change teammates' desk
// settings — by virtue of admin capability, team leadership, or a designation.
export async function isDeskLead(actor: UserRow): Promise<boolean> {
  if (isAdmin(parseRoles(actor))) return true;
  if (hasDesignation(actor)) return true;
  const ctx = await getUserTeamContext(actor.id);
  return !!ctx?.isLeader;
}

// Whether `actor` may change `targetUserId`'s desk settings. Always true for the
// trader's own settings; otherwise the actor must be admin/founder, or a desk
// lead on the *same* team as the target.
export async function canEditDeskSettingsFor(actor: UserRow, targetUserId: string): Promise<boolean> {
  if (actor.id === targetUserId) return true;
  if (isAdmin(parseRoles(actor))) return true;
  // Non-admin desk leads may only reach members of their own team.
  if (!actor.teamId) return false;
  const target = (
    await db.select({ teamId: users.teamId }).from(users).where(eq(users.id, targetUserId)).limit(1)
  )[0];
  if (!target || target.teamId !== actor.teamId) return false;
  return isDeskLead(actor);
}

export interface DeskMember {
  id: string;
  name: string;
}

// The teammates whose desk settings `actor` may edit, for the "whose settings"
// picker. A desk lead gets their whole team's active, non-demo roster; everyone
// else gets just themselves. The actor is always included and listed first.
export async function editableDeskMembers(actor: UserRow): Promise<DeskMember[]> {
  const self: DeskMember = { id: actor.id, name: actor.displayName };
  if (!(await isDeskLead(actor)) || !actor.teamId) return [self];
  const rows = await db
    .select({ id: users.id, name: users.displayName })
    .from(users)
    .where(and(eq(users.teamId, actor.teamId), ne(users.username, DEMO_USERNAME), eq(users.active, true)));
  const others = rows
    .filter((r) => r.id !== actor.id)
    .sort((a, b) => a.name.localeCompare(b.name));
  return [self, ...others];
}
