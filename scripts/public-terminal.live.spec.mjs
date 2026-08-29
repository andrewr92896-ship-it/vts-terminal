import { test, expect } from '@playwright/test';

// The public terminal driven as a REAL SIGNED-IN ACCOUNT, against the real API
// and a real database.
//
// The existing visual spec drives the DEMO, which answers out of module memory.
// So the one thing neither it nor anything else could see is whether the
// server's payloads actually satisfy what the screens read — a field the server
// spells one way and a component reads another renders as an undefined figure or
// an empty list, not as an error. That exact fault shipped once (`daysRecorded`
// where the screen reads `totalDays`) and was found by hand.
//
// Each case below therefore asserts that DATA THAT WAS SEEDED IS ON THE SCREEN,
// not merely that the page rendered. A blank page passes "the root is visible";
// only the trade's own instrument proves the payload arrived and was understood.
// What the harness does NOT prove: the market board and the news feed are
// driven by an upstream provider that is not wired yet, so here they answer
// 503 — the state the public service actually ships in. Every screen is shown
// to survive that. What they render against a REAL market payload is not
// covered by anything, and is the next thing worth a check once a provider
// exists.
const base = process.env.PUBLIC_LIVE_BASE ?? 'https://127.0.0.1:4174';
const cookie = process.env.PUBLIC_LIVE_COOKIE ?? '';
// A second session on the same account. The sign-out test revokes whatever it
// uses, so it burns this one rather than the one every other test needs — which
// is what keeps the suite repeatable without reseeding between runs.
const spareCookie = process.env.PUBLIC_LIVE_SPARE_COOKIE || cookie;

const [name, value] = cookie.split('=');

test.beforeEach(async ({ context }) => {
  expect(cookie, 'PUBLIC_LIVE_COOKIE must be set by the harness').not.toBe('');
  await context.addCookies([{
    name, value: decodeURIComponent(value ?? ''), domain: '127.0.0.1', path: '/',
    // Carried as the production cookie is: Secure, over HTTPS.
    httpOnly: true, secure: true, sameSite: 'Lax',
  }]);
});

// A page is only reached once the shell has decided the session is good. Before
// that it renders nothing at all, so waiting on the sidebar is what separates
// "signed in and empty" from "still checking".
// The listener is REMOVED again, which is not tidiness: left attached, every
// screen's handler stays live for the rest of the run, so an error thrown late
// — after a navigation, by a request that had not resolved yet — is pushed into
// whichever arrays are still listening and gets reported against a screen that
// did not cause it. That sent one chase after the wrong file.
async function open(page, screen) {
  const errors = [];
  const record = (error) => errors.push(`${screen}: ${error.stack ?? String(error)}`);
  page.on('pageerror', record);
  try {
    // `about:blank` first, so this is always a REAL document load. Navigating
    // to a URL the page is already on — same path, same hash — is a
    // same-document navigation the browser does not reload for, so opening the
    // screen you are already on did nothing at all: every "and it is still
    // there after a reload" assertion was reading the DOM already on screen,
    // which proves the opposite of what it claims.
    await page.goto('about:blank');
    await page.goto(`${base}/#${screen}`, { waitUntil: 'networkidle' });
    await expect(page.locator('#root')).toBeVisible();
    // A render that throws asynchronously does so after the network settles, so
    // the error arrives a tick later than the assertion above.
    await page.waitForTimeout(250);
  } finally {
    page.off('pageerror', record);
  }
  return errors;
}

test('the terminal signs in from the session alone and shows the account', async ({ page }) => {
  const errors = await open(page, 'live');
  // The sign-in card is what a bad or missing session lands on. Reaching the
  // terminal at all is the assertion here.
  await expect(page.getByText('Explore the demo')).toHaveCount(0);
  expect(errors, 'the shell threw while rendering').toEqual([]);
});

test('the trade log renders the trades the account actually has', async ({ page }) => {
  const errors = await open(page, 'desk');
  // The instrument proves the payload arrived AND was understood. An empty list
  // would render perfectly happily and mean the opposite.
  await expect(page.getByText('EUR/USD').first()).toBeVisible();
  await expect(page.getByText('XAU/USD').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('manual trades renders the funded book and its balance', async ({ page }) => {
  const errors = await open(page, 'funded');
  await expect(page.getByText('FTP 200k').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('the budget renders the category and what was spent against it', async ({ page }) => {
  const errors = await open(page, 'fin_budget');
  await expect(page.getByText('Groceries').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('net worth renders both sides', async ({ page }) => {
  const errors = await open(page, 'fin_networth');
  await expect(page.getByText('Checking').first()).toBeVisible();
  await expect(page.getByText('Card').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('trading notes renders the note that was written', async ({ page }) => {
  const errors = await open(page, 'notes');
  await expect(page.getByText('Thin liquidity into the close').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('the study launcher renders the game that was created', async ({ page }) => {
  const errors = await open(page, 'st_game');
  await expect(page.getByText('Market terminology').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('flashcards and presentations render what was created', async ({ page }) => {
  const cards = await open(page, 'st_cards');
  await expect(page.getByText('Basics').first()).toBeVisible();
  expect(cards).toEqual([]);

  const guides = await open(page, 'st_guides');
  await expect(page.getByText('Spreads').first()).toBeVisible();
  expect(guides).toEqual([]);
});

test('reporting a bug renders the report that was filed', async ({ page }) => {
  const errors = await open(page, 'hp_bug');
  await expect(page.getByText('The chart tile does not resize').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('the investments screens render the rows the account actually has', async ({ page }) => {
  // These three read routes of their own rather than the portfolio payload, and
  // every one of them rendered permanently EMPTY for a real account while the
  // demo showed them full — the worst way round, since the showcase then proves
  // a screen the first customer finds blank. Nothing but a real account against
  // a real server can tell those two apart.
  const holdings = await open(page, 'inv_holdings');
  await expect(page.getByText('S&P 500 ETF').first()).toBeVisible();
  expect(holdings).toEqual([]);

  const contributions = await open(page, 'inv_contributions');
  await expect(page.getByText('Roth IRA').first()).toBeVisible();
  expect(contributions).toEqual([]);

  const dividends = await open(page, 'inv_dividends');
  await expect(page.getByText('VOO').first()).toBeVisible();
  expect(dividends).toEqual([]);

  const performance = await open(page, 'inv_performance');
  expect(performance).toEqual([]);
});

test('the to-do list and the deleted trades show what is in them', async ({ page }) => {
  // Both are lists, and an empty list is exactly what a payload the screen
  // could not read also renders. The seeded row is what separates the two.
  const todo = await open(page, 'td_trading');
  await expect(page.getByText('Review the session plan').first()).toBeVisible();
  expect(todo).toEqual([]);

  const deleted = await open(page, 'deleted');
  await expect(page.getByText('GBP/JPY').first()).toBeVisible();
  expect(deleted).toEqual([]);
});

test('a write made through the UI lands, and survives a reload', async ({ page }) => {
  // Everything above this reads. Nothing anywhere drove a WRITE through the
  // real interface on a real account — the demo answers writes out of module
  // memory, and the API's own tests post to the routes directly, so neither can
  // see a screen that destructures a key the write response does not carry.
  // That is the same fault class as the two payload-shape bugs above, on the
  // half a customer notices fastest: they press "add" and nothing happens.
  const errors = await open(page, 'fin_budget');
  const name = `Coffee ${Date.now()}`;

  await page.getByRole('button', { name: '+ Add a category' }).click();
  await page.getByPlaceholder('Groceries').fill(name);
  await page.getByRole('button', { name: 'Add category', exact: true }).click();

  // On the screen straight away — from the write's OWN response, which is what
  // a screen reading the wrong key would fail on.
  await expect(page.getByText(name).first()).toBeVisible();
  expect(errors, 'the screen threw while saving').toEqual([]);

  // And still there after a reload, which is what separates a row that was
  // saved from one that was only rendered.
  const after = await open(page, 'fin_budget');
  await expect(page.getByText(name).first()).toBeVisible();
  expect(after).toEqual([]);
});

test('a preference and a customized My Terminal are kept on the account', async ({ page }) => {
  // NOTHING PUBLIC COULD SAVE A PREFERENCE AT ALL until the preferences route
  // existed: `Preferences` reads `updateProfile` off useAuth(), the public
  // adapter did not provide one, and picking a time zone threw — silently, on
  // the one screen whose whole job is changing it. A reload is what separates a
  // setting that was stored from one that was only rendered.
  let errors = await open(page, 'my_prefs');
  await page.locator('select').first().selectOption('America/Chicago');
  await expect(page.locator('select').first()).toHaveValue('America/Chicago');
  expect(errors, 'the preferences screen threw while saving').toEqual([]);

  errors = await open(page, 'my_prefs');
  await expect(page.locator('select').first()).toHaveValue('America/Chicago');
  expect(errors).toEqual([]);

  // The customized board is the same storage and the same question: it is stored
  // as a DIFF against the nav, so a stored value that came back unparsed would
  // read as "never customized" rather than as an error.
  errors = await open(page, 'td_trading');
  const sidebar = page.locator('aside');
  await sidebar.getByRole('button', { name: 'Customize' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Closed Trades & Metrics/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(sidebar.getByRole('button', { name: 'Closed Trades & Metrics' })).toBeVisible();
  expect(errors, 'customizing threw').toEqual([]);

  errors = await open(page, 'td_trading');
  await expect(page.locator('aside').getByRole('button', { name: 'Closed Trades & Metrics' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the compliance disclaimers are actually on the screens that must carry them', async ({ page }) => {
  // Written down, reviewed, and then rendered by a component behind a
  // conditional is a disclaimer that is not there. Nothing else checks that
  // these reach a real account's screen, and this is the half the product's
  // regulatory posture actually rests on: informational only, never advice.
  for (const screen of ['inv_overview', 'inv_accounts', 'inv_holdings', 'inv_allocation',
    'inv_performance', 'inv_dividends', 'inv_contributions', 'inv_projections']) {
    const errors = await open(page, screen);
    await expect(page.getByText(/Informational only/i).first(),
      `${screen} rendered without its disclaimer`).toBeVisible();
    expect(errors).toEqual([]);
  }

  // Trading Notes says it in its own words, because a prediction is the most
  // advice-shaped thing a public account can write down.
  const notes = await open(page, 'notes');
  await expect(page.getByText(/personal record, not a recommendation/i).first()).toBeVisible();
  expect(notes).toEqual([]);
});

test('a visitor with no account can ask for early access', async ({ browser }) => {
  // The only thing an unauthenticated visitor does, the one route with no
  // session behind it, and the top of the funnel for the whole product — the
  // marketing site's two buttons both land here. Its own browser context, with
  // NO cookie, because "works while signed in" says nothing about it.
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto(`${base}/?screen=early-access`, { waitUntil: 'networkidle' });

  // WHAT HAPPENS TO THE ADDRESS IS SAID BEFORE IT IS ASKED FOR, on the form
  // itself. The Privacy Policy here is a pre-release summary that disclaims
  // itself in its own banner, which is honest and no use at all to somebody
  // deciding whether to type their email in — so the binding statement lives at
  // the point of collection, and it is asserted here because a notice that can
  // be quietly dropped is not a commitment.
  const card = page.locator('.vts-public-auth-card');
  await expect(card).toContainText('not sold, not shared');
  await expect(card).toContainText(/delete it at any time/i);
  await expect(card).toContainText('support@vitalistradingsystems.com');

  await page.getByPlaceholder('you@example.com').fill(`visitor-${Date.now()}@example.com`);
  await page.getByRole('button', { name: 'Send request' }).click();

  // Told something, rather than left looking at a form that did nothing.
  await expect(page.getByText(/Request received/i)).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});

test('a prediction and an investment account, written through the UI', async ({ page }) => {
  // Two more of the write paths a customer actually uses, and two different
  // response shapes: the note route answers with the row it made, the account
  // route answers with the row and the adapter re-reads the portfolio around
  // it. A screen reading the wrong key off either renders nothing and reports
  // nothing, which is what makes writes worth driving rather than posting.
  const errors = await open(page, 'notes');
  const call = `Probe call ${Date.now()}`;
  await page.getByPlaceholder('The call, in one line').fill(call);
  await page.getByRole('button', { name: 'Save private prediction' }).click();
  await expect(page.getByText(call).first()).toBeVisible();
  expect(errors, 'the predictions screen threw while saving').toEqual([]);

  const accounts = await open(page, 'inv_accounts');
  const label = `Probe Brokerage ${Date.now()}`;
  await page.getByRole('button', { name: 'Add an account' }).click();
  await page.getByPlaceholder('Fidelity 401(k)').fill(label);
  await page.getByRole('button', { name: 'Add account', exact: true }).click();
  await expect(page.getByText(label).first()).toBeVisible();
  expect(accounts, 'the accounts screen threw while saving').toEqual([]);

  // Still there after a reload, which separates a row that was saved from one
  // that was only rendered.
  const again = await open(page, 'inv_accounts');
  await expect(page.getByText(label).first()).toBeVisible();
  expect(again).toEqual([]);

  // The whole workspace shares one portfolio snapshot, so a write answering
  // with a shape the other screens cannot read takes THEM down rather than the
  // screen that made it — which is exactly how the Overview fault stayed
  // hidden. Nothing is asserted about their content; that they still render on
  // an account that now holds something is the point.
  for (const screen of ['inv_overview', 'inv_holdings', 'inv_allocation']) {
    expect(await open(page, screen), `${screen} threw after a write`).toEqual([]);
  }
});

test('answering a study question is remembered by the server', async ({ page, browser }) => {
  // The one public surface where state ACCUMULATES per deck rather than being a
  // row somebody typed: the level, the streak and the per-category standing are
  // computed from an answer count the server keeps. A game that plays fine and
  // forgets everything on reload looks identical while you are playing it.
  // Relative, never absolute: the deck carries whatever has already been
  // answered against it, so what is checked is that answering MOVED the count.
  // A deck with no history does not draw the line at all, so ABSENT is zero
  // rather than a failure to read — the state this runs against on a fresh
  // account, and the one an assertion written against a used deck misses.
  const answered = async () => {
    const line = page.getByText(/correct all-time/).first();
    if (await line.count() === 0) return 0;
    return Number((await line.innerText()).match(/\/\s*(\d+)/)?.[1] ?? NaN);
  };

  const errors = await open(page, 'st_game');
  await page.getByRole('button', { name: 'Play' }).first().click();
  await expect(page.locator('button').filter({ hasText: 'Answer A' }).first()).toBeVisible();
  const before = await answered();

  await page.locator('button').filter({ hasText: 'Answer A' }).first().click();
  await page.getByRole('button', { name: /^Confirm/ }).click();
  await expect.poll(answered, { message: 'answering did not move the count' }).toBe(before + 1);
  expect(errors, 'the study game threw while answering').toEqual([]);

  // Reloading is what separates a counter held in the component from one the
  // server was actually told about.
  // A DIFFERENT BROWSER, not a reload. The player keeps its own per-deck state
  // on the device and syncs it up, so a reload in the same browser shows the
  // count back whether or not the server was ever told — this test passed with
  // the save path broken until it was written this way. Only a context that has
  // never seen this deck can tell the two apart, which is also the case that
  // matters: the same account on a second machine.
  const elsewhere = await browser.newContext({ ignoreHTTPSErrors: true });
  await elsewhere.addCookies([{
    name, value: decodeURIComponent(value ?? ''), domain: '127.0.0.1', path: '/',
    httpOnly: true, secure: true, sameSite: 'Lax',
  }]);
  const second = await elsewhere.newPage();
  await second.goto(`${base}/#st_game`, { waitUntil: 'networkidle' });
  await second.getByRole('button', { name: 'Play' }).first().click();
  await expect(second.locator('button').filter({ hasText: 'Answer A' }).first()).toBeVisible();
  // POLLED: the deck loads first and the account's saved progress is a second
  // request behind it, so reading once races the hydrate.
  await expect.poll(async () => {
    const line = second.getByText(/correct all-time/).first();
    if (await line.count() === 0) return 0;
    return Number((await line.innerText()).match(/\/\s*(\d+)/)?.[1] ?? NaN);
  }, { message: 'a second browser on the same account saw no progress' }).toBe(before + 1);
  await elsewhere.close();
});

test('every remaining screen renders without throwing', async ({ page }) => {
  // The ones with nothing seeded. Nothing is asserted about their content —
  // there is none — but a thrown render leaves the root dead for every later
  // hash navigation, so one broken screen would blank the rest.
  const screens = ['my_access', 'my_prefs', 'my_settings', 'my_rules',
    // The market-facing screens. The harness serves an EMPTY market payload,
    // which is the case worth covering: a provider that answered with nothing
    // is a real state, and a screen that throws on it takes every later hash
    // navigation down with it.
    'data', 'news', 'news_world', 'news_politics',
    'st_packages', 'hp_news', 'hp_notes', 'hp_suggest',
    'inv_overview', 'inv_accounts', 'inv_allocation', 'inv_projections', 'st_decks', 'st_test', 'st_progress',
    'hp_howto', 'hp_rules', 'hp_terms', 'hp_privacy'];
  const broken = [];
  for (const screen of screens) {
    const errors = await open(page, screen);
    if (errors.length > 0) broken.push(errors[0]);
  }
  expect(broken, 'screens that threw on a real account').toEqual([]);
});

// LAST, deliberately: it revokes the session every other test signs in with.
test('signing out revokes the session, not just the screen', async ({ browser, request }) => {
  // There was no way out at all — the account chip has never had a handler and
  // the adapter's logout was a stub — so a signed-in public account stayed
  // signed in on whatever computer it was signed in on, for the twelve hours
  // the session cookie lasts. The route and the client method both existed the
  // whole time.
  // Signing out CONSUMES a session, so this test cannot be repeated against one
  // seed. Rather than fail on a second local run and look like a regression, it
  // says what happened: in CI the seed runs before every suite, so it always
  // has a live session and always runs.
  const alive = await request.get(`${base}/public/v1/auth/session`, {
    headers: { cookie: spareCookie }, ignoreHTTPSErrors: true,
  });
  test.skip(alive.status() !== 200,
    'the spare session was already signed out — reseed to run this again');

  const [spareName, spareValue] = spareCookie.split('=');
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await context.addCookies([{
    name: spareName, value: decodeURIComponent(spareValue ?? ''), domain: '127.0.0.1', path: '/',
    httpOnly: true, secure: true, sameSite: 'Lax',
  }]);
  const page = await context.newPage();
  await page.goto(`${base}/#live`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sign out' }).click();

  // Back at the sign-in card.
  await expect(page.getByText(/Explore the demo|Sign in/i).first()).toBeVisible();

  // And the session is DEAD on the server, which is the half that matters: a
  // screen that merely forgot you is not a sign-out.
  const still = await request.get(`${base}/public/v1/auth/session`, {
    headers: { cookie: spareCookie }, ignoreHTTPSErrors: true,
  });
  expect(still.status(), 'the session still answered after signing out').toBe(401);
  await context.close();
});
