import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireWorkspace, requireWorkspaceWrite, requirePremium } from '../auth/middleware.js';
import { TRADE_ORDER_TYPES, TRADE_SIDES } from '../db/schema.js';
import { auditActorFor } from '../trading/credentialAudit.js';
import {
  cancelDeskOrder,
  closeDeskPosition,
  deskInstruments,
  deskQuotes,
  DeskError,
  listDeskAccounts,
  listDeskHoldings,
  listDeskWorkingOrders,
  modifyDeskPosition,
  placeDeskOrder,
  recentDeskOrders,
} from '../trading/orderDesk.js';

// The Trade Desk — the live order-placement surface. Split out of routes/trading
// so the one namespace that can move money is a file of its own.
//
// Reads (accounts, instruments, quotes, working orders, the order journal) are
// behind the trading workspace guard; every write is behind requireWorkspaceWrite
// (the right guard on a write, and where a read-only tier's check goes if one
// ever returns — no read-only role exists today), and the demo is refused twice
// over — once by demoGuard (every non-GET) and again inside the service.
//
// Teammates' live positions are NOT served from here: the desk reads them from
// the existing team-scoped /api/trading/live, so the visibility boundary stays
// defined in exactly one place (trading/scope.ts).

const price = z.number().finite().positive();

const placeSchema = z.object({
  connectionId: z.string().min(1),
  instrument: z.string().trim().min(1).max(40),
  side: z.enum(TRADE_SIDES),
  units: z.number().finite().positive().max(100_000_000),
  type: z.enum(TRADE_ORDER_TYPES),
  price: price.nullish(),
  takeProfit: price.nullish(),
  stopLoss: price.nullish(),
});

const closeSchema = z.object({
  connectionId: z.string().min(1),
  tradeId: z.string().min(1).max(64),
  instrument: z.string().trim().min(1).max(40),
  units: z.number().finite().positive().nullish(),
});

// `null` clears the order, an absent key leaves it alone — so the two are
// deliberately distinguishable here (z.optional + .nullable, not .nullish
// collapsed into one).
const modifySchema = z
  .object({
    connectionId: z.string().min(1),
    tradeId: z.string().min(1).max(64),
    instrument: z.string().trim().min(1).max(40),
    takeProfit: price.nullable().optional(),
    stopLoss: price.nullable().optional(),
  })
  .refine((v) => v.takeProfit !== undefined || v.stopLoss !== undefined, {
    message: 'Nothing to change',
  });

const cancelSchema = z.object({
  connectionId: z.string().min(1),
  orderId: z.string().min(1).max(64),
  instrument: z.string().trim().max(40).optional(),
});

// Turn a service refusal into its own status code (400 validation, 404 unknown
// connection, 409 duplicate/halted, 502 broker refusal) with the venue's reason
// attached, so the ticket can show what the broker actually said.
function fail(reply: FastifyReply, e: unknown) {
  if (e instanceof DeskError) {
    return reply.code(e.status).send({ error: e.message, code: e.code });
  }
  const message = e instanceof Error ? e.message : 'Something went wrong';
  return reply.code(500).send({ error: message });
}

export async function tradeDeskRoutes(app: FastifyInstance) {
  // Trade Desk is Max (owner decision, 2026-08): the ladder is Premium TRACKS
  // and Max EXECUTES, so connecting a broker and reviewing trades is Premium
  // while sending an order is the top tier. Reads are gated too — the desk's
  // book and holdings are the placement screen, not the review one, which lives
  // on its own key (`desk`) and is unaffected.
  // Who to attribute a credential use to. The IP is `request.ip`, which is the
  // real client address rather than Railway's edge because `trustProxy` is on in
  // production (server.ts). Worth knowing what that value is and is not: it is
  // the left-most forwarded address, so it is an indicator for an investigation,
  // not proof of origin.
  const read = { preHandler: [requireWorkspace('trading'), requirePremium('tradeDesk')] };
  const write = { preHandler: [requireWorkspaceWrite('trading'), requirePremium('tradeDesk')] };

  // The caller's own tradeable accounts, with live capital.
  app.get('/api/trading/desk/accounts', read, async (request) => ({
    accounts: await listDeskAccounts(request.currentUser!.id, auditActorFor(request)),
  }));

  // What this account may trade, and to what precision.
  app.get('/api/trading/desk/instruments', read, async (request, reply) => {
    const q = z.object({ connectionId: z.string().min(1) }).safeParse(request.query);
    if (!q.success) return reply.code(400).send({ error: 'A connection is required' });
    try {
      return {
        instruments: await deskInstruments(
          request.currentUser!.id,
          q.data.connectionId,
          auditActorFor(request),
        ),
      };
    } catch (e) {
      return fail(reply, e);
    }
  });

  // Live two-sided prices for the ticket. Comma-separated instruments, capped so
  // one request can't fan out into an enormous pricing query.
  app.get('/api/trading/desk/quotes', read, async (request, reply) => {
    const q = z
      .object({ connectionId: z.string().min(1), instruments: z.string().min(1).max(600) })
      .safeParse(request.query);
    if (!q.success) return reply.code(400).send({ error: 'A connection and instruments are required' });
    const list = q.data.instruments.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20);
    try {
      return {
        quotes: await deskQuotes(
          request.currentUser!.id,
          q.data.connectionId,
          list,
          auditActorFor(request),
        ),
      };
    } catch (e) {
      return fail(reply, e);
    }
  });

  // Resting orders across the caller's own accounts.
  app.get('/api/trading/desk/orders', read, async (request) => ({
    orders: await listDeskWorkingOrders(request.currentUser!.id, auditActorFor(request)),
  }));

  // What the caller's spot accounts hold. A spot buy is a balance rather than a
  // position, so this is the crypto counterpart of an open trade — and the only
  // place a Kraken holding is visible on the desk. Read-only by design: selling
  // one goes through the ordinary order path, ticket and confirmation included,
  // rather than getting a shortcut that skips the review step.
  app.get('/api/trading/desk/holdings', read, async (request) => ({
    holdings: await listDeskHoldings(request.currentUser!.id, auditActorFor(request)),
  }));

  // The caller's own order journal — including the attempts that were refused.
  app.get('/api/trading/desk/journal', read, async (request) => ({
    orders: await recentDeskOrders(request.currentUser!.id, 40),
  }));

  // ---- the writes ----

  app.post('/api/trading/desk/orders', write, async (request, reply) => {
    const parsed = placeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Invalid order' });
    }
    try {
      return await placeDeskOrder(request.currentUser!, parsed.data, auditActorFor(request));
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.post('/api/trading/desk/close', write, async (request, reply) => {
    const parsed = closeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Invalid request' });
    }
    try {
      return await closeDeskPosition(request.currentUser!, parsed.data, auditActorFor(request));
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.patch('/api/trading/desk/position', write, async (request, reply) => {
    const parsed = modifySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Invalid request' });
    }
    try {
      await modifyDeskPosition(request.currentUser!, parsed.data, auditActorFor(request));
      return { ok: true };
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.post('/api/trading/desk/cancel', write, async (request, reply) => {
    const parsed = cancelSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Invalid request' });
    }
    try {
      await cancelDeskOrder(request.currentUser!, parsed.data, auditActorFor(request));
      return { ok: true };
    } catch (e) {
      return fail(reply, e);
    }
  });
}
