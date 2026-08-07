import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireAdmin, requirePremium, requireTradingTeams } from '../auth/middleware.js';
import { featuresForUser } from '../features/service.js';
import { canAccessWorkspace, isAdmin, isFounder, parseRoles } from '../auth/rbac.js';
import { getTeamName } from '../teams/service.js';
import {
  ChatForbiddenError,
  deleteAdminMessage,
  deleteTeamMessage,
  latestAdminMessageAt,
  latestTeamMessageAt,
  listAdminMessages,
  listTeamMessages,
  postAdminMessage,
  postTeamMessage,
} from '../chat/service.js';
import {
  addAnnouncement,
  latestAnnouncementAt,
  listAnnouncements,
  removeAnnouncement,
} from '../chat/announcements.js';
import {
  latestSuggestionAt,
  latestBugReportAt,
  countBugReportsAwaiting,
  listSuggestions,
  listAllBugReports,
} from '../feedback/service.js';
import { latestSupportRequestAt, listSupportRequests } from '../support/service.js';
import { countOpenViolations, latestViolationAt, listViolations } from '../ai/violations.js';

const messageSchema = z.object({ body: z.string().trim().min(1).max(1000) });
const announcementSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(4000),
});

// Whether this account may use the team chat at all.
//
// `unavailable` is the launch state for almost everybody: Trading Teams are
// hidden behind a developer grant, and an account without it should not be told
// there is a team chat it is missing — the client hides the tab on this reason
// rather than explaining it. The other two reasons are the pre-existing ones and
// still describe a granted account that simply has no team yet.
async function teamChatEligibility(u: {
  id: string;
  username: string;
  roles: string | null;
  teamId: string | null;
}): Promise<{ eligible: boolean; reason: 'ok' | 'unavailable' | 'no_trading' | 'no_team' }> {
  if (!(await featuresForUser(u)).tradingTeams) return { eligible: false, reason: 'unavailable' };
  if (!canAccessWorkspace(parseRoles(u), 'trading')) return { eligible: false, reason: 'no_trading' };
  if (!u.teamId) return { eligible: false, reason: 'no_team' };
  return { eligible: true, reason: 'ok' };
}

export async function chatRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };
  const admin = { preHandler: requireAdmin };
  // Team chat travels with Trading teams at Max — a tier that let you build a
  // team but not message it would be a feature that half-works. The GET stays on
  // plain `auth` so the panel can still render the "not on a team" explanation
  // and the upgrade notice rather than erroring.
  const teamChat = { preHandler: [requireAuth, requireTradingTeams, requirePremium('teamChat')] };

  // The team chat feed. Always 200: a non-eligible user gets an empty feed plus
  // the reason, so the client can render the trading-team explanation instead.
  app.get('/api/chat/team', auth, async (request) => {
    const u = request.currentUser!;
    const elig = await teamChatEligibility(u);
    const teamName = await getTeamName(u.teamId);
    const messages = elig.eligible ? await listTeamMessages(u.teamId, u.id) : [];
    return { eligible: elig.eligible, reason: elig.reason, teamName, messages };
  });

  app.post('/api/chat/team', teamChat, async (request, reply) => {
    const u = request.currentUser!;
    const elig = await teamChatEligibility(u);
    if (!elig.eligible) return reply.code(403).send({ error: 'You are not in a group yet' });
    const parsed = messageSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Type a message to send' });
    try {
      return { messages: await postTeamMessage(u, parsed.data.body) };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not send message' });
    }
  });

  app.delete('/api/chat/team/:id', teamChat, async (request, reply) => {
    const u = request.currentUser!;
    const elig = await teamChatEligibility(u);
    if (!elig.eligible) return reply.code(403).send({ error: 'You are not in a group yet' });
    const id = (request.params as { id: string }).id;
    try {
      const messages = await deleteTeamMessage(u.teamId, id, { id: u.id, isAdmin: isAdmin(parseRoles(u)) });
      return { messages };
    } catch (err) {
      if (err instanceof ChatForbiddenError) return reply.code(403).send({ error: err.message });
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not delete message' });
    }
  });

  // ---- Administrator chat ----
  //
  // One install-wide room for founders, software developers and admins. On
  // requireAdmin, so founder-level passes automatically (isAdmin is a superset).

  app.get('/api/chat/admin', admin, async (request) => ({
    messages: await listAdminMessages(request.currentUser!.id),
  }));

  app.post('/api/chat/admin', admin, async (request, reply) => {
    const parsed = messageSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Type a message to send' });
    const u = request.currentUser!;
    try {
      return { messages: await postAdminMessage(u, parsed.data.body) };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not send message' });
    }
  });

  app.delete('/api/chat/admin/:id', admin, async (request, reply) => {
    const u = request.currentUser!;
    const id = (request.params as { id: string }).id;
    try {
      const messages = await deleteAdminMessage(id, { id: u.id, isFounder: isFounder(parseRoles(u)) });
      return { messages };
    } catch (err) {
      if (err instanceof ChatForbiddenError) return reply.code(403).send({ error: err.message });
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not delete message' });
    }
  });

  // In-terminal notifications: recent team chat from teammates (a new chat shows
  // here), plus recent suggestions and bug reports for admins. The client
  // computes "unread" from a locally stored last-seen timestamp.
  app.get('/api/notifications', auth, async (request) => {
    const u = request.currentUser!;
    const admin = isAdmin(parseRoles(u));
    const elig = await teamChatEligibility(u);
    type Item = {
      id: string;
      kind: 'chat' | 'suggestion' | 'bug' | 'support' | 'violation';
      title: string;
      body: string;
      author: string;
      avatar: string | null;
      createdAt: number;
    };
    const items: Item[] = [];

    if (elig.eligible) {
      const msgs = await listTeamMessages(u.teamId, u.id, 30);
      for (const m of msgs) {
        if (m.mine) continue;
        items.push({ id: `chat:${m.id}`, kind: 'chat', title: 'Group chat', body: m.body, author: m.author, avatar: m.avatar, createdAt: m.createdAt });
      }
    }

    if (admin) {
      const [sugg, bugs, support, violations] = await Promise.all([
        listSuggestions(),
        listAllBugReports(),
        listSupportRequests(),
        listViolations(15),
      ]);
      // Rule breaking rides the same bell as bug reports, which is what the
      // owner asked for: these are reviewed, not merely filed. Only the OPEN
      // ones — a reviewed violation has had its human look and should stop
      // asking for another.
      for (const v of violations.filter((x) => x.status === 'open')) {
        items.push({
          id: `violation:${v.id}`,
          kind: 'violation',
          title: v.disputed ? 'Rule breaking — user disputes it' : 'Rule breaking',
          body: `VTS AI declined a financial-advice request from ${v.userName}.${v.timedOut ? ' Timed out for 30 minutes.' : ''}`,
          author: v.userName,
          avatar: null,
          createdAt: v.createdAt,
        });
      }
      for (const s of sugg.slice(0, 15)) {
        items.push({ id: `suggestion:${s.id}`, kind: 'suggestion', title: 'New suggestion', body: s.body, author: s.author, avatar: null, createdAt: s.createdAt });
      }
      for (const b of bugs.slice(0, 15)) {
        items.push({ id: `bug:${b.id}`, kind: 'bug', title: 'Bug report', body: b.summary, author: b.author, avatar: null, createdAt: b.createdAt });
      }
      for (const r of support.slice(0, 15)) {
        items.push({ id: `support:${r.id}`, kind: 'support', title: 'Support request', body: r.summary, author: r.author, avatar: null, createdAt: r.createdAt });
      }
    }

    items.sort((a, b) => b.createdAt - a.createdAt);
    const trimmed = items.slice(0, 25);
    return { items: trimmed, latestAt: trimmed[0]?.createdAt ?? 0 };
  });

  // Latest activity per source, so the corner chat can show an unread dot and the
  // Site Help workspace can flag new announcements without loading feeds.
  app.get('/api/chat/activity', auth, async (request) => {
    const u = request.currentUser!;
    const admin = isAdmin(parseRoles(u));
    const elig = await teamChatEligibility(u);
    const [chat, adminChat, announcements, suggestions, bugs, bugsAwaiting, support, violations, violationsOpen] = await Promise.all([
      elig.eligible ? latestTeamMessageAt(u.teamId) : Promise.resolve(0),
      admin ? latestAdminMessageAt() : Promise.resolve(0),
      latestAnnouncementAt(),
      admin ? latestSuggestionAt() : Promise.resolve(0),
      admin ? latestBugReportAt() : Promise.resolve(0),
      // Bug Reports' sidebar dot is driven by this live count (reports still
      // waiting on a person), not by the last-activity stamp above — resolving a
      // report has to clear the dot, and a stamp can only ever move forward.
      admin ? countBugReportsAwaiting() : Promise.resolve(0),
      admin ? latestSupportRequestAt() : Promise.resolve(0),
      admin ? latestViolationAt() : Promise.resolve(0),
      // Like bugsAwaiting: a live count of what is still open, so reviewing the
      // last one clears the sidebar dot. A last-activity stamp only moves
      // forward and could never do that.
      admin ? countOpenViolations() : Promise.resolve(0),
    ]);
    return {
      chat,
      adminChat,
      announcements,
      suggestions,
      bugs,
      bugsAwaiting,
      support,
      violations,
      violationsOpen,
    };
  });

  app.get('/api/announcements', auth, async (request) => {
    const canManage = isAdmin(parseRoles(request.currentUser!));
    return { announcements: await listAnnouncements(), canManage };
  });

  app.post('/api/announcements', admin, async (request, reply) => {
    const parsed = announcementSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'A title and message are required' });
    }
    const u = request.currentUser!;
    try {
      return { announcements: await addAnnouncement(u, parsed.data.title, parsed.data.body) };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not post announcement' });
    }
  });

  app.delete('/api/announcements/:id', admin, async (request) => {
    const id = (request.params as { id: string }).id;
    return { announcements: await removeAnnouncement(id) };
  });
}
