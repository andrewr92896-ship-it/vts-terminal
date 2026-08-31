import assert from 'node:assert/strict';
import { classifyRefusal } from './pushoverRefusal.js';

// WHY THIS IS CHECKED AT ALL. What hangs off this decision is destructive: a
// refusal classified as the trader's key being bad DELETES that key from the
// database. Pushover answers 4xx for a bad application token and a bad user key
// alike, and reading every 4xx as the latter put a correct setup into a loop —
// paste the key, press test, watch the terminal throw it away, paste it again,
// while the screen said to check the key that was never the problem.
//
// The bodies below are Pushover's own documented shapes.

const checks: Array<[string, () => void]> = [
  ['a rejected APPLICATION TOKEN is the server’s problem, never the trader’s', () => {
    const { status, detail } = classifyRefusal({
      token: 'invalid',
      errors: ['application token is invalid'],
      status: 0,
      request: 'x',
    });
    assert.equal(status, 'invalid-app', 'a bad app token must not be blamed on the user key');
    assert.match(detail, /application token/, 'Pushover’s own words are what make this diagnosable');
  }],

  ['an EXPIRED or DEACTIVATED application is the same problem, worded differently', () => {
    // The shape this actually arrived as in production. Pushover names it only
    // in the errors array — there is no `token` key to match on — so a reader
    // that checks the keys alone falls through to a generic error, and the
    // trader is told the terminal could not reach Pushover when what they need
    // is a new application token.
    for (const message of [
      'application token has expired or been deactivated, see https://pushover.net/api',
      'application token is expired',
      'Application token has been deactivated',
    ]) {
      assert.equal(
        classifyRefusal({ errors: [message], status: 0 }).status,
        'invalid-app',
        `"${message}" must read as the application's problem`,
      );
    }
    // But it must not swallow a USER-key refusal that happens to mention the
    // word token — the destructive path stays reachable only on a named user.
    assert.equal(
      classifyRefusal({ user: 'invalid', errors: ['user identifier is not a valid user'] }).status,
      'invalid-user',
    );
  }],

  ['a rejected USER KEY is the one case that may prune', () => {
    const { status } = classifyRefusal({
      user: 'invalid',
      errors: ['user identifier is not a valid user, group, or subscribed user key'],
    });
    assert.equal(status, 'invalid-user');
  }],

  ['THE TOKEN IS READ FIRST when both are refused', () => {
    // A request with a bad token never had a chance of being accepted, so it
    // says nothing about the key it carried. Reading it the other way round
    // would delete a key on the strength of a request that could not have
    // succeeded whatever key was in it.
    assert.equal(classifyRefusal({ token: 'invalid', user: 'invalid' }).status, 'invalid-app');
  }],

  ['ANYTHING WE DID NOT UNDERSTAND IS AN ERROR, never a bad user key', () => {
    // The default has to be the non-destructive one. These are the shapes a
    // rate limit, an outage, an unparseable body or a changed API would arrive
    // as, and not one of them is evidence about the trader's key.
    for (const body of [
      null,
      undefined,
      {},
      'Too Many Requests',
      { errors: ['application token is invalid'] }, // no parameter named
      { user: 'valid' },
      { token: 'valid' },
      { status: 0 },
      [],
    ]) {
      assert.equal(
        classifyRefusal(body).status,
        'error',
        `${JSON.stringify(body)} must not be read as a bad user key`,
      );
    }
  }],

  ['the human-readable reason survives, and its absence is not a crash', () => {
    assert.equal(classifyRefusal({ user: 'invalid', errors: ['a', 'b'] }).detail, 'a; b');
    assert.equal(classifyRefusal({ user: 'invalid' }).detail, '');
    assert.equal(classifyRefusal({ user: 'invalid', errors: 'nope' }).detail, '');
  }],
];

let failed = 0;
for (const [name, run] of checks) {
  try { run(); console.log(`  ok  ${name}`); }
  catch (error) { failed += 1; console.error(`  FAIL  ${name}\n        ${error instanceof Error ? error.message : String(error)}`); }
}
if (failed > 0) { console.error(`\nPushover refusals: ${failed} check(s) failed.`); process.exit(1); }
console.log(`Pushover refusals: ${checks.length} checks passed.`);
