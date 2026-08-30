import assert from 'node:assert/strict';
import {
  maintenanceExempt,
  maintenanceOn,
  maintenanceReply,
  publicTerminalUrl,
  MAINTENANCE_HEADERS,
  MAINTENANCE_TITLE,
  MAINTENANCE_MESSAGE,
  MAINTENANCE_DEMO_NOTE,
} from './maintenance.js';

// Maintenance mode is the one feature whose failures are only visible when it
// is already needed — you turn it on because something is wrong, and if it is
// wrong itself you find out from a rolled-back deploy or a site that will not
// come back. So the rules are checked here rather than by switching it on.

const checks: Array<[string, () => void]> = [
  ['only the exact string turns it on', () => {
    for (const value of ['true', 'TRUE', ' true ']) {
      assert.equal(maintenanceOn({ PRIVATE_MAINTENANCE: value }), true, `"${value}" should close the terminal`);
    }
    // Anything else leaves it OPEN. A variable set to '1' or 'yes' by somebody
    // guessing the format must not take the site down, and neither must a
    // value left behind as 'false'.
    for (const value of ['', ' ', 'false', '1', 'yes', 'on', 'maintenance']) {
      assert.equal(maintenanceOn({ PRIVATE_MAINTENANCE: value }), false, `"${value}" must not close the terminal`);
    }
    assert.equal(maintenanceOn({}), false, 'unset must leave the terminal open');
  }],

  ['the health check stays exempt, and nothing that merely looks like it', () => {
    // THE ONE THAT MATTERS. Railway health-checks /api/health; a maintenance
    // mode that answered 503 there would fail its own deploy and roll back, so
    // the feature would be impossible to turn on.
    assert.equal(maintenanceExempt('/api/health'), true);
    assert.equal(maintenanceExempt('/api/health/'), true);
    assert.equal(maintenanceExempt('/api/health?from=railway'), true, 'a query string must not defeat the exemption');
    // And it is the health path only — a prefix match here would quietly leave
    // a whole family of routes serving during maintenance.
    for (const url of ['/api/healthz', '/api/health-check', '/api/healthy/thing', '/api/trading/live', '/']) {
      assert.equal(maintenanceExempt(url), false, `${url} must not be exempt`);
    }
  }],

  ['the app shell keeps serving, so an installed device is not frozen', () => {
    // THE HALF THAT MAKES THE NOTICE REACH A PHONE. The terminal is a PWA: a
    // device that already has it serves its own shell and never fetches the
    // server's page, so the notice gets there through the API 503 and the
    // client's own card. That only works if the device can pick up a build
    // that draws one — which means the service worker re-fetching itself and
    // its precache list. Gate those and every installed device is stuck on
    // whatever it had when the terminal closed, for as long as it stays closed.
    for (const url of [
      '/index.html', '/sw.js', '/registerSW.js', '/push-sw.js', '/manifest.webmanifest',
      '/workbox-3f1a2b.js', '/assets/index-a1b2c3.js', '/assets/main-9f8e.css',
      '/icon-192.png', '/apple-touch-icon-180.png', '/favicon.ico', '/icon.svg',
      // Subdirectories too: the precache list is a glob over the whole build,
      // so anything it can reach has to be servable or the install fails.
      '/brand/vts-development.svg', '/sounds/alert.mp3', '/assets/fonts/plex.woff2',
    ]) {
      assert.equal(maintenanceExempt(url), true, `${url} must keep serving or the worker cannot update`);
    }

    // A NAVIGATION IS STILL CLOSED. `/` answering with the app would put a
    // browser arriving fresh in front of a terminal that 503s everything,
    // instead of the notice, on the first request rather than the second.
    // `.html` is deliberately not an asset extension — that is a navigation.
    for (const url of ['/', '/live', '/trading', '/some/deep/route', '/anything.html']) {
      assert.equal(maintenanceExempt(url), false, `${url} is a navigation and must get the notice`);
    }

    // NOTHING UNDER /api RIDES THE ASSET RULE. `/api/x.json` looks like a file
    // and is a route.
    for (const url of ['/api/trading/live', '/api/x.json', '/api/auth/me']) {
      assert.equal(maintenanceExempt(url), false, `${url} must stay closed`);
    }

    // AND NEVER THE EMPLOYEE PORTAL, page or chunk. It is deliberately
    // network-only and hardened; a closed terminal must not leave it standing.
    for (const url of [
      '/employee', '/employee/', '/employee/security', '/employee.html',
      '/assets/employee-1a2b.js', '/assets/employee.css', '/employee-abc.js',
    ]) {
      assert.equal(maintenanceExempt(url), false, `${url} must stay closed`);
    }
  }],

  ['the 503 body carries the notice the client draws', () => {
    // A cached client cannot read the served page, so the wording and the demo
    // link travel on the API refusal instead — sent rather than mirrored, so
    // the page and the in-app card cannot come to say different things.
    const body = JSON.parse(maintenanceReply('/api/auth/me', { PUBLIC_TERMINAL_URL: 'https://demo.example.com/x' }).body) as
      Record<string, unknown>;
    assert.equal(body.error, 'maintenance', 'the client keys off this exact value');
    for (const key of ['title', 'message', 'demoUrl', 'demoNote']) {
      assert.equal(typeof body[key], 'string', `${key} must be sent`);
      assert.ok(String(body[key]).length > 0, `${key} must not be empty`);
    }
    assert.equal(body.demoUrl, 'https://demo.example.com/x', 'the demo link must be the configured one');
    assert.equal(body.title, MAINTENANCE_TITLE);
    assert.equal(body.message, MAINTENANCE_MESSAGE);
    assert.equal(body.demoNote, MAINTENANCE_DEMO_NOTE);
    // The same guard the href gets: this string ends up in a link in the app.
    const hostile = JSON.parse(maintenanceReply('/api/auth/me', { PUBLIC_TERMINAL_URL: 'javascript:alert(1)' }).body) as
      Record<string, unknown>;
    assert.equal(hostile.demoUrl, 'https://app.vitalistradingsystems.com/?demo=1');
  }],

  ['an API caller gets JSON and a browser gets the page', () => {
    // A client that asked for JSON and received HTML reports a parse error,
    // which is a worse thing to show somebody than the notice itself.
    const api = maintenanceReply('/api/trading/live');
    assert.match(api.contentType, /application\/json/);
    const parsed = JSON.parse(api.body) as { error: string; message: string };
    assert.equal(parsed.error, 'maintenance');
    assert.ok(parsed.message.length > 0);

    const page = maintenanceReply('/live');
    assert.match(page.contentType, /text\/html/);
    assert.match(page.body, /<!doctype html>/i);
    assert.match(page.body, /Under maintenance/i);
    // Self-contained: every asset is behind the same gate, so a page that
    // reached for one would render broken at the moment it must look
    // deliberate.
    assert.doesNotMatch(page.body, /<link[^>]+href=|<script[^>]+src=|<img/i,
      'the notice must not reference an asset it cannot load');
  }],

  ['the notice offers the public demo, and cannot be turned into a hole', () => {
    // Somebody landing on the apex during maintenance is not necessarily one of
    // the three who can sign in, and the demo is a working thing to look at.
    const page = maintenanceReply('/', {}).body;
    assert.match(page, /Try the public demo/);
    assert.match(page, /href="https:\/\/app\.vitalistradingsystems\.com\/\?demo=1"/,
      'the default must point at the public terminal\'s demo');
    // It must say what it is sending them to. "Demo" on a page about YOUR
    // terminal reads as your terminal in a limited mode, which it is not.
    assert.match(page, /not your account/i);

    // A configured URL is used...
    assert.equal(publicTerminalUrl({ PUBLIC_TERMINAL_URL: 'https://demo.example.com/x' }), 'https://demo.example.com/x');
    // ...but the value is an environment read, not a trusted input, and this
    // link is on the one page served to everybody signed in or not.
    for (const hostile of ['javascript:alert(1)', 'data:text/html,<script>', 'not a url', ' ']) {
      assert.equal(publicTerminalUrl({ PUBLIC_TERMINAL_URL: hostile }),
        'https://app.vitalistradingsystems.com/?demo=1', `"${hostile}" must not reach the href`);
    }
    // And a quote must not break out of the attribute into the markup.
    const escaped = maintenanceReply('/', { PUBLIC_TERMINAL_URL: 'https://x.example.com/"><script>alert(1)</script>' }).body;
    assert.doesNotMatch(escaped, /<script>/, 'the URL was not escaped before it reached the href');
  }],

  ['it answers 503 and says when to come back', () => {
    // Never 200: this is temporary, and saying so is what stops a crawler
    // recording the notice as the site's content.
    for (const url of ['/api/trading/live', '/live']) {
      assert.equal(maintenanceReply(url).status, 503, `${url} must answer 503`);
    }
    assert.ok(Number(MAINTENANCE_HEADERS['Retry-After']) > 0, 'Retry-After must be a positive number of seconds');
    assert.equal(MAINTENANCE_HEADERS['Cache-Control'], 'no-store',
      'a cached maintenance page outlives the maintenance');
  }],
];

let failed = 0;
for (const [name, run] of checks) {
  try { run(); console.log(`  ok  ${name}`); }
  catch (error) { failed += 1; console.error(`  FAIL  ${name}\n        ${error instanceof Error ? error.message : String(error)}`); }
}
if (failed > 0) { console.error(`\nMaintenance mode: ${failed} check(s) failed.`); process.exit(1); }
console.log(`Maintenance mode: ${checks.length} checks passed.`);
