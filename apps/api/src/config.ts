import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { checkEnvironment, formatEnvReport } from './configChecks.js';

// Load apps/api/.env regardless of where the process was started from.
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(apiRoot, '.env') });

// Every check lives in configChecks.ts and COLLECTS rather than exits, so this
// prints the whole list once instead of dying on the first thing it finds. An
// operator repairing production sees every variable in one pass; `npm run
// preflight` runs the identical checks without starting the server.
const report = checkEnvironment(process.env);
for (const line of formatEnvReport(report)) {
  (report.problems.length ? console.error : console.warn)(line);
}
if (!report.ok || !report.data) process.exit(1);
const parsed = { data: report.data };

// Resolve a relative file: URL against the api root so it works no matter
// the current working directory.
function resolveDbUrl(url: string): string {
  if (url.startsWith('file:')) {
    const raw = url.slice('file:'.length);
    if (!path.isAbsolute(raw)) {
      return 'file:' + path.join(apiRoot, raw);
    }
  }
  return url;
}

export const config = {
  ...parsed.data,
  WEB_ORIGIN: parsed.data.PRIVATE_PORTAL_ORIGIN ?? parsed.data.WEB_ORIGIN,
  SESSION_SECRET: parsed.data.PRIVATE_SESSION_SECRET ?? parsed.data.SESSION_SECRET,
  PRIVATE_SESSION_COOKIE:
    parsed.data.PRIVATE_SESSION_COOKIE ??
    (parsed.data.NODE_ENV === 'production' ? '__Host-vts_portal_session' : 'vts_portal_session'),
  apiRoot,
  databaseUrl: resolveDbUrl(parsed.data.PRIVATE_DATABASE_URL ?? parsed.data.DATABASE_URL),
  isProd: parsed.data.NODE_ENV === 'production',
};

export type AppConfig = typeof config;
