#!/usr/bin/env node
// Put one account and one signed-in session into the public database, and print
// the session cookie, so a browser can be pointed at a REAL account.
//
// The records it seeds are the ones whose payloads the screens read: a trade, a
// funded book, a budget category, a net worth item, a study game, a prediction.
// The point is not the data, it is that each screen has something to render, so
// "the screen is empty" and "the screen could not read the answer" cannot be
// confused for one another.
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

const url = process.env.PUBLIC_DATABASE_URL;
if (!url) {
  console.error('PUBLIC_DATABASE_URL is required.');
  process.exit(1);
}

const { handleRequest, PUBLIC_SESSION_COOKIE } = await import('../apps/public-api/dist/src/server.js');
const { PostgresPublicStore } = await import('../apps/public-api/dist/src/postgresStore.js');
const { signToken, sha256 } = await import('../apps/public-api/dist/src/security.js');
const { acceptanceEntries } = await import('../apps/public-api/dist/src/legalDocuments.js');

const key = process.env.PUBLIC_SESSION_SIGNING_KEY;
const store = new PostgresPublicStore(url);
const market = { marketData: async () => ({}), marketNews: async () => ({}) };

const accountId = randomUUID();
await store.raw(`insert into public_accounts(id,email,password_hash,display_name)
  values('${accountId}','live-${accountId}@example.com','x','Live Tester')`);
const session = randomUUID();
await store.createSession(sha256(session), { accountId, expiresAt: Date.now() + 3_600_000, forcePasswordChange: false });
const token = signToken(session, key);
// THE CLICKWRAP, TICKED. Without this the gate refuses every request below and
// the seed finishes with an empty account — and every screen the suite opens
// would be the gate rather than the screen it names. It is written directly
// rather than through the accept route because this is a fixture, not a person:
// what the route does is covered by the API suite, and what is proved in the
// browser is the account BELOW that has not ticked it.
await store.recordLegalAcceptances(accountId, acceptanceEntries());

// The origin the API is configured to accept. Sending anything else means every
// write is refused by the origin guard and the seed finishes with nothing in it
// — silently, because a refusal still answers.
const origin = (process.env.PUBLIC_ALLOWED_ORIGINS ?? '').split(',')[0].trim();

const send = async (method, path, body) => {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  req.method = method;
  req.url = `/public/v1${path}`;
  req.headers = {
    origin, 'x-vts-public-csrf': '1',
    'x-forwarded-for': '127.0.0.1', cookie: `${PUBLIC_SESSION_COOKIE}=${encodeURIComponent(token)}`,
  };
  req.socket = { remoteAddress: '127.0.0.1' };
  let status = 0;
  let payload = '';
  const res = { writeHead(code) { status = code; return res; }, end(chunk) { payload = chunk ?? ''; } };
  await handleRequest(req, res, { store, market });
  const parsed = JSON.parse(payload || '{}');
  // Loudly, so a seed that produced nothing cannot be mistaken for a screen
  // that rendered nothing.
  if (status >= 400) throw new Error(`seed ${method} ${path} → ${status} ${JSON.stringify(parsed)}`);
  return parsed;
};
const get = (path) => send('GET', path);
const post = (path, body) => send('POST', path, body ?? {});
const del = (path) => send('DELETE', path);

const now = Date.now();
await post('/trades', {
  instrument: 'EUR/USD', side: 'long', status: 'closed', entryPrice: 1.10, exitPrice: 1.1142,
  units: 20_000, realizedPl: 284, strategy: 'London reversal',
  openedAt: now - 3 * 86_400_000, closedAt: now - 3 * 86_400_000 + 3_600_000,
});
await post('/trades', {
  instrument: 'XAU/USD', side: 'short', status: 'open', entryPrice: 4_601.5, units: 3, openedAt: now - 7_200_000,
});
const book = await post('/funded', { label: 'FTP 200k', platform: 'Funded Trading Plus', startingBalance: 200_000, commissionPerLot: 7 });
await post(`/funded/${book.accounts[0].id}/trades`, {
  instrument: 'NAS100', side: 'short', units: 2, entryPrice: 19_402, exitPrice: 19_302,
  realizedPl: 200, openedAt: now - 86_400_000, closedAt: now - 82_800_000,
});
const category = await post('/budget/categories', { name: 'Groceries', kind: 'expense', monthlyLimit: 600 });
await post('/budget/entries', { categoryId: category.categories[0].id, amount: 42.15, note: 'weekly shop' });
await post('/net-worth/items', { kind: 'asset', category: 'cash', label: 'Checking', value: 8_400 });
await post('/net-worth/items', { kind: 'liability', category: 'credit_card', label: 'Card', value: 1_450 });
await post('/notes', { kind: 'observation', title: 'Thin liquidity into the close', body: 'Spreads widened after 15:45.' });
await post('/studies/decks', {
  name: 'Market terminology',
  questions: [1, 2, 3].map((n) => ({
    topic: 'Terms', stem: `What does term ${n} mean?`, answer: 'A',
    options: ['A', 'B', 'C', 'D'].map((label) => ({ label, text: `Answer ${label}` })),
  })),
});
await post('/studies/flashcards', { name: 'Basics', cards: [{ term: 'Bid', def: 'What a buyer will pay', topic: 'Terms' }] });
await post('/studies/guides', { name: 'Spreads', slides: [{ title: 'What a spread is', body: 'The gap between bid and ask.' }] });
await post('/support/bugs', { body: 'The chart tile does not resize below 400px.' });

// Investments. Seeded LAST because the three screens that read it — Contributions,
// Dividends and Performance — read routes of their own rather than the portfolio
// payload, and every one of them rendered empty for a real account until they
// existed. A blank screen is what this whole file is here to tell apart from a
// screen that could not read its answer.
const invest = await post('/investments/accounts', { label: 'Roth IRA', kind: 'roth_ira', cashBalance: 0 });
const fund = await post('/investments/holdings', {
  investmentAccountId: invest.id, symbol: 'VOO', name: 'S&P 500 ETF',
  assetClass: 'us_stock', quantity: 12, manualPrice: 512.40,
});
const taxYear = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric' }).format(new Date()));
await post('/investments/transactions', { investmentAccountId: invest.id, kind: 'contribution', amount: 4_200, taxYear });
await post('/investments/transactions', { investmentAccountId: invest.id, holdingId: fund.id, kind: 'dividend', amount: 63.18 });
await post('/investments/goals', { label: 'Retirement', targetAmount: 1_000_000, targetYear: 2055 });

// A to-do item and a deleted trade, so the two screens that show them have
// something to show. Both are soft-delete surfaces: "nothing here" and "the
// screen could not read its answer" look identical when a list is empty, which
// is the confusion this whole file exists to remove.
const todo = await get('/todo');
const section = todo.sections?.[0]?.id;
if (section) await post('/todo/items', { sectionId: section, text: 'Review the session plan' });

const removable = await post('/trades', {
  instrument: 'GBP/JPY', side: 'long', status: 'closed', entryPrice: 191.2, exitPrice: 190.8,
  units: 5_000, realizedPl: -140, openedAt: now - 5 * 86_400_000, closedAt: now - 5 * 86_400_000 + 1_800_000,
});
await del(`/trades/${removable.trades.find((t) => t.instrument === 'GBP/JPY').id}`);

// A SECOND session on the same account, for the sign-out test to burn. Without
// it that test consumes the one every other test signs in with, so the suite
// runs once and then fails until somebody reseeds — which is fine in CI, where
// the seed runs before each suite, and quietly maddening anywhere else.
const spare = randomUUID();
await store.createSession(sha256(spare), { accountId, expiresAt: Date.now() + 3_600_000, forcePasswordChange: false });
const spareJar = `${PUBLIC_SESSION_COOKIE}=${encodeURIComponent(signToken(spare, key))}`;

// AND AN ACCOUNT THAT HAS NOT ACCEPTED, so the browser suite can prove the gate
// actually stands in front of the terminal. It holds no records at all, which is
// the point — nothing it could reach is reachable.
const ungatedId = randomUUID();
await store.raw(`insert into public_accounts(id,email,password_hash,display_name)
  values('${ungatedId}','pending-${ungatedId}@example.com','x','Pending Tester')`);
const pending = randomUUID();
await store.createSession(sha256(pending), { accountId: ungatedId, expiresAt: Date.now() + 3_600_000, forcePasswordChange: false });
const pendingJar = `${PUBLIC_SESSION_COOKIE}=${encodeURIComponent(signToken(pending, key))}`;

await store.close();


const jar = `${PUBLIC_SESSION_COOKIE}=${encodeURIComponent(token)}`;
// `--cookie` prints the cookie and nothing else, so a shell can capture it
// without parsing JSON inline — which in a workflow file means quoting a node
// one-liner inside YAML, and that is a thing that breaks silently.
console.log(process.argv.includes('--cookie') ? `${jar}\n${spareJar}\n${pendingJar}` : JSON.stringify({ accountId, cookie: jar, spareCookie: spareJar, pendingCookie: pendingJar, token }));
