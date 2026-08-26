import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

// One auditable process boundary for normal service startup versus offline tools.
//
// The offline values are intentionally long and exact: loose booleans are too
// easy to set accidentally in a hosting dashboard. Normal startup accepts only
// an unset boundary. Each offline command accepts only its own exact value.
export const OFFLINE_REHEARSAL_BOUNDARY = 'offline-migration-rehearsal-v1';
export const OFFLINE_REKEY_BOUNDARY = 'offline-broker-credential-rekey-v1';

const COMMON_DISABLED_SIDE_EFFECTS = [
  'server-listen',
  'seed',
  'bootstrap',
  'backfill',
  'demo-refresh',
  'leader-repair',
  'content-rewrite',
  'email-delivery',
  'broker-watchers',
  'market-watchers',
  'notification-watchers',
  'reconciliation-watchers',
  'external-network',
] as const;

export const OFFLINE_DISABLED_SIDE_EFFECTS = [
  ...COMMON_DISABLED_SIDE_EFFECTS.slice(0, 6),
  'credential-reencryption',
  ...COMMON_DISABLED_SIDE_EFFECTS.slice(6),
] as const;

export const OFFLINE_REKEY_DISABLED_SIDE_EFFECTS = [
  ...COMMON_DISABLED_SIDE_EFFECTS,
] as const;

export class RuntimeBoundaryError extends Error {}

export function assertNormalServerBoundary(env: NodeJS.ProcessEnv = process.env): void {
  const value = env.VTS_RUNTIME_BOUNDARY?.trim();
  if (!value) return;
  throw new RuntimeBoundaryError(
    'Normal server startup refuses VTS_RUNTIME_BOUNDARY. ' +
      'Offline work must use a dedicated audited database command.',
  );
}

function assertOfflineHostBoundary(
  expected: string,
  label: string,
  env: NodeJS.ProcessEnv,
): void {
  if (env.VTS_RUNTIME_BOUNDARY?.trim() !== expected) {
    throw new RuntimeBoundaryError(
      label + ' refused: set VTS_RUNTIME_BOUNDARY=' + expected + ' explicitly.',
    );
  }
  if (env.NODE_ENV === 'production') {
    throw new RuntimeBoundaryError(label + ' refused while NODE_ENV=production.');
  }

  const railwayVariable = Object.keys(env).find(
    (key) => key.startsWith('RAILWAY_') && Boolean(env[key]?.trim()),
  );
  if (railwayVariable) {
    throw new RuntimeBoundaryError(
      label + ' refused in a Railway service environment (a Railway variable is set).',
    );
  }

  for (const key of ['DATABASE_URL', 'PRIVATE_DATABASE_URL']) {
    if (env[key]?.trim()) {
      throw new RuntimeBoundaryError(
        label + ' refused while an application database variable is set.',
      );
    }
  }
}

export function assertOfflineRehearsalBoundary(env: NodeJS.ProcessEnv = process.env): void {
  assertOfflineHostBoundary(
    OFFLINE_REHEARSAL_BOUNDARY,
    'Offline migration',
    env,
  );
}

export function assertOfflineRekeyBoundary(env: NodeJS.ProcessEnv = process.env): void {
  assertOfflineHostBoundary(
    OFFLINE_REKEY_BOUNDARY,
    'Offline credential re-key',
    env,
  );
}


export interface OfflineNetworkProbe {
  platform: string;
  interfaces: ReturnType<typeof os.networkInterfaces>;
  readText(path: string): string;
  darwinNetworkDenied(): boolean;
}

const DARWIN_NETWORK_DENIAL_PROBE = `
const dgram = require('node:dgram');
function denied(error) {
  return error && (error.code === 'EPERM' || error.code === 'EACCES');
}
try {
  const socket = dgram.createSocket('udp4');
  const timer = setTimeout(() => process.exit(3), 1000);
  socket.once('error', (error) => {
    clearTimeout(timer);
    process.exit(denied(error) ? 0 : 4);
  });
  socket.connect(9, '192.0.2.1', () => {
    clearTimeout(timer);
    socket.close();
    process.exit(2);
  });
} catch (error) {
  process.exit(denied(error) ? 0 : 4);
}
`;

function defaultOfflineNetworkProbe(): OfflineNetworkProbe {
  return {
    platform: process.platform,
    interfaces: os.networkInterfaces(),
    readText(file) {
      return fs.readFileSync(file, 'utf8');
    },
    darwinNetworkDenied() {
      const result = spawnSync(process.execPath, ['-e', DARWIN_NETWORK_DENIAL_PROBE], {
        stdio: 'ignore',
        timeout: 2_000,
      });
      return result.status === 0;
    },
  };
}

// This executes before any key file descriptor is read. Linux proves a
// loopback-only namespace from interfaces and kernel route tables. macOS proves
// that its inherited sandbox denies creation of an outbound UDP socket: the
// documentation-only address cannot receive a packet, and only EPERM/EACCES is
// accepted. Ordinary routing errors, timeouts, and merely disconnected hosts
// fail closed. Tests may inject a synthetic probe through the re-key service
// seam; the CLI exposes no bypass.
export function assertOfflineNetworkIsolation(
  probe: OfflineNetworkProbe = defaultOfflineNetworkProbe(),
): void {
  if (probe.platform === 'darwin') {
    if (!probe.darwinNetworkDenied()) {
      throw new RuntimeBoundaryError(
        'Offline credential re-key refused: macOS network denial was not verified.',
      );
    }
    return;
  }
  if (probe.platform !== 'linux') {
    throw new RuntimeBoundaryError(
      'Offline credential re-key refused: network isolation is not verifiable on this host.',
    );
  }
  for (const addresses of Object.values(probe.interfaces)) {
    for (const address of addresses ?? []) {
      if (!address.internal) {
        throw new RuntimeBoundaryError(
          'Offline credential re-key refused: a non-loopback network interface is visible.',
        );
      }
    }
  }
  for (const file of ['/proc/net/route', '/proc/net/ipv6_route']) {
    let text: string;
    try {
      text = probe.readText(file);
    } catch {
      throw new RuntimeBoundaryError(
        'Offline credential re-key refused: network routes could not be verified.',
      );
    }
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      if (/^Iface\s/.test(line)) continue;
      const fields = line.trim().split(/\s+/);
      const device = fields[fields.length - 1];
      if (device && device !== 'lo') {
        throw new RuntimeBoundaryError(
          'Offline credential re-key refused: a non-loopback network route is visible.',
        );
      }
    }
  }
}
