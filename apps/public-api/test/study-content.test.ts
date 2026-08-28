import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';

// Flashcard sets and study presentations. The slide-identity rules are most of
// what is here, because getting them wrong is silent: a save that drops the ids
// looks exactly like a save that kept them, until somebody notices their deck is
// a deck of brand new slides.
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

// ---- Flashcard sets ---------------------------------------------------------

const cards = [
  { term: 'Bid', def: 'What a buyer will pay', topic: 'Terms' },
  { term: 'Ask', def: 'What a seller will take', topic: 'Terms' },
  { term: 'Spread', def: 'The gap between them', topic: 'Pricing' },
];

test('a flashcard set is created, read back, and belongs to one account', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const other = await signedIn(store);

  const created = await call(store, 'POST', '/public/v1/studies/flashcards', me.token, { name: 'Basics', cards });
  assert.equal(created.status, 201);
  assert.equal(created.body.set.cardCount, 3);
  assert.deepEqual(created.body.set.cards.map((c: any) => c.seq), [1, 2, 3]);
  // The topics a set covers are DERIVED from its cards, never stored beside
  // them — stored, the two could disagree about what is in the set.
  assert.deepEqual(created.body.set.topics, ['Terms', 'Pricing']);

  const id = created.body.set.id;
  assert.deepEqual((await call(store, 'GET', '/public/v1/studies/flashcards', other.token)).body.sets, []);
  for (const attempt of [
    call(store, 'GET', `/public/v1/studies/flashcards/${id}`, other.token),
    call(store, 'PATCH', `/public/v1/studies/flashcards/${id}`, other.token, { name: 'Mine' }),
    call(store, 'DELETE', `/public/v1/studies/flashcards/${id}`, other.token),
  ]) assert.equal((await attempt).status, 404);
});

test('a card needs both sides, and the refusal names the card', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  // A card with no back renders as one that cannot be turned over, which reads
  // as a broken set rather than a bad import.
  const missingBack = await call(store, 'POST', '/public/v1/studies/flashcards', me.token,
    { name: 'Broken', cards: [cards[0], { term: 'Spread', def: '   ' }] });
  assert.equal(missingBack.status, 400);
  assert.match(missingBack.body.message, /Card 2/);

  assert.equal((await call(store, 'POST', '/public/v1/studies/flashcards', me.token,
    { name: 'Broken', cards: [{ term: '', def: 'Something' }] })).status, 400);
  assert.equal((await call(store, 'POST', '/public/v1/studies/flashcards', me.token, { name: 'Empty', cards: [] })).status, 400);
  assert.equal((await call(store, 'POST', '/public/v1/studies/flashcards', me.token, { name: '  ', cards })).status, 400);
  assert.deepEqual((await call(store, 'GET', '/public/v1/studies/flashcards', me.token)).body.sets, []);
});

test('replacing the cards renumbers them and re-derives the topics', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const id = (await call(store, 'POST', '/public/v1/studies/flashcards', me.token, { name: 'Basics', cards })).body.set.id;
  const patched = await call(store, 'PATCH', `/public/v1/studies/flashcards/${id}`, me.token, {
    cards: [{ term: 'Slippage', def: 'The gap between plan and fill', topic: 'Execution' }],
  });
  assert.deepEqual(patched.body.set.cards.map((c: any) => c.seq), [1]);
  assert.deepEqual(patched.body.set.topics, ['Execution'], 'a topic no card carries does not survive');
  assert.equal(patched.body.set.cardCount, 1);

  const renamed = await call(store, 'PATCH', `/public/v1/studies/flashcards/${id}`, me.token, { name: 'Execution' });
  assert.equal(renamed.body.set.name, 'Execution');
  assert.equal(renamed.body.set.cards.length, 1, 'a rename is a rename');
});

test('source is server-owned on a set too', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const created = await call(store, 'POST', '/public/v1/studies/flashcards', me.token,
    { name: 'Basics', cards, source: 'ai_topic' });
  // The AI paths are switched off here, so a set claiming to have been generated
  // would describe something that did not happen.
  assert.equal(created.body.set.source, 'manual');
});

// ---- Presentations, and above all the slide ids -----------------------------

const slides = [
  { title: 'What a spread is', body: 'The gap between the bid and the ask.' },
  { title: 'Why it matters', body: 'You pay it on the way in and the way out.' },
];

test('a presentation is created and every slide is given an id', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const created = await call(store, 'POST', '/public/v1/studies/guides', me.token, { name: 'Spreads', slides });
  assert.equal(created.status, 201);
  assert.equal(created.body.guide.slideCount, 2);
  const ids = created.body.guide.slides.map((s: any) => s.id);
  assert.ok(ids.every((id: unknown) => typeof id === 'string' && id.length > 0), 'each slide has an id');
  assert.equal(new Set(ids).size, 2, 'and they are distinct');
});

test('READING a presentation never mints an id', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const id = (await call(store, 'POST', '/public/v1/studies/guides', me.token, { name: 'Spreads', slides })).body.guide.id;

  // A read that invented identity would hand out a different id every time it
  // ran, and nothing pointing at a slide could rely on it.
  const first = await call(store, 'GET', `/public/v1/studies/guides/${id}`, me.token);
  const second = await call(store, 'GET', `/public/v1/studies/guides/${id}`, me.token);
  assert.deepEqual(first.body.guide.slides.map((s: any) => s.id), second.body.guide.slides.map((s: any) => s.id));

  // A legacy slide with no id reads back with none, and goes on working.
  assert.deepEqual(studies.slidesForRead([{ title: 'Old', body: 'No id' }]).map((s) => s.id), [null]);
});

test('an id sent back is KEPT, and reordering does not change which slide is which', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const created = await call(store, 'POST', '/public/v1/studies/guides', me.token, { name: 'Spreads', slides });
  const id = created.body.guide.id;
  const [first, second] = created.body.guide.slides;

  // An editor that did not send the ids back would make every save look like a
  // deck of brand new slides — which is silent, and only shows up later as a
  // lesson describing slides that no longer exist.
  const reordered = await call(store, 'PUT', `/public/v1/studies/guides/${id}`, me.token, {
    slides: [second, { ...first, title: 'What a spread is, exactly' }],
  });
  assert.deepEqual(reordered.body.guide.slides.map((s: any) => s.id), [second.id, first.id]);
  assert.equal(reordered.body.guide.slides[1].title, 'What a spread is, exactly');

  // A slide ADDED in the editor arrives without one and gets one now.
  const grown = await call(store, 'PUT', `/public/v1/studies/guides/${id}`, me.token, {
    slides: [...reordered.body.guide.slides, { title: 'One more', body: 'Added just now' }],
  });
  const ids = grown.body.guide.slides.map((s: any) => s.id);
  assert.equal(ids[0], second.id);
  assert.equal(ids[1], first.id);
  assert.ok(typeof ids[2] === 'string' && ![first.id, second.id].includes(ids[2]));
});

test('a slide with nothing on it is dropped; an oversized image is REFUSED', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  // Nothing on it is nothing at all, and presenting it is a blank screen whose
  // cause the author cannot see.
  const created = await call(store, 'POST', '/public/v1/studies/guides', me.token, {
    name: 'Spreads', slides: [slides[0], { title: '  ', body: '' }, slides[1]],
  });
  assert.equal(created.body.guide.slides.length, 2);

  // An oversized screenshot is a different case: dropping it saves a
  // presentation with a slide the author believes has a picture on it, and they
  // find out when they present.
  const tooBig = await call(store, 'POST', '/public/v1/studies/guides', me.token, {
    name: 'Big', slides: [slides[0], { title: 'Chart', body: '', image: `data:image/png;base64,${'A'.repeat(studies.MAX_SLIDE_IMAGE)}` }],
  });
  assert.equal(tooBig.status, 400);
  assert.match(tooBig.body.message, /slide 2/i);

  // A picture within the limit is kept, and a slide can be nothing BUT a picture.
  const image = `data:image/png;base64,${'A'.repeat(64)}`;
  const ok = await call(store, 'POST', '/public/v1/studies/guides', me.token, {
    name: 'Chart', slides: [{ title: '', body: '', image }],
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.guide.slides[0].image, image);
});

test('something that is not an image is not stored as one', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  for (const image of ['https://example.com/x.png', 'data:text/html;base64,PHNjcmlwdD4=', 'javascript:alert(1)', 42]) {
    const created = await call(store, 'POST', '/public/v1/studies/guides', me.token, {
      name: 'Try', slides: [{ title: 'Slide', body: 'Text', image }],
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.guide.slides[0].image, null, JSON.stringify(image));
  }
});

test('a presentation belongs to one account, and needs a name and a slide', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const other = await signedIn(store);
  const id = (await call(store, 'POST', '/public/v1/studies/guides', me.token, { name: 'Spreads', slides })).body.guide.id;

  assert.deepEqual((await call(store, 'GET', '/public/v1/studies/guides', other.token)).body.guides, []);
  for (const attempt of [
    call(store, 'GET', `/public/v1/studies/guides/${id}`, other.token),
    call(store, 'PUT', `/public/v1/studies/guides/${id}`, other.token, { name: 'Mine' }),
    call(store, 'DELETE', `/public/v1/studies/guides/${id}`, other.token),
  ]) assert.equal((await attempt).status, 404);

  assert.equal((await call(store, 'POST', '/public/v1/studies/guides', me.token, { name: '  ', slides })).status, 400);
  assert.equal((await call(store, 'POST', '/public/v1/studies/guides', me.token, { name: 'Empty', slides: [] })).status, 400);
  assert.equal((await call(store, 'POST', '/public/v1/studies/guides', me.token,
    { name: 'Blank', slides: [{ title: '', body: '' }] })).status, 400);
});

test('deleting removes it from the list and cannot be repeated', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const set = (await call(store, 'POST', '/public/v1/studies/flashcards', me.token, { name: 'Basics', cards })).body.set.id;
  const guide = (await call(store, 'POST', '/public/v1/studies/guides', me.token, { name: 'Spreads', slides })).body.guide.id;

  assert.deepEqual((await call(store, 'DELETE', `/public/v1/studies/flashcards/${set}`, me.token)).body.sets, []);
  assert.deepEqual((await call(store, 'DELETE', `/public/v1/studies/guides/${guide}`, me.token)).body.guides, []);
  assert.equal((await call(store, 'DELETE', `/public/v1/studies/flashcards/${set}`, me.token)).status, 404);
  assert.equal((await call(store, 'DELETE', `/public/v1/studies/guides/${guide}`, me.token)).status, 404);
});

test('neither family answers without a session', async () => {
  const store = new MemoryPublicStore();
  for (const [method, url] of [
    ['GET', '/public/v1/studies/flashcards'],
    ['POST', '/public/v1/studies/flashcards'],
    ['GET', `/public/v1/studies/flashcards/${randomUUID()}`],
    ['GET', '/public/v1/studies/guides'],
    ['POST', '/public/v1/studies/guides'],
    ['PUT', `/public/v1/studies/guides/${randomUUID()}`],
  ] as const) {
    assert.equal((await call(store, method, url, undefined, { name: 'x' })).status, 401, `${method} ${url}`);
  }
});
