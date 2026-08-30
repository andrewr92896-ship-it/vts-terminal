import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';

// Net worth is the number that is easiest to quietly get wrong, and the three
// ways it happens are what this file is mostly about: double counting, two
// sources of truth, and a confident total built on a gap.
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
const { NET_WORTH_CATEGORIES } = await import('../src/types.js');

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

test('what you own minus what you owe, with the portfolio counted once', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  // A tracked portfolio worth 1,500.
  const account = await call(store, 'POST', '/public/v1/investments/accounts', me.token, { label: 'Roth', kind: 'ira', cashBalance: 500 });
  await call(store, 'POST', '/public/v1/investments/holdings', me.token,
    { investmentAccountId: account.body.id, name: 'Index', assetClass: 'us_stock', quantity: 10, manualPrice: 100 });

  await call(store, 'POST', '/public/v1/net-worth/items', me.token, { kind: 'asset', category: 'cash', label: 'Checking', value: 8_400 });
  await call(store, 'POST', '/public/v1/net-worth/items', me.token, { kind: 'liability', category: 'credit_card', label: 'Card', value: 1_450 });

  const read = await call(store, 'GET', '/public/v1/net-worth', me.token);
  assert.equal(read.status, 200);
  // The portfolio comes in ONCE, from the tracked side.
  assert.equal(read.body.tracked.investments, 1_500);
  assert.equal(read.body.totals.manualAssets, 8_400);
  assert.equal(read.body.totals.assets, 9_900);
  assert.equal(read.body.totals.liabilities, 1_450);
  assert.equal(read.body.totals.netWorth, 8_450);
  // No broker connections exist on the public side at all.
  assert.equal(read.body.tracked.trading, 0);
  assert.equal(read.body.tradingEnabled ?? read.body.tracked.tradingEnabled, false);
});

test('there is no category that would let the portfolio be typed in twice', async () => {
  // Rule 1, enforced by the category list itself rather than by a warning.
  for (const forbidden of ['brokerage', 'investments', 'investment', 'portfolio', 'stocks', 'retirement']) {
    assert.equal((NET_WORTH_CATEGORIES as readonly string[]).includes(forbidden), false, `${forbidden} must not be a category`);
  }
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  for (const category of ['brokerage', 'investments', 'portfolio']) {
    assert.equal((await call(store, 'POST', '/public/v1/net-worth/items', me.token,
      { kind: 'asset', category, label: 'My portfolio', value: 100_000 })).status, 400, category);
  }
});

test('a debt cannot be filed as an asset', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  // The sign comes from `kind`, so a mortgage filed as an asset would be ADDED
  // to what you own and nothing downstream could notice.
  for (const category of ['mortgage', 'auto_loan', 'student_loan', 'credit_card', 'personal_loan', 'other_debt']) {
    assert.equal((await call(store, 'POST', '/public/v1/net-worth/items', me.token,
      { kind: 'asset', category, label: 'Debt', value: 10_000 })).status, 400, category);
  }
  for (const category of ['cash', 'real_estate', 'vehicle', 'crypto']) {
    assert.equal((await call(store, 'POST', '/public/v1/net-worth/items', me.token,
      { kind: 'liability', category, label: 'Asset', value: 10_000 })).status, 400, category);
  }
});

test('a value is stored positive however it arrives', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const created = await call(store, 'POST', '/public/v1/net-worth/items', me.token,
    { kind: 'liability', category: 'mortgage', label: 'House', value: -250_000 });
  // A write answers with the WHOLE net worth — the shape the portal's own screen
  // reads — plus the id of the row that was added, so the headline figure and the
  // row that changed it cannot be a request apart.
  assert.equal(created.body.liabilities[0].value, 250_000);
  assert.equal(created.body.totals.liabilities, 250_000);
  const read = await call(store, 'GET', '/public/v1/net-worth', me.token);
  // Subtracted once, not added because it was already negative.
  assert.equal(read.body.totals.liabilities, 250_000);
  assert.equal(read.body.totals.netWorth, -250_000);

  await call(store, 'PATCH', `/public/v1/net-worth/items/${created.body.id}`, me.token, { value: -100 });
  assert.equal((await call(store, 'GET', '/public/v1/net-worth', me.token)).body.totals.liabilities, 100);
});

test('an unpriced holding is not counted, and the shortfall is said out loud', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const account = await call(store, 'POST', '/public/v1/investments/accounts', me.token, { label: 'Roth', kind: 'ira', cashBalance: 0 });
  await call(store, 'POST', '/public/v1/investments/holdings', me.token,
    { investmentAccountId: account.body.id, name: 'Priced', assetClass: 'us_stock', quantity: 10, manualPrice: 100 });
  await call(store, 'POST', '/public/v1/investments/holdings', me.token,
    { investmentAccountId: account.body.id, name: 'Target Date 2055', assetClass: 'target_date', quantity: 40, manualPrice: null });

  const read = await call(store, 'GET', '/public/v1/net-worth', me.token);
  assert.equal(read.body.tracked.investments, 1_000);
  // Counted and named rather than folded in as zero or silently dropped.
  assert.match(read.body.tracked.note, /1 holding is not priced/);
  // And the figure is still reported — this is the Investments rule, not the
  // refusal rule, and the same screen on the private side behaves this way.
  assert.equal(read.body.totals.netWorth, 1_000);
});

test('an inactive item counts toward nothing', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const item = await call(store, 'POST', '/public/v1/net-worth/items', me.token,
    { kind: 'asset', category: 'vehicle', label: 'Car', value: 18_500 });
  assert.equal((await call(store, 'GET', '/public/v1/net-worth', me.token)).body.totals.assets, 18_500);
  await call(store, 'PATCH', `/public/v1/net-worth/items/${item.body.id}`, me.token, { active: false });
  const read = await call(store, 'GET', '/public/v1/net-worth', me.token);
  assert.equal(read.body.totals.assets, 0);
  assert.deepEqual(read.body.assets, []);
});

test('history is one reading per Eastern day and is never written for an empty sheet', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  // Nothing owned and nothing owed: no reading, or the curve starts with a
  // meaningless zero.
  await call(store, 'GET', '/public/v1/net-worth', me.token);
  assert.equal((await store.listNetWorthSnapshots(me.accountId)).length, 0);

  const item = await call(store, 'POST', '/public/v1/net-worth/items', me.token,
    { kind: 'asset', category: 'cash', label: 'Savings', value: 15_000 });
  await call(store, 'GET', '/public/v1/net-worth', me.token);
  await call(store, 'GET', '/public/v1/net-worth', me.token);
  assert.equal((await store.listNetWorthSnapshots(me.accountId)).length, 1);

  await call(store, 'PATCH', `/public/v1/net-worth/items/${item.body.id}`, me.token, { value: 16_000 });
  await call(store, 'GET', '/public/v1/net-worth', me.token);
  const history = await store.listNetWorthSnapshots(me.accountId);
  // Still one row for today — the last reading of the day stands.
  assert.equal(history.length, 1);
  assert.equal(history[0]!.netWorth, 16_000);
});

test('one account never reaches another account\'s sheet', async () => {
  const store = new MemoryPublicStore();
  const mine = await signedIn(store);
  const theirs = await signedIn(store);
  const item = await call(store, 'POST', '/public/v1/net-worth/items', mine.token,
    { kind: 'asset', category: 'real_estate', label: 'House', value: 400_000 });

  const theirRead = await call(store, 'GET', '/public/v1/net-worth', theirs.token);
  assert.equal(theirRead.body.totals.assets, 0);
  assert.deepEqual(theirRead.body.assets, []);

  assert.equal((await call(store, 'PATCH', `/public/v1/net-worth/items/${item.body.id}`, theirs.token, { value: 1 })).status, 404);
  assert.equal((await call(store, 'DELETE', `/public/v1/net-worth/items/${item.body.id}`, theirs.token)).status, 404);
  assert.equal((await call(store, 'GET', '/public/v1/net-worth', mine.token)).body.totals.assets, 400_000);
});

test('nothing is reachable without a session', async () => {
  const store = new MemoryPublicStore();
  for (const [method, url] of [
    ['GET', '/public/v1/net-worth'],
    ['POST', '/public/v1/net-worth/items'],
    ['PATCH', '/public/v1/net-worth/items/anything'],
    ['DELETE', '/public/v1/net-worth/items/anything'],
  ] as const) {
    assert.equal((await call(store, method, url, undefined, { kind: 'asset', category: 'cash', label: 'x', value: 1 })).status, 401, `${method} ${url}`);
  }
});

test('malformed input is refused rather than coerced', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  for (const body of [
    { kind: 'asset', category: 'cash', label: '', value: 1 },
    { kind: 'asset', category: 'cash', label: 'x'.repeat(81), value: 1 },
    { kind: 'savings', category: 'cash', label: 'Fine', value: 1 },
    { kind: 'asset', category: 'moon_rocks', label: 'Fine', value: 1 },
    { kind: 'asset', category: 'cash', label: 'Fine', value: 'lots' },
    { kind: 'asset', category: 'cash', label: 'Fine' },
  ]) {
    assert.equal((await call(store, 'POST', '/public/v1/net-worth/items', me.token, body)).status, 400, JSON.stringify(body));
  }
});

test('the payload uses the names the portal screen actually reads', async () => {
  // A near-miss here does not error — it renders an undefined figure — which is
  // exactly the kind of mismatch that reaches production intact. `daysRecorded`
  // shipped where `totalDays` was expected and nothing anywhere said so.
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const read = await call(store, 'GET', '/public/v1/net-worth', me.token);
  for (const field of ['tracked', 'assets', 'liabilities', 'totals', 'history', 'totalDays', 'asOf']) {
    assert.ok(field in read.body, `the screen reads ${field}`);
  }
  for (const field of ['assets', 'liabilities', 'netWorth', 'manualAssets']) {
    assert.ok(field in read.body.totals, `the screen reads totals.${field}`);
  }
  assert.equal(typeof read.body.asOf, 'number');
  assert.equal(read.body.totalDays, read.body.history.length);
});
