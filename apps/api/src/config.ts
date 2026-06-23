import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load apps/api/.env regardless of where the process was started from.
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(apiRoot, '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().default('file:./data/vts.db'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(14),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Claude / Anthropic. The key is optional — when absent, AI features report
  // "not configured" instead of failing. The site default is Sonnet; trade
  // screenshot analysis uses Opus 4.8 (vision).
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL_DEFAULT: z.string().default('claude-sonnet-4-6'),
  ANTHROPIC_MODEL_ANALYSIS: z.string().default('claude-opus-4-8'),
  // Shared secret that inbound TradingView alerts must include (TradingView
  // sends no auth of its own). When unset, the webhook rejects everything.
  TRADINGVIEW_WEBHOOK_SECRET: z.string().optional(),
  // Token that inbound /api/tv-webhook alerts must carry (set in Railway).
  // When unset, the endpoint rejects every request. Never logged.
  TV_WEBHOOK_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse({
  ...process.env,
  // In development, fall back to a fixed dev secret so the server still
  // boots before the user creates a .env. Production requires a real one.
  SESSION_SECRET:
    process.env.SESSION_SECRET ||
    (process.env.NODE_ENV === 'production'
      ? undefined
      : 'dev-only-insecure-session-secret-change-me'),
});

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

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
  apiRoot,
  databaseUrl: resolveDbUrl(parsed.data.DATABASE_URL),
  isProd: parsed.data.NODE_ENV === 'production',
};

export type AppConfig = typeof config;
