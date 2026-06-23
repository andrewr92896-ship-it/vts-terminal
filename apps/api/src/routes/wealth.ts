import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireWorkspace } from '../auth/middleware.js';
import {
  addClient,
  getClients,
  removeClient,
  restoreClient,
  updateClient,
} from '../wealth/service.js';
import { WEALTH_CLIENT_STATUSES } from '../db/schema.js';

const status = z.enum(WEALTH_CLIENT_STATUSES);
const money = z.coerce.number().finite().min(0).max(1_000_000_000);

const addSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(60).optional(),
  accountValue: money.optional(),
  status: status.optional(),
  notes: z.string().trim().max(2000).optional(),
});

// All fields optional for editing; accountValue may be sent as null to clear it.
const editSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    email: z.string().trim().max(200).optional(),
    phone: z.string().trim().max(60).optional(),
    accountValue: money.nullable().optional(),
    status: status.optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Nothing to update',
  });

const restoreSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  email: z.string().max(200).nullable(),
  phone: z.string().max(60).nullable(),
  accountValue: z.number().int().min(0).max(1_000_000_000).nullable(),
  status,
  notes: z.string().max(2000).nullable(),
  createdAt: z.number().int(),
});

export async function wealthRoutes(app: FastifyInstance) {
  const guard = { preHandler: requireWorkspace('wealth') };

  app.get('/api/wealth/clients', guard, async (request) => {
    return getClients(request.currentUser!.id);
  });

  app.post('/api/wealth/clients', guard, async (request, reply) => {
    const parsed = addSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'A client name is required' });
    }
    const userId = request.currentUser!.id;
    await addClient(userId, parsed.data);
    return getClients(userId);
  });

  app.patch('/api/wealth/clients/:id', guard, async (request, reply) => {
    const parsed = editSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Check the client details and try again' });
    }
    const userId = request.currentUser!.id;
    const id = (request.params as { id: string }).id;
    try {
      await updateClient(userId, id, parsed.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update client';
      return reply.code(400).send({ error: msg });
    }
    return getClients(userId);
  });

  app.delete('/api/wealth/clients/:id', guard, async (request) => {
    const id = (request.params as { id: string }).id;
    const userId = request.currentUser!.id;
    const removed = await removeClient(userId, id);
    const data = await getClients(userId);
    return { ...data, removed };
  });

  // Undo a client removal.
  app.post('/api/wealth/clients/restore', guard, async (request, reply) => {
    const parsed = restoreSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Could not restore client' });
    }
    const userId = request.currentUser!.id;
    await restoreClient(userId, parsed.data);
    return getClients(userId);
  });
}
