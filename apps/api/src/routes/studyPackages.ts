import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin, requireWorkspace, requirePremium } from '../auth/middleware.js';
import {
  CATEGORY_WEIGHT_MODES,
  EXPLANATION_MODES,
  PACKAGE_DEPTHS,
  SUBMISSION_STATUSES,
  type SubmissionStatus,
} from '../db/schema.js';
import { validateDocuments, parseForCommit } from '../studies/packageValidate.js';
import { addToPackage, commitPackage } from '../studies/packageImport.js';
import {
  canEditPackage,
  canManagePackage,
  canReadPackage,
  readablePackages,
  scopeOf,
  type PackageViewer,
} from '../studies/packageAccess.js';
import {
  listSharedWithMe,
  listSharesFor,
  respondToShare,
  revokeShare,
  sharePackage,
} from '../studies/packageSharing.js';
import {
  ATTESTATIONS,
  ATTESTATION_VERSION,
  addToLibrary,
  listPublished,
  listSubmissions,
  removeFromLibrary,
  reviewSubmission,
  submissionsForPackage,
  submitPackage,
  unpublishPackage,
  withdrawFromLibrary,
  withdrawSubmission,
} from '../studies/packageLibrary.js';
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
import { recordAdminAction } from '../admin/adminLog.js';
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

// ---- Import ----
//
// The plan the package is checked against. It comes from the caller's own
// wizard draft, which is client state — there is nothing to protect here, since
// a creator validating their own package against their own plan can only fool
// themselves. What the server does own is the writing: every stored id and
// sequence number is assigned in commitPackage, never taken from the file.
const importBlueprintSchema = z.object({
  blueprintId: z.string().trim().min(1).max(80),
  categoriesLocked: z.boolean(),
  categories: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(80),
        name: z.string().trim().min(1).max(60),
        weight: z.number().min(0).max(100).nullable(),
      }),
    )
    .max(60),
  questionTargets: z.record(z.string().trim().min(1).max(80), z.number().int().min(0).max(1000)).nullable(),
  totalQuestions: z.number().int().min(1).max(1000).nullable(),
  explanationsRequired: z.boolean(),
  wantQuestions: z.boolean(),
  wantFlashcards: z.boolean(),
  wantPresentation: z.boolean(),
  wantLessons: z.boolean(),
  // Carried through to the created package. Not used by validation.
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().max(120).optional(),
  audience: z.string().trim().max(120).nullable().optional(),
  depth: z.enum(PACKAGE_DEPTHS).nullable().optional(),
  categoryWeightMode: z.enum(CATEGORY_WEIGHT_MODES).nullable().optional(),
  explanationMode: z.enum(EXPLANATION_MODES).nullable().optional(),
});

// The manual ending: the plan, plus the questions the creator typed in. The
// questions are fully re-validated here because they come from the client, the
// same rule the deck import/confirm route already follows.
const letterSchema = z.enum(['A', 'B', 'C', 'D']);
const manualQuestionSchema = z.object({
  categoryId: z.string().trim().min(1).max(80).nullable().optional(),
  stem: z.string().trim().min(1).max(600),
  options: z
    .array(z.object({ label: letterSchema, text: z.string().trim().min(1).max(400) }))
    .length(4)
    .refine(
      (opts) => ['A', 'B', 'C', 'D'].every((l) => opts.some((o) => o.label === l)),
      'Each question needs exactly one option labelled A, B, C, and D',
    ),
  answer: letterSchema,
  explanation: z.string().trim().max(400).nullable().optional(),
});

// The documents are generous in size: a 1000-question package is a large file,
// and refusing it at the body limit after the AI produced it would be the worst
// possible place to fail.
const importSchema = z.object({
  documents: z.array(z.string().min(1).max(4_000_000)).min(1).max(20),
  blueprint: importBlueprintSchema,
  // The one hybrid the wizard allows: the AI wrote the flashcards or the
  // slides, and the creator is typing the questions. They ride along so both
  // halves are created in the SAME transaction — a package with the AI's
  // flashcards and no questions is exactly the half-created state to avoid.
  manualQuestions: z.array(manualQuestionSchema).max(1000).optional(),
});

const manualSchema = z.object({
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().max(120).optional(),
  depth: z.enum(PACKAGE_DEPTHS).nullable().optional(),
  categoryWeightMode: z.enum(CATEGORY_WEIGHT_MODES).nullable().optional(),
  explanationMode: z.enum(EXPLANATION_MODES).nullable().optional(),
  categories: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(80),
        name: z.string().trim().min(1).max(60),
        weight: z.number().min(0).max(100).nullable(),
      }),
    )
    .max(60),
  questions: z.array(manualQuestionSchema).min(1).max(1000),
  presentation: z
    .object({
      title: z.string().trim().max(120),
      slides: z
        .array(z.object({ title: z.string().trim().max(200), body: z.string().trim().max(4000) }))
        .min(1)
        .max(40),
    })
    .nullable()
    .optional(),
});

// Sharing takes a username (or the display name, which is unique too). It is
// resolved server-side against the real user table: a typo finds nobody and says
// so, rather than a package going to whoever happened to be closest.
const shareSchema = z.object({ handle: z.string().trim().min(1).max(80) });
const respondSchema = z.object({ accept: z.boolean() });
// Submitting requires the attestation. A boolean is all that crosses the wire —
// WHICH wording was agreed to is recorded server-side from ATTESTATION_VERSION,
// so the client cannot claim to have agreed to a version it never showed.
const submitSchema = z.object({ attested: z.literal(true) });
const reviewSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'changes_requested']),
  note: z.string().trim().max(2000).nullable().optional(),
});

export async function studyPackageRoutes(app: FastifyInstance) {
  const guard = { preHandler: requireWorkspace('studies') };
  // Making study content is paid; playing it is not. A package is authoring, so
  // it sits behind the same entitlement the deck/set/guide builders do.
  const create = { preHandler: [requireWorkspace('studies'), requirePremium('studyCreation')] };
  // Moderation is an administrator's job and has nothing to do with the Studies
  // opt-in or a membership, so it carries the admin guard alone.
  const adminGuard = { preHandler: requireAdmin };

  const viewerOf = (u: PackageViewer): PackageViewer => ({ id: u.id, teamId: u.teamId, roles: u.roles });

  // Every package this account can reach. Archived ones are left out — pass
  // `?archived=true` to list those instead, which is how an owner finds one to
  // restore.
  app.get('/api/studies/packages', guard, async (request) => {
    const me = viewerOf(request.currentUser!);
    const archived = (request.query as { archived?: string }).archived === 'true';
    return { packages: await summarize(await readablePackages(me, { archived }), me.id), archived };
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
    const pkg = await getPackage(id, me.id);
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
    return { package: pkg, packages: await summarize(await readablePackages(me), me.id) };
  });

  // Restore one. Nothing was changed by archiving, so nothing is rebuilt.
  app.post('/api/studies/packages/:id/unarchive', create, async (request, reply) => {
    const me = viewerOf(request.currentUser!);
    const id = (request.params as { id: string }).id;
    if (!(await canEditPackage(me, id))) return reply.code(404).send(NOT_FOUND);
    const pkg = await unarchivePackage(id);
    if (!pkg) return reply.code(404).send(NOT_FOUND);
    return { package: pkg, packages: await summarize(await readablePackages(me), me.id) };
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

  // ---- Import ----
  //
  // Two steps, and the split is the whole safety property: VALIDATE reads and
  // reports, CONFIRM writes. Nothing is created by parsing or checking a
  // package, so a creator can paste, read the errors, fix them with their AI and
  // paste again without leaving anything behind.
  //
  // Neither step calls VTS AI. Validation is deterministic from end to end.
  app.post('/api/studies/packages/import/validate', { ...create, bodyLimit: 32 * 1024 * 1024 }, async (request, reply) => {
    const parsed = importSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A package and its plan are required' });
    return { result: validateDocuments(parsed.data.documents, parsed.data.blueprint) };
  });

  // Create the package and everything in it, in one transaction. Re-validates
  // first: the client already did, but the check that matters is the one taken
  // immediately before the write.
  app.post('/api/studies/packages/import/commit', { ...create, bodyLimit: 32 * 1024 * 1024 }, async (request, reply) => {
    const me = request.currentUser!;
    const parsed = importSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A package and its plan are required' });
    const { documents, blueprint } = parsed.data;

    const result = validateDocuments(documents, blueprint);
    if (!result.ok) return reply.code(422).send({ error: 'That package did not pass validation', result });

    const pkg = parseForCommit(documents, blueprint);
    if (!pkg) return reply.code(422).send({ error: 'That package could not be read' });

    try {
      const created = await commitPackage({
        ownerUserId: me.id,
        createdBy: me.id,
        name: pkg.name,
        subject: pkg.subject || blueprint.subject || null,
        description: pkg.description,
        audience: blueprint.audience ?? pkg.audience,
        depth: blueprint.depth ?? null,
        explanationMode: blueprint.explanationMode ?? null,
        categoryWeightMode: blueprint.categoryWeightMode ?? null,
        categories: pkg.categories.map((c) => ({ importId: c.id, name: c.name, weight: c.weight })),
        questions: blueprint.wantQuestions
          ? pkg.questions.map((q) => ({
              categoryImportId: q.categoryId,
              stem: q.stem,
              options: q.options,
              answer: q.answer,
              explanation: q.explanation,
            }))
          : (parsed.data.manualQuestions ?? []).map((q) => ({
              categoryImportId: q.categoryId ?? null,
              stem: q.stem,
              options: q.options,
              answer: q.answer,
              explanation: q.explanation ?? null,
            })),
        // A component the plan did not ask for is left out rather than created —
        // the validator already warned that it would be.
        flashcards: blueprint.wantFlashcards
          ? pkg.flashcards.map((f) => ({ categoryImportId: f.categoryId, term: f.term, definition: f.definition }))
          : [],
        // The file's slide ids travel through as import identity. commitPackage
        // mints a stored id per slide and resolves the lessons onto those, so a
        // lesson never depends on where a slide currently sits.
        presentation:
          blueprint.wantPresentation && pkg.presentation
            ? {
                title: pkg.presentation.title,
                slides: pkg.presentation.slides.map((s) => ({ importId: s.id, title: s.title, body: s.body })),
              }
            : null,
        lessons: blueprint.wantLessons
          ? pkg.lessons.map((l) => ({
              title: l.title,
              objective: l.objective,
              body: l.body,
              slideImportIds: l.slideIds,
            }))
          : [],
        source: 'package_import',
      });
      return { package: created };
    } catch (err) {
      if (err instanceof PackageError) return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  // FINISHING a package — adding a part it was created without.
  //
  // The same validate-then-write shape as the import above, aimed at a package
  // that already exists. Until this route existed there was no way to attach a
  // component to one, so a package created without its study game could never
  // get one and a creator who had already had their AI write the questions had
  // nowhere to put them.
  //
  // On `create` AND `canEditPackage`, which is what makes a PUBLISHED package
  // refuse: its content is locked while it is in the library, so what people
  // study stays what was reviewed. Withdrawing unlocks it.
  app.post('/api/studies/packages/:id/add', { ...create, bodyLimit: 32 * 1024 * 1024 }, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    const parsed = importSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A package and its plan are required' });
    if (!(await canEditPackage(viewerOf(me), id))) return reply.code(404).send(NOT_FOUND);
    const { documents, blueprint } = parsed.data;

    const result = validateDocuments(documents, blueprint);
    if (!result.ok) return reply.code(422).send({ error: 'That package did not pass validation', result });

    const pkg = parseForCommit(documents, blueprint);
    if (!pkg) return reply.code(422).send({ error: 'That package could not be read' });

    try {
      const updated = await addToPackage({
        packageId: id,
        createdBy: me.id,
        categoryWeightMode: blueprint.categoryWeightMode ?? null,
        categories: pkg.categories.map((c) => ({ importId: c.id, name: c.name, weight: c.weight })),
        questions: blueprint.wantQuestions
          ? pkg.questions.map((q) => ({
              categoryImportId: q.categoryId,
              stem: q.stem,
              options: q.options,
              answer: q.answer,
              explanation: q.explanation,
            }))
          : (parsed.data.manualQuestions ?? []).map((q) => ({
              categoryImportId: q.categoryId ?? null,
              stem: q.stem,
              options: q.options,
              answer: q.answer,
              explanation: q.explanation ?? null,
            })),
        flashcards: blueprint.wantFlashcards
          ? pkg.flashcards.map((f) => ({ categoryImportId: f.categoryId, term: f.term, definition: f.definition }))
          : [],
        presentation:
          blueprint.wantPresentation && pkg.presentation
            ? {
                title: pkg.presentation.title,
                slides: pkg.presentation.slides.map((s) => ({ importId: s.id, title: s.title, body: s.body })),
              }
            : null,
        lessons: blueprint.wantLessons
          ? pkg.lessons.map((l) => ({
              title: l.title,
              objective: l.objective,
              body: l.body,
              slideImportIds: l.slideIds,
            }))
          : [],
        source: 'package_import',
      });
      return { package: updated };
    } catch (err) {
      if (err instanceof PackageError) return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  // The manual ending of the wizard. The questions were typed in, not imported,
  // but everything after that is identical — one transaction, package-backed by
  // construction, nothing written before this call.
  app.post('/api/studies/packages/manual', { ...create, bodyLimit: 32 * 1024 * 1024 }, async (request, reply) => {
    const me = request.currentUser!;
    const parsed = manualSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A package plan and at least one question are required' });
    const d = parsed.data;
    try {
      const created = await commitPackage({
        ownerUserId: me.id,
        createdBy: me.id,
        name: d.name,
        subject: d.subject ?? null,
        description: null,
        audience: null,
        depth: d.depth ?? null,
        explanationMode: d.explanationMode ?? null,
        categoryWeightMode: d.categoryWeightMode ?? null,
        categories: d.categories.map((c) => ({ importId: c.id, name: c.name, weight: c.weight })),
        questions: d.questions.map((q) => ({
          categoryImportId: q.categoryId ?? null,
          stem: q.stem,
          options: q.options,
          answer: q.answer,
          explanation: q.explanation ?? null,
        })),
        flashcards: [],
        // A hand-uploaded PowerPoint carries no ids of its own; commitPackage
        // mints one per slide as it writes them.
        presentation: d.presentation ? { title: d.presentation.title, slides: d.presentation.slides } : null,
        lessons: [],
        source: 'package_manual',
      });
      return { package: created };
    } catch (err) {
      if (err instanceof PackageError) return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  // ---- Sharing ----
  //
  // One person hands a package to another BY USERNAME, and neither of them joins
  // anything. There is no group, no chat, no follow — a share is permission to
  // study somebody's content and nothing else, which is what makes it work for a
  // public signup who is in no trading/private group and never will be.
  //
  // Which guard each route carries is deliberate. OFFERING a share is authoring
  // and sits behind `studyCreation`; ACCEPTING one, and an owner TAKING ACCESS
  // BACK, are both free. The second of those follows the rule the broker
  // credentials already set: disconnecting is never gated, because gating it
  // would strand a lapsed member's content in somebody else's library with no
  // way to withdraw it.
  app.post('/api/studies/packages/:id/share', create, async (request, reply) => {
    const me = viewerOf(request.currentUser!);
    const id = (request.params as { id: string }).id;
    const parsed = shareSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A username is required' });
    if (!(await canManagePackage(me, id))) return reply.code(404).send(NOT_FOUND);
    try {
      const { share, alreadyShared } = await sharePackage({
        packageId: id,
        ownerUserId: me.id,
        handle: parsed.data.handle,
      });
      // Idempotent: sharing the same package with the same person twice is the
      // same offer, and the client says so rather than implying a second one.
      //
      // The refreshed package rides along because sharing CHANGES it — the first
      // share moves it from private to shared — and a screen that updated only
      // the recipient list would go on calling a shared package private.
      return { share, alreadyShared, shares: await listSharesFor(id), package: await getPackage(id, me.id) };
    } catch (err) {
      if (err instanceof PackageError) return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  app.get('/api/studies/packages/:id/shares', guard, async (request, reply) => {
    const me = viewerOf(request.currentUser!);
    const id = (request.params as { id: string }).id;
    if (!(await canManagePackage(me, id))) return reply.code(404).send(NOT_FOUND);
    return { shares: await listSharesFor(id) };
  });

  // Taking access back. The share row goes; the recipient's PROGRESS does not —
  // it is their own record of work they actually did, and deleting it would be
  // destroying data to enforce a permission that is already enforced.
  app.delete('/api/studies/packages/:id/shares/:shareId', guard, async (request, reply) => {
    const me = viewerOf(request.currentUser!);
    const { id, shareId } = request.params as { id: string; shareId: string };
    if (!(await canManagePackage(me, id))) return reply.code(404).send(NOT_FOUND);
    const ok = await revokeShare(shareId, id);
    if (!ok) return reply.code(404).send({ error: 'That share no longer exists' });
    // Same reason as sharing: revoking the last one puts it back to private.
    return { shares: await listSharesFor(id), package: await getPackage(id, me.id) };
  });

  // What somebody has been handed. Free — accepting shared content is playing.
  app.get('/api/studies/shared-with-me', guard, async (request) => {
    return listSharedWithMe(request.currentUser!.id);
  });

  app.post('/api/studies/shares/:id/respond', guard, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    const parsed = respondSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'An answer is required' });
    const ok = await respondToShare(id, me.id, parsed.data.accept);
    if (!ok) return reply.code(404).send({ error: 'That invitation no longer exists' });
    return { ...(await listSharedWithMe(me.id)), packages: await summarize(await readablePackages(viewerOf(me)), me.id) };
  });

  // ---- The VTS Study Library ----
  //
  // SUBMITTING IS NOT PUBLISHING. A creator asks; an administrator reads it and
  // decides; only an approval makes it public. Nothing becomes public because it
  // was shared privately with somebody, and nothing becomes public on a timer.
  app.get('/api/studies/library/attestations', guard, async () => {
    return { version: ATTESTATION_VERSION, statements: ATTESTATIONS };
  });

  app.post('/api/studies/packages/:id/submit', create, async (request, reply) => {
    const me = viewerOf(request.currentUser!);
    const id = (request.params as { id: string }).id;
    const parsed = submitSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Confirm the statements before submitting' });
    if (!(await canManagePackage(me, id))) return reply.code(404).send(NOT_FOUND);
    try {
      const submission = await submitPackage({ packageId: id, userId: me.id, attested: parsed.data.attested });
      return { submission, package: await getPackage(id, me.id) };
    } catch (err) {
      if (err instanceof PackageError) return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  // Taking the request back before anybody has read it. Ungated for the same
  // reason revoking a share is.
  app.post('/api/studies/packages/:id/withdraw', guard, async (request, reply) => {
    const me = viewerOf(request.currentUser!);
    const id = (request.params as { id: string }).id;
    if (!(await canManagePackage(me, id))) return reply.code(404).send(NOT_FOUND);
    const ok = await withdrawSubmission(id);
    if (!ok) return reply.code(409).send({ error: 'This package is not waiting to be reviewed' });
    return { package: await getPackage(id, me.id), submissions: await submissionsForPackage(id) };
  });

  // The creator's own record of what they asked for and what came back.
  app.get('/api/studies/packages/:id/submissions', guard, async (request, reply) => {
    const me = viewerOf(request.currentUser!);
    const id = (request.params as { id: string }).id;
    if (!(await canManagePackage(me, id))) return reply.code(404).send(NOT_FOUND);
    return { submissions: await submissionsForPackage(id) };
  });

  // Browsing is free, and so is taking a package up: playing has never been
  // paid, and a library nobody without a membership can read is not a library.
  app.get('/api/studies/library', guard, async (request) => {
    return { entries: await listPublished(request.currentUser!.id) };
  });

  // No copy is made. The learner studies the same package-backed content
  // everybody else does, and their progress is their own because progress has
  // always been keyed by (user, deck).
  app.post('/api/studies/library/:id/add', guard, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    const ok = await addToLibrary(me.id, id);
    if (!ok) return reply.code(404).send({ error: 'That package is not in the VTS Study Library' });
    return {
      entries: await listPublished(me.id),
      packages: await summarize(await readablePackages(viewerOf(me)), me.id),
    };
  });

  app.delete('/api/studies/library/:id', guard, async (request) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    await removeFromLibrary(me.id, id);
    return {
      entries: await listPublished(me.id),
      packages: await summarize(await readablePackages(viewerOf(me)), me.id),
    };
  });

  // ---- Moderation ----
  //
  // The queue an administrator works. Approving is the only thing on the whole
  // surface that makes a package public.
  app.get('/api/studies/admin/submissions', adminGuard, async (request) => {
    const status = (request.query as { status?: string }).status;
    const filter = SUBMISSION_STATUSES.includes(status as SubmissionStatus) ? (status as SubmissionStatus) : undefined;
    return { submissions: await listSubmissions(filter) };
  });

  app.post('/api/studies/admin/submissions/:id/review', adminGuard, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    const parsed = reviewSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A decision is required' });
    try {
      const submission = await reviewSubmission({
        submissionId: id,
        reviewerId: me.id,
        decision: parsed.data.decision,
        note: parsed.data.note ?? null,
      });
      if (!submission) return reply.code(404).send({ error: 'That submission no longer exists' });
      return { submission, submissions: await listSubmissions('pending') };
    } catch (err) {
      if (err instanceof PackageError) return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  // Taking something back out of the library, as an administrator. The package
  // is untouched — this is the opposite of publishing, not a delete — and it
  // unlocks the content so the creator can work on it again.
  //
  // It is the SAME transition the creator's own withdrawal runs, so both leave
  // the same auditable record; an admin acting on somebody else's content also
  // reaches the Administrator Log, which is what that log is for.
  app.post('/api/studies/admin/packages/:id/unpublish', adminGuard, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    const pkg = await getPackage(id);
    const ok = await unpublishPackage(id, me.id);
    if (!ok) return reply.code(409).send({ error: 'That package is not published' });
    if (pkg && pkg.ownerUserId !== me.id) {
      await recordAdminAction({
        kind: 'study.unpublished',
        title: `Removed “${pkg.name}” from the VTS Study Library`,
        detail: 'The package, its content and everyone’s progress are untouched. It needs a new review to go back in.',
        actor: { id: me.id, name: me.displayName },
        target: pkg.ownerUserId ? { id: pkg.ownerUserId, name: pkg.ownerName ?? 'the creator' } : null,
      });
    }
    return { ok: true };
  });

  /**
   * WITHDRAW MY OWN PACKAGE FROM THE PUBLIC LIBRARY.
   *
   * The creator-facing half of the same transition, and a deliberately separate
   * route from `/withdraw` above — that one takes back a request nobody has read
   * yet, this one stops distribution of something already published. Two very
   * different acts that would be dangerous to confuse.
   *
   * On `manage`, not `edit`: a published package is locked against edits, which
   * is the whole point of review, and a creator must not have to break that lock
   * to stop distributing their own work. It is also why this is NOT built on
   * archiving — withdrawal is its own publication-state change, not a side
   * effect of putting the package away.
   *
   * Ungated by membership for the same reason revoking a share is: taking your
   * own content out of circulation must never depend on still paying.
   */
  app.post('/api/studies/packages/:id/withdraw-from-library', guard, async (request, reply) => {
    const me = viewerOf(request.currentUser!);
    const id = (request.params as { id: string }).id;
    if (!(await canManagePackage(me, id))) return reply.code(404).send(NOT_FOUND);
    const ok = await withdrawFromLibrary({ packageId: id, actorId: me.id });
    if (!ok) return reply.code(409).send({ error: 'This package is not in the VTS Study Library' });
    return { package: await getPackage(id, me.id), submissions: await submissionsForPackage(id) };
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
