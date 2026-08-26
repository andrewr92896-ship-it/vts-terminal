import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createClient, type Client } from '@libsql/client';
import {
  EPHEMERAL_AUTH_TABLES,
  prepareOfflineCandidate,
} from './offlineMigration.js';
import {
  OFFLINE_DISABLED_SIDE_EFFECTS,
  OFFLINE_REHEARSAL_BOUNDARY,
  assertNormalServerBoundary,
} from '../runtimeBoundary.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(HERE, '..', '..');
const FIXTURE_MANIFEST = path.join(HERE, 'fixtures', 'offline-migration-manifest.json');
const JOURNAL = path.join(API_ROOT, 'migrations', 'meta', '_journal.json');
const SAFE_ENV: NodeJS.ProcessEnv = {
  VTS_RUNTIME_BOUNDARY: OFFLINE_REHEARSAL_BOUNDARY,
  NODE_ENV: 'test',
};

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const CIPHERTEXT_SENTINEL = 'v2:deadbeef:fixture-iv:fixture-tag:fixture-ciphertext';
const SETTING_SENTINEL = 'fixture-setting-value-must-never-enter-report';

interface CaseFiles {
  root: string;
  source: string;
  destination: string;
  manifest: string;
  report: string;
}

function readManifest(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(FIXTURE_MANIFEST, 'utf8')) as Record<string, unknown>;
}

async function createLegacyFixture(file: string, orphan = false): Promise<void> {
  const client = createClient({ url: pathToFileURL(file).href });
  try {
    await client.execute('PRAGMA foreign_keys = ON');
    await client.batch(
      [
        `CREATE TABLE users (
          id text PRIMARY KEY NOT NULL,
          username text NOT NULL
        )`,
        `CREATE TABLE sessions (
          id text PRIMARY KEY NOT NULL,
          user_id text NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )`,
        `CREATE TABLE employee_sessions (
          id text PRIMARY KEY NOT NULL,
          user_id text NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )`,
        `CREATE TABLE business_trades (
          id text PRIMARY KEY NOT NULL,
          owner_id text NOT NULL,
          instrument text NOT NULL,
          FOREIGN KEY (owner_id) REFERENCES users(id)
        )`,
        `CREATE TABLE memberships (
          id text PRIMARY KEY NOT NULL,
          user_id text NOT NULL,
          role text NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )`,
        `CREATE TABLE app_settings (
          key text PRIMARY KEY NOT NULL,
          value text NOT NULL
        )`,
        `CREATE TABLE broker_connections (
          id text PRIMARY KEY NOT NULL,
          user_id text NOT NULL,
          broker text NOT NULL,
          secret_enc text NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )`,
        `CREATE TABLE side_effect_audit (
          category text PRIMARY KEY NOT NULL,
          events integer DEFAULT 0 NOT NULL
        )`,
        `CREATE TABLE __drizzle_migrations (
          id integer PRIMARY KEY AUTOINCREMENT,
          hash text NOT NULL,
          created_at numeric NOT NULL
        )`,
      ],
      'write',
    );

    await client.batch(
      [
        { sql: 'INSERT INTO users (id, username) VALUES (?, ?)', args: [USER_A, 'fixture-a'] },
        { sql: 'INSERT INTO users (id, username) VALUES (?, ?)', args: [USER_B, 'fixture-b'] },
        {
          sql: 'INSERT INTO sessions (id, user_id) VALUES (?, ?)',
          args: ['fixture-session', USER_A],
        },
        {
          sql: 'INSERT INTO employee_sessions (id, user_id) VALUES (?, ?)',
          args: ['fixture-employee-session', USER_B],
        },
        {
          sql: 'INSERT INTO business_trades (id, owner_id, instrument) VALUES (?, ?, ?)',
          args: ['trade-a', USER_A, 'EUR_USD'],
        },
        {
          sql: 'INSERT INTO business_trades (id, owner_id, instrument) VALUES (?, ?, ?)',
          args: ['trade-b', USER_B, 'BTC_USD'],
        },
        {
          sql: 'INSERT INTO memberships (id, user_id, role) VALUES (?, ?, ?)',
          args: ['membership-a', USER_A, 'owner'],
        },
        {
          sql: 'INSERT INTO memberships (id, user_id, role) VALUES (?, ?, ?)',
          args: ['membership-b', USER_B, 'member'],
        },
        {
          sql: 'INSERT INTO app_settings (key, value) VALUES (?, ?)',
          args: ['feature.alpha', SETTING_SENTINEL],
        },
        {
          sql: 'INSERT INTO app_settings (key, value) VALUES (?, ?)',
          args: ['feature.beta', 'another-private-fixture-value'],
        },
        {
          sql:
            'INSERT INTO broker_connections (id, user_id, broker, secret_enc) VALUES (?, ?, ?, ?)',
          args: ['broker-a', USER_A, 'oanda', CIPHERTEXT_SENTINEL],
        },
        {
          sql: 'INSERT INTO side_effect_audit (category, events) VALUES (?, 0)',
          args: ['all-side-effects'],
        },
      ],
      'write',
    );

    const journal = JSON.parse(fs.readFileSync(JOURNAL, 'utf8')) as {
      entries: Array<{ when: number; tag: string }>;
    };
    assert.equal(journal.entries.length, 138);
    await client.batch(
      journal.entries.slice(0, 135).map((entry) => ({
        sql: 'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
        args: ['fixture-' + entry.tag, entry.when],
      })),
      'write',
    );

    if (orphan) {
      await client.execute('PRAGMA foreign_keys = OFF');
      await client.execute({
        sql: 'INSERT INTO memberships (id, user_id, role) VALUES (?, ?, ?)',
        args: ['orphan-membership', '33333333-3333-4333-8333-333333333333', 'member'],
      });
      await client.execute('PRAGMA foreign_keys = ON');
    }
  } finally {
    client.close();
  }
}

async function makeCase(label: string, orphan = false): Promise<CaseFiles> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vts-offline-' + label + '-'));
  const snapshotDir = path.join(root, 'snapshot');
  const candidateDir = path.join(root, 'candidate');
  fs.mkdirSync(snapshotDir);
  fs.mkdirSync(candidateDir);
  const source = path.join(snapshotDir, 'legacy.snapshot.db');
  const destination = path.join(candidateDir, 'private.candidate.db');
  const manifest = path.join(root, 'manifest.json');
  const report = path.join(candidateDir, 'reconciliation.json');
  await createLegacyFixture(source, orphan);
  fs.copyFileSync(FIXTURE_MANIFEST, manifest);
  return { root, source, destination, manifest, report };
}

async function count(client: Client, table: string): Promise<number> {
  const result = await client.execute('SELECT COUNT(*) AS count FROM "' + table + '"');
  return Number((result.rows[0] as Record<string, unknown>).count);
}

function options(files: CaseFiles, overrides: Record<string, unknown> = {}) {
  return {
    source: files.source,
    destination: files.destination,
    manifestPath: files.manifest,
    reportPath: files.report,
    from: 135,
    to: 138,
    destinationCredentialKeyId: 'deadbeef',
    env: SAFE_ENV,
    ...overrides,
  };
}

async function expectRefusal(
  label: string,
  action: () => Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  await assert.rejects(action, pattern, label);
  console.log('  ok   refuses ' + label);
}

async function main(): Promise<void> {
  const roots: string[] = [];
  try {
    console.log('\nOffline boundary');
    assert.throws(
      () => assertNormalServerBoundary(SAFE_ENV),
      /Normal server startup refuses/,
    );
    assert.deepEqual(
      [...OFFLINE_DISABLED_SIDE_EFFECTS],
      [
        'server-listen',
        'seed',
        'bootstrap',
        'backfill',
        'demo-refresh',
        'leader-repair',
        'credential-reencryption',
        'content-rewrite',
        'email-delivery',
        'broker-watchers',
        'market-watchers',
        'notification-watchers',
        'reconciliation-watchers',
        'external-network',
      ],
    );
    const blockedStart = spawnSync('npm', ['exec', '--', 'tsx', 'src/start.ts'], {
      cwd: API_ROOT,
      env: {
        ...process.env,
        VTS_RUNTIME_BOUNDARY: OFFLINE_REHEARSAL_BOUNDARY,
        NODE_ENV: 'test',
        DATABASE_URL: '',
        PRIVATE_DATABASE_URL: '',
      },
      encoding: 'utf8',
      shell: true,
      timeout: 10_000,
    });
    const blockedOutput = (blockedStart.stdout ?? '') + (blockedStart.stderr ?? '');
    assert.equal(blockedStart.status, 2, blockedOutput);
    assert.match(blockedOutput, /Normal server startup refuses/);
    assert.doesNotMatch(blockedOutput, /\[db\]|listening on port|Invalid environment configuration/);
    console.log('  ok   rehearsal exits before importing the normal server');

    console.log('\n135 → 138 fixture rehearsal');
    const success = await makeCase('success');
    roots.push(success.root);
    const sourceHash = fs.readFileSync(success.source);
    await prepareOfflineCandidate(options(success));
    assert.deepEqual(fs.readFileSync(success.source), sourceHash);
    assert.equal(fs.existsSync(success.destination), true);
    assert.equal(fs.existsSync(success.report), true);

    const reportText = fs.readFileSync(success.report, 'utf8');
    assert.doesNotMatch(reportText, new RegExp(CIPHERTEXT_SENTINEL));
    assert.doesNotMatch(reportText, new RegExp(SETTING_SENTINEL));
    const report = JSON.parse(reportText) as {
      migrationsApplied: string[];
      safetyBoundary: { credentialDecryptionAttempted: boolean; externalNetworkAllowed: boolean };
      userMapping: { complete: boolean; identitiesIncluded: boolean };
    };
    assert.deepEqual(report.migrationsApplied, [
      '0136_password_reset_credentials',
      '0137_terminal_email_2fa',
      '0138_broker_credential_state',
    ]);
    assert.equal(report.safetyBoundary.credentialDecryptionAttempted, false);
    assert.equal(report.safetyBoundary.externalNetworkAllowed, false);
    assert.equal(report.userMapping.complete, true);
    assert.equal(report.userMapping.identitiesIncluded, false);

    const candidate = createClient({ url: pathToFileURL(success.destination).href });
    try {
      assert.equal(await count(candidate, '__drizzle_migrations'), 138);
      assert.equal(await count(candidate, 'users'), 2);
      assert.equal(await count(candidate, 'business_trades'), 2);
      assert.equal(await count(candidate, 'memberships'), 2);
      assert.equal(await count(candidate, 'app_settings'), 2);
      assert.equal(await count(candidate, 'broker_connections'), 1);
      const brokerStates = await candidate.execute(
        'SELECT credential_state, COUNT(*) AS count FROM broker_connections GROUP BY credential_state',
      );
      assert.deepEqual(
        brokerStates.rows.map((row) => ({
          state: String((row as Record<string, unknown>).credential_state),
          count: Number((row as Record<string, unknown>).count),
        })),
        [{ state: 'ready', count: 1 }],
      );
      assert.equal(await count(candidate, 'sessions'), 0);
      assert.equal(await count(candidate, 'employee_sessions'), 0);
      for (const table of [
        'password_reset_credentials',
        'login_challenges',
        'terminal_trusted_devices',
        'terminal_auth_limits',
      ]) {
        assert.equal(await count(candidate, table), 0);
      }
      const trades = await candidate.execute(
        'SELECT id, owner_id, instrument FROM business_trades ORDER BY id',
      );
      assert.deepEqual(
        trades.rows.map((row) => ({ ...row })),
        [
          { id: 'trade-a', owner_id: USER_A, instrument: 'EUR_USD' },
          { id: 'trade-b', owner_id: USER_B, instrument: 'BTC_USD' },
        ],
      );
      assert.equal(await count(candidate, 'side_effect_audit'), 1);
      const sideEffects = await candidate.execute({
        sql: 'SELECT events FROM side_effect_audit WHERE category = ?',
        args: ['all-side-effects'],
      });
      assert.equal(Number((sideEffects.rows[0] as Record<string, unknown>).events), 0);
      assert.equal((await candidate.execute('PRAGMA foreign_key_check')).rows.length, 0);
    } finally {
      candidate.close();
    }
    console.log('  ok   preserves business IDs, counts, owners, keys, hashes and relationships');
    console.log('  ok   adds auth schema and clears only the explicit ephemeral allowlist');
    console.log('  ok   performs zero startup, mail, broker, market or watcher side effects');

    console.log('\nRefusal cases');
    const inPlace = await makeCase('in-place');
    roots.push(inPlace.root);
    await expectRefusal(
      'in-place operation',
      () => prepareOfflineCandidate(options(inPlace, { destination: inPlace.source })),
      /source and destination must be distinct/,
    );

    await expectRefusal(
      'live service URL',
      () =>
        prepareOfflineCandidate(
          options(inPlace, { source: 'libsql:\/\/live-service.example.invalid/database' }),
        ),
      /service URLs/,
    );

    const ambiguous = await makeCase('same-directory');
    roots.push(ambiguous.root);
    await expectRefusal(
      'non-isolated destination',
      () =>
        prepareOfflineCandidate(
          options(ambiguous, {
            destination: path.join(path.dirname(ambiguous.source), 'private.candidate.db'),
          }),
        ),
      /isolated in a different directory/,
    );

    const wrongLevel = await makeCase('migration-level');
    roots.push(wrongLevel.root);
    const levelClient = createClient({ url: pathToFileURL(wrongLevel.source).href });
    try {
      await levelClient.execute(
        'DELETE FROM __drizzle_migrations WHERE id = (SELECT MAX(id) FROM __drizzle_migrations)',
      );
    } finally {
      levelClient.close();
    }
    await expectRefusal(
      'unexpected source migration level',
      () => prepareOfflineCandidate(options(wrongLevel)),
      /migration level is 134; expected 135/,
    );

    const missingSetting = await makeCase('missing-setting');
    roots.push(missingSetting.root);
    const settingManifest = readManifest();
    (settingManifest.requiredAppSettingKeys as string[]).push('feature.missing');
    fs.writeFileSync(missingSetting.manifest, JSON.stringify(settingManifest, null, 2));
    await expectRefusal(
      'missing required app-setting key',
      () => prepareOfflineCandidate(options(missingSetting)),
      /required app-setting keys are missing/,
    );

    const mismatch = await makeCase('key-mismatch');
    roots.push(mismatch.root);
    await expectRefusal(
      'credential key mismatch',
      () =>
        prepareOfflineCandidate(
          options(mismatch, { destinationCredentialKeyId: 'cafebabe' }),
        ),
      /incompatible with the destination key identifier/,
    );

    const incomplete = await makeCase('incomplete-mapping');
    roots.push(incomplete.root);
    const incompleteManifest = readManifest();
    incompleteManifest.userIdMappings = (
      incompleteManifest.userIdMappings as unknown[]
    ).slice(0, 1);
    fs.writeFileSync(incomplete.manifest, JSON.stringify(incompleteManifest, null, 2));
    await expectRefusal(
      'incomplete user mapping',
      () => prepareOfflineCandidate(options(incomplete)),
      /user mapping is incomplete/,
    );

    const badCount = await makeCase('count-mismatch');
    roots.push(badCount.root);
    const countManifest = readManifest();
    (countManifest.expectedCounts as Record<string, number>).business_trades = 3;
    fs.writeFileSync(badCount.manifest, JSON.stringify(countManifest, null, 2));
    await expectRefusal(
      'record count mismatch',
      () => prepareOfflineCandidate(options(badCount)),
      /record count mismatch/,
    );

    const integrity = await makeCase('integrity-error', true);
    roots.push(integrity.root);
    const integrityManifest = readManifest();
    (integrityManifest.expectedCounts as Record<string, number>).memberships = 3;
    fs.writeFileSync(integrity.manifest, JSON.stringify(integrityManifest, null, 2));
    await expectRefusal(
      'foreign-key integrity error',
      () => prepareOfflineCandidate(options(integrity)),
      /foreign-key integrity check/,
    );

    const liveEnv = await makeCase('railway-env');
    roots.push(liveEnv.root);
    await expectRefusal(
      'Railway environment',
      () =>
        prepareOfflineCandidate(
          options(liveEnv, {
            env: {
              ...SAFE_ENV,
              RAILWAY_SERVICE_ID: 'synthetic-refusal-sentinel',
            },
          }),
        ),
      /Railway service environment/,
    );

    assert.deepEqual([...EPHEMERAL_AUTH_TABLES], [
      'sessions',
      'employee_sessions',
      'password_reset_credentials',
      'login_challenges',
      'terminal_trusted_devices',
      'terminal_auth_limits',
    ]);
    console.log('\nAll offline migration safety checks passed.\n');
  } finally {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
