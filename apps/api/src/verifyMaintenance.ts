import assert from 'node:assert/strict';
import { maintenanceExempt, maintenanceOn, maintenanceReply, MAINTENANCE_HEADERS } from './maintenance.js';

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
