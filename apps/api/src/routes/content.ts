import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../auth/middleware.js';
import { PROMPT_DEFS, promptDefault } from '../ai/prompts.js';
import { getSetting, setSetting, clearSetting, getSettingsByPrefix } from '../settings/service.js';
import { TEAM_CHAT_WELCOME_KEY, DEFAULT_TEAM_CHAT_WELCOME } from '../chat/welcome.js';
import {
  BadgeError,
  createBadgeType,
  deleteBadgeType,
  listBadgeTypes,
  updateBadgeType,
} from '../badges/service.js';
import {
  PatchNoteError,
  createNote,
  deleteNote,
  listAllNotes,
  listPublishedNotes,
  setNoteStatus,
  updateNote,
} from '../patchNotes/service.js';

// How-to overrides are stored under the "howto." key prefix in app_settings.
const HOWTO_PREFIX = 'howto.';

const promptSchema = z.object({ value: z.string().max(8000) });
const badgeCreateSchema = z.object({
  label: z.string().trim().min(1).max(40),
  icon: z.string().trim().min(1).max(40),
  color: z.string().trim().max(16).optional(),
  description: z.string().trim().max(200).nullable().optional(),
});
const badgeUpdateSchema = z.object({
  label: z.string().trim().min(1).max(40).optional(),
  icon: z.string().trim().min(1).max(40).optional(),
  color: z.string().trim().max(16).optional(),
  description: z.string().trim().max(200).nullable().optional(),
});
const noteSchema = z.object({
  version: z.string().trim().min(1).max(60),
  dateLabel: z.string().trim().max(60).optional().default(''),
  notes: z.array(z.string().max(600)).max(60),
});
const noteUpdateSchema = z.object({
  version: z.string().trim().min(1).max(60).optional(),
  dateLabel: z.string().trim().max(60).optional(),
  notes: z.array(z.string().max(600)).max(60).optional(),
});
const noteStatusSchema = z.object({ status: z.enum(['draft', 'published']) });
const howtoSchema = z.object({ value: z.string().max(20000) });
const welcomeSchema = z.object({ value: z.string().max(1000) });

export async function contentRoutes(app: FastifyInstance) {
  const adminGuard = { preHandler: requireAdmin };
  const authGuard = { preHandler: requireAuth };

  // ---- Badges (registry read for any signed-in user; render icons next to names) ----
  app.get('/api/badges', authGuard, async () => {
    return { badges: await listBadgeTypes() };
  });

  // ---- Patch notes: published feed for members ----
  app.get('/api/patch-notes', authGuard, async () => {
    return { notes: await listPublishedNotes() };
  });

  // ---- Editable site content (How-to overrides) for members ----
  app.get('/api/site-content', authGuard, async () => {
    const raw = await getSettingsByPrefix(HOWTO_PREFIX);
    // Strip the prefix so the client keys by screen (e.g. "live").
    const howto: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) howto[k.slice(HOWTO_PREFIX.length)] = v;
    return { howto };
  });

  // ---- Admin: AI instructions (system prompts) ----
  app.get('/api/admin/ai-prompts', adminGuard, async () => {
    const prompts = await Promise.all(
      PROMPT_DEFS.map(async (d) => {
        const override = await getSetting(`ai.${d.id}`);
        return {
          id: d.id,
          label: d.label,
          group: d.group,
          description: d.description,
          def: d.def,
          placeholder: d.placeholder ?? null,
          multiline: d.multiline,
          value: override ?? d.def,
          overridden: override != null,
        };
      }),
    );
    return { prompts };
  });

  app.put('/api/admin/ai-prompts/:id', adminGuard, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (!PROMPT_DEFS.some((d) => d.id === id)) {
      return reply.code(404).send({ error: 'Unknown prompt' });
    }
    const parsed = promptSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid value' });
    const value = parsed.data.value;
    // An empty value, or one identical to the default, clears the override.
    if (!value.trim() || value.trim() === promptDefault(id).trim()) {
      await clearSetting(`ai.${id}`);
      return { value: promptDefault(id), overridden: false };
    }
    await setSetting(`ai.${id}`, value);
    return { value, overridden: true };
  });

  app.delete('/api/admin/ai-prompts/:id', adminGuard, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (!PROMPT_DEFS.some((d) => d.id === id)) {
      return reply.code(404).send({ error: 'Unknown prompt' });
    }
    await clearSetting(`ai.${id}`);
    return { value: promptDefault(id), overridden: false };
  });

  // ---- Admin: default first team-chat (welcome) message ----
  // The greeting seeded as the first message in a new team's chat. Stored under
  // `teamchat.welcome`; a missing/blank override means "use the built-in text".
  app.get('/api/admin/teamchat-welcome', adminGuard, async () => {
    const override = await getSetting(TEAM_CHAT_WELCOME_KEY);
    return {
      value: override ?? DEFAULT_TEAM_CHAT_WELCOME,
      def: DEFAULT_TEAM_CHAT_WELCOME,
      overridden: override != null,
    };
  });

  app.put('/api/admin/teamchat-welcome', adminGuard, async (request, reply) => {
    const parsed = welcomeSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid message' });
    const value = parsed.data.value;
    // An empty value, or one identical to the default, clears the override.
    if (!value.trim() || value.trim() === DEFAULT_TEAM_CHAT_WELCOME.trim()) {
      await clearSetting(TEAM_CHAT_WELCOME_KEY);
      return { value: DEFAULT_TEAM_CHAT_WELCOME, overridden: false };
    }
    await setSetting(TEAM_CHAT_WELCOME_KEY, value);
    return { value, overridden: true };
  });

  app.delete('/api/admin/teamchat-welcome', adminGuard, async () => {
    await clearSetting(TEAM_CHAT_WELCOME_KEY);
    return { value: DEFAULT_TEAM_CHAT_WELCOME, overridden: false };
  });

  // ---- Admin: badge registry management ----
  app.post('/api/admin/badge-types', adminGuard, async (request, reply) => {
    const parsed = badgeCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Check the badge details' });
    try {
      const badge = await createBadgeType(parsed.data);
      return { badge, badges: await listBadgeTypes() };
    } catch (err) {
      if (err instanceof BadgeError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  app.patch('/api/admin/badge-types/:id', adminGuard, async (request, reply) => {
    const parsed = badgeUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid changes' });
    const id = (request.params as { id: string }).id;
    try {
      const badge = await updateBadgeType(id, parsed.data);
      return { badge, badges: await listBadgeTypes() };
    } catch (err) {
      if (err instanceof BadgeError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  app.delete('/api/admin/badge-types/:id', adminGuard, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    try {
      await deleteBadgeType(id);
      return { ok: true, badges: await listBadgeTypes() };
    } catch (err) {
      if (err instanceof BadgeError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  // ---- Admin: patch notes authoring + release ----
  app.get('/api/admin/patch-notes', adminGuard, async () => {
    return { notes: await listAllNotes() };
  });

  app.post('/api/admin/patch-notes', adminGuard, async (request, reply) => {
    const parsed = noteSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Check the release note' });
    try {
      const note = await createNote(parsed.data);
      return { note, notes: await listAllNotes() };
    } catch (err) {
      if (err instanceof PatchNoteError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  app.patch('/api/admin/patch-notes/:id', adminGuard, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = noteUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid changes' });
    try {
      const note = await updateNote(id, parsed.data);
      return { note, notes: await listAllNotes() };
    } catch (err) {
      if (err instanceof PatchNoteError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  app.post('/api/admin/patch-notes/:id/status', adminGuard, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = noteStatusSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid status' });
    try {
      const note = await setNoteStatus(id, parsed.data.status);
      return { note, notes: await listAllNotes() };
    } catch (err) {
      if (err instanceof PatchNoteError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  app.delete('/api/admin/patch-notes/:id', adminGuard, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    try {
      await deleteNote(id);
      return { ok: true, notes: await listAllNotes() };
    } catch (err) {
      if (err instanceof PatchNoteError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  // ---- Admin: editable site content (How-to) ----
  // Values are JSON blobs owned by the web client; the server stores them
  // verbatim under "howto.<screen>". An empty value clears the override.
  app.get('/api/admin/site-content', adminGuard, async () => {
    const raw = await getSettingsByPrefix(HOWTO_PREFIX);
    const howto: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) howto[k.slice(HOWTO_PREFIX.length)] = v;
    return { howto };
  });

  app.put('/api/admin/site-content/howto/:screen', adminGuard, async (request, reply) => {
    const screen = (request.params as { screen: string }).screen;
    if (!/^[a-z0-9_]{1,40}$/.test(screen)) return reply.code(400).send({ error: 'Invalid screen key' });
    const parsed = howtoSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid content' });
    const key = `${HOWTO_PREFIX}${screen}`;
    if (!parsed.data.value.trim()) {
      await clearSetting(key);
      return { ok: true, cleared: true };
    }
    await setSetting(key, parsed.data.value);
    return { ok: true, cleared: false };
  });

  app.delete('/api/admin/site-content/howto/:screen', adminGuard, async (request, reply) => {
    const screen = (request.params as { screen: string }).screen;
    if (!/^[a-z0-9_]{1,40}$/.test(screen)) return reply.code(400).send({ error: 'Invalid screen key' });
    await clearSetting(`${HOWTO_PREFIX}${screen}`);
    return { ok: true };
  });
}
