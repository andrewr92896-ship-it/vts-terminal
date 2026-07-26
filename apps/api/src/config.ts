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
  // AI usage guardrails (per user). The monthly cap resets at the start of each
  // Eastern-Time month; the per-minute limit smooths bursts. Keeps Claude use
  // from running up an unexpected bill.
  AI_MONTHLY_LIMIT: z.coerce.number().int().positive().default(1000),
  AI_RATE_PER_MIN: z.coerce.number().int().positive().default(15),
  // Shared secret that inbound TradingView alerts must include (TradingView
  // sends no auth of its own). When unset, the webhook rejects everything.
  TRADINGVIEW_WEBHOOK_SECRET: z.string().optional(),
  // Key used to encrypt per-user broker API credentials at rest. Optional —
  // falls back to a key derived from SESSION_SECRET. Set once and keep stable
  // (changing it makes stored credentials undecryptable).
  CREDENTIALS_KEY: z.string().optional(),
  // Web Push (VAPID) keys for phone push notifications. Generate once with
  // `npx web-push generate-vapid-keys` and set both. When unset, push features
  // report "not configured" and the rest of the app is unaffected. The subject
  // is a contact URL or mailto: the push services can reach if needed.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@vitalistradingsystems.com'),
  // Pushover application token (one per app, from pushover.net/apps/build). Each
  // trader connects their own Pushover "user key" in settings. When unset,
  // Pushover features report "not configured". Optional per-event sound name
  // (a built-in or a custom sound uploaded to the Pushover account); when blank,
  // the trader's own per-app sound choice in the Pushover app applies.
  PUSHOVER_APP_TOKEN: z.string().optional(),
  PUSHOVER_SOUND: z.string().optional(),
  // ---- Employee portal (/employee) ----
  // A deliberately separate, hardened surface with its own sessions. These knobs
  // are all "secure by default": the shipped values are the strict ones, and
  // loosening any of them is an explicit, deliberate act.
  //
  // Sessions here are short-lived on purpose: an absolute cap plus an idle
  // timeout, both far tighter than the 14-day main-portal session.
  EMPLOYEE_SESSION_HOURS: z.coerce.number().positive().max(24).default(8),
  EMPLOYEE_IDLE_MINUTES: z.coerce.number().int().positive().max(480).default(30),
  // Require a TOTP second factor. On by default — an employee who has not
  // enrolled one is walked through enrollment before they can reach anything.
  EMPLOYEE_REQUIRE_2FA: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // The company email domain. Reaching the employee portal requires a sign-in
  // email on this domain — an outside collaborator with a personal address can
  // never enter it, whatever roles they hold. Checked at sign-in AND on every
  // request, so changing someone's address takes effect immediately.
  EMPLOYEE_EMAIL_DOMAIN: z
    .string()
    .default('vitalistradingsystems.com')
    .transform((v) => v.trim().toLowerCase().replace(/^@/, '')),
  // Optional network fence. A comma-separated list of IPv4/IPv6 addresses or
  // CIDR ranges; when set, every /employee page load and /api/employee call from
  // outside the list is refused before authentication is even attempted. Unset
  // (the default) means no network restriction.
  EMPLOYEE_IP_ALLOWLIST: z.string().optional(),
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
