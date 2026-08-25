import './types.js';
import path from 'node:path';
import fs from 'node:fs';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { loadUser } from './auth/middleware.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { earlyAccessRoutes } from './routes/earlyAccess.js';
import { brokerRoutes } from './routes/brokers.js';
import { healthRoutes } from './routes/health.js';
import { todoRoutes } from './routes/todo.js';
import { tradingRoutes } from './routes/trading.js';
import { tradeDeskRoutes } from './routes/tradeDesk.js';
import { founderTradeRoutes } from './routes/founderTrades.js';
import { tradingNotesRoutes } from './routes/tradingNotes.js';
import { webhookRoutes } from './routes/webhooks.js';
import { aiRoutes } from './routes/ai.js';
import { chatRoutes } from './routes/chat.js';
import { feedbackRoutes } from './routes/feedback.js';
import { supportRoutes } from './routes/support.js';
import { studiesRoutes } from './routes/studies.js';
import { studyPackageRoutes } from './routes/studyPackages.js';
import { devRoutes } from './routes/dev.js';
import { pushRoutes } from './routes/push.js';
import { pushoverRoutes } from './routes/pushover.js';
import { smsRoutes } from './routes/sms.js';
import { devBlogRoutes } from './routes/devBlog.js';
import { notificationPrefsRoutes } from './routes/notificationPrefs.js';
import { priceAlertRoutes } from './routes/priceAlerts.js';
import { widgetRoutes } from './routes/widget.js';
import { contentRoutes } from './routes/content.js';
import { userTeamRoutes } from './routes/userTeams.js';
import { messageTemplateRoutes } from './routes/messageTemplates.js';
import { employeeRoutes } from './routes/employee.js';
import { featureRoutes } from './routes/features.js';
import { budgetRoutes } from './routes/budget.js';
import { wallTemplateRoutes } from './routes/wallTemplates.js';
import { seedWallTemplates } from './trading/wallTemplates.js';
import { WALL_TEMPLATE_SEED } from './trading/wallTemplateSeed.js';
import { investmentRoutes } from './routes/investments.js';
import { myPortalRoutes } from './routes/myPortal.js';
import { applyEmployeeSecurityHeaders, enforceIpAllowlist } from './employee/guard.js';
import { seedBadges } from './badges/service.js';
import { seedDevBlog } from './devBlog/service.js';
import { runMigrations } from './db/migrate.js';
import { waitForDatabase } from './db/index.js';
import { seedAdmin, seedDemo, backfillEmails } from './seed.js';
import { seedDefaultTeam } from './teams/service.js';
import { backfillTeamLeaders } from './userTeams/service.js';
import { backfillConnectionLabels, repairManualConnectionSecrets } from './trading/connections.js';
import { backfillCapitalAccounts } from './trading/traderCapital.js';
import { ensureBakedInGamesAllTeams } from './studies/bakedGames.js';
import { seedWelcome } from './chat/announcements.js';
import { demoGuard } from './demo/demo.js';
import { startFeeds } from './trading/feeds.js';
import { startDeskWatch } from './trading/service.js';
import { warmMarketMacro } from './trading/marketMacro.js';
import { startSessionWatch } from './trading/sessionWatch.js';
import { startRolloverWatch } from './trading/rolloverWatch.js';
import { startFounderTradeWatch } from './trading/founderTradeWatch.js';
import { startYoutubeWatch } from './trading/youtubeWatch.js';
import { startPriceAlertWatch } from './trading/priceAlertWatch.js';
import { startNoteSettleWatch } from './trading/noteSettle.js';

// In production the backend also serves the built React app (apps/web/dist),
// so the whole terminal runs as one service.
const WEB_DIST = path.resolve(config.apiRoot, '..', 'web', 'dist');

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: config.isProd ? 'info' : 'debug',
      // Log only the path, never the query string — so a token or any other
      // secret accidentally placed in the URL is never written to the logs.
      serializers: {
        req(request: { method?: string; url?: string; headers?: { host?: string }; ip?: string }) {
          return {
            method: request.method,
            url: request.url ? request.url.split('?')[0] : request.url,
            host: request.headers?.host,
            remoteAddress: request.ip,
          };
        },
      },
      transport: config.isProd
        ? undefined
        : { target: 'pino-pretty', options: { translateTime: 'SYS:standard', ignore: 'pid,hostname' } },
    },
    trustProxy: config.isProd,
  });

  // Signed cookies for the session token.
  await app.register(cookie, { secret: config.SESSION_SECRET });

  // In dev the browser app calls the API cross-origin (5173 -> 4000) and must
  // send the session cookie. In production it is same-origin, so CORS is a
  // no-op, but we keep the allowed origin explicit.
  await app.register(cors, {
    origin: config.WEB_ORIGIN,
    credentials: true,
  });

  app.decorateRequest('currentUser', null);
  app.addHook('onRequest', loadUser);
  // The demo account is read-only and its AI is scripted; this refuses its
  // writes and serves canned AI before any route handler runs.
  app.addHook('preHandler', demoGuard);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(adminRoutes);
  await app.register(earlyAccessRoutes);
  await app.register(brokerRoutes);
  await app.register(tradingRoutes);
  await app.register(tradeDeskRoutes);
  await app.register(founderTradeRoutes);
  await app.register(tradingNotesRoutes);
  await app.register(webhookRoutes);
  await app.register(todoRoutes);
  await app.register(aiRoutes);
  await app.register(chatRoutes);
  await app.register(feedbackRoutes);
  await app.register(supportRoutes);
  await app.register(studiesRoutes);
  await app.register(studyPackageRoutes);
  await app.register(devRoutes);
  await app.register(pushRoutes);
  await app.register(pushoverRoutes);
  await app.register(smsRoutes);
  await app.register(notificationPrefsRoutes);
  await app.register(priceAlertRoutes);
  await app.register(widgetRoutes);
  await app.register(contentRoutes);
  await app.register(userTeamRoutes);
  await app.register(messageTemplateRoutes);
  await app.register(employeeRoutes);
  await app.register(featureRoutes);
  await app.register(budgetRoutes);
  await app.register(wallTemplateRoutes);
  await app.register(investmentRoutes);
  await app.register(myPortalRoutes);
  await app.register(devBlogRoutes);

  // Serve the built frontend and fall back to index.html for client routes.
  // Only when the build exists (production / after `npm run build`).
  if (fs.existsSync(path.join(WEB_DIST, 'index.html'))) {
    await app.register(fastifyStatic, { root: WEB_DIST, wildcard: false });

    // The employee portal is its own page at /employee — a separate Vite entry
    // (employee.html), not a route inside the main single-page app. Serving it
    // from a distinct URL is what makes the separation real: the main bundle
    // never contains employee code, and this shell carries the hardened header
    // set (strict CSP, no framing, no caching, no referrer) that the rest of the
    // site does not need. The optional IP allowlist is applied here too, so a
    // blocked network never even receives the sign-in page.
    const employeeShellPath = path.join(WEB_DIST, 'employee.html');
    // Read and hold the shell rather than handing it to @fastify/static: the
    // static plugin sets its own Cache-Control, which would overwrite the
    // no-store header this page must carry. Sending the string ourselves keeps
    // every header under this handler's control. The file is a build artifact,
    // so caching it in memory is safe for the life of the process.
    let employeeShellHtml: string | null = null;
    const serveEmployeeShell = async (request: FastifyRequest, reply: FastifyReply) => {
      if (!(await enforceIpAllowlist(request, reply))) return reply;
      applyEmployeeSecurityHeaders(reply, { html: true });
      if (employeeShellHtml == null) {
        if (!fs.existsSync(employeeShellPath)) {
          return reply.code(404).type('text/plain').send('Employee portal is not built');
        }
        employeeShellHtml = fs.readFileSync(employeeShellPath, 'utf8');
      }
      return reply.type('text/html; charset=utf-8').send(employeeShellHtml);
    };
    app.get('/employee', serveEmployeeShell);
    app.get('/employee/', serveEmployeeShell);
    // Any deeper path resolves to the same shell, so a bookmarked or mistyped
    // sub-path lands on the portal rather than the main app.
    app.get('/employee/*', serveEmployeeShell);

    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api')) {
        return reply.type('text/html').sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Not found' });
    });
  }

  return app;
}

// On boot in production, bring the database (on the persistent volume) up to
// date and ensure the admin user exists. Idempotent and safe to run every boot.
async function bootstrapDatabase(): Promise<void> {
  // Confirm the database (on the persistent volume) actually answers before
  // migrating — tolerates a brief mount delay and gives a clear log otherwise.
  await waitForDatabase();
  await runMigrations();
  await seedAdmin();
  // Give any pre-email accounts a sign-in email before email login goes live.
  await backfillEmails();
  await seedDemo();
  // Ensure the default trading team exists and adopt any team-less accounts
  // (the admin/demo users are seeded after migrations, so they need this on a
  // fresh database).
  await seedDefaultTeam();
  // Create-if-absent, never overwrite — once a template is in the table it
  // belongs to whoever edits it from the Developer Terminal, and re-applying the
  // code version every deploy would silently undo their work.
  await seedWallTemplates(WALL_TEMPLATE_SEED);
  // Give every existing trading team a My Terminal leader so it shows as a managed
  // team (the My Terminal Trading Team is now the same team that scopes trades).
  await backfillTeamLeaders();
  // Make sure every broker connection's name says which venue it is at
  // ("Andrew's Kraken", not "Andrew's Trades"). Runs every boot rather than as
  // a one-shot migration, so a connection added later cannot drift back.
  await backfillConnectionLabels();
  // Re-seal any hand-entered (manual) connection whose stored payload predates
  // the current credentials key. Those hold no credential to re-enter, so they
  // are repaired here rather than being reset like a broker connection.
  await repairManualConnectionSecrets();
  // Move each trader's single deposited/withdrawn figure onto per-account rows
  // (migration 0127). Here rather than in the migration because splitting one
  // summed figure needs to know which of their connections exist and which can
  // be synced. Idempotent — a trader who already has per-account rows is left
  // alone, so this does nothing from the second boot onwards.
  await backfillCapitalAccounts();
  // Seed the built-in example study game(s) into every team (idempotent; re-syncs
  // content when BAKED_IN_VERSION bumps). Brand-new teams created between deploys
  // get theirs lazily on their first Studies deck-list fetch (routes/studies.ts).
  await ensureBakedInGamesAllTeams();
  await seedWelcome();
  // Seed the built-in recognition badges (Early Release rocket, admin shield,
  // and the two membership badges).
  await seedBadges();
  // Publish any checked-in Developer Blog posts. This is how Claude Code writes
  // to that board — it edits devBlog/seeded.ts and the deploy publishes it, since
  // it has no session to post through at runtime. Keyed, so a restart updates
  // rather than duplicating.
  await seedDevBlog();
}

async function main() {
  if (config.isProd) {
    try {
      await bootstrapDatabase();
    } catch (err) {
      console.error('Database bootstrap failed:', err);
      process.exit(1);
    }
  }

  const app = await buildServer();
  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    app.log.info(`VTS terminal listening on port ${config.PORT}`);
    // Start the background market-news pollers (production only). Best-effort
    // and non-blocking: failures are contained and never affect serving.
    startFeeds();
    // Fill the Market Data macro cache (FRED) so the first person to open the
    // board does not pay a cold read of ~40 series. Fire-and-forget: a failure
    // just means the board takes the cold path on first request.
    warmMarketMacro();
    // Watch broker positions server-side so trade open/close push fires even
    // when no one has the Live Wall open (production + push configured only).
    startDeskWatch();
    // Watch Strategy Session windows so a trader's session open/close/pre-open
    // notifications fire on their own schedule (production + push/Pushover only).
    startSessionWatch();
    // Fire the rollover-close alerts around 5pm ET, but only for a trader who
    // actually has a funded position open (production + push/Pushover only).
    startRolloverWatch();
    // Remind a Founder about a trade invitation they have not answered. Reads
    // the workflow rows on every pass, so a Pushover acknowledgement buys quiet
    // until the next interval and never resolves anything (production +
    // push/Pushover only).
    startFounderTradeWatch();
    // Watch user-authored price alerts against live OANDA prices, firing each
    // trader's own level-cross notifications (production + push/Pushover only).
    startPriceAlertWatch();
    // Settle Trading Notes predictions whose deadline has passed, and stamp the
    // mark a call was made against when its window opens (production only). It
    // needs no delivery channel: settling is the work, the buzz is a courtesy.
    startNoteSettleWatch();
    // Refresh YouTube live status for the Market News stream wall and buzz
    // whoever armed a channel's bell (production + YOUTUBE_API_KEY only).
    startYoutubeWatch();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
