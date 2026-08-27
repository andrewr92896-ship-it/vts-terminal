// Offline checks for who the private portal admits.
//
// The property that matters: an allowlist entry may name an account by ID,
// username or email, so the gate survives the deployment being pointed at a
// different database. Matching on ID alone made the allowlist specific to one
// database's rows — restore, migrate or rebuild the service and the same person
// arrives under a different ID, the allowlist stops admitting them, and the
// terminal refuses the only person who should be let in with a message that
// says "Invalid email or password". Nothing about that is visible from either
// end, which is why it needs a check rather than a look at the running app.
//
// It must NOT have become a wider gate. The admitted set is still exactly what
// is enumerated, so an account that is not named is still refused however it is
// spelled — that is the half asserted hardest here.
process.env.NODE_ENV = 'production';
process.env.PRIVATE_ACCESS_USER_IDS =
  '11111111-2222-3333-4444-555555555555, andrew , Owner@Example.COM';
process.env.SESSION_SECRET ||= 'a-long-enough-session-secret-for-checks';
process.env.CREDENTIALS_KEY ||= (await import('node:crypto')).randomBytes(32).toString('base64');

const { isPrivateUserAllowed, privateAdmissionConfigured } = await import('./privateAccess.js');

let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  }
};

const account = (id: string, username: string | null, email: string | null) => ({ id, username, email });

console.log('private portal admission');

check('an allowlist is configured', privateAdmissionConfigured() === true);

// The three forms an entry may take.
check(
  'admits by account ID',
  isPrivateUserAllowed(account('11111111-2222-3333-4444-555555555555', 'someone', 'someone@example.com')),
);
check('admits by username', isPrivateUserAllowed(account('a-completely-different-id', 'andrew', null)));
check('admits by email', isPrivateUserAllowed(account('another-id', 'not-andrew', 'owner@example.com')));

// Whitespace and case in the variable and on the account.
check('ignores spacing around entries', isPrivateUserAllowed(account('x', 'andrew', null)));
check('matches a username case-insensitively', isPrivateUserAllowed(account('x', 'ANDREW', null)));
check('matches an email case-insensitively', isPrivateUserAllowed(account('x', null, 'OWNER@example.com')));

// THE GATE IS NOT WIDER. Everything below must be refused.
check('refuses an account named nowhere', isPrivateUserAllowed(account('x', 'stranger', 'stranger@example.com')) === false);
check('refuses an account with no username or email', isPrivateUserAllowed(account('x', null, null)) === false);
check('refuses a partial username match', isPrivateUserAllowed(account('x', 'andrewr', null)) === false);
check('refuses a partial ID match', isPrivateUserAllowed(account('11111111', null, null)) === false);
check('refuses an email at another domain', isPrivateUserAllowed(account('x', null, 'owner@example.org')) === false);
check('refuses an empty username', isPrivateUserAllowed(account('x', '', '')) === false);
// A username equal to an entry only admits when it IS that entry — not because
// some other field happened to be blank.
check('a blank field never matches a blank entry', isPrivateUserAllowed(account('', '', null)) === false);

// This is the scenario the change exists for: the same person, in a database
// that gave them a different row.
{
  const beforeMove = account('11111111-2222-3333-4444-555555555555', 'andrew', 'owner@example.com');
  const afterMove = account('99999999-8888-7777-6666-555555555555', 'andrew', 'owner@example.com');
  check('the same person is admitted after a database change', isPrivateUserAllowed(afterMove));
  check('  and was admitted before it', isPrivateUserAllowed(beforeMove));
}

console.log(failures === 0 ? '\n✓ private access checks passed' : `\n✗ ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
