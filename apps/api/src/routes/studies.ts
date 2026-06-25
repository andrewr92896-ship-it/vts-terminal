import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireWorkspace } from '../auth/middleware.js';
import { addLearned, listLearned, removeLearned } from '../studies/learned.js';
import { getGame, getLeaderboard, normalizeState, saveGame } from '../studies/game.js';

const termSchema = z.object({ term: z.string().trim().min(1).max(200) });
const gameSchema = z.object({ state: z.string() });

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

  // The Study Game state (levels, scores, per-category history) is stored as one
  // JSON blob per user so quiz progress follows them across devices.
  app.get('/api/studies/game', guard, async (request) => {
    return { state: await getGame(request.currentUser!.id) };
  });

  app.put('/api/studies/game', guard, async (request, reply) => {
    const parsed = gameSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A state string is required' });
    const state = normalizeState(parsed.data.state);
    if (state == null) return reply.code(400).send({ error: 'Invalid game state' });
    await saveGame(request.currentUser!.id, state);
    return { ok: true };
  });

  // High-score table: everyone's headline Study Game stats, so learners can see
  // where they stand and compare progress with each other.
  app.get('/api/studies/leaderboard', guard, async (request) => {
    return { entries: await getLeaderboard(request.currentUser!.id) };
  });
}
