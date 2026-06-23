import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireWorkspace, requireWorkspaceWrite } from '../auth/middleware.js';
import { getLiveWall } from '../trading/service.js';
import {
  addTrade,
  getTrades,
  removeTrade,
  restoreTrade,
  updateTrade,
} from '../trading/trades.js';
import { analyzeAlert, dismissAlert, getAlerts } from '../trading/alerts.js';
import { aiConfigured } from '../ai/claude.js';
import { TRADE_SIDES, TRADE_STATUSES } from '../db/schema.js';

const side = z.enum(TRADE_SIDES);
const status = z.enum(TRADE_STATUSES);
const price = z.number().finite();
const ts = z.number().int(); // ms epoch

const addSchema = z.object({
  broker: z.string().trim().max(40).nullish(),
  instrument: z.string().trim().min(1).max(40),
  side: side.optional(),
  status: status.optional(),
  plannedEntry: price.nullish(),
  entryPrice: price,
  exitPrice: price.nullish(),
  takeProfit: price.nullish(),
  stopLoss: price.nullish(),
  units: z.number().finite().min(0).optional(),
  realizedPl: price.nullish(),
  strategy: z.string().trim().max(80).nullish(),
  timeframe: z.string().trim().max(16).nullish(),
  openedAt: ts.optional(),
  closedAt: ts.nullish(),
  notes: z.string().trim().max(2000).nullish(),
});

// All fields optional for editing; nullable fields may be sent as null to clear.
const editSchema = addSchema.partial().refine(
  (v) => Object.values(v).some((x) => x !== undefined),
  { message: 'Nothing to update' },
);

const restoreSchema = z.object({
  id: z.string().min(1),
  broker: z.string().max(40).nullable(),
  instrument: z.string().min(1).max(40),
  side,
  status,
  plannedEntry: price.nullable(),
  entryPrice: price,
  exitPrice: price.nullable(),
  takeProfit: price.nullable(),
  stopLoss: price.nullable(),
  units: z.number().finite(),
  realizedPl: price.nullable(),
  strategy: z.string().max(80).nullable(),
  timeframe: z.string().max(16).nullable(),
  openedAt: ts,
  closedAt: ts.nullable(),
  notes: z.string().max(2000).nullable(),
  createdAt: ts,
});

export async function tradingRoutes(app: FastifyInstance) {
  const read = { preHandler: requireWorkspace('trading') };
  const write = { preHandler: requireWorkspaceWrite('trading') };

  // The Live Wall: open positions streamed from every configured broker.
  // Read-only, so the trading_viewer role is fine. Balances (open P/L) are
  // gated inside the service by the viewBrokerage flag.
  app.get('/api/trading/live', read, async (request) => {
    return getLiveWall(request.currentUser!);
  });

  // ---- Trade Log (per-user) ----
  app.get('/api/trading/trades', read, async (request) => {
    const u = request.currentUser!;
    return getTrades(u.id, !!u.viewBrokerage);
  });

  app.post('/api/trading/trades', write, async (request, reply) => {
    const parsed = addSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Check the trade details and try again' });
    }
    const u = request.currentUser!;
    try {
      await addTrade(u.id, parsed.data);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not add trade' });
    }
    return getTrades(u.id, !!u.viewBrokerage);
  });

  app.patch('/api/trading/trades/:id', write, async (request, reply) => {
    const parsed = editSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Check the trade details and try again' });
    }
    const u = request.currentUser!;
    const id = (request.params as { id: string }).id;
    try {
      await updateTrade(u.id, id, parsed.data);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not update trade' });
    }
    return getTrades(u.id, !!u.viewBrokerage);
  });

  app.delete('/api/trading/trades/:id', write, async (request) => {
    const u = request.currentUser!;
    const id = (request.params as { id: string }).id;
    const removed = await removeTrade(u.id, id);
    const data = await getTrades(u.id, !!u.viewBrokerage);
    return { ...data, removed };
  });

  app.post('/api/trading/trades/restore', write, async (request, reply) => {
    const parsed = restoreSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Could not restore trade' });
    }
    const u = request.currentUser!;
    await restoreTrade(u.id, parsed.data);
    return getTrades(u.id, !!u.viewBrokerage);
  });

  // ---- TradingView alerts (FTP/prop replacement) ----
  app.get('/api/trading/alerts', read, async (request) => {
    return getAlerts(request.currentUser!.id);
  });

  // Analyze an alert's pasted screenshot with Opus 4.8 and auto-create a trade.
  // Screenshots are sizeable, so this route allows a larger body.
  app.post(
    '/api/trading/alerts/:id/analyze',
    { preHandler: requireWorkspaceWrite('trading'), bodyLimit: 12 * 1024 * 1024 },
    async (request, reply) => {
      if (!aiConfigured()) {
        return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
      }
      const parsed = analyzeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'A screenshot image is required' });
      }
      // Accept either a bare base64 string or a full data: URL.
      let data = parsed.data.imageBase64;
      let media = parsed.data.mediaType ?? 'image/png';
      const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.*)$/s.exec(data);
      if (m) {
        media = m[1] as typeof media;
        data = m[2];
      }
      const u = request.currentUser!;
      const id = (request.params as { id: string }).id;
      try {
        return await analyzeAlert(u.id, id, data, media);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Analysis failed';
        return reply.code(502).send({ error: msg });
      }
    },
  );

  app.post('/api/trading/alerts/:id/dismiss', write, async (request) => {
    const u = request.currentUser!;
    const id = (request.params as { id: string }).id;
    return dismissAlert(u.id, id);
  });
}

const analyzeSchema = z.object({
  imageBase64: z.string().min(1),
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/gif', 'image/webp']).optional(),
});
