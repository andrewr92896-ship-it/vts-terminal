import './types.js';
import path from 'node:path';
import fs from 'node:fs';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { loadUser } from './auth/middleware.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { brokerRoutes } from './routes/brokers.js';
import { healthRoutes } from './routes/health.js';
import { todoRoutes } from './routes/todo.js';
import { kiaRoutes } from './routes/kia.js';
import { wealthRoutes } from './routes/wealth.js';
import { tradingRoutes } from './routes/trading.js';
import { webhookRoutes } from './routes/webhooks.js';
import { runMigrations } from './db/migrate.js';
import { seedAdmin } from './seed.js';

// In production the backend also serves the built React app (apps/web/dist),
// so the whole portal runs as one service.
const WEB_DIST = path.resolve(config.apiRoot, '..', 'web', 'dist');

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: config.isProd ? 'info' : 'debug',
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

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(adminRoutes);
  await app.register(brokerRoutes);
  await app.register(tradingRoutes);
  await app.register(webhookRoutes);
  await app.register(todoRoutes);
  await app.register(kiaRoutes);
  await app.register(wealthRoutes);

  // Serve the built frontend and fall back to index.html for client routes.
  // Only when the build exists (production / after `npm run build`).
  if (fs.existsSync(path.join(WEB_DIST, 'index.html'))) {
    await app.register(fastifyStatic, { root: WEB_DIST, wildcard: false });
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
  await runMigrations();
  await seedAdmin();
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
    app.log.info(`VTS portal listening on port ${config.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
