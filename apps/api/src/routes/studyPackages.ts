import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireWorkspace, requirePremium } from '../auth/middleware.js';
import { PACKAGE_DEPTHS } from '../db/schema.js';
import {
  canEditPackage,
  canReadPackage,
  readablePackages,
  scopeOf,
  type PackageViewer,
} from '../studies/packageAccess.js';
import {
  MAX_CATEGORIES,
  MAX_LESSONS,
  PackageError,
  archivePackage,
  componentIds,
  createPackage,
  getPackage,
  setCategories,
  setLessons,
  summarize,
  unarchivePackage,
  updatePackage,
} from '../studies/packageStore.js';
import { getDeck } from '../studies/deckStore.js';
import { getFlashcardSet } from '../studies/flashcardStore.js';
import { getGuide } from '../studies/guideStore.js';

// Study Packages — the owner-facing container for newly created Study content.
//
// Two things to keep straight about these routes:
//
//   • ACCESS is decided by studies/packageAccess.ts and nowhere else. A handler
//     here asks whether the caller may read or edit, and does nothing clever of
//     its own. A package is reached by owning it, by having been shared with it,
//     or by it being published — never by being in the owner's trading/private
//     group, which is what makes Study sharing work for a public signup.
//
//   • A missing package and a forbidden one both answer 404. An id somebody does
//     not hold must not be probeable for existence, and the same rule already
//     governs the funded-account routes.

const packageCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  subject: z.string().trim().max(120).nullable().optional(),
  audience: z.string().trim().max(120).nullable().optional(),
  depth: z.enum(PACKAGE_DEPTHS).nullable().optional(),
});

// Visibility is deliberately absent. It is owner-controlled metadata in the
// schema, but the states beyond `private` mean "shared with somebody" and
// "published", and neither has its machinery yet — accepting the value here
// would let a package claim a status nothing enforces.
const packageUpdateSchema = packageCreateSchema.partial().refine(
  (v) =>
    v.name !== undefined ||
    v.description !== undefined ||
    v.subject !== undefined ||
    v.audience !== undefined ||
    v.depth !== undefined,
  'Nothing to update',
);

// The category blueprint, sent whole. An entry carrying an `id` keeps that
// category's identity — see setCategories, where the reason this matters is
// written out.
const categoriesSchema = z.object({
  categories: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(60).nullable().optional(),
        name: z.string().trim().min(1).max(60),
        weight: z.number().min(0).max(100).nullable().optional(),
      }),
    )
    .max(MAX_CATEGORIES),
});

const lessonsSchema = z.object({
  lessons: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(60).nullable().optional(),
        title: z.string().trim().min(1).max(200),
        objective: z.string().trim().max(1000).nullable().optional(),
        body: z.string().trim().max(20_000).nullable().optional(),
      }),
    )
    .max(MAX_LESSONS),
});

const NOT_FOUND = { error: 'Study package not found' };

export async function studyPackageRoutes(app: FastifyInstance) {
  const guard = { preHandler: requireWorkspace('studies') };
  // Making study content is paid; playing it is not. A package is authoring, so
  // it sits behind the same entitlement the deck/set/guide builders do.
  const create = { preHandler: [requireWorkspace('studies'), requirePremium('studyCreation')] };

  const viewerOf = (u: PackageViewer): PackageViewer => ({ id: u.id, teamId: u.teamId, roles: u.roles });

  // Every package this account can reach. Archived ones are left out — pass
  // `?archived=true` to list those instead, which is how an owner finds one to
  // restore.
  app.get('/api/studies/packages', guard, async (request) => {
    const me = viewerOf(request.currentUser!);
    const archived = (request.query as { archived?: string }).archived === 'true';
    return { packages: await summarize(await readablePackages(me, { archived })), archived };
  });

  // Create the shell. Components and the category blueprint are added after.
  app.post('/api/studies/packages', create, async (request, reply) => {
    const me = request.currentUser!;
    const parsed = packageCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A name is required' });
    try {
      const pkg = await createPackage({
        ownerUserId: me.id,
        createdBy: me.id,
        name: parsed.data.name,
        description: parsed.data.description,
        subject: parsed.data.subject,
        audience: parsed.data.audience,
        depth: parsed.data.depth,
      });
      return { package: pkg };
    } catch (err) {
      if (err instanceof PackageError) return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  // One package: its metadata, its stable categories, its lessons, and the ids
  // of the components the existing players open.
  app.get('/api/studies/packages/:id', guard, async (request, reply) => {
    const me = viewerOf(request.currentUser!);
    const id = (request.params as { id: string }).id;
    if (!(await canReadPackage(me, id))) return reply.code(404).send(NOT_FOUND);
    const pkg = await getPackage(id);
    if (!pkg) return reply.code(404).send(NOT_FOUND);
    return { package: pkg };
  });

  app.patch('/api/studies/packages/:id', create, async (request, reply) => {
    const me = viewerOf(request.currentUser!);
    const id = (request.params as { id: string }).id;
    const parsed = packageUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Nothing valid to update' });
    if (!(await canEditPackage(me, id))) return reply.code(404).send(NOT_FOUND);
    const pkg = await updatePackage(id, parsed.data);
    if (!pkg) return reply.code(404).send(NOT_FOUND);
    return { package: pkg };
  });

  // ARCHIVE — the only removal a creator gets, and deliberately not a delete.
  //
  // Nothing is destroyed, detached or rewritten: the package, its components,
  // every learner's progress and the stable category ids are all left as they
  // are, and the package simply stops appearing in the ordinary lists. There is
  // NO permanent-delete route here on purpose; purgePackage exists for account
  // deletion and has no user-facing workflow.
  app.post('/api/studies/packages/:id/archive', create, async (request, reply) => {
    const me = viewerOf(request.currentUser!);
    const id = (request.params as { id: string }).id;
    if (!(await canEditPackage(me, id))) return reply.code(404).send(NOT_FOUND);
    const pkg = await archivePackage(id);
    if (!pkg) return reply.code(404).send(NOT_FOUND);
    return { package: pkg, packages: await summarize(await readablePackages(me)) };
  });

  // Restore one. Nothing was changed by archiving, so nothing is rebuilt.
  app.post('/api/studies/packages/:id/unarchive', create, async (request, reply) => {
    const me = viewerOf(request.currentUser!);
    const id = (request.params as { id: string }).id;
    if (!(await canEditPackage(me, id))) return reply.code(404).send(NOT_FOUND);
    const pkg = await unarchivePackage(id);
    if (!pkg) return reply.code(404).send(NOT_FOUND);
    return { package: pkg, packages: await summarize(await readablePackages(me)) };
  });

  // The category blueprint. Sent whole; an entry with an `id` keeps that
  // category's identity, so a rename is a rename rather than a delete and an
  // add — which is the difference between keeping a learner's history for it
  // and silently resetting it.
  app.put('/api/studies/packages/:id/categories', create, async (request, reply) => {
    const me = viewerOf(request.currentUser!);
    const id = (request.params as { id: string }).id;
    const parsed = categoriesSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A category list is required' });
    if (!(await canEditPackage(me, id))) return reply.code(404).send(NOT_FOUND);
    try {
      const categories = await setCategories(
        id,
        parsed.data.categories.map((c) => ({ id: c.id ?? null, name: c.name, weight: c.weight ?? null })),
      );
      return { categories };
    } catch (err) {
      if (err instanceof PackageError) return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  app.put('/api/studies/packages/:id/lessons', create, async (request, reply) => {
    const me = viewerOf(request.currentUser!);
    const id = (request.params as { id: string }).id;
    const parsed = lessonsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A lesson list is required' });
    if (!(await canEditPackage(me, id))) return reply.code(404).send(NOT_FOUND);
    try {
      const lessons = await setLessons(
        id,
        parsed.data.lessons.map((l) => ({
          id: l.id ?? null,
          title: l.title,
          objective: l.objective ?? null,
          body: l.body ?? null,
        })),
      );
      return { lessons };
    } catch (err) {
      if (err instanceof PackageError) return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  // What the package holds, summarized. The components themselves are read and
  // played through the routes that already serve them — this says what is there
  // and under which id, so a caller knows which of those to open.
  app.get('/api/studies/packages/:id/components', guard, async (request, reply) => {
    const me = viewerOf(request.currentUser!);
    const id = (request.params as { id: string }).id;
    if (!(await canReadPackage(me, id))) return reply.code(404).send(NOT_FOUND);
    const ids = await componentIds(id);
    // Read under each row's own stored scope: access was just decided by the
    // package, so re-deciding it here on the viewer's content scope would refuse
    // a legitimate share recipient for having a different one.
    const [deck, set, guide] = await Promise.all([
      ids.deckId ? getDeckSummary(ids.deckId) : null,
      ids.flashcardSetId ? getSetSummary(ids.flashcardSetId) : null,
      ids.guideId ? getGuideSummary(ids.guideId) : null,
    ]);
    return { deck, flashcardSet: set, guide };
  });
}

// The component summaries above, each read by id under the row's own scope.
// Package access has already been established by the time these run.
async function getDeckSummary(deckId: string) {
  const scope = await scopeOf('deck', deckId);
  if (!scope) return null;
  const deck = await getDeck(deckId, scope);
  return deck ? { id: deck.id, name: deck.name, questionCount: deck.questionCount, categories: deck.categories } : null;
}

async function getSetSummary(setId: string) {
  const scope = await scopeOf('flashcards', setId);
  if (!scope) return null;
  const set = await getFlashcardSet(setId, scope);
  return set ? { id: set.id, name: set.name, cardCount: set.cardCount, topics: set.topics } : null;
}

async function getGuideSummary(guideId: string) {
  const scope = await scopeOf('guide', guideId);
  if (!scope) return null;
  const guide = await getGuide(guideId, scope);
  return guide ? { id: guide.id, name: guide.name, slideCount: guide.slideCount } : null;
}
