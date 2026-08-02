import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireMarkets } from '../auth/middleware.js';
import {
  hasSubscription,
  pushConfigured,
  removeSubscription,
  saveSubscription,
  sendTest,
  vapidPublicKey,
} from '../notifications/push.js';

// Phone push (Web Push) subscription management. On requireMarkets (signed in),
// deliberately NOT the Advanced Trading opt-in: price alerts are a Markets
// feature included with every account, so gating the delivery channel behind the
// desk left a Markets-only user able to set an alert and never be told it fired.
// What each subscriber is actually sent is still filtered per event. The public
// demo is read-only and never reaches a write here.

const subSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(400),
    auth: z.string().min(1).max(400),
  }),
});

export async function pushRoutes(app: FastifyInstance) {
  const signedIn = { preHandler: requireMarkets };

  // The client needs the VAPID public key to create a subscription, plus whether
  // this user already has one on some device.
  app.get('/api/push/status', signedIn, async (request) => {
    const configured = pushConfigured();
    return {
      configured,
      publicKey: vapidPublicKey(),
      subscribed: configured ? await hasSubscription(request.currentUser!.id) : false,
    };
  });

  app.post('/api/push/subscribe', signedIn, async (request, reply) => {
    if (!pushConfigured()) return reply.code(503).send({ error: 'Push is not configured on the server' });
    const parsed = subSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid push subscription' });
    const ua = request.headers['user-agent'] ?? null;
    await saveSubscription(request.currentUser!.id, parsed.data, typeof ua === 'string' ? ua : null);
    return { ok: true };
  });

  app.post('/api/push/unsubscribe', signedIn, async (request, reply) => {
    const parsed = z.object({ endpoint: z.string().min(1).max(2000) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'An endpoint is required' });
    await removeSubscription(parsed.data.endpoint);
    return { ok: true };
  });

  // Fire a test notification to the caller's devices so they can confirm setup.
  app.post('/api/push/test', signedIn, async (request, reply) => {
    if (!pushConfigured()) return reply.code(503).send({ error: 'Push is not configured on the server' });
    await sendTest(request.currentUser!.id);
    return { ok: true };
  });
}
