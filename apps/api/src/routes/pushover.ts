import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireWorkspace } from '../auth/middleware.js';
import {
  getPushoverKey,
  isLikelyUserKey,
  pushoverConfigured,
  removePushoverKey,
  savePushoverKey,
  sendPushoverTest,
} from '../notifications/pushover.js';

// Pushover connection management. Each trader pastes their own Pushover "user
// key"; the application token lives in server config. Gated behind trading
// access; the demo is read-only and never reaches a write here.

export async function pushoverRoutes(app: FastifyInstance) {
  const trading = { preHandler: requireWorkspace('trading') };

  app.get('/api/pushover/status', trading, async (request) => {
    const configured = pushoverConfigured();
    return {
      configured,
      connected: configured ? (await getPushoverKey(request.currentUser!.id)) != null : false,
    };
  });

  app.post('/api/pushover/connect', trading, async (request, reply) => {
    if (!pushoverConfigured()) return reply.code(503).send({ error: 'Pushover is not configured on the server' });
    const parsed = z.object({ userKey: z.string().trim().min(1).max(64) }).safeParse(request.body);
    if (!parsed.success || !isLikelyUserKey(parsed.data.userKey)) {
      return reply.code(400).send({ error: 'That doesn’t look like a Pushover user key (30 letters/numbers).' });
    }
    await savePushoverKey(request.currentUser!.id, parsed.data.userKey);
    return { ok: true };
  });

  app.delete('/api/pushover/connect', trading, async (request) => {
    await removePushoverKey(request.currentUser!.id);
    return { ok: true };
  });

  app.post('/api/pushover/test', trading, async (request, reply) => {
    if (!pushoverConfigured()) return reply.code(503).send({ error: 'Pushover is not configured on the server' });
    const ok = await sendPushoverTest(request.currentUser!.id);
    if (!ok) return reply.code(400).send({ error: 'Connect your Pushover user key first, or check that it’s valid.' });
    return { ok: true };
  });
}
