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
import { analyzeAlert, dismissAlert, getAlerts, getAlertSignal } from '../trading/alerts.js';
import { getHistory } from '../trading/history.js';
import { getChallenge, syncEquityFromTradeLog, updateChallenge } from '../trading/challenge.js';
import { addSession, listSessions, removeSession, updateSession } from '../trading/sessions.js';
import {
  getMarketNews,
  addNews,
  updateNews,
  removeNews,
  addEvent,
  updateEvent,
  removeEvent,
} from '../trading/news.js';
import { listTruthPosts } from '../trading/feeds.js';
import { SESSION_BIASES, NEWS_IMPACTS, NEWS_BIASES, NEWS_CATEGORIES } from '../db/schema.js';
import {
  addConnection,
  listConnections,
  removeConnection,
  updateConnection,
} from '../trading/connections.js';
import {
  addManualPosition,
  listManualPositions,
  removeManualPosition,
  updateManualPosition,
} from '../trading/manual.js';
import { aiConfigured, askClaude } from '../ai/claude.js';
import { AiLimitError, enforceAiLimit } from '../ai/usage.js';
import { generateBrief } from '../ai/brief.js';
import { TRADE_SIDES, TRADE_STATUSES, BROKER_CONNECTION_KINDS } from '../db/schema.js';

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
    return getTrades(u.id);
  });

  // ---- History (closed positions, auto-recorded from the Live Wall) ----
  app.get('/api/trading/history', read, async (request) => {
    const u = request.currentUser!;
    return getHistory(u.id, !!u.viewBrokerage);
  });

  // ---- Account Metrics (prop-firm challenge) ----
  app.get('/api/trading/challenge', read, async (request) => {
    const u = request.currentUser!;
    return getChallenge(u.id, !!u.viewBrokerage);
  });

  // Claude (Sonnet) read of the prop-challenge dashboard.
  app.post('/api/trading/metrics/brief', read, async (request, reply) => {
    if (!aiConfigured()) return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    const u = request.currentUser!;
    const c = await getChallenge(u.id, !!u.viewBrokerage);
    const m = c.metrics;
    const pctOrDash = (v: number) => `${v.toFixed(1)}%`;
    const data = [
      `${c.label}: ${pctOrDash(c.targetPct)} profit target, ${pctOrDash(c.dailyDdPct)} daily / ${pctOrDash(c.maxDdPct)} max drawdown (${c.trailing ? 'trailing' : 'static'}). Status: ${m.status}.`,
      `Profit so far: ${m.profitPct.toFixed(2)}% of account (${(m.progressPct * 100).toFixed(0)}% of the way to target).`,
      `Max-drawdown buffer: ${(m.maxHeadroomPct * 100).toFixed(0)}% of the allowance remaining. Daily buffer: ${(m.dailyHeadroomPct * 100).toFixed(0)}%.`,
      m.breaches.target ? 'Target reached.' : '',
      m.breaches.daily ? 'Daily drawdown breached.' : '',
      m.breaches.max ? 'Max drawdown breached.' : '',
    ].filter(Boolean).join('\n');
    const system =
      'You are a prop-firm trading coach. Given a funded-account challenge dashboard (profit vs target, drawdown buffers, status), write a short, practical read: where the account stands, the main risk right now (which buffer is tight), and disciplined next steps. Under 130 words, plain text, no markdown headers. Do not invent dollar figures.';
    try {
      return { brief: await generateBrief(u.id, 'metrics_brief', system, data) };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Brief failed' });
    }
  });

  app.patch('/api/trading/challenge', write, async (request, reply) => {
    const parsed = challengeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Check the challenge settings and try again' });
    }
    const u = request.currentUser!;
    return updateChallenge(u.id, parsed.data, !!u.viewBrokerage);
  });

  app.post('/api/trading/challenge/sync-equity', write, async (request) => {
    const u = request.currentUser!;
    return syncEquityFromTradeLog(u.id, !!u.viewBrokerage);
  });

  // ---- Strategy Sessions ----
  app.get('/api/trading/sessions', read, async (request) => ({ sessions: await listSessions(request.currentUser!.id) }));
  app.post('/api/trading/sessions', write, async (request, reply) => {
    const parsed = addSessionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A name is required' });
    try {
      return { sessions: await addSession(request.currentUser!.id, parsed.data) };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not add session' });
    }
  });
  app.patch('/api/trading/sessions/:id', write, async (request, reply) => {
    const parsed = editSessionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Check the session details' });
    try {
      return { sessions: await updateSession(request.currentUser!.id, (request.params as { id: string }).id, parsed.data) };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not update session' });
    }
  });
  app.delete('/api/trading/sessions/:id', write, async (request) => ({
    sessions: await removeSession(request.currentUser!.id, (request.params as { id: string }).id),
  }));

  // ---- Market News (shared desk feed: headlines + economic calendar) ----
  app.get('/api/trading/news', read, async () => getMarketNews());

  // Mirrored Truth Social posts (populated by the background poller).
  app.get('/api/trading/truth', read, async () => ({ posts: await listTruthPosts() }));

  app.post('/api/trading/news', write, async (request, reply) => {
    const parsed = newsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A headline is required' });
    try {
      return await addNews(request.currentUser!.id, parsed.data);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not add headline' });
    }
  });
  app.patch('/api/trading/news/:id', write, async (request, reply) => {
    const parsed = editNewsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Check the headline details' });
    try {
      return await updateNews((request.params as { id: string }).id, parsed.data);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not update headline' });
    }
  });
  app.delete('/api/trading/news/:id', write, async (request) =>
    removeNews((request.params as { id: string }).id),
  );

  app.post('/api/trading/calendar', write, async (request, reply) => {
    const parsed = eventSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'An event name and time are required' });
    try {
      return await addEvent(request.currentUser!.id, parsed.data);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not add event' });
    }
  });
  app.patch('/api/trading/calendar/:id', write, async (request, reply) => {
    const parsed = editEventSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Check the event details' });
    try {
      return await updateEvent((request.params as { id: string }).id, parsed.data);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not update event' });
    }
  });
  app.delete('/api/trading/calendar/:id', write, async (request) =>
    removeEvent((request.params as { id: string }).id),
  );

  // A quick Claude (Sonnet) desk brief over the current headlines. Read-only
  // generation, no data is stored. Returns 503 if no API key is configured.
  app.post('/api/trading/news/brief', read, async (request, reply) => {
    if (!aiConfigured()) {
      return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    }
    const { headlines } = await getMarketNews();
    if (headlines.length === 0) {
      return { brief: 'No headlines posted yet, add a few and I’ll summarize the desk view.' };
    }
    const lines = headlines
      .slice(0, 40)
      .map((h) => `- [${h.category}/${h.impact}/${h.bias}] ${h.title}${h.source ? ` (${h.source})` : ''}`)
      .join('\n');
    const system =
      'You are a trading-desk analyst. Given a list of market headlines with category, impact, and bias tags, write a brief, practical desk note: the overall risk tone, the few things that matter most today, and what to watch. Be concise (under 180 words), plain text, no markdown headers.';
    try {
      await enforceAiLimit(request.currentUser!.id, 'news_brief');
      const brief = await askClaude(`Current headlines:\n${lines}`, system);
      return { brief };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Brief failed' });
    }
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
    return getTrades(u.id);
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
    return getTrades(u.id);
  });

  app.delete('/api/trading/trades/:id', write, async (request) => {
    const u = request.currentUser!;
    const id = (request.params as { id: string }).id;
    const removed = await removeTrade(u.id, id);
    const data = await getTrades(u.id);
    return { ...data, removed };
  });

  app.post('/api/trading/trades/restore', write, async (request, reply) => {
    const parsed = restoreSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Could not restore trade' });
    }
    const u = request.currentUser!;
    await restoreTrade(u.id, parsed.data);
    return getTrades(u.id);
  });

  // ---- TradingView alerts (FTP/prop replacement) ----
  app.get('/api/trading/alerts', read, async (request) => {
    return getAlerts(request.currentUser!.id);
  });

  // Lightweight desk-wide poll so trading clients can play an alert sound when a
  // new TradingView alert arrives. Read access, so trading_viewer users (who own
  // no alerts of their own) still receive the shared signal and hear the sound.
  app.get('/api/trading/signals', read, async () => getAlertSignal());

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
        await enforceAiLimit(u.id, 'analyze');
        return await analyzeAlert(u.id, id, data, media);
      } catch (err) {
        if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
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

  // ---- Broker connections (per-user, self-service; credentials encrypted) ----
  app.get('/api/trading/connections', read, async (request) => {
    return { connections: await listConnections(request.currentUser!.id) };
  });

  app.post('/api/trading/connections', write, async (request, reply) => {
    const parsed = addConnSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Check the connection details and try again' });
    }
    const uid = request.currentUser!.id;
    try {
      await addConnection(uid, { broker: parsed.data.broker, label: parsed.data.label, creds: parsed.data.creds });
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not add connection' });
    }
    return { connections: await listConnections(uid) };
  });

  app.patch('/api/trading/connections/:id', write, async (request, reply) => {
    const parsed = editConnSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Check the connection details and try again' });
    }
    const uid = request.currentUser!.id;
    const id = (request.params as { id: string }).id;
    try {
      await updateConnection(uid, id, parsed.data);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not update connection' });
    }
    return { connections: await listConnections(uid) };
  });

  app.delete('/api/trading/connections/:id', write, async (request) => {
    const uid = request.currentUser!.id;
    const id = (request.params as { id: string }).id;
    await removeConnection(uid, id);
    return { connections: await listConnections(uid) };
  });

  // ---- Manual positions (hand-entered open positions on a 'manual' connection) ----
  // The connection must belong to the calling user and be a 'manual' kind.
  async function requireManualConnection(userId: string, connectionId: string): Promise<boolean> {
    const conns = await listConnections(userId);
    return conns.some((c) => c.id === connectionId && c.broker === 'manual');
  }

  app.get('/api/trading/connections/:id/positions', read, async (request, reply) => {
    const uid = request.currentUser!.id;
    const id = (request.params as { id: string }).id;
    if (!(await requireManualConnection(uid, id))) {
      return reply.code(404).send({ error: 'Manual connection not found' });
    }
    return { positions: await listManualPositions(id) };
  });

  app.post('/api/trading/connections/:id/positions', write, async (request, reply) => {
    const uid = request.currentUser!.id;
    const id = (request.params as { id: string }).id;
    if (!(await requireManualConnection(uid, id))) {
      return reply.code(404).send({ error: 'Manual connection not found' });
    }
    const parsed = addPositionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Check the position details and try again' });
    }
    try {
      return { positions: await addManualPosition(uid, id, parsed.data) };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not add position' });
    }
  });

  app.patch('/api/trading/positions/:id', write, async (request, reply) => {
    const uid = request.currentUser!.id;
    const id = (request.params as { id: string }).id;
    const parsed = editPositionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Check the position details and try again' });
    }
    try {
      return { positions: await updateManualPosition(uid, id, parsed.data) };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not update position' });
    }
  });

  app.delete('/api/trading/positions/:id', write, async (request) => {
    const uid = request.currentUser!.id;
    const id = (request.params as { id: string }).id;
    return { positions: await removeManualPosition(uid, id) };
  });
}

const brokerKind = z.enum(BROKER_CONNECTION_KINDS);
const credsSchema = z.record(z.string(), z.unknown());
const addConnSchema = z.object({
  broker: brokerKind,
  label: z.string().trim().min(1).max(80),
  creds: credsSchema,
});
const editConnSchema = z
  .object({
    label: z.string().trim().min(1).max(80).optional(),
    active: z.boolean().optional(),
    creds: credsSchema.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

const addPositionSchema = z.object({
  instrument: z.string().trim().min(1).max(40),
  side: side.optional(),
  units: z.number().finite().min(0).optional(),
  entryPrice: price,
  currentPrice: price.nullish(),
  takeProfit: price.nullish(),
  stopLoss: price.nullish(),
  plannedEntry: price.nullish(),
  openedAt: ts.optional(),
});
const editPositionSchema = addPositionSchema.partial().refine(
  (v) => Object.values(v).some((x) => x !== undefined),
  { message: 'Nothing to update' },
);

const pct = z.number().finite().min(0).max(100);
const dollars = z.number().finite().min(0).max(1_000_000_000);
const challengeSchema = z
  .object({
    label: z.string().trim().min(1).max(80).optional(),
    accountSize: dollars.optional(),
    targetPct: pct.optional(),
    dailyDdPct: pct.optional(),
    maxDdPct: pct.optional(),
    trailing: z.boolean().optional(),
    currentEquity: dollars.optional(),
    peakEquity: dollars.optional(),
    dayStartEquity: dollars.optional(),
    startedAt: z.number().int().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

const analyzeSchema = z.object({
  imageBase64: z.string().min(1),
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/gif', 'image/webp']).optional(),
});

const hhmm = z.string().regex(/^\d{1,2}:\d{2}$/);
const sessionFields = {
  instrument: z.string().trim().max(40).nullish(),
  openTime: hhmm.optional(),
  closeTime: hhmm.optional(),
  timeframe: z.string().trim().max(16).nullish(),
  bias: z.enum(SESSION_BIASES).optional(),
  bullPlan: z.string().trim().max(2000).nullish(),
  bearPlan: z.string().trim().max(2000).nullish(),
  notes: z.string().trim().max(2000).nullish(),
  active: z.boolean().optional(),
};
const addSessionSchema = z.object({ name: z.string().trim().min(1).max(80), ...sessionFields });
const editSessionSchema = z
  .object({ name: z.string().trim().min(1).max(80).optional(), ...sessionFields })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

const newsFields = {
  body: z.string().trim().max(4000).nullish(),
  source: z.string().trim().max(80).nullish(),
  url: z.string().trim().max(500).nullish(),
  category: z.enum(NEWS_CATEGORIES).optional(),
  impact: z.enum(NEWS_IMPACTS).optional(),
  bias: z.enum(NEWS_BIASES).optional(),
  publishedAt: ts.optional(),
};
const newsSchema = z.object({ title: z.string().trim().min(1).max(240), ...newsFields });
const editNewsSchema = z
  .object({ title: z.string().trim().min(1).max(240).optional(), ...newsFields })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

const eventFields = {
  country: z.string().trim().max(40).nullish(),
  impact: z.enum(NEWS_IMPACTS).optional(),
  forecast: z.string().trim().max(40).nullish(),
  previous: z.string().trim().max(40).nullish(),
  actual: z.string().trim().max(40).nullish(),
};
const eventSchema = z.object({ title: z.string().trim().min(1).max(160), eventTime: ts, ...eventFields });
const editEventSchema = z
  .object({ title: z.string().trim().min(1).max(160).optional(), eventTime: ts.optional(), ...eventFields })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });
