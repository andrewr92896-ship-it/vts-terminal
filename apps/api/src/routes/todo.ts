import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import {
  addItem,
  addSection,
  getTodo,
  moveItem,
  removeItem,
  restoreItem,
  setItemState,
  toggleItem,
  type MoveTarget,
} from '../todo/service.js';
import { runCommand } from '../todo/command.js';
import { aiConfigured } from '../ai/claude.js';
import { AiLimitError, enforceAiLimit } from '../ai/usage.js';

const addSchema = z.object({
  sectionId: z.string().min(1),
  text: z.string().trim().min(1).max(500),
});

// Users can create their own categories. Recurring-interval types are excluded
// here because a user-created section has no per-item interval configured yet;
// the three offered types work correctly with manually-added tasks.
const addSectionSchema = z.object({
  title: z.string().trim().min(1).max(80),
  type: z.enum(['one', 'daily', 'note']).optional(),
  icon: z.string().trim().max(8).optional(),
});

const moveSchema = z.object({
  to: z.enum(['top', 'bottom', 'up', 'down']),
  by: z.number().int().min(1).max(500).optional(),
});

const stateSchema = z.object({
  done: z.boolean(),
  dueAt: z.number().int().nullable(),
});

const commandSchema = z.object({
  command: z.string().trim().min(1).max(500),
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
  // The to-do list is personal and lives in **My Terminal**, which every account
  // reaches — so these are on plain auth.
  //
  // They were behind `requireWorkspace('trading')` from when To Do was a desk
  // tab. The section moved (owner decision, 2026-08) and the guard did not, which
  // left every account without the Advanced Trading opt-in getting a 403 from
  // their own list — a section the sidebar showed them. The list is per-user
  // (`getTodo(userId)`), so there is nothing about the desk to protect here.
  // The demo is refused by `demoGuard` on every non-GET, as everywhere else.
  const read = { preHandler: requireAuth };
  const write = { preHandler: requireAuth };

  app.get('/api/todo', read, async (request) => {
    const sections = await getTodo(request.currentUser!.id);
    return { sections };
  });

  app.post('/api/todo/items', write, async (request, reply) => {
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

  app.post('/api/todo/sections', write, async (request, reply) => {
    const parsed = addSectionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'A section title is required' });
    }
    const userId = request.currentUser!.id;
    try {
      await addSection(userId, parsed.data.title, parsed.data.type ?? 'one', parsed.data.icon);
    } catch {
      return reply.code(400).send({ error: 'Could not add section' });
    }
    return { sections: await getTodo(userId) };
  });

  app.patch('/api/todo/items/:id/move', write, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = moveSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Could not move task' });
    }
    const { to, by } = parsed.data;
    const target: MoveTarget =
      to === 'top'
        ? { kind: 'top' }
        : to === 'bottom'
          ? { kind: 'bottom' }
          : { kind: to, by: by ?? 1 };
    const userId = request.currentUser!.id;
    try {
      await moveItem(userId, id, target);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not move task' });
    }
    return { sections: await getTodo(userId) };
  });

  app.patch('/api/todo/items/:id/toggle', write, async (request, reply) => {
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
  app.post('/api/todo/items/:id/state', write, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const userId = request.currentUser!.id;
    const parsed = stateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Could not update task' });
    }
    await setItemState(userId, id, parsed.data);
    return { sections: await getTodo(userId) };
  });

  app.delete('/api/todo/items/:id', write, async (request) => {
    const id = (request.params as { id: string }).id;
    const userId = request.currentUser!.id;
    const removed = await removeItem(userId, id);
    return { sections: await getTodo(userId), removed };
  });

  // Claude command bar: parse a free-text command into list actions and apply.
  app.post('/api/todo/command', write, async (request, reply) => {
    if (!aiConfigured()) {
      return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    }
    const parsed = commandSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Type a command to run' });
    }
    try {
      await enforceAiLimit(request.currentUser!.id, 'todo_command');
      return await runCommand(request.currentUser!.id, parsed.data.command);
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Command failed' });
    }
  });

  // Undo a removal.
  app.post('/api/todo/items/restore', write, async (request, reply) => {
    const parsed = restoreSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Could not restore task' });
    }
    const userId = request.currentUser!.id;
    await restoreItem(userId, parsed.data);
    return { sections: await getTodo(userId) };
  });
}
