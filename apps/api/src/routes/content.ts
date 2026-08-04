import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireAdmin, requireFounder } from '../auth/middleware.js';
import { PROMPT_DEFS, promptDefault } from '../ai/prompts.js';
import { guardrailText } from '../ai/guardrails.js';
import { getSetting, setSetting, clearSetting, getSettingsByPrefix } from '../settings/service.js';
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

export async function contentRoutes(app: FastifyInstance) {
  const adminGuard = { preHandler: requireAdmin };
  const authGuard = { preHandler: requireAuth };
  // Founder-only tools: AI Instructions.
  const founderGuard = { preHandler: requireFounder };

  // ---- Badges (registry read for any signed-in user; render icons next to names) ----
  app.get('/api/badges', authGuard, async () => {
    return { badges: await listBadgeTypes() };
  });

  // ---- Patch notes: published feed for members ----
  app.get('/api/patch-notes', authGuard, async () => {
    return { notes: await listPublishedNotes() };
  });

  // ---- Editable site content (How-to overrides) for members ----
  // Every signed-in user reads this so any admin-customized wording renders for
  // them; only admins can change it (the PUT/DELETE routes below are admin-only).
  app.get('/api/site-content', authGuard, async () => {
    const rawHowto = await getSettingsByPrefix(HOWTO_PREFIX);
    // Strip the prefix so the client keys by screen (e.g. "live").
    const howto: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawHowto)) howto[k.slice(HOWTO_PREFIX.length)] = v;
    return { howto };
  });

  // ---- Founder: AI instructions (system prompts) ----
  app.get('/api/admin/ai-prompts', founderGuard, async () => {
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
    // The financial-advice guardrails ride along, read-only. They are welded onto
    // every prompt at send time (ai/guardrails.ts) and there is no route that can
    // change them — but an administrator editing these instructions has to be
    // able to SEE what is already being enforced, or they will write it again by
    // hand and wonder why their edits appear not to matter.
    return { prompts, guardrails: guardrailText() };
  });

  app.put('/api/admin/ai-prompts/:id', founderGuard, async (request, reply) => {
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

  app.delete('/api/admin/ai-prompts/:id', founderGuard, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (!PROMPT_DEFS.some((d) => d.id === id)) {
      return reply.code(404).send({ error: 'Unknown prompt' });
    }
    await clearSetting(`ai.${id}`);
    return { value: promptDefault(id), overridden: false };
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

  // (There is deliberately no sidebar-layout route. The sidebar's order — the
  // workspaces and the sections within each — lives in the web app's
  // theme/nav.ts and is changed by editing that file and deploying. Owner
  // decision, 2026-08: nothing at runtime may reorder the nav, so there is no
  // stored override for a route to read, write or clear. Migration 0098 dropped
  // the `nav.order` row this once persisted.)
}
