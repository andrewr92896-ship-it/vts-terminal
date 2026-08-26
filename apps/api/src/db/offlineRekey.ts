import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createClient, type Client } from '@libsql/client';
import {
  assertOfflineRekeyBoundary,
  OFFLINE_REKEY_DISABLED_SIDE_EFFECTS,
  OFFLINE_REKEY_BOUNDARY,
} from '../runtimeBoundary.js';
import {
  createOfflineCredentialKey,
  decryptOfflineCredential,
  encryptOfflineCredential,
  envelopeFormat,
  storedCurrentKeyId,
  type OfflineEnvelopeFormat,
} from '../security/offlineCredentialEnvelope.js';
import {
  applyIntendedMigrations,
  EPHEMERAL_AUTH_TABLES,
  EXPECTED_DESTINATION_LEVEL,
  EXPECTED_SOURCE_LEVEL,
} from './offlineMigration.js';

const PROVIDERS = ['oanda', 'kraken', 'manual'] as const;
type Provider = (typeof PROVIDERS)[number];

interface Manifest {
  version: 1;
  sourceMigrationLevel: number;
  destinationMigrationLevel: number;
  expectedCounts: Record<string, number>;
  requiredAppSettingKeys: string[];
  hashTables: Record<string, string[]>;
}

export interface OfflineRekeyOptions {
  source: string;
  destination: string;
  manifestPath: string;
  reportPath: string;
  expectedBusinessTableCount: number;
  sourceKeyFd: number;
  targetKeyFd: number;
  expectedSourceKeyIdFd: number;
  expectedTargetKeyIdFd: number;
  env?: NodeJS.ProcessEnv;
}

interface QueryClient {
  execute(statement: any): Promise<{ rows: readonly unknown[] }>;
}

interface Reconciliation {
  counts: Record<string, number>;
  hashes: Record<string, string>;
  requiredSettingKeyHash: string;
  brokerMetadataHash: string;
  foreignKeyViolations: number;
}

interface BrokerRow {
  id: string;
  userId: string;
  provider: Provider;
  envelope: string;
}

function fail(message: string): never {
  throw new Error('Offline credential re-key refused: ' + message);
}

function safeIdentifier(value: string, label: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) fail(label + ' contains an unsafe SQL identifier');
  return '"' + value + '"';
}

function looksLikeServiceUrl(value: string): boolean {
  return /^(?:file|https?|libsql|postgres(?:ql)?|mysql|railway):/i.test(value.trim());
}

function requireSource(value: string): string {
  if (looksLikeServiceUrl(value)) fail('service URLs are not accepted');
  const resolved = path.resolve(value);
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(resolved);
  } catch {
    fail('source snapshot is not readable');
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail('source must be a regular non-symlink file');
  }
  if (!/\.snapshot\.(?:db|sqlite)$/i.test(path.basename(resolved))) {
    fail('source filename must end in .snapshot.db or .snapshot.sqlite');
  }
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(resolved + suffix)) fail('source snapshot has a live SQLite sidecar');
  }
  return fs.realpathSync(resolved);
}

function requireDestination(source: string, value: string): string {
  if (looksLikeServiceUrl(value)) fail('destination must be a local path');
  const resolved = path.resolve(value);
  if (resolved === source) fail('source and destination must be distinct');
  if (!/\.candidate\.(?:db|sqlite)$/i.test(path.basename(resolved))) {
    fail('destination filename must end in .candidate.db or .candidate.sqlite');
  }
  if (fs.existsSync(resolved)) fail('destination already exists');
  const parent = fs.realpathSync(path.dirname(resolved));
  if (parent === fs.realpathSync(path.dirname(source))) {
    fail('destination must be isolated in a different directory');
  }
  return path.join(parent, path.basename(resolved));
}

function requireReport(value: string, destination: string): string {
  if (looksLikeServiceUrl(value)) fail('report must be a local path');
  const resolved = path.resolve(value);
  if (!/\.json$/i.test(path.basename(resolved))) fail('report filename must end in .json');
  if (resolved === destination) fail('report and candidate destinations must be distinct');
  if (fs.existsSync(resolved)) fail('report destination already exists');
  const parent = fs.realpathSync(path.dirname(resolved));
  return path.join(parent, path.basename(resolved));
}

function readChannel(fd: number, label: string, maxBytes: number): Buffer {
  if (!Number.isInteger(fd) || fd < 3) fail(label + ' must be an inherited file descriptor');
  let value: Buffer;
  try {
    value = fs.readFileSync(fd);
  } catch {
    fail(label + ' channel could not be read');
  }
  if (value.length === 0 || value.length > maxBytes) {
    value.fill(0);
    fail(label + ' channel has an invalid length');
  }
  return value;
}

function expectedKeyId(fd: number, label: string): string {
  const input = readChannel(fd, label, 64);
  try {
    const value = input.toString('utf8').trim().toLowerCase();
    if (!/^[0-9a-f]{8}$/.test(value)) fail(label + ' is not a valid key identifier');
    return value;
  } finally {
    input.fill(0);
  }
}

function parseManifest(file: string, expectedTableCount: number): Manifest {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    fail('manifest is not readable JSON');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('manifest must be an object');
  const value = raw as Record<string, unknown>;
  if (value.version !== 1) fail('manifest.version must be 1');
  if (
    value.sourceMigrationLevel !== EXPECTED_SOURCE_LEVEL ||
    value.destinationMigrationLevel !== EXPECTED_DESTINATION_LEVEL
  ) {
    fail('manifest must describe only the audited 135 to 137 transition');
  }
  if (!Number.isInteger(expectedTableCount) || expectedTableCount < 1) {
    fail('expected business table count must be a positive integer');
  }

  const countsRaw = value.expectedCounts;
  if (!countsRaw || typeof countsRaw !== 'object' || Array.isArray(countsRaw)) {
    fail('expectedCounts must be an object');
  }
  const expectedCounts: Record<string, number> = {};
  for (const [table, count] of Object.entries(countsRaw as Record<string, unknown>)) {
    safeIdentifier(table, 'expectedCounts');
    if (!Number.isInteger(count) || Number(count) < 0) {
      fail('every expected count must be a non-negative integer');
    }
    if ((EPHEMERAL_AUTH_TABLES as readonly string[]).includes(table)) {
      fail('ephemeral authentication tables are not business tables');
    }
    expectedCounts[table] = Number(count);
  }
  if (Object.keys(expectedCounts).length !== expectedTableCount) {
    fail('manifest business table count does not match the required count');
  }
  if (expectedCounts.broker_connections == null) {
    fail('manifest must include broker_connections');
  }

  if (
    !Array.isArray(value.requiredAppSettingKeys) ||
    value.requiredAppSettingKeys.some((item) => typeof item !== 'string' || !item.trim())
  ) {
    fail('requiredAppSettingKeys must be an array of non-empty strings');
  }
  const requiredAppSettingKeys = (value.requiredAppSettingKeys as string[]).map((item) =>
    item.trim(),
  );
  if (
    requiredAppSettingKeys.length === 0 ||
    new Set(requiredAppSettingKeys).size !== requiredAppSettingKeys.length
  ) {
    fail('requiredAppSettingKeys must be non-empty and unique');
  }

  const hashesRaw = value.hashTables;
  if (!hashesRaw || typeof hashesRaw !== 'object' || Array.isArray(hashesRaw)) {
    fail('hashTables must be an object');
  }
  const hashTables: Record<string, string[]> = {};
  for (const table of Object.keys(expectedCounts)) {
    safeIdentifier(table, 'hashTables');
    const rawColumns = (hashesRaw as Record<string, unknown>)[table];
    if (
      !Array.isArray(rawColumns) ||
      rawColumns.length === 0 ||
      rawColumns.some((item) => typeof item !== 'string' || !item)
    ) {
      fail('every business table must have a non-empty hash column list');
    }
    const columns = rawColumns as string[];
    if (new Set(columns).size !== columns.length) fail('hash column lists must be unique');
    for (const column of columns) {
      safeIdentifier(column, 'hashTables');
      if (/secret|password|token|nonce|cipher|private_key|api_key/i.test(column)) {
        fail('hashTables contains a sensitive column');
      }
    }
    hashTables[table] = columns;
  }
  if (Object.keys(hashesRaw as Record<string, unknown>).length !== expectedTableCount) {
    fail('hashTables must exactly cover the business table set');
  }

  return {
    version: 1,
    sourceMigrationLevel: EXPECTED_SOURCE_LEVEL,
    destinationMigrationLevel: EXPECTED_DESTINATION_LEVEL,
    expectedCounts,
    requiredAppSettingKeys,
    hashTables,
  };
}

function sha256File(file: string): string {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  try {
    for (;;) {
      const read = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (read === 0) break;
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    buffer.fill(0);
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

async function tableExists(client: QueryClient, table: string): Promise<boolean> {
  const result = await client.execute({
    sql: "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
    args: [table],
  });
  return result.rows.length === 1;
}

async function migrationLevel(client: QueryClient): Promise<number> {
  if (!(await tableExists(client, '__drizzle_migrations'))) return 0;
  const result = await client.execute('SELECT COUNT(*) AS count FROM "__drizzle_migrations"');
  return Number((result.rows[0] as Record<string, unknown>).count);
}

function canonical(rows: readonly unknown[]): string {
  return JSON.stringify(
    rows.map((row) => {
      const input = row as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(input).sort()) {
        const value = input[key];
        out[key] = Buffer.isBuffer(value) ? { bytes: value.toString('base64') } : value;
      }
      return out;
    }),
  );
}

async function tableHash(
  client: QueryClient,
  table: string,
  columns: readonly string[],
): Promise<string> {
  if (!(await tableExists(client, table))) fail('an expected business table is missing');
  const selected = columns.map((column) => safeIdentifier(column, 'hash column')).join(', ');
  const ordered = columns.map((column) => safeIdentifier(column, 'hash order')).join(', ');
  const rows = await client.execute(
    'SELECT ' + selected + ' FROM ' + safeIdentifier(table, 'hash table') +
      ' ORDER BY ' + ordered,
  );
  return crypto.createHash('sha256').update(canonical(rows.rows)).digest('hex');
}

async function brokerMetadataColumns(client: QueryClient): Promise<string[]> {
  const info = await client.execute('PRAGMA table_info("broker_connections")');
  const columns = info.rows
    .map((row) => String((row as Record<string, unknown>).name))
    .filter((column) => column !== 'secret_enc');
  if (columns.length === 0 || columns.includes('secret_enc')) {
    fail('broker connection schema could not be reconciled safely');
  }
  return columns;
}

async function reconcile(
  client: QueryClient,
  manifest: Manifest,
  expectedLevel: number,
): Promise<Reconciliation> {
  if ((await migrationLevel(client)) !== expectedLevel) {
    fail('database migration level does not match the audited transition');
  }
  const counts: Record<string, number> = {};
  const hashes: Record<string, string> = {};
  for (const [table, expected] of Object.entries(manifest.expectedCounts)) {
    if (!(await tableExists(client, table))) fail('an expected business table is missing');
    const result = await client.execute(
      'SELECT COUNT(*) AS count FROM ' + safeIdentifier(table, 'count table'),
    );
    const actual = Number((result.rows[0] as Record<string, unknown>).count);
    if (actual !== expected) fail('a business table count did not reconcile');
    counts[table] = actual;
    hashes[table] = await tableHash(client, table, manifest.hashTables[table]);
  }

  const placeholders = manifest.requiredAppSettingKeys.map(() => '?').join(', ');
  const settings = await client.execute({
    sql: 'SELECT key FROM app_settings WHERE key IN (' + placeholders + ') ORDER BY key',
    args: manifest.requiredAppSettingKeys,
  });
  const keys = settings.rows.map((row) => String((row as Record<string, unknown>).key));
  if (
    keys.length !== manifest.requiredAppSettingKeys.length ||
    manifest.requiredAppSettingKeys.some((key) => !keys.includes(key))
  ) {
    fail('required application-setting keys did not reconcile');
  }
  const requiredSettingKeyHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(keys))
    .digest('hex');

  const metadataColumns = await brokerMetadataColumns(client);
  const brokerMetadataHash = await tableHash(client, 'broker_connections', metadataColumns);
  const foreignKeys = await client.execute('PRAGMA foreign_key_check');
  if (foreignKeys.rows.length !== 0) fail('foreign-key reconciliation failed');

  return {
    counts,
    hashes,
    requiredSettingKeyHash,
    brokerMetadataHash,
    foreignKeyViolations: 0,
  };
}

async function brokerRows(client: QueryClient): Promise<BrokerRow[]> {
  const result = await client.execute(
    'SELECT id, user_id, broker, secret_enc FROM broker_connections ORDER BY id',
  );
  return result.rows.map((raw) => {
    const row = raw as Record<string, unknown>;
    const provider = String(row.broker);
    if (!(PROVIDERS as readonly string[]).includes(provider)) {
      fail('broker rows contain an unsupported provider category');
    }
    return {
      id: String(row.id),
      userId: String(row.user_id),
      provider: provider as Provider,
      envelope: String(row.secret_enc),
    };
  });
}

async function clearEphemeralAuth(client: Client): Promise<Record<string, number>> {
  const cleared: Record<string, number> = {};
  for (const table of EPHEMERAL_AUTH_TABLES) {
    if (!(await tableExists(client, table))) {
      cleared[table] = 0;
      continue;
    }
    const before = await client.execute(
      'SELECT COUNT(*) AS count FROM ' + safeIdentifier(table, 'authentication table'),
    );
    cleared[table] = Number((before.rows[0] as Record<string, unknown>).count);
    await client.execute('DELETE FROM ' + safeIdentifier(table, 'authentication table'));
    const after = await client.execute(
      'SELECT COUNT(*) AS count FROM ' + safeIdentifier(table, 'authentication table'),
    );
    if (Number((after.rows[0] as Record<string, unknown>).count) !== 0) {
      fail('an ephemeral authentication table did not clear');
    }
  }
  return cleared;
}

class ReadOnlySnapshot implements QueryClient {
  private readonly database: DatabaseSync;

  constructor(file: string) {
    this.database = new DatabaseSync(file, { readOnly: true });
  }

  async execute(statement: any): Promise<{ rows: readonly unknown[] }> {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    const args = typeof statement === 'string' ? [] : statement.args;
    return {
      rows: this.database
        .prepare(sql)
        .all(...(args as Array<string | number | bigint | null>)),
    };
  }

  close(): void {
    this.database.close();
  }
}

function equalRecord(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function rekeyOfflineCandidate(options: OfflineRekeyOptions): Promise<unknown> {
  assertOfflineRekeyBoundary(options.env);
  const source = requireSource(options.source);
  const destination = requireDestination(source, options.destination);
  const reportPath = requireReport(options.reportPath, destination);
  const manifest = parseManifest(options.manifestPath, options.expectedBusinessTableCount);

  const sourceKeyInput = readChannel(options.sourceKeyFd, 'source key', 4096);
  const targetKeyInput = readChannel(options.targetKeyFd, 'target key', 4096);
  const expectedSourceId = expectedKeyId(options.expectedSourceKeyIdFd, 'source key identifier');
  const expectedTargetId = expectedKeyId(options.expectedTargetKeyIdFd, 'target key identifier');
  let sourceKey;
  let targetKey;
  try {
    sourceKey = createOfflineCredentialKey(sourceKeyInput);
    targetKey = createOfflineCredentialKey(targetKeyInput);
  } finally {
    sourceKeyInput.fill(0);
    targetKeyInput.fill(0);
  }
  try {
    if (sourceKey.keyId !== expectedSourceId) fail('source key identifier validation failed');
    if (targetKey.keyId !== expectedTargetId) fail('target key identifier validation failed');
    if (sourceKey.keyId === targetKey.keyId) fail('source and target credential keys must be distinct');

    const sourceHash = sha256File(source);
    const sourceClient = new ReadOnlySnapshot(source);
    let sourceReconciliation: Reconciliation;
    let sourceRows: BrokerRow[];
    try {
      sourceReconciliation = await reconcile(sourceClient, manifest, EXPECTED_SOURCE_LEVEL);
      sourceRows = await brokerRows(sourceClient);
      if (sourceRows.length !== manifest.expectedCounts.broker_connections) {
        fail('broker connection count did not reconcile');
      }
      for (const row of sourceRows) {
        let format: OfflineEnvelopeFormat;
        try {
          format = envelopeFormat(row.envelope);
          if (format === 'current-v2' && storedCurrentKeyId(row.envelope) !== expectedSourceId) {
            fail('broker rows contain a mixed or unexpected credential key set');
          }
        } catch (err) {
          if (err instanceof Error && err.message.startsWith('Offline credential re-key refused:')) {
            throw err;
          }
          fail(
            'an envelope in provider category ' + row.provider +
              ' is unsupported; user credential re-entry is required',
          );
        }
      }
    } finally {
      sourceClient.close();
    }

    const partial = path.join(
      path.dirname(destination),
      '.' + path.basename(destination) + '.partial-' + process.pid + '-' + crypto.randomUUID(),
    );
    const reportPartial =
      reportPath + '.partial-' + process.pid + '-' + crypto.randomUUID();
    let destinationPublished = false;
    try {
      fs.copyFileSync(source, partial, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(partial, 0o600);
      if (sha256File(partial) !== sourceHash) fail('isolated copy did not match the source');

      const candidate = createClient({ url: pathToFileURL(partial).href });
      let currentV2 = 0;
      let historicalV1 = 0;
      let providerCounts: Record<Provider, number> = { oanda: 0, kraken: 0, manual: 0 };
      let destinationReconciliation: Reconciliation;
      let clearedRows: Record<string, number>;
      try {
        await candidate.execute('PRAGMA foreign_keys = ON');
        const rows = await brokerRows(candidate);
        const updates: Array<{ sql: string; args: unknown[] }> = [];
        for (const row of rows) {
          providerCounts[row.provider] += 1;
          let plaintext: Buffer | null = null;
          try {
            const opened = decryptOfflineCredential(
              row.envelope,
              { userId: row.userId, connectionId: row.id },
              sourceKey,
            );
            plaintext = opened.plaintext;
            if (opened.format === 'current-v2') currentV2++;
            else historicalV1++;
            const replacement = encryptOfflineCredential(
              plaintext,
              { userId: row.userId, connectionId: row.id },
              targetKey,
            );
            updates.push({
              sql: 'UPDATE broker_connections SET secret_enc=? WHERE id=? AND user_id=?',
              args: [replacement, row.id, row.userId],
            });
          } catch {
            fail(
              'authenticated decryption failed for provider category ' + row.provider +
                '; user credential re-entry is required and no candidate was published',
            );
          } finally {
            plaintext?.fill(0);
          }
        }
        if (updates.length !== rows.length) fail('not every broker credential was re-keyed');
        if (updates.length > 0) await candidate.batch(updates as any, 'write');

        const updated = await brokerRows(candidate);
        for (const row of updated) {
          if (storedCurrentKeyId(row.envelope) !== expectedTargetId) {
            fail('a candidate envelope does not use the expected target key');
          }
          let plaintext: Buffer | null = null;
          try {
            plaintext = decryptOfflineCredential(
              row.envelope,
              { userId: row.userId, connectionId: row.id },
              targetKey,
            ).plaintext;
          } catch {
            fail('a candidate envelope failed target-key authentication');
          } finally {
            plaintext?.fill(0);
          }
        }

        await applyIntendedMigrations(
          candidate,
          EXPECTED_SOURCE_LEVEL,
          EXPECTED_DESTINATION_LEVEL,
        );
        clearedRows = await clearEphemeralAuth(candidate);
        for (const table of [
          'password_reset_credentials',
          'login_challenges',
          'terminal_trusted_devices',
          'terminal_auth_limits',
        ]) {
          if (!(await tableExists(candidate, table))) {
            fail('expected authentication schema is missing');
          }
        }
        destinationReconciliation = await reconcile(
          candidate,
          manifest,
          EXPECTED_DESTINATION_LEVEL,
        );
      } finally {
        candidate.close();
      }

      if (!equalRecord(sourceReconciliation.counts, destinationReconciliation.counts)) {
        fail('business counts changed during re-key');
      }
      if (!equalRecord(sourceReconciliation.hashes, destinationReconciliation.hashes)) {
        fail('non-secret business hashes changed during re-key');
      }
      if (sourceReconciliation.brokerMetadataHash !== destinationReconciliation.brokerMetadataHash) {
        fail('broker connection metadata changed during re-key');
      }
      if (
        sourceReconciliation.requiredSettingKeyHash !==
        destinationReconciliation.requiredSettingKeyHash
      ) {
        fail('required application-setting keys changed during re-key');
      }
      if (sha256File(source) !== sourceHash) fail('source snapshot changed during re-key');

      const report = {
        version: 1,
        ok: true,
        credentialRows: {
          total: currentV2 + historicalV1,
          providerCategories: providerCounts,
          formats: {
            currentAuthenticated: currentV2,
            historicalAuthenticated: historicalV1,
          },
          remediationStatus: 'all-envelopes-rekeyed',
          userReentryRequired: 0,
        },
        reconciliation: {
          sourceMigrationLevel: EXPECTED_SOURCE_LEVEL,
          destinationMigrationLevel: EXPECTED_DESTINATION_LEVEL,
          businessTableCount: Object.keys(destinationReconciliation.counts).length,
          counts: destinationReconciliation.counts,
          nonSecretHashes: destinationReconciliation.hashes,
          brokerMetadataHash: destinationReconciliation.brokerMetadataHash,
          requiredSettingKeyHash: destinationReconciliation.requiredSettingKeyHash,
          foreignKeyViolations: destinationReconciliation.foreignKeyViolations,
          authenticationTablesPresentAndEmpty: true,
          clearedAuthenticationRows: clearedRows,
        },
        safety: {
          runtimeBoundary: OFFLINE_REKEY_BOUNDARY,
          sourceOpenedNativeReadOnly: true,
          isolatedAtomicPublish: true,
          sourceAndTargetIdentifiersVerified: true,
          targetAuthenticationVerified: true,
          decryptedPlaintextRetained: false,
          externalNetworkAllowed: false,
          disabledSideEffects: [...OFFLINE_REKEY_DISABLED_SIDE_EFFECTS],
        },
      };
      const serialized = JSON.stringify(report, null, 2) + '\n';
      fs.writeFileSync(reportPartial, serialized, { flag: 'wx', mode: 0o600 });
      fs.renameSync(partial, destination);
      destinationPublished = true;
      fs.renameSync(reportPartial, reportPath);
      return report;
    } catch (err) {
      fs.rmSync(partial, { force: true });
      fs.rmSync(reportPartial, { force: true });
      if (destinationPublished) fs.rmSync(destination, { force: true });
      throw err;
    }
  } finally {
    sourceKey.destroy();
    targetKey.destroy();
  }
}
