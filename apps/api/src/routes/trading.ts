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
import { getHistory, removePosition, updateClosedPosition } from '../trading/history.js';
import { getDeskSettings, updateDeskSettings, getDeskInstruments } from '../trading/settings.js';
import { getChallenge, syncEquityFromTradeLog, updateChallenge } from '../trading/challenge.js';
import { getOandaCapital } from '../trading/capital.js';
import {
  getFunded,
  addFundedAccount,
  updateFundedAccount,
  removeFundedAccount,
  addFundedTrade,
  removeFundedTrade,
  closeFundedTrade,
  importFundedTrades,
} from '../trading/funded.js';
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
  adminUpdateConnection,
  listAllConnections,
  listConnections,
  removeConnection,
  updateConnection,
} from '../trading/connections.js';
import { isAdmin, parseRoles } from '../auth/rbac.js';
import { isDemoUser } from '../demo/identity.js';
import {
  addManualPosition,
  listManualPositions,
  removeManualPosition,
  updateManualPosition,
} from '../trading/manual.js';
import {
  aiConfigured,
  parsePositionScreenshot,
  parseAccountScreenshot,
  parseTradeHistoryScreenshot,
} from '../ai/claude.js';
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

  // The trading desk is a shared team: every endpoint here is behind the
  // `trading` workspace guard, so any caller holds a trading role (full or
  // view-only). Balances are open to the whole team — there is no separate
  // viewBrokerage grant in play, so dollar figures always flow through.
  const SEE_BALANCES = true;

  // The Live Wall: open positions streamed from every configured broker.
  // Read-only, so the trading_viewer role is fine. Balances are open to the team.
  app.get('/api/trading/live', read, async (request) => {
    return getLiveWall(request.currentUser!);
  });

  // ---- Trade Log (per-user) ----
  app.get('/api/trading/trades', read, async (request) => {
    const u = request.currentUser!;
    return getTrades(u.id, isDemoUser(u));
  });

  // ---- History (closed positions, auto-recorded from the Live Wall) ----
  app.get('/api/trading/history', read, async (request) => {
    const u = request.currentUser!;
    return getHistory(u.id, SEE_BALANCES, isDemoUser(u));
  });

  // Delete a recorded closed trade the caller owns (e.g. a test trade). Only the
  // owner's own positions are removable; the refreshed History is returned.
  app.delete('/api/trading/history/:id', write, async (request) => {
    const u = request.currentUser!;
    const id = (request.params as { id: string }).id;
    await removePosition(u.id, id, isAdmin(parseRoles(u)));
    return getHistory(u.id, SEE_BALANCES, isDemoUser(u));
  });

  // Edit a recorded CLOSED trade (correct an exit, P/L, strategy, dates, …). The
  // owner can edit their own; an admin can correct any on the shared desk.
  app.patch('/api/trading/history/:id', write, async (request, reply) => {
    const parsed = historyEditSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Check the trade details and try again' });
    }
    const u = request.currentUser!;
    const id = (request.params as { id: string }).id;
    try {
      const ok = await updateClosedPosition(u.id, id, parsed.data, isAdmin(parseRoles(u)));
      if (!ok) return reply.code(404).send({ error: 'Closed trade not found' });
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not update trade' });
    }
    return getHistory(u.id, SEE_BALANCES, isDemoUser(u));
  });

  // ---- Desk-wide settings (shared across the trading team) ----
  // The response carries `instruments` — every symbol the desk has traded — so
  // the per-instrument buffer picker can offer them without the trader typing.
  app.get('/api/trading/desk-settings', read, async () => {
    const [settings, instruments] = await Promise.all([getDeskSettings(), getDeskInstruments()]);
    return { ...settings, instruments };
  });

  app.patch('/api/trading/desk-settings', write, async (request, reply) => {
    const parsed = deskSettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Enter a valid break-even buffer (percent 0–100, or a non-negative dollar/pip amount)' });
    }
    const [settings, instruments] = await Promise.all([updateDeskSettings(parsed.data), getDeskInstruments()]);
    return { ...settings, instruments };
  });

  // ---- Account Metrics (prop-firm challenge) ----
  app.get('/api/trading/challenge', read, async (request) => {
    const u = request.currentUser!;
    return getChallenge(u.id, SEE_BALANCES);
  });

  // Claude (Sonnet) read of the prop-challenge dashboard.
  app.post('/api/trading/metrics/brief', read, async (request, reply) => {
    if (!aiConfigured()) return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    const u = request.currentUser!;
    const c = await getChallenge(u.id, SEE_BALANCES);
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
    return updateChallenge(u.id, parsed.data, SEE_BALANCES);
  });

  app.post('/api/trading/challenge/sync-equity', write, async (request) => {
    const u = request.currentUser!;
    return syncEquityFromTradeLog(u.id, SEE_BALANCES);
  });

  // Live OANDA account capital (NAV/balance), pulled from the OANDA API so it
  // reflects trades the moment they're placed. Desk-wide — every full trader
  // sees the whole desk's capital, each account tagged with its owner. Behind
  // the *write* guard so it is visible to full traders only; the trading_viewer
  // (view-only) role is rejected, per the desk's request to keep capital off the
  // view-only role.
  app.get('/api/trading/oanda-capital', write, async () => {
    return getOandaCapital();
  });

  // Read the current balance/equity off an FTP-account screenshot (Opus 4.8
  // vision) and set the challenge equity to it — FTP has no API, so this keeps
  // Account Metrics current from the prop dashboard. Screenshots are sizeable.
  app.post(
    '/api/trading/challenge/analyze',
    { preHandler: requireWorkspaceWrite('trading'), bodyLimit: 12 * 1024 * 1024 },
    async (request, reply) => {
      if (!aiConfigured()) {
        return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
      }
      const parsed = analyzeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'A screenshot image is required' });
      }
      let data = parsed.data.imageBase64;
      let media: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' = parsed.data.mediaType ?? 'image/png';
      const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.*)$/s.exec(data);
      if (m) {
        media = m[1] as typeof media;
        data = m[2];
      }
      const u = request.currentUser!;
      try {
        await enforceAiLimit(u.id, 'account_screenshot');
        const { parsed: p, model } = await parseAccountScreenshot(data, media);
        // Equity (balance + open P/L) is the figure the drawdown math wants;
        // fall back to balance when equity is not shown separately.
        const value = p.equity ?? p.balance;
        if (value == null) {
          return reply.code(422).send({
            error: "Couldn't read a balance from that screenshot. Type it in, or try a clearer image.",
            parsed: p,
          });
        }
        const challenge = await updateChallenge(u.id, { currentEquity: value }, SEE_BALANCES);
        return { challenge, parsed: p, model };
      } catch (err) {
        if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
        const msg = err instanceof Error ? err.message : 'Analysis failed';
        return reply.code(502).send({ error: msg });
      }
    },
  );

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

  // A Claude (Sonnet) overview of the currently-viewed Market News feed. The
  // client sends exactly what it is showing — headlines (with impact/bias tags),
  // upcoming economic-calendar releases, and/or Trump posts — plus the feed
  // label, and we summarize it for the desk. This powers the "AI overview"
  // button on every feed. Read-only, nothing stored; per-user AI limit enforced;
  // 503 when no API key.
  app.post('/api/trading/feed/brief', read, async (request, reply) => {
    if (!aiConfigured()) {
      return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    }
    const parsed = feedBriefSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Check the feed contents and try again' });
    const { label, headlines, events, posts } = parsed.data;

    const parts: string[] = [];
    if (headlines?.length) {
      parts.push(
        'Headlines:\n' +
          headlines
            .map(
              (h) =>
                `- [${h.impact ?? '?'}/${h.bias ?? '?'}${h.category ? `/${h.category}` : ''}] ${h.title}${h.source ? ` (${h.source})` : ''}`,
            )
            .join('\n'),
      );
    }
    if (events?.length) {
      parts.push(
        'Upcoming economic releases:\n' +
          events
            .map((e) => {
              const v = [e.actual && `actual ${e.actual}`, e.forecast && `fcst ${e.forecast}`, e.previous && `prev ${e.previous}`]
                .filter(Boolean)
                .join(', ');
              return `- ${e.when} ET · ${e.country ?? ''} · [${e.impact ?? '?'} impact] ${e.title}${v ? ` (${v})` : ''}`;
            })
            .join('\n'),
      );
    }
    if (posts?.length) {
      parts.push('Trump Truth Social posts:\n' + posts.map((p) => `- ${p.content}`).join('\n'));
    }
    const data = parts.join('\n\n');
    if (!data) return { brief: 'Nothing in this feed yet to summarize — it fills in as the feeds update.' };

    const system =
      `You are a trading-desk analyst for a desk that trades EUR/USD, Bitcoin, gold (futures), Nasdaq (futures), and the S&P 500 (ETF + futures); the trader is also an investment adviser. You are given the current "${label}" feed from the desk's Market News — it may hold headlines (with impact/bias tags), upcoming economic-calendar releases, and/or Trump Truth Social posts. Write a brief overview for this trader: the few things that matter most here, the concrete read-through to the desk's instruments (direction and risk), and what to watch next. Concise (under 170 words), plain text, no markdown headers. Times are Eastern.`;
    try {
      const brief = await generateBrief(request.currentUser!.id, 'feed_brief', system, data);
      return { brief };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Overview failed' });
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
    return getTrades(u.id, isDemoUser(u));
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
    return getTrades(u.id, isDemoUser(u));
  });

  app.delete('/api/trading/trades/:id', write, async (request) => {
    const u = request.currentUser!;
    const admin = isAdmin(parseRoles(u));
    const id = (request.params as { id: string }).id;
    // A Trade Log row is either a hand-logged trade (trading_trades) or an
    // auto-imported broker position (trading_positions). Try the hand-logged
    // table first; the returned `removed` snapshot powers undo for the trader's
    // own trades (admins can also clear any teammate's row on the shared desk).
    const removed = await removeTrade(u.id, id, admin);
    // Nothing hand-logged matched → it's a broker-sourced row (e.g. a test trade
    // from OANDA). Clear the matching position so it can be removed here too.
    // Note: a still-open position will reappear on the next Live Wall sync (it's
    // still live on the broker); clearing a closed one is permanent. Ids don't
    // collide across the two tables, so this is a no-op when the id isn't a
    // position.
    if (!removed) await removePosition(u.id, id, admin);
    const data = await getTrades(u.id, isDemoUser(u));
    return { ...data, removed };
  });

  app.post('/api/trading/trades/restore', write, async (request, reply) => {
    const parsed = restoreSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Could not restore trade' });
    }
    const u = request.currentUser!;
    await restoreTrade(u.id, parsed.data);
    return getTrades(u.id, isDemoUser(u));
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

  // Admin-only: every teammate's connection, tagged with its owner, so an admin
  // can tidy labels desk-wide (e.g. rename a default "Oanda" to "Dale's Trades").
  app.get('/api/trading/connections/all', read, async (request, reply) => {
    if (!isAdmin(parseRoles(request.currentUser!))) {
      return reply.code(403).send({ error: 'Admins only' });
    }
    return { connections: await listAllConnections() };
  });

  // Admin-only: rename / pause any connection regardless of owner.
  app.patch('/api/trading/connections/:id/admin', write, async (request, reply) => {
    if (!isAdmin(parseRoles(request.currentUser!))) {
      return reply.code(403).send({ error: 'Admins only' });
    }
    const parsed = adminConnSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Check the connection details and try again' });
    }
    const id = (request.params as { id: string }).id;
    try {
      await adminUpdateConnection(id, parsed.data);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not update connection' });
    }
    return { connections: await listAllConnections() };
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

  // Read an open position off a broker/order screenshot with Opus 4.8 vision and
  // save it as a manual position. For funded accounts that disallow API trading:
  // screenshot the filled entry and it lands on the Live Wall. Screenshots are
  // sizeable, so this route allows a larger body.
  app.post(
    '/api/trading/connections/:id/positions/analyze',
    { preHandler: requireWorkspaceWrite('trading'), bodyLimit: 12 * 1024 * 1024 },
    async (request, reply) => {
      if (!aiConfigured()) {
        return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
      }
      const uid = request.currentUser!.id;
      const id = (request.params as { id: string }).id;
      if (!(await requireManualConnection(uid, id))) {
        return reply.code(404).send({ error: 'Manual connection not found' });
      }
      const parsed = analyzeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'A screenshot image is required' });
      }
      // Accept either a bare base64 string or a full data: URL.
      let data = parsed.data.imageBase64;
      let media: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' = parsed.data.mediaType ?? 'image/png';
      const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.*)$/s.exec(data);
      if (m) {
        media = m[1] as typeof media;
        data = m[2];
      }
      try {
        await enforceAiLimit(uid, 'position_screenshot');
        const { parsed: p, model } = await parsePositionScreenshot(data, media);
        if (p.entryPrice == null || !p.instrument) {
          return reply.code(422).send({
            error: "Couldn't read an entry price and instrument from that screenshot. Add it by hand, or try a clearer image.",
            parsed: p,
          });
        }
        const positions = await addManualPosition(uid, id, {
          instrument: p.instrument,
          side: p.side === 'short' ? 'short' : 'long',
          units: p.units ?? 0,
          entryPrice: p.entryPrice,
          currentPrice: p.currentPrice,
          takeProfit: p.takeProfit,
          stopLoss: p.stopLoss,
        });
        return { positions, parsed: p, model };
      } catch (err) {
        if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
        const msg = err instanceof Error ? err.message : 'Analysis failed';
        return reply.code(502).send({ error: msg });
      }
    },
  );

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

  // ---- Funded platforms (manual / screenshot-tracked prop accounts) ----
  // Kept separate from the Live Wall / Trade Log: no API, hand-kept balance, and
  // trades imported from screenshots with duplicate detection. Behind the *write*
  // guard so funded balances/P-L are full-trader-only, matching the OANDA capital
  // endpoint — the view-only role never sees account capital, in the UI or the API.
  app.get('/api/trading/funded', write, async (request) => getFunded(request.currentUser!.id));

  app.post('/api/trading/funded/accounts', write, async (request, reply) => {
    const parsed = fundedAccountSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'An account name is required' });
    try {
      return await addFundedAccount(request.currentUser!.id, parsed.data);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not add account' });
    }
  });

  app.patch('/api/trading/funded/accounts/:id', write, async (request, reply) => {
    const parsed = editFundedAccountSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Check the account details and try again' });
    const id = (request.params as { id: string }).id;
    try {
      return await updateFundedAccount(request.currentUser!.id, id, parsed.data);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not update account' });
    }
  });

  app.delete('/api/trading/funded/accounts/:id', write, async (request) => {
    const id = (request.params as { id: string }).id;
    return removeFundedAccount(request.currentUser!.id, id);
  });

  app.post('/api/trading/funded/accounts/:id/trades', write, async (request, reply) => {
    const parsed = fundedTradeSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Check the trade details and try again' });
    const id = (request.params as { id: string }).id;
    try {
      return await addFundedTrade(request.currentUser!.id, id, parsed.data);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not add trade' });
    }
  });

  app.delete('/api/trading/funded/trades/:id', write, async (request) => {
    const id = (request.params as { id: string }).id;
    return removeFundedTrade(request.currentUser!.id, id);
  });

  // Read trades off a funded-account trade-history screenshot (Opus 4.8 vision)
  // and log them, skipping duplicates. Screenshots are sizeable.
  app.post(
    '/api/trading/funded/accounts/:id/import',
    { preHandler: requireWorkspaceWrite('trading'), bodyLimit: 12 * 1024 * 1024 },
    async (request, reply) => {
      if (!aiConfigured()) {
        return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
      }
      const parsed = analyzeSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'A screenshot image is required' });
      let data = parsed.data.imageBase64;
      let media: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' = parsed.data.mediaType ?? 'image/png';
      const mm = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.*)$/s.exec(data);
      if (mm) {
        media = mm[1] as typeof media;
        data = mm[2];
      }
      const uid = request.currentUser!.id;
      const id = (request.params as { id: string }).id;
      try {
        await enforceAiLimit(uid, 'funded_screenshot');
        const { parsed: p, model } = await parseTradeHistoryScreenshot(data, media);
        // Prefer equity (balance + open P/L) when shown, else the balance.
        const balance = p.equity ?? p.balance;
        const { data: funded, added, skipped, ignored, balanceSet } = await importFundedTrades(uid, id, p.trades, balance);
        return { funded, added, skipped, ignored, balanceSet, summary: p.summary, model };
      } catch (err) {
        if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
        const msg = err instanceof Error ? err.message : 'Analysis failed';
        return reply.code(502).send({ error: msg });
      }
    },
  );

  // Read a single OPEN position off an active-trade screenshot (Opus 4.8 vision)
  // and log it as a live funded position: fill price + lot size + side. It then
  // shows on the Live Wall, marked against the desk's OANDA price, without ever
  // touching the Trade Log / History / Live Brokers capital.
  app.post(
    '/api/trading/funded/accounts/:id/positions/analyze',
    { preHandler: requireWorkspaceWrite('trading'), bodyLimit: 12 * 1024 * 1024 },
    async (request, reply) => {
      if (!aiConfigured()) {
        return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
      }
      const parsed = analyzeSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'A screenshot image is required' });
      let data = parsed.data.imageBase64;
      let media: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' = parsed.data.mediaType ?? 'image/png';
      const mm = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.*)$/s.exec(data);
      if (mm) {
        media = mm[1] as typeof media;
        data = mm[2];
      }
      const uid = request.currentUser!.id;
      const id = (request.params as { id: string }).id;
      try {
        await enforceAiLimit(uid, 'funded_screenshot');
        const { parsed: p, model } = await parsePositionScreenshot(data, media);
        if (p.entryPrice == null || !p.instrument) {
          return reply.code(422).send({
            error: "Couldn't read an entry price and instrument from that screenshot. Add it by hand, or try a clearer image.",
            parsed: p,
          });
        }
        const funded = await addFundedTrade(uid, id, {
          instrument: p.instrument,
          side: p.side === 'short' ? 'short' : 'long',
          units: p.units ?? 0,
          entryPrice: p.entryPrice,
          status: 'open',
          openedAt: Date.now(),
        });
        return { funded, parsed: p, model };
      } catch (err) {
        if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
        const msg = err instanceof Error ? err.message : 'Analysis failed';
        return reply.code(502).send({ error: msg });
      }
    },
  );

  // Close an OPEN funded position from a trade-result screenshot (Opus 4.8 vision):
  // read the exit price + realized P/L off the closed trade and finalize this one
  // position, flipping it to 'closed' so it drops off the Live Wall and lands in
  // the account's logged P/L. Cancelling the flow client-side updates nothing.
  app.post(
    '/api/trading/funded/trades/:id/close',
    { preHandler: requireWorkspaceWrite('trading'), bodyLimit: 12 * 1024 * 1024 },
    async (request, reply) => {
      if (!aiConfigured()) {
        return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
      }
      const parsed = analyzeSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'A screenshot image is required' });
      let data = parsed.data.imageBase64;
      let media: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' = parsed.data.mediaType ?? 'image/png';
      const mm = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.*)$/s.exec(data);
      if (mm) {
        media = mm[1] as typeof media;
        data = mm[2];
      }
      const uid = request.currentUser!.id;
      const id = (request.params as { id: string }).id;
      try {
        await enforceAiLimit(uid, 'funded_screenshot');
        const { parsed: p, model } = await parseTradeHistoryScreenshot(data, media);
        const { data: funded, closed, result } = await closeFundedTrade(uid, id, p.trades);
        if (!closed) {
          return reply.code(422).send({
            error:
              "Couldn't read a trade result (exit price or P/L) from that screenshot. Try a clearer image, or remove the trade and log it by hand.",
          });
        }
        return { funded, closed, result, summary: p.summary, model };
      } catch (err) {
        if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
        const msg = err instanceof Error ? err.message : 'Analysis failed';
        return reply.code(502).send({ error: msg });
      }
    },
  );
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

// Admin override edits a teammate's connection: label and active only, never
// credentials.
const adminConnSchema = z
  .object({
    label: z.string().trim().min(1).max(80).optional(),
    active: z.boolean().optional(),
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

const beOverrideSchema = z.object({
  instrument: z.string().trim().min(1).max(40),
  mode: z.enum(['percent', 'dollars', 'pips']),
  pct: z.number().finite().min(0).max(100),
  amount: z.number().finite().min(0),
});

const deskSettingsSchema = z
  .object({
    breakEvenPct: z.number().finite().min(0).max(100).optional(),
    breakEvenMode: z.enum(['percent', 'dollars', 'pips']).optional(),
    breakEvenAmount: z.number().finite().min(0).optional(),
    // The full per-instrument override list; when present it replaces the stored
    // set. Capped so one request can't insert an unbounded number of rows.
    breakEvenOverrides: z.array(beOverrideSchema).max(200).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

// Editing a closed trade in History: the same shape as a hand-logged trade minus
// the fields History doesn't own (broker/status/notes are managed elsewhere).
const historyEditSchema = z
  .object({
    instrument: z.string().trim().min(1).max(40).optional(),
    side: side.optional(),
    units: z.number().finite().min(0).nullish(),
    plannedEntry: price.nullish(),
    entryPrice: price.optional(),
    exitPrice: price.nullish(),
    realizedPl: price.nullish(),
    strategy: z.string().trim().max(80).nullish(),
    timeframe: z.string().trim().max(16).nullish(),
    openedAt: ts.nullish(),
    closedAt: ts.nullish(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

const fundedAccountSchema = z.object({
  platform: z.string().trim().max(40).optional(),
  label: z.string().trim().min(1).max(80),
  currency: z.string().trim().max(8).optional(),
  balance: z.number().finite().nullish(),
  startingBalance: z.number().finite().nullish(),
  notes: z.string().trim().max(2000).nullish(),
});
const editFundedAccountSchema = z
  .object({
    platform: z.string().trim().max(40).optional(),
    label: z.string().trim().min(1).max(80).optional(),
    currency: z.string().trim().max(8).optional(),
    balance: z.number().finite().nullish(),
    startingBalance: z.number().finite().nullish(),
    notes: z.string().trim().max(2000).nullish(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

const fundedTradeSchema = z.object({
  instrument: z.string().trim().min(1).max(40),
  side: side.optional(),
  units: z.number().finite().min(0).nullish(),
  entryPrice: price.nullish(),
  exitPrice: price.nullish(),
  realizedPl: price.nullish(),
  openedAt: ts.nullish(),
  closedAt: ts.nullish(),
  notes: z.string().trim().max(2000).nullish(),
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

// The "AI overview" payload: the client sends what the active feed is showing.
const feedBriefSchema = z.object({
  label: z.string().trim().min(1).max(60),
  headlines: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(240),
        category: z.string().max(20).optional(),
        impact: z.string().max(10).optional(),
        bias: z.string().max(10).optional(),
        source: z.string().max(80).optional(),
      }),
    )
    .max(60)
    .optional(),
  events: z
    .array(
      z.object({
        when: z.string().max(60),
        country: z.string().max(8).optional(),
        title: z.string().trim().min(1).max(160),
        impact: z.string().max(10).optional(),
        forecast: z.string().max(40).optional(),
        previous: z.string().max(40).optional(),
        actual: z.string().max(40).optional(),
      }),
    )
    .max(60)
    .optional(),
  posts: z.array(z.object({ content: z.string().max(2000) })).max(20).optional(),
});

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
