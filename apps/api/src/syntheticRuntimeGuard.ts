import path from 'node:path';

export const SYNTHETIC_RUNTIME_BOUNDARY = 'controlled-synthetic-runtime-handoff-v1';
export const SYNTHETIC_ASSERTION = 'disposable-only-no-real-data-v1';
export const SYNTHETIC_PROJECT_ID = '96a2b238-7ea0-47fc-8dc6-cd76639a15af';
export const SYNTHETIC_ENVIRONMENT_ID = '5d336031-9fda-47db-988c-4c6983a4b13a';
export const SYNTHETIC_BRANCH = 'codex/portable-synthetic-resource-guard-v1';
export const SYNTHETIC_REPOSITORY_OWNER = 'andrewr92896-ship-it';
export const SYNTHETIC_REPOSITORY_NAME = 'vts-terminal';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PROTECTED_IDS = new Set([
  // Protected staging and production.
  'c189b759-0501-4011-9403-0de87242c7e6',
  'dda589ea-dace-47e7-93fa-23e29cbcb0a6',
  'cc2e7946-384f-4d79-abc6-b61964cee327',
  '784e4de9-66c5-4723-91bb-9ee00113383d',
  '4e96a487-95b6-4b45-888e-5836f626c2da',
  'c97ea6bc-d9f1-4ae0-9ef4-4a5d564d2243',
  '68d656a4-0ad7-45ee-adaa-ea7b719f14a1',
  '97ce4869-8896-4365-ac05-dbb744a955c7',
  // Every previously claimed candidate or isolated resource.
  'fefd4df7-64c7-434e-bbf0-13fcabb62eec',
  '910a3ac3-faef-459d-ab89-d2c13d137292',
  '9614285f-6810-49dd-b8a6-6f0a4676c7ac',
  'f4a403d6-a9e8-4180-8f8f-03639cb75edc',
  '278b27cc-0fa9-4132-8951-ef4394990362',
  '8ac48429-7b56-49c3-baea-f3c2c2c638fa',
  '4764542c-7343-4fd3-933d-367098f5d81b',
  '3a2c92f0-34c5-4fa5-afe7-9b12dd7f0e1c',
  '99a64dd0-ad64-47e5-ad86-bb61d32a10eb',
  'f72ae2bc-00d1-4fc8-8290-581048481197',
  'c4225198-53d2-4687-b93a-ecb099f5afbd',
  'b5d23483-ff6b-43a3-ab9d-553186a5f338',
  '11fb95c5-4e42-4181-91f8-0d7f32cb244b',
  'ae8e2050-dc59-4114-8e20-f1e5641dc780',
  'd93c6198-8aba-4cf7-9d52-cad68fea7321',
  'be5c2bd6-c802-47ac-beac-d19f7b420e3d',
  'd82ce250-9358-49cb-9125-7e704f1171c7',
  '473691a8-d99b-4677-87e0-fee916eca252',
  '7a329d31-169e-46f2-9a6d-e6542b3f9bc5',
  'c2f9a095-9832-4bbc-812a-27560fdfc117',
  '65cada26-6b51-42b9-9985-54e2cbb2606c',
]);
const PROTECTED_MOUNT_ROOTS = [
  '/data',
  '/railway-synthetic-candidate/handoff-20260826-092437',
  '/railway-synthetic-candidate/pinned-20260826-105251',
  '/railway-synthetic-candidate/final-20260826t174608',
  '/railway-synthetic-isolated/v1',
  '/railway-synthetic-fixed/v1',
] as const;
export const SYNTHETIC_LAST_MIGRATION_INDEX = 137;
export const SYNTHETIC_LAST_MIGRATION_TAG = '0138_broker_credential_state';

export interface SyntheticMigrationJournalEntry {
  idx: number;
  when: number;
  tag: string;
}

export function assertExpectedSyntheticMigrationJournal(
  entries: readonly SyntheticMigrationJournalEntry[],
): SyntheticMigrationJournalEntry {
  const expectedLast = entries.at(-1);
  if (
    !expectedLast ||
    expectedLast.idx !== SYNTHETIC_LAST_MIGRATION_INDEX ||
    expectedLast.idx !== entries.length - 1 ||
    expectedLast.tag !== SYNTHETIC_LAST_MIGRATION_TAG
  ) {
    throw new Error('Synthetic handoff refused: unexpected migration journal head');
  }
  return expectedLast;
}

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
  IDENTITY_FORMAT_INVALID: 'G015_IDENTITY_FORMAT_INVALID',
  MOUNT_PATH_INVALID: 'G016_MOUNT_PATH_INVALID',
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
  'VTS_SYNTHETIC_VOLUME_MOUNT_PATH',
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
  const raw = env[key];
  const value = raw?.trim();
  if (!value) refuse(SYNTHETIC_RUNTIME_RULES.MISSING_REQUIRED, key);
  if (raw !== value || (expected != null && value !== expected)) {
    refuse(SYNTHETIC_RUNTIME_RULES.EXACT_MARKER_MISMATCH, key);
  }
  return value;
}

function requiredUuid(env: NodeJS.ProcessEnv, key: string): string {
  const value = required(env, key);
  if (!UUID.test(value)) {
    refuse(SYNTHETIC_RUNTIME_RULES.IDENTITY_FORMAT_INVALID, key);
  }
  if (PROTECTED_IDS.has(value)) {
    refuse(SYNTHETIC_RUNTIME_RULES.PROTECTED_RESOURCE);
  }
  return value;
}

function requiredMatchingUuid(
  env: NodeJS.ProcessEnv,
  sealedKey: string,
  injectedKey: string,
): string {
  const expected = requiredUuid(env, sealedKey);
  const actual = requiredUuid(env, injectedKey);
  if (actual !== expected) {
    refuse(SYNTHETIC_RUNTIME_RULES.EXACT_MARKER_MISMATCH, injectedKey);
  }
  return expected;
}

function requiredMountPath(env: NodeJS.ProcessEnv): string {
  const expected = required(env, 'VTS_SYNTHETIC_VOLUME_MOUNT_PATH');
  const injected = required(env, 'RAILWAY_VOLUME_MOUNT_PATH');
  if (injected !== expected) {
    refuse(
      SYNTHETIC_RUNTIME_RULES.EXACT_MARKER_MISMATCH,
      'RAILWAY_VOLUME_MOUNT_PATH',
    );
  }
  const protectedMount = PROTECTED_MOUNT_ROOTS.some(
    (root) => expected === root || expected.startsWith(root + '/'),
  );
  if (
    !path.posix.isAbsolute(expected) ||
    expected === '/' ||
    path.posix.normalize(expected) !== expected ||
    expected.includes('\0') ||
    protectedMount
  ) {
    refuse(
      protectedMount
        ? SYNTHETIC_RUNTIME_RULES.PROTECTED_RESOURCE
        : SYNTHETIC_RUNTIME_RULES.MOUNT_PATH_INVALID,
      'VTS_SYNTHETIC_VOLUME_MOUNT_PATH',
    );
  }
  return expected;
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
  mountPath: string;
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
  const projectId = requiredUuid(env, 'RAILWAY_PROJECT_ID');
  if (projectId !== SYNTHETIC_PROJECT_ID) {
    refuse(SYNTHETIC_RUNTIME_RULES.EXACT_MARKER_MISMATCH, 'RAILWAY_PROJECT_ID');
  }
  const environmentId = requiredUuid(env, 'RAILWAY_ENVIRONMENT_ID');
  if (environmentId !== SYNTHETIC_ENVIRONMENT_ID) {
    refuse(SYNTHETIC_RUNTIME_RULES.EXACT_MARKER_MISMATCH, 'RAILWAY_ENVIRONMENT_ID');
  }
  requiredMatchingUuid(env, 'VTS_SYNTHETIC_SERVICE_ID', 'RAILWAY_SERVICE_ID');
  requiredUuid(env, 'VTS_SYNTHETIC_SERVICE_INSTANCE_ID');
  requiredMatchingUuid(env, 'VTS_SYNTHETIC_VOLUME_ID', 'RAILWAY_VOLUME_ID');
  requiredUuid(env, 'VTS_SYNTHETIC_VOLUME_INSTANCE_ID');
  requiredUuid(env, 'RAILWAY_DEPLOYMENT_ID');
  const mountPath = requiredMountPath(env);

  required(env, 'VTS_SYNTHETIC_EXPECTED_BRANCH', SYNTHETIC_BRANCH);
  required(env, 'RAILWAY_GIT_BRANCH', SYNTHETIC_BRANCH);
  required(env, 'RAILWAY_GIT_REPO_OWNER', SYNTHETIC_REPOSITORY_OWNER);
  required(env, 'RAILWAY_GIT_REPO_NAME', SYNTHETIC_REPOSITORY_NAME);

  const expectedCommit = required(env, 'VTS_SYNTHETIC_EXPECTED_COMMIT');
  required(env, 'RAILWAY_GIT_COMMIT_SHA', expectedCommit);
  if (!/^[0-9a-f]{40}$/.test(expectedCommit)) {
    refuse(SYNTHETIC_RUNTIME_RULES.COMMIT_FORMAT_INVALID, 'VTS_SYNTHETIC_EXPECTED_COMMIT');
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
  const databaseFile = path.posix.join(
    mountPath,
    'vts-synthetic-handoff-v1',
    'synthetic-handoff.db',
  );
  if (databaseUrl !== 'file:' + databaseFile) {
    refuse(SYNTHETIC_RUNTIME_RULES.DATABASE_OUTSIDE_MOUNT, 'PRIVATE_DATABASE_URL');
  }
  required(env, 'DATABASE_URL', databaseUrl);
  if (!env.CREDENTIALS_KEY?.trim() || !env.PRIVATE_SESSION_SECRET?.trim()) {
    refuse(SYNTHETIC_RUNTIME_RULES.DISPOSABLE_KEYS_MISSING);
  }
  if (env.CREDENTIALS_KEY === env.PRIVATE_SESSION_SECRET) {
    refuse(SYNTHETIC_RUNTIME_RULES.DISPOSABLE_KEYS_REUSED);
  }

  return { databaseFile, decisions: [...decisions], expectedCommit, mountPath, nonce };
}

export function controlledSyntheticTestEnv(
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const mountPath = '/railway-synthetic-fresh/v1';
  const serviceId = '11111111-1111-4111-8111-111111111111';
  const volumeId = '33333333-3333-4333-8333-333333333333';
  const deploymentId = '55555555-5555-4555-8555-555555555555';
  const databaseUrl = 'file:' + path.posix.join(
    mountPath,
    'vts-synthetic-handoff-v1',
    'synthetic-handoff.db',
  );
  return {
    VTS_RUNTIME_BOUNDARY: SYNTHETIC_RUNTIME_BOUNDARY,
    VTS_SYNTHETIC_HANDOFF_ASSERTION: SYNTHETIC_ASSERTION,
    VTS_SYNTHETIC_HANDOFF_NONCE: '0123456789abcdef0123456789abcdef',
    VTS_SYNTHETIC_SERVICE_ID: serviceId,
    VTS_SYNTHETIC_SERVICE_INSTANCE_ID: '22222222-2222-4222-8222-222222222222',
    VTS_SYNTHETIC_VOLUME_ID: volumeId,
    VTS_SYNTHETIC_VOLUME_INSTANCE_ID: '44444444-4444-4444-8444-444444444444',
    VTS_SYNTHETIC_VOLUME_MOUNT_PATH: mountPath,
    VTS_SYNTHETIC_EXPECTED_BRANCH: SYNTHETIC_BRANCH,
    VTS_SYNTHETIC_EXPECTED_COMMIT: '1111111111111111111111111111111111111111',
    NODE_ENV: 'production',
    RAILWAY_PROJECT_ID: SYNTHETIC_PROJECT_ID,
    RAILWAY_ENVIRONMENT_ID: SYNTHETIC_ENVIRONMENT_ID,
    RAILWAY_SERVICE_ID: serviceId,
    RAILWAY_VOLUME_ID: volumeId,
    RAILWAY_DEPLOYMENT_ID: deploymentId,
    RAILWAY_VOLUME_MOUNT_PATH: mountPath,
    RAILWAY_GIT_BRANCH: SYNTHETIC_BRANCH,
    RAILWAY_GIT_COMMIT_SHA: '1111111111111111111111111111111111111111',
    RAILWAY_GIT_REPO_OWNER: SYNTHETIC_REPOSITORY_OWNER,
    RAILWAY_GIT_REPO_NAME: SYNTHETIC_REPOSITORY_NAME,
    PRIVATE_DATABASE_URL: databaseUrl,
    DATABASE_URL: databaseUrl,
    PRIVATE_PORTAL_ORIGIN: 'http://127.0.0.1',
    WEB_ORIGIN: 'http://127.0.0.1',
    CREDENTIALS_KEY: 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=',
    PRIVATE_SESSION_SECRET: 'synthetic-session-secret-only-000000000000000000000000',
    ...overrides,
  };
}
