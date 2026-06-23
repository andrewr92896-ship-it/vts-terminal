import type { FastifyInstance } from 'fastify';
import { requireWorkspace } from '../auth/middleware.js';
import { getLiveWall } from '../trading/service.js';

export async function tradingRoutes(app: FastifyInstance) {
  // The Live Wall: open positions streamed from every configured broker,
  // normalized into one feed. Read-only, so the trading_viewer role is fine.
  // Balances (open P/L) are gated inside the service by the viewBrokerage flag.
  app.get(
    '/api/trading/live',
    { preHandler: requireWorkspace('trading') },
    async (request) => {
      return getLiveWall(request.currentUser!);
    },
  );
}
