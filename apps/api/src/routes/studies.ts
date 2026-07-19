import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireWorkspace } from '../auth/middleware.js';
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
  categorizeQuestions,
  chatStudyGuide,
  classifyQuestionsIntoSection,
  defineTerm,
  generateDeckQuestions,
  generateFlashcards,
  parseDeckFromText,
  parseFlashcardsFromText,
} from '../ai/claude.js';
import { AiLimitError, enforceAiLimit } from '../ai/usage.js';
import { getTeamName } from '../teams/service.js';
import { createDeck, deleteDeck, getDeck, listDecks, mergeDecks, updateDeck } from '../studies/deckStore.js';
import {
  createFlashcardSet,
  deleteFlashcardSet,
  getFlashcardSet,
  listFlashcardSets,
  updateFlashcardSet,
} from '../studies/flashcardStore.js';
import { archiveDeckRun, getDeckGame, getDeckLeaderboard, saveDeckGame } from '../studies/deckGame.js';
import { createGuide, deleteGuide, getGuide, listGuides, updateGuide } from '../studies/guideStore.js';
import { isAdmin, parseRoles } from '../auth/rbac.js';

const termSchema = z.object({ term: z.string().trim().min(1).max(200) });
const gameSchema = z.object({ state: z.string() });
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
    questions: z.array(deckEditQuestionSchema).max(1000).optional(),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined || v.categories !== undefined || v.questions !== undefined, 'Nothing to update');
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
const flashcardCardSchema = z.object({
  term: z.string().trim().min(1).max(300),
  def: z.string().trim().min(1).max(2000),
  topic: z.string().trim().max(60).nullable().optional(),
});
const flashcardCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  source: z.enum(['manual', 'upload']).optional(),
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

  // ---- Team study games (decks) ----
  // A team builds and plays its own quizzes. Every deck is team-scoped: a member
  // creates it (AI-generated or from an uploaded file) and the whole team plays
  // it with the level-up mechanics.

  // The list of the caller's team decks.
  app.get('/api/studies/decks', guard, async (request, reply) => {
    const teamId = request.currentUser!.teamId;
    if (!teamId) return reply.send({ decks: [] });
    return { decks: await listDecks(teamId) };
  });

  // Create a deck by generating questions from a topic with Claude.
  app.post('/api/studies/decks/generate', guard, async (request, reply) => {
    const teamId = request.currentUser!.teamId;
    if (!teamId) return reply.code(400).send({ error: 'You need to be on a team to build a study game.' });
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
      return { deck, decks: await listDecks(teamId) };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Could not build the study game' });
    }
  });

  // Step one of a file upload: AI reads the raw file text and formats it into
  // questions the author can review before anything is saved. Returns the
  // questions (with display sequence numbers) but does NOT create a deck.
  app.post('/api/studies/decks/import/preview', guard, async (request, reply) => {
    const teamId = request.currentUser!.teamId;
    if (!teamId) return reply.code(400).send({ error: 'You need to be on a team to build a study game.' });
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
  app.post('/api/studies/decks/import/confirm', guard, async (request, reply) => {
    const teamId = request.currentUser!.teamId;
    if (!teamId) return reply.code(400).send({ error: 'You need to be on a team to build a study game.' });
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
      return { deck, decks: await listDecks(teamId) };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Could not build the study game' });
    }
  });

  // Combine several of the team's games into one new game with all their
  // questions. Registered before the ":id" routes so the literal path wins.
  app.post('/api/studies/decks/merge', guard, async (request, reply) => {
    const me = request.currentUser!;
    if (!me.teamId) return reply.code(400).send({ error: 'You need to be on a team to combine study games.' });
    const parsed = deckMergeSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A name and at least one game are required' });
    try {
      const deck = await mergeDecks({
        teamId: me.teamId,
        name: parsed.data.name,
        createdBy: me.id,
        deckIds: parsed.data.deckIds,
        tagSource: parsed.data.tagSource ?? false,
      });
      if (deck.questionCount === 0) {
        await deleteDeck(deck.id, me.teamId, me.id, true);
        return reply.code(422).send({ error: 'None of the chosen games had questions to combine.' });
      }
      return { deck, decks: await listDecks(me.teamId) };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Could not combine the study games' });
    }
  });

  // AI auto-categorize a game's questions. Returns one {id, topic} per question
  // for the author to review before saving — it does not modify the deck.
  app.post('/api/studies/decks/categorize', guard, async (request, reply) => {
    const me = request.currentUser!;
    if (!me.teamId) return reply.code(400).send({ error: 'You need to be on a team.' });
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

  // One deck with its questions (team-scoped).
  app.get('/api/studies/decks/:id', guard, async (request, reply) => {
    const teamId = request.currentUser!.teamId;
    const id = (request.params as { id: string }).id;
    if (!teamId) return reply.code(404).send({ error: 'Not found' });
    const deck = await getDeck(id, teamId);
    if (!deck) return reply.code(404).send({ error: 'Study game not found' });
    return { deck };
  });

  // Edit a deck: rename, replace questions, and/or set its category list
  // (creator or a team admin).
  app.patch('/api/studies/decks/:id', guard, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    if (!me.teamId) return reply.code(404).send({ error: 'Not found' });
    const parsed = deckUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Nothing valid to update' });
    const deck = await updateDeck(id, me.teamId, me.id, isAdmin(parseRoles(me)), {
      name: parsed.data.name,
      description: parsed.data.description,
      categories: parsed.data.categories,
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
    return { deck, decks: await listDecks(me.teamId) };
  });

  // Delete a deck (creator or a team admin).
  app.delete('/api/studies/decks/:id', guard, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    if (!me.teamId) return reply.code(404).send({ error: 'Not found' });
    const ok = await deleteDeck(id, me.teamId, me.id, isAdmin(parseRoles(me)));
    if (!ok) return reply.code(403).send({ error: 'You can only delete study games you created.' });
    return { decks: await listDecks(me.teamId) };
  });

  // Per-user, per-deck game state.
  app.get('/api/studies/decks/:id/game', guard, async (request, reply) => {
    const teamId = request.currentUser!.teamId;
    const id = (request.params as { id: string }).id;
    if (!teamId || !(await getDeck(id, teamId))) return reply.code(404).send({ error: 'Not found' });
    return { state: await getDeckGame(request.currentUser!.id, id) };
  });

  app.put('/api/studies/decks/:id/game', guard, async (request, reply) => {
    const teamId = request.currentUser!.teamId;
    const id = (request.params as { id: string }).id;
    if (!teamId || !(await getDeck(id, teamId))) return reply.code(404).send({ error: 'Not found' });
    const parsed = gameSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A state string is required' });
    const state = normalizeState(parsed.data.state);
    if (state == null) return reply.code(400).send({ error: 'Invalid game state' });
    await saveDeckGame(request.currentUser!.id, id, state);
    return { ok: true };
  });

  app.post('/api/studies/decks/:id/game/archive', guard, async (request, reply) => {
    const teamId = request.currentUser!.teamId;
    const id = (request.params as { id: string }).id;
    if (!teamId || !(await getDeck(id, teamId))) return reply.code(404).send({ error: 'Not found' });
    const parsed = gameSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A state string is required' });
    const state = normalizeState(parsed.data.state);
    if (state == null) return reply.code(400).send({ error: 'Invalid game state' });
    await archiveDeckRun(request.currentUser!.id, id, state);
    return { ok: true };
  });

  // The per-deck leaderboard (all players of a deck are teammates by design).
  app.get('/api/studies/decks/:id/leaderboard', guard, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    if (!me.teamId || !(await getDeck(id, me.teamId))) return reply.code(404).send({ error: 'Not found' });
    return { entries: await getDeckLeaderboard(id, me.id) };
  });

  // ---- Team flashcard sets ----
  // A team builds and studies its own term/definition sets. Every set is
  // team-scoped: a member creates it (typed in, AI-generated from a topic, or
  // from an uploaded file) and the whole team studies it with the auto-rotate
  // flashcard experience.

  // The list of the caller's team flashcard sets.
  app.get('/api/studies/flashcards', guard, async (request, reply) => {
    const teamId = request.currentUser!.teamId;
    if (!teamId) return reply.send({ sets: [] });
    return { sets: await listFlashcardSets(teamId) };
  });

  // Create a set from cards the client supplies: typed in by hand, or the
  // reviewed output of a file upload. No AI call — the cards are re-validated by
  // the schema and card numbers/ids are assigned server-side.
  app.post('/api/studies/flashcards', guard, async (request, reply) => {
    const teamId = request.currentUser!.teamId;
    if (!teamId) return reply.code(400).send({ error: 'You need to be on a team to build a flashcard set.' });
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
      return { set, sets: await listFlashcardSets(teamId) };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Could not build the flashcard set' });
    }
  });

  // Create a set by generating cards from a topic with Claude.
  app.post('/api/studies/flashcards/generate', guard, async (request, reply) => {
    const teamId = request.currentUser!.teamId;
    if (!teamId) return reply.code(400).send({ error: 'You need to be on a team to build a flashcard set.' });
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
      return { set, sets: await listFlashcardSets(teamId) };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Could not build the flashcard set' });
    }
  });

  // Step one of a file upload: AI reads the raw file text and formats it into
  // cards the author can review before anything is saved. Returns the cards (with
  // display sequence numbers) but does NOT create a set.
  app.post('/api/studies/flashcards/import/preview', guard, async (request, reply) => {
    const teamId = request.currentUser!.teamId;
    if (!teamId) return reply.code(400).send({ error: 'You need to be on a team to build a flashcard set.' });
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

  // One set with its cards (team-scoped).
  app.get('/api/studies/flashcards/:id', guard, async (request, reply) => {
    const teamId = request.currentUser!.teamId;
    const id = (request.params as { id: string }).id;
    if (!teamId) return reply.code(404).send({ error: 'Not found' });
    const set = await getFlashcardSet(id, teamId);
    if (!set) return reply.code(404).send({ error: 'Flashcard set not found' });
    return { set };
  });

  // Edit a set: rename and/or replace its cards (creator or a team admin).
  app.patch('/api/studies/flashcards/:id', guard, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    if (!me.teamId) return reply.code(404).send({ error: 'Not found' });
    const parsed = flashcardUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Nothing valid to update' });
    const set = await updateFlashcardSet(id, me.teamId, me.id, isAdmin(parseRoles(me)), {
      name: parsed.data.name,
      description: parsed.data.description,
      cards: parsed.data.cards?.map((c) => ({ term: c.term, def: c.def, topic: c.topic ?? null })),
    });
    if (!set) return reply.code(403).send({ error: 'You can only edit flashcard sets you created.' });
    return { set, sets: await listFlashcardSets(me.teamId) };
  });

  // Delete a set (creator or a team admin).
  app.delete('/api/studies/flashcards/:id', guard, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    if (!me.teamId) return reply.code(404).send({ error: 'Not found' });
    const ok = await deleteFlashcardSet(id, me.teamId, me.id, isAdmin(parseRoles(me)));
    if (!ok) return reply.code(403).send({ error: 'You can only delete flashcard sets you created.' });
    return { sets: await listFlashcardSets(me.teamId) };
  });

  // ---- Team study guides (slide presentations) ----
  // A team builds a study guide by conversing with Claude (which drafts the slide
  // text) and attaching its own screenshots, then presents it like a slideshow.

  // The list of the caller's team guides (metadata only — no slide blob).
  app.get('/api/studies/guides', guard, async (request, reply) => {
    const teamId = request.currentUser!.teamId;
    if (!teamId) return reply.send({ guides: [] });
    return { guides: await listGuides(teamId) };
  });

  // One turn of the guide-builder conversation. Returns the assistant's reply
  // plus the complete current slide draft. Persists nothing — the client saves
  // the finished guide with POST /guides once the author is happy.
  app.post('/api/studies/guides/chat', guard, async (request, reply) => {
    const teamId = request.currentUser!.teamId;
    if (!teamId) return reply.code(400).send({ error: 'You need to be on a team to build a study guide.' });
    const parsed = guideChatSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A conversation message is required' });
    if (!aiConfigured()) return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    try {
      await enforceAiLimit(request.currentUser!.id, 'studies_guide_chat');
      const result = await chatStudyGuide(parsed.data.messages);
      return { reply: result.reply, slides: result.slides };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Could not reach the guide builder' });
    }
  });

  // Save a finished guide (slides + any attached screenshots). The larger body
  // limit accommodates the embedded base64 screenshots.
  app.post('/api/studies/guides', { ...guard, bodyLimit: 25 * 1024 * 1024 }, async (request, reply) => {
    const teamId = request.currentUser!.teamId;
    if (!teamId) return reply.code(400).send({ error: 'You need to be on a team to build a study guide.' });
    const parsed = guideCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A name and at least one slide are required' });
    const guide = await createGuide({
      teamId,
      name: parsed.data.name,
      description: parsed.data.description,
      createdBy: request.currentUser!.id,
      slides: parsed.data.slides.map((s) => ({ title: s.title ?? '', body: s.body ?? '', image: s.image ?? null })),
    });
    if (guide.slideCount === 0) {
      // Every slide was empty (no text, no image); nothing worth keeping.
      await deleteGuide(guide.id, teamId, request.currentUser!.id, true);
      return reply.code(422).send({ error: 'A study guide needs at least one slide with text or a screenshot.' });
    }
    return { guide, guides: await listGuides(teamId) };
  });

  // One guide with its slides (team-scoped).
  app.get('/api/studies/guides/:id', guard, async (request, reply) => {
    const teamId = request.currentUser!.teamId;
    const id = (request.params as { id: string }).id;
    if (!teamId) return reply.code(404).send({ error: 'Not found' });
    const guide = await getGuide(id, teamId);
    if (!guide) return reply.code(404).send({ error: 'Study guide not found' });
    return { guide };
  });

  // Update a guide's name/description/slides (creator or a team admin).
  app.put('/api/studies/guides/:id', { ...guard, bodyLimit: 25 * 1024 * 1024 }, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    if (!me.teamId) return reply.code(404).send({ error: 'Not found' });
    const parsed = guideUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Nothing valid to update' });
    const guide = await updateGuide(id, me.teamId, me.id, isAdmin(parseRoles(me)), {
      name: parsed.data.name,
      description: parsed.data.description,
      slides: parsed.data.slides?.map((s) => ({ title: s.title ?? '', body: s.body ?? '', image: s.image ?? null })),
    });
    if (!guide) return reply.code(403).send({ error: 'You can only edit study guides you created.' });
    return { guide, guides: await listGuides(me.teamId) };
  });

  // Delete a guide (creator or a team admin).
  app.delete('/api/studies/guides/:id', guard, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    if (!me.teamId) return reply.code(404).send({ error: 'Not found' });
    const ok = await deleteGuide(id, me.teamId, me.id, isAdmin(parseRoles(me)));
    if (!ok) return reply.code(403).send({ error: 'You can only delete study guides you created.' });
    return { guides: await listGuides(me.teamId) };
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
    const [entries, teamName] = await Promise.all([getLeaderboard(me.id), getTeamName(me.teamId)]);
    return { entries, team: teamName ? { id: me.teamId!, name: teamName } : null };
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
      getTeamName(me.teamId),
    ]);
    return { entries, mine, team: teamName ? { id: me.teamId!, name: teamName } : null };
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
