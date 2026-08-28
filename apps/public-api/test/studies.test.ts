import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';

// Study games. What is tested here is mostly what a bad import does, because a
// deck that saves with a broken question does not error — it renders a question
// nobody can answer, halfway through a round, which reads as a broken game
// rather than a bad file.
const key = 'a'.repeat(48);
Object.assign(process.env, {
  PUBLIC_DATABASE_URL: 'postgres://public:public@127.0.0.1:5432/public_test',
  PUBLIC_SESSION_SIGNING_KEY: key,
  PUBLIC_CHALLENGE_PEPPER: key,
  PUBLIC_TRUSTED_DEVICE_SIGNING_KEY: key,
  PUBLIC_ALLOWED_ORIGINS: 'https://public.example.com',
  PUBLIC_COOKIE_SECURE: 'true',
  PUBLIC_MAIL_FROM: 'no-reply@example.com',
  PUBLIC_SMTP_URL: 'smtp://127.0.0.1:1025',
});

const { handleRequest, PUBLIC_SESSION_COOKIE } = await import('../src/server.js');
const { MemoryPublicStore } = await import('../src/memoryStore.js');
const { signToken, sha256 } = await import('../src/security.js');
const studies = await import('../src/studies.js');

async function signedIn(store: InstanceType<typeof MemoryPublicStore>) {
  const accountId = randomUUID();
  store.addAccount({
    id: accountId, email: `${accountId}@example.com`, passwordHash: 'x', displayName: 'Learner',
    forcePasswordChange: false, privateGroupWarning: false, disabled: false,
  } as never);
  const id = randomUUID();
  await store.createSession(sha256(id), { accountId, expiresAt: Date.now() + 3_600_000, forcePasswordChange: false });
  return { accountId, token: signToken(id, key) };
}

function call(store: InstanceType<typeof MemoryPublicStore>, method: string, url: string, token?: string, body?: unknown) {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as any;
  req.method = method; req.url = url;
  req.headers = {
    origin: 'https://public.example.com', 'x-vts-public-csrf': '1', 'x-forwarded-for': '203.0.113.7',
    ...(token ? { cookie: `${PUBLIC_SESSION_COOKIE}=${encodeURIComponent(token)}` } : {}),
  };
  req.socket = { remoteAddress: '203.0.113.7' };
  let status = 0; let payload = '';
  const res = { writeHead(c: number) { status = c; return res; }, end(chunk?: string) { payload = chunk ?? ''; } } as any;
  const market = { marketData: async () => ({}), marketNews: async () => ({}) };
  return handleRequest(req, res, { store, market } as any).then(() => ({ status, body: payload ? JSON.parse(payload) : {} }));
}

const question = (n: number, topic = 'Rules') => ({
  topic, stem: `Question ${n}?`,
  options: [
    { label: 'A', text: 'One' }, { label: 'B', text: 'Two' },
    { label: 'C', text: 'Three' }, { label: 'D', text: 'Four' },
  ],
  answer: 'A', explanation: `Because ${n}.`,
});

const makeDeck = (store: any, token: string, body: Record<string, unknown> = {}) =>
  call(store, 'POST', '/public/v1/studies/decks', token, {
    name: 'Series 65', questions: [question(1), question(2)], ...body,
  });

// ---- A deck is the account's own -------------------------------------------

test('a study game is created, read back, and belongs to one account', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const other = await signedIn(store);

  const created = await makeDeck(store, me.token);
  assert.equal(created.status, 201);
  assert.equal(created.body.deck.name, 'Series 65');
  assert.equal(created.body.deck.questionCount, 2);
  assert.equal(created.body.decks.length, 1);

  const id = created.body.deck.id;
  const read = await call(store, 'GET', `/public/v1/studies/decks/${id}`, me.token);
  assert.equal(read.body.deck.questions.length, 2);
  assert.deepEqual(read.body.deck.questions.map((q: any) => q.seq), [1, 2]);

  // Somebody else reaches none of it, and an id they name is 404 rather than a
  // refusal that would tell them the id is real.
  assert.deepEqual((await call(store, 'GET', '/public/v1/studies/decks', other.token)).body.decks, []);
  for (const attempt of [
    call(store, 'GET', `/public/v1/studies/decks/${id}`, other.token),
    call(store, 'PATCH', `/public/v1/studies/decks/${id}`, other.token, { name: 'Mine now' }),
    call(store, 'DELETE', `/public/v1/studies/decks/${id}`, other.token),
    call(store, 'GET', `/public/v1/studies/decks/${id}/game`, other.token),
    call(store, 'PUT', `/public/v1/studies/decks/${id}/game`, other.token, { state: '{"totalAttempted":1}' }),
  ]) assert.equal((await attempt).status, 404);
});

test('no study route answers without a session', async () => {
  const store = new MemoryPublicStore();
  for (const [method, url] of [
    ['GET', '/public/v1/studies/decks'],
    ['POST', '/public/v1/studies/decks'],
    ['GET', `/public/v1/studies/decks/${randomUUID()}`],
    ['PUT', `/public/v1/studies/decks/${randomUUID()}/game`],
  ] as const) {
    assert.equal((await call(store, method, url, undefined, { name: 'x' })).status, 401, `${method} ${url}`);
  }
});

// ---- What a bad question does ----------------------------------------------

test('a question missing an option is refused, and the refusal names it', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const broken = { ...question(1), options: question(1).options.slice(0, 3) };
  const result = await makeDeck(store, me.token, { questions: [question(1), broken] });
  assert.equal(result.status, 400);
  // "Invalid JSON" tells a person nothing they can act on; the position does.
  assert.match(result.body.message, /Question 2/);
  assert.match(result.body.message, /option D/);
  // And nothing was created by the attempt.
  assert.deepEqual((await call(store, 'GET', '/public/v1/studies/decks', me.token)).body.decks, []);
});

test('an answer key naming an option that is not there is refused', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  // This is the one that makes a question unanswerable rather than merely odd.
  for (const answer of ['E', '', 'a1', null]) {
    const result = await makeDeck(store, me.token, { questions: [{ ...question(1), answer }] });
    assert.equal(result.status, 400, JSON.stringify(answer));
  }
  // A lowercase key is the same key, not a different one.
  assert.equal((await makeDeck(store, me.token, { questions: [{ ...question(1), answer: 'c' }] })).status, 201);
});

test('a game needs a name and at least one question', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  assert.equal((await makeDeck(store, me.token, { name: '   ' })).status, 400);
  assert.equal((await makeDeck(store, me.token, { questions: [] })).status, 400);
  assert.equal((await makeDeck(store, me.token, { questions: 'lots' })).status, 400);
});

test('seq is assigned by the server, by position, never taken from the file', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  // A file whose questions all claim seq 1 would collide and silently lose
  // every question but one — and the saved draw is keyed on seq, so a learner
  // mid-round would start being asked the wrong questions.
  const created = await makeDeck(store, me.token, {
    questions: [{ ...question(1), seq: 1 }, { ...question(2), seq: 1 }, { ...question(3), seq: 99 }],
  });
  assert.deepEqual(created.body.deck.questions.map((q: any) => q.seq), [1, 2, 3]);
});

// ---- Categories and the exam blueprint --------------------------------------

test('categories come from the questions when none are given', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const created = await makeDeck(store, me.token, {
    questions: [question(1, 'Ethics'), question(2, 'Regulations'), question(3, 'Ethics')],
  });
  assert.deepEqual(created.body.deck.categories, ['Ethics', 'Regulations']);
  assert.equal(created.body.deck.categoryWeights, null, 'no weights is not the same as zero weights');
});

test('a weight for a category that is not there is dropped, not left counting', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const created = await makeDeck(store, me.token, {
    questions: [question(1, 'Ethics'), question(2, 'Regulations')],
    categoryWeights: { Ethics: 30, Regulations: 70, Gone: 50 },
  });
  // A weight nothing on screen can see would still count toward the denominator,
  // producing a score the learner cannot reconcile with the bars above it.
  assert.deepEqual(created.body.deck.categoryWeights, { Ethics: 30, Regulations: 70 });
});

test('weights are stored raw — a half-typed list still saves', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const created = await makeDeck(store, me.token, {
    questions: [question(1, 'Ethics'), question(2, 'Regulations')],
    categoryWeights: { Ethics: 40 },
  });
  // Refusing here would block a save halfway through typing a blueprint. They
  // are normalized when they are read instead.
  assert.deepEqual(created.body.deck.categoryWeights, { Ethics: 40 });
  const outOfRange = await makeDeck(store, me.token, {
    name: 'Bad', questions: [question(1, 'Ethics')], categoryWeights: { Ethics: 140 },
  });
  assert.equal(outOfRange.status, 400, 'but a weight outside 0-100 is not a typo, it is wrong');
});

test('replacing the questions cannot leave a category no question carries', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const created = await makeDeck(store, me.token, {
    questions: [question(1, 'Ethics'), question(2, 'Regulations')],
    categoryWeights: { Ethics: 50, Regulations: 50 },
  });
  const id = created.body.deck.id;
  const patched = await call(store, 'PATCH', `/public/v1/studies/decks/${id}`, me.token, {
    questions: [question(1, 'Ethics'), question(2, 'Ethics')],
  });
  assert.deepEqual(patched.body.deck.categories, ['Ethics']);
  assert.deepEqual(patched.body.deck.categoryWeights, { Ethics: 50 }, 'the gone category takes its weight with it');
});

test('renaming leaves the questions alone', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const created = await makeDeck(store, me.token);
  const id = created.body.deck.id;
  const renamed = await call(store, 'PATCH', `/public/v1/studies/decks/${id}`, me.token, { name: 'Series 66' });
  assert.equal(renamed.body.deck.name, 'Series 66');
  assert.equal(renamed.body.deck.questions.length, 2, 'a rename is a rename');
});

// ---- Progress ---------------------------------------------------------------

test('progress is stored whole and opaque, and is per learner per deck', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const created = await makeDeck(store, me.token);
  const id = created.body.deck.id;

  assert.equal((await call(store, 'GET', `/public/v1/studies/decks/${id}/game`, me.token)).body.state, null);

  // Whatever the client's engine writes comes back byte for byte. Interpreting
  // it here would be a second answer to what level somebody is on.
  const state = JSON.stringify({ totalAttempted: 12, totalCorrect: 9, levelCorrect: 14, bestStep: 2, recent: [true, false], cats: {} });
  assert.equal((await call(store, 'PUT', `/public/v1/studies/decks/${id}/game`, me.token, { state })).status, 200);
  assert.equal((await call(store, 'GET', `/public/v1/studies/decks/${id}/game`, me.token)).body.state, state);
});

test('a state that is not usable JSON is refused rather than stored', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const id = (await makeDeck(store, me.token)).body.deck.id;
  for (const state of ['', 'not json', '[]', '"a string"', 'null', 42, null, undefined, `"${'x'.repeat(200_001)}"`]) {
    const result = await call(store, 'PUT', `/public/v1/studies/decks/${id}/game`, me.token, { state });
    assert.equal(result.status, 400, JSON.stringify(state)?.slice(0, 40));
  }
  assert.equal((await call(store, 'GET', `/public/v1/studies/decks/${id}/game`, me.token)).body.state, null);
});

test('resetting banks the run, and an empty run is not banked', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const id = (await makeDeck(store, me.token)).body.deck.id;

  // Nothing answered is not a run, so it is not recorded as a row of zeroes.
  await call(store, 'POST', `/public/v1/studies/decks/${id}/game/archive`, me.token,
    { state: JSON.stringify({ totalAttempted: 0, totalCorrect: 0 }) });
  assert.equal(store.deckRuns.length, 0);

  // A real run is the only trace it happened once the live state is cleared.
  await call(store, 'POST', `/public/v1/studies/decks/${id}/game/archive`, me.token,
    { state: JSON.stringify({ totalAttempted: 40, totalCorrect: 31, levelCorrect: 44, bestStep: 1 }) });
  assert.equal(store.deckRuns.length, 1);
  assert.equal(store.deckRuns[0]!.attempted, 40);
  assert.equal(store.deckRuns[0]!.correct, 31);
  // The stored high-water mark is honoured, but never below what the level count
  // already implies — an older save carries no bestStep at all.
  assert.equal(store.deckRuns[0]!.bestStep, studies.stepForCorrect(44));
});

test('deleting a game takes its questions and its progress with it', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const id = (await makeDeck(store, me.token)).body.deck.id;
  await call(store, 'PUT', `/public/v1/studies/decks/${id}/game`, me.token, { state: '{"totalAttempted":3}' });

  const deleted = await call(store, 'DELETE', `/public/v1/studies/decks/${id}`, me.token);
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.body.decks, []);
  // There is nothing left for the progress to be progress THROUGH.
  assert.equal(await store.getStudyDeckGame(me.accountId, id), null);
  assert.equal((await call(store, 'DELETE', `/public/v1/studies/decks/${id}`, me.token)).status, 404);
});

// ---- Combining games --------------------------------------------------------

test('combining renumbers every question and refuses a source it cannot reach', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const other = await signedIn(store);
  const a = (await makeDeck(store, me.token, { name: 'Ethics', questions: [question(1, 'Ethics'), question(2, 'Ethics')] })).body.deck;
  const b = (await makeDeck(store, me.token, { name: 'Rules', questions: [question(3, 'Rules')] })).body.deck;
  const theirs = (await makeDeck(store, other.token, { name: 'Theirs' })).body.deck;

  const merged = await call(store, 'POST', '/public/v1/studies/decks/merge', me.token,
    { name: 'Everything', deckIds: [a.id, b.id], tagSource: true });
  assert.equal(merged.status, 201);
  // seq is identity within ONE deck, so carrying the originals across would
  // collide and silently drop questions.
  assert.deepEqual(merged.body.deck.questions.map((q: any) => q.seq), [1, 2, 3]);
  assert.deepEqual(merged.body.deck.questions.map((q: any) => q.sourceName), ['Ethics', 'Ethics', 'Rules']);
  assert.deepEqual(merged.body.deck.categories, ['Ethics', 'Rules']);

  // A game silently missing one of its sources is one nobody can tell is
  // incomplete, so an unreachable source refuses the whole thing.
  assert.equal((await call(store, 'POST', '/public/v1/studies/decks/merge', me.token,
    { name: 'Sneaky', deckIds: [a.id, theirs.id] })).status, 404);
  assert.equal((await call(store, 'POST', '/public/v1/studies/decks/merge', me.token,
    { name: 'Just one', deckIds: [a.id] })).status, 400);
});

test('a combined game is unweighted however its sources were scored', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const a = (await makeDeck(store, me.token, { name: 'A', questions: [question(1, 'Ethics')], categoryWeights: { Ethics: 100 } })).body.deck;
  const b = (await makeDeck(store, me.token, { name: 'B', questions: [question(2, 'Rules')], categoryWeights: { Rules: 100 } })).body.deck;
  const merged = await call(store, 'POST', '/public/v1/studies/decks/merge', me.token, { name: 'Both', deckIds: [a.id, b.id] });
  // Two exam blueprints do not add up to a third; a carried-over weight would
  // score the combined game against a paper that does not exist.
  assert.equal(merged.body.deck.categoryWeights, null);
});

// ---- What is absent ---------------------------------------------------------

test('nothing claims a leaderboard, and there is no board route', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const created = await makeDeck(store, me.token);
  // The client keys the board tab on this, so a false is what hides it cleanly
  // rather than opening an empty board that reads as broken.
  assert.equal(created.body.deck.hasLeaderboard, false);
  assert.equal((await call(store, 'GET', '/public/v1/studies/decks', me.token)).body.decks[0].hasLeaderboard, false);
  assert.equal((await call(store, 'GET', `/public/v1/studies/decks/${created.body.deck.id}/leaderboard`, me.token)).status, 404);
});

test('nothing is seeded, and nothing claims to be a built-in game', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  // An empty list is the ordinary state for a new account. Seeding invented
  // games would present something nobody created as something somebody did.
  assert.deepEqual((await call(store, 'GET', '/public/v1/studies/decks', me.token)).body.decks, []);
  const created = await makeDeck(store, me.token);
  assert.equal(created.body.deck.isSample, false);
});

test('source is server-owned: a client cannot claim its game was generated', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  // The AI paths are switched off on the public side, so a game claiming to
  // have been generated would be describing something that did not happen.
  const created = await makeDeck(store, me.token, { source: 'ai_topic', isSample: true });
  assert.equal(created.body.deck.source, 'upload');
  assert.equal(created.body.deck.isSample, false);
});

// ---- The level ladder mirror ------------------------------------------------

test('the level ladder matches the client engine: 10, then one more each rung', async () => {
  // 12 levels x 5 sub-levels, each costing one more correct answer than the
  // last. A drift here would bank a run at a level the learner never reached.
  assert.equal(studies.stepForCorrect(0), 0);
  assert.equal(studies.stepForCorrect(9), 0);
  assert.equal(studies.stepForCorrect(10), 1);
  assert.equal(studies.stepForCorrect(20), 1);
  assert.equal(studies.stepForCorrect(21), 2);
  assert.equal(studies.stepForCorrect(33), 3);
  // And it stops at the top of the ladder rather than running away.
  assert.equal(studies.stepForCorrect(10_000_000), 59);
});

test('a real-sized game state saves, rather than failing as "too large"', async () => {
  // The state blob keeps a rolling answer window per category, so a deck with
  // many categories genuinely runs to tens of kilobytes. The client saves
  // progress fire-and-forget — a body cap it silently exceeded would stop
  // recording somebody's progress with nothing on screen to say so.
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const id = (await makeDeck(store, me.token)).body.deck.id;
  const cats: Record<string, unknown> = {};
  for (let i = 0; i < 60; i += 1) {
    cats[`Category ${i}`] = { answered: 100, correct: 71, recent: Array.from({ length: 100 }, (_, n) => n % 3 !== 0) };
  }
  const state = JSON.stringify({
    totalAttempted: 6_000, totalCorrect: 4_260, levelCorrect: 6_600, bestStep: 40,
    recent: Array.from({ length: 100 }, () => true), cats,
  });
  assert.ok(state.length > 16_384, 'this is the case the 16 KB default would have refused');
  assert.ok(state.length < studies.MAX_STATE_BYTES, 'and it is well inside the state cap');
  assert.equal((await call(store, 'PUT', `/public/v1/studies/decks/${id}/game`, me.token, { state })).status, 200);
  assert.equal((await call(store, 'GET', `/public/v1/studies/decks/${id}/game`, me.token)).body.state, state);
});
