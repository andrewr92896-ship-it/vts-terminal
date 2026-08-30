import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';

// To Do is the second public record family with real storage. As with budget,
// most of what is asserted is the boundary and the rules that are easy to get
// quietly wrong — seeding twice, a daily check that must expire on its own, and
// an undo that puts the item back where it was rather than at the end.
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
const { acceptanceEntries } = await import('../src/legalDocuments.js');
const { STARTER_SECTIONS, etTodayMs } = await import('../src/todo.js');

async function signedIn(store: InstanceType<typeof MemoryPublicStore>) {
  const accountId = randomUUID();
  store.addAccount({
    id: accountId, email: `${accountId}@example.com`, passwordHash: 'x', displayName: 'Person',
    forcePasswordChange: false, privateGroupWarning: false, disabled: false,
  } as never);
  const id = randomUUID();
  await store.createSession(sha256(id), { accountId, expiresAt: Date.now() + 3_600_000, forcePasswordChange: false });
  // The clickwrap is accepted here rather than in the route, because the gate
  // is real: without this every request below would be refused with a 403.
  await store.recordLegalAcceptances(accountId, acceptanceEntries());
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

const sectionNamed = (body: any, title: string) => body.sections.find((s: any) => s.title === title);

test('a new account gets its starter categories, with nothing in them', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const read = await call(store, 'GET', '/public/v1/todo', me.token);
  assert.equal(read.status, 200);
  assert.equal(read.body.sections.length, STARTER_SECTIONS.length);
  assert.deepEqual(read.body.sections.map((s: any) => s.title), STARTER_SECTIONS.map((s) => s.title));
  for (const section of read.body.sections) {
    assert.equal(section.empty, true);
    assert.equal(section.count, 0);
    assert.deepEqual(section.items, []);
  }
});

test('reading twice does not seed the categories twice', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  await call(store, 'GET', '/public/v1/todo', me.token);
  await call(store, 'GET', '/public/v1/todo', me.token);
  const read = await call(store, 'GET', '/public/v1/todo', me.token);
  assert.equal(read.body.sections.length, STARTER_SECTIONS.length);
});

test('a task is added, counted, checked and stops counting', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const first = await call(store, 'GET', '/public/v1/todo', me.token);
  const priority = sectionNamed(first.body, 'Priority');

  const added = await call(store, 'POST', '/public/v1/todo/items', me.token, { sectionId: priority.id, text: '  Call the broker  ' });
  assert.equal(added.status, 201);
  const withItem = sectionNamed(added.body, 'Priority');
  assert.equal(withItem.items.length, 1);
  assert.equal(withItem.items[0].text, 'Call the broker');
  assert.equal(withItem.items[0].marker, 'check');
  assert.equal(withItem.items[0].checkable, true);
  // `count` is what is left to do, not how many lines exist.
  assert.equal(withItem.count, 1);
  assert.equal(withItem.empty, false);

  const toggled = await call(store, 'PATCH', `/public/v1/todo/items/${withItem.items[0].id}/toggle`, me.token);
  assert.equal(toggled.status, 200);
  // The PRIOR state comes back, so the client can offer an undo.
  assert.equal(toggled.body.previous.done, false);
  const done = sectionNamed(toggled.body, 'Priority');
  assert.equal(done.items[0].done, true);
  assert.equal(done.count, 0);
});

test('a daily check lasts only for today and expires without a write', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const first = await call(store, 'GET', '/public/v1/todo', me.token);
  const daily = sectionNamed(first.body, 'Daily Routine');
  const added = await call(store, 'POST', '/public/v1/todo/items', me.token, { sectionId: daily.id, text: 'Read the calendar' });
  const item = sectionNamed(added.body, 'Daily Routine').items[0];

  const checked = await call(store, 'PATCH', `/public/v1/todo/items/${item.id}/toggle`, me.token);
  assert.equal(sectionNamed(checked.body, 'Daily Routine').items[0].done, true);
  // A daily item shows no timer or overdue — the reset is implicit in the
  // section, and "due today" about something due every day says nothing.
  assert.equal(sectionNamed(checked.body, 'Daily Routine').items[0].timer, null);
  assert.equal(sectionNamed(checked.body, 'Daily Routine').items[0].overdue, false);

  // Wind the stored expiry back to yesterday: the check must clear itself on
  // read, with nothing written to make that happen.
  const stored = [...store.todoItems.values()].find((i) => i.id === item.id)!;
  store.todoItems.set(item.id, { ...stored, dueAt: etTodayMs() - 1 });
  const later = await call(store, 'GET', '/public/v1/todo', me.token);
  assert.equal(sectionNamed(later.body, 'Daily Routine').items[0].done, false);
  // And the row is untouched — it is the comparison that expired, not a write.
  assert.equal([...store.todoItems.values()].find((i) => i.id === item.id)!.done, true);
});

test('removing hands back what an undo needs, and restoring puts it back in place', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const first = await call(store, 'GET', '/public/v1/todo', me.token);
  const finance = sectionNamed(first.body, 'Finance');
  for (const text of ['One', 'Two', 'Three']) {
    await call(store, 'POST', '/public/v1/todo/items', me.token, { sectionId: finance.id, text });
  }
  const listed = sectionNamed((await call(store, 'GET', '/public/v1/todo', me.token)).body, 'Finance');
  const middle = listed.items[1];

  const removed = await call(store, 'DELETE', `/public/v1/todo/items/${middle.id}`, me.token);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.removed.id, middle.id);
  assert.equal(sectionNamed(removed.body, 'Finance').items.length, 2);

  const restored = await call(store, 'POST', '/public/v1/todo/items/restore', me.token, removed.body.removed);
  assert.equal(restored.status, 200);
  const back = sectionNamed(restored.body, 'Finance');
  assert.equal(back.items.length, 3);
  // Back in the MIDDLE, not appended — an undo returns the list to what it was.
  assert.deepEqual(back.items.map((i: any) => i.text), ['One', 'Two', 'Three']);

  // Pressing undo twice must not disturb the item it just put back.
  const again = await call(store, 'POST', '/public/v1/todo/items/restore', me.token, removed.body.removed);
  assert.equal(again.status, 404);
  assert.equal(sectionNamed((await call(store, 'GET', '/public/v1/todo', me.token)).body, 'Finance').items.length, 3);
});

test('one account never reaches another account\'s list', async () => {
  const store = new MemoryPublicStore();
  const mine = await signedIn(store);
  const theirs = await signedIn(store);
  const mySection = sectionNamed((await call(store, 'GET', '/public/v1/todo', mine.token)).body, 'Priority');
  const added = await call(store, 'POST', '/public/v1/todo/items', mine.token, { sectionId: mySection.id, text: 'Private task' });
  const item = sectionNamed(added.body, 'Priority').items[0];

  // Their list is their own, seeded empty.
  const theirRead = await call(store, 'GET', '/public/v1/todo', theirs.token);
  assert.equal(theirRead.body.sections.every((s: any) => s.items.length === 0), true);

  // Naming my ids explicitly reaches nothing.
  assert.equal((await call(store, 'POST', '/public/v1/todo/items', theirs.token, { sectionId: mySection.id, text: 'sneak' })).status, 404);
  assert.equal((await call(store, 'PATCH', `/public/v1/todo/items/${item.id}/toggle`, theirs.token)).status, 404);
  assert.equal((await call(store, 'DELETE', `/public/v1/todo/items/${item.id}`, theirs.token)).status, 404);
  assert.equal((await call(store, 'POST', '/public/v1/todo/items/restore', theirs.token,
    { id: randomUUID(), sectionId: mySection.id, text: 'sneak', position: 0 })).status, 404);

  const still = sectionNamed((await call(store, 'GET', '/public/v1/todo', mine.token)).body, 'Priority');
  assert.equal(still.items.length, 1);
  assert.equal(still.items[0].done, false);
});

test('nothing in the list is reachable without a session', async () => {
  const store = new MemoryPublicStore();
  for (const [method, url] of [
    ['GET', '/public/v1/todo'],
    ['POST', '/public/v1/todo/items'],
    ['PATCH', '/public/v1/todo/items/anything/toggle'],
    ['DELETE', '/public/v1/todo/items/anything'],
    ['POST', '/public/v1/todo/items/restore'],
  ] as const) {
    const result = await call(store, method, url, undefined, { sectionId: 'x', text: 'x' });
    assert.equal(result.status, 401, `${method} ${url} should require a session`);
  }
});

test('a task needs text, and a malformed restore is refused', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const section = sectionNamed((await call(store, 'GET', '/public/v1/todo', me.token)).body, 'Priority');
  for (const text of ['', '   ', 'x'.repeat(501)]) {
    assert.equal((await call(store, 'POST', '/public/v1/todo/items', me.token, { sectionId: section.id, text })).status, 400);
  }
  for (const body of [
    {},
    { id: 'x', sectionId: section.id },
    { id: 'x', sectionId: section.id, text: 'ok' },
    { id: 'x', sectionId: section.id, text: 'ok', position: -1 },
    { id: 'x', sectionId: section.id, text: 'ok', position: 1.5 },
    { id: 'x', sectionId: section.id, text: 'ok', position: 0, intervalDays: 0 },
    { id: 'x', sectionId: section.id, text: 'ok', position: 0, dueAt: 'soon' },
  ]) {
    assert.equal((await call(store, 'POST', '/public/v1/todo/items/restore', me.token, body)).status, 400, JSON.stringify(body));
  }
});
