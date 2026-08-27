import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';

// Budget is the first public record family with real storage behind it, so what
// is asserted here is mostly the boundary rather than the arithmetic: an account
// reaches its own rows and nothing else, money stays whole cents, and the
// aggregator seam cannot be claimed by a hand-entered row.
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
// The cookie carries a SIGNED token; the stored key is the hash of the id inside
// it. Built with the real helpers so these tests go through the same session
// lookup production does rather than around it.
const { signToken, sha256 } = await import('../src/security.js');

const ET = 'America/New_York';
const etToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

// A signed-in account, built the way the auth service builds one, so the routes
// are exercised through the real session lookup rather than around it.
async function signedIn(store: InstanceType<typeof MemoryPublicStore>) {
  const accountId = randomUUID();
  store.addAccount({
    id: accountId, email: `${accountId}@example.com`, passwordHash: 'x', displayName: 'Person',
    forcePasswordChange: false, privateGroupWarning: false, disabled: false,
  } as never);
  const id = randomUUID();
  await store.createSession(sha256(id), { accountId, expiresAt: Date.now() + 3_600_000, forcePasswordChange: false });
  return { accountId, token: signToken(id, key) };
}

function request(method: string, url: string, token?: string, body?: unknown) {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as any;
  req.method = method;
  req.url = url;
  req.headers = {
    origin: 'https://public.example.com',
    'x-vts-public-csrf': '1',
    'x-forwarded-for': '203.0.113.7',
    ...(token ? { cookie: `${PUBLIC_SESSION_COOKIE}=${encodeURIComponent(token)}` } : {}),
  };
  req.socket = { remoteAddress: '203.0.113.7' };
  return req;
}

function call(store: InstanceType<typeof MemoryPublicStore>, method: string, url: string, token?: string, body?: unknown) {
  let status = 0; let payload = '';
  const res = {
    writeHead(code: number) { status = code; return res; },
    end(chunk?: string) { payload = chunk ?? ''; },
  } as any;
  const market = { marketData: async () => ({}), marketNews: async () => ({}) };
  return handleRequest(request(method, url, token, body), res, { store, market } as any)
    .then(() => ({ status, body: payload ? JSON.parse(payload) : {} }));
}

test('a budget is created and read back for the account that owns it', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);

  const category = await call(store, 'POST', '/public/v1/budget/categories', me.token, {
    name: 'Groceries', kind: 'expense', monthlyLimit: 60_000,
  });
  assert.equal(category.status, 201);
  assert.equal(category.body.monthlyLimit, 60_000);
  assert.equal(category.body.archived, false);

  const entry = await call(store, 'POST', '/public/v1/budget/entries', me.token, {
    categoryId: category.body.id, amountCents: 4_215, note: '  weekly shop  ',
  });
  assert.equal(entry.status, 201);
  assert.equal(entry.body.amountCents, 4_215);
  assert.equal(entry.body.note, 'weekly shop');
  // Undated entries land on today's EASTERN day, not the server's local one.
  assert.equal(entry.body.occurredOn, etToday());
  // The aggregator seam is server-owned: a hand-entered row is 'manual'.
  assert.equal(entry.body.source, 'manual');

  const read = await call(store, 'GET', '/public/v1/budget', me.token);
  assert.equal(read.status, 200);
  assert.equal(read.body.month, etToday().slice(0, 7));
  assert.equal(read.body.categories.length, 1);
  assert.equal(read.body.entries.length, 1);
});

test('one account never reaches another account\'s budget', async () => {
  const store = new MemoryPublicStore();
  const mine = await signedIn(store);
  const theirs = await signedIn(store);

  const category = await call(store, 'POST', '/public/v1/budget/categories', mine.token, { name: 'Rent', kind: 'expense', monthlyLimit: null });
  const entry = await call(store, 'POST', '/public/v1/budget/entries', mine.token, { categoryId: category.body.id, amountCents: 165_000 });

  // Reading returns their own empty budget rather than anything of mine.
  const read = await call(store, 'GET', '/public/v1/budget', theirs.token);
  assert.equal(read.status, 200);
  assert.deepEqual(read.body.categories, []);
  assert.deepEqual(read.body.entries, []);

  // Naming my ids explicitly reaches nothing — refused, and nothing is changed.
  assert.equal((await call(store, 'DELETE', `/public/v1/budget/categories/${category.body.id}`, theirs.token)).status, 404);
  assert.equal((await call(store, 'DELETE', `/public/v1/budget/entries/${entry.body.id}`, theirs.token)).status, 404);
  assert.equal((await call(store, 'PATCH', `/public/v1/budget/categories/${category.body.id}`, theirs.token, { archived: true })).status, 404);
  // Filing an entry against my category is refused rather than silently filed.
  assert.equal((await call(store, 'POST', '/public/v1/budget/entries', theirs.token, { categoryId: category.body.id, amountCents: 100 })).status, 404);

  const still = await call(store, 'GET', '/public/v1/budget', mine.token);
  assert.equal(still.body.categories.length, 1);
  assert.equal(still.body.entries.length, 1);
});

test('nothing in a budget is reachable without a session', async () => {
  const store = new MemoryPublicStore();
  for (const [method, url] of [
    ['GET', '/public/v1/budget'],
    ['POST', '/public/v1/budget/categories'],
    ['POST', '/public/v1/budget/entries'],
    ['DELETE', '/public/v1/budget/entries/anything'],
  ] as const) {
    const result = await call(store, method, url, undefined, { name: 'x', kind: 'expense', amountCents: 1 });
    assert.equal(result.status, 401, `${method} ${url} should require a session`);
  }
});

test('money is whole positive cents, and a float is refused', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const category = await call(store, 'POST', '/public/v1/budget/categories', me.token, { name: 'Coffee', kind: 'expense', monthlyLimit: null });
  for (const amountCents of [0, -100, 4.5, Number.NaN, '500', null, undefined, 2_147_483_648]) {
    const result = await call(store, 'POST', '/public/v1/budget/entries', me.token, { categoryId: category.body.id, amountCents });
    assert.equal(result.status, 400, `expected 400 for ${JSON.stringify(amountCents)}`);
  }
});

test('a monthly target of null is "no target" and is not zero', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const none = await call(store, 'POST', '/public/v1/budget/categories', me.token, { name: 'Fun', kind: 'expense', monthlyLimit: null });
  assert.equal(none.body.monthlyLimit, null);
  const zero = await call(store, 'POST', '/public/v1/budget/categories', me.token, { name: 'Other', kind: 'expense', monthlyLimit: 0 });
  assert.equal(zero.body.monthlyLimit, 0);
});

test('a month is Eastern and malformed months are refused', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  for (const month of ['2026-13', '2026-00', '26-08', '2026-8', 'august', '2026-08-01']) {
    const result = await call(store, 'GET', `/public/v1/budget?month=${encodeURIComponent(month)}`, me.token);
    assert.equal(result.status, 400, `expected 400 for ${month}`);
  }
  assert.equal((await call(store, 'GET', '/public/v1/budget?month=2026-08', me.token)).status, 200);
});

test('a date that does not exist is refused rather than rolled over', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const category = await call(store, 'POST', '/public/v1/budget/categories', me.token, { name: 'Travel', kind: 'expense', monthlyLimit: null });
  // 2026 is not a leap year, so Feb 31 and Feb 29 both name no real day. A Date
  // would happily roll them into March; the day check catches that.
  for (const occurredOn of ['2026-02-31', '2026-02-29', '2026-13-01', 'yesterday']) {
    const result = await call(store, 'POST', '/public/v1/budget/entries', me.token, { categoryId: category.body.id, amountCents: 100, occurredOn });
    assert.equal(result.status, 400, `expected 400 for ${occurredOn}`);
  }
});

test('entries are read by the month they fall in', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const category = await call(store, 'POST', '/public/v1/budget/categories', me.token, { name: 'Bills', kind: 'expense', monthlyLimit: null });
  for (const occurredOn of ['2026-06-15', '2026-07-01', '2026-07-31']) {
    await call(store, 'POST', '/public/v1/budget/entries', me.token, { categoryId: category.body.id, amountCents: 1_000, occurredOn });
  }
  assert.equal((await call(store, 'GET', '/public/v1/budget?month=2026-07', me.token)).body.entries.length, 2);
  assert.equal((await call(store, 'GET', '/public/v1/budget?month=2026-06', me.token)).body.entries.length, 1);
  assert.equal((await call(store, 'GET', '/public/v1/budget?month=2026-05', me.token)).body.entries.length, 0);
});

test('archiving keeps the history; deleting removes it', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const category = await call(store, 'POST', '/public/v1/budget/categories', me.token, { name: 'Gym', kind: 'expense', monthlyLimit: null });
  await call(store, 'POST', '/public/v1/budget/entries', me.token, { categoryId: category.body.id, amountCents: 5_000 });

  assert.equal((await call(store, 'PATCH', `/public/v1/budget/categories/${category.body.id}`, me.token, { archived: true })).status, 200);
  const archived = await call(store, 'GET', '/public/v1/budget', me.token);
  // Still listed, and its entry still counts — dropping it would silently change
  // a past month's total, which is the one thing a spending record must not do.
  assert.equal(archived.body.categories[0].archived, true);
  assert.equal(archived.body.entries.length, 1);

  assert.equal((await call(store, 'DELETE', `/public/v1/budget/categories/${category.body.id}`, me.token)).status, 200);
  const deleted = await call(store, 'GET', '/public/v1/budget', me.token);
  assert.deepEqual(deleted.body.categories, []);
  assert.deepEqual(deleted.body.entries, []);
});

test('a category name is unique per account and kind, but not across accounts', async () => {
  const store = new MemoryPublicStore();
  const mine = await signedIn(store);
  const theirs = await signedIn(store);
  assert.equal((await call(store, 'POST', '/public/v1/budget/categories', mine.token, { name: 'Rent', kind: 'expense', monthlyLimit: null })).status, 201);
  // Same name, same kind, same account — refused.
  assert.equal((await call(store, 'POST', '/public/v1/budget/categories', mine.token, { name: ' rent ', kind: 'expense', monthlyLimit: null })).status, 409);
  // Same name under the other kind is a different thing and is allowed.
  assert.equal((await call(store, 'POST', '/public/v1/budget/categories', mine.token, { name: 'Rent', kind: 'income', monthlyLimit: null })).status, 201);
  // Somebody else's budget is unaffected by what is in mine.
  assert.equal((await call(store, 'POST', '/public/v1/budget/categories', theirs.token, { name: 'Rent', kind: 'expense', monthlyLimit: null })).status, 201);
});

test('a category needs a name and a real kind', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  for (const body of [
    { name: '', kind: 'expense' },
    { name: '   ', kind: 'expense' },
    { name: 'x'.repeat(61), kind: 'expense' },
    { name: 'Valid', kind: 'savings' },
    { name: 'Valid', kind: '' },
  ]) {
    assert.equal((await call(store, 'POST', '/public/v1/budget/categories', me.token, { ...body, monthlyLimit: null })).status, 400, JSON.stringify(body));
  }
});
