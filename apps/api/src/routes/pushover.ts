import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireMarkets, requirePremium } from '../auth/middleware.js';
import {
  acknowledgeLiveAlerts,
  getPushoverKey,
  isLikelyUserKey,
  pushoverConfigured,
  removePushoverKey,
  savePushoverKey,
  sendPushoverTest,
  type PushoverTestKind,
} from '../notifications/pushover.js';
import { getRepeatPrefs, setRepeatPrefs } from '../notifications/alertPrefs.js';
import { liveAlerts, resolveByCallbackToken } from '../notifications/pushoverReceipts.js';

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

  // A test is sent either the way a real trade notification goes out, or at
  // emergency priority so the recipient can prove the setup that has to wake
  // them. An unrecognised or absent kind falls back to `standard` rather than
  // failing — the worst outcome of a malformed test request is a quieter test,
  // never an unexpected repeating one.
  app.post('/api/pushover/test', paid, async (request, reply) => {
    if (!pushoverConfigured()) return reply.code(503).send({ error: 'Pushover is not configured on the server' });
    // 'emergency' is the old name for 'repeating' and is still accepted: the web
    // app is a service-worker-cached PWA, so a browser on yesterday's bundle can
    // still be posting it.
    const parsed = z
      .object({ kind: z.enum(['standard', 'repeating', 'emergency']).optional() })
      .safeParse(request.body ?? {});
    const raw = parsed.success ? (parsed.data.kind ?? 'standard') : 'standard';
    const kind: PushoverTestKind = raw === 'standard' ? 'standard' : 'repeating';
    const ok = await sendPushoverTest(request.currentUser!.id, kind);
    if (!ok) return reply.code(400).send({ error: 'Connect your Pushover user key first, or check that it’s valid.' });
    return { ok: true };
  });

  // ---- Repeating alerts: timing, and acknowledging from the terminal ----

  // How often a repeating alert repeats and for how long. On `signedIn` rather
  // than `paid` deliberately: reading and changing your own alert timing is not
  // a use of the Pushover credential, and a lapsed member must not be stuck with
  // a repeat setting they can no longer edit.
  app.get('/api/pushover/repeat-prefs', signedIn, async (request) => {
    return { prefs: await getRepeatPrefs(request.currentUser!.id) };
  });

  app.put('/api/pushover/repeat-prefs', signedIn, async (request, reply) => {
    const parsed = z
      .object({
        repeatEverySeconds: z.number().int().optional(),
        repeatForSeconds: z.number().int().optional(),
      })
      .safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid repeat settings' });
    // Out-of-range values are clamped rather than refused — see alertPrefs.ts.
    return { prefs: await setRepeatPrefs(request.currentUser!.id, parsed.data) };
  });

  // What is still sounding on this user's phone. Polled by the terminal so the
  // banner appears without a reload, and read on arrival so opening the app can
  // silence anything repeating.
  app.get('/api/pushover/live-alerts', signedIn, async (request) => {
    return { alerts: await liveAlerts(request.currentUser!.id) };
  });

  // Acknowledge — the terminal-side equivalent of pressing the button in the
  // Pushover app. With no id, everything still repeating is cleared, which is
  // what "silence it because I have opened the terminal" needs.
  app.post('/api/pushover/acknowledge', signedIn, async (request) => {
    const parsed = z.object({ id: z.string().optional() }).safeParse(request.body ?? {});
    const only = parsed.success ? parsed.data.id : undefined;
    const cleared = await acknowledgeLiveAlerts(request.currentUser!.id, only);
    return { cleared };
  });

  // Pushover POSTs here when the user acknowledges on their PHONE, so the
  // terminal's banner clears too and the two never disagree about what is still
  // sounding.
  //
  // Deliberately unauthenticated — Pushover carries no session — which is
  // exactly why the token in the path is unguessable and is the only thing
  // matched on. It answers 200 whatever happens: Pushover retries a callback it
  // considers failed, and there is nothing useful to retry here. Nothing about
  // the account is disclosed either way.
  app.post('/api/pushover/callback/:token', async (request) => {
    const token = (request.params as { token: string }).token;
    if (token) await resolveByCallbackToken(token).catch(() => false);
    return { ok: true };
  });
}
