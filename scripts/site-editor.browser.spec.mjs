// The Site Editor, driven in a real browser against the real private API,
// with the real marketing server reading what it deploys.
//
// EVERY CASE HERE LOOKS FINE FROM INSIDE THE EDITOR WHEN IT IS BROKEN: a field
// that is typed into and never drawn, a Save that reaches the public route, a
// deploy the marketing site never picks up. The API's own check (db:check-site-
// editor) proves the service; this proves the screen, the preview frame, the
// public route and the site agree.
//
// NOT PART OF `npm run verify` — it needs Playwright and a browser. It skips
// cleanly when Playwright is absent.
//
//   CHROMIUM_PATH=/path/to/chrome node scripts/site-editor.browser.spec.mjs

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('\n  SKIPPED — Playwright is not installed here.\n');
  process.exit(0);
}

let pass = 0,
  fail = 0;
const ok = (cond, label, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const DIR = resolve(ROOT, '.tmp-verify');
mkdirSync(DIR, { recursive: true });
const DB = resolve(DIR, 'site-editor-browser.db');
rmSync(DB, { force: true });

const PORT = 4899;
const B = `http://localhost:${PORT}`;
const MPORT = 4898;
const M = `http://localhost:${MPORT}`;
const PASS = 'correct-horse-battery-staple-42';
const key = () => randomBytes(32).toString('base64');

// In development the server does not migrate or seed on boot (production does),
// so the scratch database is prepared the way the repo's own checks prepare
// theirs: migrate, then seed the first-boot admin.
const prep = {
  ...process.env,
  NODE_ENV: 'development',
  DATABASE_URL: pathToFileURL(DB).href,
  SESSION_SECRET: key(),
  CREDENTIALS_KEY: key(),
  ADMIN_USERNAME: 'andrew',
  ADMIN_PASSWORD: PASS,
};
const { spawnSync } = await import('node:child_process');
for (const script of ['db:migrate', 'db:seed']) {
  const run = spawnSync('npm', ['--workspace', '@vts/api', 'run', script], { cwd: ROOT, env: prep, stdio: 'pipe', shell: true });
  if (run.status !== 0) {
    console.log(`${script} failed:\n${String(run.stdout)}\n${String(run.stderr)}`);
    process.exit(1);
  }
}

const api = spawn('node', ['apps/api/dist/server.js'], {
  cwd: ROOT,
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(PORT),
    DATABASE_URL: prep.DATABASE_URL,
    SESSION_SECRET: prep.SESSION_SECRET,
    CREDENTIALS_KEY: prep.CREDENTIALS_KEY,
    WEB_ORIGIN: B,
    ADMIN_USERNAME: 'andrew',
    ADMIN_PASSWORD: PASS,
    AUTH_REQUIRE_2FA: 'false',
    NEWS_AI_SUMMARY_ENABLED: 'false',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let apiLog = '';
api.stdout.on('data', (d) => (apiLog += d));
api.stderr.on('data', (d) => (apiLog += d));
const site = spawn('node', ['apps/marketing/server.mjs'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(MPORT), SITE_CONTENT_ORIGIN: B, SITE_CONTENT_POLL_SECONDS: '1' },
  stdio: 'ignore',
});

// Whatever ends this process — a thrown assertion included — takes the two
// servers with it. Left running, a stale API holds the port with a database
// the next run has already deleted, and every sign-in answers 500.
process.on('exit', () => {
  api.kill();
  site.kill();
});

// Wait for the API to answer.
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`${B}/api/health`)).ok) break;
  } catch {
    /* not up yet */
  }
  await wait(500);
}

const login = await fetch(`${B}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'andrew', password: PASS }),
});
const setCookie = login.headers.get('set-cookie') ?? '';
const cookie = setCookie.split(';')[0];
console.log(`\nsign-in: ${login.status} ${cookie ? '(cookie issued)' : '(NO COOKIE)'}`);
if (!cookie) {
  console.log(apiLog.slice(-2000));
  api.kill();
  site.kill();
  process.exit(1);
}
// A first sign-in meets the terms gate, as it should; the test accepts the
// way the app does, so what it drives is the terminal and not the gate.
const accepted = await fetch(`${B}/api/auth/accept-terms`, {
  method: 'POST',
  headers: { cookie, 'content-type': 'application/json' },
  // An empty object, not an empty body: Fastify refuses a JSON content-type
  // with nothing behind it, and a refused acceptance is a gate still up.
  body: '{}',
});
console.log(`terms: ${accepted.status}`);
const [cname, cvalue] = cookie.split('=');
const authed = (path, init = {}) => fetch(`${B}${path}`, { ...init, headers: { cookie, 'content-type': 'application/json', ...(init.headers ?? {}) } });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
for (const h of ['**://fonts.googleapis.com/**', '**://fonts.gstatic.com/**', '**://*.youtube-nocookie.com/**', '**://*.youtube.com/**', '**://*.tradingview.com/**']) {
  await ctx.route(h, (r) => r.abort());
}
await ctx.addCookies([{ name: cname, value: cvalue, domain: 'localhost', path: '/' }]);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const press = async (name) => {
  await page.getByRole('button', { name, exact: true }).click();
  await wait(250);
  await page.locator('[role=dialog] button:not(:has-text("Cancel"))').last().click();
  await wait(1200);
};
const row = (text) => page.locator('nav[aria-label="Sections"] button:has(span)', { hasText: text }).first();
// The first section's row — labelled by its headline, which the test edits, so
// it is found by position rather than by the words on it.
const heroRow = () => page.locator('nav[aria-label="Sections"] button:has(span)').nth(1);
const field = (label) => page.getByText(label, { exact: true }).first().locator('..').locator('input, textarea').first();
const frame = () => page.frameLocator('iframe[title="Site preview"]');
const publicModel = async () => {
  const r = await fetch(`${B}/api/public/site/marketing/content`);
  return r.status === 404 ? null : (await r.json()).model;
};

let png = '';
let exported = '';

// A failure leaves evidence: the screen as it was, and what it said. Without
// this a timeout names a selector and nothing else.
try {
  console.log('\nA. THE WORKSPACE OPENS ON THE PAGE AS IT IS');
  await page.goto(`${B}/`, { waitUntil: 'domcontentloaded' });
  await wait(2500);
  await page.getByText('Site Editor', { exact: true }).first().click();
  await wait(800);
  await page.getByText('Editor', { exact: true }).first().click();
  await wait(1500);
  await frame().locator('h1').first().waitFor({ timeout: 15000 });
  ok((await frame().locator('body').innerText()).includes('Your market workbench'), 'the preview frame draws the landing page');
  ok((await frame().locator('.grid article').count()) === 6, 'with all six feature cards', `${await frame().locator('.grid article').count()}`);
  ok((await publicModel()) === null, 'and nothing is published yet — the public route has nothing');

  console.log('\nB. TYPING SHOWS IN THE PREVIEW, AND STAYS OFF THE SITE');
  await heroRow().click();
  await wait(500);
  await field('Headline — first line').fill('EDITED HEADLINE');
  await wait(1200);
  ok((await frame().locator('h1').first().innerText()).includes('EDITED HEADLINE'), 'the preview shows what is being typed');
  const draftBefore = await (await authed('/api/site-editor/marketing')).json();
  ok(draftBefore.model.sections[0].h1 !== 'EDITED HEADLINE', 'and the server has not been told');
  ok((await page.locator('text=/unsaved changes/i').count()) > 0, 'the state reads unsaved');

  console.log('\nC. UNDO AND REDO');
  await page.keyboard.press('Control+z');
  await wait(500);
  ok(!(await field('Headline — first line').inputValue()).includes('EDITED'), 'Ctrl+Z walks the edit back');
  await page.keyboard.press('Control+Shift+z');
  await wait(500);
  ok((await field('Headline — first line').inputValue()) === 'EDITED HEADLINE', 'Ctrl+Shift+Z brings it forward');

  console.log('\nD. SAVE IS NOT DEPLOY');
  await press('Save');
  const draftAfter = await (await authed('/api/site-editor/marketing')).json();
  ok(draftAfter.model.sections[0].h1 === 'EDITED HEADLINE', 'saving reaches the server');
  ok((await publicModel()) === null, 'AND THE SITE STILL HAS NOTHING — the draft never leaks');
  let siteHtml = await (await fetch(`${M}/`)).text();
  ok(siteHtml.includes('Your market workbench') && !siteHtml.includes('EDITED HEADLINE'), 'the marketing server still serves the seed');

  console.log('\nE. DEPLOY REACHES THE SITE');
  await press('Deploy');
  {
    // Diagnostics for a deploy that did not land: what the server thinks, and
    // whatever the editor said about it.
    const st = await (await authed('/api/site-editor/marketing')).json();
    const said = await page.locator('p', { hasText: /could not|failed|error/i }).allInnerTexts().catch(() => []);
    console.log(`   deploy → published=${st.published} dirty=${st.dirty}; editor says: ${JSON.stringify(said)}`);
    await page.screenshot({ path: resolve(DIR, 'after-deploy.png') }).catch(() => {});
  }
  ok((await publicModel())?.sections[0].h1 === 'EDITED HEADLINE', 'deploying publishes it');
  await wait(2500);
  siteHtml = await (await fetch(`${M}/`)).text();
  ok(siteHtml.includes('EDITED HEADLINE'), 'and the marketing server picks it up on its next read');
  ok((await page.locator('text=/^deployed$/i').count()) > 0, 'the state says deployed');

  console.log('\nF. FILES, AND A BLOCK THAT USES ONE');
  await page.getByText('File Uploads', { exact: true }).first().click();
  await wait(1000);
  png = resolve(DIR, 'shot.png');
  writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
  await page.locator('input[type=file]').first().setInputFiles(png);
  await wait(1500);
  ok((await page.locator('text=shot.png').count()) > 0, 'an upload appears in the list');
  let r = await fetch(`${B}/api/public/site/marketing/files/shot.png`);
  ok(r.status === 200 && r.headers.get('content-type') === 'image/png', 'and is served publicly from the portal', `${r.status}`);
  r = await fetch(`${M}/files/shot.png`);
  ok(r.status === 200 && r.headers.get('content-type') === 'image/png', 'and through the marketing site', `${r.status}`);

  await page.getByText('Editor', { exact: true }).first().click();
  await wait(1200);
  await row('what').click();
  await wait(500);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await wait(300);
  const menu = await page.locator('text=Add to this section').locator('..').innerText();
  ok(/Card[\s\S]*Image[\s\S]*Video[\s\S]*Text[\s\S]*Callout/.test(menu), 'Add offers every block the site has');
  await page.getByRole('button', { name: /^Video/ }).click();
  await wait(300);
  await field('YouTube link').fill('https://youtu.be/dQw4w9WgXcQ');
  await wait(1200);
  ok((await frame().locator('iframe[src*="youtube-nocookie.com/embed/dQw4w9WgXcQ"]').count()) === 1, 'a pasted YouTube link becomes an embed in the preview');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await wait(300);
  await page.getByRole('button', { name: /^Image/ }).click();
  await wait(300);
  await page.locator('button[title="shot.png"]').first().click();
  await wait(1200);
  ok((await frame().locator('img[src$="/files/shot.png"]').count()) === 1, 'a picked upload is drawn in the preview from the portal route');
  await press('Deploy');
  await wait(2500);
  siteHtml = await (await fetch(`${M}/`)).text();
  ok(siteHtml.includes('youtube-nocookie.com/embed/dQw4w9WgXcQ') && siteHtml.includes('src="/files/shot.png"'), 'and both reach the site, with the file at the site\'s own address');

  console.log('\nG. EXPORT AND IMPORT');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export', exact: true }).click()]);
  exported = resolve(DIR, 'export.json');
  await download.saveAs(exported);
  const doc = JSON.parse(readFileSync(exported, 'utf8'));
  ok(doc.format === 'vts-site' && doc.site === 'marketing' && doc.model.sections[0].h1 === 'EDITED HEADLINE', 'an export holds what is on screen');
  ok(doc.files.includes('shot.png'), 'and names the file it uses');
  await heroRow().click();
  await wait(400);
  await field('Headline — first line').fill('SHOULD BE REPLACED');
  await wait(900);
  await page.locator('input[type=file][accept*="json"]').setInputFiles(exported);
  await wait(1500);
  await page.locator('[role=dialog]').getByRole('button', { name: 'Load it' }).click();
  await wait(900);
  ok((await field('Headline — first line').inputValue()) === 'EDITED HEADLINE', 'importing puts the file back on screen as an unsaved edit');

  console.log('\nH. HISTORY AND REVERT');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await wait(1000);
  ok((await page.locator('text=/deployed/i').count()) > 1, 'the history lists saves and marks what went live');
  await page.keyboard.press('Escape');
  await wait(300);
  await field('Headline — first line').fill('SOMETHING I REGRET');
  await wait(900);
  await press('Revert');
  ok((await field('Headline — first line').inputValue()) === 'EDITED HEADLINE', 'revert discards to the last save');

  console.log('\nI. VIEW SITE');
  await page.getByText('View Site', { exact: true }).first().click();
  await wait(2000);
  const view = page.frameLocator('iframe[title="Site preview"]');
  ok((await view.locator('body').innerText()).includes('EDITED HEADLINE'), 'View Site shows the saved draft');
  await page.getByRole('button', { name: 'Phone' }).click();
  await wait(1200);
  const w = await page.evaluate(() => document.querySelector('iframe')?.contentWindow?.innerWidth ?? 0);
  ok(Math.abs(w - 390) <= 20, 'the phone frame is its own 390px viewport', `${w}px`);

  console.log('\nJ. DOWN FOR MAINTENANCE');
  await page.getByText('Settings', { exact: true }).last().click();
  await wait(1500);
  const box = page.getByRole('checkbox').first();
  ok((await page.locator('text=/site is live/i').count()) > 0, 'the settings screen reports the site live');
  ok((await page.locator('text=/checked in/i').count()) > 0, 'and that the marketing site has checked in', await page.locator('text=/checked in|not checked in/i').first().innerText());
  await box.check();
  await wait(300);
  r = await fetch(`${M}/`);
  ok(r.status === 200, 'ticking the box stages it — the site is still live', `${r.status}`);
  ok((await page.locator('text=/not applied yet/i').count()) > 0, 'and the screen says so');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await wait(2500);
  r = await fetch(`${M}/`);
  ok(r.status === 503 && (await r.text()).includes('Down for maintenance'), 'Apply takes the site down within a poll', `${r.status}`);
  ok((await page.locator('text=/showing the notice/i').count()) > 0, 'and the state line reports it in force');
  await box.uncheck();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await wait(2500);
  r = await fetch(`${M}/`);
  ok(r.status === 200 && (await r.text()).includes('EDITED HEADLINE'), 'and off brings it back exactly as it was', `${r.status}`);
} catch (err) {
  const shot = resolve(DIR, 'site-editor-failure.png');
  await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
  console.log(`\nFAILED: ${err instanceof Error ? err.message.split('\n')[0] : err}`);
  console.log(`screenshot: ${shot}`);
  console.log('page text: ' + (await page.locator('body').innerText().catch(() => '')).slice(0, 800).replace(/\n+/g, ' | '));
  fail++;
}

ok(errors.length === 0, 'no page errors throughout', errors.join(' | ') || 'none');

await browser.close();
api.kill();
site.kill();
rmSync(DB, { force: true });
if (png) rmSync(png, { force: true });
if (exported) rmSync(exported, { force: true });
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) console.log('\n--- api log tail ---\n' + apiLog.slice(-1500));
process.exit(fail ? 1 : 0);
