import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../auth/middleware.js';
import { canAccessWorkspace, isAdmin, parseRoles } from '../auth/rbac.js';
import { latestMessageAt, listMessages, postMessage, type ChatChannel } from '../chat/service.js';
import {
  addAnnouncement,
  latestAnnouncementAt,
  listAnnouncements,
  removeAnnouncement,
} from '../chat/announcements.js';

const messageSchema = z.object({ body: z.string().trim().min(1).max(1000) });
const announcementSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(4000),
});

// Resolve and validate the :channel param. The 'trading' channel additionally
// requires Trading-workspace access; 'general' is open to any signed-in user.
// Returns null (after sending the response) when access is denied or invalid.
function resolveChannel(request: FastifyRequest, reply: FastifyReply): ChatChannel | null {
  const channel = (request.params as { channel: string }).channel;
  if (channel !== 'trading' && channel !== 'general') {
    reply.code(400).send({ error: 'Unknown channel' });
    return null;
  }
  if (channel === 'trading' && !canAccessWorkspace(parseRoles(request.currentUser!), 'trading')) {
    reply.code(403).send({ error: 'Forbidden' });
    return null;
  }
  return channel;
}

export async function chatRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };
  const admin = { preHandler: requireAdmin };

  app.get('/api/chat/:channel', auth, async (request, reply) => {
    const channel = resolveChannel(request, reply);
    if (!channel) return reply;
    const u = request.currentUser!;
    return { messages: await listMessages(channel, u.id) };
  });

  app.post('/api/chat/:channel', auth, async (request, reply) => {
    const channel = resolveChannel(request, reply);
    if (!channel) return reply;
    const parsed = messageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Type a message to send' });
    }
    const u = request.currentUser!;
    try {
      return { messages: await postMessage(channel, u, parsed.data.body) };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not send message' });
    }
  });

  // Latest activity across the channels this user can see plus announcements,
  // so the hub can show an unread dot without loading every feed.
  app.get('/api/chat/activity', auth, async (request) => {
    const channels: ChatChannel[] = ['general'];
    if (canAccessWorkspace(parseRoles(request.currentUser!), 'trading')) channels.push('trading');
    const [messages, announcement] = await Promise.all([
      latestMessageAt(channels),
      latestAnnouncementAt(),
    ]);
    return { latest: Math.max(messages, announcement) };
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
