import type { FastifyInstance } from 'fastify';
import { requireWorkspace } from '../auth/middleware.js';

// The four broker connections shown as status dots in the Trading top bar.
// Stage 1 reports them all as "unconfigured" — real status, balances, and
// trade history are wired in Stage 2 once keys live in the backend .env.
const BROKERS = [
  { key: 'ftp', name: 'Funded Trading Plus', short: 'FTP', platform: 'Match-Trader', kind: 'Funded prop' },
  { key: 'oanda', name: 'OANDA', short: 'OANDA', platform: 'OANDA v20', kind: 'Forex' },
  { key: 'kraken', name: 'Kraken Pro', short: 'KRKN', platform: 'Kraken', kind: 'Crypto' },
  { key: 'tradestation', name: 'TradeStation', short: 'TS', platform: 'TradeStation', kind: 'Stocks' },
] as const;

export async function brokerRoutes(app: FastifyInstance) {
  // Visible to anyone who can see the Trading workspace. Balances are gated
  // separately by the viewBrokerage flag (relevant from Stage 2).
  app.get(
    '/api/brokers/status',
    { preHandler: requireWorkspace('trading') },
    async (request) => {
      const canSeeBalances = !!request.currentUser?.viewBrokerage;
      return {
        brokers: BROKERS.map((b) => ({
          key: b.key,
          name: b.name,
          short: b.short,
          platform: b.platform,
          kind: b.kind,
          status: 'unconfigured' as const,
          // Always null in Stage 1. The flag is wired now so the UI can gate
          // balance display from the start.
          balance: canSeeBalances ? null : null,
          lastSyncAt: null,
        })),
        stage: 1,
        note: 'Broker connections are wired in Stage 2.',
      };
    },
  );
}
