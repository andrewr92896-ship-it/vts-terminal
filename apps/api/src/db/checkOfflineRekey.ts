import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  createOfflineCredentialKey,
  decryptOfflineCredential,
  encryptOfflineCredential,
} from '../security/offlineCredentialEnvelope.js';
import { OFFLINE_REKEY_BOUNDARY } from '../runtimeBoundary.js';
import { rekeyOfflineCandidate, type OfflineRekeyOptions } from './offlineRekey.js';

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const JOURNAL = path.join(API_ROOT, 'migrations', 'meta', '_journal.json');
const SAFE_ENV: NodeJS.ProcessEnv = {
  VTS_RUNTIME_BOUNDARY: OFFLINE_REKEY_BOUNDARY,
  NODE_ENV: 'test',
  DATABASE_URL: '',
  PRIVATE_DATABASE_URL: '',
};

const USERS = [
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003',
];
const PLAINTEXTS = [
  JSON.stringify({ token: 'synthetic-token-one', accountId: 'synthetic-account-one', env: 'practice' }),
  JSON.stringify({ token: 'synthetic-token-two', accountId: 'synthetic-account-two', env: 'live' }),
  JSON.stringify({ apiKey: 'synthetic-api-key', apiSecret: 'synthetic-private-key' }),
];

interface CaseFiles {
  root: string;
  source: string;
  destination: string;
  manifest: string;
  report: string;
}

function historicalEnvelope(plaintext: string, rawKey: string): string {
  const key = crypto
    .createHash('sha256')
    .update('vts-credentials:', 'utf8')
    .update(rawKey.trim(), 'utf8')
    .digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  try {
    return ['v1', iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
  } finally {
    key.fill(0);
    iv.fill(0);
    tag.fill(0);
    ciphertext.fill(0);
  }
}

function currentEnvelope(
  plaintext: string,
  rawKey: string,
  userId: string,
  connectionId: string,
): string {
  const input = Buffer.from(rawKey, 'utf8');
  const key = createOfflineCredentialKey(input);
  input.fill(0);
  try {
    const bytes = Buffer.from(plaintext, 'utf8');
    try {
      return encryptOfflineCredential(bytes, { userId, connectionId }, key);
    } finally {
      bytes.fill(0);
    }
  } finally {
    key.destroy();
  }
}

function keyId(rawKey: string): string {
  const input = Buffer.from(rawKey, 'utf8');
  const key = createOfflineCredentialKey(input);
  input.fill(0);
  try {
    return key.keyId;
  } finally {
    key.destroy();
  }
}

function createFixture(file: string, envelopes: string[]): void {
  const db = new DatabaseSync(file);
  try {
    db.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE users (
        id text PRIMARY KEY NOT NULL,
        username text NOT NULL
      );
      CREATE TABLE sessions (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL REFERENCES users(id)
      );
      CREATE TABLE employee_sessions (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL REFERENCES users(id)
      );
      CREATE TABLE business_trades (
        id text PRIMARY KEY NOT NULL,
        owner_id text NOT NULL REFERENCES users(id),
        instrument text NOT NULL
      );
      CREATE TABLE memberships (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL REFERENCES users(id),
        role text NOT NULL
      );
      CREATE TABLE app_settings (
        key text PRIMARY KEY NOT NULL,
        value text NOT NULL
      );
      CREATE TABLE broker_connections (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL REFERENCES users(id),
        broker text NOT NULL,
        label text NOT NULL,
        secret_enc text NOT NULL,
        summary text,
        active integer NOT NULL DEFAULT 1,
        last_status text NOT NULL DEFAULT 'unknown',
        last_error text,
        last_checked_at integer,
        history_start_at integer,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      );
      CREATE TABLE side_effect_audit (
        category text PRIMARY KEY NOT NULL,
        events integer NOT NULL DEFAULT 0
      );
      CREATE TABLE __drizzle_migrations (
        id integer PRIMARY KEY AUTOINCREMENT,
        hash text NOT NULL,
        created_at numeric NOT NULL
      );
    `);
    const user = db.prepare('INSERT INTO users (id, username) VALUES (?, ?)');
    USERS.forEach((id, index) => user.run(id, 'synthetic-user-' + (index + 1)));
    db.prepare('INSERT INTO sessions (id, user_id) VALUES (?, ?)').run('session-one', USERS[0]);
    db.prepare('INSERT INTO employee_sessions (id, user_id) VALUES (?, ?)').run(
      'employee-session-one',
      USERS[1],
    );
    db.prepare(
      'INSERT INTO business_trades (id, owner_id, instrument) VALUES (?, ?, ?)',
    ).run('trade-one', USERS[0], 'EUR_USD');
    db.prepare('INSERT INTO memberships (id, user_id, role) VALUES (?, ?, ?)').run(
      'membership-one',
      USERS[1],
      'member',
    );
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(
      'feature.synthetic',
      'synthetic-setting-private-value',
    );
    const insertBroker = db.prepare(
      `INSERT INTO broker_connections
       (id, user_id, broker, label, secret_enc, summary, active, last_status,
        last_error, last_checked_at, history_start_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insertBroker.run(
      'connection-one',
      USERS[0],
      'oanda',
      'Synthetic OANDA One',
      envelopes[0],
      'Practice synthetic',
      1,
      'ok',
      null,
      1000,
      2000,
      3000,
      4000,
    );
    insertBroker.run(
      'connection-two',
      USERS[1],
      'oanda',
      'Synthetic OANDA Two',
      envelopes[1],
      'Live synthetic',
      0,
      'error',
      'synthetic prior status',
      5000,
      null,
      6000,
      7000,
    );
    insertBroker.run(
      'connection-three',
      USERS[2],
      'kraken',
      'Synthetic Kraken',
      envelopes[2],
      'Key synthetic',
      1,
      'unknown',
      null,
      null,
      null,
      8000,
      9000,
    );
    db.prepare('INSERT INTO side_effect_audit (category, events) VALUES (?, 0)').run(
      'all-external-side-effects',
    );

    const journal = JSON.parse(fs.readFileSync(JOURNAL, 'utf8')) as {
      entries: Array<{ when: number; tag: string }>;
    };
    assert.equal(journal.entries.length, 137);
    const migration = db.prepare(
      'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
    );
    for (const entry of journal.entries.slice(0, 135)) {
      migration.run('synthetic-' + entry.tag, entry.when);
    }
  } finally {
    db.close();
  }
}

function manifest(): Record<string, unknown> {
  return {
    version: 1,
    sourceMigrationLevel: 135,
    destinationMigrationLevel: 137,
    expectedCounts: {
      users: 3,
      business_trades: 1,
      memberships: 1,
      app_settings: 1,
      broker_connections: 3,
      side_effect_audit: 1,
    },
    requiredAppSettingKeys: ['feature.synthetic'],
    hashTables: {
      users: ['id', 'username'],
      business_trades: ['id', 'owner_id', 'instrument'],
      memberships: ['id', 'user_id', 'role'],
      app_settings: ['key'],
      broker_connections: [
        'id',
        'user_id',
        'broker',
        'label',
        'summary',
        'active',
        'last_status',
        'last_error',
        'last_checked_at',
        'history_start_at',
        'created_at',
        'updated_at',
      ],
      side_effect_audit: ['category', 'events'],
    },
  };
}

function makeCase(label: string, envelopes: string[]): CaseFiles {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vts-rekey-' + label + '-'));
  const snapshots = path.join(root, 'snapshots');
  const candidates = path.join(root, 'candidates');
  fs.mkdirSync(snapshots);
  fs.mkdirSync(candidates);
  const source = path.join(snapshots, 'legacy.snapshot.db');
  const destination = path.join(candidates, 'private.candidate.db');
  const manifestPath = path.join(root, 'manifest.json');
  const report = path.join(candidates, 'reconciliation.json');
  createFixture(source, envelopes);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest()), { mode: 0o600 });
  return { root, source, destination, manifest: manifestPath, report };
}

function channel(root: string, label: string, value: string): number {
  const file = path.join(root, '.' + label + '-' + crypto.randomUUID());
  fs.writeFileSync(file, value, { flag: 'wx', mode: 0o600 });
  const fd = fs.openSync(file, 'r');
  fs.unlinkSync(file);
  return fd;
}

async function run(
  files: CaseFiles,
  sourceKey: string,
  targetKey: string,
  overrides: Partial<OfflineRekeyOptions> = {},
): Promise<unknown> {
  const fds = [
    channel(files.root, 'source-key', sourceKey),
    channel(files.root, 'target-key', targetKey),
    channel(files.root, 'source-id', keyId(sourceKey)),
    channel(files.root, 'target-id', keyId(targetKey)),
  ];
  try {
    return await rekeyOfflineCandidate({
      source: files.source,
      destination: files.destination,
      manifestPath: files.manifest,
      reportPath: files.report,
      expectedBusinessTableCount: 6,
      sourceKeyFd: fds[0],
      targetKeyFd: fds[1],
      expectedSourceKeyIdFd: fds[2],
      expectedTargetKeyIdFd: fds[3],
      env: SAFE_ENV,
      ...overrides,
    });
  } finally {
    for (const fd of fds) fs.closeSync(fd);
  }
}

function validEnvelopes(sourceKey: string): string[] {
  return [
    currentEnvelope(PLAINTEXTS[0], sourceKey, USERS[0], 'connection-one'),
    currentEnvelope(PLAINTEXTS[1], sourceKey, USERS[1], 'connection-two'),
    historicalEnvelope(PLAINTEXTS[2], sourceKey),
  ];
}

async function rejection(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
    assert.fail('expected operation to be refused');
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function assertNoLeaks(text: string, secrets: string[], envelopes: string[]): void {
  for (const value of [...secrets, ...PLAINTEXTS, ...envelopes, ...USERS]) {
    assert.equal(text.includes(value), false, 'output leaked protected material');
  }
  for (const secret of secrets) {
    assert.equal(text.includes(keyId(secret)), false, 'output leaked a full key identifier');
  }
}

async function main(): Promise<void> {
  const roots: string[] = [];
  const sourceKey = crypto.randomBytes(32).toString('base64');
  const targetKey = crypto.randomBytes(32).toString('base64');
  const otherKey = crypto.randomBytes(32).toString('base64');
  try {
    console.log('\nOffline credential re-key success');
    const envelopes = validEnvelopes(sourceKey);
    const success = makeCase('success', envelopes);
    roots.push(success.root);
    const sourceBefore = fs.readFileSync(success.source);
    const result = (await run(success, sourceKey, targetKey)) as any;
    assert.deepEqual(fs.readFileSync(success.source), sourceBefore);
    assert.equal(result.credentialRows.total, 3);
    assert.equal(result.credentialRows.formats.currentAuthenticated, 2);
    assert.equal(result.credentialRows.formats.historicalAuthenticated, 1);
    assert.equal(result.credentialRows.userReentryRequired, 0);
    assert.equal(result.reconciliation.businessTableCount, 6);
    assert.equal(result.reconciliation.foreignKeyViolations, 0);
    assert.equal(result.reconciliation.authenticationTablesPresentAndEmpty, true);
    const reportText = fs.readFileSync(success.report, 'utf8');
    assertNoLeaks(reportText, [sourceKey, targetKey, otherKey], envelopes);

    const candidate = new DatabaseSync(success.destination, { readOnly: true });
    try {
      assert.equal(
        Number(
          (
            candidate
              .prepare('SELECT COUNT(*) AS count FROM __drizzle_migrations')
              .get() as Record<string, unknown>
          ).count,
        ),
        137,
      );
      const rows = candidate
        .prepare('SELECT id, user_id, secret_enc FROM broker_connections ORDER BY id')
        .all() as Array<Record<string, unknown>>;
      const targetInput = Buffer.from(targetKey, 'utf8');
      const target = createOfflineCredentialKey(targetInput);
      targetInput.fill(0);
      try {
        const expectedByConnection: Record<string, string> = {
          'connection-one': PLAINTEXTS[0],
          'connection-two': PLAINTEXTS[1],
          'connection-three': PLAINTEXTS[2],
        };
        rows.forEach((row) => {
          const opened = decryptOfflineCredential(
            String(row.secret_enc),
            { userId: String(row.user_id), connectionId: String(row.id) },
            target,
          );
          const expected = Buffer.from(expectedByConnection[String(row.id)], 'utf8');
          try {
            assert.equal(opened.plaintext.length, expected.length);
            assert.equal(crypto.timingSafeEqual(opened.plaintext, expected), true);
          } finally {
            opened.plaintext.fill(0);
            expected.fill(0);
          }
        });
      } finally {
        target.destroy();
      }
      assert.equal(
        Number(
          (
            candidate
              .prepare("SELECT events FROM side_effect_audit WHERE category='all-external-side-effects'")
              .get() as Record<string, unknown>
          ).events,
        ),
        0,
      );
      for (const table of [
        'sessions',
        'employee_sessions',
        'password_reset_credentials',
        'login_challenges',
        'terminal_trusted_devices',
        'terminal_auth_limits',
      ]) {
        assert.equal(
          Number(
            (
              candidate
                .prepare('SELECT COUNT(*) AS count FROM "' + table + '"')
                .get() as Record<string, unknown>
            ).count,
          ),
          0,
        );
      }
    } finally {
      candidate.close();
    }
    console.log('  ok   current v2 and exact historical v1 authenticate and re-key');
    console.log('  ok   metadata, counts, hashes, foreign keys and zero side effects reconcile');
    console.log('  ok   report contains no key, key id, plaintext, ciphertext or identity');

    const publishedHash = crypto
      .createHash('sha256')
      .update(fs.readFileSync(success.destination))
      .digest('hex');
    const idempotentError = await rejection(() => run(success, sourceKey, targetKey));
    assert.match(idempotentError, /destination already exists/);
    assert.equal(
      crypto.createHash('sha256').update(fs.readFileSync(success.destination)).digest('hex'),
      publishedHash,
    );
    assertNoLeaks(idempotentError, [sourceKey, targetKey, otherKey], envelopes);
    console.log('  ok   completed retries refuse overwrite and leave the candidate unchanged');

    console.log('\nFail-closed cases');
    const wrongSource = makeCase('wrong-source', validEnvelopes(sourceKey));
    roots.push(wrongSource.root);
    const correctSourceIdFd = channel(
      wrongSource.root,
      'correct-source-id',
      keyId(sourceKey),
    );
    let wrongSourceError: string;
    try {
      wrongSourceError = await rejection(() =>
        run(wrongSource, otherKey, targetKey, {
          expectedSourceKeyIdFd: correctSourceIdFd,
        }),
      );
    } finally {
      fs.closeSync(correctSourceIdFd);
    }
    assert.match(wrongSourceError, /source key identifier validation failed/);
    assert.equal(fs.existsSync(wrongSource.destination), false);
    assertNoLeaks(wrongSourceError, [sourceKey, targetKey, otherKey], validEnvelopes(sourceKey));

    const wrongTarget = makeCase('wrong-target', validEnvelopes(sourceKey));
    roots.push(wrongTarget.root);
    const wrongTargetFd = channel(wrongTarget.root, 'wrong-target-id', keyId(otherKey));
    try {
      const wrongTargetError = await rejection(() =>
        run(wrongTarget, sourceKey, targetKey, { expectedTargetKeyIdFd: wrongTargetFd }),
      );
      assert.match(wrongTargetError, /target key identifier validation failed/);
      assertNoLeaks(wrongTargetError, [sourceKey, targetKey, otherKey], validEnvelopes(sourceKey));
    } finally {
      fs.closeSync(wrongTargetFd);
    }

    const mixed = validEnvelopes(sourceKey);
    mixed[1] = currentEnvelope(PLAINTEXTS[1], otherKey, USERS[1], 'connection-two');
    const mixedCase = makeCase('mixed-key', mixed);
    roots.push(mixedCase.root);
    const mixedError = await rejection(() => run(mixedCase, sourceKey, targetKey));
    assert.match(mixedError, /mixed or unexpected credential key set/);
    assert.equal(fs.existsSync(mixedCase.destination), false);
    assertNoLeaks(mixedError, [sourceKey, targetKey, otherKey], mixed);

    const malformedCases = [
      'v2:bad',
      (() => {
        const forged = currentEnvelope(PLAINTEXTS[0], sourceKey, USERS[0], 'connection-one').split(':');
        const body = forged[4];
        forged[4] = (body[0] === 'A' ? 'B' : 'A') + body.slice(1);
        return forged.join(':');
      })(),
      historicalEnvelope(PLAINTEXTS[0], otherKey),
    ];
    for (const [index, malformed] of malformedCases.entries()) {
      const set = validEnvelopes(sourceKey);
      set[0] = malformed;
      const files = makeCase('malformed-' + index, set);
      roots.push(files.root);
      const message = await rejection(() => run(files, sourceKey, targetKey));
      assert.match(message, /user credential re-entry is required|unsupported/);
      assert.equal(fs.existsSync(files.destination), false);
      assert.equal(fs.existsSync(files.report), false);
      assert.equal(
        fs.readdirSync(path.dirname(files.destination)).some((name) => name.includes('.partial-')),
        false,
      );
      assertNoLeaks(message, [sourceKey, targetKey, otherKey], set);
    }
    console.log('  ok   malformed, truncated, forged, mixed-key and unauthenticated v1 inputs publish nothing');

    const retry = makeCase('retry', validEnvelopes(sourceKey));
    roots.push(retry.root);
    fs.writeFileSync(retry.report, 'occupied', { flag: 'wx' });
    await rejection(() => run(retry, sourceKey, targetKey));
    assert.equal(fs.existsSync(retry.destination), false);
    fs.rmSync(retry.report);
    await run(retry, sourceKey, targetKey);
    assert.equal(fs.existsSync(retry.destination), true);
    console.log('  ok   a clean retry after refusal succeeds without in-place state');

    const paths = makeCase('paths', validEnvelopes(sourceKey));
    roots.push(paths.root);
    const inPlace = await rejection(() =>
      run(paths, sourceKey, targetKey, { destination: paths.source }),
    );
    assert.match(inPlace, /source and destination must be distinct/);
    const live = await rejection(() =>
      run(paths, sourceKey, targetKey, {
        source: 'libsql://live-service.invalid/database',
      }),
    );
    assert.match(live, /service URLs/);
    const liveEnv = await rejection(() =>
      run(paths, sourceKey, targetKey, {
        env: { ...SAFE_ENV, RAILWAY_SERVICE_ID: 'synthetic-host-marker' },
      }),
    );
    assert.match(liveEnv, /Railway service environment/);
    assertNoLeaks(inPlace + live + liveEnv, [sourceKey, targetKey, otherKey], validEnvelopes(sourceKey));
    console.log('  ok   in-place, live URL and hosted-service paths are refused');

    const cliSource = fs.readFileSync(path.join(API_ROOT, 'src', 'db', 'offlineRekeyCli.ts'), 'utf8');
    const dynamicImport = cliSource.indexOf("await import('./offlineRekey.js')");
    const boundaryCall = cliSource.indexOf('assertOfflineRekeyBoundary();');
    assert.ok(boundaryCall >= 0 && boundaryCall < dynamicImport);
    assert.equal(/from ['"].*(server|mail|broker|watch)/i.test(cliSource), false);
    assert.match(cliSource, /Literal credential or key arguments are forbidden/);
    console.log('  ok   runtime boundary executes before database modules and literal secret arguments are forbidden');
    console.log('\nAll offline broker credential re-key checks passed.\n');
  } finally {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : 'offline re-key check failed');
  process.exit(1);
});
