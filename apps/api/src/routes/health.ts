import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

// The commit this process was built from.
//
// `version` below is the package version and has not moved in a long time, so it
// cannot answer the question anybody actually asks of a health endpoint: is the
// build I just merged the one that is running? That went unanswerable for two
// releases — the terminal kept drawing an older version pill and there was no way
// to tell a stale browser from a deploy that had not landed, because the only
// version on the page came from the cached bundle and the only version from the
// server was a constant.
//
// Read from the platform rather than mirrored from the web app's APP_VERSION: a
// second copy of that constant is a thing to forget to bump, and the commit is
// what a deploy is actually identified by. Railway sets the first of these; the
// others are the common spellings elsewhere. Unknown when nothing set one, which
// is the honest answer for a local run.
function builtFrom(): string {
  const sha =
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    process.env.SOURCE_COMMIT ||
    process.env.COMMIT_SHA;
  return sha ? sha.slice(0, 7) : 'unknown';
}

export async function healthRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => {
    return {
      status: 'ok',
      env: config.NODE_ENV,
      time: new Date().toISOString(),
      version: '0.2.0',
      commit: builtFrom(),
    };
  });
}
