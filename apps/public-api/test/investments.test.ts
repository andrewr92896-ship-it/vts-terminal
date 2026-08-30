import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';

// Investments is the third public record family with real storage, and the one
// with a rule worth more than the rest: AN UNPRICED HOLDING IS NOT WORTH ZERO.
// It is worth an unknown amount, it is excluded from every total, and the count
// of what could not be seen travels with the figures. Treating it as zero
// silently understates a portfolio, which is the most misleading thing a
// tracker can do — so most of what is asserted here is that.
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

const anAccount = (over = {}) => ({ label: 'Roth IRA', kind: 'ira', cashBalance: 500, ...over });
const aHolding = (investmentAccountId: string, over = {}) =>
  ({ investmentAccountId, name: 'Total Market Index', assetClass: 'us_stock', quantity: 10, manualPrice: 100, costBasis: 800, ...over });

test('a portfolio values what it can and says what it could not', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const account = await call(store, 'POST', '/public/v1/investments/accounts', me.token, anAccount());
  assert.equal(account.status, 201);
  // A manual account can never claim to be a verified provider connection.
  assert.equal(account.body.source, 'manual');

  await call(store, 'POST', '/public/v1/investments/holdings', me.token, aHolding(account.body.id));
  // A fund with a name, no ticker and no price — the shape most retirement
  // menus are full of, and the case the whole rule exists for.
  await call(store, 'POST', '/public/v1/investments/holdings', me.token,
    aHolding(account.body.id, { name: 'Target Date 2055', symbol: null, assetClass: 'target_date', quantity: 40, manualPrice: null, costBasis: 2_000 }));

  const portfolio = await call(store, 'GET', '/public/v1/investments/portfolio', me.token);
  assert.equal(portfolio.status, 200);
  // 10 x 100 priced, plus 500 cash. The unpriced 40 units contribute NOTHING —
  // and are counted, not absorbed.
  assert.equal(portfolio.body.totals.value, 1_500);
  assert.equal(portfolio.body.totals.unpricedCount, 1);
  assert.equal(portfolio.body.totals.manualCount, 1);
  assert.equal(portfolio.body.totals.livePricedCount, 0);
  // The unpriced holding is present and explicitly valueless-unknown, not 0.
  const unpriced = portfolio.body.holdings.find((h: any) => h.name === 'Target Date 2055');
  assert.equal(unpriced.value, null);
  assert.equal(unpriced.priceSource, 'none');
  assert.equal(unpriced.gain, null);
  // And its own account reports how many of its holdings could not be seen.
  assert.equal(portfolio.body.accounts[0].unpricedCount, 1);
  assert.equal(portfolio.body.accounts[0].holdingsCount, 2);
});

test('clearing a price makes a holding unpriced again rather than worth zero', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const account = await call(store, 'POST', '/public/v1/investments/accounts', me.token, anAccount({ cashBalance: 0 }));
  const holding = await call(store, 'POST', '/public/v1/investments/holdings', me.token, aHolding(account.body.id));
  assert.equal((await call(store, 'GET', '/public/v1/investments/portfolio', me.token)).body.totals.value, 1_000);

  await call(store, 'PATCH', `/public/v1/investments/holdings/${holding.body.id}`, me.token, { manualPrice: null });
  const after = await call(store, 'GET', '/public/v1/investments/portfolio', me.token);
  assert.equal(after.body.totals.unpricedCount, 1);
  assert.equal(after.body.holdings[0].value, null);
  assert.equal(after.body.totals.value, 0);

  // Pricing it at an actual zero is a different, stated thing.
  await call(store, 'PATCH', `/public/v1/investments/holdings/${holding.body.id}`, me.token, { manualPrice: 0 });
  const zeroed = await call(store, 'GET', '/public/v1/investments/portfolio', me.token);
  assert.equal(zeroed.body.totals.unpricedCount, 0);
  assert.equal(zeroed.body.holdings[0].value, 0);
});

test('no day move is claimed when there is no quote to compute one from', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const account = await call(store, 'POST', '/public/v1/investments/accounts', me.token, anAccount());
  await call(store, 'POST', '/public/v1/investments/holdings', me.token, aHolding(account.body.id));
  const portfolio = await call(store, 'GET', '/public/v1/investments/portfolio', me.token);
  assert.equal(portfolio.body.holdings[0].dayChange, null);
  assert.equal(portfolio.body.totals.dayChange, 0);
  // Coverage is zero, which is what tells the screen not to show a day figure.
  assert.equal(portfolio.body.totals.dayChangeCoverage, 0);
});

test('observations describe the portfolio and never advise', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const account = await call(store, 'POST', '/public/v1/investments/accounts', me.token, anAccount({ cashBalance: 0 }));
  await call(store, 'POST', '/public/v1/investments/holdings', me.token, aHolding(account.body.id, { quantity: 100 }));
  await call(store, 'POST', '/public/v1/investments/holdings', me.token, aHolding(account.body.id, { name: 'Small', quantity: 1, manualPrice: 5 }));
  const portfolio = await call(store, 'GET', '/public/v1/investments/portfolio', me.token);
  // `flags` lives INSIDE `allocation`, which is what the screens read. This
  // read `portfolio.body.flags` — a key that happened to exist and no screen
  // used — so it iterated the wrong array and would have passed just as
  // happily over nothing at all.
  const flags = portfolio.body.allocation.flags;
  // A book that is almost entirely one holding must actually RAISE one, or the
  // wording check below is asserting nothing.
  assert.ok(flags.length > 0, 'a portfolio concentrated in one holding raised no observation');
  for (const flag of flags) {
    assert.ok(flag.text.length > 0);
    // It states what is true and never what to do about it — the line between a
    // tracker and advice, and the reason there is no target allocation here.
    assert.doesNotMatch(flag.text, /should|consider|recommend|ought|trim|rebalance|buy|sell/i, flag.text);
  }
});

test('one account never reaches another account\'s portfolio', async () => {
  const store = new MemoryPublicStore();
  const mine = await signedIn(store);
  const theirs = await signedIn(store);
  const account = await call(store, 'POST', '/public/v1/investments/accounts', mine.token, anAccount());
  const holding = await call(store, 'POST', '/public/v1/investments/holdings', mine.token, aHolding(account.body.id));
  const goal = await call(store, 'POST', '/public/v1/investments/goals', mine.token, { label: 'Retire', targetAmount: 1_000_000, targetYear: 2055 });
  const txn = await call(store, 'POST', '/public/v1/investments/transactions', mine.token, { investmentAccountId: account.body.id, kind: 'contribution', amount: 500 });

  const theirPortfolio = await call(store, 'GET', '/public/v1/investments/portfolio', theirs.token);
  assert.deepEqual(theirPortfolio.body.accounts, []);
  assert.deepEqual(theirPortfolio.body.holdings, []);
  assert.equal(theirPortfolio.body.totals.value, 0);

  // Naming my ids explicitly reaches nothing, and filing under my account fails.
  assert.equal((await call(store, 'PATCH', `/public/v1/investments/accounts/${account.body.id}`, theirs.token, { label: 'Hijacked' })).status, 404);
  assert.equal((await call(store, 'DELETE', `/public/v1/investments/accounts/${account.body.id}`, theirs.token)).status, 404);
  assert.equal((await call(store, 'PATCH', `/public/v1/investments/holdings/${holding.body.id}`, theirs.token, { quantity: 0 })).status, 404);
  assert.equal((await call(store, 'DELETE', `/public/v1/investments/holdings/${holding.body.id}`, theirs.token)).status, 404);
  assert.equal((await call(store, 'DELETE', `/public/v1/investments/goals/${goal.body.id}`, theirs.token)).status, 404);
  assert.equal((await call(store, 'DELETE', `/public/v1/investments/transactions/${txn.body.id}`, theirs.token)).status, 404);
  assert.equal((await call(store, 'POST', '/public/v1/investments/holdings', theirs.token, aHolding(account.body.id))).status, 404);
  assert.equal((await call(store, 'POST', '/public/v1/investments/transactions', theirs.token, { investmentAccountId: account.body.id, kind: 'contribution', amount: 1 })).status, 404);

  const still = await call(store, 'GET', '/public/v1/investments/portfolio', mine.token);
  assert.equal(still.body.accounts.length, 1);
  assert.equal(still.body.accounts[0].label, 'Roth IRA');
  assert.equal(still.body.holdings.length, 1);
});

test('deleting an account takes its holdings with it', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const account = await call(store, 'POST', '/public/v1/investments/accounts', me.token, anAccount());
  await call(store, 'POST', '/public/v1/investments/holdings', me.token, aHolding(account.body.id));
  await call(store, 'POST', '/public/v1/investments/transactions', me.token, { investmentAccountId: account.body.id, kind: 'contribution', amount: 500 });
  assert.equal((await call(store, 'DELETE', `/public/v1/investments/accounts/${account.body.id}`, me.token)).status, 200);
  const after = await call(store, 'GET', '/public/v1/investments/portfolio', me.token);
  assert.deepEqual(after.body.accounts, []);
  assert.deepEqual(after.body.holdings, []);
});

test('nothing in a portfolio is reachable without a session', async () => {
  const store = new MemoryPublicStore();
  for (const [method, url] of [
    ['GET', '/public/v1/investments/portfolio'],
    ['POST', '/public/v1/investments/accounts'],
    ['POST', '/public/v1/investments/holdings'],
    ['POST', '/public/v1/investments/transactions'],
    ['POST', '/public/v1/investments/goals'],
    ['DELETE', '/public/v1/investments/holdings/anything'],
  ] as const) {
    assert.equal((await call(store, method, url, undefined, { label: 'x', name: 'x', assetClass: 'us_stock' })).status, 401, `${method} ${url}`);
  }
});

test('malformed input is refused rather than coerced', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const account = await call(store, 'POST', '/public/v1/investments/accounts', me.token, anAccount());
  for (const body of [
    { label: '', kind: 'ira' },
    { label: '   ' },
    { label: 'x'.repeat(81) },
    { label: 'Fine', cashBalance: 'lots' },
  ]) {
    assert.equal((await call(store, 'POST', '/public/v1/investments/accounts', me.token, body)).status, 400, JSON.stringify(body));
  }
  for (const body of [
    aHolding(account.body.id, { name: '' }),
    aHolding(account.body.id, { assetClass: 'magic_beans' }),
    aHolding(account.body.id, { quantity: 'ten' }),
    aHolding(account.body.id, { manualPrice: 'free' }),
    aHolding(account.body.id, { costBasis: 'unknown' }),
  ]) {
    assert.equal((await call(store, 'POST', '/public/v1/investments/holdings', me.token, body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await call(store, 'POST', '/public/v1/investments/transactions', me.token,
    { investmentAccountId: account.body.id, kind: 'contribution', amount: 'some' })).status, 400);
  assert.equal((await call(store, 'POST', '/public/v1/investments/transactions', me.token,
    { investmentAccountId: account.body.id, kind: 'contribution', amount: 1, taxYear: 12 })).status, 400);
});

test('a holding may have no ticker at all', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const account = await call(store, 'POST', '/public/v1/investments/accounts', me.token, anAccount());
  const holding = await call(store, 'POST', '/public/v1/investments/holdings', me.token,
    aHolding(account.body.id, { name: 'Collective Trust 2040', symbol: null }));
  assert.equal(holding.status, 201);
  assert.equal(holding.body.symbol, null);
});

test('the portfolio history is written forward, one reading per day', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const account = await call(store, 'POST', '/public/v1/investments/accounts', me.token, anAccount({ cashBalance: 1_000 }));
  await call(store, 'GET', '/public/v1/investments/portfolio', me.token);
  await call(store, 'GET', '/public/v1/investments/portfolio', me.token);
  // Read three times in a day, one row — the last reading of the day stands.
  assert.equal((await store.listInvestmentSnapshots(me.accountId)).length, 1);
  await call(store, 'PATCH', `/public/v1/investments/accounts/${account.body.id}`, me.token, { cashBalance: 2_000 });
  await call(store, 'GET', '/public/v1/investments/portfolio', me.token);
  const history = await store.listInvestmentSnapshots(me.accountId);
  assert.equal(history.length, 1);
  assert.equal(history[0]!.value, 2_000);
});
