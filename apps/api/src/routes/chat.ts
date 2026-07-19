import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../auth/middleware.js';
import { canAccessWorkspace, isAdmin, parseRoles } from '../auth/rbac.js';
import { getTeamName } from '../teams/service.js';
import {
  ChatForbiddenError,
  deleteTeamMessage,
  latestTeamMessageAt,
  listTeamMessages,
  postTeamMessage,
} from '../chat/service.js';
import {
  addAnnouncement,
  latestAnnouncementAt,
  listAnnouncements,
  removeAnnouncement,
} from '../chat/announcements.js';
import { latestSuggestionAt, latestBugReportAt, listSuggestions, listAllBugReports } from '../feedback/service.js';
import { latestSupportRequestAt, listSupportRequests } from '../support/service.js';

const messageSchema = z.object({ body: z.string().trim().min(1).max(1000) });
const announcementSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(4000),
});

// Whether a user may use the Team Chat: they need Trading-workspace access AND a
// trading team. Anyone else is shown the "what is a trading team" explanation.
function teamChatEligibility(u: {
  roles: string | null;
  teamId: string | null;
}): { eligible: boolean; reason: 'ok' | 'no_trading' | 'no_team' } {
  if (!canAccessWorkspace(parseRoles(u), 'trading')) return { eligible: false, reason: 'no_trading' };
  if (!u.teamId) return { eligible: false, reason: 'no_team' };
  return { eligible: true, reason: 'ok' };
}

export async function chatRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };
  const admin = { preHandler: requireAdmin };

  // The team chat feed. Always 200: a non-eligible user gets an empty feed plus
  // the reason, so the client can render the trading-team explanation instead.
  app.get('/api/chat/team', auth, async (request) => {
    const u = request.currentUser!;
    const elig = teamChatEligibility(u);
    const teamName = await getTeamName(u.teamId);
    const messages = elig.eligible ? await listTeamMessages(u.teamId, u.id) : [];
    return { eligible: elig.eligible, reason: elig.reason, teamName, messages };
  });

  app.post('/api/chat/team', auth, async (request, reply) => {
    const u = request.currentUser!;
    const elig = teamChatEligibility(u);
    if (!elig.eligible) return reply.code(403).send({ error: 'You are not on a trading team yet' });
    const parsed = messageSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Type a message to send' });
    try {
      return { messages: await postTeamMessage(u, parsed.data.body) };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not send message' });
    }
  });

  app.delete('/api/chat/team/:id', auth, async (request, reply) => {
    const u = request.currentUser!;
    const elig = teamChatEligibility(u);
    if (!elig.eligible) return reply.code(403).send({ error: 'You are not on a trading team yet' });
    const id = (request.params as { id: string }).id;
    try {
      const messages = await deleteTeamMessage(u.teamId, id, { id: u.id, isAdmin: isAdmin(parseRoles(u)) });
      return { messages };
    } catch (err) {
      if (err instanceof ChatForbiddenError) return reply.code(403).send({ error: err.message });
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not delete message' });
    }
  });

  // In-portal notifications: recent team chat from teammates (a new chat shows
  // here), plus recent suggestions and bug reports for admins. The client
  // computes "unread" from a locally stored last-seen timestamp.
  app.get('/api/notifications', auth, async (request) => {
    const u = request.currentUser!;
    const admin = isAdmin(parseRoles(u));
    const elig = teamChatEligibility(u);
    type Item = {
      id: string;
      kind: 'chat' | 'suggestion' | 'bug' | 'support';
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
        items.push({ id: `chat:${m.id}`, kind: 'chat', title: 'Team chat', body: m.body, author: m.author, avatar: m.avatar, createdAt: m.createdAt });
      }
    }

    if (admin) {
      const [sugg, bugs, support] = await Promise.all([listSuggestions(), listAllBugReports(), listSupportRequests()]);
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
    const elig = teamChatEligibility(u);
    const [chat, announcements, suggestions, bugs, support] = await Promise.all([
      elig.eligible ? latestTeamMessageAt(u.teamId) : Promise.resolve(0),
      latestAnnouncementAt(),
      admin ? latestSuggestionAt() : Promise.resolve(0),
      admin ? latestBugReportAt() : Promise.resolve(0),
      admin ? latestSupportRequestAt() : Promise.resolve(0),
    ]);
    return { chat, announcements, suggestions, bugs, support };
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
