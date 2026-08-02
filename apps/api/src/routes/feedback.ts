import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireAdmin, requireFounder } from '../auth/middleware.js';
import {
  addSuggestion,
  adminReplyToBugReport,
  createBugReport,
  listAllBugReports,
  listMyBugReports,
  listSuggestions,
  removeBugReport,
  removeSuggestion,
  replyToBugReport,
  setBugReportStatus,
  setSuggestionStatus,
  BugReportClosedError,
  BugReportForbiddenError,
} from '../feedback/service.js';

const bodySchema = z.object({ body: z.string().trim().min(1).max(4000) });

export async function feedbackRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };
  const admin = { preHandler: requireAdmin };
  // Suggestion triage lives in the Developer Terminal, not the Admin Terminal, so
  // its management routes are founder-level. Anyone signed in can still *send*
  // a suggestion (the POST below is plain auth) — only reading and acting on
  // the queue is restricted.
  const founder = { preHandler: requireFounder };

  // ---- Suggestions ----
  app.post('/api/feedback/suggestions', auth, async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Type your suggestion to send it' });
    const u = request.currentUser!;
    try {
      const suggestion = await addSuggestion(u, parsed.data.body);
      return { suggestion };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not send suggestion' });
    }
  });

  app.get('/api/admin/suggestions', founder, async () => {
    return { suggestions: await listSuggestions() };
  });

  app.patch('/api/admin/suggestions/:id', founder, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = z.object({ status: z.enum(['new', 'reviewed']) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid status' });
    return { suggestions: await setSuggestionStatus(id, parsed.data.status) };
  });

  app.delete('/api/admin/suggestions/:id', founder, async (request) => {
    const id = (request.params as { id: string }).id;
    return { suggestions: await removeSuggestion(id) };
  });

  // ---- Bug reports (AI intake) ----
  app.post('/api/feedback/bugs', auth, async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Describe the bug to report it' });
    const u = request.currentUser!;
    try {
      const report = await createBugReport(u, parsed.data.body);
      return { report };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not file report' });
    }
  });

  app.post('/api/feedback/bugs/:id/reply', auth, async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Type a reply to send it' });
    const id = (request.params as { id: string }).id;
    const u = request.currentUser!;
    try {
      const report = await replyToBugReport(u, id, parsed.data.body);
      return { report };
    } catch (err) {
      if (err instanceof BugReportForbiddenError) return reply.code(403).send({ error: err.message });
      if (err instanceof BugReportClosedError) return reply.code(400).send({ error: err.message });
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not send reply' });
    }
  });

  app.get('/api/feedback/bugs', auth, async (request) => {
    return { reports: await listMyBugReports(request.currentUser!.id) };
  });

  app.get('/api/admin/bugs', admin, async () => {
    return { reports: await listAllBugReports() };
  });

  app.post('/api/admin/bugs/:id/reply', admin, async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Type a reply to send it' });
    const id = (request.params as { id: string }).id;
    try {
      return { reports: await adminReplyToBugReport(id, parsed.data.body) };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not send reply' });
    }
  });

  app.patch('/api/admin/bugs/:id', admin, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = z.object({ status: z.enum(['open', 'submitted', 'resolved']) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid status' });
    return { reports: await setBugReportStatus(id, parsed.data.status) };
  });

  app.delete('/api/admin/bugs/:id', admin, async (request) => {
    const id = (request.params as { id: string }).id;
    return { reports: await removeBugReport(id) };
  });
}
