// Environment validation, kept apart from `config.ts` so it can be run WITHOUT
// starting the server — see `npm run preflight`.
//
// Why this file exists at all: the boot checks used to sit inline in config.ts
// and call `process.exit(1)` on the first thing they found. Four of them in a
// row, so an operator repairing a production deployment discovered the problems
// one at a time — set a variable, redeploy, hit the next — and on a host that
// replaces a healthy container with a new one, every discovery is an outage.
//
// So the rule here is: COLLECT, NEVER EXIT. Nothing in this file exits, throws
// on a bad environment, connects to anything, or reads the database. It answers
// one question — "would this environment boot, and what would it complain
// about?" — and hands every answer back at once. `config.ts` prints them and
// exits once; `preflight.ts` prints them and exits with a status.
import { z } from 'zod';
import { DEV_SESSION_SECRET, resolveCredentialsMaterial } from './security/credentialsKey.js';

// An optional string in which "" means "not set". Hosting dashboards hand you a
// blank value the moment somebody adds a variable and tabs away, and a blank is
// almost never what was meant — it is an unfinished edit, not a setting.
const blankAsUnset = z
  .string()
  .optional()
  .transform((v) => {
    const t = v?.trim();
    return t ? t : undefined;
  });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().default('file:./data/vts.db'),
  PRIVATE_DATABASE_URL: blankAsUnset,
  PRIVATE_PORTAL_ORIGIN: blankAsUnset,
  PRIVATE_SESSION_SECRET: blankAsUnset,
  PRIVATE_SESSION_COOKIE: blankAsUnset,
  PRIVATE_ACCESS_USER_IDS: blankAsUnset,
  PRIVATE_BOOTSTRAP_ADMIN_ID: blankAsUnset.pipe(z.string().uuid().optional()),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(14),
  // Main terminal email second factor. Off until a deployment has a verified
  // mail provider; private and public deployments enable it independently.
  AUTH_REQUIRE_2FA: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  AUTH_2FA_CODE_TTL_MINUTES: z.coerce.number().int().min(5).max(30).default(10),
  AUTH_2FA_REMEMBER_DAYS: z.coerce.number().int().min(1).max(30).default(30),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Self-service recovery credentials. Fifteen minutes is deliberately short:
  // the plaintext travels through email and is only a bridge into the forced
  // Change Password screen. Values outside 5–30 minutes are configuration
  // errors rather than a silent weakening of the recovery window.
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(30).default(15),
  // Claude / Anthropic. The key is optional — when absent, AI features report
  // "not configured" instead of failing. The site default is Sonnet; trade
  // screenshot analysis uses a separate vision model (see below).
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL_DEFAULT: z.string().default('claude-sonnet-4-6'),
  // Vision / screenshot parsing. Sonnet 5 rather than Opus: reading a trade off
  // a broker screenshot is structured extraction, not hard reasoning, and Sonnet
  // 5 is the first Sonnet-tier model with high-resolution vision (2576px long
  // edge) — so there is no capability loss on a screenshot, at $3/$15 per
  // million tokens against Opus's $5/$25. Env-overridable, so going back to Opus
  // is a variable change on the host rather than a redeploy.
  ANTHROPIC_MODEL_ANALYSIS: z.string().default('claude-sonnet-5'),
  // WHICH PROVIDER SERVES THE SIX MODEL CALLS. Defaults to `anthropic`, which
  // is exactly what the terminal did before OpenAI existed here — so deploying
  // this changes nothing until somebody sets the variable. Switching is a host
  // variable and a restart rather than a redeploy, and so is switching back,
  // which is the property that makes the migration testable one flow at a time.
  AI_PROVIDER: z.enum(['anthropic', 'openai']).default('anthropic'),
  OPENAI_API_KEY: z.string().optional(),
  // gpt-4.1-mini for BOTH text and screenshots, deliberately.
  //
  // It reads a broker screenshot at roughly a seventh of the input cost and a
  // ninth of the output cost of the Sonnet tier above, and the extraction work
  // here is structured reading rather than hard reasoning. More importantly it
  // supports the API's own JSON mode, so a screenshot parse can no longer come
  // back as prose the parser has to dig JSON out of — which is the failure the
  // owner actually hit: a trade pasted the same way as always, suddenly unread.
  //
  // gpt-4.1-nano is cheaper again and is a reasonable thing to try once this is
  // proven, which is why the model is its own variable rather than a literal.
  OPENAI_MODEL_DEFAULT: z.string().default('gpt-4.1-mini'),
  OPENAI_MODEL_ANALYSIS: z.string().default('gpt-4.1-mini'),
  // Points at a compatible gateway or a proxy when one is in front of OpenAI.
  OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  // AI usage guardrails (per user). Text keeps a durable monthly cap that resets
  // at the start of each Eastern-Time month. Screenshot-to-trade calls are
  // metered but not monthly-capped; the shared per-minute limiter bounds bursts
  // across both text and vision.
  AI_MONTHLY_LIMIT: z.coerce.number().int().positive().default(1000),
  AI_RATE_PER_MIN: z.coerce.number().int().positive().default(15),
  // Shared secret that inbound TradingView alerts must include (TradingView
  // sends no auth of its own). When unset, the webhook rejects everything.
  TRADINGVIEW_WEBHOOK_SECRET: z.string().optional(),
  // Key used to encrypt per-user broker API credentials at rest. REQUIRED in
  // production, and separate from SESSION_SECRET on purpose — one secret must
  // not protect both sessions and every broker key on the desk.
  //
  // It must be 32+ bytes of GENERATED randomness, base64 or hex; a passphrase is
  // refused at boot (see security/credentialsKey.ts for why the answer is an
  // unguessable key rather than a slow KDF). Generate one with:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  // Set it once and keep it stable — changing it makes stored credentials
  // unreadable, and every trader has to re-enter them.
  //
  // Blank counts as unset: a hosting dashboard hands you an empty string the
  // moment somebody creates the variable and tabs away, and an empty key must
  // fail the guard below rather than be hashed as if it were one.
  CREDENTIALS_KEY: blankAsUnset,
  // Web Push (VAPID) keys for phone push notifications. Generate once with
  // `npx web-push generate-vapid-keys` and set both. When unset, push features
  // report "not configured" and the rest of the app is unaffected. The subject
  // is a contact URL or mailto: the push services can reach if needed.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@vitalistradingsystems.com'),
  // YouTube Data API key, for the Market News live-stream wall: resolves a
  // channel @handle to its UC… id and reads live status / stream title /
  // viewer counts. Optional — with no key every channel reads offline and the
  // screen marks live-state as sample rather than faking it (channels that
  // carry an id still embed the keyless player). Quota is the real constraint:
  // the default budget is 10,000 units/day and the live-search costs 100 per
  // channel per sweep, so the watch refreshes a few channels per tick and stops
  // for the day once YOUTUBE_DAILY_QUOTA units are spent.
  YOUTUBE_API_KEY: blankAsUnset,
  // FRED (St. Louis Fed) API key, for the macro half of the Market Data board —
  // policy rates, CPI, payrolls, the Treasury curve, the Fed balance sheet.
  // OPTIONAL, and the board reads live without it: the FRED chart-download CSV
  // is keyless, so an unset key costs reliability rather than the feature. Set
  // it (free, instant, from fred.stlouisfed.org/docs/api/api_key.html) to use
  // the documented JSON API instead. A key that is set but rejected falls back
  // to the keyless read rather than blanking the board.
  FRED_API_KEY: blankAsUnset,
  // Pushover application token (one per app, from pushover.net/apps/build). Each
  // trader connects their own Pushover "user key" in settings. When unset,
  // Pushover features report "not configured". Optional per-event sound name
  // (a built-in or a custom sound uploaded to the Pushover account); when blank,
  // the trader's own per-app sound choice in the Pushover app applies.
  PUSHOVER_APP_TOKEN: z.string().optional(),
  PUSHOVER_SOUND: z.string().optional(),
  // The public origin Pushover should POST to when somebody acknowledges a
  // repeating alert on their phone. Optional, and it degrades cleanly: with no
  // reachable URL the terminal simply never learns about a phone-side
  // acknowledgement, so its own Acknowledge button stays the way to clear the
  // banner. Falls back to WEB_ORIGIN when that is a real public address —
  // localhost is skipped rather than sent, since Pushover cannot reach it.
  PUSHOVER_CALLBACK_ORIGIN: z.string().optional(),
  // Outbound email (SMTP) — used by Employee Portal sign-in codes and main
  // terminal password recovery. Optional: when unset, an employee code is printed to the
  // server log instead of emailed (same "printed once to logs" fallback as an
  // unset ADMIN_PASSWORD), so a misconfigured deploy cannot lock everyone out.
  // Password recovery NEVER uses that fallback: its route requires a configured
  // transport before it creates or sends a temporary credential.
  //
  // Every one of these treats a BLANK value as "not set". That is not
  // decoration: a hosting dashboard makes it very easy to create a variable and
  // leave its box empty, and `.default()` only fires when a variable is absent
  // entirely — an empty string sails straight through it. A blank SMTP_FROM
  // would therefore beat the default below and send every code with an empty
  // From header, which mail servers reject, producing "the code could not be
  // emailed" against otherwise perfect settings.
  SMTP_HOST: blankAsUnset,
  SMTP_PORT: z.coerce.number().int().positive().catch(587).default(587),
  SMTP_USER: blankAsUnset,
  SMTP_PASS: blankAsUnset,
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .catch('false')
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_FROM: blankAsUnset.pipe(
    z.string().default('"Vitalis Trading Systems" <no-reply@vitalistradingsystems.com>'),
  ),
  // Resend (https://resend.com) — an HTTPS send API on port 443, and the
  // preferred transport. Most PaaS hosts block outbound SMTP (Railway blocks
  // 25/465/587/2525 below its Pro plan), which shows up as a connection timeout
  // rather than any error from the mail provider, because the provider is never
  // reached. Port 443 cannot be blocked without breaking the app itself.
  // When set, this wins over the SMTP_* settings.
  RESEND_API_KEY: blankAsUnset,
  // The From header for whichever transport is in use. Falls back to SMTP_FROM
  // so an existing SMTP deployment keeps working untouched. With Resend this
  // address must be on a domain verified in the Resend dashboard.
  MAIL_FROM: blankAsUnset,
  // ---- Employee portal (/employee) ----
  // A deliberately separate, hardened surface with its own sessions. These knobs
  // are all "secure by default": the shipped values are the strict ones, and
  // loosening any of them is an explicit, deliberate act.
  //
  // Sessions here are short-lived on purpose: an absolute cap plus an idle
  // timeout, both far tighter than the 14-day main-terminal session.
  EMPLOYEE_SESSION_HOURS: z.coerce.number().positive().max(24).default(8),
  EMPLOYEE_IDLE_MINUTES: z.coerce.number().int().positive().max(480).default(30),
  // Require an emailed sign-in code as a second factor. On by default — every
  // sign-in (from a device not currently remembered) sends a fresh code to the
  // employee's company sign-in email before a session goes active.
  EMPLOYEE_REQUIRE_2FA: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // How long a sign-in code stays valid after it is sent.
  EMPLOYEE_OTP_TTL_MINUTES: z.coerce.number().int().positive().max(60).default(10),
  // "Remember this device" — how long a device that confirmed a code may skip
  // the next one. Opt-in at sign-in time; the browser holds a separate,
  // longer-lived trust cookie for it.
  EMPLOYEE_REMEMBER_DEVICE_DAYS: z.coerce.number().int().positive().max(30).default(30),
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

export type EnvSchema = typeof envSchema;
export type EnvData = z.infer<typeof envSchema>;

export type EnvProblem = {
  /** The variable at fault, where one variable is at fault. */
  variable?: string;
  /** What is wrong, in a sentence an operator can act on. */
  message: string;
  /** The command or dashboard change that fixes it, where there is one. */
  fix?: string;
};

export type EnvReport = {
  ok: boolean;
  /** Parsed config — present whenever the schema itself parsed, even if a later check failed. */
  data?: EnvData;
  problems: EnvProblem[];
  warnings: string[];
};

/**
 * Check an environment without touching anything.
 *
 * `raw` is normally `process.env`. It is a parameter so preflight can be handed
 * a different environment, and so this is testable.
 */
export function checkEnvironment(raw: NodeJS.ProcessEnv = process.env): EnvReport {
  const problems: EnvProblem[] = [];
  const warnings: string[] = [];

  const isProd = raw.NODE_ENV === 'production';

  const parsed = envSchema.safeParse({
    ...raw,
    // In development, fall back to a fixed dev secret so the server still
    // boots before the user creates a .env. Production requires a real one.
    SESSION_SECRET:
      raw.PRIVATE_SESSION_SECRET || raw.SESSION_SECRET || (isProd ? undefined : DEV_SESSION_SECRET),
  });

  if (!parsed.success) {
    // Every field at once, rather than the first one zod happens to report.
    for (const [variable, messages] of Object.entries(parsed.error.flatten().fieldErrors)) {
      for (const message of messages ?? []) problems.push({ variable, message });
    }
    // Nothing below can run without parsed values, so this is the one place the
    // report is necessarily incomplete — and it says so.
    return { ok: false, problems, warnings };
  }

  const data = parsed.data;

  // The private portal's allowlist. Without it every account on the database
  // could sign in to the private terminal, so production refuses to start.
  if (data.NODE_ENV === 'production' && !data.PRIVATE_ACCESS_USER_IDS) {
    problems.push({
      variable: 'PRIVATE_ACCESS_USER_IDS',
      message: 'PRIVATE_ACCESS_USER_IDS is required for the private portal in production.',
      fix: 'Set it to a comma-separated list of the account IDs allowed in. Admin ▸ Users shows each account ID with a copy button.',
    });
  }

  // A bootstrap admin who is not on the allowlist would be created and then
  // refused at the door. Worth shouting about — but a WARNING, not a refusal to
  // start, and the difference matters more than it looks.
  //
  // `seedAdmin` reads this variable only when the admin account does not already
  // exist; on an installation that has one it returns before ever looking. So on
  // every deployment that is actually running, exiting here would take a healthy
  // service down to complain about a setting that has no effect on it. That is
  // the exact shape of the outage this whole module was written after.
  //
  // The condition it describes is also self-announcing on the install where it
  // DOES apply: a fresh environment whose seeded admin cannot sign in. Visible,
  // recoverable, and cheap. An outage is none of those.
  //
  // PRIVATE_ACCESS_USER_IDS above stays fatal, deliberately: that one IS the
  // boundary, and a portal running without it admits every account in the
  // database. Missing security beats broken uptime; a misconfigured seed does
  // not.
  if (data.NODE_ENV === 'production' && data.PRIVATE_BOOTSTRAP_ADMIN_ID) {
    const admittedIds = new Set(
      (data.PRIVATE_ACCESS_USER_IDS ?? '').split(',').map((value) => value.trim()).filter(Boolean),
    );
    if (!admittedIds.has(data.PRIVATE_BOOTSTRAP_ADMIN_ID)) {
      warnings.push(
        `PRIVATE_BOOTSTRAP_ADMIN_ID (${data.PRIVATE_BOOTSTRAP_ADMIN_ID}) does not appear in ` +
          'PRIVATE_ACCESS_USER_IDS. It is only used when seeding the first admin on an empty ' +
          'database — harmless here if an admin already exists, but that seeded account would ' +
          'be unable to sign in. Add it to the allowlist, or remove the variable.',
      );
    }
  }

  // ---- broker credential key ----
  //
  // Checked here rather than at first use so a misconfigured deploy is caught
  // before it starts, not the first time somebody opens the Live Wall — which
  // reads as a broker outage.
  //
  // The old behaviour is what makes this worth failing over: CREDENTIALS_KEY was
  // optional and fell back to SESSION_SECRET, and SESSION_SECRET itself fell back
  // to a literal in this repository whenever NODE_ENV was not "production" — so a
  // deploy that set neither booted happily and encrypted every broker credential
  // under a published string.
  const resolved = resolveCredentialsMaterial({
    credentialsKey: data.CREDENTIALS_KEY,
    sessionSecret: data.SESSION_SECRET,
    isProd: data.NODE_ENV === 'production',
  });
  if (!resolved.ok) {
    // No `fix` here — resolveCredentialsMaterial's own message already carries
    // the command, and restating it would print it twice.
    problems.push({ variable: 'CREDENTIALS_KEY', message: resolved.message });
  } else if (resolved.warning) {
    warnings.push(resolved.warning);
  }

  return { ok: problems.length === 0, data, problems, warnings };
}

/** Render a report as the lines to print. Shared so boot and preflight read alike. */
export function formatEnvReport(report: EnvReport): string[] {
  const lines: string[] = [];
  for (const warning of report.warnings) lines.push(`[config] WARNING: ${warning}`);
  if (report.problems.length === 0) return lines;
  lines.push(
    report.problems.length === 1
      ? '[config] The environment has 1 problem:'
      : `[config] The environment has ${report.problems.length} problems:`,
  );
  for (const problem of report.problems) {
    lines.push(`  - ${problem.variable ? `${problem.variable}: ` : ''}${problem.message}`);
    if (problem.fix) lines.push(`      fix: ${problem.fix}`);
  }
  return lines;
}
