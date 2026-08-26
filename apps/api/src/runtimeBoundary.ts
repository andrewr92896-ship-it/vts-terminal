// One auditable process boundary for normal service startup versus offline rehearsal.
//
// The offline value is intentionally long and exact: a loose boolean is too easy
// to set accidentally in a hosting dashboard. Normal startup accepts only an
// unset boundary. The offline tools accept only this exact value.
export const OFFLINE_REHEARSAL_BOUNDARY = 'offline-migration-rehearsal-v1';

export const OFFLINE_DISABLED_SIDE_EFFECTS = [
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
] as const;

export class RuntimeBoundaryError extends Error {}

export function assertNormalServerBoundary(env: NodeJS.ProcessEnv = process.env): void {
  const value = env.VTS_RUNTIME_BOUNDARY?.trim();
  if (!value) return;
  throw new RuntimeBoundaryError(
    'Normal server startup refuses VTS_RUNTIME_BOUNDARY. ' +
      'Offline rehearsal must use the dedicated db:prepare-offline or db:migrate-only command.',
  );
}

export function assertOfflineRehearsalBoundary(env: NodeJS.ProcessEnv = process.env): void {
  if (env.VTS_RUNTIME_BOUNDARY?.trim() !== OFFLINE_REHEARSAL_BOUNDARY) {
    throw new RuntimeBoundaryError(
      'Offline migration refused: set VTS_RUNTIME_BOUNDARY=' +
        OFFLINE_REHEARSAL_BOUNDARY +
        ' explicitly.',
    );
  }
  if (env.NODE_ENV === 'production') {
    throw new RuntimeBoundaryError('Offline migration refused while NODE_ENV=production.');
  }

  const railwayVariable = Object.keys(env).find(
    (key) => key.startsWith('RAILWAY_') && Boolean(env[key]?.trim()),
  );
  if (railwayVariable) {
    throw new RuntimeBoundaryError(
      'Offline migration refused in a Railway service environment (' + railwayVariable + ' is set).',
    );
  }

  for (const key of ['DATABASE_URL', 'PRIVATE_DATABASE_URL']) {
    if (env[key]?.trim()) {
      throw new RuntimeBoundaryError(
        'Offline migration refused while ' + key + ' is set; pass local snapshot paths as CLI arguments only.',
      );
    }
  }
}
