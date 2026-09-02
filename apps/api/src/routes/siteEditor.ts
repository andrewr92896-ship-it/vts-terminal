// The Site Editor's routes. See siteEditor/service.ts for the model.
//
// TWO HALVES WITH OPPOSITE AUDIENCES. Everything under /api/site-editor is
// founder-level: this edits a public website, which is the owner's and nobody
// else's. The two routes under /api/public/site are what the SITE reads — the
// published document and the uploaded files — and are unauthenticated by
// necessity, since the site has no account. They serve only what is published,
// never the draft, so a visitor reading them learns nothing they could not
// learn from the site itself.
//
// Uploads arrive as a data URL inside a JSON body, the house pattern (avatars,
// trade screenshots), so the route lifts its body limit rather than parsing
// multipart. The demo is refused on every write by the global demoGuard.

import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireFounder } from '../auth/middleware.js';
import {
  ALLOWED_EXTENSIONS,
  MAX_FILE_BYTES,
  SITES,
  SiteEditorError,
  buildExport,
  deleteFile,
  getDraft,
  getPublished,
  getStatus,
  getVersion,
  listFiles,
  listVersions,
  openFile,
  publish,
  readExport,
  renameFile,
  revertDraft,
  saveDraft,
  saveFile,
} from '../siteEditor/service.js';

const modelBody = z.object({ model: z.unknown() });
const docBody = z.object({ doc: z.unknown() });
const uploadBody = z.object({ name: z.string().min(1).max(200), data: z.string().min(1) });
const renameBody = z.object({ name: z.string().min(1).max(200) });

export async function siteEditorRoutes(app: FastifyInstance): Promise<void> {
  const dev = { preHandler: requireFounder };
  const big = { preHandler: requireFounder, bodyLimit: 3 * 1024 * 1024 };
  const upload = { preHandler: requireFounder, bodyLimit: 12 * 1024 * 1024 };

  const fail = (reply: FastifyReply, err: unknown) => {
    if (err instanceof SiteEditorError) return reply.code(400).send({ error: err.message });
    throw err;
  };
  const site = (request: { params: unknown }, reply: FastifyReply): string | null => {
    const s = (request.params as { site: string }).site;
    if (!SITES[s]) {
      void reply.code(404).send({ error: 'No such site.' });
      return null;
    }
    return s;
  };

  app.get('/api/site-editor/sites', dev, async () => ({
    sites: Object.entries(SITES).map(([key, d]) => ({ key, label: d.label, url: d.url })),
  }));

  app.get('/api/site-editor/:site', dev, async (request, reply) => {
    const s = site(request, reply);
    if (!s) return reply;
    return { model: await getDraft(s), ...(await getStatus(s)) };
  });

  app.put('/api/site-editor/:site', big, async (request, reply) => {
    const s = site(request, reply);
    if (!s) return reply;
    const parsed = modelBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Could not read that request.' });
    try {
      return await saveDraft(s, parsed.data.model);
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post('/api/site-editor/:site/publish', dev, async (request, reply) => {
    const s = site(request, reply);
    if (!s) return reply;
    try {
      const status = await publish(s);
      request.log.info({ site: s, user: request.currentUser?.id }, 'site published');
      return status;
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post('/api/site-editor/:site/revert', dev, async (request, reply) => {
    const s = site(request, reply);
    if (!s) return reply;
    try {
      return await revertDraft(s);
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.get('/api/site-editor/:site/versions', dev, async (request, reply) => {
    const s = site(request, reply);
    if (!s) return reply;
    return { versions: await listVersions(s) };
  });

  app.get('/api/site-editor/:site/versions/:id', dev, async (request, reply) => {
    const s = site(request, reply);
    if (!s) return reply;
    const found = await getVersion(s, (request.params as { id: string }).id);
    if (!found) return reply.code(404).send({ error: 'No such version.' });
    return found;
  });

  // Export takes the model in the body — what is on screen, unsaved edits
  // included — and the server builds the document so the format is defined
  // once and the file manifest is checked against what is actually stored.
  app.post('/api/site-editor/:site/export', big, async (request, reply) => {
    const s = site(request, reply);
    if (!s) return reply;
    const parsed = modelBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Could not read that request.' });
    try {
      return await buildExport(s, parsed.data.model);
    } catch (err) {
      return fail(reply, err);
    }
  });

  // Import validates and hands the model back. It deliberately does not save:
  // a restored file arrives as an ordinary edit, undoable, and reaches the site
  // only through Save and Deploy.
  app.post('/api/site-editor/:site/import', big, async (request, reply) => {
    const s = site(request, reply);
    if (!s) return reply;
    const parsed = docBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'That file is not readable JSON.' });
    try {
      return await readExport(s, parsed.data.doc);
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.get('/api/site-editor/:site/files', dev, async (request, reply) => {
    const s = site(request, reply);
    if (!s) return reply;
    return { files: await listFiles(s), allowed: ALLOWED_EXTENSIONS, maxBytes: MAX_FILE_BYTES };
  });

  app.post('/api/site-editor/:site/files', upload, async (request, reply) => {
    const s = site(request, reply);
    if (!s) return reply;
    const parsed = uploadBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Could not read that upload.' });
    try {
      const saved = await saveFile(s, parsed.data.name, parsed.data.data);
      return { ...saved, files: await listFiles(s) };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.patch('/api/site-editor/:site/files/:slug', dev, async (request, reply) => {
    const s = site(request, reply);
    if (!s) return reply;
    const parsed = renameBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A file needs a name.' });
    try {
      const file = await renameFile(s, (request.params as { slug: string }).slug, parsed.data.name);
      return { file, files: await listFiles(s) };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.delete('/api/site-editor/:site/files/:slug', dev, async (request, reply) => {
    const s = site(request, reply);
    if (!s) return reply;
    try {
      await deleteFile(s, (request.params as { slug: string }).slug);
      return { files: await listFiles(s) };
    } catch (err) {
      return fail(reply, err);
    }
  });

  // ---- what the site reads. Published only; never the draft.

  app.get('/api/public/site/:site/content', async (request, reply) => {
    const s = (request.params as { site: string }).site;
    if (!SITES[s]) return reply.code(404).send({ error: 'No such site.' });
    const live = await getPublished(s);
    if (!live) return reply.code(404).send({ error: 'Nothing is published.' });
    reply.header('Cache-Control', 'no-cache');
    return live;
  });

  app.get('/api/public/site/:site/files/:slug', async (request, reply) => {
    const { site: s, slug } = request.params as { site: string; slug: string };
    const found = await openFile(s, slug);
    if (!found) return reply.code(404).send({ error: 'No such file.' });
    reply.header('Content-Type', found.type);
    reply.header('Content-Length', String(found.size));
    reply.header(
      'Content-Disposition',
      `${found.inline ? 'inline' : 'attachment'}; filename="${found.name.replace(/["\r\n]/g, '')}"`,
    );
    reply.header('Cache-Control', 'public, max-age=300');
    return reply.send(found.data);
  });
}
