import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import dgram from 'node:dgram';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertControlledSyntheticRuntime,
  controlledSyntheticTestEnv,
  SYNTHETIC_RUNTIME_DECISIONS,
  SYNTHETIC_RUNTIME_RULES,
  SYNTHETIC_SERVICE_ID,
  SyntheticRuntimeGuardError,
  type SyntheticRuntimeRuleCode,
} from './syntheticRuntimeGuard.js';
import {
  claimFreshSyntheticVolume,
  createNodeSyntheticVolumeOperations,
  SYNTHETIC_DATABASE_NAME,
  SYNTHETIC_EXT_FILESYSTEM_MAGIC,
  SYNTHETIC_OWNED_CHILD_NAME,
  SYNTHETIC_REPORT_NAME,
  SYNTHETIC_SENTINEL_NAME,
  SYNTHETIC_SYSTEM_DIRECTORY_NAME,
  SYNTHETIC_VOLUME_RULES,
  SyntheticVolumeFreshnessError,
  type SyntheticStat,
  type SyntheticVolumeClaim,
  type SyntheticVolumeOperations,
  type SyntheticVolumeRuleCode,
} from './syntheticVolumeFreshness.js';

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

const baselineResult = assertControlledSyntheticRuntime(controlledSyntheticTestEnv());
assert.deepEqual(baselineResult.decisions, []);

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


const privateCrossServiceName = 'RAILWAY_SERVICE_RUNTIME_HELPER_URL';
const privateCrossServiceValue = 'http://retained-helper.railway.internal:3000';
const privateMetadataResult = assertControlledSyntheticRuntime(
  controlledSyntheticTestEnv({ [privateCrossServiceName]: privateCrossServiceValue }),
);
assert.deepEqual(privateMetadataResult.decisions, [
  SYNTHETIC_RUNTIME_DECISIONS.RAILWAY_PRIVATE_CROSS_SERVICE_METADATA,
]);
const barePrivateMetadataResult = assertControlledSyntheticRuntime(
  controlledSyntheticTestEnv({
    RAILWAY_SERVICE_RUNTIME_HELPER_HOST_URL: 'retained-helper.railway.internal',
  }),
);
assert.deepEqual(barePrivateMetadataResult.decisions, [
  SYNTHETIC_RUNTIME_DECISIONS.RAILWAY_PRIVATE_CROSS_SERVICE_METADATA,
]);

expectRefusal(
  'private metadata after exact markers only',
  controlledSyntheticTestEnv({
    RAILWAY_PROJECT_ID: '00000000-0000-4000-8000-000000000799',
    [privateCrossServiceName]: privateCrossServiceValue,
  }),
  SYNTHETIC_RUNTIME_RULES.EXACT_MARKER_MISMATCH,
  'RAILWAY_PROJECT_ID',
  [privateCrossServiceValue],
);
for (const key of ['UNRECOGNIZED_RUNTIME_URL', 'DATABASE_URL'] as const) {
  expectRefusal(
    'private metadata under non-platform name ' + key,
    controlledSyntheticTestEnv({ [key]: privateCrossServiceValue }),
    SYNTHETIC_RUNTIME_RULES.PROTECTED_VALUE_SIGNAL,
    key === 'DATABASE_URL' ? 'DATABASE_URL' : undefined,
    key === 'DATABASE_URL' ? [privateCrossServiceValue] : [key, privateCrossServiceValue],
  );
}
expectRefusal(
  'private metadata under integration name',
  controlledSyntheticTestEnv({ SMTP_HOST: privateCrossServiceValue }),
  SYNTHETIC_RUNTIME_RULES.EXTERNAL_INTEGRATION,
  undefined,
  ['SMTP_HOST', privateCrossServiceValue],
);
expectRefusal(
  'private metadata under application-consumed origin',
  controlledSyntheticTestEnv({ PRIVATE_PORTAL_ORIGIN: privateCrossServiceValue }),
  SYNTHETIC_RUNTIME_RULES.ORIGIN_NON_LOOPBACK,
  'PRIVATE_PORTAL_ORIGIN',
  [privateCrossServiceValue],
);

for (const [label, value] of [
  ['public Railway domain', 'https://runtime-helper.up.railway.app'],
  ['custom domain', 'https://synthetic.example.invalid'],
  ['TCP proxy', 'roundhouse.proxy.rlwy.net:11105'],
  ['credentialed URL', 'http://user:pass@retained-helper.railway.internal:3000'],
  ['query', 'http://retained-helper.railway.internal:3000/?token=test'],
  ['fragment', 'http://retained-helper.railway.internal:3000/#test'],
  ['database URL', 'postgres://retained-helper.railway.internal:5432/runtime'],
  ['protected path', 'file:/data/vts.db'],
  ['protected ID', 'cc2e7946-384f-4d79-abc6-b61964cee327'],
  ['filesystem path', '/railway-synthetic-candidate/retained-helper'],
  ['malformed reference', 'not a private Railway reference'],
] as const) {
  expectRefusal(
    'invalid platform cross-service metadata ' + label,
    controlledSyntheticTestEnv({ [privateCrossServiceName]: value }),
    SYNTHETIC_RUNTIME_RULES.PROTECTED_VALUE_SIGNAL,
    undefined,
    [privateCrossServiceName, value],
  );
}
expectRefusal(
  'wildcard platform metadata name',
  controlledSyntheticTestEnv({
    'RAILWAY_SERVICE_*_URL': privateCrossServiceValue,
  }),
  SYNTHETIC_RUNTIME_RULES.PROTECTED_VALUE_SIGNAL,
  undefined,
  ['RAILWAY_SERVICE_*_URL', privateCrossServiceValue],
);

for (const [key, value] of [
  ['RAILWAY_PUBLIC_DOMAIN', 'synthetic.example.invalid'],
  ['RAILWAY_STATIC_URL', 'https://synthetic.example.invalid'],
  ['RAILWAY_TCP_PROXY_DOMAIN', 'synthetic.proxy.invalid'],
  ['RAILWAY_TCP_PROXY_PORT', '11105'],
  ['RAILWAY_TCP_APPLICATION_PORT', '25565'],
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


function copyStat(
  source: SyntheticStat,
  overrides: Partial<Pick<SyntheticStat, 'dev' | 'ino' | 'uid' | 'gid' | 'mode' | 'nlink'>> & {
    directory?: boolean;
    symlink?: boolean;
    file?: boolean;
  } = {},
): SyntheticStat {
  return {
    dev: overrides.dev ?? source.dev,
    ino: overrides.ino ?? source.ino,
    uid: overrides.uid ?? source.uid,
    gid: overrides.gid ?? source.gid,
    mode: overrides.mode ?? source.mode,
    nlink: overrides.nlink ?? source.nlink,
    isDirectory: () => overrides.directory ?? source.isDirectory(),
    isSymbolicLink: () => overrides.symlink ?? source.isSymbolicLink(),
    isFile: () => overrides.file ?? source.isFile(),
  };
}

function testRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vts-volume-freshness-'));
}

function configuredDatabase(root: string): string {
  return path.join(root, SYNTHETIC_OWNED_CHILD_NAME, SYNTHETIC_DATABASE_NAME);
}

function claimAt(
  root: string,
  operations: SyntheticVolumeOperations = createNodeSyntheticVolumeOperations(),
): SyntheticVolumeClaim {
  return claimFreshSyntheticVolume({
    mountPath: root,
    configuredDatabaseFile: configuredDatabase(root),
    sentinelContents: '{"test":"sentinel-exclusive"}',
    operations,
  });
}

function finishClaim(claim: SyntheticVolumeClaim): void {
  fs.writeFileSync(claim.databaseFile, '', { flag: 'wx', mode: 0o600 });
  claim.writeReportAndValidate('{"test":"report-exclusive"}');
}

function expectVolumeRefusal(
  label: string,
  expectedRule: SyntheticVolumeRuleCode,
  run: () => unknown,
): void {
  let captured: unknown;
  try {
    run();
  } catch (error) {
    captured = error;
  }
  assert.ok(captured instanceof SyntheticVolumeFreshnessError, label);
  assert.equal(captured.rule, expectedRule, label + ' rule');
  assert.equal(
    captured.message,
    'Synthetic volume freshness refused [' + expectedRule + ']',
    label + ' sanitized message',
  );
  for (const forbidden of [
    'lost+found',
    'SYNTHETIC_ONLY.json',
    'synthetic-handoff.db',
    'synthetic-handoff-report.json',
    '.hidden-sensitive',
    'contents-must-never-leak',
    '3735928559',
  ]) {
    assert.ok(!captured.message.includes(forbidden), label + ' leaked diagnostic detail');
  }
}

function withScratch(run: (root: string) => void): void {
  const root = testRoot();
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function systemDirectoryOperations(
  overrides: Partial<Pick<SyntheticStat, 'dev' | 'ino' | 'uid' | 'gid' | 'mode' | 'nlink'>> = {},
  filesystemType: bigint = SYNTHETIC_EXT_FILESYSTEM_MAGIC,
): SyntheticVolumeOperations {
  const base = createNodeSyntheticVolumeOperations();
  let systemFd: number | undefined;
  return {
    ...base,
    openDirectory(target) {
      const fd = base.openDirectory(target);
      if (target.endsWith('/' + SYNTHETIC_SYSTEM_DIRECTORY_NAME)) systemFd = fd;
      return fd;
    },
    lstat(target) {
      const value = base.lstat(target);
      return target.endsWith('/' + SYNTHETIC_SYSTEM_DIRECTORY_NAME)
        ? copyStat(value, { uid: 0n, gid: 0n, ...overrides })
        : value;
    },
    fstat(fd) {
      const value = base.fstat(fd);
      return fd === systemFd
        ? copyStat(value, { uid: 0n, gid: 0n, ...overrides })
        : value;
    },
    statfsType() {
      return filesystemType;
    },
  };
}

withScratch((root) => {
  const claim = claimAt(root);
  try {
    finishClaim(claim);
  } finally {
    claim.close();
  }
});

withScratch((root) => {
  fs.mkdirSync(path.join(root, SYNTHETIC_SYSTEM_DIRECTORY_NAME), { mode: 0o700 });
  const claim = claimAt(root, systemDirectoryOperations());
  try {
    finishClaim(claim);
  } finally {
    claim.close();
  }
});

withScratch((root) => {
  fs.mkdirSync(path.join(root, SYNTHETIC_SYSTEM_DIRECTORY_NAME), { mode: 0o700 });
  fs.writeFileSync(
    path.join(root, SYNTHETIC_SYSTEM_DIRECTORY_NAME, '.hidden-sensitive'),
    'contents-must-never-leak',
  );
  expectVolumeRefusal('nonempty system directory', SYNTHETIC_VOLUME_RULES.SYSTEM_NOT_EMPTY, () =>
    claimAt(root, systemDirectoryOperations()),
  );
});

withScratch((root) => {
  fs.writeFileSync(path.join(root, '.hidden-sensitive'), 'contents-must-never-leak');
  expectVolumeRefusal('extra hidden root entry', SYNTHETIC_VOLUME_RULES.ROOT_NAMESPACE, () =>
    claimAt(root),
  );
});

withScratch((root) => {
  fs.symlinkSync(root, path.join(root, SYNTHETIC_SYSTEM_DIRECTORY_NAME));
  expectVolumeRefusal('system symlink', SYNTHETIC_VOLUME_RULES.SYSTEM_METADATA, () =>
    claimAt(root, systemDirectoryOperations()),
  );
});

withScratch((root) => {
  fs.writeFileSync(path.join(root, SYNTHETIC_SYSTEM_DIRECTORY_NAME), '');
  expectVolumeRefusal('system wrong type', SYNTHETIC_VOLUME_RULES.SYSTEM_METADATA, () =>
    claimAt(root, systemDirectoryOperations()),
  );
});

for (const [label, override] of [
  ['device', { dev: 3735928559n }],
  ['uid', { uid: 101n }],
  ['gid', { gid: 102n }],
  ['mode', { mode: 0o40755n }],
  ['nlink', { nlink: 3n }],
] as const) {
  withScratch((root) => {
    fs.mkdirSync(path.join(root, SYNTHETIC_SYSTEM_DIRECTORY_NAME), { mode: 0o700 });
    expectVolumeRefusal(
      'system wrong ' + label,
      SYNTHETIC_VOLUME_RULES.SYSTEM_METADATA,
      () => claimAt(root, systemDirectoryOperations(override)),
    );
  });
}

withScratch((root) => {
  fs.mkdirSync(path.join(root, SYNTHETIC_SYSTEM_DIRECTORY_NAME), { mode: 0o700 });
  const base = systemDirectoryOperations();
  const inaccessible: SyntheticVolumeOperations = {
    ...base,
    lstat(target) {
      if (target.endsWith('/' + SYNTHETIC_SYSTEM_DIRECTORY_NAME)) {
        throw new Error('contents-must-never-leak');
      }
      return base.lstat(target);
    },
  };
  expectVolumeRefusal('inaccessible system metadata', SYNTHETIC_VOLUME_RULES.SYSTEM_METADATA, () =>
    claimAt(root, inaccessible),
  );
});

withScratch((root) => {
  fs.mkdirSync(path.join(root, SYNTHETIC_SYSTEM_DIRECTORY_NAME), { mode: 0o700 });
  expectVolumeRefusal('unsupported system filesystem', SYNTHETIC_VOLUME_RULES.SYSTEM_FILESYSTEM, () =>
    claimAt(root, systemDirectoryOperations({}, 0x1234n)),
  );
});

withScratch((root) => {
  fs.mkdirSync(path.join(root, SYNTHETIC_SYSTEM_DIRECTORY_NAME), { mode: 0o700 });
  const base = systemDirectoryOperations();
  let systemFd: number | undefined;
  const substituted: SyntheticVolumeOperations = {
    ...base,
    openDirectory(target) {
      const fd = base.openDirectory(target);
      if (target.endsWith('/' + SYNTHETIC_SYSTEM_DIRECTORY_NAME)) systemFd = fd;
      return fd;
    },
    fstat(fd) {
      const value = base.fstat(fd);
      return fd === systemFd ? copyStat(value, { ino: value.ino + 1n }) : value;
    },
  };
  expectVolumeRefusal('system lstat to open substitution', SYNTHETIC_VOLUME_RULES.SYSTEM_METADATA, () =>
    claimAt(root, substituted),
  );
});

withScratch((root) => {
  const base = createNodeSyntheticVolumeOperations();
  const raced: SyntheticVolumeOperations = {
    ...base,
    mkdir(target, mode) {
      base.mkdir(target, mode);
      fs.writeFileSync(path.join(path.dirname(target), '.hidden-sensitive'), 'contents-must-never-leak');
    },
  };
  expectVolumeRefusal('initial to final root addition', SYNTHETIC_VOLUME_RULES.NAMESPACE_RACE, () =>
    claimAt(root, raced),
  );
});

withScratch((root) => {
  const base = createNodeSyntheticVolumeOperations();
  const raced: SyntheticVolumeOperations = {
    ...base,
    openDirectory(target) {
      if (target.endsWith('/' + SYNTHETIC_OWNED_CHILD_NAME)) fs.chmodSync(target, 0o755);
      return base.openDirectory(target);
    },
  };
  expectVolumeRefusal('child metadata race', SYNTHETIC_VOLUME_RULES.CHILD_METADATA, () =>
    claimAt(root, raced),
  );
});

for (const preexisting of [
  SYNTHETIC_OWNED_CHILD_NAME,
  path.join(SYNTHETIC_OWNED_CHILD_NAME, SYNTHETIC_SENTINEL_NAME),
  path.join(SYNTHETIC_OWNED_CHILD_NAME, SYNTHETIC_DATABASE_NAME),
]) {
  withScratch((root) => {
    const target = path.join(root, preexisting);
    if (preexisting === SYNTHETIC_OWNED_CHILD_NAME) fs.mkdirSync(target, { mode: 0o700 });
    else {
      fs.mkdirSync(path.dirname(target), { mode: 0o700 });
      fs.writeFileSync(target, '');
    }
    expectVolumeRefusal('preexisting owned namespace', SYNTHETIC_VOLUME_RULES.ROOT_NAMESPACE, () =>
      claimAt(root),
    );
  });
}

withScratch((root) => {
  const base = createNodeSyntheticVolumeOperations();
  let injected = false;
  let rootProc: string | undefined;
  const raced: SyntheticVolumeOperations = {
    ...base,
    list(target) {
      const entries = base.list(target);
      if (target.startsWith('/proc/self/fd/') && rootProc === undefined) rootProc = target;
      if (!injected && target.startsWith('/proc/self/fd/') && target !== rootProc && entries.length === 0) {
          fs.writeFileSync(path.join(target, SYNTHETIC_SENTINEL_NAME), 'contents-must-never-leak');
        injected = true;
      }
      return entries;
    },
  };
  expectVolumeRefusal('sentinel exclusive race', SYNTHETIC_VOLUME_RULES.SENTINEL_CREATE, () =>
    claimAt(root, raced),
  );
});

withScratch((root) => {
  const base = createNodeSyntheticVolumeOperations();
  let injected = false;
  let rootProc: string | undefined;
  const raced: SyntheticVolumeOperations = {
    ...base,
    list(target) {
      const entries = base.list(target);
      if (target.startsWith('/proc/self/fd/') && rootProc === undefined) rootProc = target;
      if (!injected && target.startsWith('/proc/self/fd/') && target !== rootProc && entries.length === 0) {
          fs.writeFileSync(path.join(target, SYNTHETIC_DATABASE_NAME), 'contents-must-never-leak');
        injected = true;
      }
      return entries;
    },
  };
  expectVolumeRefusal('database creation race', SYNTHETIC_VOLUME_RULES.NAMESPACE_RACE, () =>
    claimAt(root, raced),
  );
});

for (const [label, mismatch] of [
  ['unavailable', false],
  ['mismatch', true],
] as const) {
  withScratch((root) => {
    const base = createNodeSyntheticVolumeOperations();
    let firstProcStat = true;
    const procFailure: SyntheticVolumeOperations = {
      ...base,
      stat(target) {
        if (firstProcStat && target.startsWith('/proc/self/fd/')) {
          firstProcStat = false;
          if (!mismatch) throw new Error('contents-must-never-leak');
          const value = base.stat(target);
          return copyStat(value, { ino: value.ino + 1n });
        }
        return base.stat(target);
      },
    };
    expectVolumeRefusal(
      'proc descriptor ' + label,
      SYNTHETIC_VOLUME_RULES.ROOT_DESCRIPTOR,
      () => claimAt(root, procFailure),
    );
  });
}

withScratch((root) => {
  const claim = claimAt(root);
  try {
    fs.writeFileSync(claim.databaseFile, '', { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(
      path.join(path.dirname(claim.databaseFile), SYNTHETIC_REPORT_NAME),
      'contents-must-never-leak',
      { flag: 'wx', mode: 0o600 },
    );
    expectVolumeRefusal('report exclusive creation', SYNTHETIC_VOLUME_RULES.REPORT_CREATE, () =>
      claim.writeReportAndValidate('{}'),
    );
  } finally {
    claim.close();
  }
});

if (process.platform === 'linux') {
  withScratch((root) => {
    const claim = claimAt(root);
    try {
      assert.ok(claim.databaseFile.startsWith('/proc/self/fd/'));
      finishClaim(claim);
      assert.deepEqual(
        fs.readdirSync(path.join(root, SYNTHETIC_OWNED_CHILD_NAME)).sort(),
        [SYNTHETIC_DATABASE_NAME, SYNTHETIC_REPORT_NAME, SYNTHETIC_SENTINEL_NAME].sort(),
      );
    } finally {
      claim.close();
    }
  });

  const libsqlRoot = testRoot();
  try {
    const claim = claimAt(libsqlRoot);
    try {
      const { createClient } = await import('@libsql/client');
      const smokeClient = createClient({ url: claim.databaseUrl });
      await smokeClient.execute('PRAGMA journal_mode=WAL');
      await smokeClient.execute('CREATE TABLE descriptor_smoke (id INTEGER PRIMARY KEY)');
      await smokeClient.execute('INSERT INTO descriptor_smoke DEFAULT VALUES');
      const rows = await smokeClient.execute('SELECT COUNT(*) AS count FROM descriptor_smoke');
      assert.equal(Number((rows.rows[0] as Record<string, unknown>).count), 1);
      const liveEntries = fs.readdirSync(
        path.join(libsqlRoot, SYNTHETIC_OWNED_CHILD_NAME),
      );
      assert.ok(liveEntries.includes(SYNTHETIC_DATABASE_NAME + '-wal'));
      assert.ok(liveEntries.includes(SYNTHETIC_DATABASE_NAME + '-shm'));
      await smokeClient.execute('PRAGMA wal_checkpoint(TRUNCATE)');
      await smokeClient.execute('PRAGMA journal_mode=DELETE');
      await smokeClient.close();
      claim.writeReportAndValidate('{"test":"libsql-descriptor-sidecars"}');
    } finally {
      claim.close();
    }
  } finally {
    fs.rmSync(libsqlRoot, { recursive: true, force: true });
  }
}

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

const preloadPath = fileURLToPath(
  new URL('../../../scripts/synthetic-egress-deny.cjs', import.meta.url),
);
const guardModuleUrl = new URL('./syntheticRuntimeGuard.ts', import.meta.url).href;
const orderProbeSource = [
  "import { assertControlledSyntheticRuntime, controlledSyntheticTestEnv } from " +
    JSON.stringify(guardModuleUrl) +
    ';',
  "try { assertControlledSyntheticRuntime(controlledSyntheticTestEnv({ UNRECOGNIZED_RUNTIME_URL: 'http://retained-helper.railway.internal:3000' })); } " +
    "catch (error) { process.stderr.write((error instanceof Error ? error.message : String(error)) + '\\n'); }",
].join('\n');
const preloadOrderProbe = spawnSync(
  process.execPath,
  ['--require', preloadPath, '--import', 'tsx', '--input-type=module', '--eval', orderProbeSource],
  {
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
    encoding: 'utf8',
    env: {
      ...process.env,
      VTS_RUNTIME_BOUNDARY: 'controlled-synthetic-runtime-handoff-v1',
    },
  },
);
assert.equal(preloadOrderProbe.status, 0, preloadOrderProbe.stderr);
const activeMarker = '[synthetic-egress] active';
const guardDiagnostic =
  'Synthetic handoff refused [' + SYNTHETIC_RUNTIME_RULES.PROTECTED_VALUE_SIGNAL + ']';
assert.ok(preloadOrderProbe.stderr.indexOf(activeMarker) >= 0);
assert.ok(
  preloadOrderProbe.stderr.indexOf(activeMarker) <
    preloadOrderProbe.stderr.indexOf(guardDiagnostic),
);
assert.ok(!preloadOrderProbe.stderr.includes('retained-helper'));
assert.ok(!preloadOrderProbe.stderr.includes('railway.internal'));

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
