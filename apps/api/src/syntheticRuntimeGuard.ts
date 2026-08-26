import path from 'node:path';

export const SYNTHETIC_RUNTIME_BOUNDARY = 'controlled-synthetic-runtime-handoff-v1';
export const SYNTHETIC_ASSERTION = 'disposable-only-no-real-data-v1';
export const SYNTHETIC_PROJECT_ID = 'c189b759-0501-4011-9403-0de87242c7e6';
export const SYNTHETIC_ENVIRONMENT_ID = 'dda589ea-dace-47e7-93fa-23e29cbcb0a6';
export const SYNTHETIC_SERVICE_ID = 'fefd4df7-64c7-434e-bbf0-13fcabb62eec';
export const SYNTHETIC_SERVICE_INSTANCE_ID = '910a3ac3-faef-459d-ab89-d2c13d137292';
export const SYNTHETIC_VOLUME_ID = '9614285f-6810-49dd-b8a6-6f0a4676c7ac';
export const SYNTHETIC_VOLUME_INSTANCE_ID = 'f4a403d6-a9e8-4180-8f8f-03639cb75edc';
export const SYNTHETIC_MOUNT_PATH =
  '/railway-synthetic-candidate/handoff-20260826-092437';
export const SYNTHETIC_BRANCH = 'codex/private-staging-runtime-handoff';

const PROTECTED_IDS = new Set([
  'cc2e7946-384f-4d79-abc6-b61964cee327',
  '784e4de9-66c5-4723-91bb-9ee00113383d',
  '784e4de9-66c-4723-91bb-9ee00113383d',
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

export class SyntheticRuntimeGuardError extends Error {}

function required(env: NodeJS.ProcessEnv, key: string, expected?: string): string {
  const value = env[key]?.trim();
  if (!value) throw new SyntheticRuntimeGuardError('Synthetic handoff refused: missing ' + key);
  if (expected != null && value !== expected) {
    throw new SyntheticRuntimeGuardError('Synthetic handoff refused: ' + key + ' did not match');
  }
  return value;
}

function assertLoopbackOrigin(value: string, key: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new SyntheticRuntimeGuardError('Synthetic handoff refused: ' + key + ' is not a URL');
  }
  if (
    parsed.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname)
  ) {
    throw new SyntheticRuntimeGuardError(
      'Synthetic handoff refused: ' + key + ' must be a loopback HTTP origin',
    );
  }
}

export interface ControlledSyntheticRuntime {
  databaseFile: string;
  expectedCommit: string;
  nonce: string;
}

export function assertControlledSyntheticRuntime(
  env: NodeJS.ProcessEnv = process.env,
): ControlledSyntheticRuntime {
  required(env, 'VTS_RUNTIME_BOUNDARY', SYNTHETIC_RUNTIME_BOUNDARY);
  required(env, 'VTS_SYNTHETIC_HANDOFF_ASSERTION', SYNTHETIC_ASSERTION);
  const nonce = required(env, 'VTS_SYNTHETIC_HANDOFF_NONCE');
  if (!/^[0-9a-f]{32,128}$/i.test(nonce)) {
    throw new SyntheticRuntimeGuardError('Synthetic handoff refused: nonce format was invalid');
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
    throw new SyntheticRuntimeGuardError('Synthetic handoff refused: commit marker was invalid');
  }

  for (const id of PROTECTED_IDS) {
    if (
      env.RAILWAY_SERVICE_ID === id ||
      env.RAILWAY_VOLUME_ID === id ||
      env.VTS_SYNTHETIC_SERVICE_ID === id ||
      env.VTS_SYNTHETIC_VOLUME_ID === id
    ) {
      throw new SyntheticRuntimeGuardError('Synthetic handoff refused: protected resource');
    }
  }

  if (env.RAILWAY_PUBLIC_DOMAIN?.trim() || env.RAILWAY_STATIC_URL?.trim()) {
    throw new SyntheticRuntimeGuardError('Synthetic handoff refused: public exposure is configured');
  }
  for (const key of ['PRIVATE_PORTAL_ORIGIN', 'WEB_ORIGIN'] as const) {
    const value = env[key]?.trim();
    if (value) assertLoopbackOrigin(value, key);
  }
  for (const key of INTEGRATION_KEYS) {
    if (env[key]?.trim()) {
      throw new SyntheticRuntimeGuardError(
        'Synthetic handoff refused: external integration variable ' + key + ' is set',
      );
    }
  }

  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    if (FORBIDDEN_SIGNAL.test(value)) {
      throw new SyntheticRuntimeGuardError(
        'Synthetic handoff refused: forbidden protected/real-data signal in ' + key,
      );
    }
  }

  const databaseUrl = required(env, 'PRIVATE_DATABASE_URL');
  if (!databaseUrl.startsWith('file:')) {
    throw new SyntheticRuntimeGuardError('Synthetic handoff refused: database must be a local file');
  }
  const databaseFile = path.resolve(databaseUrl.slice('file:'.length));
  const expectedDatabase = path.join(SYNTHETIC_MOUNT_PATH, 'synthetic-handoff.db');
  if (databaseFile !== expectedDatabase) {
    throw new SyntheticRuntimeGuardError(
      'Synthetic handoff refused: database is outside the exact disposable mount',
    );
  }
  required(env, 'DATABASE_URL', databaseUrl);
  if (!env.CREDENTIALS_KEY?.trim() || !env.PRIVATE_SESSION_SECRET?.trim()) {
    throw new SyntheticRuntimeGuardError(
      'Synthetic handoff refused: disposable encryption/session keys are missing',
    );
  }
  if (env.CREDENTIALS_KEY === env.PRIVATE_SESSION_SECRET) {
    throw new SyntheticRuntimeGuardError(
      'Synthetic handoff refused: disposable keys must be independent',
    );
  }

  return { databaseFile, expectedCommit, nonce };
}

export function controlledSyntheticTestEnv(
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const databaseUrl = 'file:' + path.join(SYNTHETIC_MOUNT_PATH, 'synthetic-handoff.db');
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
