import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireMarkets, requirePremium } from '../auth/middleware.js';
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
// Connecting is **Max** (owner decision, 2026-08): anything that takes a
// credential of the user's own sits at the top tier, because holding somebody
// else's key is a responsibility rather than a convenience. That is the same
// rule that puts broker connections there — see FEATURE_TIER.
//
// What is NOT gated, and deliberately so:
//   • **reading the status**, so the screen can say what Pushover is and what it
//     would cost rather than showing nothing;
//   • **disconnecting**. Blocking that would strand a lapsed member's key in this
//     database with no way for them to remove it — the exact custody problem the
//     tier exists to limit. Taking your own credential back is always allowed.
//
// Web push is a separate, free channel (no user credential involved), so a free
// account is still told when its price alert fires. That was the reason this
// route sat on requireMarkets before, and it still holds — it is satisfied by
// push rather than by Pushover.
//
// The demo is read-only and never reaches a write here.

export async function pushoverRoutes(app: FastifyInstance) {
  const signedIn = { preHandler: requireMarkets };

  app.get('/api/pushover/status', signedIn, async (request) => {
    const configured = pushoverConfigured();
    return {
      configured,
      connected: configured ? (await getPushoverKey(request.currentUser!.id)) != null : false,
    };
  });

  // The two writes that USE the key are Max; status and disconnect are not.
  const paid = { preHandler: [requireMarkets, requirePremium('pushover')] };

  app.post('/api/pushover/connect', paid, async (request, reply) => {
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

  app.post('/api/pushover/test', paid, async (request, reply) => {
    if (!pushoverConfigured()) return reply.code(503).send({ error: 'Pushover is not configured on the server' });
    const ok = await sendPushoverTest(request.currentUser!.id);
    if (!ok) return reply.code(400).send({ error: 'Connect your Pushover user key first, or check that it’s valid.' });
    return { ok: true };
  });
}
