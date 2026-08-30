#!/usr/bin/env node
// Does the client adapter's idea of a route match the server's?
//
// `publicApi.ts` names around seventy paths and `server.ts` serves them, and
// until this existed the two had never been run together. Both are written by
// hand, so one wrong word in a path is a 404 at runtime on a screen that looks
// broken — and nothing anywhere would have said so: the adapter is not
// typechecked against the routes, the demo never reaches them, and the API's own
// tests call the server directly with paths written a second time in the test
// file.
//
// So this reads the paths OUT OF THE ADAPTER, fills their template holes with
// ids that exist, and calls each one against a real server on a real database.
// What is checked is only "does this route exist" — a 404 carrying the server's
// route-not-found message. Every other status is fine: a 400 means the route is
// there and did not like an empty body, which is a different question and one
// the API's own tests already answer.
//
// Run: PUBLIC_TEST_DATABASE_URL=... node scripts/verify-public-wiring.mjs
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';

const url = process.env.PUBLIC_TEST_DATABASE_URL;
if (!url) {
  console.log('Public wiring: skipped (set PUBLIC_TEST_DATABASE_URL).');
  process.exit(0);
}

const key = 'a'.repeat(48);
Object.assign(process.env, {
  PUBLIC_DATABASE_URL: url,
  PUBLIC_SESSION_SIGNING_KEY: key,
  PUBLIC_CHALLENGE_PEPPER: key,
  PUBLIC_TRUSTED_DEVICE_SIGNING_KEY: key,
  PUBLIC_ALLOWED_ORIGINS: 'https://public.example.com',
  PUBLIC_COOKIE_SECURE: 'true',
  PUBLIC_MAIL_FROM: 'no-reply@example.com',
  PUBLIC_SMTP_URL: 'smtp://127.0.0.1:1025',
});

const { handleRequest, PUBLIC_SESSION_COOKIE } = await import('../apps/public-api/dist/src/server.js');
const { PostgresPublicStore } = await import('../apps/public-api/dist/src/postgresStore.js');
const { signToken, sha256 } = await import('../apps/public-api/dist/src/security.js');
const { acceptanceEntries } = await import('../apps/public-api/dist/src/legalDocuments.js');

const store = new PostgresPublicStore(url);
const accountId = randomUUID();
await store.raw(`insert into public_accounts(id,email,password_hash,display_name)
  values('${accountId}','wiring-${accountId}@example.com','x','Wiring')`);
const session = randomUUID();
await store.createSession(sha256(session), { accountId, expiresAt: Date.now() + 3_600_000, forcePasswordChange: false });
const token = signToken(session, key);
// THE CLICKWRAP, TICKED. Without it every authenticated route answers 403 —
// which is not a 404, so this check would go green having proved nothing at all
// about the paths, and the seeds below would silently create none of the rows
// the template holes are filled from. The `seed` helper asserts its own status
// for the same reason.
await store.recordLegalAcceptances(accountId, acceptanceEntries());

const market = { marketData: async () => ({}), marketNews: async () => ({}) };

function send(method, path, body) {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  req.method = method;
  req.url = `/public/v1${path}`;
  req.headers = {
    origin: 'https://public.example.com',
    'x-vts-public-csrf': '1',
    'x-forwarded-for': '203.0.113.7',
    cookie: `${PUBLIC_SESSION_COOKIE}=${encodeURIComponent(token)}`,
  };
  req.socket = { remoteAddress: '203.0.113.7' };
  let status = 0;
  let payload = '';
  const res = { writeHead(code) { status = code; return res; }, end(chunk) { payload = chunk ?? ''; } };
  return handleRequest(req, res, { store, market }).then(() => ({
    status,
    body: payload ? JSON.parse(payload) : {},
  }));
}

// The paths, read out of the adapter rather than written here a second time — a
// copy would drift, and a drifted copy would be checking itself.
const adapter = readFileSync('apps/public-terminal/src/adapters/publicApi.ts', 'utf8');
const live = adapter.slice(adapter.indexOf('const liveRecords'));
const pattern = /publicRequest(?:<[^>]*>)?\(\s*(`[^`]*`|'[^']*')\s*(?:,\s*\{\s*method:\s*'([A-Z]+)')?/g;
const calls = [...live.matchAll(pattern)];
if (calls.length < 40) {
  throw new Error(`Only ${calls.length} adapter calls found — the reader is not matching what it should.`);
}

// A template hole stands for an id, and an id that does not exist would 404 for
// a reason that has nothing to do with wiring. So each hole is filled with an id
// that IS there.
const seeded = {};
const seed = async (name, method, path, body) => {
  // A seed that quietly fails leaves its template hole undefined, and every
  // path carrying that hole is then checked against a URL with "undefined" in
  // it — which still is not a 404, so the whole check degrades to nothing
  // without a word. It has to be loud.
  const result = await send(method, path, body);
  if (result.status >= 300) {
    console.error(`FAIL seeding "${name}" (${method} ${path}) answered ${result.status}: ${result.body.message ?? ''}`);
    process.exit(1);
  }
  seeded[name] = result.body;
};

const question = (n) => ({
  topic: 'Wiring',
  stem: `Question ${n}?`,
  answer: 'A',
  options: ['A', 'B', 'C', 'D'].map((label) => ({ label, text: label })),
});

await seed('budget', 'POST', '/budget/categories', { name: `W${Date.now()}`, kind: 'expense', monthlyLimit: 1 });
await seed('todo', 'GET', '/todo');
await seed('inv', 'POST', '/investments/accounts', { label: 'Wiring', kind: 'brokerage', cashBalance: 1 });
await seed('nw', 'POST', '/net-worth/items', { kind: 'asset', category: 'cash', label: 'Wiring', value: 1 });
await seed('note', 'POST', '/notes', { kind: 'observation', title: 'Wiring' });
await seed('deck', 'POST', '/studies/decks', { name: 'Wiring', questions: [question(1)] });
await seed('set', 'POST', '/studies/flashcards', { name: 'Wiring', cards: [{ term: 'a', def: 'b' }] });
await seed('guide', 'POST', '/studies/guides', { name: 'Wiring', slides: [{ title: 'a', body: 'b' }] });
await seed('bug', 'POST', '/support/bugs', { body: 'Wiring' });
await seed('trade', 'POST', '/trades', { instrument: 'EUR/USD', side: 'long', status: 'open', entryPrice: 1, units: 1 });
await seed('book', 'POST', '/funded', { label: 'Wiring', startingBalance: 1 });

const ids = {
  '/budget/categories/': seeded.budget.categories?.[0]?.id,
  '/budget/entries/': randomUUID(),
  '/todo/items/': seeded.todo.sections?.[0]?.items?.[0]?.id,
  '/investments/accounts/': seeded.inv.id,
  '/investments/holdings/': randomUUID(),
  '/investments/transactions/': randomUUID(),
  '/investments/goals/': randomUUID(),
  '/net-worth/items/': seeded.nw.assets?.[0]?.id,
  '/notes/': seeded.note.note?.id,
  '/studies/decks/': seeded.deck.deck?.id,
  '/studies/flashcards/': seeded.set.set?.id,
  '/studies/guides/': seeded.guide.guide?.id,
  '/support/bugs/': seeded.bug.report?.id,
  '/trades/': seeded.trade.trades?.[0]?.id,
  '/funded/': seeded.book.accounts?.[0]?.id,
};

const HOLE = '\u0001';
const failures = [];
const seenPaths = new Set();
for (const [, raw, method = 'GET'] of calls) {
  let path = raw.slice(1, -1);
  // A hole straight after a `/` is an ID. A hole anywhere else is something the
  // adapter APPENDS — a query string — and is no part of the route, so filling
  // it with an id invents a path nobody ever requests.
  path = path.replace(/\/\$\{[^}]*\}/g, `/${HOLE}`).replace(/\$\{[^}]*\}/g, '');
  if (!path.startsWith('/')) continue;
  // The proxy's own fallback, which is NOT a route and is meant to 404: a name
  // nothing answers goes to `/records/<name>` so the failure says the feature
  // has no public storage yet, rather than the screen quietly rendering nothing.
  if (path.startsWith('/records/')) continue;
  const prefix = Object.keys(ids).find((candidate) => path.startsWith(candidate));
  path = path.split(HOLE).join(prefix ? (ids[prefix] ?? randomUUID()) : randomUUID());
  path = path.split('?')[0];

  const result = await send(method, path, method === 'GET' || method === 'DELETE' ? undefined : {});
  seenPaths.add(`${method} ${path}`);
  // ONLY a route-not-found counts. A 400 means the route is there and did not
  // like an empty body, which is a different question entirely.
  if (result.status === 404 && /route not found/i.test(String(result.body.message ?? ''))) {
    failures.push(`${method} ${path}`);
  }
}

await store.raw(`delete from public_accounts where id='${accountId}'`);
await store.close();

if (failures.length > 0) {
  console.error('FAIL the adapter names routes the server does not serve:\n');
  for (const line of failures) console.error(`  ${line}`);
  console.error('\nOne wrong word in publicApi.ts is a 404 on a screen that looks broken.');
  process.exit(1);
}
console.log(`Public wiring: ${seenPaths.size} adapter paths, every one served.`);
