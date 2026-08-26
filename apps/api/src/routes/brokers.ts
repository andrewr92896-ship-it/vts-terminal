import type { FastifyInstance } from 'fastify';
import { requireWorkspace } from '../auth/middleware.js';
import { brokerMeta } from '../trading/config.js';
import { listConnections } from '../trading/connections.js';

// Broker status dots in the Trading top bar — now derived from the calling
// user's own broker connections (each trader sees their own). Status maps from
// each connection's last live-fetch health.
export async function brokerRoutes(app: FastifyInstance) {
  app.get(
    '/api/brokers/status',
    { preHandler: requireWorkspace('trading') },
    async (request) => {
      const conns = await listConnections(request.currentUser!.id);
      const brokers = conns.map((c) => {
        const meta = brokerMeta(c.broker);
        const status = c.credentialState === 'reconnect_required'
          ? ('reconnect_required' as const)
          : !c.active
            ? ('unconfigured' as const)
          : c.lastStatus === 'ok'
            ? ('live' as const)
            : c.lastStatus === 'error'
              ? ('error' as const)
              : ('pending' as const);
        return {
          key: c.id,
          name: c.label,
          short: meta.short,
          platform: meta.platform,
          kind: meta.kind,
          status,
          balance: null,
          lastSyncAt: c.lastCheckedAt ? new Date(c.lastCheckedAt).toISOString() : null,
        };
      });
      return {
        brokers,
        stage: 2,
        note: brokers.some((broker) => broker.status === 'reconnect_required')
          ? 'One or more broker connections require reconnection.'
          : brokers.length
            ? 'Live broker connections.'
          : 'Add a broker connection to stream your positions.',
      };
    },
  );
}
