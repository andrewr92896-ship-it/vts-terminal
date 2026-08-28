import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = 'http://127.0.0.1:4173';
const out = 'test-results/public-terminal-update-existing-pages-v1';
await mkdir(out, { recursive: true });

// Every retained public page family, in sidebar order. The list is the whole
// point of the run: a family missing from here is a family with no evidence.
const routes = [
  'td_trading', 'my_rules',
  'live', 'data', 'desk', 'funded', 'deleted', 'notes',
  'fin_networth', 'fin_budget',
  'news', 'news_world', 'news_politics',
  'inv_overview', 'inv_accounts', 'inv_holdings', 'inv_allocation',
  'inv_performance', 'inv_dividends', 'inv_contributions', 'inv_projections',
  'st_decks', 'st_packages', 'st_game', 'st_cards', 'st_test', 'st_guides', 'st_progress',
  'hp_howto', 'hp_news', 'hp_notes', 'hp_bug', 'hp_suggest', 'hp_rules', 'hp_terms', 'hp_privacy',
  'my_settings', 'my_prefs', 'my_access',
];

// A screenshot is not evidence unless the page actually drew something. Asserting
// only that #root is visible passes on a page whose tree threw and unmounted —
// which is exactly what happened: a fixture with the wrong shape blanked eight
// screens, and because a thrown render leaves the root dead for every later hash
// navigation, it blanked every capture after it too. Both halves are asserted
// here: no page error, and real text in the main column.
const MIN_CONTENT = 40;

async function capture(page, name, width, url) {
  const errors = [];
  const onError = (error) => errors.push(String(error));
  page.on('pageerror', onError);
  await page.setViewportSize({ width, height: Math.max(720, Math.round(width * 0.56)) });
  await page.goto(base + url, { waitUntil: 'networkidle' });
  await expect(page.locator('#root')).toBeVisible();
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false, animations: 'disabled' });
  page.off('pageerror', onError);
  return errors;
}

test('candidate page-family evidence', async ({ page }) => {
  test.setTimeout(300_000);
  const blank = [];
  const broken = [];
  for (const width of [1440, 768, 390]) {
    for (const route of routes) {
      const errors = await capture(page, `${route}-${width}`, width, `/?evidence=1&sidebar=expanded#${route}`);
      const text = await page.locator('.vts-public-main').innerText().catch(() => '');
      if (errors.length) broken.push(`${route}@${width}: ${errors[0].split('\n')[0]}`);
      if (text.replace(/\s+/g, ' ').trim().length < MIN_CONTENT) blank.push(`${route}@${width}`);
    }
  }
  await capture(page, 'login-1440', 1440, '/');
  await capture(page, 'two-factor-390', 390, '/?screen=two-factor');
  expect(broken, 'pages that threw while rendering').toEqual([]);
  expect(blank, 'pages that captured with no content').toEqual([]);
});

// The write controls the demo used to hide. Shared screens read `user.isDemo`
// to mean "a write here will be refused", which is true on the private terminal
// — the server rejects it — and false here, where the demo answers out of
// module memory. So they were hidden for a reason that does not apply, and the
// showcase could not demonstrate most of what the product does.
//
// Each is driven to the act it exists for. A control that appears and silently
// does nothing is worse than one that is missing, and that is exactly what the
// first of these did: the goal came back without the `pct` the screen renders
// with `.toFixed`, which threw and blanked the page.
test('the demo can add things, on the screens that used to hide the controls', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  const cases = [
    ['fin_budget', '+ Add a category', 'Groceries', 'A demo category', 'Add category'],
    ['inv_accounts', 'Add an account', 'Fidelity 401(k)', 'A demo account', 'Add account'],
    ['inv_holdings', 'Add a holding', 'Vanguard Target 2055', 'A demo holding', 'Add holding'],
    ['inv_contributions', 'Add a goal', 'Retirement at 60', 'A demo goal', 'Add goal'],
  ];
  for (const [screen, open, placeholder, value, submit] of cases) {
    // `about:blank` first: navigating to the hash the page is already on is a
    // same-document navigation the browser does not reload for.
    await page.goto('about:blank');
    await page.goto(`${base}/?demo=1#${screen}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: open }).first().click();
    await page.getByPlaceholder(placeholder).fill(value);
    if (screen === 'inv_holdings') await page.getByPlaceholder('12.345').fill('5');
    if (screen === 'inv_contributions') await page.getByPlaceholder('1000000').fill('250000');
    await page.getByRole('button', { name: submit, exact: true }).click();
    await expect(page.getByText(value).first(), `${screen} did not save`).toBeVisible();
  }
  expect(errors, 'a demo screen threw while saving').toEqual([]);
});

// My Terminal is the one customizable workspace, and the failure this drives at
// is not "does the modal open" — it is whether the pinned row NAVIGATES. A pin
// resolves its own workspace from the nav, so without the two rules that keep it
// on My Terminal the click jumps to Advanced Trading and the pin looks broken;
// and the effect that keeps workspace and screen consistent would bounce it
// straight back off. Neither is visible from the modal.
test('My Terminal can be customized, and a pinned section opens on it', async ({ page }) => {
  const errors = [];
  const record = (error) => errors.push(String(error));
  page.on('pageerror', record);
  try {
    await page.goto('about:blank');
    await page.goto(`${base}/?demo=1#td_trading`, { waitUntil: 'networkidle' });

    const sidebar = page.locator('aside');
    await expect(sidebar.getByRole('button', { name: 'Closed Trades & Metrics' })).toHaveCount(0);

    await sidebar.getByRole('button', { name: 'Customize' }).click();
    // Scoped to the dialog: the same section names are rows in the sidebar too,
    // and clicking the sidebar's copy would pass this test while proving nothing.
    await page.getByRole('dialog').getByRole('button', { name: /^Closed Trades & Metrics/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();

    const pinned = sidebar.getByRole('button', { name: 'Closed Trades & Metrics' });
    await expect(pinned, 'the pinned section did not reach the sidebar').toBeVisible();

    await pinned.click();
    // Still on My Terminal — this is the assertion the whole feature turns on.
    await expect(sidebar.getByRole('button', { name: 'To Do' })).toBeVisible();
    await expect(page.locator('.vts-public-main')).toContainText(/Trade|Metrics/i);

    // And taking a native row off removes it.
    await sidebar.getByRole('button', { name: 'Customize' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^Site Rules/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(sidebar.getByRole('button', { name: 'Site Rules' })).toHaveCount(0);
  } finally {
    page.off('pageerror', record);
  }
  expect(errors, 'customizing My Terminal threw').toEqual([]);
});

// The Live Wall is EDITABLE in the demo, as it is on the private terminal. A
// screenshot proves the board rendered; it cannot prove that pressing "Add a
// tile" adds one, or that removing one removes it — which is the whole of what
// this item asked for.
test('the Live Wall can be edited in the demo', async ({ page }) => {
  const errors = [];
  const record = (error) => errors.push(String(error));
  page.on('pageerror', record);
  try {
    await page.goto('about:blank');
    await page.goto(`${base}/?demo=1#live`, { waitUntil: 'networkidle' });

    const before = await page.locator('.wall-cell').count();
    expect(before, 'the wall opened on an empty board').toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Edit layout' }).click();
    await page.getByRole('button', { name: 'Add a tile' }).click();
    await page.getByRole('button', { name: /^To Do/ }).click();
    await expect(page.locator('.wall-cell')).toHaveCount(before + 1);

    // And the added tile is the real one, not a placeholder with a label on it.
    await expect(page.locator('.wall-cell').last()).toContainText(/To Do/i);

    // Removing takes it off again. The ✕ only exists while editing, which is
    // itself the assertion that edit mode is doing something.
    await page.locator('.wall-cell').last().getByTitle('Remove tile').click();
    await expect(page.locator('.wall-cell')).toHaveCount(before);
  } finally {
    page.off('pageerror', record);
  }
  expect(errors, 'editing the wall threw').toEqual([]);
});

test('the demo reaches no service and leaves nothing behind', async ({ page, context }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(base + '/?demo=1#notes', { waitUntil: 'networkidle' });

  const contract = await page.evaluate(() => window.__VTS_PUBLIC_BOUNDARY__);
  expect(contract.routes).toEqual(expect.arrayContaining(routes));
  expect(contract.sessionCookie).toBe('vts_public_session_v1');

  await page.fill('input[placeholder="The call, in one line"]', 'A prediction made in the demo');
  await page.getByRole('button', { name: 'Save private prediction' }).click();
  await page.waitForTimeout(600);
  await expect(page.getByText('A prediction made in the demo')).toBeVisible();

  const offSite = requests.filter((url) => url.includes('/api/') || url.includes('/public/v1'));
  expect(offSite, 'the demo must not call a service').toEqual([]);
  // OUR cookies, scoped to the app's own origin. The Live Wall embeds
  // TradingView's public widgets — the same ones the portal uses — and a third
  // party's cookie is not this app remembering anybody. What matters is that
  // the demo issues no session of its own.
  const ours = (await context.cookies()).filter((c) => c.domain.includes('127.0.0.1'));
  expect(ours, 'the demo must set no cookie of its own').toEqual([]);
});
