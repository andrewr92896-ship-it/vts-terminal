import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import fs from 'node:fs';
import net from 'node:net';
import {
  assertControlledSyntheticRuntime,
  controlledSyntheticTestEnv,
  SYNTHETIC_SERVICE_ID,
} from './syntheticRuntimeGuard.js';

function expectRefusal(label: string, env: NodeJS.ProcessEnv): void {
  assert.throws(
    () => assertControlledSyntheticRuntime(env),
    /Synthetic handoff refused/,
    label,
  );
}

assert.doesNotThrow(() => assertControlledSyntheticRuntime(controlledSyntheticTestEnv()));
expectRefusal(
  'protected service',
  controlledSyntheticTestEnv({
    RAILWAY_SERVICE_ID: 'cc2e7946-384f-4d79-abc6-b61964cee327',
    VTS_SYNTHETIC_SERVICE_ID: 'cc2e7946-384f-4d79-abc6-b61964cee327',
  }),
);
expectRefusal('production volume', controlledSyntheticTestEnv({
  RAILWAY_VOLUME_ID: '784e4de9-66c5-4723-91bb-9ee00113383d',
  VTS_SYNTHETIC_VOLUME_ID: '784e4de9-66c5-4723-91bb-9ee00113383d',
}));
expectRefusal('wrong service marker', controlledSyntheticTestEnv({
  VTS_SYNTHETIC_SERVICE_ID: SYNTHETIC_SERVICE_ID.slice(1),
}));
expectRefusal('real database path', controlledSyntheticTestEnv({
  PRIVATE_DATABASE_URL: 'file:/data/vts.db',
  DATABASE_URL: 'file:/data/vts.db',
}));
expectRefusal('public domain', controlledSyntheticTestEnv({
  RAILWAY_PUBLIC_DOMAIN: 'synthetic.example.invalid',
}));
expectRefusal('protected domain', controlledSyntheticTestEnv({
  PRIVATE_PORTAL_ORIGIN: 'https://portal.vitalistradingsystems.com',
}));
expectRefusal('external integration', controlledSyntheticTestEnv({
  RESEND_API_KEY: 'synthetic-value-must-still-refuse',
}));
expectRefusal('main branch', controlledSyntheticTestEnv({
  RAILWAY_GIT_BRANCH: 'main',
  VTS_SYNTHETIC_EXPECTED_BRANCH: 'main',
}));

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
