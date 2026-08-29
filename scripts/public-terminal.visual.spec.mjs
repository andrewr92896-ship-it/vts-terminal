import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = 'http://127.0.0.1:4173';

// THE THIRD-PARTY EMBEDS ARE BLOCKED FOR THIS WHOLE SUITE, AND THAT IS THE FIX
// FOR A REAL FAILURE RATHER THAN A CONVENIENCE.
//
// The wall carries TradingView's chart and watchlist and a YouTube stream slot.
// This file was written in a sandbox with no outbound access, where those hosts
// simply fail — so the suite was hermetic by accident, and two things quietly
// depended on it:
//
//  - `waitUntil: 'networkidle'` settled, because nothing was ever connecting.
//    On a runner WITH outbound access a widget holds the connection open, the
//    page never goes idle, and the page-family capture spent its entire 300s
//    budget on one navigation and named nothing.
//  - the watchlist assertion reads the config TradingView is handed. When their
//    script actually loads it consumes that container — config script and all —
//    so the read came back empty and the test reported the wrong widget.
//
// Blocking them here makes the intent true instead of accidental: this suite is
// about the terminal's own screens, and it must not depend on somebody else's
// CDN being reachable. Keep it blocked, and add a host here rather than letting
// a new embed decide whether the run passes.
const THIRD_PARTY = /(^|\.)((s3\.)?tradingview\.com|youtube(-nocookie)?\.com|ytimg\.com|googlevideo\.com)/;
test.beforeEach(async ({ page }) => {
  await page.route((url) => THIRD_PARTY.test(url.hostname), (route) => route.abort());
});
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
  // NOT `networkidle`. With the embeds above blocked there is no third party
  // left to wait for — every screen here is served from module memory — and a
  // navigation that cannot reach idle must show up as a blank or broken capture
  // naming its route, never as a timeout that names nothing.
  await page.goto(base + url, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#root')).toBeVisible();
  // Wait for the screen to have painted something before the shutter, but never
  // for long: a page that stays empty is exactly what the blank list is for, and
  // 117 captures make every second here cost two minutes.
  await page
    .waitForFunction(
      (min) => (document.querySelector('.vts-public-main')?.innerText ?? '').replace(/\s+/g, ' ').trim().length >= min,
      MIN_CONTENT,
      { timeout: 2500 },
    )
    .catch(() => {});
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false, animations: 'disabled' });
  page.off('pageerror', onError);
  return errors;
}

test('candidate page-family evidence', async ({ page }) => {
  test.setTimeout(420_000);
  const blank = [];
  const broken = [];
  for (const width of [1440, 768, 390]) {
    for (const route of routes) {
      // `device=desktop` answers the demo's device question in the URL. Without
      // it every capture sits at that door: `#root` IS visible there, so nothing
      // fails fast — the run just spends its whole budget waiting for a main
      // column that is not on screen yet.
      const errors = await capture(page, `${route}-${width}`, width, `/?evidence=1&device=desktop&sidebar=expanded#${route}`);
      // A short timeout deliberately. This read is allowed to fail — a page with
      // no main column counts as blank and is reported — but without a bound it
      // waits out the whole test instead, and 117 captures turn a 20-second run
      // into a five-minute timeout that names nothing.
      const text = await page.locator('.vts-public-main').innerText({ timeout: 2000 }).catch(() => '');
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
    await page.goto(`${base}/?demo=1&device=desktop#${screen}`, { waitUntil: 'networkidle' });
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
    await page.goto(`${base}/?demo=1&device=desktop#td_trading`, { waitUntil: 'networkidle' });

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
    await page.goto(`${base}/?demo=1&device=desktop#live`, { waitUntil: 'networkidle' });

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

// Two acts the demo has to be able to perform, neither of which a screenshot can
// see: the worked example of the AI screenshot reader (the feature itself is
// switched off, and an error alone leaves somebody unable to see its shape), and
// editing the terminal's own notices from the screens they appear on.
test('the demo shows what reading a screenshot produces, without reading one', async ({ page }) => {
  const errors = [];
  const record = (error) => errors.push(String(error));
  page.on('pageerror', record);
  try {
    await page.goto('about:blank');
    await page.goto(`${base}/?demo=1&device=desktop#funded`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Import from screenshot' }).click();
    await page.getByRole('button', { name: 'See an example' }).click();
    const main = page.locator('.vts-public-main');
    await expect(main).toContainText('Example — nothing was read, and nothing was logged');
    // The example is the WORKED one, so the outcome has to be in it — including
    // the duplicate the importer would skip, which is the half people report as
    // a bug when it is not explained.
    await expect(main).toContainText('duplicate — skipped');
    await expect(main).toContainText('3 trades added');
  } finally {
    page.off('pageerror', record);
  }
  expect(errors, 'the screenshot example threw').toEqual([]);
});

test('the demo can post an announcement and publish a patch note', async ({ page }) => {
  const errors = [];
  const record = (error) => errors.push(String(error));
  page.on('pageerror', record);
  try {
    await page.goto('about:blank');
    await page.goto(`${base}/?demo=1&device=desktop#hp_news`, { waitUntil: 'networkidle' });
    await page.getByPlaceholder('Title').fill('Doors open Monday');
    await page.getByPlaceholder('Message').fill('A first wave of Early Access invitations goes out.');
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(page.getByText('Doors open Monday')).toBeVisible();

    await page.goto('about:blank');
    await page.goto(`${base}/?demo=1&device=desktop#hp_notes`, { waitUntil: 'networkidle' });
    await page.getByPlaceholder('Beta V 7.70').fill('Beta V 9.99');
    await page.getByPlaceholder('One change per line').fill('A change made in the demo');
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByText('Beta V 9.99')).toBeVisible();
    await expect(page.getByText('A change made in the demo')).toBeVisible();
  } finally {
    page.off('pageerror', record);
  }
  expect(errors, 'editing a notice threw').toEqual([]);
});

// On a phone the sidebar is not a rail — the stylesheet turns it into a
// slide-over drawer at 768. It was opening COLLAPSED, so every row was a 76px
// unlabelled icon inside a 310px panel. The page-family captures could not see
// it: they never open the drawer, and a collapsed sidebar still renders content.
test('the phone drawer opens with labels, not a column of icons', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('about:blank');
  await page.goto(`${base}/?demo=1&device=desktop#live`, { waitUntil: 'networkidle' });

  await page.getByRole('button', { name: 'Open navigation' }).click();
  const sidebar = page.locator('aside');
  // ASSERTED ON VISIBLE TEXT, NOT ON THE ROLE NAME. A collapsed row still has an
  // accessible name — the component puts the label in `title` precisely so a
  // rail is not a column of anonymous buttons — so `getByRole({name})` matches
  // either way and proves nothing. It is the text node that is missing when the
  // drawer is collapsed, and the text node is what a person reads.
  // `.first()` because the workspace's own name is also the group heading above
  // its section list — two nodes, one word, and either proves the labels render.
  await expect(sidebar.getByText('Advanced Trading', { exact: true }).first()).toBeVisible();
  await expect(sidebar.getByText('Market Data', { exact: true }).first()).toBeVisible();

  // Picking a WORKSPACE keeps the drawer open: its section list has just been
  // replaced and is what you came for, so closing here means reopening the
  // drawer every time to finish the job. Closing on both is what it did.
  await sidebar.getByText('Studies', { exact: true }).first().click();
  await expect(sidebar).toBeInViewport();
  await expect(sidebar.getByText('Flashcards', { exact: true }).first()).toBeVisible();

  // Picking a SECTION is the whole choice, so the drawer gets out of the way.
  await sidebar.getByText('Flashcards', { exact: true }).first().click();
  await expect(sidebar).not.toBeInViewport();
});

// The demo asks which device it is being shown on before it draws the terminal,
// and the answer picks one of the two default board layouts. Every other test
// here answers it in the URL (`?device=desktop`) so it can reach a screen; this
// one goes through the door, which is the only way to know the door works.
// The workspace resizer, ported from the private board. The assertion that
// matters is NOT that a number goes up — it is that the BOX grows while the
// TILES keep their size. The private board shipped the other way round once:
// columns were added inside a fixed width, so every extra column made all the
// others thinner and the whole board shrank, which is the opposite of what
// widening is for.
test('the workspace can be resized, and widening grows the box rather than thinning the tiles', async ({ page }) => {
  const errors = [];
  const record = (error) => errors.push(String(error));
  page.on('pageerror', record);
  try {
    await page.setViewportSize({ width: 1920, height: 1000 });
    await page.goto('about:blank');
    await page.goto(`${base}/?demo=1&device=desktop#live`, { waitUntil: 'networkidle' });

    const grid = page.locator('.react-grid-layout').first();
    const gridWidth = async () => Math.round((await grid.boundingBox()).width);
    const firstTileWidth = async () => Math.round((await page.locator('.wall-cell').first().boundingBox()).width);

    await page.getByRole('button', { name: 'Edit layout' }).click();
    // LOCKED even in edit mode: the frame is drawn, and the only way to size it
    // is the pencil. A drag meant for a tile must never move the canvas.
    await expect(page.getByRole('button', { name: 'Add a column' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Resize the workspace' }).click();
    // While the workspace is unlocked the tiles freeze — the mirror of the
    // workspace being locked while tiles are arranged.
    await expect(page.locator('.react-grid-item').first()).toHaveCSS('pointer-events', 'none');

    // BASELINE TAKEN AFTER UNLOCKING, deliberately. Unlocking pulls the board in
    // by a 44px gutter each side so the frame's handles are reachable, which
    // narrows the columns on its own. Measuring before it would fold that into
    // the comparison and test two things at once; the property under test is
    // only what happens when a COLUMN IS ADDED.
    const beforeGrid = await gridWidth();
    const beforeTile = await firstTileWidth();

    const plus = page.getByRole('button', { name: 'Add a column' });
    let grew = 0;
    while (!(await plus.isDisabled()) && grew < 40) { await plus.click(); grew += 1; }
    expect(grew, 'the workspace could not grow at all on a 1920px screen').toBeGreaterThan(0);

    // POLLED, not read once. A column is added by a state change and the box is
    // re-laid out after it, so a single read taken the instant the click returns
    // is a race — it passed on an idle machine and failed in a full run.
    await expect.poll(gridWidth, { message: 'the box did not grow', timeout: 5000 }).toBeGreaterThan(beforeGrid);
    // The tiles keep their size. A column is a fixed slice of width, so adding
    // three of them must not make the existing ones thinner — this is the whole
    // point of the feature and the half that was wrong the first time.
    await expect
      .poll(async () => Math.abs((await firstTileWidth()) - beforeTile), { message: 'the tiles were resized by adding columns', timeout: 5000 })
      .toBeLessThan(12);
    // And it stops before anything has to scroll sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

    const shrunk = await gridWidth();
    await page.getByRole('button', { name: 'Remove a column' }).click();
    await expect.poll(gridWidth, { message: 'removing a column did not narrow the box', timeout: 5000 }).toBeLessThan(shrunk);

    // Escape locks the workspace FIRST and stays in edit mode, so the two states
    // unwind in the order they were entered.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Add a column' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
  } finally {
    page.off('pageerror', record);
  }
  expect(errors, 'resizing the workspace threw').toEqual([]);
});

// The watchlist has two widgets behind it and the right one depends on the
// tile's SHAPE. The default board had the scrolling tape in a tall narrow tile,
// where it clipped its own quotes at both edges. Asserted on the config the tile
// hands the widget rather than on their iframe, which would prove nothing about
// which widget was chosen. Their script is blocked at the top of this file, so
// the config stays in the DOM where this can read it — without that it loads,
// consumes the container, and this reads an empty list on any runner with
// outbound access.
test('the watchlist uses the widget that fits the tile it is in', async ({ page }) => {
  const configs = async () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.tradingview-widget-container script')]
        .map((s) => s.textContent ?? '')
        .filter((t) => t.includes('symbolsGroups') || t.includes('proName')),
    );

  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('about:blank');
  await page.goto(`${base}/?demo=1&device=desktop#live`, { waitUntil: 'networkidle' });
  // Tall and narrow: the STATIC quote list, which shows every symbol at once.
  expect((await configs()).some((c) => c.includes('symbolsGroups')), 'the desktop watchlist is not the static list').toBe(true);

  await page.goto('about:blank');
  await page.goto(`${base}/?demo=1&device=mobile#live`, { waitUntil: 'networkidle' });
  // Full width and short: the scrolling tape, which is the strip it was built for.
  expect((await configs()).some((c) => c.includes('proName')), 'the stacked watchlist is not the tape').toBe(true);
});

test('the demo asks which device it is on, and the answer picks the layout', async ({ page }) => {
  const errors = [];
  const record = (error) => errors.push(String(error));
  page.on('pageerror', record);
  try {
    // Asked on a WIDE screen too, and the wide answer is the recommended one —
    // this is a question rather than a measurement, so that somebody on a laptop
    // can show the phone layout.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('about:blank');
    await page.goto(`${base}/?demo=1`, { waitUntil: 'networkidle' });
    await expect(page.getByText('How are you looking at this?')).toBeVisible();

    await page.getByRole('button', { name: /Phone or tablet/ }).click();
    await expect(page.locator('.wall-cell').first()).toBeVisible();

    // Stacked means every tile the full width of the board, ON A DESKTOP — it is
    // a real arrangement, not a narrow-screen rendering, which is the whole
    // reason a desktop visitor can be shown it at all.
    const widths = await page.locator('.wall-cell').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
    expect(widths.length).toBeGreaterThan(1);
    expect(new Set(widths).size, `stacked tiles were not all one width: ${widths}`).toBe(1);
    // And the sidebar starts out of the way, which is the other half of the answer.
    await expect(page.locator('.vts-public-shell')).toHaveAttribute('data-collapsed', 'true');

    // Both layouts stay reachable afterwards, so the answer is a starting point
    // rather than a setting.
    await page.getByRole('button', { name: 'Edit layout' }).click();
    await page.getByRole('button', { name: 'Desktop layout' }).click();
    const after = await page.locator('.wall-cell').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
    expect(new Set(after).size, 'the desktop layout came back stacked').toBeGreaterThan(1);
  } finally {
    page.off('pageerror', record);
  }
  expect(errors, 'the device door threw').toEqual([]);
});

test('the demo reaches no service and leaves nothing behind', async ({ page, context }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(base + '/?demo=1&device=desktop#notes', { waitUntil: 'networkidle' });

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
