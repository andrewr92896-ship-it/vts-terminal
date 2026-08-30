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
  // Which statements have ACTUALLY EXECUTED.
  //
  // Every one of these is a hand-written SQL string that the typecheck cannot
  // see inside, so a statement no test reaches has never run at all — and the
  // suite goes green having proved nothing about it. That is not hypothetical:
  // `consumeRateLimit` bound a parameter its SQL never referenced, which
  // Postgres refuses to type, so EVERY rate-limited route threw against a real
  // database — sign in, the second factor, recovery, early access — while this
  // file passed, because it seeded its session directly instead of logging in.
  //
  // So the store is wrapped and every call recorded, and the last test below
  // requires each method to have run or to be NAMED as deliberately unreached.
  const executed = new Set<string>();
  const real = new PostgresPublicStore(url);
  const store = new Proxy(real, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function' || typeof property !== 'string') return value;
      // `this` is the PROXY, not the target, so a helper the store calls on
      // itself is recorded too — bound to the target it would be invisible, and
      // would then read as never having run when it runs on every request.
      return (...args: unknown[]) => { executed.add(property); return value.apply(receiver, args); };
    },
  }) as typeof real;
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

  test('the rate limiter counts, and refuses past its bound', async () => {
    // The bound is applied in JS while the window lives in SQL, so nothing but
    // running it proves the two agree. Everything that keeps a stranger from
    // grinding the login is this one function.
    const bucket = `probe-${randomBytes(4).toString('hex')}`;
    const seen: Array<{ allowed: boolean; retryAfterSeconds: number }> = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      seen.push(await store.consumeRateLimit(bucket, 'probe', 3, 60_000));
    }
    assert.deepEqual(seen.map((r) => r.allowed), [true, true, true, false]);
    const refused = seen[3]!;
    assert.ok(refused.retryAfterSeconds > 0 && refused.retryAfterSeconds <= 60,
      `a refusal must say when to come back, got ${refused.retryAfterSeconds}`);
    // A different key is a different budget, or one busy visitor would lock out
    // everybody else.
    assert.equal((await store.consumeRateLimit(bucket, 'other', 3, 60_000)).allowed, true);
  });

  test('an admitted account can actually sign in', async () => {
    // The whole point. There is no public sign-up, so every real customer
    // arrives through `admitAccount` — and three separate things make a
    // hand-written row an account that can never sign in, all three of which
    // answer with the SAME generic 401 that a wrong password does. So this
    // drives an admitted account through the real login, the real emailed code
    // and the real session lookup, because nothing short of that can tell an
    // account that works from one that only looks like it does.
    const { admitAccount, AdmitError } = await import('../src/admit.js');
    const { PublicAuthService } = await import('../src/auth.js');

    let emailedCode = '';
    const auth = new PublicAuthService(store as any,
      { sendVerification: async (_to: string, code: string) => { emailedCode = code; },
        sendTemporaryPassword: async () => {}, sendDeletionLink: async () => {}, sendDeletionComplete: async () => {}, },
      { session: key, challenge: key, trusted: key ,site:'https://public.example.com'});

    const address = `admitted-${randomBytes(6).toString('hex')}@example.com`;
    const admitted = await admitAccount(store as any, { email: address, displayName: 'Admitted' });

    const started = await auth.login(address, admitted.password, undefined, '203.0.113.9');
    assert.equal(started.requiresTwoFactor, true, 'login did not reach the second factor');
    assert.match(emailedCode, /^\d{6}$/, 'no code was sent, so nobody could complete a sign-in');

    const finished = await auth.verify(started.challengeId!, emailedCode, false, '203.0.113.9');
    assert.ok(finished.sessionToken, 'the code was accepted but no session was issued');
    // Deliberately NOT forced: a forced change needs a temporary window, and
    // that window is fifteen minutes — which locks out an invitation read the
    // next morning.
    assert.equal(finished.passwordChangeRequired, false);

    // Through the HTTP route, with the cookie, exactly as a browser does it.
    const held = token;
    token = finished.sessionToken!;
    const session = await ok('GET', '/public/v1/auth/session');
    assert.equal(session.user.email, address);
    assert.equal(session.user.displayName, 'Admitted');
    token = held;

    // The password it generated is one the terminal will let its owner change.
    // A shorter one signs in and can then never be changed, because
    // `changePassword` validates the new password against a rule the old one
    // never had to meet.
    await assert.rejects(
      admitAccount(store as any, { email: `weak-${randomBytes(4).toString('hex')}@example.com`, displayName: 'Weak', password: 'short' }),
      (error: unknown) => error instanceof AdmitError);
    // And re-admitting says so, rather than raising the unique index.
    await assert.rejects(
      admitAccount(store as any, { email: address, displayName: 'Again' }),
      (error: unknown) => error instanceof AdmitError && /already has an account/.test(error.message));
  });

  test('the clickwrap record: one row per document, append-only, and it gates', async () => {
    // FIRST, that the gate is really in front of everything. This test sits
    // immediately after signing in and before every record family below,
    // because that is the real order — and because an account that has not
    // accepted is refused everywhere, so the suite could not reach them anyway.
    assert.equal((await call('GET', '/public/v1/budget')).status, 403, 'a record route was served before the terms were accepted');

    const before = await call('GET', '/public/v1/legal/documents');
    assert.equal(before.status, 200);
    assert.deepEqual([...before.body.outstanding].sort(), ['acknowledgement', 'privacy', 'terms']);

    assert.equal((await call('POST', '/public/v1/legal/accept')).status, 200);

    const rows = await store.listLegalAcceptances(accountId);
    assert.equal(rows.length, 3);
    for (const row of rows) {
      assert.match(row.sha256, /^[0-9a-f]{64}$/, `${row.document} came back without its hash`);
      assert.ok(row.version.length > 0);
      assert.ok(Number.isFinite(row.acceptedAt) && row.acceptedAt > 0, 'accepted_at did not survive the round trip');
    }
    // One statement writes the whole set, so the three share a timestamp — a
    // half-written acceptance would gate the account forever with no way to
    // tell why.
    assert.equal(new Set(rows.map((r) => r.acceptedAt)).size, 1);

    // Append-only: a second version of one document adds a row and leaves the
    // first exactly where it was.
    await store.recordLegalAcceptances(accountId, [{ document: 'terms', version: 'later', sha256: 'c'.repeat(64) }]);
    const after = await store.listLegalAcceptances(accountId);
    assert.equal(after.length, 4);
    assert.equal(after.filter((r) => r.document === 'terms').length, 2);
    // Ordered oldest first, which is what makes "when did they first agree"
    // readable off the top of the list.
    assert.ok(after[0]!.acceptedAt <= after[after.length - 1]!.acceptedAt);

    // An empty set writes nothing and does not raise.
    await store.recordLegalAcceptances(accountId, []);
    assert.equal((await store.listLegalAcceptances(accountId)).length, 4);

    // And the same route is served now, which is what the rest of this file
    // depends on.
    assert.equal((await call('GET', '/public/v1/budget')).status, 200);
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

  test('the edits and the deletes: the half nothing had ever run', async () => {
    // Every family's create and read was exercised; none of its UPDATE or
    // DELETE was. Those are the statements a customer runs the first time they
    // correct a typo or remove a row, and a wrong column name in one is not
    // visible from anywhere else — the check below this one is what said so.
    const q = (n: number) => ({ topic: 'T', stem: `Q${n}?`, answer: 'A',
      options: ['A', 'B', 'C', 'D'].map((label) => ({ label, text: label })) });

    // The market-data arrangement, which is stored as jsonb.
    const layout = { pinned: ['ffr'], hidden: [], custom: [] };
    assert.deepEqual((await ok('PUT', '/public/v1/market-data/layout', layout)).layout, layout);
    assert.deepEqual((await ok('GET', '/public/v1/market-data/layout')).layout, layout);

    // Budget: archiving keeps history, deleting removes it. An archived
    // category with activity IN THE MONTH BEING VIEWED is still listed —
    // dropping it would silently change a past month's total, which is the one
    // thing a record of what you spent must never do.
    const budget = await ok('POST', '/public/v1/budget/categories', { name: 'Edits', kind: 'expense' });
    const categoryId = budget.categories.find((c: any) => c.name === 'Edits').id;
    await ok('POST', '/public/v1/budget/entries', { categoryId, amount: 10 });
    const withActivity = await ok('PATCH', `/public/v1/budget/categories/${categoryId}`, { archived: true });
    const stillThere = withActivity.categories.find((c: any) => c.id === categoryId);
    assert.ok(stillThere, 'archiving a category with spending in this month hid the spending');
    assert.equal(stillThere.archived, true);
    assert.equal(withActivity.spentCents, 1_000);

    // One with nothing against it this month is dropped from the view, which is
    // the same rule seen from the other side.
    const quiet = await ok('POST', '/public/v1/budget/categories', { name: 'Quiet', kind: 'expense' });
    const quietId = quiet.categories.find((c: any) => c.name === 'Quiet').id;
    const afterQuiet = await ok('PATCH', `/public/v1/budget/categories/${quietId}`, { archived: true });
    assert.equal(afterQuiet.categories.find((c: any) => c.id === quietId), undefined);

    // Deleting takes the history with it, which is why it is the separate call.
    const afterDelete = await ok('DELETE', `/public/v1/budget/categories/${categoryId}`);
    assert.equal(afterDelete.categories.find((c: any) => c.id === categoryId), undefined);
    assert.equal(afterDelete.spentCents, 0);
    await ok('DELETE', `/public/v1/budget/categories/${quietId}`);

    // To do: a delete that is a soft delete, and the restore that undoes it.
    const todo = await ok('GET', '/public/v1/todo');
    // EVERY section carries the tag the screen filters on. The To Do screen
    // renders only `tag === 'trading'` sections and adds new items to the first
    // one carrying it, so a null tag is a screen that shows nothing whatever is
    // in it and cannot be added to either — which is what it did, while the
    // demo (which sets the tag) worked perfectly.
    assert.ok(todo.sections.length > 0);
    assert.deepEqual([...new Set(todo.sections.map((s: any) => s.tag))], ['trading']);
    const section = todo.sections[0].id;
    const item = (await ok('POST', '/public/v1/todo/items', { sectionId: section, text: 'Removable' })).sections
      .flatMap((s: any) => s.items).find((i: any) => i.text === 'Removable');
    await ok('DELETE', `/public/v1/todo/items/${item.id}`);
    assert.ok(!(await ok('GET', '/public/v1/todo')).sections.flatMap((s: any) => s.items)
      .some((i: any) => i.id === item.id), 'a deleted item was still listed');
    // The payload is rebuilt field by field on the server rather than trusted
    // as sent, so restoring is only a restore if it round-trips.
    // The payload is rebuilt field by field on the server rather than trusted
    // as sent, so restoring is only a restore if it round-trips.
    await ok('POST', '/public/v1/todo/items/restore',
      { id: item.id, sectionId: section, text: item.text, position: 0 });
    const back = (await ok('GET', '/public/v1/todo')).sections.flatMap((s: any) => s.items)
      .find((i: any) => i.id === item.id);
    assert.ok(back, 'a restored item did not come back');
    assert.equal(back.text, 'Removable');
    // Pressing undo twice must not overwrite what it just put back. It is
    // refused rather than repeated — the id is already there — and the text
    // being unchanged is the property that actually matters.
    const again = await call('POST', '/public/v1/todo/items/restore',
      { id: item.id, sectionId: section, text: 'Overwritten', position: 0 });
    assert.equal(again.status, 404);
    assert.equal((await ok('GET', '/public/v1/todo')).sections.flatMap((s: any) => s.items)
      .find((i: any) => i.id === item.id).text, 'Removable', 'a second restore overwrote the first');

    // Investments, all four kinds of row. An edit answers `{ok:true}` rather
    // than the row, so every assertion here re-READS — which is the stronger
    // check anyway: it proves the write reached the database instead of the
    // response echoing back what was sent.
    const portfolio = () => ok('GET', '/public/v1/investments/portfolio');
    const account = await ok('POST', '/public/v1/investments/accounts', { label: 'Edits', kind: 'brokerage', cashBalance: 10 });
    await ok('PATCH', `/public/v1/investments/accounts/${account.id}`, { label: 'Edited' });
    assert.equal((await portfolio()).accounts.find((a: any) => a.id === account.id).label, 'Edited');

    const holding = await ok('POST', '/public/v1/investments/holdings',
      { investmentAccountId: account.id, name: 'Fund', assetClass: 'target_date', quantity: 2, manualPrice: 5 });
    await ok('PATCH', `/public/v1/investments/holdings/${holding.id}`, { quantity: 3 });
    assert.equal((await portfolio()).holdings.find((h: any) => h.id === holding.id).quantity, 3);

    const transaction = await ok('POST', '/public/v1/investments/transactions',
      { investmentAccountId: account.id, kind: 'contribution', amount: 100, taxYear: 2026 });
    const goal = await ok('POST', '/public/v1/investments/goals', { label: 'Retire', targetAmount: 1_000, targetYear: 2050 });
    // Neither is on the portfolio payload — each has its own read, which the
    // next test covers. A January contribution can be designated to the
    // previous year, so the tax year is its own column and has to survive.
    const contributions = await ok('GET', '/public/v1/investments/contributions?taxYear=2026');
    assert.ok(contributions.goals.some((g: any) => g.id === goal.id), 'the goal is listed');

    await ok('DELETE', `/public/v1/investments/transactions/${transaction.id}`);
    await ok('DELETE', `/public/v1/investments/goals/${goal.id}`);
    await ok('DELETE', `/public/v1/investments/holdings/${holding.id}`);
    await ok('DELETE', `/public/v1/investments/accounts/${account.id}`);
    const emptied = await portfolio();
    assert.equal(emptied.accounts.find((a: any) => a.id === account.id), undefined);
    assert.equal(emptied.holdings.find((h: any) => h.id === holding.id), undefined);

    // Net worth: the value stays positive and `kind` carries the sign, so an
    // edit that changed one without the other would be invisible in a total.
    const worth = await ok('POST', '/public/v1/net-worth/items', { kind: 'asset', category: 'cash', label: 'Edits', value: 100 });
    const itemId = worth.assets[0].id;
    assert.equal((await ok('PATCH', `/public/v1/net-worth/items/${itemId}`, { value: 250 })).assets[0].value, 250);
    await ok('DELETE', `/public/v1/net-worth/items/${itemId}`);

    // A trading note.
    const note = await ok('POST', '/public/v1/notes', { kind: 'observation', title: 'Removable' });
    await ok('DELETE', `/public/v1/notes/${note.note.id}`);

    // Study content: the deck's questions are rewritten wholesale on a patch,
    // which is the one edit here that is more than a column.
    const deck = await ok('POST', '/public/v1/studies/decks', { name: 'Edits', questions: [q(1)] });
    const patched = await ok('PATCH', `/public/v1/studies/decks/${deck.deck.id}`, { name: 'Edited', questions: [q(1), q(2)] });
    assert.equal(patched.deck.name, 'Edited');
    assert.equal(patched.deck.questions.length, 2);
    await ok('DELETE', `/public/v1/studies/decks/${deck.deck.id}`);

    const set = await ok('POST', '/public/v1/studies/flashcards', { name: 'Edits', cards: [{ term: 'a', def: 'b' }] });
    assert.equal((await ok('GET', `/public/v1/studies/flashcards/${set.set.id}`)).set.cards.length, 1);
    assert.equal((await ok('PATCH', `/public/v1/studies/flashcards/${set.set.id}`, { name: 'Edited' })).set.name, 'Edited');
    await ok('DELETE', `/public/v1/studies/flashcards/${set.set.id}`);

    const guide = await ok('POST', '/public/v1/studies/guides', { name: 'Edits', slides: [{ title: 'a', body: 'b' }] });
    await ok('DELETE', `/public/v1/studies/guides/${guide.guide.id}`);

    // Support: the list a person reads their own reports from.
    await ok('POST', '/public/v1/support/bugs', { body: 'A report to list.' });
    assert.ok((await ok('GET', '/public/v1/support/bugs')).reports.length > 0);

    // The funded book.
    const book = await ok('POST', '/public/v1/funded', { label: 'Edits', startingBalance: 1_000 });
    const bookId = book.accounts.find((a: any) => a.label === 'Edits').id;
    assert.equal((await ok('PATCH', `/public/v1/funded/${bookId}`, { label: 'Edited' }))
      .accounts.find((a: any) => a.id === bookId).label, 'Edited');
    await ok('DELETE', `/public/v1/funded/${bookId}`);
  });

  test('a password can be changed, and the old one stops working', async () => {
    // `updatePassword` is the statement behind both changing a password and
    // recovering one, and it had never run. Its `case when $4 is null` cast is
    // exactly the shape that fails only against a real database.
    const { admitAccount } = await import('../src/admit.js');
    const { PublicAuthService } = await import('../src/auth.js');
    let code = '';
    const auth = new PublicAuthService(store as any,
      { sendVerification: async (_to: string, sent: string) => { code = sent; }, sendTemporaryPassword: async () => {}, sendDeletionLink: async () => {}, sendDeletionComplete: async () => {}, },
      { session: key, challenge: key, trusted: key ,site:'https://public.example.com'});

    const address = `changer-${randomBytes(6).toString('hex')}@example.com`;
    const admitted = await admitAccount(store as any, { email: address, displayName: 'Changer' });
    const started = await auth.login(address, admitted.password, undefined, '203.0.113.11');
    const signedIn = await auth.verify(started.challengeId!, code, false, '203.0.113.11');

    const next = 'AnotherGood1Password';
    const changed = await auth.changePassword(signedIn.sessionToken!, admitted.password, next);
    assert.equal(changed.passwordChangeRequired, false);
    // The old password must be dead, or a leaked one stays live forever.
    await assert.rejects(auth.login(address, admitted.password, undefined, '203.0.113.12'));
    assert.equal((await auth.login(address, next, undefined, '203.0.113.13')).requiresTwoFactor, true);
  });

  test('an account deletes, taking its records and its beta-access row with it', async () => {
    // THE ONE FLOW WHERE BEING WRONG IS UNRECOVERABLE, and most of what makes it
    // correct is the database rather than the code: 26 cascading foreign keys do
    // the work, and the only row written out by hand is the beta-access request,
    // which is keyed by email address and carries no account id for a cascade to
    // follow. Nothing but a real Postgres can show that the cascades reach what
    // they are assumed to reach.
    const { admitAccount } = await import('../src/admit.js');
    const { PublicAuthService } = await import('../src/auth.js');
    let code = '';
    let link = '';
    let receipt = '';
    const auth = new PublicAuthService(store as any,
      { sendVerification: async (_to: string, sent: string) => { code = sent; }, sendTemporaryPassword: async () => {},
        sendDeletionLink: async (_to: string, url: string) => { link = url; },
        sendDeletionComplete: async (to: string) => { receipt = to; } },
      { session: key, challenge: key, trusted: key, site: 'https://public.example.com' });

    const address = `deleter-${randomBytes(6).toString('hex')}@example.com`;
    // They asked for a place before they had an account, which is how every
    // account here comes to exist.
    await store.recordEarlyAccessRequest(address, null);
    const admitted = await admitAccount(store as any, { email: address, displayName: 'Deleter' });
    const started = await auth.login(address, admitted.password, undefined, '203.0.113.21');
    const signedIn = await auth.verify(started.challengeId!, code, false, '203.0.113.21');

    // Something of theirs in a cascading table, so the cascade has work to do.
    await store.addBudgetCategory(admitted.id, { name: 'Rent', kind: 'expense', monthlyLimitCents: 120000 } as any);
    const owned = async () => (await store.raw(
      `select count(*)::int as n from public_budget_categories where account_id='${admitted.id}'`) as Array<{ n: number }>)[0]!.n;
    assert.equal(await owned(), 1);

    await auth.requestDeletion(signedIn.sessionToken!);
    // Asking does not delete. Until the link is opened the account is untouched.
    const stillThere = await store.raw(`select count(*)::int as n from public_accounts where id='${admitted.id}'`) as Array<{ n: number }>;
    assert.equal(stillThere[0]!.n, 1, 'requesting deletion must not delete anything');
    const token = new URL(link).searchParams.get('delete')!;

    await auth.confirmDeletion(token);

    const gone = async (sql: string) => ((await store.raw(sql)) as Array<{ n: number }>)[0]!.n;
    assert.equal(await gone(`select count(*)::int as n from public_accounts where id='${admitted.id}'`), 0, 'the account survived');
    assert.equal(await owned(), 0, 'the cascade did not reach the budget rows');
    assert.equal(await gone(`select count(*)::int as n from public_sessions where account_id='${admitted.id}'`), 0, 'a session survived');
    assert.equal(await gone(`select count(*)::int as n from public_account_deletions where account_id='${admitted.id}'`), 0, 'the pending request survived');
    assert.equal(await gone(`select count(*)::int as n from public_early_access_requests where lower(email)=lower('${address}')`), 0, 'the beta-access row survived');
    // 0014 made this cascade rather than linger as a de-linked row.
    assert.equal(await gone(`select count(*)::int as n from public_recovery_events where account_id='${admitted.id}'`), 0, 'a recovery event survived');
    assert.equal(receipt, address, 'no confirmation was sent');

    // Audit events are the ONE thing that intentionally outlives the account,
    // de-linked. That is what the Privacy Policy discloses, so it is asserted
    // rather than assumed.
    const linked = await gone(`select count(*)::int as n from public_audit_events where account_id='${admitted.id}'`);
    assert.equal(linked, 0, 'an audit row is still linked to the deleted account');

    // And the spent link is dead.
    await assert.rejects(() => auth.confirmDeletion(token), /no longer valid/);
  });

  test('an early-access request is recorded, and asking twice is not two rows', async () => {
    // The one route a visitor from the marketing site reaches, and its SQL had
    // never run. The upsert is on `lower(email)`, which needs the expression
    // index in 0002 to exist at all — nothing but running it can say it does.
    const address = `Early-${randomBytes(5).toString('hex')}@Example.com`;
    const send = (note: string | null) => call('POST', '/public/v1/early-access', { email: address, note }, false);
    assert.ok((await send('first')).status < 400);
    assert.ok((await send('second')).status < 400);
    const rows = await store.raw(`select count(*)::int as n from public_early_access_requests where lower(email)=lower('${address}')`);
    assert.equal((rows[0] as { n: number }).n, 1, 'asking twice made two rows');
  });

  test('a preference is stored, merged rather than replaced, and rides the session', async () => {
    // The public terminal is a cached bundle, so an older one PATCHes only the
    // settings it knows about — and that must never blank one it has never heard
    // of. The merge is the whole reason this is a PATCH, and nothing but a real
    // round trip can say the jsonb upsert actually does it.
    const first = await ok('PATCH', '/public/v1/preferences', { displayTimezone: 'America/Chicago' });
    assert.equal(first.preferences.displayTimezone, 'America/Chicago');

    const second = await ok('PATCH', '/public/v1/preferences', {
      myTerminalSections: JSON.stringify({ add: ['desk'], hide: ['my_rules'] }),
    });
    assert.equal(second.preferences.displayTimezone, 'America/Chicago', 'a partial save blanked a setting it did not send');
    assert.equal(second.preferences.myTerminalSections, '{"add":["desk"],"hide":["my_rules"]}');

    // Null CLEARS rather than storing a null, so "never chosen" and "chosen and
    // then cleared" are one state — the client resolves a missing key as the
    // default and there is nothing a stored null could additionally mean.
    const cleared = await ok('PATCH', '/public/v1/preferences', { myTerminalSections: null });
    assert.equal('myTerminalSections' in cleared.preferences, false);
    assert.equal(cleared.preferences.displayTimezone, 'America/Chicago');

    assert.deepEqual((await ok('GET', '/public/v1/preferences')).preferences, cleared.preferences);

    // The shell needs these BEFORE it draws anything — the time zone every stamp
    // renders in, and the customized My Terminal board — so they ride the session
    // rather than needing a second request that would paint the default first.
    const session = await ok('GET', '/public/v1/auth/session');
    assert.equal(session.preferences.displayTimezone, 'America/Chicago');
  });

  test('contributions, dividends and performance read back what was written', async () => {
    // Three screens read these and nothing served them, so on a real account
    // each was permanently empty while the demo showed them full — the worst
    // way round, since the showcase then proves a screen the first customer
    // finds blank.
    const account = await ok('POST', '/public/v1/investments/accounts', { label: 'Roth', kind: 'roth_ira', cashBalance: 0 });
    const holding = await ok('POST', '/public/v1/investments/holdings',
      { investmentAccountId: account.id, symbol: 'VOO', name: 'S&P 500', assetClass: 'us_stock', quantity: 10, manualPrice: 500 });
    const year = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric' }).format(new Date()));
    await ok('POST', '/public/v1/investments/transactions',
      { investmentAccountId: account.id, kind: 'contribution', amount: 3_000, taxYear: year });
    await ok('POST', '/public/v1/investments/transactions',
      { investmentAccountId: account.id, holdingId: holding.id, kind: 'dividend', amount: 42 });

    const contributions = await ok('GET', `/public/v1/investments/contributions?taxYear=${year}`);
    const ira = contributions.groups.find((g: any) => g.group === 'ira');
    assert.ok(ira, 'a Roth IRA account did not produce an IRA group');
    assert.equal(ira.contributed, 3_000);
    // The limit comes from the catalog, and a year not in it reports NO limit
    // rather than the nearest year's — somebody could over-contribute on a
    // stale one. Both branches, so neither can quietly become the other.
    assert.equal(contributions.limitsKnown, true);
    assert.ok(ira.limit > 0 && ira.remaining === ira.limit - 3_000);
    assert.equal((await ok('GET', '/public/v1/investments/contributions?taxYear=1999')).limitsKnown, false);
    assert.equal((await ok('GET', '/public/v1/investments/contributions?taxYear=1999'))
      .groups.find((g: any) => g.group === 'ira').limit, null);

    const dividends = await ok('GET', '/public/v1/investments/dividends');
    assert.equal(dividends.totalAllTime, 42);
    assert.equal(dividends.totalLast12, 42);
    assert.equal(dividends.monthly.length, 12);
    // Attributed to the holding it was paid on, not to a bucket called nothing.
    assert.deepEqual(dividends.bySymbol, [{ symbol: 'VOO', amount: 42 }]);
    // Trailing yield is what was RECEIVED over what is held — measured against
    // the same total the portfolio reports, so the two cannot disagree.
    const book = await ok('GET', '/public/v1/investments/portfolio');
    assert.ok(book.totals.value > 0);
    assert.ok(Math.abs(dividends.trailingYieldPct - (42 / book.totals.value) * 100) < 1e-9);

    // The portfolio's SHAPE, not just its figures. `flags` sits INSIDE
    // `allocation` and this payload had it as a sibling, so the Overview screen
    // — the workspace's landing page — threw on any account that actually held
    // an investment account. It rendered perfectly while empty, which is why
    // nothing short of a real account with rows in it could see it.
    assert.deepEqual(Object.keys(book.allocation).sort(), ['byClass', 'byRegion', 'bySector', 'flags']);
    assert.ok(Array.isArray(book.allocation.flags));
    // No public quote provider — every price is one the account typed — so this
    // is stated as false rather than left absent, which would read as a feed.
    assert.equal(book.livePricesConfigured, false);
    assert.ok(typeof book.asOf === 'number');

    // A snapshot is written forward by reading the portfolio, one per Eastern
    // day, and the curve is built from those — never back-filled.
    const performance = await ok('GET', '/public/v1/investments/performance?days=365');
    assert.ok(performance.points.length > 0, 'reading the portfolio recorded no snapshot');
    assert.equal(performance.points[performance.points.length - 1].value, book.totals.value);
    assert.equal(performance.rangeDays, 365);
    // A window that excludes every reading reports none rather than inventing
    // a flat line back to the beginning.
    assert.equal((await ok('GET', '/public/v1/investments/performance?days=0')).rangeDays, 365);

    await ok('DELETE', `/public/v1/investments/holdings/${holding.id}`);
    await ok('DELETE', `/public/v1/investments/accounts/${account.id}`);
  });

  test('the retention sweep takes what is spent and leaves what is live', async () => {
    // The sweep's rules are tested against the memory store, where they are
    // fast and total. What is checked HERE is the half that store cannot
    // check: seven hand-written DELETE statements, each with a timestamp
    // comparison Postgres has to type, against real columns.
    //
    // Every one is given a row on BOTH sides of its cutoff, because a DELETE
    // with the predicate dropped passes "the old row is gone" perfectly — and
    // that is the worse failure of the two. A sweep that took live sessions
    // would sign the whole terminal out every six hours.
    const now = Date.now();
    const ago = (ms: number) => `to_timestamp(${(now - ms) / 1000})`;
    const ahead = (ms: number) => `to_timestamp(${(now + ms) / 1000})`;
    const DAY = 24 * 60 * 60_000;
    const h = () => randomBytes(16).toString('hex');

    // ONE PASS FIRST, to clear what the tests above left behind — signing in
    // and changing a password both leave spent codes and revoked sessions, and
    // an absolute count is only evidence if the rows being counted are the ones
    // this test put there.
    await store.sweepExpired(now);

    const [oldLead, freshLead] = [h(), h()];
    await store.raw(`insert into public_early_access_requests(email,created_at) values
      ('${oldLead}@example.com', ${ago(181 * DAY)}), ('${freshLead}@example.com', ${ago(179 * DAY)})`);

    const [deadSession, liveSession, revokedSession] = [h(), h(), h()];
    await store.raw(`insert into public_sessions(token_hash,account_id,expires_at,revoked_at) values
      ('${deadSession}','${accountId}',${ago(1000)},null),
      ('${liveSession}','${accountId}',${ahead(12 * 60 * 60_000)},null),
      ('${revokedSession}','${accountId}',${ahead(12 * 60 * 60_000)},${ago(1000)})`);

    const [deadCode, liveCode, usedCode] = [h(), h(), h()];
    await store.raw(`insert into public_auth_challenges(token_hash,account_id,code_hash,expires_at,consumed_at) values
      ('${deadCode}','${accountId}','x',${ago(1000)},null),
      ('${liveCode}','${accountId}','x',${ahead(10 * 60_000)},null),
      ('${usedCode}','${accountId}','x',${ahead(10 * 60_000)},${ago(1000)})`);

    const [deadDevice, liveDevice, rotatedDevice] = [h(), h(), h()];
    await store.raw(`insert into public_trusted_devices(token_hash,account_id,expires_at,revoked_at) values
      ('${deadDevice}','${accountId}',${ago(1000)},null),
      ('${liveDevice}','${accountId}',${ahead(30 * DAY)},null),
      ('${rotatedDevice}','${accountId}',${ahead(30 * DAY)},${ago(1000)})`);

    // NOTHING WRITES A RECOVERY EVENT — the table survives from the first
    // migration and no code path inserts one — so the row is put here by hand.
    // The statement is swept anyway, so a future writer inherits the rule, and
    // this is the only way that DELETE can ever be proved to be valid SQL.
    await store.raw(`insert into public_recovery_events(account_id,expires_at) values
      ('${accountId}', ${ago(1000)}), ('${accountId}', ${ahead(15 * 60_000)})`);

    const [deadLink, liveLink] = [h(), h()];
    await store.raw(`insert into public_account_deletions(token_hash,account_id,expires_at) values
      ('${deadLink}','${accountId}',${ago(1000)}), ('${liveLink}','${accountId}',${ahead(60 * 60_000)})`);

    const [staleBucket, freshBucket] = [h(), h()];
    await store.raw(`insert into public_rate_limits(bucket,key_hash,window_started,count) values
      ('sweep-test','${staleBucket}',${ago(25 * 60 * 60_000)},3),
      ('sweep-test','${freshBucket}',${ago(60_000)},3)`);

    const swept = await store.sweepExpired(now);

    const gone = async (sql: string) => Number((await store.raw(sql) as Array<{ n: number }>)[0]!.n);
    const has = async (table: string, hash: string) =>
      gone(`select count(*)::int as n from ${table} where token_hash='${hash}'`);

    assert.equal(swept.betaAccessRequests, 1);
    assert.equal(await gone(`select count(*)::int as n from public_early_access_requests where email='${freshLead}@example.com'`), 1, 'a five-month-old lead was swept');
    assert.equal(await gone(`select count(*)::int as n from public_early_access_requests where email='${oldLead}@example.com'`), 0);

    assert.equal(swept.sessions, 2, 'the expired and the signed-out session');
    assert.equal(await has('public_sessions', liveSession), 1, 'a live session was swept — everyone would be signed out');
    assert.equal(await has('public_sessions', deadSession), 0);
    assert.equal(await has('public_sessions', revokedSession), 0);

    assert.equal(swept.challenges, 2);
    assert.equal(await has('public_auth_challenges', liveCode), 1, 'a sign-in code in flight was swept');

    assert.equal(swept.trustedDevices, 2);
    assert.equal(await has('public_trusted_devices', liveDevice), 1, 'a remembered browser was forgotten early');

    assert.equal(swept.recoveryEvents, 1);
    assert.equal(await gone(`select count(*)::int as n from public_recovery_events where account_id='${accountId}'`), 1);

    assert.equal(swept.deletionRequests, 1);
    assert.equal(await has('public_account_deletions', liveLink), 1, 'an unopened deletion link was swept');

    assert.equal(swept.rateLimits, 1);
    assert.equal(await gone(`select count(*)::int as n from public_rate_limits where key_hash='${freshBucket}'`), 1, 'a window somebody is inside was swept');
    assert.equal(await gone(`select count(*)::int as n from public_rate_limits where key_hash='${staleBucket}'`), 0);

    // And the suite's own session still works, which is what proves the counts
    // above were counting the right rows.
    assert.ok((await ok('GET', '/public/v1/auth/session')).user.email);
  });

  test('every statement in the store has actually executed', async () => {
    // A method never called is SQL that has never run. Nothing else in this
    // repository can see inside these strings, so an unreached one is a
    // statement the first customer executes.
    //
    // Anything genuinely not reachable from here belongs in the list below WITH
    // ITS REASON — a gap somebody decided to leave is fine, a gap nobody knows
    // about is what this exists to prevent.
    const UNREACHED = new Map([
      // Teardown for the pool itself, called after this test by necessity.
      ['close', 'closed by the test that runs after this one'],
      // Reached only by a second sign-in on a remembered browser, which needs a
      // trusted-device cookie this suite does not carry. The behaviour is
      // covered against the memory store.
      ['getTrustedDevice', 'needs a trusted-device cookie'],
      ['revokeTrustedDevice', 'needs a trusted-device cookie'],
      ['createTrustedDevice', 'needs a remembered sign-in'],
      ['revokeSession', 'sign-out; the session here is discarded rather than ended'],
      ['recordNetWorthSnapshot', 'written by reading net worth on a day this account has not'],
    ]);

    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(real))
      .filter((name) => name !== 'constructor' && typeof (real as any)[name] === 'function');
    assert.ok(methods.length > 50, `expected the whole store, found ${methods.length} methods`);

    const missed = methods.filter((name) => !executed.has(name) && !UNREACHED.has(name));
    assert.deepEqual(missed, [],
      `these statements have never run against a database:\n  ${missed.join('\n  ')}\n` +
      'Drive each from a test, or name it in UNREACHED above with the reason.');

    // And the list itself must stay honest — an entry that IS now reached is a
    // stale excuse, and leaving it there hides the next real gap.
    const stale = [...UNREACHED.keys()].filter((name) => executed.has(name) && name !== 'close');
    assert.deepEqual(stale, [], `named unreachable but actually reached: ${stale.join(', ')}`);
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
