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
