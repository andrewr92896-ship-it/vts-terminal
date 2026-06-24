import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireWorkspace } from '../auth/middleware.js';
import { addLearned, listLearned, removeLearned } from '../studies/learned.js';

const termSchema = z.object({ term: z.string().trim().min(1).max(200) });

export async function studiesRoutes(app: FastifyInstance) {
  const guard = { preHandler: requireWorkspace('studies') };

  app.get('/api/studies/learned', guard, async (request) => {
    return { terms: await listLearned(request.currentUser!.id) };
  });

  app.post('/api/studies/learned', guard, async (request, reply) => {
    const parsed = termSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A term is required' });
    return { terms: await addLearned(request.currentUser!.id, parsed.data.term) };
  });

  // The term travels as a query param (encoded), since vocabulary terms contain
  // spaces and other characters that do not fit cleanly in a path segment.
  app.delete('/api/studies/learned', guard, async (request) => {
    const q = request.query as { term?: string };
    const term = typeof q.term === 'string' ? q.term : '';
    return { terms: await removeLearned(request.currentUser!.id, term) };
  });
}
