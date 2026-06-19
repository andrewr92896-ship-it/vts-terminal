import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => {
    return {
      status: 'ok',
      env: config.NODE_ENV,
      time: new Date().toISOString(),
      version: '0.2.0',
    };
  });
}
