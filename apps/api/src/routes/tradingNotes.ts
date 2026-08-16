import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requirePremium, requireWorkspace, requireWorkspaceWrite } from '../auth/middleware.js';
import { NOTE_DIRECTIONS, NOTE_KINDS, NOTE_OUTCOMES, NOTE_VISIBILITIES } from '../db/schema.js';
import {
  NoteError,
  createNote,
  getObservations,
  getQueue,
  getStats,
  getTradeLinks,
  getWeek,
  reflectOnNote,
  removeNote,
  setVisibility,
  settleNote,
  updateNote,
} from '../trading/notes.js';

// Trading Notes — predictions and observations.
//
// Paid on the READ as well as the write, the same shape Strategy Sessions takes:
// the section is hidden from a free account, so leaving reads open would only
// ever serve a client that had gone looking. Nothing is deleted when a
// membership lapses — the notes come back untouched on renewal, which matters
// more here than anywhere else in the terminal, because what is stored is
// somebody's own record of their thinking.
//
// The demo is refused by demoGuard on every non-GET, like everywhere else.

const noteBody = {
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(4000).nullish(),
  visibility: z.enum(NOTE_VISIBILITIES).optional(),
  instrument: z.string().trim().max(40).nullish(),
  direction: z.enum(NOTE_DIRECTIONS).nullish(),
  targetPrice: z.number().finite().positive().nullish(),
  confidence: z.number().int().min(1).max(5).nullish(),
  weekKey: z
    .string()
    .regex(/^\d{4}-W\d{2}$/)
    .optional(),
  windowOpensAt: z.number().int().positive().nullish(),
  deadlineAt: z.number().int().positive().nullish(),
};

const createSchema = z.object({ kind: z.enum(NOTE_KINDS), ...noteBody });

const patchSchema = z
  .object(noteBody)
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

// `partial` and `unsettleable` are deliberately accepted from a person: a call
// that half-happened is a real answer, and so is "the market never traded, this
// cannot be judged". What must never happen is the SERVER inventing either of
// those in place of a verdict it could have reached — see noteSettle.ts.
const settleSchema = z.object({
  outcome: z.enum(NOTE_OUTCOMES),
  reflection: z.string().trim().max(4000).nullish(),
});

const reflectSchema = z.object({ reflection: z.string().trim().max(4000) });

const visibilitySchema = z.object({ visibility: z.enum(NOTE_VISIBILITIES) });

export async function tradingNotesRoutes(app: FastifyInstance) {
  const read = { preHandler: [requireWorkspace('trading'), requirePremium('tradingNotes')] };
  const write = { preHandler: [requireWorkspaceWrite('trading'), requirePremium('tradingNotes')] };

  // The week board, plus everything the viewer still owes an answer on and their
  // own record. Sent together because the screen shows all three at once, and
  // three round trips for one screen is three chances to render half of it.
  app.get('/api/trading/notes', read, async (request) => {
    const viewer = { id: request.currentUser!.id, teamId: request.currentUser!.teamId ?? null };
    const weekKey = (request.query as { week?: string }).week;
    const week = await getWeek(viewer, weekKey);
    const [queue, stats, observations, tradeLinks] = await Promise.all([
      getQueue(viewer),
      getStats(viewer),
      getObservations(viewer),
      getTradeLinks(viewer, week.notes),
    ]);
    return { week, queue, stats, observations, tradeLinks };
  });

  app.post('/api/trading/notes', write, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Enter a title, and pick what kind of note this is' });
    try {
      return { note: await createNote(request.currentUser!.id, parsed.data) };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof NoteError ? err.message : 'Could not save that note' });
    }
  });

  app.patch('/api/trading/notes/:id', write, async (request, reply) => {
    const parsed = patchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Nothing to update' });
    try {
      return { note: await updateNote(request.currentUser!.id, (request.params as { id: string }).id, parsed.data) };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof NoteError ? err.message : 'Could not update that note' });
    }
  });

  app.post('/api/trading/notes/:id/visibility', write, async (request, reply) => {
    const parsed = visibilitySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Pick who this note is for' });
    try {
      return {
        note: await setVisibility(
          request.currentUser!.id,
          (request.params as { id: string }).id,
          parsed.data.visibility,
        ),
      };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof NoteError ? err.message : 'Could not share that note' });
    }
  });

  app.post('/api/trading/notes/:id/settle', write, async (request, reply) => {
    const parsed = settleSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Pick how the call turned out' });
    try {
      return {
        note: await settleNote(
          request.currentUser!.id,
          (request.params as { id: string }).id,
          parsed.data.outcome,
          parsed.data.reflection,
        ),
      };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof NoteError ? err.message : 'Could not settle that call' });
    }
  });

  app.post('/api/trading/notes/:id/reflect', write, async (request, reply) => {
    const parsed = reflectSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Write something to save a reflection' });
    try {
      return {
        note: await reflectOnNote(
          request.currentUser!.id,
          (request.params as { id: string }).id,
          parsed.data.reflection,
        ),
      };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof NoteError ? err.message : 'Could not save that reflection' });
    }
  });

  app.delete('/api/trading/notes/:id', write, async (request, reply) => {
    try {
      await removeNote(request.currentUser!.id, (request.params as { id: string }).id);
      return { ok: true };
    } catch (err) {
      return reply.code(404).send({ error: err instanceof NoteError ? err.message : 'Note not found' });
    }
  });
}
