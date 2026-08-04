import { and, eq, ne } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, type UserRow } from '../db/schema.js';
import { isAdmin, parseRoles } from '../auth/rbac.js';
import { DEMO_USERNAME } from '../demo/identity.js';
import { featuresForUser } from '../features/service.js';
import { getUserTeamContext } from '../userTeams/service.js';

// Who may change whose desk settings.
//
// A trader can always change their own. On top of that, a trader's settings can
// be changed for them by the My Terminal team leader. Admins and founder-level
// users can change anyone's.
//
// THE TEAM HALF IS BEHIND THE TRADING TEAMS GRANT (2026-08). Editing a
// teammate's settings — and even seeing their name in the "whose settings"
// picker — is a team surface, and every other one is behind
// `requireTradingTeams`. This file was the exception: it gated on `actor.teamId`
// alone, so revoking somebody's grant while leaving them on a team left them
// able to reach their teammates here after every other team surface had
// vanished. Admins keep their install-wide reach, which never depended on a
// team and does not pass through the grant.
//
// A badge never grants this. The two badges that used to — Chief Strategist and
// Chief Analyst — were removed outright (owner decision, 2026-08): a title
// naming one trader the desk's analyst or strategist implies they are advising
// the others, which is exactly the advice-giving posture the terminal stays out
// of. Do not reintroduce a badge-derived permission here.

// Whether `actor` is a "desk lead" — empowered to change teammates' desk
// settings — by virtue of admin capability or team leadership.
export async function isDeskLead(actor: UserRow): Promise<boolean> {
  if (isAdmin(parseRoles(actor))) return true;
  // No grant, no team leadership — whatever the team row says.
  if (!(await featuresForUser(actor)).tradingTeams) return false;
  const ctx = await getUserTeamContext(actor.id);
  return !!ctx?.isLeader;
}

// Whether `actor` may change `targetUserId`'s desk settings. Always true for the
// trader's own settings; otherwise the actor must be admin/founder, or a desk
// lead on the *same* team as the target.
export async function canEditDeskSettingsFor(actor: UserRow, targetUserId: string): Promise<boolean> {
  if (actor.id === targetUserId) return true;
  if (isAdmin(parseRoles(actor))) return true;
  // Non-admin desk leads may only reach members of their own team, and only
  // while they hold the grant. Checked here as well as inside isDeskLead so the
  // rule is visible at the boundary rather than only two calls down.
  if (!actor.teamId) return false;
  if (!(await featuresForUser(actor)).tradingTeams) return false;
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
  // `isDeskLead` already refuses without the grant, so this returns just the
  // caller — which is what stops the picker naming teammates to somebody for
  // whom teams do not exist.
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
