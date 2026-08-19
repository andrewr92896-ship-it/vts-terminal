import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireFounder } from '../auth/middleware.js';
import { getShareConfig, setShareConfig } from '../trading/founderTradeConfig.js';
import { NOTIF_LEVELS } from '../notifications/prefs.js';
import { auditActorFor } from '../trading/credentialAudit.js';
import {
  canSendOrders,
  createInvite,
  declinePrimary,
  founderAccounts,
  FounderTradeError,
  getFounderPrefs,
  getInvite,
  getProofImage,
  invitableFounders,
  joinPrimary,
  planFounderTest,
  runFounderTest,
  listInvites,
  pendingForRecipient,
  setFounderPrefs,
  setFundedDecision,
  uploadProof,
} from '../trading/founderTrades.js';

// Founder trade coordination — every route in one namespace, and every one of
// them behind `requireFounder`.
//
// The guard is the authority, not the sidebar: the terminal hides the feature
// from anybody who is not founder-level, and this is what makes that hiding
// cosmetic. Nothing here consults a name, an email or an id — eligibility comes
// from `users.roles` through the same authorization every other founder-only
// tool uses, and the service re-checks it on top of the guard so a call from
// anywhere else still fails closed.
//
// Reads are guarded exactly as writes are. A workflow carries a trade, its
// levels and a screenshot of somebody's funded account, so there is no half of
// it that is safe to serve more widely.

const inviteSchema = z.object({
  recipientUserId: z.string().min(1).max(64),
  sourceOrderId: z.string().min(1).max(64),
});

// A PATCH: the server merges onto what is stored, so a browser on an old
// service-worker-cached bundle posting a subset never blanks a setting it does
// not know about.
const prefsSchema = z.object({
  defaultUnits: z.number().finite().positive().max(100_000_000).nullish(),
  defaultConnectionId: z.string().max(64).nullish(),
  autoInvite: z.boolean().optional(),
  autoInviteUserId: z.string().max(64).nullish(),
  reminderEverySeconds: z.number().int().min(60).max(3600).optional(),
  reminderLevel: z.enum(NOTIF_LEVELS).optional(),
});

const proofSchema = z.object({ image: z.string().min(1) });

// What travels with an invitation. Founder-set and install-wide — the group's
// rule rather than one trader's, so an invitation means the same thing whoever
// sent it. A PATCH, like the personal prefs.
const configSchema = z.object({
  copyStopLoss: z.boolean().optional(),
  copyTakeProfit: z.boolean().optional(),
});

function fail(reply: FastifyReply, e: unknown) {
  if (e instanceof FounderTradeError) {
    return reply.code(e.status).send({ error: e.message, code: e.code });
  }
  const message = e instanceof Error ? e.message : 'Something went wrong';
  return reply.code(500).send({ error: message });
}

export async function founderTradeRoutes(app: FastifyInstance) {
  const guard = { preHandler: [requireFounder] };

  // What is still waiting on this Founder, oldest first. The blocking modal
  // polls this, and it is the ONE thing that decides whether the modal is up —
  // which is what makes an unresolved workflow survive a refresh, a relogin and
  // a redeploy without the client remembering anything.
  app.get('/api/founder-trades/pending', guard, async (request) => {
    const user = request.currentUser!;
    const invites = await pendingForRecipient(user);
    // Only look the rest up when there is something to answer. The modal polls
    // this every few seconds on every screen in the terminal, and the quiet case
    // is the overwhelmingly common one.
    if (invites.length === 0) {
      return { invites, prefs: await getFounderPrefs(user.id), accounts: [], canTrade: true };
    }
    return {
      invites,
      prefs: await getFounderPrefs(user.id),
      accounts: await founderAccounts(user.id),
      // Whether this account may actually send an order. False leaves DECLINE
      // available and says why JOIN is not — an invitation nobody can answer is
      // the one way this workflow could trap somebody.
      canTrade: await canSendOrders(user),
    };
  });

  // Sent and received, newest first — the history behind the desk panel.
  app.get('/api/founder-trades', guard, async (request, reply) => {
    try {
      return {
        invites: await listInvites(request.currentUser!),
        recipients: await invitableFounders(request.currentUser!),
        prefs: await getFounderPrefs(request.currentUser!.id),
        accounts: await founderAccounts(request.currentUser!.id),
        canTrade: await canSendOrders(request.currentUser!),
        config: await getShareConfig(),
      };
    } catch (e) {
      return fail(reply, e);
    }
  });

  // The Founders this caller may invite. Founder-level accounts only — an
  // ordinary user is never listed, and never listed to.
  app.get('/api/founder-trades/recipients', guard, async (request, reply) => {
    try {
      return { recipients: await invitableFounders(request.currentUser!) };
    } catch (e) {
      return fail(reply, e);
    }
  });

  // The caller's own size and account for a joined trade. Deliberately their
  // own: there is no parameter here that could set somebody else's, because the
  // size an order goes out at belongs to whoever authorizes it.
  app.get('/api/founder-trades/prefs', guard, async (request) => ({
    prefs: await getFounderPrefs(request.currentUser!.id),
    accounts: await founderAccounts(request.currentUser!.id),
    canTrade: await canSendOrders(request.currentUser!),
  }));

  app.put('/api/founder-trades/prefs', guard, async (request, reply) => {
    const parsed = prefsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Invalid settings' });
    }
    try {
      return { prefs: await setFounderPrefs(request.currentUser!, parsed.data) };
    } catch (e) {
      return fail(reply, e);
    }
  });

  // ---- what is sent, for everybody ----
  //
  // Founder-set and install-wide. Any founder-level account may read and change
  // it, which is what "for the whole group" means here — there is deliberately
  // no per-person override, because two Founders disagreeing about whether a
  // target travels would make one invitation mean two things.
  app.get('/api/founder-trades/config', guard, async () => ({ config: await getShareConfig() }));

  app.put('/api/founder-trades/config', guard, async (request, reply) => {
    const parsed = configSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid settings' });
    try {
      return { config: await setShareConfig(parsed.data) };
    } catch (e) {
      return fail(reply, e);
    }
  });

  // ---- the test drill ----
  //
  // Split in two on purpose: the plan says exactly what would be placed — the
  // pair, the size, the levels, the account — so the button can state it before
  // anything is sent. A test that puts a real order on somebody's account
  // without saying so first is not a test anybody should press.
  app.get('/api/founder-trades/test', guard, async (request, reply) => {
    try {
      return { plan: await planFounderTest(request.currentUser!, auditActorFor(request)) };
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.post('/api/founder-trades/test', guard, async (request, reply) => {
    try {
      return await runFounderTest(request.currentUser!, auditActorFor(request));
    } catch (e) {
      return fail(reply, e);
    }
  });

  // One workflow with its audit timeline. Readable by the two parties only.
  app.get('/api/founder-trades/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await getInvite(request.currentUser!, id);
    } catch (e) {
      return fail(reply, e);
    }
  });

  // The funded screenshot, served as its own read so a list never carries every
  // image on the desk.
  app.get('/api/founder-trades/:id/proof', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return { image: await getProofImage(request.currentUser!, id) };
    } catch (e) {
      return fail(reply, e);
    }
  });

  // Raise an invitation from a trade the caller has just placed. Repeating it
  // for the same trade returns the invitation that already exists rather than
  // raising a second one.
  app.post('/api/founder-trades', guard, async (request, reply) => {
    const parsed = inviteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Invalid invitation' });
    }
    try {
      return { invite: await createInvite(request.currentUser!, parsed.data) };
    } catch (e) {
      return fail(reply, e);
    }
  });

  // JOIN. This press is the authorization for one order and nothing else: the
  // instrument, direction and stop come from the invitation, the size from the
  // caller's own settings, and the desk's ordinary order path does the rest.
  app.post('/api/founder-trades/:id/join', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return { invite: await joinPrimary(request.currentUser!, id, auditActorFor(request)) };
    } catch (e) {
      return fail(reply, e);
    }
  });

  // Declining the primary trade deliberately does NOT end the workflow — the
  // funded question is separate and still owed.
  app.post('/api/founder-trades/:id/decline', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return { invite: await declinePrimary(request.currentUser!, id) };
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.post('/api/founder-trades/:id/funded', guard, async (request, reply) => {
    const parsed = z.object({ decision: z.enum(['yes', 'no']) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A funded decision is required' });
    try {
      return { invite: await setFundedDecision(request.currentUser!, id(request), parsed.data.decision) };
    } catch (e) {
      return fail(reply, e);
    }
  });

  // The screenshot is what completes the funded branch, not the YES that
  // preceded it. Body limit matches the desk's other screenshot routes; the
  // client scales the image before it gets here.
  app.post(
    '/api/founder-trades/:id/proof',
    { preHandler: [requireFounder], bodyLimit: 12 * 1024 * 1024 },
    async (request, reply) => {
      const parsed = proofSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'A screenshot is required' });
      try {
        return { invite: await uploadProof(request.currentUser!, id(request), parsed.data.image) };
      } catch (e) {
        return fail(reply, e);
      }
    },
  );
}

function id(request: { params: unknown }): string {
  return (request.params as { id: string }).id;
}
