import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';

// The hand-kept trade log. Most of what is tested here is the difference
// between a figure that is ZERO and one that is UNKNOWN, because getting that
// wrong does not error — it quietly scores a trade nobody has scored.
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
const trades = await import('../src/trades.js');

async function signedIn(store: InstanceType<typeof MemoryPublicStore>) {
  const accountId = randomUUID();
  store.addAccount({
    id: accountId, email: `${accountId}@example.com`, passwordHash: 'x', displayName: 'Trader',
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

const day = 86_400_000;
const win = { instrument: 'EUR/USD', side: 'long', status: 'closed', entryPrice: 1.10, exitPrice: 1.11, units: 10_000, realizedPl: 100, openedAt: Date.now() - day, closedAt: Date.now() };
const loss = { ...win, exitPrice: 1.09, realizedPl: -100 };
const flat = { ...win, exitPrice: 1.10, realizedPl: 0 };

test('a trade is logged, read back, and belongs to one account', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const other = await signedIn(store);

  const logged = await call(store, 'POST', '/public/v1/trades', me.token, win);
  assert.equal(logged.status, 201);
  assert.equal(logged.body.trades.length, 1);
  const row = logged.body.trades[0];
  // Every row here was hand-typed: there are no broker fills, so it is editable
  // and there is nobody else it could belong to.
  assert.equal(row.editable, true);
  assert.equal(row.source, 'manual');
  assert.equal(row.broker, null);
  assert.equal(row.isMine, true);

  assert.deepEqual((await call(store, 'GET', '/public/v1/trades', other.token)).body.trades, []);
  for (const attempt of [
    call(store, 'PATCH', `/public/v1/trades/${row.id}`, other.token, { notes: 'mine' }),
    call(store, 'DELETE', `/public/v1/trades/${row.id}`, other.token),
    call(store, 'POST', `/public/v1/trades/${row.id}/restore`, other.token),
  ]) assert.equal((await attempt).status, 404);
});

// ---- Zero is not unknown ----------------------------------------------------

test('an OPEN trade has no result and no close time, whatever arrives with it', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const open = await call(store, 'POST', '/public/v1/trades', me.token,
    { instrument: 'GBP/USD', side: 'long', status: 'open', entryPrice: 1.31, units: 10_000, realizedPl: 500, closedAt: Date.now() });
  const row = open.body.trades[0];
  // A zero — or a number carried over from a form — would score in the win rate
  // and the totals as though the trade had finished.
  assert.equal(row.realizedPl, null);
  assert.equal(row.closedAt, null, 'a trade cannot have finished at a moment it is still running');
  // And no live price stands behind a hand-kept open trade, so what it is worth
  // right now is not something anybody here can know.
  assert.equal(row.unrealizedPl, null);
  assert.equal(open.body.summary.totalUnrealizedPl, null);
  assert.equal(open.body.summary.open, 1);
  assert.equal(open.body.summary.closed, 0);
});

test('nothing scored reports no total, never zero', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  await call(store, 'POST', '/public/v1/trades', me.token,
    { instrument: 'GBP/USD', side: 'long', status: 'open', entryPrice: 1.31, units: 10_000 });
  const { summary } = (await call(store, 'GET', '/public/v1/trades', me.token)).body;
  // A 0 here reads as "flat", which is a claim about a result. Nothing has been
  // recorded, which is a different thing.
  assert.equal(summary.totalRealizedPl, null);
  assert.equal(summary.winRate, 0);
  assert.equal(summary.wins + summary.losses + summary.breakeven, 0);
});

test('a flat trade is a break-even and is scored as neither', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  for (const trade of [win, loss, flat]) await call(store, 'POST', '/public/v1/trades', me.token, trade);
  const { summary } = (await call(store, 'GET', '/public/v1/trades', me.token)).body;
  assert.equal(summary.wins, 1);
  assert.equal(summary.losses, 1);
  assert.equal(summary.breakeven, 1);
  // The break-even is in neither half of the ratio, so three trades one of which
  // went nowhere is a 50% record and not 33%.
  assert.equal(summary.winRate, 0.5);
  assert.equal(summary.totalRealizedPl, 0);
});

test('slippage is null when no plan was stated, and signed by the side', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const none = await call(store, 'POST', '/public/v1/trades', me.token, win);
  assert.equal(none.body.trades[0].slippage, null, 'no plan stated is not the same as no slippage');
  assert.equal(none.body.summary.avgSlippage, null);

  // A long filled ABOVE its plan and a short filled BELOW it have both paid
  // something away, so both read as positive slippage.
  const long = await call(store, 'POST', '/public/v1/trades', me.token, { ...win, plannedEntry: 1.09 });
  assert.equal(long.body.trades.find((t: any) => t.plannedEntry === 1.09).slippage.toFixed(4), '0.0100');
  const short = await call(store, 'POST', '/public/v1/trades', me.token,
    { ...win, side: 'short', entryPrice: 1.09, exitPrice: 1.08, plannedEntry: 1.10 });
  assert.equal(short.body.trades.find((t: any) => t.side === 'short').slippage.toFixed(4), '0.0100');
});

// ---- What the payload promises the screen ----------------------------------

test('the break-even band is stated so the screen recomputes the same answer', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const { body } = await call(store, 'GET', '/public/v1/trades', me.token);
  // The screen recomputes the summary itself whenever a filter is on, using
  // exactly these fields. Sending a config the server did not score by is how
  // a filtered win rate comes to disagree with the unfiltered one.
  assert.equal(body.breakEvenMode, 'percent');
  assert.equal(body.breakEvenPct, 0);
  assert.equal(body.breakEvenAmount, 0);
  assert.deepEqual(body.breakEvenOverrides, []);
  // Nothing is excluded here — no connection cutoffs, no test-trade floor — and
  // the payload says so rather than omitting it.
  assert.deepEqual(body.excluded, { beforeCutoff: 0, belowFloor: 0, cutoffFrom: null });
  assert.equal(body.minTradeUnits, 0);
});

// ---- Deleting is soft -------------------------------------------------------

test('deleting moves a trade to the bin and hands back what was removed', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const id = (await call(store, 'POST', '/public/v1/trades', me.token, win)).body.trades[0].id;

  const removed = await call(store, 'DELETE', `/public/v1/trades/${id}`, me.token);
  assert.equal(removed.status, 200);
  assert.deepEqual(removed.body.trades, [], 'gone from the log');
  // The removed row goes back with the log so the screen can offer an undo that
  // puts back what was taken rather than something rebuilt from it.
  assert.equal(removed.body.removed.id, id);
  assert.equal(removed.body.removed.instrument, 'EUR/USD');

  const bin = await call(store, 'GET', '/public/v1/trades/deleted', me.token);
  assert.equal(bin.body.trades.length, 1);
  assert.equal(bin.body.trades[0].kind, 'manual');
  assert.ok(bin.body.trades[0].deletedAt > 0);

  const back = await call(store, 'POST', `/public/v1/trades/${id}/restore`, me.token);
  assert.deepEqual(back.body.trades, [], 'and out of the bin');
  assert.equal((await call(store, 'GET', '/public/v1/trades', me.token)).body.trades.length, 1);
});

test('a trade in the bin cannot be edited, and a delete cannot be repeated', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const id = (await call(store, 'POST', '/public/v1/trades', me.token, win)).body.trades[0].id;
  await call(store, 'DELETE', `/public/v1/trades/${id}`, me.token);
  // Rewriting a row in the bin would mean restoring something other than what
  // was removed.
  assert.equal((await call(store, 'PATCH', `/public/v1/trades/${id}`, me.token, { notes: 'edited' })).status, 409);
  assert.equal((await call(store, 'DELETE', `/public/v1/trades/${id}`, me.token)).status, 200);
  assert.equal((await call(store, 'GET', '/public/v1/trades/deleted', me.token)).body.trades.length, 1, 'still one row, not two');
});

// ---- Editing ----------------------------------------------------------------

test('an edit is a patch: what is not sent is left alone', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const id = (await call(store, 'POST', '/public/v1/trades', me.token, { ...win, strategy: 'Breakout', notes: 'clean' })).body.trades[0].id;
  const edited = await call(store, 'PATCH', `/public/v1/trades/${id}`, me.token, { notes: 'gave some back' });
  const row = edited.body.trades[0];
  assert.equal(row.notes, 'gave some back');
  assert.equal(row.strategy, 'Breakout');
  assert.equal(row.entryPrice, 1.10);
  assert.equal(row.realizedPl, 100);
});

test('closing an open trade by adding an exit stamps it closed', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const id = (await call(store, 'POST', '/public/v1/trades', me.token,
    { instrument: 'GBP/USD', side: 'long', status: 'open', entryPrice: 1.31, units: 10_000 })).body.trades[0].id;
  const closed = await call(store, 'PATCH', `/public/v1/trades/${id}`, me.token, { exitPrice: 1.32, realizedPl: 100 });
  const row = closed.body.trades[0];
  assert.equal(row.status, 'closed');
  assert.ok(row.closedAt > 0);
  assert.equal(row.realizedPl, 100);
  assert.equal(closed.body.summary.wins, 1);
});

// ---- Refusals ---------------------------------------------------------------

test('the shapes that cannot be scored are refused, with the reason', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const bad = [
    [{ ...win, instrument: '  ' }, /instrument/i],
    [{ ...win, entryPrice: 'about 1.10' }, /number/i],
    // A closed trade with nothing to score it by would sit in the closed count
    // contributing to no outcome at all.
    [{ instrument: 'EUR/USD', side: 'long', status: 'closed', entryPrice: 1.1, units: 1 }, /exit/i],
    [{ ...win, units: -5 }, /negative/i],
    [{ ...win, openedAt: Date.now(), closedAt: Date.now() - day }, /before it opened/i],
  ] as const;
  for (const [body, expected] of bad) {
    const result = await call(store, 'POST', '/public/v1/trades', me.token, body);
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.match(result.body.message, expected);
  }
  assert.deepEqual((await call(store, 'GET', '/public/v1/trades', me.token)).body.trades, []);
});

test('nothing in the log answers without a session', async () => {
  const store = new MemoryPublicStore();
  for (const [method, url] of [
    ['GET', '/public/v1/trades'],
    ['POST', '/public/v1/trades'],
    ['GET', '/public/v1/trades/deleted'],
    ['DELETE', `/public/v1/trades/${randomUUID()}`],
  ] as const) {
    assert.equal((await call(store, method, url, undefined, win)).status, 401, `${method} ${url}`);
  }
});

// ---- The scoring rule, directly ---------------------------------------------

test('a short is scored the other way round', async () => {
  assert.equal(trades.classifyOutcome({ side: 'short', entryPrice: 1.10, exitPrice: 1.09, realizedPl: 100 }), 'win');
  assert.equal(trades.classifyOutcome({ side: 'short', entryPrice: 1.10, exitPrice: 1.11, realizedPl: -100 }), 'loss');
  assert.equal(trades.classifyOutcome({ side: 'long', entryPrice: 1.10, exitPrice: 1.11, realizedPl: 100 }), 'win');
});

test('with no prices the money decides, and zero money is break-even', async () => {
  // This is the trade whose prices were not written down but whose result was.
  assert.equal(trades.classifyOutcome({ side: 'long', entryPrice: 0, exitPrice: null, realizedPl: 40 }), 'win');
  assert.equal(trades.classifyOutcome({ side: 'long', entryPrice: 0, exitPrice: null, realizedPl: -40 }), 'loss');
  assert.equal(trades.classifyOutcome({ side: 'long', entryPrice: 0, exitPrice: null, realizedPl: 0 }), 'breakeven');
  assert.equal(trades.classifyOutcome({ side: 'long', entryPrice: 0, exitPrice: null, realizedPl: null }), 'breakeven');
});
