import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { FeatureError, featuresForUser, setUserFeatures } from '../features/service.js';

// My Terminal ▸ Feature Access. Reading is open to any signed-in user; the write
// is a plain self-service toggle — there is no approval queue, and no route here
// changes anyone else's account. The demo never reaches the write: demoGuard
// refuses every non-GET before this runs.

const patchSchema = z
  .object({
    advancedTrading: z.boolean().optional(),
    funded: z.boolean().optional(),
    acknowledgeTrading: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.advancedTrading !== undefined ||
      v.funded !== undefined ||
      v.acknowledgeTrading !== undefined,
    { message: 'Nothing to change' },
  );

export async function featureRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: requireAuth };

  app.get('/api/features', auth, async (request) => ({
    features: await featuresForUser(request.currentUser!),
  }));

  app.put('/api/features', auth, async (request, reply) => {
    const parsed = patchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid feature selection' });
    try {
      await setUserFeatures(request.currentUser!.id, parsed.data);
    } catch (err) {
      if (err instanceof FeatureError) return reply.code(400).send({ error: err.message });
      throw err;
    }
    return { features: await featuresForUser(request.currentUser!) };
  });
}
