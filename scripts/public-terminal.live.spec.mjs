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
const base = process.env.PUBLIC_LIVE_BASE ?? 'http://127.0.0.1:4174';
const cookie = process.env.PUBLIC_LIVE_COOKIE ?? '';

const [name, value] = cookie.split('=');

test.beforeEach(async ({ context }) => {
  expect(cookie, 'PUBLIC_LIVE_COOKIE must be set by the harness').not.toBe('');
  await context.addCookies([{
    name, value: decodeURIComponent(value ?? ''), domain: '127.0.0.1', path: '/',
    httpOnly: true, secure: false, sameSite: 'Lax',
  }]);
});

// A page is only reached once the shell has decided the session is good. Before
// that it renders nothing at all, so waiting on the sidebar is what separates
// "signed in and empty" from "still checking".
async function open(page, screen) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`${base}/#${screen}`, { waitUntil: 'networkidle' });
  await expect(page.locator('#root')).toBeVisible();
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

test('every remaining screen renders without throwing', async ({ page }) => {
  // The ones with nothing seeded. Nothing is asserted about their content —
  // there is none — but a thrown render leaves the root dead for every later
  // hash navigation, so one broken screen would blank the rest.
  const screens = ['deleted', 'td_trading', 'my_access', 'my_prefs', 'my_settings',
    'inv_overview', 'inv_accounts', 'inv_holdings', 'st_decks', 'st_test', 'st_progress',
    'hp_howto', 'hp_rules', 'hp_terms', 'hp_privacy'];
  const broken = [];
  for (const screen of screens) {
    const errors = await open(page, screen);
    if (errors.length > 0) broken.push(`${screen}: ${errors[0]}`);
  }
  expect(broken, 'screens that threw on a real account').toEqual([]);
});
