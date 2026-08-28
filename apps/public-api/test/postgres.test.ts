import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// The store that ACTUALLY RUNS, against a real database.
//
// Every other test in this directory drives the in-memory store, which is a
// faithful model of the contract and executes none of the SQL. So until this
// file existed, a typo in a column name, a jsonb cast, a soft-delete predicate
// or a join would have surfaced for the first time when the public service was
// deployed — and would have looked like the feature being broken rather than
// like one wrong word.
//
// It runs against PUBLIC_TEST_DATABASE_URL when one is set, applies every
// migration to a scratch schema, and drives one round trip through each record
// family. It is NOT a second copy of the behavioural tests: those belong with
// the memory store, where they are fast and total. What is checked here is only
// what the memory store cannot check — that the statements are valid, and that
// what goes into the database comes back out as the same shape.
const url = process.env.PUBLIC_TEST_DATABASE_URL;

const key = 'a'.repeat(48);
Object.assign(process.env, {
  PUBLIC_DATABASE_URL: url ?? 'postgres://public:public@127.0.0.1:5432/unused',
  PUBLIC_SESSION_SIGNING_KEY: key,
  PUBLIC_CHALLENGE_PEPPER: key,
  PUBLIC_TRUSTED_DEVICE_SIGNING_KEY: key,
  PUBLIC_ALLOWED_ORIGINS: 'https://public.example.com',
  PUBLIC_COOKIE_SECURE: 'true',
  PUBLIC_MAIL_FROM: 'no-reply@example.com',
  PUBLIC_SMTP_URL: 'smtp://127.0.0.1:1025',
});

const { handleRequest, PUBLIC_SESSION_COOKIE } = await import('../src/server.js');
const { PostgresPublicStore } = await import('../src/postgresStore.js');
const { signToken, sha256 } = await import('../src/security.js');

// Skipping is stated out loud rather than passing quietly: a check that goes
// green having run nothing is worse than one that is not there.
if (!url) {
  test('the Postgres store is exercised (skipped: set PUBLIC_TEST_DATABASE_URL)', { skip: 'no database' }, () => {});
} else {
  const store = new PostgresPublicStore(url);
  let token = '';
  let accountId = '';

  const call = (method: string, path: string, body?: unknown, withToken = true) => {
    const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as any;
    req.method = method; req.url = path;
    req.headers = {
      origin: 'https://public.example.com', 'x-vts-public-csrf': '1', 'x-forwarded-for': '203.0.113.7',
      ...(withToken ? { cookie: `${PUBLIC_SESSION_COOKIE}=${encodeURIComponent(token)}` } : {}),
    };
    req.socket = { remoteAddress: '203.0.113.7' };
    let status = 0; let payload = '';
    const res = { writeHead(c: number) { status = c; return res; }, end(chunk?: string) { payload = chunk ?? ''; } } as any;
    const market = { marketData: async () => ({}), marketNews: async () => ({}) };
    return handleRequest(req, res, { store, market } as any).then(() => ({ status, body: payload ? JSON.parse(payload) : {} }));
  };
  // Every route below is expected to succeed; a status check on each would bury
  // the reason a statement failed under an assertion about a number.
  const ok = async (method: string, path: string, body?: unknown) => {
    const result = await call(method, path, body);
    assert.ok(result.status < 400, `${method} ${path} → ${result.status} ${JSON.stringify(result.body)}`);
    return result.body;
  };

  test('every migration applies, in order, to an empty database', async () => {
    // Reset first, so this is repeatable and so what is being checked is that
    // the migrations build the schema from NOTHING — which is what they will do
    // the first time the public database exists.
    await store.raw('drop schema if exists public cascade; create schema public');
    const dir = 'migrations';
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    assert.ok(files.length > 0, 'there are migrations to apply');
    for (const file of files) {
      // Applied one statement-set at a time so a failure names its own file.
      await store.raw(readFileSync(path.join(dir, file), 'utf8'));
    }
    accountId = randomUUID();
    await store.raw(
      `insert into public_accounts(id,email,password_hash,display_name)
       values('${accountId}','${randomBytes(8).toString('hex')}@example.com','x','Tester')`);
    const session = randomUUID();
    await store.createSession(sha256(session), { accountId, expiresAt: Date.now() + 3_600_000, forcePasswordChange: false });
    token = signToken(session, key);
    assert.equal((await call('GET', '/public/v1/auth/session')).status, 200);
  });

  test('budget: dollars in, cents out, and the totals add up', async () => {
    const created = await ok('POST', '/public/v1/budget/categories', { name: 'Groceries', kind: 'expense', monthlyLimit: 600 });
    const id = created.categories[0].id;
    const entered = await ok('POST', '/public/v1/budget/entries', { categoryId: id, amount: 42.15, note: 'shop' });
    assert.equal(entered.entries[0].amountCents, 4_215);
    assert.equal(entered.categories[0].monthlyLimit, 60_000);
    assert.equal(entered.spentCents, 4_215);
    await ok('DELETE', `/public/v1/budget/entries/${entered.entries[0].id}`);
  });

  test('to do: sections are ensured idempotently and an item round-trips', async () => {
    const first = await ok('GET', '/public/v1/todo');
    const sections = first.sections.length;
    // The insert is guarded by a CONSTRAINT rather than by an in-process flag,
    // which is the whole reason it can be called on every read.
    assert.deepEqual((await ok('GET', '/public/v1/todo')).sections.length, sections);
    const added = await ok('POST', '/public/v1/todo/items', { sectionId: first.sections[0].id, text: 'Check the tape' });
    const item = added.sections[0].items.at(-1);
    assert.equal(item.text, 'Check the tape');
    const toggled = await ok('PATCH', `/public/v1/todo/items/${item.id}/toggle`);
    assert.equal(toggled.sections[0].items.find((i: any) => i.id === item.id).done, true);
  });

  test('investments: an account, a holding, and an unpriced one that is counted', async () => {
    const account = await ok('POST', '/public/v1/investments/accounts', { label: 'Roth', kind: 'roth_ira', cashBalance: 500 });
    await ok('POST', '/public/v1/investments/holdings',
      { investmentAccountId: account.id, name: 'Index', assetClass: 'us_stock', quantity: 10, manualPrice: 100 });
    await ok('POST', '/public/v1/investments/holdings',
      { investmentAccountId: account.id, name: 'Target Retirement 2055 Trust', assetClass: 'target_date', quantity: 3 });
    const portfolio = await ok('GET', '/public/v1/investments/portfolio');
    assert.equal(portfolio.totals.value, 1_500);
    assert.equal(portfolio.totals.unpricedCount, 1, 'unpriced is counted, not valued at zero');
  });

  test('net worth: an item stored positive, and a total that reconciles', async () => {
    const created = await ok('POST', '/public/v1/net-worth/items',
      { kind: 'liability', category: 'mortgage', label: 'House', value: -250_000 });
    assert.equal(created.liabilities[0].value, 250_000, 'stored positive; kind carries the sign');
    assert.equal(created.totals.liabilities, 250_000);
    assert.equal(typeof created.asOf, 'number');
    await ok('DELETE', `/public/v1/net-worth/items/${created.liabilities[0].id}`);
  });

  test('trading notes: a call is written, locked by its window, and settled', async () => {
    const past = Date.now() - 2 * 86_400_000;
    const made = await ok('POST', '/public/v1/notes',
      { kind: 'prediction', title: 'EURUSD higher', instrument: 'EUR/USD', direction: 'up', confidence: 4,
        windowOpensAt: past, deadlineAt: past + 86_400_000 });
    assert.equal(made.note.locked, true);
    const settled = await ok('POST', `/public/v1/notes/${made.note.id}/settle`, { outcome: 'unsettleable' });
    assert.equal(settled.note.outcome, 'unsettleable');
    const { stats } = await ok('GET', '/public/v1/notes');
    assert.equal(stats.unsettleable, 1);
    assert.equal(stats.hitRate, null, 'never scored, so no rate — not a zero');
  });

  test('study games: a deck with its questions, and progress against it', async () => {
    const question = (n: number, topic: string) => ({
      topic, stem: `Question ${n}?`, answer: 'A',
      options: [{ label: 'A', text: 'One' }, { label: 'B', text: 'Two' }, { label: 'C', text: 'Three' }, { label: 'D', text: 'Four' }],
    });
    const made = await ok('POST', '/public/v1/studies/decks',
      { name: 'Series 65', questions: [question(1, 'Ethics'), question(2, 'Rules')], categoryWeights: { Ethics: 60, Rules: 40 } });
    const id = made.deck.id;
    assert.deepEqual(made.deck.questions[0], {
      seq: 1, topic: 'Ethics', stem: 'Question 1?', answer: 'A', explanation: null, sourceName: null,
      options: [{ label: 'A', text: 'One' }, { label: 'B', text: 'Two' }, { label: 'C', text: 'Three' }, { label: 'D', text: 'Four' }],
    });
    assert.deepEqual(made.deck.questions.map((q: any) => q.seq), [1, 2]);
    assert.deepEqual(made.deck.categoryWeights, { Ethics: 60, Rules: 40 });
    const state = JSON.stringify({ totalAttempted: 12, totalCorrect: 9, levelCorrect: 14, bestStep: 2, recent: [true], cats: {} });
    await ok('PUT', `/public/v1/studies/decks/${id}/game`, { state });
    assert.equal((await ok('GET', `/public/v1/studies/decks/${id}/game`)).state, state, 'the blob comes back byte for byte');
    await ok('POST', `/public/v1/studies/decks/${id}/game/archive`, { state });
  });

  test('flashcards and presentations: cards, slides, and slide ids that survive', async () => {
    const set = await ok('POST', '/public/v1/studies/flashcards',
      { name: 'Basics', cards: [{ term: 'Bid', def: 'What a buyer will pay', topic: 'Terms' }] });
    assert.deepEqual(set.set.topics, ['Terms'], 'derived from the cards, not stored beside them');

    const guide = await ok('POST', '/public/v1/studies/guides',
      { name: 'Spreads', slides: [{ title: 'One', body: 'First' }, { title: 'Two', body: 'Second' }] });
    const [first, second] = guide.guide.slides;
    assert.ok(first.id && second.id);
    // Reordering must not change which slide is which — the ids are stored
    // inside the blob and have to survive a round trip through jsonb.
    const reordered = await ok('PUT', `/public/v1/studies/guides/${guide.guide.id}`, { slides: [second, first] });
    assert.deepEqual(reordered.guide.slides.map((s: any) => s.id), [second.id, first.id]);
  });

  test('support: a report, its thread, and a suggestion', async () => {
    const filed = await ok('POST', '/public/v1/support/bugs', { body: 'The tile does not resize\nBelow 400px.' });
    assert.equal(filed.report.summary, 'The tile does not resize');
    const replied = await ok('POST', `/public/v1/support/bugs/${filed.report.id}/reply`, { body: 'Safari too' });
    assert.equal(replied.report.messages.length, 2);
    assert.deepEqual(replied.report.messages.map((m: any) => m.role), ['user', 'user']);
    assert.ok((await ok('POST', '/public/v1/support/suggestions', { body: 'A print view' })).suggestion.id);
  });

  test('the trade log: a trade, an edit, and a soft delete that can be undone', async () => {
    const now = Date.now();
    const logged = await ok('POST', '/public/v1/trades',
      { instrument: 'EUR/USD', side: 'long', status: 'closed', entryPrice: 1.10, exitPrice: 1.11,
        units: 10_000, realizedPl: 100, plannedEntry: 1.09, openedAt: now - 86_400_000, closedAt: now });
    const id = logged.trades[0].id;
    // EVERY column is asserted on the way back, not just the ones a summary
    // happens to use. A wrong alias hands back `undefined`, which a win rate
    // computed from prices would not notice — so a test that only checked the
    // summary would go green on exactly the fault this file exists to catch.
    assert.deepEqual(
      (({ instrument, side, status, plannedEntry, entryPrice, exitPrice, units, realizedPl, notes }) =>
        ({ instrument, side, status, plannedEntry, entryPrice, exitPrice, units, realizedPl, notes }))(logged.trades[0]),
      { instrument: 'EUR/USD', side: 'long', status: 'closed', plannedEntry: 1.09, entryPrice: 1.10,
        exitPrice: 1.11, units: 10_000, realizedPl: 100, notes: null });
    assert.equal(logged.trades[0].openedAt, now - 86_400_000);
    assert.equal(logged.trades[0].closedAt, now);
    assert.equal(logged.summary.wins, 1);
    assert.equal(logged.summary.totalRealizedPl, 100);
    assert.equal(Number(logged.trades[0].slippage.toFixed(4)), 0.01);

    const edited = await ok('PATCH', `/public/v1/trades/${id}`, { notes: 'gave some back' });
    assert.equal(edited.trades[0].notes, 'gave some back');
    assert.equal(edited.trades[0].entryPrice, 1.10, 'a patch leaves what it did not send');

    const removed = await ok('DELETE', `/public/v1/trades/${id}`);
    assert.deepEqual(removed.trades, []);
    assert.equal(removed.removed.id, id);
    assert.equal((await ok('GET', '/public/v1/trades/deleted')).trades.length, 1);
    await ok('POST', `/public/v1/trades/${id}/restore`);
    assert.equal((await ok('GET', '/public/v1/trades')).trades.length, 1);
  });

  test('the funded book: a book, a trade, and figures derived from it', async () => {
    const book = await ok('POST', '/public/v1/funded', { label: 'FTP 200k', startingBalance: 200_000, commissionPerLot: 7 });
    const id = book.accounts[0].id;
    const traded = await ok('POST', `/public/v1/funded/${id}/trades`,
      { instrument: 'EUR/USD', side: 'long', units: 100_000, entryPrice: 1.10, exitPrice: 1.11,
        realizedPl: 1_000, stopLoss: 1.09, openedAt: Date.now(), closedAt: Date.now() });
    const account = traded.accounts[0];
    assert.equal(account.realizedPl, 1_000);
    assert.equal(account.balance, 201_000, 'derived from the trades, not stored beside them');
    assert.deepEqual(
      (({ instrument, side, units, entryPrice, exitPrice, stopLoss, takeProfit, realizedPl, status }) =>
        ({ instrument, side, units, entryPrice, exitPrice, stopLoss, takeProfit, realizedPl, status }))(account.trades[0]),
      { instrument: 'EUR/USD', side: 'long', units: 100_000, entryPrice: 1.10, exitPrice: 1.11,
        stopLoss: 1.09, takeProfit: null, realizedPl: 1_000, status: 'closed' });
    assert.equal(account.commissionPerLot, 7);
    await ok('DELETE', `/public/v1/funded/trades/${account.trades[0].id}`);
    assert.equal((await ok('GET', '/public/v1/funded')).accounts[0].balance, 200_000);
  });

  test('deleting the account takes every record family with it', async () => {
    // Every table references public_accounts on delete cascade. If one does not,
    // deleting an account leaves rows behind that belong to nobody — and this is
    // the only place that could ever be noticed.
    await store.raw(`delete from public_accounts where id='${accountId}'`);
    const leftovers = await store.raw(`
      select table_name, (xpath('/row/c/text()',
        query_to_xml(format('select count(*) as c from %I where account_id=''${accountId}''', table_name),
        false, true, '')))[1]::text::int as n
        from information_schema.columns
       where table_schema='public' and column_name='account_id'`);
    for (const row of leftovers as Array<{ table_name: string; n: number }>) {
      assert.equal(row.n, 0, `${row.table_name} still holds rows for a deleted account`);
    }
    await store.close();
  });
}
