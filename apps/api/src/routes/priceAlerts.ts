import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireMarkets } from '../auth/middleware.js';
import { PRICE_ALERT_CONDITIONS, PRICE_ALERT_REPEATS } from '../db/schema.js';
import {
  createPriceAlert,
  deletePriceAlert,
  listPriceAlerts,
  updatePriceAlert,
} from '../trading/priceAlerts.js';
import { hasPriceSource } from '../trading/priceSource.js';

// User-authored price alerts. These are included with every account rather than
// sitting behind the Advanced Trading opt-in: setting one is watching a
// price, not trading it — no broker of the user's own is involved and no order
// can result — and the alert control lives on the chart tile, which every
// account has. The demo is read-only regardless (demoGuard 403s every write).
// Alerts are personal — each is owned by, and fired only to, its creator.
const createSchema = z.object({
  symbol: z.string().trim().min(1).max(40),
  condition: z.enum(PRICE_ALERT_CONDITIONS),
  threshold: z.number().finite().positive(),
  repeat: z.enum(PRICE_ALERT_REPEATS).optional(),
  note: z.string().trim().max(120).nullish(),
});

const patchSchema = z
  .object({
    symbol: z.string().trim().min(1).max(40),
    condition: z.enum(PRICE_ALERT_CONDITIONS),
    threshold: z.number().finite().positive(),
    repeat: z.enum(PRICE_ALERT_REPEATS),
    note: z.string().trim().max(120).nullable(),
    active: z.boolean(),
  })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

export async function priceAlertRoutes(app: FastifyInstance) {
  const read = { preHandler: requireMarkets };
  const write = { preHandler: requireMarkets };

  app.get('/api/trading/price-alerts', read, async (request) => ({
    alerts: await listPriceAlerts(request.currentUser!.id),
    priceSource: await hasPriceSource(),
  }));

  app.post('/api/trading/price-alerts', write, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Enter a symbol, a price above 0 and a direction' });
    }
    try {
      const alert = await createPriceAlert(request.currentUser!.id, parsed.data);
      return { alert, alerts: await listPriceAlerts(request.currentUser!.id) };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not create alert' });
    }
  });

  app.put('/api/trading/price-alerts/:id', write, async (request, reply) => {
    const parsed = patchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Nothing to update' });
    const id = (request.params as { id: string }).id;
    try {
      const alert = await updatePriceAlert(request.currentUser!.id, id, parsed.data);
      return { alert, alerts: await listPriceAlerts(request.currentUser!.id) };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not update alert' });
    }
  });

  app.delete('/api/trading/price-alerts/:id', write, async (request) => {
    const id = (request.params as { id: string }).id;
    await deletePriceAlert(request.currentUser!.id, id);
    return { alerts: await listPriceAlerts(request.currentUser!.id) };
  });
}
