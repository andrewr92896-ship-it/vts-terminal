import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assertNormalServerBoundary } from './runtimeBoundary.js';
import {
  assertControlledSyntheticRuntime,
  assertExpectedSyntheticMigrationJournal,
  type SyntheticHandoffCleanupState,
  withSyntheticHandoffCleanup,
} from './syntheticRuntimeGuard.js';
import { claimFreshSyntheticVolume } from './syntheticVolumeFreshness.js';

interface EgressStats {
  blockedNonLoopback: number;
  allowedLoopback: number;
  fetchBlocked: number;
  socketBlocked: number;
  datagramBlocked: number;
}

interface HttpResult {
  status: number;
  body: unknown;
  text: string;
}

type CookieJar = Map<string, string>;

function egressStats(): EgressStats {
  const stats = (
    globalThis as unknown as { __VTS_SYNTHETIC_EGRESS_STATS__?: EgressStats }
  ).__VTS_SYNTHETIC_EGRESS_STATS__;
  if (!stats) throw new Error('Synthetic egress preload was not active');
  return stats;
}

function redactedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/[A-Za-z0-9+/_=-]{24,}/g, '[redacted]')
    .replace(/https?:\/\/[^\s]+/g, '[redacted-url]');
}

function numeric(value: unknown): number {
  return Number(value ?? 0);
}

function captureCookies(response: Response, jar: CookieJar): void {
  const headers = response.headers as unknown as {
    getSetCookie?: () => string[];
    get(name: string): string | null;
  };
  const values = headers.getSetCookie?.() ?? (
    headers.get('set-cookie') ? [headers.get('set-cookie') as string] : []
  );
  for (const value of values) {
    const pair = value.split(';', 1)[0] ?? '';
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    const name = pair.slice(0, separator);
    const cookieValue = pair.slice(separator + 1);
    if (cookieValue) jar.set(name, cookieValue);
    else jar.delete(name);
  }
}

async function request(
  base: string,
  jar: CookieJar,
  route: string,
  options: {
    method?: string;
    body?: unknown;
    origin?: string;
    fetchSite?: string;
  } = {},
): Promise<HttpResult> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    origin: options.origin ?? base,
    'sec-fetch-site': options.fetchSite ?? 'same-origin',
  };
  if (jar.size) {
    headers.cookie = [...jar.entries()].map(([name, value]) => name + '=' + value).join('; ');
  }
  let body: string | undefined;
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  const response = await fetch(base + route, {
    method: options.method ?? 'GET',
    headers,
    body,
  });
  captureCookies(response, jar);
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Text responses are retained only for local assertions and are never logged.
  }
  return { status: response.status, body: parsed, text };
}

async function main(): Promise<void> {
  const controlled = assertControlledSyntheticRuntime();
  const volume = claimFreshSyntheticVolume({
    mountPath: controlled.mountPath,
    configuredDatabaseFile: controlled.databaseFile,
    sentinelContents: JSON.stringify({
      format: 'vts-controlled-synthetic-handoff-v1',
      nonceHash: crypto.createHash('sha256').update(controlled.nonce).digest('hex').slice(0, 12),
    }),
  });
  const cleanup: SyntheticHandoffCleanupState = { volume };

  await withSyntheticHandoffCleanup(cleanup, async () => {
    // These internal values are generated only after the fixed configured path
    // and fresh descriptor-pinned namespace have both been proven.
    process.env.PRIVATE_DATABASE_URL = volume.databaseUrl;
    process.env.DATABASE_URL = volume.databaseUrl;

    await assert.rejects(
    fetch('https://synthetic-runtime-probe.invalid/'),
    /non-loopback network denied/,
  );
  assert.equal(egressStats().blockedNonLoopback, 1);

  const [
    { runMigrations },
    databaseModule,
    schema,
    { hashPassword },
    { encryptSecret },
    connections,
    { default: Fastify },
    { default: cookie },
    { authRoutes },
    { tradingRoutes },
    { brokerRoutes },
    { loadUser },
    { demoGuard },
    { config },
    { LEGAL_VERSION },
  ] = await Promise.all([
    import('./db/migrate.js'),
    import('./db/index.js'),
    import('./db/schema.js'),
    import('./auth/passwords.js'),
    import('./security/secretbox.js'),
    import('./trading/connections.js'),
    import('fastify'),
    import('@fastify/cookie'),
    import('./routes/auth.js'),
    import('./routes/trading.js'),
    import('./routes/brokers.js'),
    import('./auth/middleware.js'),
    import('./demo/demo.js'),
    import('./config.js'),
    import('./legal/version.js'),
  ]);

  const { db, client, waitForDatabase } = databaseModule;
  cleanup.client = client;
  assert.equal(config.databaseUrl, volume.databaseUrl);
  await waitForDatabase();
  await runMigrations();
  await client.execute('PRAGMA foreign_keys = ON');
  await client.execute('PRAGMA secure_delete = ON');

  const journalPath = path.join(config.apiRoot, 'migrations', 'meta', '_journal.json');
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as {
    entries: Array<{ idx: number; when: number; tag: string }>;
  };
  const expectedLast = assertExpectedSyntheticMigrationJournal(journal.entries);

  const migrationRows = await client.execute(
    'SELECT COUNT(*) AS count, MAX(created_at) AS last_created_at FROM __drizzle_migrations',
  );
  const migration = migrationRows.rows[0] as Record<string, unknown>;
  assert.equal(numeric(migration.count), journal.entries.length);
  assert.equal(numeric(migration.last_created_at), expectedLast?.when);

  const columns = await client.execute('PRAGMA table_info(broker_connections)');
  const credentialColumn = columns.rows.find(
    (row) => String((row as Record<string, unknown>).name) === 'credential_state',
  ) as Record<string, unknown> | undefined;
  assert.ok(credentialColumn);
  assert.equal(numeric(credentialColumn.notnull), 1);
  assert.match(String(credentialColumn.dflt_value), /ready/);

  const tableSqlRows = await client.execute(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='broker_connections'",
  );
  assert.match(
    String((tableSqlRows.rows[0] as Record<string, unknown>).sql),
    /reconnect_required/,
  );

  const integrity = await client.execute('PRAGMA integrity_check');
  assert.equal(String((integrity.rows[0] as Record<string, unknown>).integrity_check), 'ok');
  const foreignKeyFailures = await client.execute('PRAGMA foreign_key_check');
  assert.equal(foreignKeyFailures.rows.length, 0);

  const ownerId = controlled.syntheticUserId;
  const memberId = '00000000-0000-4000-8000-000000000102';
  const deskId = '00000000-0000-4000-8000-000000000201';
  const userTeamId = '00000000-0000-4000-8000-000000000202';
  const ownerReadyId = '00000000-0000-4000-8000-000000000301';
  const memberReadyId = '00000000-0000-4000-8000-000000000302';
  const reconnectId = '00000000-0000-4000-8000-000000000303';
  const now = new Date('2026-08-26T12:00:00.000Z');
  const ownerPassword = crypto.randomBytes(24).toString('base64url');
  const memberPassword = crypto.randomBytes(24).toString('base64url');

  await db.insert(schema.tradingTeams).values({
    id: deskId,
    name: 'Synthetic Runtime Desk',
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(schema.users).values([
    {
      id: ownerId,
      username: 'synthetic-owner',
      createdUsername: 'synthetic-owner',
      displayName: 'Synthetic Owner',
      email: 'owner@synthetic.invalid',
      passwordHash: await hashPassword(ownerPassword),
      roles: JSON.stringify(['founder']),
      teamId: deskId,
      active: true,
      termsAcceptedVersion: LEGAL_VERSION,
      termsAcceptedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: memberId,
      username: 'synthetic-member',
      createdUsername: 'synthetic-member',
      displayName: 'Synthetic Member',
      email: 'member@synthetic.invalid',
      passwordHash: await hashPassword(memberPassword),
      roles: JSON.stringify(['member']),
      teamId: deskId,
      active: true,
      termsAcceptedVersion: LEGAL_VERSION,
      termsAcceptedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await db.insert(schema.userFeatures).values([
    {
      id: '00000000-0000-4000-8000-000000000401',
      userId: ownerId,
      advancedTrading: true,
      funded: false,
      tradingAckAt: now,
      shareBook: true,
      bookAckAt: now,
      tradingTeams: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: '00000000-0000-4000-8000-000000000402',
      userId: memberId,
      advancedTrading: true,
      funded: false,
      tradingAckAt: now,
      shareBook: false,
      tradingTeams: false,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await db.insert(schema.userMemberships).values([
    {
      id: '00000000-0000-4000-8000-000000000501',
      userId: ownerId,
      tier: 'max',
      source: 'manual',
      note: 'controlled synthetic fixture',
      grantedByName: 'Synthetic Runtime',
      grantedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: '00000000-0000-4000-8000-000000000502',
      userId: memberId,
      tier: 'max',
      source: 'manual',
      note: 'controlled synthetic fixture',
      grantedByName: 'Synthetic Runtime',
      grantedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await db.insert(schema.userTeams).values({
    id: userTeamId,
    name: 'Synthetic Permission Team',
    leaderId: ownerId,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(schema.userTeamMembers).values([
    {
      id: '00000000-0000-4000-8000-000000000601',
      teamId: userTeamId,
      userId: ownerId,
      badge: 'Synthetic lead',
      canCreateStudyGuides: true,
      canInvite: true,
      canManageBadges: true,
      canRemoveMembers: true,
      canEditTeam: true,
      canDeleteTrades: true,
      joinedAt: now,
    },
    {
      id: '00000000-0000-4000-8000-000000000602',
      teamId: userTeamId,
      userId: memberId,
      badge: 'Synthetic member',
      canCreateStudyGuides: false,
      canInvite: false,
      canManageBadges: false,
      canRemoveMembers: false,
      canEditTeam: false,
      canDeleteTrades: false,
      joinedAt: now,
    },
  ]);

  const ownerReadyCreds = {
    token: crypto.randomBytes(24).toString('base64url'),
    accountId: 'synthetic-account-owner',
    env: 'practice',
  };
  const memberReadyCreds = {
    apiKey: crypto.randomBytes(18).toString('base64url'),
    apiSecret: crypto.randomBytes(30).toString('base64url'),
  };
  await db.insert(schema.brokerConnections).values([
    {
      id: ownerReadyId,
      userId: ownerId,
      broker: 'oanda',
      label: 'Synthetic Owner OANDA',
      secretEnc: encryptSecret(JSON.stringify(ownerReadyCreds), {
        userId: ownerId,
        connectionId: ownerReadyId,
      }),
      credentialState: 'ready',
      summary: 'Practice · synthetic-account-owner',
      active: false,
      lastStatus: 'unknown',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: memberReadyId,
      userId: memberId,
      broker: 'kraken',
      label: 'Synthetic Member Kraken',
      secretEnc: encryptSecret(JSON.stringify(memberReadyCreds), {
        userId: memberId,
        connectionId: memberReadyId,
      }),
      credentialState: 'ready',
      summary: 'Key ••test',
      active: false,
      lastStatus: 'unknown',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: reconnectId,
      userId: ownerId,
      broker: 'oanda',
      label: 'Synthetic Reconnect OANDA',
      secretEnc: '',
      credentialState: 'reconnect_required',
      summary: 'Practice · synthetic-reconnect',
      active: true,
      lastStatus: 'error',
      lastError: 'Reconnect required',
      createdAt: now,
      updatedAt: now,
    },
  ]);

  const ephemeralTables = [
    'sessions',
    'employee_sessions',
    'password_reset_credentials',
    'login_challenges',
    'terminal_trusted_devices',
    'terminal_auth_limits',
  ];
  for (const table of ephemeralTables) {
    const result = await client.execute('SELECT COUNT(*) AS count FROM "' + table + '"');
    assert.equal(numeric((result.rows[0] as Record<string, unknown>).count), 0);
  }

  async function credentialDistribution(): Promise<{ ready: number; reconnect: number }> {
    const rows = await client.execute(
      "SELECT credential_state AS state, COUNT(*) AS count FROM broker_connections GROUP BY credential_state",
    );
    const counts = new Map(
      rows.rows.map((row) => [
        String((row as Record<string, unknown>).state),
        numeric((row as Record<string, unknown>).count),
      ]),
    );
    return { ready: counts.get('ready') ?? 0, reconnect: counts.get('reconnect_required') ?? 0 };
  }

  async function tradeState(): Promise<Record<string, number>> {
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND " +
        "(name LIKE '%trade%' OR name LIKE '%order%' OR name LIKE '%position%') ORDER BY name",
    );
    const result: Record<string, number> = {};
    for (const row of tables.rows) {
      const name = String((row as Record<string, unknown>).name);
      const count = await client.execute('SELECT COUNT(*) AS count FROM "' + name.replaceAll('"', '""') + '"');
      result[name] = numeric((count.rows[0] as Record<string, unknown>).count);
    }
    return result;
  }

  async function databaseFingerprint(): Promise<string> {
    await client.execute('PRAGMA wal_checkpoint(TRUNCATE)');
    return crypto
      .createHash('sha256')
      .update(fs.readFileSync(volume.databaseFile))
      .digest('hex')
      .slice(0, 12);
  }

  assert.deepEqual(await credentialDistribution(), { ready: 2, reconnect: 1 });
  const initialTradeState = await tradeState();
  assert.ok(Object.keys(initialTradeState).length > 0);
  assert.ok(Object.values(initialTradeState).every((count) => count === 0));
  const startupHashBefore = await databaseFingerprint();

  assert.throws(
    () => assertNormalServerBoundary(process.env),
    /Normal server startup refuses VTS_RUNTIME_BOUNDARY/,
  );
  const startupHashAfterRefusal = await databaseFingerprint();
  assert.equal(startupHashAfterRefusal, startupHashBefore);

  let deliveredCode = '';
  let fakeDeliveryCount = 0;
  const app = Fastify({ logger: false });
  cleanup.app = app;
  await app.register(cookie, { secret: config.SESSION_SECRET });
  app.decorateRequest('currentUser', null);
  app.addHook('onRequest', loadUser);
  app.addHook('preHandler', demoGuard);
  await app.register(authRoutes, {
    twoFactorDelivery: {
      configured: () => true,
      send: async (message: { to: string; code: string }) => {
        assert.ok(message.to.endsWith('@synthetic.invalid'));
        deliveredCode = message.code;
        fakeDeliveryCount += 1;
        return true;
      },
    },
  });
  await app.register(brokerRoutes);
  await app.register(tradingRoutes);

  const startupHashAfterServerBuild = await databaseFingerprint();
  assert.equal(startupHashAfterServerBuild, startupHashBefore);

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.ok(address && typeof address === 'object');
  const base = 'http://127.0.0.1:' + address.port;

  const ownerJar: CookieJar = new Map();
  const memberJar: CookieJar = new Map();

  async function login(
    jar: CookieJar,
    email: string,
    password: string,
  ): Promise<void> {
    deliveredCode = '';
    const loginResult = await request(base, jar, '/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    assert.equal(loginResult.status, 200);
    assert.equal((loginResult.body as { requiresTwoFactor?: boolean }).requiresTwoFactor, true);
    assert.match(
      String((loginResult.body as { sentTo?: string }).sentTo),
      /@synthetic\.invalid$/,
    );
    assert.match(deliveredCode, /^\d{6}$/);
    const verifyResult = await request(base, jar, '/api/auth/two-factor/verify', {
      method: 'POST',
      body: { code: deliveredCode, remember: false },
    });
    assert.equal(verifyResult.status, 200);
  }

  const unauthenticated = await request(base, new Map(), '/api/trading/connections');
  assert.equal(unauthenticated.status, 401);

  await login(ownerJar, 'owner@synthetic.invalid', ownerPassword);
  const ownerMe = await request(base, ownerJar, '/api/auth/me');
  assert.equal(ownerMe.status, 200);

  const ownerConnections = await request(base, ownerJar, '/api/trading/connections');
  assert.equal(ownerConnections.status, 200);
  assert.equal(
    (ownerConnections.body as { connections: unknown[] }).connections.length,
    2,
  );
  assert.match(ownerConnections.text, /reconnect_required/);
  assert.doesNotMatch(ownerConnections.text, /secret_enc|secretEnc|synthetic-account-owner/);
  assert.doesNotMatch(ownerConnections.text, new RegExp(ownerReadyCreds.token));

  const blockedDecryption = await connections.getActiveDecrypted(ownerId, {
    purpose: 'wall_read',
  });
  assert.deepEqual(blockedDecryption, []);
  await new Promise((resolve) => setImmediate(resolve));

  const replacement = {
    token: crypto.randomBytes(24).toString('base64url'),
    accountId: 'synthetic-replacement',
    env: 'practice',
  };
  const crossOrigin = await request(base, ownerJar, '/api/trading/connections/' + reconnectId, {
    method: 'PATCH',
    origin: 'https://cross-origin.synthetic.invalid',
    fetchSite: 'cross-site',
    body: { creds: replacement },
  });
  assert.equal(crossOrigin.status, 403);

  const partial = await request(base, ownerJar, '/api/trading/connections/' + reconnectId, {
    method: 'PATCH',
    body: { creds: { token: replacement.token } },
  });
  assert.equal(partial.status, 400);

  await login(memberJar, 'member@synthetic.invalid', memberPassword);
  const nonOwner = await request(base, memberJar, '/api/trading/connections/' + reconnectId, {
    method: 'PATCH',
    body: { creds: replacement },
  });
  assert.equal(nonOwner.status, 400);
  const nonAdminAll = await request(base, memberJar, '/api/trading/connections/all');
  assert.equal(nonAdminAll.status, 403);

  assert.deepEqual(await credentialDistribution(), { ready: 2, reconnect: 1 });
  const beforeReplacement = await client.execute({
    sql: "SELECT credential_state, secret_enc FROM broker_connections WHERE id = ?",
    args: [reconnectId],
  });
  assert.equal((beforeReplacement.rows[0] as Record<string, unknown>).credential_state, 'reconnect_required');
  assert.equal((beforeReplacement.rows[0] as Record<string, unknown>).secret_enc, '');

  const ownerReplace = await request(base, ownerJar, '/api/trading/connections/' + reconnectId, {
    method: 'PATCH',
    body: { creds: replacement },
  });
  assert.equal(ownerReplace.status, 200);
  assert.doesNotMatch(ownerReplace.text, new RegExp(replacement.token));
  const afterReplacement = await client.execute({
    sql: "SELECT credential_state, secret_enc, summary FROM broker_connections WHERE id = ?",
    args: [reconnectId],
  });
  const replaced = afterReplacement.rows[0] as Record<string, unknown>;
  assert.equal(replaced.credential_state, 'ready');
  assert.ok(String(replaced.secret_enc).startsWith('v2:'));
  assert.match(String(replaced.summary), /synthetic-replacement/);
  assert.deepEqual(await credentialDistribution(), { ready: 3, reconnect: 0 });

  const brokerStatus = await request(base, ownerJar, '/api/brokers/status');
  assert.equal(brokerStatus.status, 200);
  assert.doesNotMatch(brokerStatus.text, /secret_enc|secretEnc/);

  const uiSource = fs.readFileSync(
    path.join(
      config.apiRoot,
      '..',
      'web',
      'src',
      'workspaces',
      'trading',
      'BrokerConnectionsPanel.tsx',
    ),
    'utf8',
  );
  for (const copy of [
    'Reconnect required',
    'Saved credentials could not be migrated and must be entered again.',
    'blocked from broker, watcher, status, reconciliation, and trading use',
  ]) {
    assert.ok(uiSource.includes(copy));
  }
  assert.ok(uiSource.includes("type=\"password\""));

  const ownerLogout = await request(base, ownerJar, '/api/auth/logout', { method: 'POST' });
  assert.equal(ownerLogout.status, 200);
  const ownerAfterLogout = await request(base, ownerJar, '/api/auth/me');
  assert.equal(ownerAfterLogout.status, 401);
  const memberLogout = await request(base, memberJar, '/api/auth/logout', { method: 'POST' });
  assert.equal(memberLogout.status, 200);

  for (const table of ephemeralTables) {
    await client.execute('DELETE FROM "' + table + '"');
  }
  for (const table of ephemeralTables) {
    const result = await client.execute('SELECT COUNT(*) AS count FROM "' + table + '"');
    assert.equal(numeric((result.rows[0] as Record<string, unknown>).count), 0);
  }

  const finalTradeState = await tradeState();
  assert.deepEqual(finalTradeState, initialTradeState);
  assert.ok(Object.values(finalTradeState).every((count) => count === 0));
  const finalIntegrity = await client.execute('PRAGMA integrity_check');
  assert.equal(String((finalIntegrity.rows[0] as Record<string, unknown>).integrity_check), 'ok');
  const finalForeignKeys = await client.execute('PRAGMA foreign_key_check');
  assert.equal(finalForeignKeys.rows.length, 0);

  const stats = egressStats();
  assert.equal(stats.blockedNonLoopback, 1);
  assert.equal(stats.fetchBlocked, 1);
  assert.equal(stats.socketBlocked, 0);
  assert.equal(stats.datagramBlocked, 0);
  assert.ok(stats.allowedLoopback > 0);

  const report = {
    format: 'vts-controlled-synthetic-handoff-report-v1',
    passed: true,
    commit: controlled.expectedCommit,
    migration: {
      lastJournalIndex: expectedLast.idx,
      lastJournalTag: expectedLast.tag,
      appliedCount: numeric(migration.count),
      credentialStateAdditiveColumn: true,
      integrity: 'ok',
      foreignKeyFailures: 0,
    },
    fixture: {
      syntheticUsers: 2,
      syntheticTeams: 2,
      credentialDistributionBefore: { ready: 2, reconnectRequired: 1 },
      credentialDistributionAfterReplacement: { ready: 3, reconnectRequired: 0 },
      ephemeralAuthFinal: 0,
      startupFingerprintBefore: startupHashBefore,
      startupFingerprintAfter: startupHashAfterServerBuild,
      startupMutation: false,
    },
    security: {
      unauthenticatedStatus: unauthenticated.status,
      crossOriginStatus: crossOrigin.status,
      partialReplacementStatus: partial.status,
      nonOwnerStatus: nonOwner.status,
      nonAdminStatus: nonAdminAll.status,
      ownerReplacementStatus: ownerReplace.status,
      logoutStatus: ownerAfterLogout.status,
      fakeTwoFactorDeliveries: fakeDeliveryCount,
      reconnectBlockedBeforeDecrypt: true,
      providerValidationCalls: 0,
      uiCopyAndRedaction: true,
    },
    runtimeNetwork: {
      ...stats,
      successfulNonLoopback: 0,
      expectedBlockedProbeOnly: true,
      externalIntegrationMarkers: 0,
    },
    tradingState: finalTradeState,
    simulatedTrades: 0,
  };
  await client.execute('PRAGMA wal_checkpoint(TRUNCATE)');
  await client.execute('PRAGMA journal_mode=DELETE');
  volume.writeReportAndValidate(JSON.stringify(report, null, 2));
  console.log('[synthetic-handoff] ' + JSON.stringify(report));
  }, (resource, error) => {
    console.error(
      '[synthetic-handoff] suppressed ' +
        resource +
        ' cleanup failure: ' +
        redactedError(error),
    );
  });
}

main().catch((error) => {
  console.error('[synthetic-handoff] failed: ' + redactedError(error));
  process.exitCode = 1;
});
