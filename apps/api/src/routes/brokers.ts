import type { FastifyInstance } from 'fastify';
import { requireWorkspace } from '../auth/middleware.js';
import { BROKER_META, isBrokerConfigured } from '../trading/config.js';

// The four broker connections shown as status dots in the Trading top bar.
// Status is derived from whether credentials are present in the environment:
// 'unconfigured' until the owner adds API keys, then 'pending' (configured but
// not yet confirmed live — the Live Wall reports per-broker fetch health).
export async function brokerRoutes(app: FastifyInstance) {
  // Visible to anyone who can see the Trading workspace. Balances are gated
  // separately by the viewBrokerage flag (see the Live Wall service).
  app.get(
    '/api/brokers/status',
    { preHandler: requireWorkspace('trading') },
    async () => {
      const brokers = BROKER_META.map((b) => {
        const configured = isBrokerConfigured(b.key);
        return {
          key: b.key,
          name: b.name,
          short: b.short,
          platform: b.platform,
          kind: b.kind,
          status: configured ? ('pending' as const) : ('unconfigured' as const),
          balance: null,
          lastSyncAt: null,
        };
      });
      const anyConfigured = brokers.some((b) => b.status === 'pending');
      return {
        brokers,
        stage: 2,
        note: anyConfigured
          ? 'Broker credentials detected — live positions stream on the Live Wall.'
          : 'Add broker API keys to stream live positions on the Live Wall.',
      };
    },
  );
}
