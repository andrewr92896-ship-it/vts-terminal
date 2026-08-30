import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';

// The funded book: a record of what a prop firm is holding, typed in by hand.
// VTS never places a funded trade, so nothing here reaches the firm — what is
// tested is that the record stays honest about what it does and does not know.
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

async function signedIn(store: InstanceType<typeof MemoryPublicStore>) {
  const accountId = randomUUID();
  store.addAccount({
    id: accountId, email: `${accountId}@example.com`, passwordHash: 'x', displayName: 'Trader',
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

const day = 86_400_000;
const newBook = { label: 'FTP 200k', platform: 'Funded Trading Plus', startingBalance: 200_000 };
const makeBook = (store: any, token: string, body: Record<string, unknown> = {}) =>
  call(store, 'POST', '/public/v1/funded', token, { ...newBook, ...body });

test('a funded account is added, read back, and belongs to one account', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const other = await signedIn(store);

  const made = await makeBook(store, me.token);
  assert.equal(made.status, 201);
  const book = made.body.accounts[0];
  assert.equal(book.label, 'FTP 200k');
  assert.equal(book.balance, 200_000, 'nothing traded yet, so the balance is what was allocated');
  assert.equal(book.tradeCount, 0);
  assert.equal(book.realizedPl, 0);

  assert.deepEqual((await call(store, 'GET', '/public/v1/funded', other.token)).body.accounts, []);
  for (const attempt of [
    call(store, 'PATCH', `/public/v1/funded/${book.id}`, other.token, { label: 'Mine' }),
    call(store, 'DELETE', `/public/v1/funded/${book.id}`, other.token),
    call(store, 'POST', `/public/v1/funded/${book.id}/trades`, other.token, { instrument: 'EUR/USD' }),
  ]) assert.equal((await attempt).status, 404);
});

test('the balance is DERIVED from the trades, so the two cannot disagree', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const id = (await makeBook(store, me.token)).body.accounts[0].id;

  const now = Date.now();
  await call(store, 'POST', `/public/v1/funded/${id}/trades`, me.token,
    { instrument: 'EUR/USD', side: 'long', units: 100_000, entryPrice: 1.10, exitPrice: 1.11, realizedPl: 1_000, openedAt: now - 2 * day, closedAt: now - 2 * day });
  const after = await call(store, 'POST', `/public/v1/funded/${id}/trades`, me.token,
    { instrument: 'NAS100', side: 'short', units: 2, entryPrice: 19_400, exitPrice: 19_500, realizedPl: -200, openedAt: now - 40 * day, closedAt: now - 40 * day });

  const book = after.body.accounts[0];
  assert.equal(book.realizedPl, 800);
  assert.equal(book.balance, 200_800, 'allocated plus what the trades made');
  assert.equal(book.tradeCount, 2);
  // The windows are what was closed inside them, so a trade from six weeks ago
  // is in neither the 7-day nor the 30-day figure.
  assert.equal(book.pnl.weekly, 1_000);
  assert.equal(book.pnl.monthly, 1_000);
  assert.equal(book.pnl.daily, 0);
});

test('an OPEN funded position has no result, and does not move the balance', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const id = (await makeBook(store, me.token)).body.accounts[0].id;
  const after = await call(store, 'POST', `/public/v1/funded/${id}/trades`, me.token,
    { instrument: 'XAU/USD', side: 'long', units: 3, entryPrice: 4_598.2, openedAt: Date.now() });
  const trade = after.body.accounts[0].trades[0];
  assert.equal(trade.status, 'open');
  assert.equal(trade.realizedPl, null, 'a zero would score as a flat trade');
  assert.equal(trade.closedAt, null);
  assert.equal(after.body.accounts[0].balance, 200_000);
});

test('a stop the firm is holding is recorded, and no stop is NOT the same as none known of', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const id = (await makeBook(store, me.token)).body.accounts[0].id;

  const protectedTrade = await call(store, 'POST', `/public/v1/funded/${id}/trades`, me.token,
    { instrument: 'EUR/USD', side: 'long', entryPrice: 1.10, stopLoss: 1.09, takeProfit: 1.13, openedAt: Date.now() });
  const row = protectedTrade.body.accounts[0].trades[0];
  assert.equal(row.stopLoss, 1.09);
  assert.equal(row.takeProfit, 1.13);

  // A position with no protection on it is the most important thing a row here
  // can say, so it is null — an absence of data, not an assertion of no stop.
  const bare = await call(store, 'POST', `/public/v1/funded/${id}/trades`, me.token,
    { instrument: 'GBP/USD', side: 'long', entryPrice: 1.31, openedAt: Date.now() });
  assert.equal(bare.body.accounts[0].trades.find((t: any) => t.instrument === 'GBP/USD').stopLoss, null);
});

test('commission not stated is null, and is never read as zero', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  // Nothing can look a prop firm's commission schedule up, so a zero would make
  // trading the account look free.
  const unstated = await makeBook(store, me.token);
  assert.equal(unstated.body.accounts[0].commissionPerLot, null);
  const stated = await makeBook(store, me.token, { label: 'Second', commissionPerLot: 7 });
  assert.equal(stated.body.accounts.find((a: any) => a.label === 'Second').commissionPerLot, 7);
  // And a stated zero is a real answer, kept distinct from "not stated".
  const free = await makeBook(store, me.token, { label: 'Third', commissionPerLot: 0 });
  assert.equal(free.body.accounts.find((a: any) => a.label === 'Third').commissionPerLot, 0);
});

test('with no starting balance stated there is no balance to report', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const id = (await makeBook(store, me.token, { startingBalance: null })).body.accounts[0].id;
  await call(store, 'POST', `/public/v1/funded/${id}/trades`, me.token,
    { instrument: 'EUR/USD', side: 'long', entryPrice: 1.1, exitPrice: 1.11, realizedPl: 400, openedAt: Date.now() });
  const book = (await call(store, 'GET', '/public/v1/funded', me.token)).body.accounts[0];
  // A bare P/L presented as a balance would be a figure the account never held.
  assert.equal(book.balance, null);
  assert.equal(book.realizedPl, 400, 'what the trades made is still known');
});

test('a trade is removed by its own id and cannot reach another book', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const other = await signedIn(store);
  const mine = (await makeBook(store, me.token)).body.accounts[0].id;
  const theirs = (await makeBook(store, other.token, { label: 'Theirs' })).body.accounts[0].id;
  await call(store, 'POST', `/public/v1/funded/${mine}/trades`, me.token, { instrument: 'EUR/USD', entryPrice: 1.1, openedAt: Date.now() });
  const theirTrade = (await call(store, 'POST', `/public/v1/funded/${theirs}/trades`, other.token,
    { instrument: 'USD/JPY', entryPrice: 150, openedAt: Date.now() })).body.accounts[0].trades[0].id;

  // The private side had exactly this as a bug: deleting with the owner in the
  // WHERE clause matched nothing on somebody else's row and answered 200.
  assert.equal((await call(store, 'DELETE', `/public/v1/funded/trades/${theirTrade}`, me.token)).status, 404);
  assert.equal((await call(store, 'GET', '/public/v1/funded', other.token)).body.accounts[0].trades.length, 1);

  const own = (await call(store, 'GET', '/public/v1/funded', me.token)).body.accounts[0].trades[0].id;
  const gone = await call(store, 'DELETE', `/public/v1/funded/trades/${own}`, me.token);
  assert.deepEqual(gone.body.accounts[0].trades, []);
});

test('removing an account takes its trades with it', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const id = (await makeBook(store, me.token)).body.accounts[0].id;
  await call(store, 'POST', `/public/v1/funded/${id}/trades`, me.token, { instrument: 'EUR/USD', entryPrice: 1.1, openedAt: Date.now() });
  const gone = await call(store, 'DELETE', `/public/v1/funded/${id}`, me.token);
  assert.deepEqual(gone.body.accounts, []);
  assert.equal((await call(store, 'DELETE', `/public/v1/funded/${id}`, me.token)).status, 404);
});

test('an edit is a patch, and a book needs a name', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const id = (await makeBook(store, me.token, { commissionPerLot: 7, notes: 'phase 1' })).body.accounts[0].id;
  const edited = await call(store, 'PATCH', `/public/v1/funded/${id}`, me.token, { label: 'FTP 200k · phase 2' });
  const book = edited.body.accounts[0];
  assert.equal(book.label, 'FTP 200k · phase 2');
  assert.equal(book.commissionPerLot, 7);
  assert.equal(book.notes, 'phase 1');
  assert.equal(book.startingBalance, 200_000);

  assert.equal((await makeBook(store, me.token, { label: '   ' })).status, 400);
  assert.equal((await call(store, 'POST', `/public/v1/funded/${id}/trades`, me.token, { instrument: '  ' })).status, 400);
});

test('nothing in the funded book answers without a session', async () => {
  const store = new MemoryPublicStore();
  for (const [method, url] of [
    ['GET', '/public/v1/funded'],
    ['POST', '/public/v1/funded'],
    ['DELETE', `/public/v1/funded/${randomUUID()}`],
    ['DELETE', `/public/v1/funded/trades/${randomUUID()}`],
  ] as const) {
    assert.equal((await call(store, method, url, undefined, newBook)).status, 401, `${method} ${url}`);
  }
});
