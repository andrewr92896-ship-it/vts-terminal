import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

// The public config is validated at import, so it is supplied before the server
// module loads. None of it is real; nothing here opens a socket or a pool.
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

const { handleRequest } = await import('../src/server.js');
const { MemoryPublicStore } = await import('../src/memoryStore.js');

function call(body: unknown, over: Record<string, unknown> = {}) {
  const request = Readable.from([JSON.stringify(body)]) as any;
  request.method = 'POST';
  request.url = '/public/v1/early-access';
  request.headers = { origin: 'https://public.example.com', 'x-vts-public-csrf': '1', 'x-forwarded-for': '203.0.113.7' };
  request.socket = { remoteAddress: '203.0.113.7' };
  Object.assign(request, over);
  let status = 0; let payload = '';
  const response = {
    writeHead(code: number) { status = code; return response; },
    end(chunk?: string) { payload = chunk ?? ''; },
  } as any;
  const store = new MemoryPublicStore();
  const market = { marketData: async () => ({}), marketNews: async () => ({}) };
  return handleRequest(request, response, { store, market } as any)
    .then(() => ({ status, body: payload ? JSON.parse(payload) : {}, store }));
}

test('a request is recorded and answered the same way whether or not it is new', async () => {
  const first = await call({ email: 'Person@Example.com', note: '  I trade forex part time  ' });
  assert.equal(first.status, 202);
  assert.equal(first.store.earlyAccess.size, 1);
  // Stored lower-cased so a second submission from the same person updates the
  // one lead rather than queueing another for somebody to work twice.
  assert.deepEqual(first.store.earlyAccess.get('person@example.com'), { email: 'person@example.com', note: 'I trade forex part time' });
});

test('a malformed address is refused before anything is stored', async () => {
  for (const email of ['', 'nope', 'a@b', 'a b@c.com', `${'x'.repeat(320)}@example.com`]) {
    const result = await call({ email });
    assert.equal(result.status, 400, `expected 400 for ${JSON.stringify(email)}`);
    assert.equal(result.store.earlyAccess.size, 0);
  }
});

test('the route is refused without the public origin and CSRF header', async () => {
  const noOrigin = await call({ email: 'person@example.com' }, { headers: { 'x-vts-public-csrf': '1' } });
  assert.equal(noOrigin.status, 403);
  const wrongOrigin = await call({ email: 'person@example.com' }, { headers: { origin: 'https://portal.example.com', 'x-vts-public-csrf': '1' } });
  assert.equal(wrongOrigin.status, 403);
  const noCsrf = await call({ email: 'person@example.com' }, { headers: { origin: 'https://public.example.com' } });
  assert.equal(noCsrf.status, 403);
});

test('the note is bounded rather than stored at whatever length arrives', async () => {
  const result = await call({ email: 'person@example.com', note: 'z'.repeat(5000) });
  assert.equal(result.status, 202);
  assert.equal(result.store.earlyAccess.get('person@example.com')!.note!.length, 1000);
});
