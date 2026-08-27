// Offline checks for configChecks.ts.
//
// The property under test is not "does it reject a bad environment" — the old
// inline code did that. It is "does it report EVERY problem in one pass". That
// is the thing that was wrong, and it is invisible from a passing boot: an
// environment with one fault behaves identically either way, so a regression
// here only shows up in production, one outage per variable.
import { checkEnvironment, formatEnvReport } from './configChecks.js';
import { randomBytes } from 'node:crypto';

let failures = 0;
const check = (name: string, ok: boolean, detail?: string) => {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const GOOD_KEY = randomBytes(32).toString('base64');
const GOOD_SECRET = 'a-long-enough-session-secret';
const ID_A = '11111111-2222-3333-4444-555555555555';
const ID_B = '99999999-8888-7777-6666-555555555555';

const prod = (extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  SESSION_SECRET: GOOD_SECRET,
  CREDENTIALS_KEY: GOOD_KEY,
  PRIVATE_ACCESS_USER_IDS: ID_A,
  ...extra,
});

console.log('config checks');

// The whole point: three independent faults, one report.
{
  const report = checkEnvironment(
    prod({ CREDENTIALS_KEY: undefined, PRIVATE_ACCESS_USER_IDS: undefined, PRIVATE_BOOTSTRAP_ADMIN_ID: ID_B }),
  );
  const named = report.problems.map((p) => p.variable);
  check('reports every problem at once, not just the first', report.problems.length === 2, `got ${report.problems.length}: ${named.join(', ')}`);
  for (const variable of ['PRIVATE_ACCESS_USER_IDS', 'CREDENTIALS_KEY']) {
    check(`  names ${variable}`, named.includes(variable));
  }
  check('is not ok', report.ok === false);
  // Demoted on purpose — see configChecks.ts. It is reported, but it does not
  // stop a running service from starting.
  check('  warns about the bootstrap admin rather than refusing', report.warnings.some((w) => w.includes('PRIVATE_BOOTSTRAP_ADMIN_ID')));
}

// A complete production environment starts, with nothing to say about it.
{
  const report = checkEnvironment(prod());
  check('a complete production environment passes', report.ok === true, report.problems.map((p) => p.message).join('; '));
  check('  and warns about nothing', report.warnings.length === 0);
  check('  and returns the parsed config', report.data?.NODE_ENV === 'production');
}

// The bootstrap admin has to be on the allowlist, and is fine when it is.
{
  const listed = checkEnvironment(prod({ PRIVATE_BOOTSTRAP_ADMIN_ID: ID_A }));
  check('a bootstrap admin on the allowlist passes', listed.ok === true);
  const absent = checkEnvironment(prod({ PRIVATE_BOOTSTRAP_ADMIN_ID: ID_B }));
  check('a bootstrap admin off the allowlist is NOT fatal', absent.ok === true, absent.problems.map((p) => p.message).join('; '));
  check('  but it is said out loud', absent.warnings.some((w) => w.includes(ID_B)));
  check('  while a missing allowlist still IS fatal', checkEnvironment(prod({ PRIVATE_ACCESS_USER_IDS: undefined })).ok === false);
}

// PRIVATE_SESSION_SECRET stands in for SESSION_SECRET, as it does at boot.
{
  const report = checkEnvironment({
    NODE_ENV: 'production',
    PRIVATE_SESSION_SECRET: GOOD_SECRET,
    CREDENTIALS_KEY: GOOD_KEY,
    PRIVATE_ACCESS_USER_IDS: ID_A,
  });
  check('PRIVATE_SESSION_SECRET satisfies SESSION_SECRET', report.ok === true, report.problems.map((p) => p.message).join('; '));
}

// A key equal to the session secret is the case the whole credentials guard
// exists for — one secret must not protect both sessions and broker keys.
{
  const report = checkEnvironment(prod({ CREDENTIALS_KEY: GOOD_SECRET }));
  check('refuses CREDENTIALS_KEY equal to SESSION_SECRET', report.ok === false);
}

// Development still boots, and still says out loud that it is falling back.
{
  const report = checkEnvironment({ NODE_ENV: 'development', SESSION_SECRET: 'a-real-development-secret-value' });
  check('development boots without an explicit key', report.ok === true, report.problems.map((p) => p.message).join('; '));
  check('  and warns that it fell back', report.warnings.length === 1, report.warnings.join('; '));
}

// A schema failure reports the fields, not one of them.
{
  const report = checkEnvironment({ NODE_ENV: 'production', SESSION_SECRET: 'short', PORT: 'not-a-number' });
  const named = report.problems.map((p) => p.variable);
  check('a schema failure names every bad field', named.includes('SESSION_SECRET') && named.includes('PORT'), named.join(', '));
}

// Nothing here may exit, throw, or reach anything. If it did, the runs above
// would not have got this far — so reaching this line is itself the assertion.
check('checking an environment never exits or throws', true);

// The rendered report has to carry the fix, or an operator reads a complaint
// with no instruction attached.
{
  const report = checkEnvironment(prod({ PRIVATE_ACCESS_USER_IDS: undefined }));
  const text = formatEnvReport(report).join('\n');
  check('the printed report includes the fix', text.includes('fix:') && text.includes('PRIVATE_ACCESS_USER_IDS'));
}

console.log(failures === 0 ? '\nconfig checks passed' : `\n${failures} config check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
