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
  chatStudyGuide,
  classifyQuestionsIntoSection,
  defineSeries65Term,
  generateDeckQuestions,
  parseDeckFromText,
} from '../ai/claude.js';
import { AiLimitError, enforceAiLimit } from '../ai/usage.js';
import { getTeamName } from '../teams/service.js';
import { canUseSeries65 } from '../studies/access.js';
import { SERIES65_QUESTIONS } from '../studies/series65/bank.js';
import { SERIES65_EXPLANATIONS } from '../studies/series65/explanations.js';
import { SERIES65_VOCAB } from '../studies/series65/vocab.js';
import { createDeck, deleteDeck, getDeck, listDecks } from '../studies/deckStore.js';
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
const deckImportSchema = z.object({
  name: z.string().trim().min(1).max(120),
  text: z.string().min(1).max(100_000),
  instructions: z.string().trim().max(2000).optional(),
  count: z.number().int().min(1).max(50).optional(),
});

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

  // The Series 65 question bank + explanations + vocabulary. This is the
  // licensed content the owner keeps within their own team, so it is served
  // ONLY to Vitalis members (never the demo) and is the single place it leaves
  // the server — it is not bundled into the web app for anyone else.
  app.get('/api/studies/series65/bank', guard, async (request, reply) => {
    if (!canUseSeries65(request.currentUser)) {
      return reply.code(403).send({ error: 'The Series 65 study set is limited to your team.' });
    }
    return {
      questions: SERIES65_QUESTIONS,
      explanations: SERIES65_EXPLANATIONS,
      vocab: SERIES65_VOCAB,
    };
  });

  // ---- Team study games (decks) ----
  // A team builds and plays its own quizzes. Every deck is team-scoped: a member
  // creates it (AI-generated or from an uploaded file) and the whole team plays
  // it with the same mechanics as the Series 65 game.

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

  // Create a deck from an uploaded text file (their own questions or notes).
  app.post('/api/studies/decks/import', guard, async (request, reply) => {
    const teamId = request.currentUser!.teamId;
    if (!teamId) return reply.code(400).send({ error: 'You need to be on a team to build a study game.' });
    const parsed = deckImportSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A name and the file text are required' });
    if (!aiConfigured()) return reply.code(503).send({ error: 'AI is not configured (no API key set)' });
    try {
      await enforceAiLimit(request.currentUser!.id, 'studies_deck_import');
      const questions = await parseDeckFromText({
        text: parsed.data.text,
        instructions: parsed.data.instructions,
        count: parsed.data.count,
      });
      if (questions.length === 0) {
        return reply.code(422).send({ error: 'Claude could not build questions from that file. Make sure it contains questions or study material.' });
      }
      const deck = await createDeck({
        teamId,
        name: parsed.data.name,
        description: 'Imported from a file',
        createdBy: request.currentUser!.id,
        source: 'upload',
        questions,
      });
      return { deck, decks: await listDecks(teamId) };
    } catch (err) {
      if (err instanceof AiLimitError) return reply.code(429).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Could not build the study game' });
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

  // Delete a deck (creator or a team admin).
  app.delete('/api/studies/decks/:id', guard, async (request, reply) => {
    const me = request.currentUser!;
    const id = (request.params as { id: string }).id;
    if (!me.teamId) return reply.code(404).send({ error: 'Not found' });
    const ok = await deleteDeck(id, me.teamId, me.id, isAdmin(parseRoles(me)));
    if (!ok) return reply.code(403).send({ error: 'You can only delete study games you created.' });
    return { decks: await listDecks(me.teamId) };
  });

  // Per-user, per-deck game state (mirror of the Series 65 game endpoints).
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
  // The learner's own words. The definition and topic are generated by the study
  // tutor (Claude) when a word is added, then stored so the deck syncs across
  // devices alongside the built-in Series 65 cards.
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
      const { def, topic } = await defineSeries65Term(parsed.data.term);
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
