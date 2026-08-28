import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';

// Reporting a bug is free on every account, and this file is mostly about
// keeping it that way: it is the channel through which somebody tells you their
// payment failed, so it must never sit behind the paid path or the AI path.
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

async function signedIn(store: InstanceType<typeof MemoryPublicStore>) {
  const accountId = randomUUID();
  store.addAccount({
    id: accountId, email: `${accountId}@example.com`, passwordHash: 'x', displayName: 'Reporter',
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

test('a bug report is filed, answers with the report, and is in the list', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  // The screen prepends `r.report` straight into the list it renders, so an
  // answer without one puts `undefined` in front of a render.
  const filed = await call(store, 'POST', '/public/v1/support/bugs', me.token,
    { body: 'The chart tile does not resize\nIt happens below 400px wide.' });
  assert.equal(filed.status, 201);
  assert.ok(filed.body.report?.id);
  assert.equal(filed.body.report.messages.length, 1);
  assert.equal(filed.body.report.messages[0].role, 'user');
  assert.equal(filed.body.report.status, 'open');
  // The summary is the FIRST LINE, capped. A reporter should not have to title
  // their own bug report, and the whole body as a title is unreadable in a list.
  assert.equal(filed.body.report.summary, 'The chart tile does not resize');

  const listed = await call(store, 'GET', '/public/v1/support/bugs', me.token);
  assert.equal(listed.body.reports.length, 1);
  assert.equal(listed.body.reports[0].id, filed.body.report.id);
});

test('a reply lands on the thread and cannot claim to be staff', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const id = (await call(store, 'POST', '/public/v1/support/bugs', me.token, { body: 'Something broke' })).body.report.id;
  const replied = await call(store, 'POST', `/public/v1/support/bugs/${id}/reply`, me.token,
    { body: 'It also happens on Safari', role: 'admin' });
  assert.equal(replied.status, 200);
  assert.equal(replied.body.report.messages.length, 2);
  // There is no admin surface on the public side, so a client must not be able
  // to post a message that renders as staff having answered.
  assert.deepEqual(replied.body.report.messages.map((m: any) => m.role), ['user', 'user']);
});

test('an empty report or reply is refused rather than filed', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  for (const body of ['', '   ', null, undefined, 42]) {
    assert.equal((await call(store, 'POST', '/public/v1/support/bugs', me.token, { body })).status, 400, JSON.stringify(body));
    assert.equal((await call(store, 'POST', '/public/v1/support/suggestions', me.token, { body })).status, 400, JSON.stringify(body));
  }
  assert.deepEqual((await call(store, 'GET', '/public/v1/support/bugs', me.token)).body.reports, []);
});

test('one account never reads or answers another account’s report', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const other = await signedIn(store);
  const id = (await call(store, 'POST', '/public/v1/support/bugs', me.token, { body: 'Mine' })).body.report.id;

  assert.deepEqual((await call(store, 'GET', '/public/v1/support/bugs', other.token)).body.reports, []);
  // 404, not 403 — an id the caller does not own must not be distinguishable
  // from one that does not exist.
  assert.equal((await call(store, 'POST', `/public/v1/support/bugs/${id}/reply`, other.token, { body: 'Hello' })).status, 404);
  assert.equal((await call(store, 'GET', '/public/v1/support/bugs', me.token)).body.reports[0].messages.length, 1);
});

test('a suggestion is recorded and answers with it', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const sent = await call(store, 'POST', '/public/v1/support/suggestions', me.token, { body: 'A dark-mode print view' });
  assert.equal(sent.status, 201);
  assert.ok(sent.body.suggestion?.id);
  assert.equal(sent.body.suggestion.status, 'new');
  // Suggestions have no thread: there is nothing to reply to until somebody acts
  // on one, and a reply channel nobody staffs is worse than none.
  assert.equal(sent.body.suggestion.body, 'A dark-mode print view');
});

test('support needs a session, and nothing else', async () => {
  const store = new MemoryPublicStore();
  for (const [method, url] of [
    ['GET', '/public/v1/support/bugs'],
    ['POST', '/public/v1/support/bugs'],
    ['POST', '/public/v1/support/suggestions'],
  ] as const) {
    assert.equal((await call(store, method, url, undefined, { body: 'x' })).status, 401, `${method} ${url}`);
  }
  // And a signed-in account reaches it with no tier, opt-in or entitlement of
  // any kind — this is the complaints channel.
  const me = await signedIn(store);
  assert.equal((await call(store, 'POST', '/public/v1/support/bugs', me.token, { body: 'Reachable' })).status, 201);
});
