import assert from 'node:assert/strict';
import { maintenanceNotice, noteResponse, subscribeMaintenance } from './maintenance.js';

// The client half of maintenance mode. Its failures are the quiet kind: the
// card either never appears on the devices it was written for, or — worse —
// never goes away, and the terminal stays closed on somebody's phone after it
// has reopened for everybody else.

const closed = () => JSON.stringify({
  error: 'maintenance',
  title: 'Closed',
  message: 'Back soon.',
  demoUrl: 'https://demo.example.com/x',
  demoNote: 'Sample data.',
});

const send = (status: number, body: string | object | null) =>
  noteResponse(status, typeof body === 'string' ? JSON.parse(body) : body);

const checks: Array<[string, () => void]> = [
  ['a maintenance 503 closes the app, and says what the server said', () => {
    send(200, { ok: true });
    assert.equal(maintenanceNotice(), null, 'a normal response must leave the app open');
    send(503, closed());
    const notice = maintenanceNotice();
    assert.ok(notice, 'the card must appear');
    // The words are the SERVER'S, not a copy kept here — that is what stops the
    // served page and this card drifting into saying different things.
    assert.equal(notice.title, 'Closed');
    assert.equal(notice.message, 'Back soon.');
    assert.equal(notice.demoUrl, 'https://demo.example.com/x');
    assert.equal(notice.demoNote, 'Sample data.');
    send(200, { ok: true });
  }],

  ['ANY answer from the server reopens it, not only a successful one', () => {
    // THE ONE THAT TRAPS SOMEBODY. This card replaces every other screen, so
    // nothing else is left running to notice the terminal reopening — it polls
    // `me`, which answers 401 for a signed-out session. Reading that as "still
    // closed" would leave the card up for good.
    send(503, closed());
    assert.ok(maintenanceNotice(), 'precondition: closed');
    send(401, { error: 'Not signed in' });
    assert.equal(maintenanceNotice(), null, 'a 401 is the server working, and must reopen the app');

    for (const [status, body] of [[402, { error: 'upgrade' }], [423, { error: 'paused' }], [500, { error: 'boom' }]] as const) {
      send(503, closed());
      send(status, body);
      assert.equal(maintenanceNotice(), null, `${status} must reopen the app`);
    }
  }],

  ['only a 503 that names itself closes the app', () => {
    // A platform 503 during a deploy, a gateway page, a bare body — none of
    // those is the terminal saying it is closed, and treating them as one would
    // put this card up in front of an ordinary blip.
    for (const body of [null, { error: 'Bad Gateway' }, 'upstream unavailable', { message: 'maintenance' }]) {
      send(200, { ok: true });
      noteResponse(503, body);
      assert.equal(maintenanceNotice(), null, `a 503 with ${JSON.stringify(body)} must not close the app`);
    }
    // ...and a maintenance body on a 200 is not a refusal either.
    send(200, JSON.parse(closed()));
    assert.equal(maintenanceNotice(), null, 'a 200 is a 200');
  }],

  ['a missing or hostile field falls back rather than reaching the card', () => {
    // A client cached from before the server sent these still has to draw
    // something readable.
    send(200, { ok: true });
    noteResponse(503, { error: 'maintenance' });
    const bare = maintenanceNotice();
    assert.ok(bare && bare.title.length > 0 && bare.message.length > 0, 'the card must never be blank');
    assert.match(bare.demoUrl, /^https:\/\//);

    // The demo link goes into an href and arrives over the network, so it gets
    // the same guard the server gives it.
    for (const hostile of ['javascript:alert(1)', 'data:text/html,<script>', 'not a url', '   ']) {
      send(200, { ok: true });
      noteResponse(503, { error: 'maintenance', demoUrl: hostile });
      assert.match(maintenanceNotice()!.demoUrl, /^https?:\/\//, `"${hostile}" must not reach the href`);
    }
    send(200, { ok: true });
  }],

  ['the app is told when it changes, and only when it changes', () => {
    let fired = 0;
    const stop = subscribeMaintenance(() => { fired += 1; });
    send(200, { ok: true });
    assert.equal(fired, 0, 'already open: nothing to redraw');
    send(503, closed());
    assert.equal(fired, 1, 'closing must redraw');
    send(401, { error: 'Not signed in' });
    assert.equal(fired, 2, 'reopening must redraw');
    // Every request passes through here, so a store that notified on each one
    // would re-render the whole terminal on every poll.
    send(200, { ok: true });
    send(200, { ok: true });
    assert.equal(fired, 2, 'an unchanged state must not redraw');
    // And the same the other way round. The card POLLS while it is up, so this
    // is the case that actually happens: a store handing out a fresh object
    // each time would re-render every thirty seconds forever.
    send(503, closed());
    assert.equal(fired, 3, 'closing must redraw');
    send(503, closed());
    send(503, closed());
    assert.equal(fired, 3, 'the same notice again must not redraw');
    // A notice that genuinely changed still does.
    send(503, JSON.stringify({ error: 'maintenance', title: 'Closed', message: 'Back at 6.' }));
    assert.equal(fired, 4, 'new wording must redraw');
    send(200, { ok: true });
    assert.equal(fired, 5);
    stop();
    send(503, closed());
    assert.equal(fired, 5, 'unsubscribing must actually unsubscribe');
    send(200, { ok: true });
  }],
];

let failed = 0;
for (const [name, run] of checks) {
  try { run(); console.log(`  ok  ${name}`); }
  catch (error) { failed += 1; console.error(`  FAIL  ${name}\n        ${error instanceof Error ? error.message : String(error)}`); }
}
if (failed > 0) { console.error(`\nMaintenance notice: ${failed} check(s) failed.`); process.exit(1); }
console.log(`Maintenance notice: ${checks.length} checks passed.`);
