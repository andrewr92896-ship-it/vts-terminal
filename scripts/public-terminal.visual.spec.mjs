import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = 'http://127.0.0.1:4173';
const out = 'test-results/public-terminal-update-existing-pages-v1';
await mkdir(out, { recursive: true });

// Every retained public page family, in sidebar order. The list is the whole
// point of the run: a family missing from here is a family with no evidence.
const routes = [
  'live', 'data', 'td_trading', 'my_access', 'my_rules', 'my_prefs', 'my_settings',
  'notes', 'desk', 'funded', 'deleted',
  'fin_networth', 'fin_budget',
  'news', 'news_world', 'news_politics',
  'inv_overview', 'inv_accounts', 'inv_holdings', 'inv_allocation',
  'inv_performance', 'inv_dividends', 'inv_contributions', 'inv_projections',
  'st_decks', 'st_packages', 'st_game', 'st_cards', 'st_test', 'st_guides', 'st_progress',
  'hp_howto', 'hp_news', 'hp_notes', 'hp_bug', 'hp_suggest', 'hp_rules', 'hp_terms', 'hp_privacy',
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

test('public route and cookie contract', async ({ page, context }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(base + '/?evidence=1#notes', { waitUntil: 'networkidle' });
  const contract = await page.evaluate(() => window.__VTS_PUBLIC_BOUNDARY__);
  expect(contract.routes).toEqual(expect.arrayContaining(routes));
  expect(contract.sessionCookie).toBe('vts_public_session_v1');
  expect(requests.filter((url) => url.includes('/api/'))).toEqual([]);
  expect(await context.cookies()).toEqual([]);
});
