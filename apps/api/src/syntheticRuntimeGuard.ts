import path from 'node:path';

export const SYNTHETIC_RUNTIME_BOUNDARY = 'controlled-synthetic-runtime-handoff-v1';
export const SYNTHETIC_ASSERTION = 'disposable-only-no-real-data-v1';
export const SYNTHETIC_PROJECT_ID = '96a2b238-7ea0-47fc-8dc6-cd76639a15af';
export const SYNTHETIC_ENVIRONMENT_ID = '5d336031-9fda-47db-988c-4c6983a4b13a';
export const SYNTHETIC_SERVICE_ID = '11fb95c5-4e42-4181-91f8-0d7f32cb244b';
export const SYNTHETIC_SERVICE_INSTANCE_ID = 'ae8e2050-dc59-4114-8e20-f1e5641dc780';
export const SYNTHETIC_VOLUME_ID = 'd93c6198-8aba-4cf7-9d52-cad68fea7321';
export const SYNTHETIC_VOLUME_INSTANCE_ID = 'be5c2bd6-c802-47ac-beac-d19f7b420e3d';
export const SYNTHETIC_MOUNT_PATH =
  '/railway-synthetic-isolated/v1';
export const SYNTHETIC_BRANCH = 'codex/synthetic-volume-freshness-guard-v1';
export const SYNTHETIC_DATABASE_FILE = path.join(
  SYNTHETIC_MOUNT_PATH,
  'vts-synthetic-handoff-v1',
  'synthetic-handoff.db',
);

export const SYNTHETIC_RUNTIME_RULES = {
  MISSING_REQUIRED: 'G001_MISSING_REQUIRED',
  EXACT_MARKER_MISMATCH: 'G002_EXACT_MARKER_MISMATCH',
  NONCE_FORMAT_INVALID: 'G003_NONCE_FORMAT_INVALID',
  COMMIT_FORMAT_INVALID: 'G004_COMMIT_FORMAT_INVALID',
  PROTECTED_RESOURCE: 'G005_PROTECTED_RESOURCE',
  PUBLIC_EXPOSURE: 'G006_PUBLIC_EXPOSURE',
  ORIGIN_URL_INVALID: 'G007_ORIGIN_URL_INVALID',
  ORIGIN_NON_LOOPBACK: 'G008_ORIGIN_NON_LOOPBACK',
  EXTERNAL_INTEGRATION: 'G009_EXTERNAL_INTEGRATION',
  PROTECTED_VALUE_SIGNAL: 'G010_PROTECTED_VALUE_SIGNAL',
  DATABASE_NOT_LOCAL_FILE: 'G011_DATABASE_NOT_LOCAL_FILE',
  DATABASE_OUTSIDE_MOUNT: 'G012_DATABASE_OUTSIDE_MOUNT',
  DISPOSABLE_KEYS_MISSING: 'G013_DISPOSABLE_KEYS_MISSING',
  DISPOSABLE_KEYS_REUSED: 'G014_DISPOSABLE_KEYS_REUSED',
} as const;

export type SyntheticRuntimeRuleCode =
  (typeof SYNTHETIC_RUNTIME_RULES)[keyof typeof SYNTHETIC_RUNTIME_RULES];

export const SYNTHETIC_RUNTIME_DECISIONS = {
  RAILWAY_PRIVATE_CROSS_SERVICE_METADATA:
    'D010_RAILWAY_PRIVATE_CROSS_SERVICE_METADATA_ALLOWED',
} as const;

export type SyntheticRuntimeDecisionCode =
  (typeof SYNTHETIC_RUNTIME_DECISIONS)[keyof typeof SYNTHETIC_RUNTIME_DECISIONS];

// Railway's own CLI identifies this deprecated injected family by the exact
// RAILWAY_SERVICE_ prefix and _URL suffix. Keep the interior stricter than a
// wildcard so user/unknown names and malformed generated names fail closed.
const RAILWAY_CROSS_SERVICE_URL_NAME =
  /^RAILWAY_SERVICE_[A-Z0-9]+(?:_[A-Z0-9]+)*_URL$/;
const RAILWAY_PRIVATE_HOST =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.railway\.internal$/;

const PROTECTED_IDS = new Set([
  'cc2e7946-384f-4d79-abc6-b61964cee327',
  '784e4de9-66c5-4723-91bb-9ee00113383d',
]);
const FORBIDDEN_SIGNAL =
  /portal\.vitalistradingsystems\.com|vts-private-staging-data|\/data\/vts\.db|retained|real-candidate/i;
const INTEGRATION_KEYS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'RESEND_API_KEY',
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'YOUTUBE_API_KEY',
  'FRED_API_KEY',
  'PUSHOVER_APP_TOKEN',
  'VAPID_PRIVATE_KEY',
  'TRADINGVIEW_WEBHOOK_SECRET',
] as const;

// These names are public platform/application contract names. Anything not on
// this list is omitted from diagnostics, even when the value matched a rule.
const SAFE_DIAGNOSTIC_VARIABLE_NAMES = new Set([
  'VTS_RUNTIME_BOUNDARY',
  'VTS_SYNTHETIC_HANDOFF_ASSERTION',
  'VTS_SYNTHETIC_HANDOFF_NONCE',
  'VTS_SYNTHETIC_SERVICE_ID',
  'VTS_SYNTHETIC_SERVICE_INSTANCE_ID',
  'VTS_SYNTHETIC_VOLUME_ID',
  'VTS_SYNTHETIC_VOLUME_INSTANCE_ID',
  'VTS_SYNTHETIC_EXPECTED_BRANCH',
  'VTS_SYNTHETIC_EXPECTED_COMMIT',
  'NODE_ENV',
  'RAILWAY_PUBLIC_DOMAIN',
  'RAILWAY_PRIVATE_DOMAIN',
  'RAILWAY_TCP_PROXY_DOMAIN',
  'RAILWAY_TCP_PROXY_PORT',
  'RAILWAY_TCP_APPLICATION_PORT',
  'RAILWAY_PROJECT_NAME',
  'RAILWAY_PROJECT_ID',
  'RAILWAY_ENVIRONMENT_NAME',
  'RAILWAY_ENVIRONMENT_ID',
  'RAILWAY_SERVICE_NAME',
  'RAILWAY_SERVICE_ID',
  'RAILWAY_REPLICA_ID',
  'RAILWAY_REPLICA_REGION',
  'RAILWAY_DEPLOYMENT_ID',
  'RAILWAY_SNAPSHOT_ID',
  'RAILWAY_VOLUME_NAME',
  'RAILWAY_VOLUME_ID',
  'RAILWAY_VOLUME_MOUNT_PATH',
  'RAILWAY_GIT_COMMIT_SHA',
  'RAILWAY_GIT_AUTHOR',
  'RAILWAY_GIT_BRANCH',
  'RAILWAY_GIT_REPO_NAME',
  'RAILWAY_GIT_REPO_OWNER',
  'RAILWAY_GIT_COMMIT_MESSAGE',
  'RAILWAY_STATIC_URL',
  'PRIVATE_DATABASE_URL',
  'DATABASE_URL',
  'PRIVATE_PORTAL_ORIGIN',
  'WEB_ORIGIN',
]);

export class SyntheticRuntimeGuardError extends Error {
  readonly rule: SyntheticRuntimeRuleCode;
  readonly variableName?: string;

  constructor(rule: SyntheticRuntimeRuleCode, key?: string) {
    const variableName = key && SAFE_DIAGNOSTIC_VARIABLE_NAMES.has(key) ? key : undefined;
    super(
      'Synthetic handoff refused [' + rule + ']' +
        (variableName ? ' variable=' + variableName : ''),
    );
    this.name = 'SyntheticRuntimeGuardError';
    this.rule = rule;
    this.variableName = variableName;
  }
}

function refuse(rule: SyntheticRuntimeRuleCode, key?: string): never {
  throw new SyntheticRuntimeGuardError(rule, key);
}

function required(env: NodeJS.ProcessEnv, key: string, expected?: string): string {
  const value = env[key]?.trim();
  if (!value) refuse(SYNTHETIC_RUNTIME_RULES.MISSING_REQUIRED, key);
  if (expected != null && value !== expected) {
    refuse(SYNTHETIC_RUNTIME_RULES.EXACT_MARKER_MISMATCH, key);
  }
  return value;
}

function assertLoopbackOrigin(value: string, key: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    refuse(SYNTHETIC_RUNTIME_RULES.ORIGIN_URL_INVALID, key);
  }
  if (
    parsed.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname)
  ) {
    refuse(SYNTHETIC_RUNTIME_RULES.ORIGIN_NON_LOOPBACK, key);
  }
}

function isRailwayPrivateNetworkReference(value: string): boolean {
  if (!value || value !== value.trim()) return false;
  if (RAILWAY_PRIVATE_HOST.test(value)) return true;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  const port = parsed.port ? Number(parsed.port) : undefined;
  return (
    parsed.protocol === 'http:' &&
    !parsed.username &&
    !parsed.password &&
    RAILWAY_PRIVATE_HOST.test(parsed.hostname) &&
    (port == null || (Number.isInteger(port) && port >= 1 && port <= 65535)) &&
    (parsed.pathname === '' || parsed.pathname === '/') &&
    !parsed.search &&
    !parsed.hash
  );
}

export interface ControlledSyntheticRuntime {
  databaseFile: string;
  decisions: SyntheticRuntimeDecisionCode[];
  expectedCommit: string;
  nonce: string;
}

export function assertControlledSyntheticRuntime(
  env: NodeJS.ProcessEnv = process.env,
): ControlledSyntheticRuntime {
  const decisions = new Set<SyntheticRuntimeDecisionCode>();
  required(env, 'VTS_RUNTIME_BOUNDARY', SYNTHETIC_RUNTIME_BOUNDARY);
  required(env, 'VTS_SYNTHETIC_HANDOFF_ASSERTION', SYNTHETIC_ASSERTION);
  const nonce = required(env, 'VTS_SYNTHETIC_HANDOFF_NONCE');
  if (!/^[0-9a-f]{32,128}$/i.test(nonce)) {
    refuse(SYNTHETIC_RUNTIME_RULES.NONCE_FORMAT_INVALID, 'VTS_SYNTHETIC_HANDOFF_NONCE');
  }

  required(env, 'NODE_ENV', 'production');
  required(env, 'RAILWAY_PROJECT_ID', SYNTHETIC_PROJECT_ID);
  required(env, 'RAILWAY_ENVIRONMENT_ID', SYNTHETIC_ENVIRONMENT_ID);
  required(env, 'RAILWAY_SERVICE_ID', SYNTHETIC_SERVICE_ID);
  required(env, 'VTS_SYNTHETIC_SERVICE_ID', SYNTHETIC_SERVICE_ID);
  required(env, 'VTS_SYNTHETIC_SERVICE_INSTANCE_ID', SYNTHETIC_SERVICE_INSTANCE_ID);
  required(env, 'RAILWAY_VOLUME_ID', SYNTHETIC_VOLUME_ID);
  required(env, 'VTS_SYNTHETIC_VOLUME_ID', SYNTHETIC_VOLUME_ID);
  required(env, 'VTS_SYNTHETIC_VOLUME_INSTANCE_ID', SYNTHETIC_VOLUME_INSTANCE_ID);
  required(env, 'RAILWAY_VOLUME_MOUNT_PATH', SYNTHETIC_MOUNT_PATH);
  required(env, 'VTS_SYNTHETIC_EXPECTED_BRANCH', SYNTHETIC_BRANCH);
  required(env, 'RAILWAY_GIT_BRANCH', SYNTHETIC_BRANCH);

  const expectedCommit = required(env, 'VTS_SYNTHETIC_EXPECTED_COMMIT');
  required(env, 'RAILWAY_GIT_COMMIT_SHA', expectedCommit);
  if (!/^[0-9a-f]{40}$/i.test(expectedCommit)) {
    refuse(SYNTHETIC_RUNTIME_RULES.COMMIT_FORMAT_INVALID, 'VTS_SYNTHETIC_EXPECTED_COMMIT');
  }

  for (const id of PROTECTED_IDS) {
    if (
      env.RAILWAY_SERVICE_ID === id ||
      env.RAILWAY_VOLUME_ID === id ||
      env.VTS_SYNTHETIC_SERVICE_ID === id ||
      env.VTS_SYNTHETIC_VOLUME_ID === id
    ) {
      refuse(SYNTHETIC_RUNTIME_RULES.PROTECTED_RESOURCE);
    }
  }

  for (const key of [
    'RAILWAY_PUBLIC_DOMAIN',
    'RAILWAY_STATIC_URL',
    'RAILWAY_TCP_PROXY_DOMAIN',
    'RAILWAY_TCP_PROXY_PORT',
    'RAILWAY_TCP_APPLICATION_PORT',
  ] as const) {
    if (env[key]?.trim()) refuse(SYNTHETIC_RUNTIME_RULES.PUBLIC_EXPOSURE, key);
  }
  for (const key of ['PRIVATE_PORTAL_ORIGIN', 'WEB_ORIGIN'] as const) {
    const value = env[key]?.trim();
    if (value) assertLoopbackOrigin(value, key);
  }
  for (const key of INTEGRATION_KEYS) {
    if (env[key]?.trim()) {
      refuse(SYNTHETIC_RUNTIME_RULES.EXTERNAL_INTEGRATION, key);
    }
  }

  for (const [key, value] of Object.entries(env)) {
    if (!value?.trim()) continue;
    if (RAILWAY_CROSS_SERVICE_URL_NAME.test(key)) {
      if (!isRailwayPrivateNetworkReference(value)) {
        refuse(SYNTHETIC_RUNTIME_RULES.PROTECTED_VALUE_SIGNAL, key);
      }
      decisions.add(SYNTHETIC_RUNTIME_DECISIONS.RAILWAY_PRIVATE_CROSS_SERVICE_METADATA);
      continue;
    }
    // The same private reference under a user, integration, database, or
    // otherwise unknown name is operational configuration, not inert metadata.
    if (key !== 'RAILWAY_PRIVATE_DOMAIN' && isRailwayPrivateNetworkReference(value)) {
      refuse(SYNTHETIC_RUNTIME_RULES.PROTECTED_VALUE_SIGNAL, key);
    }
    if (FORBIDDEN_SIGNAL.test(value)) {
      refuse(SYNTHETIC_RUNTIME_RULES.PROTECTED_VALUE_SIGNAL, key);
    }
  }

  const databaseUrl = required(env, 'PRIVATE_DATABASE_URL');
  if (!databaseUrl.startsWith('file:')) {
    refuse(SYNTHETIC_RUNTIME_RULES.DATABASE_NOT_LOCAL_FILE, 'PRIVATE_DATABASE_URL');
  }
  const databaseFile = path.resolve(databaseUrl.slice('file:'.length));
  if (databaseFile !== SYNTHETIC_DATABASE_FILE) {
    refuse(SYNTHETIC_RUNTIME_RULES.DATABASE_OUTSIDE_MOUNT, 'PRIVATE_DATABASE_URL');
  }
  required(env, 'DATABASE_URL', databaseUrl);
  if (!env.CREDENTIALS_KEY?.trim() || !env.PRIVATE_SESSION_SECRET?.trim()) {
    refuse(SYNTHETIC_RUNTIME_RULES.DISPOSABLE_KEYS_MISSING);
  }
  if (env.CREDENTIALS_KEY === env.PRIVATE_SESSION_SECRET) {
    refuse(SYNTHETIC_RUNTIME_RULES.DISPOSABLE_KEYS_REUSED);
  }

  return { databaseFile, decisions: [...decisions], expectedCommit, nonce };
}

export function controlledSyntheticTestEnv(
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const databaseUrl = 'file:' + SYNTHETIC_DATABASE_FILE;
  return {
    VTS_RUNTIME_BOUNDARY: SYNTHETIC_RUNTIME_BOUNDARY,
    VTS_SYNTHETIC_HANDOFF_ASSERTION: SYNTHETIC_ASSERTION,
    VTS_SYNTHETIC_HANDOFF_NONCE: '0123456789abcdef0123456789abcdef',
    VTS_SYNTHETIC_SERVICE_ID: SYNTHETIC_SERVICE_ID,
    VTS_SYNTHETIC_SERVICE_INSTANCE_ID: SYNTHETIC_SERVICE_INSTANCE_ID,
    VTS_SYNTHETIC_VOLUME_ID: SYNTHETIC_VOLUME_ID,
    VTS_SYNTHETIC_VOLUME_INSTANCE_ID: SYNTHETIC_VOLUME_INSTANCE_ID,
    VTS_SYNTHETIC_EXPECTED_BRANCH: SYNTHETIC_BRANCH,
    VTS_SYNTHETIC_EXPECTED_COMMIT: '1111111111111111111111111111111111111111',
    NODE_ENV: 'production',
    RAILWAY_PROJECT_ID: SYNTHETIC_PROJECT_ID,
    RAILWAY_ENVIRONMENT_ID: SYNTHETIC_ENVIRONMENT_ID,
    RAILWAY_SERVICE_ID: SYNTHETIC_SERVICE_ID,
    RAILWAY_VOLUME_ID: SYNTHETIC_VOLUME_ID,
    RAILWAY_VOLUME_MOUNT_PATH: SYNTHETIC_MOUNT_PATH,
    RAILWAY_GIT_BRANCH: SYNTHETIC_BRANCH,
    RAILWAY_GIT_COMMIT_SHA: '1111111111111111111111111111111111111111',
    PRIVATE_DATABASE_URL: databaseUrl,
    DATABASE_URL: databaseUrl,
    PRIVATE_PORTAL_ORIGIN: 'http://127.0.0.1',
    WEB_ORIGIN: 'http://127.0.0.1',
    CREDENTIALS_KEY: 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=',
    PRIVATE_SESSION_SECRET: 'synthetic-session-secret-only-000000000000000000000000',
    ...overrides,
  };
}
