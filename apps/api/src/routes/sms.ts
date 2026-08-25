import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireMarkets, requirePremium } from '../auth/middleware.js';
import { isDemoUser } from '../demo/identity.js';
import {
  CODE_TTL_MINUTES,
  SmsError,
  confirmVerification,
  getSmsStatus,
  removeSmsNumber,
  sendSmsTest,
  smsConfigured,
  startVerification,
} from '../notifications/sms.js';
import {
  ALERT_CATEGORIES,
  ALERT_CHANNELS,
  getChannelChoices,
  isAlertCategory,
  setChannelChoice,
} from '../notifications/channels.js';

// Text alerts: connecting a mobile number, proving it, and the routing table
// that says which kinds of alert reach which channels.
//
// **Connecting a number is MAX**, and for the same reason Pushover is: the
// feature runs on something of the user's own that the terminal then holds. A
// phone number is arguably the more sensitive of the two — a Pushover key
// addresses an app the person installed, a phone number is the person.
//
// What is deliberately NOT gated, matching the Pushover route exactly:
//
//   • **reading the status**, so the panel can say what text alerts are and
//     what they cost rather than showing a blank;
//   • **disconnecting**. Blocking it would strand a lapsed member's phone
//     number in this database with no way for them to remove it — the exact
//     custody problem the tier exists to limit. Taking your own back is always
//     allowed.
//   • **the channel routing**, which is not a use of anybody's credential and
//     covers the free channels too. A lapsed member must not be locked out of
//     saying "stop sending me trade alerts on the app".
//
// The demo is read-only and never reaches a write here.

export async function smsRoutes(app: FastifyInstance) {
  const signedIn = { preHandler: requireMarkets };
  const paid = { preHandler: [requireMarkets, requirePremium('textAlerts')] };

  app.get('/api/sms/status', signedIn, async (request) => getSmsStatus(request.currentUser!.id));

  // Claim a number and text it a code. Also the "resend" path — asking again
  // simply issues a fresh code, which is why there is no separate resend route
  // to keep in step with this one's throttle.
  app.post('/api/sms/verify/start', paid, async (request, reply) => {
    const me = request.currentUser!;
    if (isDemoUser(me)) return reply.code(403).send({ error: 'The demo cannot send text messages.' });
    const parsed = z.object({ phone: z.string().trim().min(1).max(32) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Enter a mobile number.' });
    try {
      const { delivered } = await startVerification(me.id, parsed.data.phone);
      // Reports honestly whether the text actually went out. A cheerful "sent"
      // over a provider that refused it leaves somebody waiting for a code that
      // is never coming, with nothing on screen to explain it.
      return { ok: true, delivered, expiresInMinutes: CODE_TTL_MINUTES };
    } catch (err) {
      if (err instanceof SmsError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  app.post('/api/sms/verify/confirm', paid, async (request, reply) => {
    const parsed = z.object({ code: z.string().trim().min(1).max(12) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Enter the six-digit code.' });
    try {
      await confirmVerification(request.currentUser!.id, parsed.data.code);
      return { ok: true };
    } catch (err) {
      if (err instanceof SmsError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  // Ungated — see the note above.
  app.delete('/api/sms/number', signedIn, async (request) => {
    await removeSmsNumber(request.currentUser!.id);
    return { ok: true };
  });

  // A test text. Carries an optional message of the sender's own so a real
  // wording can be tried on a real lock screen; the TEST prefix is added by the
  // sender either way and is not the caller's to remove.
  app.post('/api/sms/test', paid, async (request, reply) => {
    if (!smsConfigured()) return reply.code(503).send({ error: 'Text alerts are not set up on the server yet.' });
    const parsed = z.object({ message: z.string().trim().max(200).optional() }).safeParse(request.body ?? {});
    const message = parsed.success ? parsed.data.message : undefined;
    const ok = await sendSmsTest(request.currentUser!.id, message);
    if (!ok) return reply.code(400).send({ error: 'Add and verify a mobile number first.' });
    return { ok: true };
  });

  // ---- Which channels carry which kind of alert ----
  //
  // On `signedIn`, deliberately: this covers the free channels as well as the
  // paid ones, and turning something OFF must never require a membership.
  app.get('/api/alert-channels', signedIn, async (request) => ({
    categories: ALERT_CATEGORIES,
    channels: ALERT_CHANNELS,
    choices: await getChannelChoices(request.currentUser!.id),
  }));

  app.put('/api/alert-channels/:category', signedIn, async (request, reply) => {
    const category = (request.params as { category: string }).category;
    if (!isAlertCategory(category)) return reply.code(404).send({ error: 'Unknown alert type' });
    // Every channel is required rather than patched: the panel has all three on
    // screen, so a partial write would leave "off" and "not mentioned"
    // indistinguishable — and the safe reading of the two differs.
    const parsed = z
      .object({ push: z.boolean(), sms: z.boolean(), pushover: z.boolean() })
      .safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid channel settings' });
    return { choice: await setChannelChoice(request.currentUser!.id, category, parsed.data) };
  });
}
