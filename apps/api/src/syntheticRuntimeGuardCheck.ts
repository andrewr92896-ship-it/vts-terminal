import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import fs from 'node:fs';
import net from 'node:net';
import {
  assertControlledSyntheticRuntime,
  controlledSyntheticTestEnv,
  SYNTHETIC_RUNTIME_RULES,
  SYNTHETIC_SERVICE_ID,
  SyntheticRuntimeGuardError,
  type SyntheticRuntimeRuleCode,
} from './syntheticRuntimeGuard.js';

function captureRefusal(env: NodeJS.ProcessEnv): SyntheticRuntimeGuardError {
  try {
    assertControlledSyntheticRuntime(env);
  } catch (error) {
    assert.ok(error instanceof SyntheticRuntimeGuardError);
    return error;
  }
  assert.fail('Expected synthetic runtime refusal');
}

function expectRefusal(
  label: string,
  env: NodeJS.ProcessEnv,
  rule: SyntheticRuntimeRuleCode,
  variableName?: string,
  forbiddenOutput: string[] = [],
): void {
  const error = captureRefusal(env);
  assert.equal(error.rule, rule, label + ' rule');
  assert.equal(error.variableName, variableName, label + ' variable diagnostic');
  assert.equal(
    error.message,
    'Synthetic handoff refused [' + rule + ']' +
      (variableName ? ' variable=' + variableName : ''),
    label + ' message',
  );
  for (const value of forbiddenOutput) {
    assert.ok(!error.message.includes(value), label + ' leaked a value');
  }
}

assert.doesNotThrow(() => assertControlledSyntheticRuntime(controlledSyntheticTestEnv()));

// Railway's documented standard metadata is allowed when it describes the
// exact disposable IDs/branch/mount already required above. Public exposure is
// tested separately and still fails closed.
const documentedRailwayMetadata: NodeJS.ProcessEnv = {
  RAILWAY_PRIVATE_DOMAIN: 'synthetic-handoff.railway.internal',
  RAILWAY_PROJECT_NAME: 'vts-terminal-synthetic',
  RAILWAY_ENVIRONMENT_NAME: 'staging',
  RAILWAY_SERVICE_NAME: 'vts-pinned-handoff',
  RAILWAY_REPLICA_ID: 'synthetic-replica',
  RAILWAY_REPLICA_REGION: 'us-east4',
  RAILWAY_DEPLOYMENT_ID: '00000000-0000-4000-8000-000000000701',
  RAILWAY_SNAPSHOT_ID: '00000000-0000-4000-8000-000000000702',
  RAILWAY_VOLUME_NAME: 'vts-pinned-handoff-volume',
  RAILWAY_GIT_AUTHOR: 'synthetic-ci',
  RAILWAY_GIT_REPO_NAME: 'vts-terminal',
  RAILWAY_GIT_REPO_OWNER: 'synthetic-owner',
  RAILWAY_GIT_COMMIT_MESSAGE: 'Pin synthetic runtime handoff',
  RAILWAY_DEPLOYMENT_OVERLAP_SECONDS: '0',
  RAILWAY_DOCKERFILE_PATH: 'Dockerfile',
  RAILWAY_HEALTHCHECK_TIMEOUT_SEC: '300',
  RAILWAY_DEPLOYMENT_DRAINING_SECONDS: '0',
  RAILWAY_RUN_UID: '0',
  RAILWAY_SHM_SIZE_BYTES: '67108864',
};
assert.doesNotThrow(() =>
  assertControlledSyntheticRuntime(controlledSyntheticTestEnv(documentedRailwayMetadata)),
);

for (const [key, value] of [
  ['RAILWAY_PUBLIC_DOMAIN', 'synthetic.example.invalid'],
  ['RAILWAY_STATIC_URL', 'https://synthetic.example.invalid'],
] as const) {
  expectRefusal(
    'public exposure ' + key,
    controlledSyntheticTestEnv({ [key]: value }),
    SYNTHETIC_RUNTIME_RULES.PUBLIC_EXPOSURE,
    key,
    [value],
  );
}

expectRefusal(
  'protected service',
  controlledSyntheticTestEnv({
    RAILWAY_SERVICE_ID: 'cc2e7946-384f-4d79-abc6-b61964cee327',
    VTS_SYNTHETIC_SERVICE_ID: 'cc2e7946-384f-4d79-abc6-b61964cee327',
  }),
  SYNTHETIC_RUNTIME_RULES.EXACT_MARKER_MISMATCH,
  'RAILWAY_SERVICE_ID',
);
expectRefusal(
  'protected volume',
  controlledSyntheticTestEnv({
    RAILWAY_VOLUME_ID: '784e4de9-66c5-4723-91bb-9ee00113383d',
    VTS_SYNTHETIC_VOLUME_ID: '784e4de9-66c5-4723-91bb-9ee00113383d',
  }),
  SYNTHETIC_RUNTIME_RULES.EXACT_MARKER_MISMATCH,
  'RAILWAY_VOLUME_ID',
);
expectRefusal(
  'wrong service marker',
  controlledSyntheticTestEnv({ VTS_SYNTHETIC_SERVICE_ID: SYNTHETIC_SERVICE_ID.slice(1) }),
  SYNTHETIC_RUNTIME_RULES.EXACT_MARKER_MISMATCH,
  'VTS_SYNTHETIC_SERVICE_ID',
);
expectRefusal(
  'main branch',
  controlledSyntheticTestEnv({
    RAILWAY_GIT_BRANCH: 'main',
    VTS_SYNTHETIC_EXPECTED_BRANCH: 'main',
  }),
  SYNTHETIC_RUNTIME_RULES.EXACT_MARKER_MISMATCH,
  'VTS_SYNTHETIC_EXPECTED_BRANCH',
  ['main'],
);
expectRefusal(
  'commit mismatch',
  controlledSyntheticTestEnv({ RAILWAY_GIT_COMMIT_SHA: '2'.repeat(40) }),
  SYNTHETIC_RUNTIME_RULES.EXACT_MARKER_MISMATCH,
  'RAILWAY_GIT_COMMIT_SHA',
);
expectRefusal(
  'invalid commit marker',
  controlledSyntheticTestEnv({
    VTS_SYNTHETIC_EXPECTED_COMMIT: 'not-a-commit',
    RAILWAY_GIT_COMMIT_SHA: 'not-a-commit',
  }),
  SYNTHETIC_RUNTIME_RULES.COMMIT_FORMAT_INVALID,
  'VTS_SYNTHETIC_EXPECTED_COMMIT',
  ['not-a-commit'],
);
expectRefusal(
  'invalid nonce',
  controlledSyntheticTestEnv({ VTS_SYNTHETIC_HANDOFF_NONCE: 'not-a-nonce' }),
  SYNTHETIC_RUNTIME_RULES.NONCE_FORMAT_INVALID,
  'VTS_SYNTHETIC_HANDOFF_NONCE',
  ['not-a-nonce'],
);

for (const key of [
  'VTS_RUNTIME_BOUNDARY',
  'VTS_SYNTHETIC_HANDOFF_ASSERTION',
  'VTS_SYNTHETIC_HANDOFF_NONCE',
  'RAILWAY_PROJECT_ID',
  'RAILWAY_ENVIRONMENT_ID',
  'RAILWAY_SERVICE_ID',
  'VTS_SYNTHETIC_SERVICE_INSTANCE_ID',
  'RAILWAY_VOLUME_ID',
  'VTS_SYNTHETIC_VOLUME_INSTANCE_ID',
  'RAILWAY_VOLUME_MOUNT_PATH',
  'VTS_SYNTHETIC_EXPECTED_BRANCH',
  'RAILWAY_GIT_BRANCH',
  'VTS_SYNTHETIC_EXPECTED_COMMIT',
  'RAILWAY_GIT_COMMIT_SHA',
  'PRIVATE_DATABASE_URL',
  'DATABASE_URL',
] as const) {
  expectRefusal(
    'missing marker ' + key,
    controlledSyntheticTestEnv({ [key]: '' }),
    SYNTHETIC_RUNTIME_RULES.MISSING_REQUIRED,
    key,
  );
}

expectRefusal(
  'protected database path',
  controlledSyntheticTestEnv({
    PRIVATE_DATABASE_URL: 'file:/data/vts.db',
    DATABASE_URL: 'file:/data/vts.db',
  }),
  SYNTHETIC_RUNTIME_RULES.PROTECTED_VALUE_SIGNAL,
  'PRIVATE_DATABASE_URL',
  ['file:/data/vts.db'],
);
expectRefusal(
  'remote database URL',
  controlledSyntheticTestEnv({
    PRIVATE_DATABASE_URL: 'https://database.synthetic.invalid/db',
    DATABASE_URL: 'https://database.synthetic.invalid/db',
  }),
  SYNTHETIC_RUNTIME_RULES.DATABASE_NOT_LOCAL_FILE,
  'PRIVATE_DATABASE_URL',
  ['https://database.synthetic.invalid/db'],
);
expectRefusal(
  'local database outside mount',
  controlledSyntheticTestEnv({
    PRIVATE_DATABASE_URL: 'file:/tmp/synthetic-handoff.db',
    DATABASE_URL: 'file:/tmp/synthetic-handoff.db',
  }),
  SYNTHETIC_RUNTIME_RULES.DATABASE_OUTSIDE_MOUNT,
  'PRIVATE_DATABASE_URL',
  ['file:/tmp/synthetic-handoff.db'],
);

expectRefusal(
  'protected domain',
  controlledSyntheticTestEnv({
    PRIVATE_PORTAL_ORIGIN: 'https://portal.vitalistradingsystems.com',
  }),
  SYNTHETIC_RUNTIME_RULES.ORIGIN_NON_LOOPBACK,
  'PRIVATE_PORTAL_ORIGIN',
  ['portal.vitalistradingsystems.com'],
);
expectRefusal(
  'malformed origin',
  controlledSyntheticTestEnv({ WEB_ORIGIN: 'not-a-url' }),
  SYNTHETIC_RUNTIME_RULES.ORIGIN_URL_INVALID,
  'WEB_ORIGIN',
  ['not-a-url'],
);
expectRefusal(
  'non-loopback private origin',
  controlledSyntheticTestEnv({ PRIVATE_PORTAL_ORIGIN: 'http://synthetic.internal' }),
  SYNTHETIC_RUNTIME_RULES.ORIGIN_NON_LOOPBACK,
  'PRIVATE_PORTAL_ORIGIN',
  ['synthetic.internal'],
);
assert.doesNotThrow(() =>
  assertControlledSyntheticRuntime(
    controlledSyntheticTestEnv({
      PRIVATE_PORTAL_ORIGIN: 'http://localhost',
      WEB_ORIGIN: 'http://[::1]',
      RAILWAY_PRIVATE_DOMAIN: 'synthetic-handoff.railway.internal',
    }),
  ),
);

const integrationKeys = [
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
for (const key of integrationKeys) {
  const value = 'integration-sentinel-' + key.toLowerCase();
  expectRefusal(
    'external integration ' + key,
    controlledSyntheticTestEnv({ [key]: value }),
    SYNTHETIC_RUNTIME_RULES.EXTERNAL_INTEGRATION,
    undefined,
    [key, value],
  );
}

const safeDiagnosticSignal = 'retained-synthetic-sentinel';
expectRefusal(
  'safe name-only signal diagnostic',
  controlledSyntheticTestEnv({ RAILWAY_GIT_COMMIT_MESSAGE: safeDiagnosticSignal }),
  SYNTHETIC_RUNTIME_RULES.PROTECTED_VALUE_SIGNAL,
  'RAILWAY_GIT_COMMIT_MESSAGE',
  [safeDiagnosticSignal],
);
const sensitiveName = 'BROKER_ACCOUNT_SECRET_ID';
const sensitiveSignal = 'real-candidate-sensitive-sentinel';
expectRefusal(
  'sensitive-name signal diagnostic',
  controlledSyntheticTestEnv({ [sensitiveName]: sensitiveSignal }),
  SYNTHETIC_RUNTIME_RULES.PROTECTED_VALUE_SIGNAL,
  undefined,
  [sensitiveName, sensitiveSignal],
);

expectRefusal(
  'missing disposable key',
  controlledSyntheticTestEnv({ CREDENTIALS_KEY: '' }),
  SYNTHETIC_RUNTIME_RULES.DISPOSABLE_KEYS_MISSING,
  undefined,
  ['CREDENTIALS_KEY'],
);
expectRefusal(
  'reused disposable keys',
  controlledSyntheticTestEnv({
    CREDENTIALS_KEY: 'same-disposable-secret',
    PRIVATE_SESSION_SECRET: 'same-disposable-secret',
  }),
  SYNTHETIC_RUNTIME_RULES.DISPOSABLE_KEYS_REUSED,
  undefined,
  ['same-disposable-secret'],
);

const railwayConfig = JSON.parse(
  fs.readFileSync(new URL('../../../railway.json', import.meta.url), 'utf8'),
) as { deploy?: Record<string, unknown> };
assert.deepEqual(railwayConfig.deploy, {
  startCommand:
    'node --require ./scripts/synthetic-egress-deny.cjs ./apps/api/dist/syntheticRuntimeHandoff.js',
  healthcheckPath: null,
  healthcheckTimeout: null,
  restartPolicyType: 'NEVER',
  restartPolicyMaxRetries: null,
});

const rootPackage = JSON.parse(
  fs.readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
) as { scripts?: Record<string, string> };
assert.equal(
  rootPackage.scripts?.['verify:synthetic-handoff'],
  'VTS_RUNTIME_BOUNDARY=controlled-synthetic-runtime-handoff-v1 node --require ./scripts/synthetic-egress-deny.cjs --import tsx ./apps/api/src/syntheticRuntimeGuardCheck.ts',
);
const verifyWorkflow = fs.readFileSync(
  new URL('../../../.github/workflows/verify.yml', import.meta.url),
  'utf8',
);
assert.match(verifyWorkflow, /^\s*- run: npm run verify\s*$/m);

const socket = new net.Socket();
assert.throws(
  () => socket.connect({ host: '198.51.100.1', port: 443 }),
  /non-loopback network denied/,
);
socket.destroy();

const datagram = dgram.createSocket('udp4');
assert.throws(
  () => datagram.connect(9, '198.51.100.1'),
  /non-loopback network denied/,
);
datagram.close();

await assert.rejects(fetch('https://example.invalid/'), /non-loopback network denied/);

const stats = (
  globalThis as unknown as {
    __VTS_SYNTHETIC_EGRESS_STATS__?: {
      blockedNonLoopback: number;
      fetchBlocked: number;
      socketBlocked: number;
      datagramBlocked: number;
    };
  }
).__VTS_SYNTHETIC_EGRESS_STATS__;
assert.ok(stats);
assert.equal(stats.blockedNonLoopback, 3);
assert.equal(stats.fetchBlocked, 1);
assert.equal(stats.socketBlocked, 1);
assert.equal(stats.datagramBlocked, 1);

console.log('Controlled synthetic runtime guard and egress-deny checks passed.');
