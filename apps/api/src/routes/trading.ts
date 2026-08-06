import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  requireFunded,
  requireMarkets,
  requireWorkspace,
  requireWorkspaceWrite,
  requirePremium,
} from '../auth/middleware.js';
import type { UserRow } from '../db/schema.js';
import { hasEntitlement } from '../memberships/service.js';
import {
  FREE_CHANNEL_KEYS,
  MAX_WATCHING_FREE,
  MAX_WATCHING_PAID,
  type WatchLimits,
} from '../trading/marketNewsStreams.js';
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
import { listDeletedTrades, restoreDeleted } from '../trading/deleted.js';
import { getDeskSettings, updateDeskSettings, getDeskInstruments } from '../trading/settings.js';
import { canEditDeskSettingsFor, editableDeskMembers } from '../trading/deskAccess.js';
import { tradeDeleteScope } from '../trading/deleteAccess.js';
import { visibleTraderIds } from '../trading/scope.js';
import { getTraderCapital, syncCapital, updateTraderCapital } from '../trading/traderCapital.js';
import {
  addChallenge,
  getOwnChallenge,
  listChallenges,
  removeChallenge,
  syncEquityFromTradeLog,
  updateChallenge,
} from '../trading/challenge.js';
import { getOandaCapital } from '../trading/capital.js';
import { auditActorFor, getAllCredentialAudit, getOwnCredentialAudit } from '../trading/credentialAudit.js';
import {
  getFunded,
  addFundedAccount,
  updateFundedAccount,
  removeFundedAccount,
  addFundedTrade,
  removeFundedTrade,
  setFundedTradeProtection,
  closeFundedTrade,
  importFundedTrades,
} from '../trading/funded.js';
import { addSession, listSessions, removeSession, updateSession } from '../trading/sessions.js';
import { getSessionAlertPrefs, setSessionAlertPrefs } from '../trading/sessionAlertPrefs.js';
import {
  FOMC_MEETING_YEAR,
  FOMC_MEETINGS_2026,
  getMarketData,
  MARKET_GROUP_KEYS,
} from '../trading/marketData.js';
import { getMarketDataLayout, setMarketDataLayout } from '../trading/marketDataLayout.js';
import {
  getMarketNewsStreams,
  setMarketNewsStreams,
  addTeamChannel,
  removeTeamChannel,
  updateTeamChannel,
  liveStreamsConfigured,
  ChannelError,
} from '../trading/marketNewsStreams.js';
import { getUserTeamContext } from '../userTeams/service.js';
import {
  copyTeamBoard,
  createBoard,
  listBoards,
  listTeamBoards,
  removeBoard,
  shareBoard,
  updateBoard,
} from '../trading/boards.js';
import { BOARD_TILE_KINDS, DESK_TILE_KINDS } from '../trading/boardTiles.js';
import {
  getMarketNews,
  GENERAL_NEWS_CATEGORIES,
  getGeneralNews,
  addNews,
  updateNews,
  removeNews,
  addEvent,
  updateEvent,
  removeEvent,
} from '../trading/news.js';
import { listTruthPosts } from '../trading/feeds.js';
import { NEWS_IMPACTS, NEWS_BIASES, NEWS_CATEGORIES } from '../db/schema.js';
import {
  addConnection,
  adminUpdateConnection,
  listAllConnections,
  listConnections,
  removeConnection,
  updateConnection,
} from '../trading/connections.js';
import { isAdmin, parseRoles } from '../auth/rbac.js';
import { featuresForUser } from '../features/service.js';
import { isDemoUser } from '../demo/identity.js';
import {
  addManualPosition,
  listManualPositions,
  removeManualPosition,
  updateManualPosition,
} from '../trading/manual.js';
import {
  aiConfigured,
  analyzeMarketHours,
  parsePositionScreenshot,
  parseAccountScreenshot,
  parseTradeHistoryScreenshot,
} from '../ai/claude.js';
import { AiLimitError, enforceAiLimit } from '../ai/usage.js';
import { generateBrief } from '../ai/brief.js';
import { getPrompt } from '../ai/prompts.js';
import { withGuardrails } from '../ai/guardrails.js';
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
  // The desk. `requireWorkspace('trading')` now also checks the Advanced Trading
  // opt-in (My Terminal ▸ Premium Features), so everything on these two guards is
  // refused for a user who has not turned the desk on.
  const read = { preHandler: requireWorkspace('trading') };
  const write = { preHandler: requireWorkspaceWrite('trading') };
  // The market-facing endpoints — headlines, the economic calendar, market data,
  // the chart board. These are included with every account, so they are
  // deliberately open to every signed-in user, including one who has opted into
  // nothing. Nothing on this guard reads a trade or reaches a broker.
  const markets = { preHandler: requireMarkets };
  // The Funded (prop-challenge) endpoints are the nested opt-in: the caller needs
  // Advanced Trading *and* Funded Account turned on — and now a paid tier as
  // well. Three guards, three different questions: trusted with the desk, asked
  // to see the tracker, allowed to have it.
  const fundedRead = { preHandler: [requireWorkspace('trading'), requireFunded, requirePremium('funded')] };
  const fundedWrite = {
    preHandler: [requireWorkspaceWrite('trading'), requireFunded, requirePremium('funded')],
  };
  // Strategy Sessions — paid. Read as well as write: the section is hidden from
  // a free account, so leaving reads open would only serve a client that had
  // gone looking. Nothing is deleted when a membership lapses; the sessions come
  // back untouched on renewal.
  const sessionsRead = { preHandler: [requireWorkspace('trading'), requirePremium('strategySessions')] };
  const sessionsWrite = {
    preHandler: [requireWorkspaceWrite('trading'), requirePremium('strategySessions')],
  };
  // Connecting a broker with the trader's own API credentials — paid. The reads
  // stay on `read`/`write` above so a lapsed member can still see and remove a
  // connection they already made; what they cannot do is add another.
  const connectionWrite = {
    preHandler: [requireWorkspaceWrite('trading'), requirePremium('brokerConnections')],
  };
  // Saving your own Live Wall arrangement — paid. Reading boards is deliberately
  // NOT gated: a free account still gets the preset boards, which is a working
  // screen rather than a teaser, and the read is what serves them.
  const boardWrite = { preHandler: [requireMarkets, requirePremium('customBoards')] };
  // The Market Data series board — paid. The economic calendar and the FOMC
  // countdown that share that screen are NOT on this guard: they arrive with
  // /api/trading/news and stay free, so a free account keeps a real reason to
  // open the terminal daily.
  const marketData = { preHandler: [requireMarkets, requirePremium('marketData')] };

  // Every endpoint here is behind the `trading` workspace guard, so any caller
  // holds a trading role (full or view-only). Trade data is scoped to the
  // caller's team (see trading/scope.ts) — never the whole install. Balances flow
  // through to whoever can see the data: there is no separate viewBrokerage grant
  // in play, so dollar figures always show for the trades a viewer is allowed.
  const SEE_BALANCES = true;

  // The Live Wall: open positions streamed from the caller's team's brokers.
  // A pure read, so it sits on the read guard.
  app.get('/api/trading/live', read, async (request) => {
    return getLiveWall(request.currentUser!);
  });

  // ---- Trade Log (scoped to the caller's team) ----
  // Every trade payload carries `canDeleteAny`: whether this caller may remove a
  // teammate's row (team leader, a member holding the team's Delete-trades
  // permission, or an admin — see trading/deleteAccess.ts), so the UI knows
  // where to offer a Delete control.
  app.get('/api/trading/trades', read, async (request) => {
    const u = request.currentUser!;
    const [data, scope] = await Promise.all([getTrades(u, isDemoUser(u)), tradeDeleteScope(u)]);
    return { ...data, canDeleteAny: scope.others };
  });

  // ---- History (closed positions, auto-recorded from the Live Wall) ----
  app.get('/api/trading/history', read, async (request) => {
    const u = request.currentUser!;
    const [data, scope] = await Promise.all([
      getHistory(u, SEE_BALANCES, isDemoUser(u)),
      tradeDeleteScope(u),
    ]);
    return { ...data, canDeleteAny: scope.others };
  });

  // Delete a recorded closed trade (e.g. a test trade). The owner can always
  // remove their own; a desk leader / Delete-trades grantee can remove a
  // teammate's, and an admin anyone's. The refreshed History is returned.
  app.delete('/api/trading/history/:id', write, async (request) => {
    const u = request.currentUser!;
    const id = (request.params as { id: string }).id;
    const scope = await tradeDeleteScope(u);
    await removePosition(u.id, id, scope);
    const data = await getHistory(u, SEE_BALANCES, isDemoUser(u));
    return { ...data, canDeleteAny: scope.others };
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
    return getHistory(u, SEE_BALANCES, isDemoUser(u));
  });

  // ---- Desk settings (per trader) ----
  // Each trader has their own settings; a `?userId=` targets a teammate's, which
  // only a desk lead (team leader / admin) may read or change
  // (canEditDeskSettingsFor). The response carries `instruments`
  // (every symbol the team has traded, for the buffer picker), the resolved
  // `userId`, and `editableMembers` — the roster the caller may switch between.
  app.get('/api/trading/desk-settings', read, async (request, reply) => {
    const me = request.currentUser!;
    const target = (request.query as { userId?: string }).userId?.trim() || me.id;
    if (target !== me.id && !(await canEditDeskSettingsFor(me, target))) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    const ids = await visibleTraderIds(me);
    const [settings, instruments, editableMembers] = await Promise.all([
      getDeskSettings(target),
      getDeskInstruments(ids),
      editableDeskMembers(me),
    ]);
    return { ...settings, instruments, userId: target, editableMembers };
  });

  app.patch('/api/trading/desk-settings', write, async (request, reply) => {
    const me = request.currentUser!;
    const body = (request.body ?? {}) as { userId?: unknown };
    const target = (typeof body.userId === 'string' && body.userId.trim()) || me.id;
    const parsed = deskSettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Enter a valid break-even buffer (percent 0–100, or a non-negative dollar/pip amount)' });
    }
    if (target !== me.id && !(await canEditDeskSettingsFor(me, target))) {
      return reply.code(403).send({ error: 'You cannot change that member’s desk settings' });
    }
    const ids = await visibleTraderIds(me);
    const [settings, instruments, editableMembers] = await Promise.all([
      updateDeskSettings(target, parsed.data),
      getDeskInstruments(ids),
      editableDeskMembers(me),
    ]);
    return { ...settings, instruments, userId: target, editableMembers };
  });

  // ---- The trader's own capital: put in, taken out, held now ----------------
  //
  // Self-only, unlike the desk-wide OANDA capital below: this is one person's
  // money by definition. On the `write` guard for the same reason that one is —
  // it reports balances, and that is the floor the desk asked for.
  app.get('/api/trading/capital', write, async (request) =>
    getTraderCapital(request.currentUser!.id, { actor: auditActorFor(request) }),
  );

  app.patch('/api/trading/capital', write, async (request, reply) => {
    const parsed = capitalSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Enter an amount of 0 or more' });
    return updateTraderCapital(request.currentUser!.id, parsed.data, { actor: auditActorFor(request) });
  });

  // The Sync button: turn syncing on for one figure and pull it now, so the
  // trader's one press does the whole thing.
  app.post('/api/trading/capital/sync', write, async (request, reply) => {
    const parsed = capitalSyncSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Pick a figure to sync' });
    try {
      return await syncCapital(request.currentUser!.id, parsed.data.figure, auditActorFor(request));
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not sync' });
    }
  });

  // ---- Funded accounts (prop-firm challenges) — behind the Funded opt-in ----
  //
  // A read answers with EVERY funded account the caller may see: their own, and
  // their teammates' when the account holds the Trading Teams grant. Every write
  // names one account by id and the service matches it against the caller, so a
  // teammate's card is watch-only by construction rather than by the UI hiding a
  // button.
  app.get('/api/trading/challenge', fundedRead, async (request) => {
    return listChallenges(request.currentUser!, SEE_BALANCES);
  });

  app.post('/api/trading/challenge', fundedWrite, async (request, reply) => {
    const parsed = challengeCreateSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'Check the account settings and try again' });
    try {
      return await addChallenge(request.currentUser!, parsed.data, SEE_BALANCES);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not add that account' });
    }
  });

  app.delete('/api/trading/challenge/:id', fundedWrite, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    try {
      return await removeChallenge(request.currentUser!, id, SEE_BALANCES);
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : 'Funded account not found' });
    }
  });

  // Claude (Sonnet) read of the prop-challenge dashboard.
  app.post('/api/trading/metrics/brief', fundedRead, async (request, reply) => {
    if (!aiConfigured()) return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    const u = request.currentUser!;
    // The coach reads the caller's OWN account. A brief about a teammate's
    // drawdown is coaching somebody else's trading, which is not what this is.
    const c = await getOwnChallenge(u.id, SEE_BALANCES);
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
    const system = await withGuardrails(await getPrompt('metrics_coach'));
    try {
      return { brief: await generateBrief(u.id, 'metrics_brief', system, data) };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Brief failed' });
    }
  });

  app.patch('/api/trading/challenge/:id', fundedWrite, async (request, reply) => {
    const parsed = challengeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Check the challenge settings and try again' });
    }
    const id = (request.params as { id: string }).id;
    try {
      return await updateChallenge(request.currentUser!.id, id, parsed.data, SEE_BALANCES);
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : 'Funded account not found' });
    }
  });

  app.post('/api/trading/challenge/:id/sync-equity', fundedWrite, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    try {
      return await syncEquityFromTradeLog(request.currentUser!.id, id, SEE_BALANCES);
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : 'Funded account not found' });
    }
  });

  // Live OANDA account capital (NAV/balance), pulled from the OANDA API so it
  // reflects trades the moment they're placed. Desk-wide — every full trader
  // sees the whole desk's capital, each account tagged with its owner.
  //
  // A GET deliberately on the *write* guard: the desk asked for balances to be
  // kept off view-only accounts, and that guard was where the check lived. The
  // view-only role has since been retired, so what the guard buys today is the
  // Advanced Trading opt-in — still the right floor for a desk-wide balance, and
  // still where the check lands if a read-only tier returns. Left as-is on
  // purpose; moving it to `read` would quietly widen who sees the desk's money.
  app.get('/api/trading/oanda-capital', write, async (request) => {
    return getOandaCapital(request.currentUser!);
  });

  // Read the current balance/equity off an FTP-account screenshot (Opus 4.8
  // vision) and set the challenge equity to it — FTP has no API, so this keeps
  // Account Metrics current from the prop dashboard. Screenshots are sizeable.
  app.post(
    '/api/trading/challenge/:id/analyze',
    { preHandler: [requireWorkspaceWrite('trading'), requireFunded], bodyLimit: 12 * 1024 * 1024 },
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
        const id = (request.params as { id: string }).id;
        const challenge = await updateChallenge(u.id, id, { currentEquity: value }, SEE_BALANCES);
        return { challenge, parsed: p, model };
      } catch (err) {
        if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
        const msg = err instanceof Error ? err.message : 'Analysis failed';
        return reply.code(502).send({ error: msg });
      }
    },
  );

  // ---- Strategy Sessions ----
  app.get('/api/trading/sessions', sessionsRead, async (request) => ({ sessions: await listSessions(request.currentUser!.id) }));
  app.post('/api/trading/sessions', sessionsWrite, async (request, reply) => {
    const parsed = addSessionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A name is required' });
    try {
      return { sessions: await addSession(request.currentUser!.id, parsed.data) };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not add session' });
    }
  });
  app.patch('/api/trading/sessions/:id', sessionsWrite, async (request, reply) => {
    const parsed = editSessionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Check the session details' });
    try {
      return { sessions: await updateSession(request.currentUser!.id, (request.params as { id: string }).id, parsed.data) };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not update session' });
    }
  });
  app.delete('/api/trading/sessions/:id', sessionsWrite, async (request) => ({
    sessions: await removeSession(request.currentUser!.id, (request.params as { id: string }).id),
  }));

  // Resolve an instrument's regular market hours (ET) so a session's whole-week
  // schedule can be filled to "all open market hours". Trading write only, and
  // metered against the per-user AI cap like any other model call.
  app.post('/api/trading/market-hours', write, async (request, reply) => {
    if (!aiConfigured()) {
      return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    }
    const parsed = marketHoursSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Enter an instrument symbol first' });
    try {
      await enforceAiLimit(request.currentUser!.id, 'market_hours');
      const result = await analyzeMarketHours(parsed.data.symbol);
      if (result.days.length === 0) {
        return reply.code(422).send({ error: 'Could not determine market hours for that symbol' });
      }
      return result;
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Market-hours lookup failed' });
    }
  });

  // ---- Strategy Session notification preferences (owner's own sessions) ----
  app.get('/api/trading/session-alert-prefs', read, async (request) => ({
    prefs: await getSessionAlertPrefs(request.currentUser!.id),
  }));
  app.put('/api/trading/session-alert-prefs', write, async (request, reply) => {
    const parsed = sessionAlertPrefsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid notification preferences' });
    const prefs = await setSessionAlertPrefs(request.currentUser!.id, parsed.data);
    return { prefs };
  });

  // ---- Live Wall boards (the per-user saved arrangements) ----
  // Reading is open to everyone — a free account gets the three built-in
  // layouts, which is a working screen. Saving your own is `customBoards`
  // (`boardWrite`). What the Advanced Trading opt-in still decides is which
  // TILES a board may carry: the desk-reading kinds are stripped from anything a
  // non-desk user saves. Applied here, not just in the UI.
  // Every board response carries the same three fields — the reader's own
  // boards, what their TEAM has published, and whether they are on one. A helper
  // rather than each route remembering: the client types them as a single shape,
  // so a route answering with only `boards` would hand it an undefined list.
  //
  // Reading the shared list sits on the free guard alongside their own boards: a
  // free account cannot build a layout, but adopting the one their desk already
  // uses costs nothing to allow and is the most useful thing a team can hand a
  // new member.
  //
  // Sharing follows the Trading Teams GRANT as well as team membership. Without
  // the grant there is no team surface anywhere in the terminal, so publishing a
  // layout "to your team" would be the one place a hidden feature announced
  // itself. A revoked grant therefore hides the share button and the shared
  // list; it does not unshare anything already published, so restoring the grant
  // restores the state.
  const boardsPayload = async (userId: string, user: { id: string; username: string; roles: string | null }) => {
    const granted = (await featuresForUser(user)).tradingTeams;
    const team = granted ? await getUserTeamContext(userId) : null;
    return {
      boards: await listBoards(userId),
      teamBoards: granted ? await listTeamBoards(userId, team?.teamId ?? null) : [],
      onTeam: !!team?.teamId,
    };
  };
  app.get('/api/trading/boards', markets, async (request) => boardsPayload(request.currentUser!.id, request.currentUser!));
  app.post('/api/trading/boards/:id/share', boardWrite, async (request, reply) => {
    const parsed = z.object({ shared: z.boolean() }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Say whether to share it' });
    const userId = request.currentUser!.id;
    const team = await getUserTeamContext(userId);
    try {
      await shareBoard(userId, (request.params as { id: string }).id, team?.teamId ?? null, parsed.data.shared);
      return boardsPayload(userId, request.currentUser!);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not share that board' });
    }
  });
  // Taking a copy CREATES a board, so it is on the paid write guard even though
  // reading the shared list is free.
  app.post('/api/trading/boards/:id/copy', boardWrite, async (request, reply) => {
    const userId = request.currentUser!.id;
    const team = await getUserTeamContext(userId);
    try {
      const board = await copyTeamBoard(userId, team?.teamId ?? null, (request.params as { id: string }).id);
      return { board, ...(await boardsPayload(userId, request.currentUser!)) };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not copy that layout' });
    }
  });
  app.post('/api/trading/boards', boardWrite, async (request, reply) => {
    const parsed = createBoardSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A name is required' });
    const userId = request.currentUser!.id;
    const full = (await featuresForUser(request.currentUser!)).advancedTrading;
    // How MANY boards you may keep follows the MEMBERSHIP, not the desk opt-in.
    //
    // It used to cap a non-desk user at one board, from when the wall was a
    // charts screen and named presets read as a desk feature. They are not:
    // saving your own arrangement is `customBoards`, which `boardWrite` has
    // already checked above — so anyone reaching this line has paid for exactly
    // this. Capping them as well charged a Premium member for presets and then
    // gave them one, on the grounds of a switch that has nothing to do with it.
    // What the desk still decides is which TILES a board may carry, below.
    try {
      const board = await createBoard(userId, { ...parsed.data, layout: allowedLayout(parsed.data.layout, full) });
      return { board, ...(await boardsPayload(userId, request.currentUser!)) };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not save board' });
    }
  });
  app.patch('/api/trading/boards/:id', boardWrite, async (request, reply) => {
    const parsed = editBoardSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Check the board details' });
    const userId = request.currentUser!.id;
    const full = (await featuresForUser(request.currentUser!)).advancedTrading;
    try {
      const board = await updateBoard(userId, (request.params as { id: string }).id, {
        ...parsed.data,
        layout: allowedLayout(parsed.data.layout, full),
      });
      return { board, ...(await boardsPayload(userId, request.currentUser!)) };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not update board' });
    }
  });
  app.delete('/api/trading/boards/:id', boardWrite, async (request) => {
    await removeBoard(request.currentUser!.id, (request.params as { id: string }).id);
    return boardsPayload(request.currentUser!.id, request.currentUser!);
  });

  // ---- Market Data (the series catalog + this trader's board arrangement) ----
  // The catalog is code-resident and identical for everyone; the layout is
  // personal. Two calls rather than one so the catalog response stays cacheable
  // and a layout save never has to round-trip 75 series.
  app.get('/api/trading/market-data', marketData, async () => getMarketData());

  app.get('/api/trading/market-data/layout', marketData, async (request) => ({
    layout: await getMarketDataLayout(request.currentUser!.id),
  }));

  app.put('/api/trading/market-data/layout', marketData, async (request, reply) => {
    const parsed = marketDataLayoutSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid board layout' });
    return { layout: await setMarketDataLayout(request.currentUser!.id, parsed.data) };
  });

  // ---- Market News live streams ----
  // The channel list belongs to the desk — any teammate can add one by pasting a
  // link and it appears for everyone — while which tiles are open, docked and
  // armed for alerts stays personal. `liveConfigured` tells the client whether
  // live status is real yet, so the screen can mark it as sample when it isn't.
  //
  // These sit on `markets`, not `write`: Market News is included with every
  // account, so gating the wall behind the Advanced Trading opt-in
  // would let a user see it and not shape it. The demo is still refused every
  // non-GET by demoGuard, so it watches without reshaping the desk's wall.
  //
  // What the wall costs, resolved here rather than in the service because it is
  // an entitlement question, not a question about what the desk owns.
  //
  // A free account is sent the whole channel list and may only PLAY Yahoo
  // Finance. It used to be sent Yahoo alone, and hiding the rest was the wrong
  // shape: the terminal marks what costs something rather than concealing it
  // (the sidebar's tier badges, the Studies tiles), so somebody on a free
  // account can see what upgrading would give them. The gate is `watchable`,
  // enforced by sanitize on every read and write.
  async function watchLimitsFor(user: UserRow): Promise<WatchLimits> {
    const paid = await hasEntitlement(user, 'presetStreams');
    return {
      watchable: (key) => paid || FREE_CHANNEL_KEYS.has(key),
      maxWatching: paid ? MAX_WATCHING_PAID : MAX_WATCHING_FREE,
    };
  }

  async function streamsFor(user: UserRow) {
    return getMarketNewsStreams(user, await watchLimitsFor(user));
  }

  app.get('/api/trading/market-news/streams', markets, async (request) => ({
    streams: await streamsFor(request.currentUser!),
    liveConfigured: liveStreamsConfigured(),
    fomc: FOMC_SCHEDULE,
  }));

  app.put('/api/trading/market-news/streams', markets, async (request, reply) => {
    const parsed = marketNewsStreamsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid stream setup' });
    return {
      streams: await setMarketNewsStreams(
        request.currentUser!,
        parsed.data,
        await watchLimitsFor(request.currentUser!),
      ),
      liveConfigured: liveStreamsConfigured(),
      fomc: FOMC_SCHEDULE,
    };
  });

  // Add / rename / remove a channel on the desk's wall — Max (owner decision,
  // 2026-08: watching the seeded channels is Premium, bringing your own is Max).
  //
  // Deliberately NOT on the trading write guard: Market News is included with
  // every account, so requiring the Advanced Trading opt-in here would lock a
  // paying user who has not turned the desk on out of their own team's wall. The demo
  // is still refused by demoGuard, which rejects every non-GET first.
  const ownStreams = { preHandler: [requireMarkets, requirePremium('customStreams')] };
  app.post('/api/trading/market-news/channels', ownStreams, async (request, reply) => {
    const parsed = addChannelSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Paste a YouTube channel link' });
    try {
      await addTeamChannel(request.currentUser!, parsed.data);
    } catch (err) {
      if (err instanceof ChannelError) return reply.code(400).send({ error: err.message });
      throw err;
    }
    return {
      streams: await streamsFor(request.currentUser!),
      liveConfigured: liveStreamsConfigured(),
      fomc: FOMC_SCHEDULE,
    };
  });

  app.patch('/api/trading/market-news/channels/:key', ownStreams, async (request, reply) => {
    const parsed = editChannelSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Nothing to update' });
    try {
      await updateTeamChannel(request.currentUser!, (request.params as { key: string }).key, parsed.data);
    } catch (err) {
      if (err instanceof ChannelError) return reply.code(400).send({ error: err.message });
      throw err;
    }
    return {
      streams: await streamsFor(request.currentUser!),
      liveConfigured: liveStreamsConfigured(),
      fomc: FOMC_SCHEDULE,
    };
  });

  app.delete('/api/trading/market-news/channels/:key', ownStreams, async (request) => {
    await removeTeamChannel(request.currentUser!, (request.params as { key: string }).key);
    return {
      streams: await streamsFor(request.currentUser!),
      liveConfigured: liveStreamsConfigured(),
      fomc: FOMC_SCHEDULE,
    };
  });

  // ---- Market News (shared desk feed: headlines + economic calendar) ----
  app.get('/api/trading/news', markets, async () => getMarketNews());

  // The News workspace's world / politics feeds. On `markets` (signed in) like
  // the market feed — general news is included with every account and holds no
  // trade, broker or balance.
  app.get('/api/news/general', markets, async (request, reply) => {
    const parsed = z
      .object({ topic: z.enum(GENERAL_NEWS_CATEGORIES) })
      .safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Unknown topic' });
    return getGeneralNews(parsed.data.topic);
  });

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

    const system = await withGuardrails((await getPrompt('market_overview')).replace(/\{label\}/g, label));
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
    return getTrades(u, isDemoUser(u));
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
    return getTrades(u, isDemoUser(u));
  });

  app.delete('/api/trading/trades/:id', write, async (request) => {
    const u = request.currentUser!;
    const scope = await tradeDeleteScope(u);
    const id = (request.params as { id: string }).id;
    // A Trade Log row is either a hand-logged trade (trading_trades) or an
    // auto-imported broker position (trading_positions). Try the hand-logged
    // table first; the returned `removed` snapshot powers undo for the trader's
    // own trades (a teammate's row can be cleared by a desk leader / a member
    // holding Delete trades / an admin, but never restored from the undo bar —
    // Deleted Trades is where those come back).
    const removed = await removeTrade(u.id, id, scope);
    // Nothing hand-logged matched → it's a broker-sourced row (e.g. a test trade
    // from OANDA). Clear the matching position so it can be removed here too.
    // Note: a still-open position will reappear on the next Live Wall sync (it's
    // still live on the broker); clearing a closed one is permanent. Ids don't
    // collide across the two tables, so this is a no-op when the id isn't a
    // position.
    if (!removed) await removePosition(u.id, id, scope);
    const data = await getTrades(u, isDemoUser(u));
    return { ...data, removed, canDeleteAny: scope.others };
  });

  app.post('/api/trading/trades/restore', write, async (request, reply) => {
    const parsed = restoreSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Could not restore trade' });
    }
    const u = request.currentUser!;
    await restoreTrade(u.id, parsed.data);
    return getTrades(u, isDemoUser(u));
  });

  // ---- Deleted Trades (soft-deleted rows, restorable) ----
  // Whoever may delete a teammate's trade may also put it back, so both sides
  // read the same `canDeleteAny` flag.
  app.get('/api/trading/deleted-trades', read, async (request) => {
    const u = request.currentUser!;
    const [data, scope] = await Promise.all([listDeletedTrades(u, isDemoUser(u)), tradeDeleteScope(u)]);
    return { ...data, canDeleteAny: scope.others };
  });

  app.post('/api/trading/deleted-trades/:id/restore', write, async (request) => {
    const u = request.currentUser!;
    const scope = await tradeDeleteScope(u);
    const id = (request.params as { id: string }).id;
    await restoreDeleted(u.id, id, scope);
    const data = await listDeletedTrades(u, isDemoUser(u));
    return { ...data, canDeleteAny: scope.others };
  });

  // ---- TradingView alerts (FTP/prop replacement) ----
  app.get('/api/trading/alerts', read, async (request) => {
    return getAlerts(request.currentUser!.id);
  });

  // Lightweight desk-wide poll so trading clients can play an alert sound when a
  // new TradingView alert arrives. On the read guard, so a teammate who owns no
  // alerts of their own still receives the shared signal and hears the sound.
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

  // ---- who used a broker credential ----
  //
  // The answer to "was my key used?", for the person who owns the key. Scoped to
  // the caller from their SESSION, never from anything the client sends — a
  // teammate has no way to ask about somebody else's credential, and being on the
  // same team grants nothing here. See trading/credentialAudit.ts for why the
  // pollers appear as one hourly row rather than one per poll.
  app.get('/api/trading/credential-audit', read, async (request) => ({
    entries: await getOwnCredentialAudit(request.currentUser!.id),
  }));

  // Admin-only: everyone's, for a support case or an incident. Same guard shape
  // as the desk-wide connection list above.
  app.get('/api/trading/credential-audit/all', read, async (request, reply) => {
    if (!isAdmin(parseRoles(request.currentUser!))) {
      return reply.code(403).send({ error: 'Admins only' });
    }
    return { entries: await getAllCredentialAudit() };
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

  app.post('/api/trading/connections', connectionWrite, async (request, reply) => {
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

  app.delete('/api/trading/funded/accounts/:id', write, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    try {
      return await removeFundedAccount(request.currentUser!.id, id);
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : 'Account not found' });
    }
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

  // Correct the stop/target the screenshot import read (or missed) on a funded
  // position. Owner-scoped in the service, so this can only ever reach a row the
  // caller entered themselves.
  app.patch('/api/trading/funded/trades/:id', write, async (request, reply) => {
    const parsed = fundedProtectionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Check the stop and target and try again' });
    const id = (request.params as { id: string }).id;
    try {
      return await setFundedTradeProtection(request.currentUser!.id, id, parsed.data);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not update trade' });
    }
  });

  app.delete('/api/trading/funded/trades/:id', write, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    try {
      return await removeFundedTrade(request.currentUser!.id, id);
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : 'Trade not found' });
    }
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
          // The parser has always read these off the screenshot; until the row
          // had somewhere to keep them they were dropped here, and the desk then
          // reported every funded position as carrying no stop.
          stopLoss: p.stopLoss,
          takeProfit: p.takeProfit,
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
// A "count trades since" cutoff, in ms. null clears it (count everything);
// a timestamp sets the trader's real start on that broker account.
const historyStartAt = z.number().int().nonnegative().nullable().optional();
const editConnSchema = z
  .object({
    label: z.string().trim().min(1).max(80).optional(),
    active: z.boolean().optional(),
    creds: credsSchema.optional(),
    historyStartAt,
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

// Admin override edits a teammate's connection: label, active, and the
// "count trades since" cutoff — never credentials.
const adminConnSchema = z
  .object({
    label: z.string().trim().min(1).max(80).optional(),
    active: z.boolean().optional(),
    historyStartAt,
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
const challengeFields = z.object({
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
});
// An UPDATE naming nothing is a mistake worth refusing; a CREATE naming nothing
// is the ordinary case — "add a funded account" makes one on the defaults and
// the trader edits it after. Same fields, two rules, so the create path cannot
// inherit a refusal written for the other one.
const challengeSchema = challengeFields.refine((v) => Object.values(v).some((x) => x !== undefined), {
  message: 'Nothing to update',
});
const challengeCreateSchema = challengeFields;

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
    // The desk's "test trade" floor: broker fills under this many units drop out
    // of the Trade Log / History. 0 turns it off.
    minTradeUnits: z.number().finite().min(0).max(1_000_000_000).optional(),
    // The full per-instrument override list; when present it replaces the stored
    // set. Capped so one request can't insert an unbounded number of rows.
    breakEvenOverrides: z.array(beOverrideSchema).max(200).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

// Deposited / withdrawn capital and the sync switches. Deliberately its OWN
// route rather than more fields on the desk-settings patch: those figures have a
// second, broker-driven writer (the sync), and two write paths into one number
// is how the two come to disagree. `null` clears a figure back to "not stated".
const capitalSchema = z
  .object({
    deposited: z.number().finite().min(0).max(1_000_000_000).nullable().optional(),
    withdrawn: z.number().finite().min(0).max(1_000_000_000).nullable().optional(),
    depositedSync: z.boolean().optional(),
    withdrawnSync: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

// Which figure the Sync button was pressed on.
const capitalSyncSchema = z.object({ figure: z.enum(['deposited', 'withdrawn']) });

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

// Setting a funded position's stop/target by hand. Protection only — see
// setFundedTradeProtection for why the fill, size and side are not editable.
// `.nullish()` carries the whole semantic: omitted leaves a level alone, an
// explicit null clears it.
const fundedProtectionSchema = z
  .object({ stopLoss: price.nullish(), takeProfit: price.nullish() })
  .refine((v) => v.stopLoss !== undefined || v.takeProfit !== undefined, {
    message: 'Nothing to update',
  });

const hhmm = z.string().regex(/^\d{1,2}:\d{2}$/);
// A day window: either an explicit open/close, or `allDay` for the full 24 hours
// (open/close may then be omitted — the server fills them).
const dayWindow = z.object({ open: hhmm.optional(), close: hhmm.optional(), allDay: z.boolean().optional() });
// Per-day schedule: any of the seven day keys, each an optional window.
const daysSchema = z
  .object({
    mon: dayWindow.nullish(),
    tue: dayWindow.nullish(),
    wed: dayWindow.nullish(),
    thu: dayWindow.nullish(),
    fri: dayWindow.nullish(),
    sat: dayWindow.nullish(),
    sun: dayWindow.nullish(),
  })
  .partial();
const sessionFields = {
  instrument: z.string().trim().max(40).nullish(),
  days: daysSchema.optional(),
  marketHours: z.boolean().optional(),
  // `neutral` is dropped from the UI — new/edited sessions may only be bull,
  // bear, or two-way (the DB still tolerates legacy 'neutral' rows on read).
  bias: z.enum(['bull', 'bear', 'both']).optional(),
  notes: z.string().trim().max(2000).nullish(),
  active: z.boolean().optional(),
};
const addSessionSchema = z.object({ name: z.string().trim().min(1).max(80), ...sessionFields });
const editSessionSchema = z
  .object({ name: z.string().trim().min(1).max(80).optional(), ...sessionFields })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

const marketHoursSchema = z.object({ symbol: z.string().trim().min(1).max(60) });

// Market Data board arrangement. Every field is length-capped and the arrays are
// bounded so a saved layout can never bloat the row; unknown series ids are
// dropped server-side in setMarketDataLayout, not here.
// A pasted YouTube channel link, plus an optional display name. The URL is
// parsed server-side (parseYouTubeRef) — the client never decides what a link
// means, so a hand-rolled request cannot smuggle in an arbitrary embed target.
const addChannelSchema = z.object({
  url: z.string().trim().min(1).max(300),
  name: z.string().trim().max(60).optional(),
  alwaysOn: z.boolean().optional(),
});

const editChannelSchema = z
  .object({ name: z.string().trim().max(60).optional(), alwaysOn: z.boolean().optional() })
  .refine((v) => v.name !== undefined || v.alwaysOn !== undefined, { message: 'Nothing to update' });

const marketDataLayoutSchema = z.object({
  pinned: z.array(z.string().trim().min(1).max(64)).max(200),
  hidden: z.array(z.string().trim().min(1).max(64)).max(200),
  custom: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(60),
        group: z.enum(MARKET_GROUP_KEYS),
        label: z.string().trim().min(1).max(60),
        value: z.string().trim().max(60),
        unit: z.string().trim().max(16),
        asOf: z.string().trim().max(60),
        delta: z.string().trim().max(24),
      }),
    )
    .max(40),
});
// The FOMC statement dates, sent with the stream wall so the Federal Reserve
// tile can say how long until the next meeting and how long since the last one.
// Same list Market Data's countdown bar reads — one schedule, not two.
const FOMC_SCHEDULE = { meetings: FOMC_MEETINGS_2026, meetingYear: FOMC_MEETING_YEAR };

// This trader's Market News view state. The channel catalog is code-resident,
// so nothing here can introduce a channel — every key is checked against the
// catalog server-side in `sanitize`, and the schema only guards shape and size.
const marketNewsStreamsSchema = z.object({
  watching: z.array(z.string().trim().min(1).max(80)).max(40),
  docked: z.string().trim().min(1).max(80).nullable(),
  cols: z.number().int().min(1).max(6),
  notify: z.record(z.string().trim().min(1).max(80), z.boolean()),
});

const sessionAlertPrefsSchema = z.object({
  notifyOpen: z.boolean(),
  notifyClose: z.boolean(),
  notifyPreOpen: z.boolean(),
  preOpenLeadMin: z.number().int().min(1).max(240),
});

// Live Wall board layouts. The layout is a bounded grid of tiles; every field
// is length/range-capped so a saved board can never bloat the row or carry
// unexpected shapes. `.passthrough()` is deliberately NOT used — unknown tile
// keys are stripped.
const boardTileSchema = z.object({
  id: z.string().trim().min(1).max(64),
  kind: z.enum(BOARD_TILE_KINDS),
  x: z.number().int().min(0).max(96),
  y: z.number().int().min(0).max(4096),
  w: z.number().int().min(1).max(96),
  h: z.number().int().min(1).max(96),
  symbol: z.string().trim().max(40).optional(),
  interval: z.string().trim().max(8).optional(),
  style: z.string().trim().max(4).optional(),
  studies: z.array(z.string().trim().max(64)).max(30).optional(),
  symbols: z.array(z.string().trim().max(40)).max(60).optional(),
  title: z.string().trim().max(60).optional(),
  positionsView: z.enum(['list', 'cards', 'list-expand', 'cards-expand']).optional(),
  watchlistMode: z.enum(['scroll', 'static']).optional(),
  newsFeed: z.string().trim().max(24).optional(),
  minImpact: z.enum(['all', 'medhigh', 'high']).optional(),
  alertsFilter: z.enum(['active', 'new']).optional(),
  seriesIds: z.array(z.string().trim().max(48)).max(24).optional(),
  channelKey: z.string().trim().max(64).optional(),
  // A scratchpad tile's text rides in the board blob rather than a table of its
  // own. Capped so a board row cannot be grown without bound by one tile.
  noteText: z.string().max(4000).optional(),
  deckId: z.string().trim().max(64).optional(),
  accountId: z.string().trim().max(64).optional(),
  clockZones: z.array(z.string().trim().max(64)).max(8).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  todoSectionId: z.string().trim().max(64).optional(),
  range: z.enum(['7d', '30d', '90d', 'all']).optional(),
});
// The wall carries far more kinds than it used to, so the cap is per board and
// generous rather than tight — 40 was set when there were seven kinds to choose
// between.
//
// `cols` is the workspace width — the dotted workspace area the board is
// arranged inside. Absent = 12 (every board saved before it existed). Range-
// capped like the tile geometry; the client keeps it consistent with the tiles'
// own extent, and the board renders fit-to-width, so an out-of-range value can
// only ever change density, never leak or scroll.
const boardLayoutSchema = z.object({
  tiles: z.array(boardTileSchema).max(60),
  cols: z.number().int().min(6).max(36).optional(),
});

// A user without Advanced Trading has the desk-reading tiles dropped from
// anything they save, so a hand-made request can't put a positions tile on their
// board. Which kinds those are is stated once, in trading/boardTiles.ts.
//
// PAID tiles are deliberately NOT stripped here, and the difference matters. The
// desk is an opt-in the reader controls, so a board saved without it never meant
// to carry those tiles. A membership lapses on its own — stripping on save would
// quietly delete the arrangement of somebody whose card expired, and they would
// come back to a board missing tiles they had built. Instead the tile stays in
// the row and the client draws it locked, so the board is intact the moment the
// membership is. Nothing leaks by keeping it: every paid tile's DATA is gated at
// its own endpoint.
function allowedLayout(
  layout: z.infer<typeof boardLayoutSchema> | undefined,
  advancedTrading: boolean,
) {
  if (!layout || advancedTrading) return layout;
  // Spread first so the workspace width survives the stripping.
  return { ...layout, tiles: layout.tiles.filter((t) => !DESK_TILE_KINDS.has(t.kind)) };
}
const createBoardSchema = z.object({
  name: z.string().trim().min(1).max(80),
  layout: boardLayoutSchema.optional(),
  isDefault: z.boolean().optional(),
});
const editBoardSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    layout: boardLayoutSchema.optional(),
    isDefault: z.boolean().optional(),
  })
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
