import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';

// Trading Notes is a record rather than a diary, and three rules are what make
// the difference. Each of them fails SILENTLY if it regresses — a locked call
// that edits leaves no trace, an unsettleable call folded into the misses just
// makes the hit rate lower, and a leaked note looks like any other note — so
// each has a test here rather than a comment somewhere.
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
const notes = await import('../src/notes.js');

async function signedIn(store: InstanceType<typeof MemoryPublicStore>, name = 'Person') {
  const accountId = randomUUID();
  store.addAccount({
    id: accountId, email: `${accountId}@example.com`, passwordHash: 'x', displayName: name,
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

// A window that has not opened yet, so the call is still editable.
const future = () => {
  const opensAt = Date.now() + 86_400_000;
  return { windowOpensAt: opensAt, deadlineAt: opensAt + 86_400_000 };
};
// A window that opened yesterday and is already past its deadline.
const past = () => {
  const opensAt = Date.now() - 2 * 86_400_000;
  return { windowOpensAt: opensAt, deadlineAt: opensAt + 86_400_000 };
};

// ---- Rule 1: a call is frozen once its window has opened --------------------

test('the call can be rewritten before its window opens and not after', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);

  const open = await call(store, 'POST', '/public/v1/notes', me.token,
    { kind: 'prediction', title: 'EURUSD higher', instrument: 'EUR/USD', direction: 'up', confidence: 4, ...future() });
  assert.equal(open.status, 201);
  assert.equal(open.body.note.locked, false);
  const edited = await call(store, 'PATCH', `/public/v1/notes/${open.body.note.id}`, me.token, { direction: 'down' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.note.direction, 'down');

  const started = await call(store, 'POST', '/public/v1/notes', me.token,
    { kind: 'prediction', title: 'Gold higher', instrument: 'XAU/USD', direction: 'up', ...past() });
  assert.equal(started.body.note.locked, true, 'a window that has opened freezes the call');
  const refused = await call(store, 'PATCH', `/public/v1/notes/${started.body.note.id}`, me.token, { direction: 'down' });
  assert.equal(refused.status, 409);
  // And the refusal is real: the stored call is untouched.
  const after = await call(store, 'GET', '/public/v1/notes', me.token);
  const still = after.body.week.notes.find((n: any) => n.id === started.body.note.id);
  assert.equal(still.direction, 'up');
});

test('a locked call can still be reflected on, which is the one thing that stays open', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const made = await call(store, 'POST', '/public/v1/notes', me.token,
    { kind: 'prediction', title: 'Locked call', direction: 'up', ...past() });
  const reflected = await call(store, 'POST', `/public/v1/notes/${made.body.note.id}/reflect`, me.token,
    { reflection: 'Sized it too small.' });
  assert.equal(reflected.status, 200);
  assert.equal(reflected.body.note.reflection, 'Sized it too small.');
  // Looking back is something you do more than once, so it rewrites.
  const again = await call(store, 'POST', `/public/v1/notes/${made.body.note.id}/reflect`, me.token,
    { reflection: 'Actually the entry was the problem.' });
  assert.equal(again.body.note.reflection, 'Actually the entry was the problem.');
});

test('a verdict is given once and cannot be revised afterwards', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const made = await call(store, 'POST', '/public/v1/notes', me.token,
    { kind: 'prediction', title: 'Called it', direction: 'up', ...past() });
  const settled = await call(store, 'POST', `/public/v1/notes/${made.body.note.id}/settle`, me.token, { outcome: 'miss' });
  assert.equal(settled.status, 200);
  assert.equal(settled.body.note.outcome, 'miss');
  assert.equal(settled.body.note.settledBy, 'self');
  const revised = await call(store, 'POST', `/public/v1/notes/${made.body.note.id}/settle`, me.token, { outcome: 'hit' });
  assert.equal(revised.status, 400, 'settling twice would let a verdict be revised after the fact');
});

test('an observation carries no window, is never locked and is never settled', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const made = await call(store, 'POST', '/public/v1/notes', me.token,
    { kind: 'observation', title: 'Thin liquidity into the close', body: 'Spreads widened after 15:45.' });
  assert.equal(made.status, 201);
  assert.equal(made.body.note.windowOpensAt, null);
  assert.equal(made.body.note.deadlineAt, null);
  assert.equal(made.body.note.locked, false);
  assert.equal(made.body.note.awaiting, null, 'an observation asks nothing of anyone');
  const refused = await call(store, 'POST', `/public/v1/notes/${made.body.note.id}/settle`, me.token, { outcome: 'hit' });
  assert.equal(refused.status, 400);
  // An observation stays editable forever, which is the point of it not being a call.
  const edited = await call(store, 'PATCH', `/public/v1/notes/${made.body.note.id}`, me.token, { title: 'Thin into the close' });
  assert.equal(edited.status, 200);
});

// ---- Rule 2: a call that could not be settled is never scored as wrong ------

test('unsettleable is counted on its own and kept out of the hit rate', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const settle = async (outcome: string) => {
    const made = await call(store, 'POST', '/public/v1/notes', me.token,
      { kind: 'prediction', title: `A ${outcome} call`, direction: 'up', confidence: 3, ...past() });
    await call(store, 'POST', `/public/v1/notes/${made.body.note.id}/settle`, me.token, { outcome });
  };
  await settle('hit');
  await settle('miss');
  await settle('unsettleable');
  await settle('unsettleable');
  await settle('partial');

  const { stats } = (await call(store, 'GET', '/public/v1/notes', me.token)).body;
  assert.equal(stats.scored, 2, 'only the hits and misses count');
  assert.equal(stats.hits, 1);
  assert.equal(stats.misses, 1, 'the two unsettleable calls are NOT misses');
  assert.equal(stats.unsettleable, 2);
  assert.equal(stats.partial, 1);
  assert.equal(stats.hitRate, 50, 'four ungradeable calls do not drag a 50% record down');
});

test('nothing scored reports no hit rate at all, never zero', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const made = await call(store, 'POST', '/public/v1/notes', me.token,
    { kind: 'prediction', title: 'Could not be graded', direction: 'up', ...past() });
  await call(store, 'POST', `/public/v1/notes/${made.body.note.id}/settle`, me.token, { outcome: 'unsettleable' });
  const { stats } = (await call(store, 'GET', '/public/v1/notes', me.token)).body;
  assert.equal(stats.hitRate, null, 'a 0 here would read as "all wrong"');
  assert.equal(stats.scored, 0);
  assert.equal(stats.unsettleable, 1);
});

test('the record is calibration: what you said beside how often you were right', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const settle = async (confidence: number, outcome: string) => {
    const made = await call(store, 'POST', '/public/v1/notes', me.token,
      { kind: 'prediction', title: 'Call', direction: 'up', confidence, ...past() });
    await call(store, 'POST', `/public/v1/notes/${made.body.note.id}/settle`, me.token, { outcome });
  };
  await settle(5, 'miss'); await settle(5, 'miss'); await settle(5, 'hit');
  await settle(2, 'hit'); await settle(2, 'hit');

  const { stats } = (await call(store, 'GET', '/public/v1/notes', me.token)).body;
  const at = (level: number) => stats.calibration.find((r: any) => r.level === level);
  // Said 95% sure, right a third of the time. That gap is the whole feature.
  assert.deepEqual(at(5), { level: 5, stated: 95, calls: 3, hits: 1 });
  assert.deepEqual(at(2), { level: 2, stated: 65, calls: 2, hits: 2 });
  assert.deepEqual(stats.calibration.map((r: any) => r.level), [2, 5], 'ordered by level');
});

test('a confidence outside 1-5 is read as unstated rather than clamped', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  // Clamping would put a call in a calibration bucket its author never chose.
  for (const confidence of [0, 9, -3, 'high']) {
    const made = await call(store, 'POST', '/public/v1/notes', me.token,
      { kind: 'prediction', title: 'Call', direction: 'up', confidence, ...past() });
    assert.equal(made.body.note.confidence, null, `${confidence} is not a level`);
  }
});

// ---- Rule 3: a note is the author's own, and nothing can publish one --------

test('one account never reads another account’s calls', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store, 'Me');
  const other = await signedIn(store, 'Someone else');
  const theirs = await call(store, 'POST', '/public/v1/notes', other.token,
    { kind: 'prediction', title: 'Their call', direction: 'down', ...past() });

  const mine = await call(store, 'GET', '/public/v1/notes', me.token);
  assert.deepEqual(mine.body.week.notes, []);
  assert.equal(mine.body.stats.open + mine.body.stats.scored, 0);

  // And an id from another account is 404, not 403 — a refusal that named the
  // difference would let ids be probed for.
  for (const attempt of [
    call(store, 'PATCH', `/public/v1/notes/${theirs.body.note.id}`, me.token, { title: 'Mine now' }),
    call(store, 'POST', `/public/v1/notes/${theirs.body.note.id}/settle`, me.token, { outcome: 'hit' }),
    call(store, 'DELETE', `/public/v1/notes/${theirs.body.note.id}`, me.token),
  ]) assert.equal((await attempt).status, 404);

  // Untouched.
  const still = await call(store, 'GET', '/public/v1/notes', other.token);
  assert.equal(still.body.week.notes.length, 1);
  assert.equal(still.body.week.notes[0].title, 'Their call');
});

test('there is no route that can publish a call', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const made = await call(store, 'POST', '/public/v1/notes', me.token,
    { kind: 'prediction', title: 'Private by construction', direction: 'up', ...future(), visibility: 'group' });
  // The private side's publish route does not exist here, and a `visibility`
  // sent by a client cannot make one public — there is no such column.
  assert.equal(made.body.note.visibility, 'private');
  const attempt = await call(store, 'POST', `/public/v1/notes/${made.body.note.id}/visibility`, me.token, { visibility: 'group' });
  assert.equal(attempt.status, 404);
});

test('every note route needs a session', async () => {
  const store = new MemoryPublicStore();
  for (const attempt of [
    call(store, 'GET', '/public/v1/notes'),
    call(store, 'POST', '/public/v1/notes', undefined, { kind: 'prediction', title: 'x' }),
    call(store, 'DELETE', `/public/v1/notes/${randomUUID()}`),
  ]) assert.equal((await attempt).status, 401);
});

// ---- The board, the queue, and the week ------------------------------------

test('the queue is what is still owed an answer, soonest deadline first', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const opensAt = Date.now() - 5 * 86_400_000;
  const overdue = async (days: number, title: string) => (await call(store, 'POST', '/public/v1/notes', me.token,
    { kind: 'prediction', title, direction: 'up', windowOpensAt: opensAt, deadlineAt: opensAt + days * 86_400_000 })).body.note;

  const later = await overdue(3, 'Later deadline');
  const sooner = await overdue(1, 'Sooner deadline');
  // Still running, so it owes nothing yet.
  await call(store, 'POST', '/public/v1/notes', me.token,
    { kind: 'prediction', title: 'Still running', direction: 'up', ...future() });

  let queue = (await call(store, 'GET', '/public/v1/notes', me.token)).body.queue;
  assert.deepEqual(queue.map((n: any) => n.title), ['Sooner deadline', 'Later deadline']);
  assert.deepEqual(queue.map((n: any) => n.awaiting), ['settle', 'settle']);

  // Settling moves it along rather than out: it now owes a reflection.
  await call(store, 'POST', `/public/v1/notes/${sooner.id}/settle`, me.token, { outcome: 'hit' });
  queue = (await call(store, 'GET', '/public/v1/notes', me.token)).body.queue;
  assert.equal(queue.find((n: any) => n.id === sooner.id).awaiting, 'reflect');

  // Reflecting is what clears it.
  await call(store, 'POST', `/public/v1/notes/${sooner.id}/settle`, me.token, { outcome: 'hit' });
  await call(store, 'POST', `/public/v1/notes/${sooner.id}/reflect`, me.token, { reflection: 'Held it too long.' });
  queue = (await call(store, 'GET', '/public/v1/notes', me.token)).body.queue;
  assert.deepEqual(queue.map((n: any) => n.id), [later.id]);
});

test('settling with a reflection in one press clears the queue outright', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const made = await call(store, 'POST', '/public/v1/notes', me.token,
    { kind: 'prediction', title: 'One press', direction: 'up', ...past() });
  const settled = await call(store, 'POST', `/public/v1/notes/${made.body.note.id}/settle`, me.token,
    { outcome: 'hit', reflection: 'Read the level right.' });
  assert.equal(settled.body.note.awaiting, null);
  assert.equal((await call(store, 'GET', '/public/v1/notes', me.token)).body.queue.length, 0);
});

test('the board shows one week and can be walked backwards', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const thisWeek = notes.etWeekKey();
  const lastWeek = notes.shiftWeekKey(thisWeek, -1);
  await call(store, 'POST', '/public/v1/notes', me.token, { kind: 'prediction', title: 'This week', direction: 'up', weekKey: thisWeek });
  await call(store, 'POST', '/public/v1/notes', me.token, { kind: 'prediction', title: 'Last week', direction: 'up', weekKey: lastWeek });

  const current = (await call(store, 'GET', '/public/v1/notes', me.token)).body.week;
  assert.equal(current.weekKey, thisWeek);
  assert.equal(current.isCurrent, true);
  assert.deepEqual(current.notes.map((n: any) => n.title), ['This week']);

  const previous = (await call(store, 'GET', `/public/v1/notes?week=${current.prevWeek}`, me.token)).body.week;
  assert.equal(previous.weekKey, lastWeek);
  assert.equal(previous.isCurrent, false);
  assert.deepEqual(previous.notes.map((n: any) => n.title), ['Last week']);
  assert.equal(previous.nextWeek, thisWeek, 'the walk is reversible');

  // The record spans every week, not just the one on screen.
  assert.equal((await call(store, 'GET', `/public/v1/notes?week=${lastWeek}`, me.token)).body.stats.open, 2);
});

test('an unusable week key falls back to this week rather than an empty board', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  await call(store, 'POST', '/public/v1/notes', me.token, { kind: 'prediction', title: 'Here', direction: 'up' });
  for (const bad of ['nonsense', '2026-34', '', '2026-W3']) {
    const week = (await call(store, 'GET', `/public/v1/notes?week=${encodeURIComponent(bad)}`, me.token)).body.week;
    assert.equal(week.weekKey, notes.etWeekKey());
    assert.equal(week.notes.length, 1);
  }
});

test('a note needs a title and a prediction has to settle after it opens', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  assert.equal((await call(store, 'POST', '/public/v1/notes', me.token, { kind: 'prediction', title: '  ' })).status, 400);
  const opensAt = Date.now() + 86_400_000;
  const backwards = await call(store, 'POST', '/public/v1/notes', me.token,
    { kind: 'prediction', title: 'Backwards', direction: 'up', windowOpensAt: opensAt, deadlineAt: opensAt - 3_600_000 });
  assert.equal(backwards.status, 400);
});

test('nothing on the public side claims a call will settle itself', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  // On the private side an instrument + direction + target is enough for the
  // price feed to grade it. There is no feed here, and saying otherwise would
  // leave a trader waiting on a verdict that never arrives.
  const made = await call(store, 'POST', '/public/v1/notes', me.token,
    { kind: 'prediction', title: 'Fully structured', instrument: 'EUR/USD', direction: 'up', targetPrice: 1.2, ...past() });
  assert.equal(made.body.note.autoSettles, false);
  assert.equal(made.body.note.openPrice, null);
  assert.equal(made.body.note.awaiting, 'settle', 'its author is the one who settles it');
});

test('did-you-trade-your-own-call reports no matches rather than inventing them', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  await call(store, 'POST', '/public/v1/notes', me.token, { kind: 'prediction', title: 'Call', instrument: 'EUR/USD', direction: 'up', ...past() });
  assert.deepEqual((await call(store, 'GET', '/public/v1/notes', me.token)).body.tradeLinks, []);
});

test('a week is capped, and the cap is per week rather than per account', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const thisWeek = notes.etWeekKey();
  for (let i = 0; i < notes.MAX_PER_WEEK; i += 1) {
    assert.equal((await call(store, 'POST', '/public/v1/notes', me.token, { kind: 'observation', title: `Note ${i}`, weekKey: thisWeek })).status, 201);
  }
  assert.equal((await call(store, 'POST', '/public/v1/notes', me.token, { kind: 'observation', title: 'One too many', weekKey: thisWeek })).status, 400);
  // Next week is its own budget.
  assert.equal((await call(store, 'POST', '/public/v1/notes', me.token, { kind: 'observation', title: 'Next week', weekKey: notes.shiftWeekKey(thisWeek, 1) })).status, 201);
});

test('deleting takes the note out of the board and out of the record', async () => {
  const store = new MemoryPublicStore();
  const me = await signedIn(store);
  const made = await call(store, 'POST', '/public/v1/notes', me.token, { kind: 'prediction', title: 'Gone', direction: 'up', ...future() });
  assert.equal((await call(store, 'DELETE', `/public/v1/notes/${made.body.note.id}`, me.token)).status, 200);
  const after = await call(store, 'GET', '/public/v1/notes', me.token);
  assert.deepEqual(after.body.week.notes, []);
  assert.equal(after.body.stats.open, 0);
  assert.equal((await call(store, 'DELETE', `/public/v1/notes/${made.body.note.id}`, me.token)).status, 404);
});

// ---- The Eastern week boundary ---------------------------------------------

test('a week key is Eastern and Monday-based, so Sunday evening is not next week', async () => {
  // 00:30 UTC on Monday is 20:30 the previous SUNDAY in New York, so it belongs
  // to the week that is ending. Derived in the reader's own zone this call would
  // move between weeks the moment somebody changed their display zone.
  assert.equal(notes.etWeekKey(new Date('2026-08-24T00:30:00Z')), notes.etWeekKey(new Date('2026-08-21T15:00:00Z')));
  // And by lunchtime Monday Eastern it is the new week.
  assert.notEqual(notes.etWeekKey(new Date('2026-08-24T16:00:00Z')), notes.etWeekKey(new Date('2026-08-21T15:00:00Z')));
});

test('the default window runs Monday 09:30 to Friday 16:00 Eastern, across DST', async () => {
  for (const weekKey of ['2026-01-12', '2026-07-13'].map((d) => notes.etWeekKey(new Date(`${d}T17:00:00Z`)))) {
    const { opensAt, deadlineAt } = notes.defaultWindow(weekKey);
    // Read from the PARTS rather than the formatted string: the separator an
    // ICU build puts between the weekday and the time varies, and asserting on
    // it makes this fail for a reason that has nothing to do with the window.
    const et = (ms: number) => {
      const parts = new Intl.DateTimeFormat('en-US',
        { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
        .formatToParts(new Date(ms));
      const get = (type: string) => parts.find((p) => p.type === type)?.value;
      return `${get('weekday')} ${get('hour')}:${get('minute')}`;
    };
    assert.equal(et(opensAt), 'Mon 09:30');
    assert.equal(et(deadlineAt), 'Fri 16:00');
    const range = notes.weekRange(weekKey);
    assert.ok(range.startsOn < range.endsOn);
  }
});

test('shifting a week key is reversible across a year boundary', async () => {
  const key = notes.etWeekKey(new Date('2026-01-02T17:00:00Z'));
  assert.equal(notes.shiftWeekKey(notes.shiftWeekKey(key, -1), 1), key);
  assert.equal(notes.shiftWeekKey(notes.shiftWeekKey(key, -5), 5), key);
});

// ---- Grading, for when a feed is wired --------------------------------------

test('an unchanged price is a MISS on an up call', async () => {
  // The market did not do what was called. Rounding that to a hit would flatter
  // every call that went nowhere.
  const call_ = { direction: 'up' as const, targetPrice: null, openPrice: 1.1 };
  assert.equal(notes.gradeCall(call_, 1.1).outcome, 'miss');
  assert.equal(notes.gradeCall(call_, 1.1001).outcome, 'hit');
  assert.equal(notes.gradeCall({ ...call_, direction: 'down' }, 1.1).outcome, 'miss');
  assert.equal(notes.gradeCall({ ...call_, direction: 'down' }, 1.0999).outcome, 'hit');
});

test('a named target is measured AT the level, and no reference is unsettleable', async () => {
  // Reaching the level you named is hitting it, so the comparison is inclusive.
  assert.equal(notes.gradeCall({ direction: 'up', targetPrice: 1.2, openPrice: 1.1 }, 1.2).outcome, 'hit');
  assert.equal(notes.gradeCall({ direction: 'down', targetPrice: 1.0, openPrice: 1.1 }, 1.0).outcome, 'hit');
  // Nothing to measure against is never a miss — see rule 2.
  assert.equal(notes.gradeCall({ direction: 'up', targetPrice: null, openPrice: null }, 1.1).outcome, 'unsettleable');
  assert.equal(notes.gradeCall({ direction: null, targetPrice: null, openPrice: 1.1 }, 1.2).outcome, 'unsettleable');
});
