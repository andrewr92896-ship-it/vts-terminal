import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireWorkspace, requirePremium } from '../auth/middleware.js';
import { addLearned, listLearned, removeLearned } from '../studies/learned.js';
import { archiveRun, getGame, getLeaderboard, normalizeState, saveGame } from '../studies/game.js';
import { addVocab, listVocab, removeVocab } from '../studies/vocab.js';
import { addStarred, listStarred, removeStarred } from '../studies/starred.js';
import { addSection, listSections, removeSection } from '../studies/sections.js';
import {
  clearTestProgress,
  getTestLeaderboard,
  getTestProgress,
  listMyTests,
  normalizeProgress,
  recordTest,
  saveTestProgress,
} from '../studies/tests.js';
import {
  aiConfigured,
  auditDeckQuestions,
  categorizeQuestions,
  chatStudyGuide,
  classifyQuestionsIntoSection,
  defineTerm,
  generateDeckQuestions,
  generateFlashcards,
  parseDeckFromText,
  parseFlashcardsFromText,
} from '../ai/claude.js';
import { contentScopeId } from '../teams/contentScope.js';
import {
  isPackageBacked,
  packageAudience,
  packageIdOf,
  readablePackageIds,
  resolveContentScope,
  type ContentKind,
} from '../studies/packageAccess.js';
import { AiLimitError, enforceAiLimit } from '../ai/usage.js';
import { styleGuide } from '../ai/prompts.js';
import { getTeamName } from '../teams/service.js';
import { createDeck, deleteDeck, getDeck, listDecks, mergeDecks, updateDeck } from '../studies/deckStore.js';
import { ensureBakedInGamesForTeam, isBakedInSource } from '../studies/bakedGames.js';
import {
  createFlashcardSet,
  deleteFlashcardSet,
  getFlashcardSet,
  listFlashcardSets,
  updateFlashcardSet,
} from '../studies/flashcardStore.js';
import {
  archiveDeckRun,
  getDeckDraw,
  getDeckGame,
  getDeckLeaderboard,
  getPackageLeaderboard,
  saveDeckDraw,
  saveDeckGame,
} from '../studies/deckGame.js';
import { createGuide, deleteGuide, getGuide, listGuides, updateGuide } from '../studies/guideStore.js';
import { isAdmin, parseRoles } from '../auth/rbac.js';
import { getUserTeamContext } from '../userTeams/service.js';

// Who may delete team Studies content (study games, flashcard sets, guides):
//   • 'any'  — admins/founder-level, and the leader of the user's Trading Team.
//   • 'own'  — a user in no Trading Team may delete only content they created.
//   • 'none' — a Trading Team member who is not the leader cannot delete.
type StudiesDeleteMode = 'any' | 'own' | 'none';
async function studiesDeleteMode(me: { id: string; roles: string | null }): Promise<StudiesDeleteMode> {
  if (isAdmin(parseRoles(me))) return 'any';
  const ctx = await getUserTeamContext(me.id);
  if (ctx) return ctx.isLeader ? 'any' : 'none';
  return 'own';
}
const NOT_LEADER_MSG = 'Only your group leader can delete shared study content.';

// Who may delete one particular piece of content.
//
// Two ownership models, two answers. GROUP-scoped content follows the group
// rule above — the leader, or an admin. PACKAGE-BACKED content is user-owned, so
// its owner deletes their own: the group leader has no standing over somebody's
// personal study package, and applying the group rule here would leave an owner
// who happens to be on a team unable to delete a game they built themselves.
//
// PRECONDITION: only called once `resolveContentScope(..., 'edit')` has already
// granted the caller edit access. This picks the ownership question; it is not
// itself the access check.
async function deleteModeFor(
  me: { id: string; roles: string | null },
  kind: ContentKind,
  contentId: string,
): Promise<StudiesDeleteMode> {
  if (await isPackageBacked(kind, contentId)) return 'any';
  return studiesDeleteMode(me);
}

const termSchema = z.object({ term: z.string().trim().min(1).max(200) });
const gameSchema = z.object({ state: z.string() });
// The pass is opaque to the server (see the route), so the only thing worth
// checking is that it cannot grow without bound. A 400-question deck's pass is
// a few kilobytes; the cap is generous enough that no real deck reaches it and
// tight enough that this cannot become a place to park arbitrary data.
const drawSchema = z.object({ pass: z.string().max(200_000) });
const vocabAddSchema = z.object({
  term: z.string().trim().min(1).max(200),
  // Optional: the learner's own definition. When present we store it as-is and
  // skip the AI writer; when absent the tutor (Claude) writes one.
  def: z.string().trim().min(1).max(1000).optional(),
});
const starSchema = z.object({ id: z.number().int().nonnegative().max(100000) });

// A finished mock test: its final score plus a per-topic breakdown. The attempt
// number is assigned server-side, so it is not accepted from the client here.
const testRecordSchema = z.object({
  score: z.number().min(0).max(100),
  correct: z.number().int().min(0).max(1000),
  total: z.number().int().min(1).max(1000),
  passed: z.boolean(),
  durationMs: z.number().int().min(0).max(86_400_000).nullable().optional(),
  breakdown: z
    .record(
      z.string().max(60),
      z.object({ correct: z.number().int().min(0).max(1000), total: z.number().int().min(0).max(1000) }),
    )
    .optional(),
});

// Creating a custom subsection: the client sends its name plus a condensed copy
// of the question bank (id + stem + broad topic). Claude picks the matching ids.
const sectionCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  questions: z
    .array(
      z.object({
        id: z.number().int().nonnegative().max(100000),
        stem: z.string().trim().min(1).max(1000),
        topic: z.string().trim().max(60).optional(),
      }),
    )
    .min(1)
    .max(1000),
});

// Building a team study deck: AI from a topic, or from an uploaded text file.
const deckGenerateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  topic: z.string().trim().min(1).max(200),
  instructions: z.string().trim().max(2000).optional(),
  count: z.number().int().min(1).max(50),
});
// Step one of an upload: AI reads the raw file text and returns formatted
// questions for the author to review. No deck is created yet.
const deckImportPreviewSchema = z.object({
  text: z.string().min(1).max(100_000),
  instructions: z.string().trim().max(2000).optional(),
});
// Step two: the author confirms the reviewed questions and the deck is created.
// The questions come back from the client, so they are fully re-validated here.
const deckLetterSchema = z.enum(['A', 'B', 'C', 'D']);
const deckConfirmSchema = z.object({
  name: z.string().trim().min(1).max(120),
  questions: z
    .array(
      z.object({
        topic: z.string().trim().min(1).max(60),
        stem: z.string().trim().min(1).max(600),
        options: z
          .array(z.object({ label: deckLetterSchema, text: z.string().trim().min(1).max(400) }))
          .length(4)
          .refine(
            (opts) => ['A', 'B', 'C', 'D'].every((l) => opts.some((o) => o.label === l)),
            'Each question needs exactly one option labelled A, B, C, and D',
          ),
        answer: deckLetterSchema,
        explanation: z.string().trim().max(400).nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
});

// Editing a deck: rename and/or replace its questions and category list. The
// question shape mirrors the confirm schema plus an optional source-game name
// (carried on merged games for the "guess the source" mode).
const deckEditQuestionSchema = z.object({
  topic: z.string().trim().min(1).max(60),
  stem: z.string().trim().min(1).max(600),
  options: z
    .array(z.object({ label: deckLetterSchema, text: z.string().trim().min(1).max(400) }))
    .length(4)
    .refine(
      (opts) => ['A', 'B', 'C', 'D'].every((l) => opts.some((o) => o.label === l)),
      'Each question needs exactly one option labelled A, B, C, and D',
    ),
  answer: deckLetterSchema,
  explanation: z.string().trim().max(400).nullable().optional(),
  sourceName: z.string().trim().max(120).nullable().optional(),
});
const deckUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    categories: z.array(z.string().trim().min(1).max(60)).max(60).optional(),
    // What each category is worth when the practice test is scored the way the
    // real exam is. `null` turns weighting off; omitting it leaves it as it is.
    // Weights are stored as typed and normalized on read, so they need no
    // "must total 100" rule here — a total the author has not finished typing
    // must not be a 400.
    categoryWeights: z.record(z.string().trim().min(1).max(60), z.number().min(0).max(100)).nullable().optional(),
    questions: z.array(deckEditQuestionSchema).max(1000).optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.description !== undefined ||
      v.categories !== undefined ||
      v.categoryWeights !== undefined ||
      v.questions !== undefined,
    'Nothing to update',
  );
// Combining games: a new game with every question from the chosen games.
const deckMergeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  deckIds: z.array(z.string().trim().min(1)).min(1).max(50),
  tagSource: z.boolean().optional(),
});
// AI auto-categorize: assign each question a category, optionally constrained to
// a category list and/or steered by a custom prompt.
const deckCategorizeSchema = z.object({
  questions: z.array(z.object({ id: z.number().int().nonnegative().max(100000), stem: z.string().trim().min(1).max(1000) })).min(1).max(1000),
  categories: z.array(z.string().trim().min(1).max(60)).max(60).optional(),
  instructions: z.string().trim().max(2000).optional(),
});
// AI correct-answer audit: review each question (stem, options, marked answer,
// explanation) for problems — above all a wrong answer key. Read-only.
const deckAuditSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.number().int().nonnegative().max(1_000_000),
        stem: z.string().trim().min(1).max(600),
        options: z.array(z.object({ label: deckLetterSchema, text: z.string().trim().min(1).max(400) })).length(4),
        answer: deckLetterSchema,
        explanation: z.string().trim().max(400).nullable().optional(),
      }),
    )
    .min(1)
    .max(1000),
});

// ---- Team flashcard sets ----
// Building a set: AI from a topic, from an uploaded text file (previewed first),
// or typed in by hand. The card list is re-validated on create (manual + upload
// paths), since it comes back from the client.
const flashcardGenerateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  topic: z.string().trim().min(1).max(200),
  instructions: z.string().trim().max(2000).optional(),
  count: z.number().int().min(1).max(60),
});
const flashcardImportPreviewSchema = z.object({
  text: z.string().min(1).max(100_000),
  instructions: z.string().trim().max(2000).optional(),
});
// Generate flashcards from a study game's questions: pull the key vocabulary and
// write definitions. Returns cards to review before saving.
const flashcardFromDeckSchema = z.object({
  deckId: z.string().trim().min(1),
  instructions: z.string().trim().max(2000).optional(),
});
const flashcardCardSchema = z.object({
  term: z.string().trim().min(1).max(300),
  def: z.string().trim().min(1).max(2000),
  topic: z.string().trim().max(60).nullable().optional(),
});
const flashcardCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  source: z.enum(['manual', 'upload', 'from_game']).optional(),
  cards: z.array(flashcardCardSchema).min(1).max(400),
});
// Editing a set: rename and/or replace its cards.
const flashcardUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    cards: z.array(flashcardCardSchema).max(400).optional(),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined || v.cards !== undefined, 'Nothing to update');

// ---- Team study guides (slide presentations) ----
// One turn of the guide-builder conversation: the running transcript (the
// assistant turns carry the model's own prior JSON so it sees the last draft).
const guideChatSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(20_000) }))
    .min(1)
    .max(40),
});
// One presentation slide the author is saving: title, body, and an optional
// screenshot as a base64 data URL. The store re-sanitizes and caps these.
const guideSlideSchema = z.object({
  // The slide's stored identity, sent back by the editor. It MUST be accepted
  // here: zod strips what it does not declare, so leaving it out would silently
  // drop every id on save and the store would mint new ones — which is exactly
  // how a lesson ends up describing slides that no longer exist.
  id: z.string().trim().min(1).max(80).nullable().optional(),
  title: z.string().max(400).optional(),
  body: z.string().max(6000).optional(),
  image: z.string().max(4_000_000).nullable().optional(),
});
const guideCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  slides: z.array(guideSlideSchema).min(1).max(40),
});
const guideUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  slides: z.array(guideSlideSchema).min(1).max(40).optional(),
});

export async function studiesRoutes(app: FastifyInstance) {
  const guard = { preHandler: requireWorkspace('studies') };
  // MAKING study content is paid; PLAYING it is not. That split is the whole
  // shape of Studies under the paywall — a free account can work through every
  // built-in game, flashcard set and guide, and keeps its own progress, streak
  // and level. What it cannot do is author new ones. So `create` guards the
  // deck / flashcard / guide authoring routes, while the progress routes
  // (learned, vocab, starred, game state, tests) deliberately stay on `guard`.
  const create = { preHandler: [requireWorkspace('studies'), requirePremium('studyCreation')] };

  // ---- Team study games (decks) ----
  // A team builds and plays its own quizzes. Every deck is team-scoped: a member
  // creates it (AI-generated or from an uploaded file) and the whole team plays
  // it with the level-up mechanics.

  // The list of the caller's team decks, plus any package-backed game they can
  // reach. Package content is stored under its owner's personal scope key, so
  // without the second argument it would be reachable only by knowing its id.
  app.get('/api/studies/decks', guard, async (request, reply) => {
    const teamId = contentScopeId(request.currentUser!);
    // Make sure this team has the built-in example game(s) — covers teams created
    // after the last boot. Best-effort: never block the list on seeding.
    try {
      await ensureBakedInGamesForTeam(teamId);
    } catch {
      /* ignore — the built-in game will fill in on a later fetch or the next boot */
    }
    return { decks: await listDecks(teamId, await readablePackageIds(request.currentUser!)) };
  });

  // Create a deck by generating questions from a topic with Claude.
  app.post('/api/studies/decks/generate', create, async (request, reply) => {
    const teamId = contentScopeId(request.currentUser!);
    const parsed = deckGenerateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A name, topic, and question count are required' });
    if (!aiConfigured()) return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    try {
      await enforceAiLimit(request.currentUser!.id, 'studies_deck_generate');
      const questions = await generateDeckQuestions({
        topic: parsed.data.topic,
        instructions: parsed.data.instructions,
        count: parsed.data.count,
      });
      if (questions.length === 0) {
        return reply.code(422).send({ error: 'Claude could not produce questions for that topic. Try a clearer topic or add instructions.' });
      }
      const deck = await createDeck({
        teamId,
        name: parsed.data.name,
        description: parsed.data.topic,
        createdBy: request.currentUser!.id,
        source: 'ai_topic',
        questions,
      });
      return { deck, decks: await listDecks(teamId, await readablePackageIds(request.currentUser!)) };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Could not build the study game' });
    }
  });

  // Step one of a file upload: AI reads the raw file text and formats it into
  // questions the author can review before anything is saved. Returns the
  // questions (with display sequence numbers) but does NOT create a deck.
  app.post('/api/studies/decks/import/preview', create, async (request, reply) => {
    const teamId = contentScopeId(request.currentUser!);
    const parsed = deckImportPreviewSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'The file text is required' });
    if (!aiConfigured()) return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    try {
      await enforceAiLimit(request.currentUser!.id, 'studies_deck_import');
      const questions = await parseDeckFromText({
        text: parsed.data.text,
        instructions: parsed.data.instructions,
      });
      if (questions.length === 0) {
        return reply.code(422).send({ error: 'Claude could not build questions from that file. Make sure it contains questions or study material.' });
      }
      return { questions: questions.map((q, i) => ({ seq: i + 1, ...q, explanation: q.explanation || null })) };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Could not read that file' });
    }
  });

  // Step two of a file upload: the author confirms the reviewed questions and
  // the deck is created. No AI call — the questions were already formatted in
  // the preview step and are re-validated by the schema.
  app.post('/api/studies/decks/import/confirm', create, async (request, reply) => {
    const teamId = contentScopeId(request.currentUser!);
    const parsed = deckConfirmSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A name and at least one question are required' });
    try {
      const deck = await createDeck({
        teamId,
        name: parsed.data.name,
        description: 'Imported from a file',
        createdBy: request.currentUser!.id,
        source: 'upload',
        questions: parsed.data.questions.map((q) => ({
          topic: q.topic,
          stem: q.stem,
          options: q.options,
          answer: q.answer,
          explanation: q.explanation ?? null,
        })),
      });
      return { deck, decks: await listDecks(teamId, await readablePackageIds(request.currentUser!)) };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Could not build the study game' });
    }
  });

  // Combine several of the caller's games into one new game with all their
  // questions. Registered before the ":id" routes so the literal path wins.
  //
  // Each chosen game is resolved to the scope it is actually stored under, so a
  // package-backed one joins the combination instead of being silently dropped;
  // a game the caller cannot read resolves to nothing and is left out.
  app.post('/api/studies/decks/merge', create, async (request, reply) => {
    const me = request.currentUser!;
    const parsed = deckMergeSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A name and at least one game are required' });
    try {
      const resolved = await Promise.all(
        parsed.data.deckIds.map(async (id) => ({ id, scope: await resolveContentScope(me, 'deck', id, 'read') })),
      );
      const deck = await mergeDecks({
        teamId: contentScopeId(me),
        name: parsed.data.name,
        createdBy: me.id,
        sources: resolved.filter((s): s is { id: string; scope: string } => s.scope !== null),
        tagSource: parsed.data.tagSource ?? false,
      });
      if (deck.questionCount === 0) {
        await deleteDeck(deck.id, contentScopeId(me), me.id, true);
        return reply.code(422).send({ error: 'None of the chosen games had questions to combine.' });
      }
      return { deck, decks: await listDecks(contentScopeId(me), await readablePackageIds(me)) };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Could not combine the study games' });
    }
  });

  // AI auto-categorize a game's questions. Returns one {id, topic} per question
  // for the author to review before saving — it does not modify the deck.
  app.post('/api/studies/decks/categorize', create, async (request, reply) => {
    const me = request.currentUser!;
    const parsed = deckCategorizeSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Questions are required' });
    if (!aiConfigured()) return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    try {
      await enforceAiLimit(me.id, 'studies_deck_categorize');
      const assignments = await categorizeQuestions({
        questions: parsed.data.questions,
        categories: parsed.data.categories,
        instructions: parsed.data.instructions,
      });
      return { assignments };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Could not categorize the questions' });
    }
  });

  // AI correct-answer audit: review a game's questions for problems (a wrong
  // answer key above all) and flag them for the author. Read-only — it returns
  // findings and never modifies the deck. Registered before ":id" so the literal
  // path wins.
  app.post('/api/studies/decks/audit', create, async (request, reply) => {
    const me = request.currentUser!;
    const parsed = deckAuditSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Questions are required' });
    if (!aiConfigured()) return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    try {
      await enforceAiLimit(me.id, 'studies_deck_audit');
      const issues = await auditDeckQuestions(
        parsed.data.questions.map((q) => ({
          id: q.id,
          stem: q.stem,
          options: q.options,
          answer: q.answer,
          explanation: q.explanation ?? null,
        })),
      );
      return { issues };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Could not audit the questions' });
    }
  });

  // One deck with its questions. The scope comes from packageAccess: the
  // caller's own content scope for legacy games, the package's decision for
  // package-backed ones.
  app.get('/api/studies/decks/:id', guard, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    const scope = await resolveContentScope(me, 'deck', id, 'read');
    const deck = scope ? await getDeck(id, scope) : null;
    if (!deck) return reply.code(404).send({ error: 'Study game not found' });
    return { deck };
  });

  // Edit a deck: rename, replace questions, and/or set its category list
  // (creator or a team admin).
  app.patch('/api/studies/decks/:id', create, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    const parsed = deckUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Nothing valid to update' });
    const scope = await resolveContentScope(me, 'deck', id, 'edit');
    if (!scope) return reply.code(403).send({ error: 'You can only edit study games you created.' });
    // Built-in example games are code-owned and locked — nobody edits them here.
    const target = await getDeck(id, scope);
    if (target && isBakedInSource(target.source)) {
      return reply.code(403).send({ error: 'This is a built-in example game and can’t be edited.' });
    }
    const deck = await updateDeck(id, scope, me.id, isAdmin(parseRoles(me)), {
      name: parsed.data.name,
      description: parsed.data.description,
      categories: parsed.data.categories,
      categoryWeights: parsed.data.categoryWeights,
      questions: parsed.data.questions?.map((q) => ({
        topic: q.topic,
        stem: q.stem,
        options: q.options,
        answer: q.answer,
        explanation: q.explanation ?? null,
        sourceName: q.sourceName ?? null,
      })),
    });
    if (!deck) return reply.code(403).send({ error: 'You can only edit study games you created.' });
    return { deck, decks: await listDecks(contentScopeId(me), await readablePackageIds(me)) };
  });

  // Delete a deck. Only the Trading Team leader (or an admin/founder) may delete
  // team content; a team-less user may delete only games they created.
  app.delete('/api/studies/decks/:id', create, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    const scope = await resolveContentScope(me, 'deck', id, 'edit');
    if (!scope) return reply.code(403).send({ error: 'You can only delete study games you created.' });
    // Built-in example games are permanent — they can't be removed by anyone.
    const target = await getDeck(id, scope);
    if (target && isBakedInSource(target.source)) {
      return reply.code(403).send({ error: 'This is a built-in example game and can’t be removed.' });
    }
    const mode = await deleteModeFor(me, 'deck', id);
    if (mode === 'none') return reply.code(403).send({ error: NOT_LEADER_MSG });
    const ok = await deleteDeck(id, scope, me.id, mode === 'any');
    if (!ok) return reply.code(403).send({ error: 'You can only delete study games you created.' });
    return { decks: await listDecks(contentScopeId(me), await readablePackageIds(me)) };
  });

  // Per-user, per-deck game state.
  //
  // Progress stays keyed by (userId, deckId) exactly as it always was, which is
  // what makes a shared package work: everybody plays the SAME deck id and each
  // keeps their own row against it. Reaching the deck is a read — the state
  // being written belongs to the learner, not to the game.
  app.get('/api/studies/decks/:id/game', guard, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    const scope = await resolveContentScope(me, 'deck', id, 'read');
    if (!scope || !(await getDeck(id, scope))) return reply.code(404).send({ error: 'Not found' });
    return { state: await getDeckGame(me.id, id) };
  });

  app.put('/api/studies/decks/:id/game', guard, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    const scope = await resolveContentScope(me, 'deck', id, 'read');
    if (!scope || !(await getDeck(id, scope))) return reply.code(404).send({ error: 'Not found' });
    const parsed = gameSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A state string is required' });
    const state = normalizeState(parsed.data.state);
    if (state == null) return reply.code(400).send({ error: 'Invalid game state' });
    await saveDeckGame(request.currentUser!.id, id, state);
    return { ok: true };
  });

  // Where the learner is up to in this deck's shuffled pass — the questions
  // still to be asked before anything repeats.
  //
  // ON THE ACCOUNT, not the device, which is the whole point of it being a
  // route at all: the pass was localStorage-only, so studying on a phone and a
  // laptop meant two passes working through the deck independently and each
  // repeating what the other had already asked.
  //
  // The payload is OPAQUE here. Only the client knows what a pass means, and it
  // re-checks whatever it is given against the deck as it stands, dropping any
  // question that no longer exists — so there is nothing for the server to
  // validate beyond the size cap, and nothing a bad value can do but cost that
  // learner a reshuffle.
  app.get('/api/studies/decks/:id/draw', guard, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    const scope = await resolveContentScope(me, 'deck', id, 'read');
    if (!scope || !(await getDeck(id, scope))) return reply.code(404).send({ error: 'Not found' });
    return { pass: await getDeckDraw(me.id, id) };
  });

  app.put('/api/studies/decks/:id/draw', guard, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    const scope = await resolveContentScope(me, 'deck', id, 'read');
    if (!scope || !(await getDeck(id, scope))) return reply.code(404).send({ error: 'Not found' });
    const parsed = drawSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A pass string is required' });
    await saveDeckDraw(me.id, id, parsed.data.pass);
    return { ok: true };
  });

  app.post('/api/studies/decks/:id/game/archive', guard, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    const scope = await resolveContentScope(me, 'deck', id, 'read');
    if (!scope || !(await getDeck(id, scope))) return reply.code(404).send({ error: 'Not found' });
    const parsed = gameSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A state string is required' });
    const state = normalizeState(parsed.data.state);
    if (state == null) return reply.code(400).send({ error: 'Invalid game state' });
    await archiveDeckRun(request.currentUser!.id, id, state);
    return { ok: true };
  });

  // Two kinds of study game have a board, and they are ranked the same way:
  //
  //   • A BUILT-IN game — public, spanning every copy of itself on the install
  //     (owner decision, 2026-08).
  //   • A PACKAGE-BACKED game — ranked among the package's own audience: the
  //     owner, whoever accepted a share, and whoever added it from the public
  //     library. Participation follows Study Package access and never
  //     trading/private-group membership (Handoff 4).
  //
  // A legacy user-made game still has none: 404, not an empty list, so the
  // client hides the tab entirely rather than showing an empty board that looks
  // broken. The caller must be able to read the deck to ask either way, which is
  // what stops this being a way to probe deck ids.
  app.get('/api/studies/decks/:id/leaderboard', guard, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    const scope = await resolveContentScope(me, 'deck', id, 'read');
    const deck = scope ? await getDeck(id, scope) : null;
    if (!deck) return reply.code(404).send({ error: 'Not found' });
    if (isBakedInSource(deck.source)) {
      return { entries: await getDeckLeaderboard(id, me.id) };
    }
    const packageId = await packageIdOf('deck', id);
    if (!packageId) {
      return reply.code(404).send({ error: 'This study game has no leaderboard' });
    }
    return { entries: await getPackageLeaderboard(id, me.id, await packageAudience(packageId)) };
  });

  // ---- Team flashcard sets ----
  // A team builds and studies its own term/definition sets. Every set is
  // team-scoped: a member creates it (typed in, AI-generated from a topic, or
  // from an uploaded file) and the whole team studies it with the auto-rotate
  // flashcard experience.

  // The list of the caller's team flashcard sets, plus any package-backed set
  // they can reach.
  app.get('/api/studies/flashcards', guard, async (request, reply) => {
    const me = request.currentUser!;
    return { sets: await listFlashcardSets(contentScopeId(me), await readablePackageIds(me)) };
  });

  // Create a set from cards the client supplies: typed in by hand, or the
  // reviewed output of a file upload. No AI call — the cards are re-validated by
  // the schema and card numbers/ids are assigned server-side.
  app.post('/api/studies/flashcards', create, async (request, reply) => {
    const teamId = contentScopeId(request.currentUser!);
    const parsed = flashcardCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A name and at least one card are required' });
    try {
      const set = await createFlashcardSet({
        teamId,
        name: parsed.data.name,
        description: parsed.data.description,
        createdBy: request.currentUser!.id,
        source: parsed.data.source ?? 'manual',
        cards: parsed.data.cards.map((c) => ({ term: c.term, def: c.def, topic: c.topic ?? null })),
      });
      return { set, sets: await listFlashcardSets(teamId, await readablePackageIds(request.currentUser!)) };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Could not build the flashcard set' });
    }
  });

  // Create a set by generating cards from a topic with Claude.
  app.post('/api/studies/flashcards/generate', create, async (request, reply) => {
    const teamId = contentScopeId(request.currentUser!);
    const parsed = flashcardGenerateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A name, topic, and card count are required' });
    if (!aiConfigured()) return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    try {
      await enforceAiLimit(request.currentUser!.id, 'studies_flashcard_generate');
      const cards = await generateFlashcards({
        topic: parsed.data.topic,
        instructions: parsed.data.instructions,
        count: parsed.data.count,
      });
      if (cards.length === 0) {
        return reply.code(422).send({ error: 'Claude could not produce cards for that topic. Try a clearer topic or add instructions.' });
      }
      const set = await createFlashcardSet({
        teamId,
        name: parsed.data.name,
        description: parsed.data.topic,
        createdBy: request.currentUser!.id,
        source: 'ai_topic',
        cards,
      });
      return { set, sets: await listFlashcardSets(teamId, await readablePackageIds(request.currentUser!)) };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Could not build the flashcard set' });
    }
  });

  // Step one of a file upload: AI reads the raw file text and formats it into
  // cards the author can review before anything is saved. Returns the cards (with
  // display sequence numbers) but does NOT create a set.
  app.post('/api/studies/flashcards/import/preview', create, async (request, reply) => {
    const teamId = contentScopeId(request.currentUser!);
    const parsed = flashcardImportPreviewSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'The file text is required' });
    if (!aiConfigured()) return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    try {
      await enforceAiLimit(request.currentUser!.id, 'studies_flashcard_import');
      const cards = await parseFlashcardsFromText({
        text: parsed.data.text,
        instructions: parsed.data.instructions,
      });
      if (cards.length === 0) {
        return reply.code(422).send({ error: 'Claude could not build cards from that file. Make sure it contains terms or study material.' });
      }
      return { cards: cards.map((c, i) => ({ seq: i + 1, term: c.term, def: c.def, topic: c.topic })) };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Could not read that file' });
    }
  });

  // Generate flashcards from one of the team's study games: pull the key
  // vocabulary from its questions and write definitions. Returns cards (with
  // display sequence numbers) for review; no set is created yet.
  app.post('/api/studies/flashcards/from-deck', create, async (request, reply) => {
    const teamId = contentScopeId(request.currentUser!);
    const parsed = flashcardFromDeckSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A study game is required' });
    if (!aiConfigured()) return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    const deckScope = await resolveContentScope(request.currentUser!, 'deck', parsed.data.deckId, 'read');
    const deck = deckScope ? await getDeck(parsed.data.deckId, deckScope) : null;
    if (!deck) return reply.code(404).send({ error: 'Study game not found' });
    // Compose source material from the game: each question's stem, its correct
    // answer, and any explanation — the concepts to pull vocabulary from.
    const text = deck.questions
      .map((q) => {
        const correct = q.options.find((o) => o.label === q.answer)?.text ?? '';
        return [q.stem, correct ? `Answer: ${correct}` : '', q.explanation ?? ''].filter(Boolean).join('\n');
      })
      .join('\n\n');
    if (!text.trim()) return reply.code(422).send({ error: 'That study game has no questions to build flashcards from.' });
    try {
      await enforceAiLimit(request.currentUser!.id, 'studies_flashcard_from_deck');
      const cards = await parseFlashcardsFromText({
        text,
        instructions: `Build flashcards of the key terms and concepts tested by this study game "${deck.name}". Each card is a term and a concise definition. ${parsed.data.instructions ?? ''}`.trim(),
      });
      if (cards.length === 0) {
        return reply.code(422).send({ error: 'Claude could not pull vocabulary from that study game. Try adding instructions.' });
      }
      return { cards: cards.map((c, i) => ({ seq: i + 1, term: c.term, def: c.def, topic: c.topic })), deckName: deck.name };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Could not build flashcards from that game' });
    }
  });

  // One set with its cards.
  app.get('/api/studies/flashcards/:id', guard, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    const scope = await resolveContentScope(me, 'flashcards', id, 'read');
    const set = scope ? await getFlashcardSet(id, scope) : null;
    if (!set) return reply.code(404).send({ error: 'Flashcard set not found' });
    return { set };
  });

  // Edit a set: rename and/or replace its cards (creator or a team admin).
  app.patch('/api/studies/flashcards/:id', create, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    const parsed = flashcardUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Nothing valid to update' });
    const scope = await resolveContentScope(me, 'flashcards', id, 'edit');
    const set = scope
      ? await updateFlashcardSet(id, scope, me.id, isAdmin(parseRoles(me)), {
          name: parsed.data.name,
          description: parsed.data.description,
          cards: parsed.data.cards?.map((c) => ({ term: c.term, def: c.def, topic: c.topic ?? null })),
        })
      : null;
    if (!set) return reply.code(403).send({ error: 'You can only edit flashcard sets you created.' });
    return { set, sets: await listFlashcardSets(contentScopeId(me), await readablePackageIds(me)) };
  });

  // Delete a set. Only the Trading Team leader (or an admin/founder) may delete
  // team content; a team-less user may delete only sets they created.
  app.delete('/api/studies/flashcards/:id', create, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    const scope = await resolveContentScope(me, 'flashcards', id, 'edit');
    if (!scope) return reply.code(403).send({ error: 'You can only delete flashcard sets you created.' });
    const mode = await deleteModeFor(me, 'flashcards', id);
    if (mode === 'none') return reply.code(403).send({ error: NOT_LEADER_MSG });
    const ok = await deleteFlashcardSet(id, scope, me.id, mode === 'any');
    if (!ok) return reply.code(403).send({ error: 'You can only delete flashcard sets you created.' });
    return { sets: await listFlashcardSets(contentScopeId(me), await readablePackageIds(me)) };
  });

  // ---- Team study guides (slide presentations) ----
  // A team builds a study guide by conversing with Claude (which drafts the slide
  // text) and attaching its own screenshots, then presents it like a slideshow.

  // The list of the caller's team guides (metadata only — no slide blob), plus
  // any package-backed presentation they can reach.
  app.get('/api/studies/guides', guard, async (request, reply) => {
    const me = request.currentUser!;
    return { guides: await listGuides(contentScopeId(me), await readablePackageIds(me)) };
  });

  // One turn of the guide-builder conversation. Returns the assistant's reply
  // plus the complete current slide draft. Persists nothing — the client saves
  // the finished guide with POST /guides once the author is happy.
  app.post('/api/studies/guides/chat', create, async (request, reply) => {
    const teamId = contentScopeId(request.currentUser!);
    const parsed = guideChatSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A conversation message is required' });
    if (!aiConfigured()) return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    try {
      await enforceAiLimit(request.currentUser!.id, 'studies_guide_chat');
      const result = await chatStudyGuide(parsed.data.messages, await styleGuide(true));
      return { reply: result.reply, slides: result.slides };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Could not reach the guide builder' });
    }
  });

  // Save a finished guide (slides + any attached screenshots). The larger body
  // limit accommodates the embedded base64 screenshots.
  app.post('/api/studies/guides', { ...create, bodyLimit: 25 * 1024 * 1024 }, async (request, reply) => {
    const teamId = contentScopeId(request.currentUser!);
    const parsed = guideCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A name and at least one slide are required' });
    const guide = await createGuide({
      teamId,
      name: parsed.data.name,
      description: parsed.data.description,
      createdBy: request.currentUser!.id,
      slides: parsed.data.slides.map((s) => ({
        id: s.id ?? null,
        title: s.title ?? '',
        body: s.body ?? '',
        image: s.image ?? null,
      })),
    });
    if (guide.slideCount === 0) {
      // Every slide was empty (no text, no image); nothing worth keeping.
      await deleteGuide(guide.id, teamId, request.currentUser!.id, true);
      return reply.code(422).send({ error: 'A study guide needs at least one slide with text or a screenshot.' });
    }
    return { guide, guides: await listGuides(teamId, await readablePackageIds(request.currentUser!)) };
  });

  // One guide with its slides.
  app.get('/api/studies/guides/:id', guard, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    const scope = await resolveContentScope(me, 'guide', id, 'read');
    const guide = scope ? await getGuide(id, scope) : null;
    if (!guide) return reply.code(404).send({ error: 'Study guide not found' });
    return { guide };
  });

  // Update a guide's name/description/slides (creator or a team admin).
  app.put('/api/studies/guides/:id', { ...create, bodyLimit: 25 * 1024 * 1024 }, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    const parsed = guideUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Nothing valid to update' });
    const scope = await resolveContentScope(me, 'guide', id, 'edit');
    const guide = scope
      ? await updateGuide(id, scope, me.id, isAdmin(parseRoles(me)), {
          name: parsed.data.name,
          description: parsed.data.description,
          slides: parsed.data.slides?.map((s) => ({
            id: s.id ?? null,
            title: s.title ?? '',
            body: s.body ?? '',
            image: s.image ?? null,
          })),
        })
      : null;
    if (!guide) return reply.code(403).send({ error: 'You can only edit study guides you created.' });
    return { guide, guides: await listGuides(contentScopeId(me), await readablePackageIds(me)) };
  });

  // Delete a guide. Only the Trading Team leader (or an admin/founder) may delete
  // team content; a team-less user may delete only guides they created.
  app.delete('/api/studies/guides/:id', create, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    const scope = await resolveContentScope(me, 'guide', id, 'edit');
    if (!scope) return reply.code(403).send({ error: 'You can only delete study guides you created.' });
    const mode = await deleteModeFor(me, 'guide', id);
    if (mode === 'none') return reply.code(403).send({ error: NOT_LEADER_MSG });
    const ok = await deleteGuide(id, scope, me.id, mode === 'any');
    if (!ok) return reply.code(403).send({ error: 'You can only delete study guides you created.' });
    return { guides: await listGuides(contentScopeId(me), await readablePackageIds(me)) };
  });

  app.get('/api/studies/learned', guard, async (request) => {
    return { terms: await listLearned(request.currentUser!.id) };
  });

  app.post('/api/studies/learned', guard, async (request, reply) => {
    const parsed = termSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A term is required' });
    return { terms: await addLearned(request.currentUser!.id, parsed.data.term) };
  });

  // The term travels as a query param (encoded), since vocabulary terms contain
  // spaces and other characters that do not fit cleanly in a path segment.
  app.delete('/api/studies/learned', guard, async (request) => {
    const q = request.query as { term?: string };
    const term = typeof q.term === 'string' ? q.term : '';
    return { terms: await removeLearned(request.currentUser!.id, term) };
  });

  // ---- Custom flashcard deck ----
  // The learner's own words. The definition and topic are generated by VTS AI
  // when a word is added (unless the learner types their own), then stored so the
  // personal deck syncs across devices.
  app.get('/api/studies/vocab', guard, async (request) => {
    return { cards: await listVocab(request.currentUser!.id) };
  });

  app.post('/api/studies/vocab', guard, async (request, reply) => {
    const parsed = vocabAddSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A word is required' });
    // The learner supplied their own definition: store it directly, no AI call.
    if (parsed.data.def) {
      const cards = await addVocab(request.currentUser!.id, parsed.data.term, parsed.data.def, 'Custom');
      return { cards };
    }
    if (!aiConfigured()) {
      return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    }
    try {
      await enforceAiLimit(request.currentUser!.id, 'studies_vocab');
      const { def, topic } = await defineTerm(parsed.data.term);
      const cards = await addVocab(request.currentUser!.id, parsed.data.term, def, topic);
      return { cards };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Could not add the word' });
    }
  });

  // Like learned terms, the word travels as an encoded query param.
  app.delete('/api/studies/vocab', guard, async (request) => {
    const q = request.query as { term?: string };
    const term = typeof q.term === 'string' ? q.term : '';
    return { cards: await removeVocab(request.currentUser!.id, term) };
  });

  // ---- Starred quiz questions ----
  // Question ids the learner flagged to revisit, stored so the starred set syncs
  // across devices. The question bank itself is static on the client; we only
  // persist the ids.
  app.get('/api/studies/starred', guard, async (request) => {
    return { ids: await listStarred(request.currentUser!.id) };
  });

  app.post('/api/studies/starred', guard, async (request, reply) => {
    const parsed = starSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A question id is required' });
    return { ids: await addStarred(request.currentUser!.id, parsed.data.id) };
  });

  // The id travels as a query param to keep the DELETE body-less.
  app.delete('/api/studies/starred', guard, async (request, reply) => {
    const q = request.query as { id?: string };
    const id = Number(q.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'A question id is required' });
    return { ids: await removeStarred(request.currentUser!.id, id) };
  });

  // ---- Custom quiz subsections ----
  // Learner-defined focus areas (e.g. "Bonds"). On create, Claude classifies the
  // question bank the client sends and we store the matching ids; the subsection
  // then behaves like any built-in category. Synced per user across devices.
  app.get('/api/studies/sections', guard, async (request) => {
    return { sections: await listSections(request.currentUser!.id) };
  });

  app.post('/api/studies/sections', guard, async (request, reply) => {
    const parsed = sectionCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'A subsection name and questions are required' });
    }
    if (!aiConfigured()) {
      return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    }
    try {
      await enforceAiLimit(request.currentUser!.id, 'studies_section');
      const ids = await classifyQuestionsIntoSection(parsed.data.name, parsed.data.questions);
      if (ids.length === 0) {
        return reply.code(422).send({
          error: `No questions matched “${parsed.data.name}”. Try a broader or more common topic name.`,
        });
      }
      const section = await addSection(request.currentUser!.id, parsed.data.name, ids);
      return { section, sections: await listSections(request.currentUser!.id) };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Could not build the subsection' });
    }
  });

  // The id travels as a query param to keep the DELETE body-less.
  app.delete('/api/studies/sections', guard, async (request, reply) => {
    const q = request.query as { id?: string };
    const id = typeof q.id === 'string' ? q.id : '';
    if (!id) return reply.code(400).send({ error: 'A subsection id is required' });
    await removeSection(request.currentUser!.id, id);
    return { sections: await listSections(request.currentUser!.id) };
  });

  // The Study Game state (levels, scores, per-category history) is stored as one
  // JSON blob per user so quiz progress follows them across devices.
  app.get('/api/studies/game', guard, async (request) => {
    return { state: await getGame(request.currentUser!.id) };
  });

  app.put('/api/studies/game', guard, async (request, reply) => {
    const parsed = gameSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A state string is required' });
    const state = normalizeState(parsed.data.state);
    if (state == null) return reply.code(400).send({ error: 'Invalid game state' });
    await saveGame(request.currentUser!.id, state);
    return { ok: true };
  });

  // Bank the current run to the leaderboard as a past run. Called when the
  // learner resets their progress, so the session is preserved on the board
  // rather than erased. The run's headline numbers are read from the posted
  // state (the same blob the client saves), and an empty run is a silent no-op.
  app.post('/api/studies/game/archive', guard, async (request, reply) => {
    const parsed = gameSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A state string is required' });
    const state = normalizeState(parsed.data.state);
    if (state == null) return reply.code(400).send({ error: 'Invalid game state' });
    await archiveRun(request.currentUser!.id, state);
    return { ok: true };
  });

  // High-score table: everyone's headline Study Game stats, so learners can see
  // where they stand and compare progress with each other.
  app.get('/api/studies/leaderboard', guard, async (request) => {
    const me = request.currentUser!;
    const [entries, teamName] = await Promise.all([getLeaderboard(me.id), getTeamName(contentScopeId(me))]);
    return { entries, team: teamName ? { id: contentScopeId(me)!, name: teamName } : null };
  });

  // ---- Mock tests ----
  // Record a finished 100-question mock exam and return it stamped with the
  // server-assigned attempt number, so the client can show "recorded as attempt
  // #N" and the test leaderboard updates.
  app.post('/api/studies/tests', guard, async (request, reply) => {
    const parsed = testRecordSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A completed test result is required' });
    const result = await recordTest(request.currentUser!.id, {
      score: parsed.data.score,
      correct: parsed.data.correct,
      total: parsed.data.total,
      passed: parsed.data.passed,
      durationMs: parsed.data.durationMs ?? null,
      breakdown: parsed.data.breakdown ?? {},
    });
    return { result };
  });

  // The test high-score board (each player's best run, tagged with the attempt
  // that produced it) plus the caller's own attempt history.
  app.get('/api/studies/tests/leaderboard', guard, async (request) => {
    const me = request.currentUser!;
    const [entries, mine, teamName] = await Promise.all([
      getTestLeaderboard(me.id),
      listMyTests(me.id),
      getTeamName(contentScopeId(me)),
    ]);
    return { entries, mine, team: teamName ? { id: contentScopeId(me)!, name: teamName } : null };
  });

  // In-progress test state, stored as one JSON blob per user so an unfinished
  // sitting follows the learner across devices (like the Study Game state).
  app.get('/api/studies/tests/progress', guard, async (request) => {
    return { state: await getTestProgress(request.currentUser!.id) };
  });

  app.put('/api/studies/tests/progress', guard, async (request, reply) => {
    const parsed = gameSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A state string is required' });
    const state = normalizeProgress(parsed.data.state);
    if (state == null) return reply.code(400).send({ error: 'Invalid test progress' });
    await saveTestProgress(request.currentUser!.id, state);
    return { ok: true };
  });

  app.delete('/api/studies/tests/progress', guard, async (request) => {
    await clearTestProgress(request.currentUser!.id);
    return { ok: true };
  });
}
