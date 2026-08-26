import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import {
  assertOfflineRehearsalBoundary,
  OFFLINE_DISABLED_SIDE_EFFECTS,
} from '../runtimeBoundary.js';

export const EXPECTED_SOURCE_LEVEL = 135;
export const EXPECTED_DESTINATION_LEVEL = 137;
export const INTENDED_MIGRATION_TAGS = [
  '0136_password_reset_credentials',
  '0137_terminal_email_2fa',
] as const;

export const EPHEMERAL_AUTH_TABLES = [
  'sessions',
  'employee_sessions',
  'password_reset_credentials',
  'login_challenges',
  'terminal_trusted_devices',
  'terminal_auth_limits',
] as const;

interface UserIdMapping {
  sourceUserId: string;
  destinationUserId: string;
}

interface ReconciliationManifest {
  version: 1;
  sourceMigrationLevel: number;
  destinationMigrationLevel: number;
  userIdMappings: UserIdMapping[];
  expectedCounts: Record<string, number>;
  requiredAppSettingKeys: string[];
  brokerCredentialKeyId: string;
  ephemeralAuthTables: string[];
  hashTables: Record<string, string[]>;
}

export interface PrepareOfflineOptions {
  source: string;
  destination: string;
  manifestPath: string;
  reportPath: string;
  from: number;
  to: number;
  destinationCredentialKeyId: string;
  env?: NodeJS.ProcessEnv;
}

export interface MigrateOnlyOptions {
  database: string;
  from: number;
  to: number;
  env?: NodeJS.ProcessEnv;
}

interface QueryClient {
  execute(statement: string | { sql: string; args: unknown[] }): Promise<{ rows: readonly unknown[] }>;
}

interface MigrationState {
  level: number;
  createdAt: number[];
}

interface SnapshotCheck {
  counts: Record<string, number>;
  hashes: Record<string, string>;
  userCount: number;
  requiredSettingKeyHash: string;
  brokerKeyId: string;
  foreignKeyViolations: number;
}

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

function fail(message: string): never {
  throw new Error('Offline migration refused: ' + message);
}

function assertIdentifier(value: string, label: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) fail(label + ' contains an unsafe SQL identifier: ' + value);
  return '"' + value + '"';
}

function assertPlainObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label + ' must be an object');
  return value as Record<string, unknown>;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    fail(label + ' must be an array of non-empty strings');
  }
  const out = value.map((item) => (item as string).trim());
  if (new Set(out).size !== out.length) fail(label + ' must not contain duplicates');
  return out;
}

function parseManifest(file: string): ReconciliationManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    fail('manifest is not readable JSON: ' + (err instanceof Error ? err.message : String(err)));
  }
  const value = assertPlainObject(raw, 'manifest');
  if (value.version !== 1) fail('manifest.version must be 1');
  if (!Number.isInteger(value.sourceMigrationLevel)) fail('sourceMigrationLevel must be an integer');
  if (!Number.isInteger(value.destinationMigrationLevel)) fail('destinationMigrationLevel must be an integer');

  if (!Array.isArray(value.userIdMappings) || value.userIdMappings.length === 0) {
    fail('userIdMappings must be a non-empty array');
  }
  const userIdMappings = value.userIdMappings.map((item, index) => {
    const row = assertPlainObject(item, 'userIdMappings[' + index + ']');
    const sourceUserId = typeof row.sourceUserId === 'string' ? row.sourceUserId.trim() : '';
    const destinationUserId =
      typeof row.destinationUserId === 'string' ? row.destinationUserId.trim() : '';
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuid.test(sourceUserId) || !uuid.test(destinationUserId)) {
      fail('every user mapping must contain UUID sourceUserId and destinationUserId values');
    }
    return { sourceUserId, destinationUserId };
  });

  const expectedRaw = assertPlainObject(value.expectedCounts, 'expectedCounts');
  const expectedCounts: Record<string, number> = {};
  for (const [table, count] of Object.entries(expectedRaw)) {
    assertIdentifier(table, 'expectedCounts');
    if (!Number.isInteger(count) || (count as number) < 0) {
      fail('expectedCounts.' + table + ' must be a non-negative integer');
    }
    expectedCounts[table] = count as number;
  }
  if (Object.keys(expectedCounts).length === 0) fail('expectedCounts must not be empty');

  const requiredAppSettingKeys = stringArray(
    value.requiredAppSettingKeys,
    'requiredAppSettingKeys',
  );
  if (requiredAppSettingKeys.length === 0) fail('requiredAppSettingKeys must not be empty');

  const brokerCredentialKeyId =
    typeof value.brokerCredentialKeyId === 'string'
      ? value.brokerCredentialKeyId.trim().toLowerCase()
      : '';
  if (!/^[0-9a-f]{8}$/.test(brokerCredentialKeyId)) {
    fail('brokerCredentialKeyId must be an eight-character hexadecimal key identifier');
  }

  const ephemeralAuthTables = stringArray(value.ephemeralAuthTables, 'ephemeralAuthTables');
  const expectedEphemeral = [...EPHEMERAL_AUTH_TABLES].sort();
  if (
    ephemeralAuthTables.length !== expectedEphemeral.length ||
    [...ephemeralAuthTables].sort().some((table, index) => table !== expectedEphemeral[index])
  ) {
    fail(
      'ephemeralAuthTables must equal the audited allowlist exactly: ' +
        expectedEphemeral.join(', '),
    );
  }

  const hashesRaw = assertPlainObject(value.hashTables, 'hashTables');
  const hashTables: Record<string, string[]> = {};
  for (const [table, columns] of Object.entries(hashesRaw)) {
    assertIdentifier(table, 'hashTables');
    const names = stringArray(columns, 'hashTables.' + table);
    if (names.length === 0) fail('hashTables.' + table + ' must select at least one column');
    for (const column of names) assertIdentifier(column, 'hashTables.' + table);
    hashTables[table] = names;
  }
  if (Object.keys(hashTables).length === 0) fail('hashTables must not be empty');

  return {
    version: 1,
    sourceMigrationLevel: value.sourceMigrationLevel as number,
    destinationMigrationLevel: value.destinationMigrationLevel as number,
    userIdMappings,
    expectedCounts,
    requiredAppSettingKeys,
    brokerCredentialKeyId,
    ephemeralAuthTables,
    hashTables,
  };
}

function looksLikeServiceUrl(value: string): boolean {
  return /^(?:file|https?|libsql|postgres(?:ql)?|mysql|railway):/i.test(value.trim());
}

function requireRegularSnapshot(file: string): string {
  if (looksLikeServiceUrl(file)) fail('service URLs and file URLs are not accepted; use a local path');
  const resolved = path.resolve(file);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('source must be a regular, non-symlink file');
  if (!/\.snapshot\.(?:db|sqlite)$/i.test(path.basename(resolved))) {
    fail('source filename must end in .snapshot.db or .snapshot.sqlite');
  }
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(resolved + suffix)) {
      fail('source has a live SQLite sidecar (' + path.basename(resolved + suffix) + ')');
    }
  }
  return fs.realpathSync(resolved);
}

function requireNewCandidate(source: string, destination: string): string {
  if (looksLikeServiceUrl(destination)) fail('destination must be a local path, never a service URL');
  const resolved = path.resolve(destination);
  if (path.resolve(source) === resolved) fail('source and destination must be distinct');
  if (!/\.candidate\.(?:db|sqlite)$/i.test(path.basename(resolved))) {
    fail('destination filename must end in .candidate.db or .candidate.sqlite');
  }
  if (fs.existsSync(resolved)) fail('destination already exists');
  const parent = fs.realpathSync(path.dirname(resolved));
  if (parent === fs.realpathSync(path.dirname(source))) {
    fail('destination must be isolated in a different directory from the source snapshot');
  }
  return path.join(parent, path.basename(resolved));
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
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

async function tableExists(client: QueryClient, table: string): Promise<boolean> {
  const result = await client.execute({
    sql: "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    args: [table],
  });
  return result.rows.length === 1;
}

async function migrationState(client: QueryClient): Promise<MigrationState> {
  if (!(await tableExists(client, '__drizzle_migrations'))) return { level: 0, createdAt: [] };
  const result = await client.execute(
    'SELECT created_at FROM "__drizzle_migrations" ORDER BY created_at',
  );
  const createdAt = result.rows.map((row) => Number((row as Record<string, unknown>).created_at));
  if (createdAt.some((value) => !Number.isFinite(value))) fail('migration history is malformed');
  return { level: createdAt.length, createdAt };
}

async function countTable(client: QueryClient, table: string): Promise<number> {
  if (!(await tableExists(client, table))) fail('expected table is missing: ' + table);
  const result = await client.execute('SELECT COUNT(*) AS count FROM ' + assertIdentifier(table, 'table'));
  return Number((result.rows[0] as Record<string, unknown>).count);
}

function canonicalRows(rows: readonly unknown[]): string {
  return JSON.stringify(
    rows.map((row) => {
      const input = row as Record<string, unknown>;
      const output: Record<string, unknown> = {};
      for (const key of Object.keys(input).sort()) output[key] = input[key];
      return output;
    }),
  );
}

async function hashTable(
  client: QueryClient,
  table: string,
  columns: string[],
): Promise<string> {
  if (!(await tableExists(client, table))) fail('hash table is missing: ' + table);
  const selected = columns.map((column) => assertIdentifier(column, 'hash column')).join(', ');
  const ordered = columns.map((column) => assertIdentifier(column, 'hash order')).join(', ');
  const result = await client.execute(
    'SELECT ' + selected + ' FROM ' + assertIdentifier(table, 'hash table') + ' ORDER BY ' + ordered,
  );
  return crypto.createHash('sha256').update(canonicalRows(result.rows)).digest('hex');
}

async function foreignKeyViolations(client: QueryClient): Promise<number> {
  const result = await client.execute('PRAGMA foreign_key_check');
  return result.rows.length;
}

async function brokerKeyIds(client: QueryClient): Promise<string[]> {
  if (!(await tableExists(client, 'broker_connections'))) return [];
  const result = await client.execute(
    "SELECT DISTINCT CASE " +
      "WHEN secret_enc LIKE 'v2:%:%' THEN " +
      "substr(secret_enc, 4, instr(substr(secret_enc, 4), ':') - 1) " +
      "ELSE '__incompatible__' END AS key_id " +
      "FROM broker_connections WHERE broker <> 'manual' ORDER BY key_id",
  );
  return result.rows.map((row) => String((row as Record<string, unknown>).key_id));
}

async function validateSnapshot(
  client: QueryClient,
  manifest: ReconciliationManifest,
  expectedLevel: number,
  destinationCredentialKeyId: string,
): Promise<SnapshotCheck> {
  const state = await migrationState(client);
  if (state.level !== expectedLevel) {
    fail('migration level is ' + state.level + '; expected ' + expectedLevel);
  }

  const userResult = await client.execute('SELECT id FROM users ORDER BY id');
  const sourceUsers = userResult.rows.map((row) => String((row as Record<string, unknown>).id));
  const sourceSet = new Set(sourceUsers);
  const mappedSources = manifest.userIdMappings.map((mapping) => mapping.sourceUserId);
  const destinationUsers = manifest.userIdMappings.map((mapping) => mapping.destinationUserId);
  if (new Set(mappedSources).size !== mappedSources.length) fail('user mapping has duplicate source IDs');
  if (new Set(destinationUsers).size !== destinationUsers.length) {
    fail('user mapping has duplicate destination IDs');
  }
  if (
    sourceUsers.length !== mappedSources.length ||
    sourceUsers.some((id) => !mappedSources.includes(id))
  ) {
    fail('user mapping is incomplete or contains identities absent from the source');
  }
  if (destinationUsers.some((id) => sourceSet.has(id))) {
    fail('source and destination user ID sets must not intersect');
  }

  const counts: Record<string, number> = {};
  for (const [table, expected] of Object.entries(manifest.expectedCounts)) {
    const actual = await countTable(client, table);
    if (actual !== expected) {
      fail('record count mismatch for ' + table + ': expected ' + expected + ', found ' + actual);
    }
    counts[table] = actual;
  }

  if (!(await tableExists(client, 'app_settings'))) fail('app_settings table is missing');
  const placeholders = manifest.requiredAppSettingKeys.map(() => '?').join(', ');
  const settingResult = await client.execute({
    sql: 'SELECT key FROM app_settings WHERE key IN (' + placeholders + ') ORDER BY key',
    args: manifest.requiredAppSettingKeys,
  });
  const settingKeys = settingResult.rows.map((row) => String((row as Record<string, unknown>).key));
  if (
    settingKeys.length !== manifest.requiredAppSettingKeys.length ||
    manifest.requiredAppSettingKeys.some((key) => !settingKeys.includes(key))
  ) {
    fail('one or more required app-setting keys are missing');
  }
  const requiredSettingKeyHash = crypto
    .createHash('sha256')
    .update(JSON.stringify([...settingKeys].sort()))
    .digest('hex');

  const keyIds = await brokerKeyIds(client);
  if (keyIds.includes('__incompatible__') || keyIds.length > 1) {
    fail('broker rows contain malformed or mixed credential key identifiers');
  }
  if (keyIds.length === 1 && keyIds[0] !== manifest.brokerCredentialKeyId) {
    fail('broker credential key identifier does not match the manifest');
  }
  if (
    keyIds.length === 1 &&
    keyIds[0] !== destinationCredentialKeyId.trim().toLowerCase()
  ) {
    fail('broker credential key identifier is incompatible with the destination key identifier');
  }

  const violations = await foreignKeyViolations(client);
  if (violations !== 0) fail('foreign-key integrity check found ' + violations + ' orphaned row(s)');

  const hashes: Record<string, string> = {};
  for (const [table, columns] of Object.entries(manifest.hashTables)) {
    hashes[table] = await hashTable(client, table, columns);
  }

  return {
    counts,
    hashes,
    userCount: sourceUsers.length,
    requiredSettingKeyHash,
    brokerKeyId: keyIds[0] ?? manifest.brokerCredentialKeyId,
    foreignKeyViolations: violations,
  };
}

function apiRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function journalEntries(): JournalEntry[] {
  const journal = JSON.parse(
    fs.readFileSync(path.join(apiRoot(), 'migrations', 'meta', '_journal.json'), 'utf8'),
  ) as { entries: JournalEntry[] };
  return journal.entries;
}

function assertIntendedTransition(from: number, to: number): JournalEntry[] {
  if (from !== EXPECTED_SOURCE_LEVEL || to !== EXPECTED_DESTINATION_LEVEL) {
    fail(
      'only the explicitly audited ' +
        EXPECTED_SOURCE_LEVEL +
        '→' +
        EXPECTED_DESTINATION_LEVEL +
        ' transition is allowed',
    );
  }
  const entries = journalEntries().slice(from, to);
  if (
    entries.length !== INTENDED_MIGRATION_TAGS.length ||
    entries.some((entry, index) => entry.tag !== INTENDED_MIGRATION_TAGS[index])
  ) {
    fail('migration journal does not match the audited 0136–0137 transition');
  }
  return entries;
}

async function applyIntendedMigrations(
  client: Client,
  from: number,
  to: number,
): Promise<string[]> {
  const before = await migrationState(client);
  if (before.level !== from) fail('candidate migration level changed before migrate-only execution');
  const entries = assertIntendedTransition(from, to);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vts-offline-migrations-'));
  const meta = path.join(temp, 'meta');
  fs.mkdirSync(meta);
  try {
    fs.writeFileSync(
      path.join(meta, '_journal.json'),
      JSON.stringify({ version: '7', dialect: 'sqlite', entries }, null, 2) + '\n',
      { flag: 'wx' },
    );
    for (const entry of entries) {
      fs.copyFileSync(
        path.join(apiRoot(), 'migrations', entry.tag + '.sql'),
        path.join(temp, entry.tag + '.sql'),
        fs.constants.COPYFILE_EXCL,
      );
    }
    await migrate(drizzle(client), { migrationsFolder: temp });
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  const after = await migrationState(client);
  if (after.level !== to) fail('migrate-only finished at level ' + after.level + '; expected ' + to);
  return entries.map((entry) => entry.tag);
}

async function clearEphemeralAuth(client: Client): Promise<Record<string, number>> {
  const cleared: Record<string, number> = {};
  for (const table of EPHEMERAL_AUTH_TABLES) {
    if (!(await tableExists(client, table))) {
      cleared[table] = 0;
      continue;
    }
    const before = await countTable(client, table);
    await client.execute('DELETE FROM ' + assertIdentifier(table, 'ephemeral table'));
    const after = await countTable(client, table);
    if (after !== 0) fail('ephemeral table did not clear: ' + table);
    cleared[table] = before;
  }
  return cleared;
}

class ReadOnlySnapshot implements QueryClient {
  private readonly database: DatabaseSync;

  constructor(file: string) {
    // The native handle enforces read-only at open time. No SQL statement can
    // promote it, and no libSQL sidecar or write transaction is created.
    this.database = new DatabaseSync(file, { readOnly: true });
  }

  async execute(
    statement: string | { sql: string; args: unknown[] },
  ): Promise<{ rows: readonly unknown[] }> {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    const args = typeof statement === 'string' ? [] : statement.args;
    const prepared = this.database.prepare(sql);
    return { rows: prepared.all(...(args as Array<string | number | bigint | null>)) };
  }

  close(): void {
    this.database.close();
  }
}

async function openReadOnly(file: string): Promise<ReadOnlySnapshot> {
  return new ReadOnlySnapshot(file);
}

function assertKeyId(value: string): string {
  const keyId = value.trim().toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(keyId)) {
    fail('destination credential key identifier must be eight hexadecimal characters');
  }
  return keyId;
}

export async function migrateOnlyDatabase(options: MigrateOnlyOptions): Promise<{
  beforeSha256: string;
  afterSha256: string;
  migrationsApplied: string[];
}> {
  assertOfflineRehearsalBoundary(options.env);
  if (looksLikeServiceUrl(options.database)) fail('migrate-only database must be a local path');
  const database = path.resolve(options.database);
  if (!/\.candidate\.(?:db|sqlite)$/i.test(path.basename(database))) {
    fail('migrate-only database filename must end in .candidate.db or .candidate.sqlite');
  }
  if (!fs.lstatSync(database).isFile()) fail('migrate-only database must be a regular file');
  const beforeSha256 = sha256File(database);
  const client = createClient({ url: pathToFileURL(database).href });
  let migrationsApplied: string[];
  try {
    await client.execute('PRAGMA foreign_keys = ON');
    if ((await foreignKeyViolations(client)) !== 0) fail('candidate contains orphaned rows');
    migrationsApplied = await applyIntendedMigrations(client, options.from, options.to);
    if ((await foreignKeyViolations(client)) !== 0) fail('migration created orphaned rows');
  } finally {
    client.close();
  }
  return { beforeSha256, afterSha256: sha256File(database), migrationsApplied };
}

export async function prepareOfflineCandidate(options: PrepareOfflineOptions): Promise<unknown> {
  assertOfflineRehearsalBoundary(options.env);
  const source = requireRegularSnapshot(options.source);
  const destination = requireNewCandidate(source, options.destination);
  const destinationKeyId = assertKeyId(options.destinationCredentialKeyId);
  if (fs.existsSync(options.reportPath)) fail('report destination already exists');

  const manifest = parseManifest(options.manifestPath);
  if (
    manifest.sourceMigrationLevel !== options.from ||
    manifest.destinationMigrationLevel !== options.to
  ) {
    fail('manifest migration levels do not match the explicitly requested transition');
  }
  assertIntendedTransition(options.from, options.to);

  const sourceHashBefore = sha256File(source);
  const sourceClient = await openReadOnly(source);
  let sourceCheck: SnapshotCheck;
  try {
    sourceCheck = await validateSnapshot(
      sourceClient,
      manifest,
      options.from,
      destinationKeyId,
    );
  } finally {
    sourceClient.close();
  }

  const partial = path.join(
    path.dirname(destination),
    '.' + path.basename(destination) + '.partial-' + process.pid + '-' + crypto.randomUUID(),
  );
  const reportResolved = path.resolve(options.reportPath);
  const reportPartial = reportResolved + '.partial-' + process.pid + '-' + crypto.randomUUID();
  let destinationPublished = false;
  try {
    fs.copyFileSync(source, partial, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(partial, 0o600);
    if (sha256File(partial) !== sourceHashBefore) fail('isolated copy does not match the source snapshot');

    const candidate = createClient({ url: pathToFileURL(partial).href });
    let migrationsApplied: string[];
    let cleared: Record<string, number>;
    let destinationCheck: SnapshotCheck;
    try {
      await candidate.execute('PRAGMA foreign_keys = ON');
      migrationsApplied = await applyIntendedMigrations(candidate, options.from, options.to);
      cleared = await clearEphemeralAuth(candidate);
      destinationCheck = await validateSnapshot(
        candidate,
        manifest,
        options.to,
        destinationKeyId,
      );
      for (const table of [
        'password_reset_credentials',
        'login_challenges',
        'terminal_trusted_devices',
        'terminal_auth_limits',
      ]) {
        if (!(await tableExists(candidate, table))) fail('expected authentication schema is missing: ' + table);
      }
    } finally {
      candidate.close();
    }

    if (JSON.stringify(sourceCheck.counts) !== JSON.stringify(destinationCheck.counts)) {
      fail('business record counts changed during preparation');
    }
    if (JSON.stringify(sourceCheck.hashes) !== JSON.stringify(destinationCheck.hashes)) {
      fail('deterministic business hashes changed during preparation');
    }
    if (sourceHashBefore !== sha256File(source)) fail('source snapshot changed while preparing candidate');

    const report = {
      version: 1,
      ok: true,
      source: {
        file: path.basename(source),
        migrationLevel: options.from,
        sha256: sourceHashBefore,
        access: 'node:sqlite DatabaseSync readOnly=true',
      },
      destination: {
        file: path.basename(destination),
        migrationLevel: options.to,
        sha256: sha256File(partial),
        isolatedAtomicPublish: true,
      },
      migrationsApplied,
      userMapping: {
        complete: true,
        sourceUsers: sourceCheck.userCount,
        mappedUsers: manifest.userIdMappings.length,
        identitiesIncluded: false,
      },
      reconciliation: {
        counts: destinationCheck.counts,
        nonSecretHashes: destinationCheck.hashes,
        requiredSettingKeyHash: destinationCheck.requiredSettingKeyHash,
        brokerCredentialKeyId: destinationCheck.brokerKeyId,
        foreignKeyViolations: destinationCheck.foreignKeyViolations,
      },
      exclusions: {
        allowlist: [...EPHEMERAL_AUTH_TABLES],
        clearedRows: cleared,
      },
      safetyBoundary: {
        value: 'offline-migration-rehearsal-v1',
        disabledSideEffects: [...OFFLINE_DISABLED_SIDE_EFFECTS],
        credentialDecryptionAttempted: false,
        externalNetworkAllowed: false,
      },
    };

    fs.writeFileSync(reportPartial, JSON.stringify(report, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    fs.renameSync(partial, destination);
    destinationPublished = true;
    fs.renameSync(reportPartial, reportResolved);
    return report;
  } catch (err) {
    fs.rmSync(partial, { force: true });
    fs.rmSync(reportPartial, { force: true });
    if (destinationPublished) fs.rmSync(destination, { force: true });
    throw err;
  }
}
