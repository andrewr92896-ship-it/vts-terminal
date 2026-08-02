import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireMarkets } from '../auth/middleware.js';
import {
  getPushoverKey,
  isLikelyUserKey,
  pushoverConfigured,
  removePushoverKey,
  savePushoverKey,
  sendPushoverTest,
} from '../notifications/pushover.js';

// Pushover connection management. Each user pastes their own Pushover "user
// key"; the application token lives in server config.
//
// On requireMarkets (signed in), deliberately NOT the Advanced Trading opt-in:
// price alerts are a Markets feature included with every account, so gating the
// delivery channel behind the desk left a Markets-only user able to set an alert
// and unable to ever be told it fired. The demo is read-only and never reaches a
// write here.

export async function pushoverRoutes(app: FastifyInstance) {
  const signedIn = { preHandler: requireMarkets };

  app.get('/api/pushover/status', signedIn, async (request) => {
    const configured = pushoverConfigured();
    return {
      configured,
      connected: configured ? (await getPushoverKey(request.currentUser!.id)) != null : false,
    };
  });

  app.post('/api/pushover/connect', signedIn, async (request, reply) => {
    if (!pushoverConfigured()) return reply.code(503).send({ error: 'Pushover is not configured on the server' });
    const parsed = z.object({ userKey: z.string().trim().min(1).max(64) }).safeParse(request.body);
    if (!parsed.success || !isLikelyUserKey(parsed.data.userKey)) {
      return reply.code(400).send({ error: 'That doesn’t look like a Pushover user key (30 letters/numbers).' });
    }
    await savePushoverKey(request.currentUser!.id, parsed.data.userKey);
    return { ok: true };
  });

  app.delete('/api/pushover/connect', signedIn, async (request) => {
    await removePushoverKey(request.currentUser!.id);
    return { ok: true };
  });

  app.post('/api/pushover/test', signedIn, async (request, reply) => {
    if (!pushoverConfigured()) return reply.code(503).send({ error: 'Pushover is not configured on the server' });
    const ok = await sendPushoverTest(request.currentUser!.id);
    if (!ok) return reply.code(400).send({ error: 'Connect your Pushover user key first, or check that it’s valid.' });
    return { ok: true };
  });
}
