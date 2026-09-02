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
  getFounderLinks,
  getFounderPrefs,
  getInvite,
  invitableFounders,
  linkPositions,
  listPositionLinks,
  pairablePositions,
  previewJoinSize,
  joinPrimary,
  planFounderTest,
  runFounderTest,
  listInvites,
  pendingForRecipient,
  setFounderLink,
  setFounderPrefs,
  unlinkPositions,
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
  // How the size is arrived at. Omitted leaves it alone, which for every
  // setting made before this existed is the fixed-units behaviour.
  sizeMode: z.enum(['units', 'account_pct']).optional(),
  defaultUnits: z.number().finite().positive().max(100_000_000).nullish(),
  // A share of the caller's OWN account value. Bounded at 100 here as well as
  // in the service — a position cannot use more of an account than it has.
  sizePct: z.number().finite().positive().max(100).nullish(),
  pctRound: z.boolean().optional(),
  pctRoundIncrement: z.number().finite().positive().max(1000).optional(),
  defaultConnectionId: z.string().max(64).nullish(),
  // Receiving: how a trade sent to me reaches me.
  reminderEverySeconds: z.number().int().min(60).max(3600).optional(),
  reminderLevel: z.enum(NOTIF_LEVELS).optional(),
  // Sending: what I hear back about a trade I sent.
  notifyOnResponse: z.boolean().optional(),
  responseLevel: z.enum(NOTIF_LEVELS).optional(),
});

// One direction of one link, and WHAT TRAVELS along it. Either party may set it,
// which is what makes "receive their trades" possible without touching their
// account.
//
// A PATCH over what is stored, like the personal prefs: the terminal is a
// service-worker-cached PWA, so a browser on an old bundle changing one switch
// must never silently reset the other. `on` is that old bundle's field and is
// read as the entries switch, which is exactly what it meant when it was the
// only one — so a cached client keeps working rather than failing quietly.
const linkSchema = z
  .object({
    senderUserId: z.string().min(1).max(64),
    recipientUserId: z.string().min(1).max(64),
    entries: z.boolean().optional(),
    amends: z.boolean().optional(),
    on: z.boolean().optional(),
  })
  .refine((v) => v.entries !== undefined || v.amends !== undefined || v.on !== undefined, {
    message: 'Nothing to change',
  });

// Pairing two positions by hand. Only the two trade ids: which accounts they sit
// on is read from each side's own open book, never taken from the request.
const pairSchema = z.object({
  withUserId: z.string().min(1).max(64),
  myTradeId: z.string().min(1).max(64),
  theirTradeId: z.string().min(1).max(64),
});

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
        links: await getFounderLinks(request.currentUser!),
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

  // WHAT A JOIN WOULD CURRENTLY BE SIZED AT, joining nothing. Informational
  // only: the percentage stays the saved intent and the units below it are just
  // what that share comes to right now, on the pair it was priced against. A
  // fixed-units setting has nothing to preview and says so by its mode.
  app.get('/api/founder-trades/size-preview', guard, async (request, reply) => {
    try {
      return { preview: await previewJoinSize(request.currentUser!, auditActorFor(request)) };
    } catch (e) {
      return fail(reply, e);
    }
  });

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

  // ---- links: whose trades reach whom ----
  //
  // Both directions in one read, so the panel can draw "your trades go to" and
  // "you receive trades from" without a second round trip. A link appears on
  // both parties' screens, which is what stops anybody sending or receiving
  // through something they cannot see.
  app.get('/api/founder-trades/links', guard, async (request, reply) => {
    try {
      return { links: await getFounderLinks(request.currentUser!) };
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.put('/api/founder-trades/links', guard, async (request, reply) => {
    const parsed = linkSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid link' });
    try {
      const { senderUserId, recipientUserId, entries, amends, on } = parsed.data;
      return {
        links: await setFounderLink(request.currentUser!, senderUserId, recipientUserId, {
          entries: entries ?? on,
          amends,
        }),
      };
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

  // JOIN, or APPLY a level change — one endpoint for both kinds of invitation.
  //
  // This press is the authorization for one action and nothing else. On a trade
  // invitation the instrument, direction and stop come from the invitation and
  // the size from the caller's own settings; on a level move, the position the
  // change reaches was resolved when the invitation was raised and nothing in
  // this request can redirect it. The desk's ordinary order path does the rest,
  // which is what puts a matched level through the same instant-trigger refusal
  // as one typed by hand.
  app.post('/api/founder-trades/:id/join', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return { invite: await joinPrimary(request.currentUser!, id, auditActorFor(request)) };
    } catch (e) {
      return fail(reply, e);
    }
  });

  // Declining, or leaving your own levels as they are. Either answer ENDS the
  // workflow now: the funded question that used to follow it was removed from
  // this chain (owner decision, 2026-08), and nothing about the funded book or
  // the Funded Trades screen changed with it.
  app.post('/api/founder-trades/:id/decline', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return { invite: await declinePrimary(request.currentUser!, id) };
    } catch (e) {
      return fail(reply, e);
    }
  });

  // ---- linked positions ----
  //
  // A pairing is what turns a level move into one press: the terminal knows
  // exactly which of the recipient's positions is the same trade rather than
  // matching on instrument and hoping. Created automatically by a join, and by
  // hand here for the case the owner named — the invitation came, it was not
  // joined, and the trade was placed separately anyway.
  app.get('/api/founder-trades/positions/links', guard, async (request, reply) => {
    try {
      return { links: await listPositionLinks(request.currentUser!) };
    } catch (e) {
      return fail(reply, e);
    }
  });

  // Both sides' open positions, for the picker. Reading another Founder's open
  // book is deliberate rather than incidental: pairing needs two positions, and
  // this is the same group whose positions already share a Live Wall. It is
  // bounded to founder-level accounts by the guard, and to a named, currently
  // eligible one by the service.
  app.get('/api/founder-trades/positions/pairable', guard, async (request, reply) => {
    const q = z.object({ withUserId: z.string().min(1).max(64) }).safeParse(request.query);
    if (!q.success) return reply.code(400).send({ error: 'A Founder is required' });
    try {
      return await pairablePositions(request.currentUser!, q.data.withUserId, auditActorFor(request));
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.post('/api/founder-trades/positions/links', guard, async (request, reply) => {
    const parsed = pairSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Two positions are required' });
    try {
      return { links: await linkPositions(request.currentUser!, parsed.data, auditActorFor(request)) };
    } catch (e) {
      return fail(reply, e);
    }
  });

  // Either party may break a pairing, exactly as either may set one — being able
  // to stop your own position being reached must not depend on the other person.
  app.delete('/api/founder-trades/positions/links/:id', guard, async (request, reply) => {
    try {
      return { links: await unlinkPositions(request.currentUser!, id(request)) };
    } catch (e) {
      return fail(reply, e);
    }
  });
}

function id(request: { params: unknown }): string {
  return (request.params as { id: string }).id;
}
