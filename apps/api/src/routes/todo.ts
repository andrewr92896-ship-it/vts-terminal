import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireWorkspace } from '../auth/middleware.js';
import {
  addItem,
  getTodo,
  removeItem,
  restoreItem,
  setItemState,
  toggleItem,
} from '../todo/service.js';

const addSchema = z.object({
  sectionId: z.string().min(1),
  text: z.string().trim().min(1).max(500),
});

const stateSchema = z.object({
  done: z.boolean(),
  dueAt: z.number().int().nullable(),
});

const restoreSchema = z.object({
  id: z.string().min(1),
  sectionId: z.string().min(1),
  text: z.string().min(1).max(500),
  position: z.number().int(),
  hyphen: z.boolean(),
  done: z.boolean(),
  dueAt: z.number().int().nullable(),
  intervalDays: z.number().int().nullable(),
});

export async function todoRoutes(app: FastifyInstance) {
  // Personal workspace: requires To Do access (Admin, Trader, Sales).
  const guard = { preHandler: requireWorkspace('todo') };

  app.get('/api/todo', guard, async (request) => {
    const sections = await getTodo(request.currentUser!.id);
    return { sections };
  });

  app.post('/api/todo/items', guard, async (request, reply) => {
    const parsed = addSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'A section and task text are required' });
    }
    const userId = request.currentUser!.id;
    try {
      await addItem(userId, parsed.data.sectionId, parsed.data.text);
    } catch {
      return reply.code(400).send({ error: 'Could not add task' });
    }
    return { sections: await getTodo(userId) };
  });

  app.patch('/api/todo/items/:id/toggle', guard, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const userId = request.currentUser!.id;
    let previous;
    try {
      previous = await toggleItem(userId, id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update task';
      return reply.code(400).send({ error: msg });
    }
    // `previous` lets the client offer an Undo that restores the prior state.
    return { sections: await getTodo(userId), previous: { id, ...previous } };
  });

  // Undo a check/uncheck: restore an item's prior done flag and due date.
  app.post('/api/todo/items/:id/state', guard, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const userId = request.currentUser!.id;
    const parsed = stateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Could not update task' });
    }
    await setItemState(userId, id, parsed.data);
    return { sections: await getTodo(userId) };
  });

  app.delete('/api/todo/items/:id', guard, async (request) => {
    const id = (request.params as { id: string }).id;
    const userId = request.currentUser!.id;
    const removed = await removeItem(userId, id);
    return { sections: await getTodo(userId), removed };
  });

  // Undo a removal.
  app.post('/api/todo/items/restore', guard, async (request, reply) => {
    const parsed = restoreSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Could not restore task' });
    }
    const userId = request.currentUser!.id;
    await restoreItem(userId, parsed.data);
    return { sections: await getTodo(userId) };
  });
}
