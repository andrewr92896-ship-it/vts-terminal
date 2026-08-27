#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import path from 'node:path';
import vm from 'node:vm';

const PUBLIC_ROOTS = ['apps/marketing', 'apps/public-terminal'];
const TERMINAL_ROOTS = ['apps/public-terminal/src', 'apps/public-terminal/dist'];
const TEXT_EXTENSIONS = /\.(?:html|css|js|mjs|ts|tsx|json|txt|svg)$/i;
const LEGACY_BOUNDARY_RULES = [
  ['private portal hostname', /portal\.vitalistradingsystems\.com/i],
  ['private web import', /(?:^|["'`/])apps\/web(?:["'`/]|$)/i],
  ['private API import', /(?:^|["'`/])apps\/api(?:["'`/]|$)/i],
  ['private package import', /@vts\/(?:web|api)\b/i],
  ['private environment identifier', /\bPRIVATE_[A-Z0-9_]+\b/],
  ['private session identifier', /\bvts_portal_session\b/i],
  ['credential key identifier', /\bCREDENTIALS_KEY\b/],
  ['broker credential identifier', /\b(?:KRAKEN_API_(?:KEY|SECRET)|OANDA_(?:API_TOKEN|ACCOUNT_ID))\b/],
];
const ISOLATION_RULES = [
  ['fetch', /(?:^|[^.$\w])fetch\s*\(/m],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['EventSource', /\bEventSource\b/],
  ['sendBeacon', /\bsendBeacon\s*\(/],
  ['service worker', /\b(?:navigator\s*\.\s*)?serviceWorker\b/i],
  ['dynamic remote import', /\bimport\s*\(\s*["'`]\s*(?:https?:)?\/\//i],
  ['external HTTP(S) URL', /\bhttps?:\/\//i],
  ['protocol-relative external asset', /(?:src|href|action)\s*=\s*["']\/\//i],
  ['API route', /["'`]\/api(?:\/|[?&#"'`])/i],
  ['credentialed request option', /\b(?:credentials\s*:|withCredentials\s*=|Authorization\s*:)/i],
  ['Web Credentials API', /\b(?:navigator\s*\.\s*credentials|PasswordCredential|FederatedCredential)\b/i],
  ['programmatic form submission', /\.\s*(?:submit|requestSubmit)\s*\(/],
  ['HTML form destination', /<form\b[^>]*\b(?:action|method)\s*=/i],
  ['document.cookie', /\bdocument\s*\.\s*cookie\b/i],
  ['localStorage', /\blocalStorage\b/i],
  ['sessionStorage', /\bsessionStorage\b/i],
  ['IndexedDB', /\bindexedDB\b/i],
  ['Cache API', /\bcaches\s*\.\s*(?:open|match|put|delete|keys)\s*\(/i],
  ['analytics or tracking SDK', /\b(?:gtag|ga|fbq|_paq)\s*\(|\b(?:mixpanel|posthog|analytics|dataLayer)\s*\./i],
  ['hidden embed', /<(?:iframe|embed|object)\b/i],
];
const PROHIBITED_CONCEPTS = [
  ['private/group/admin/partner surface', /\b(?:private|group|admin|partner)[ -]?(?:feed|portal|dashboard|workspace|route|api)\b/i],
  ['broker connection', /\b(?:connect(?:ed|ion)?\s+(?:to\s+)?(?:a\s+)?broker|broker\s+(?:connection|account|integration|credential))\b/i],
  ['order placement or execution', /\b(?:place|submit|execute|route|fill|cancel)(?:s|d|ing)?\s+(?:an?\s+)?(?:live\s+|real\s+)?(?:order|trade)s?\b/i],
  ['copy trading', /\b(?:enable|start|offer|use|activate|automate)(?:\w|[ -]){0,24}\bcopy[ -]?trading\b/i],
  ['personalized recommendation or signal', /\b(?:personalized|individualized|tailored|your)\s+(?:trading\s+|investment\s+)?(?:recommendation|signal)s?\b/i],
  ['broad general-purpose AI', /\b(?:general[ -]purpose\s+AI|AI\s+(?:assistant|chatbot|copilot)|ask\s+(?:the\s+)?AI\s+anything)\b/i],
  ['live credential claim', /\b(?:enter|save|store|connect|use)(?:s|d|ing)?\s+(?:your\s+)?(?:live|real)\s+(?:API\s+)?credentials?\b/i],
  ['real-performance claim', /\b(?:actual|live|verified|audited|real)\s+(?:returns?|performance|P&L|profits?|track\s+record)\b/i],
];

let failures = 0;
const fail = (message) => { failures += 1; console.error(`FAIL ${message}`); };
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const next = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(next) : [next];
});
const isExplicitDisclaimer = (line) => /\b(?:no|not|never|cannot|can't|does not|doesn't|without)\b/i.test(line);

function violationsFor(text, includeIsolation) {
  const violations = [];
  for (const [label, pattern] of LEGACY_BOUNDARY_RULES) {
    if (pattern.test(text)) violations.push(label);
  }
  if (!includeIsolation) return violations;
  for (const [label, pattern] of ISOLATION_RULES) {
    if (pattern.test(text)) violations.push(label);
  }
  for (const line of text.split(/\r?\n/)) {
    if (isExplicitDisclaimer(line)) continue;
    for (const [label, pattern] of PROHIBITED_CONCEPTS) {
      if (pattern.test(line)) violations.push(label);
    }
  }
  return [...new Set(violations)];
}

function scan(root, includeIsolation) {
  for (const file of walk(root)) {
    if (!TEXT_EXTENSIONS.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const label of violationsFor(text, includeIsolation)) fail(`${file} contains forbidden ${label}`);
  }
}

function verifyScannerRules() {
  const forbiddenSamples = [
    ['fetch', 'fetch("./payload")'],
    ['XMLHttpRequest', 'new XMLHttpRequest()'],
    ['WebSocket', 'new WebSocket("wss://example.test")'],
    ['EventSource', 'new EventSource("/events")'],
    ['sendBeacon', 'navigator.sendBeacon("/collect", data)'],
    ['service worker', 'navigator.serviceWorker.register("sw.js")'],
    ['dynamic remote import', 'import("https://example.test/module.js")'],
    ['external HTTP(S) URL', '<img src="https://example.test/pixel.png">'],
    ['API route', 'const endpoint = "/api/session"'],
    ['credentialed request option', 'const options = { credentials: "include" }'],
    ['Web Credentials API', 'navigator.credentials.get({ password: true })'],
    ['programmatic form submission', 'form.requestSubmit()'],
    ['HTML form destination', '<form method="post">'],
    ['document.cookie', 'document.cookie = "demo=1"'],
    ['localStorage', 'localStorage.setItem("x", "y")'],
    ['sessionStorage', 'sessionStorage.getItem("x")'],
    ['IndexedDB', 'indexedDB.open("demo")'],
    ['Cache API', 'caches.open("demo")'],
    ['analytics or tracking SDK', 'gtag("event", "open")'],
    ['hidden embed', '<iframe hidden src="./other.html"></iframe>'],
    ['private/group/admin/partner surface', 'Open the partner feed dashboard'],
    ['broker connection', 'Connect to a broker account'],
    ['order placement or execution', 'Execute live orders'],
    ['copy trading', 'Enable automated copy trading'],
    ['personalized recommendation or signal', 'View your personalized trading signals'],
    ['broad general-purpose AI', 'Ask the AI anything'],
    ['live credential claim', 'Save your live API credentials'],
    ['real-performance claim', 'Verified performance since inception'],
  ];
  for (const [expected, sample] of forbiddenSamples) {
    if (!violationsFor(sample, true).includes(expected)) fail(`scanner self-test missed ${expected}`);
  }
  const permitted = [
    '<form id="feedback-form"><button type="submit">Save in memory</button></form>',
    "form.addEventListener('submit', function (event) { event.preventDefault(); })",
    'No broker connection, order placement, copy trading, or personalized recommendations are available.',
    'This demo does not show real performance and never accepts live credentials.',
    'Run the simulated local extraction and save the fictional draft in memory only.',
  ];
  for (const sample of permitted) {
    const found = violationsFor(sample, true);
    if (found.length) fail(`scanner false-positive self-test for ${JSON.stringify(sample)}: ${found.join(', ')}`);
  }
}

function verifyResetContract() {
  const source = readFileSync('apps/public-terminal/src/app.js', 'utf8');
  const html = readFileSync('apps/public-terminal/src/index.html', 'utf8');
  const start = source.indexOf('var initialTrades =');
  const end = source.indexOf('var titles =');
  if (start < 0 || end < 0 || end <= start) {
    fail('public demo initial state cannot be inspected deterministically');
    return;
  }
  const initialization = source.slice(start, end);
  const snapshot = vm.runInNewContext(`(function () { ${initialization}\nreturn { initialTrades, state }; })()`);
  const fixture = snapshot.initialTrades.map(({ id, symbol, result }) => ({ id, symbol, result }));
  const expected = [
    { id: 1, symbol: 'EUR/USD', result: 186 },
    { id: 2, symbol: 'ES', result: 312 },
    { id: 3, symbol: 'AAPL', result: -94 },
    { id: 4, symbol: 'CL', result: 0 },
    { id: 5, symbol: 'GBP/USD', result: -128 },
    { id: 6, symbol: 'MSFT', result: 142 },
    { id: 7, symbol: 'GC', result: 220 },
    { id: 8, symbol: 'NVDA', result: -76 },
  ];
  if (JSON.stringify(fixture) !== JSON.stringify(expected)) fail('fresh runtime does not begin with the original eight-record fictional fixture');
  if (snapshot.state.view !== 'dashboard') fail('fresh runtime does not begin on dashboard');
  if (snapshot.state.masked !== false) fail('fresh runtime privacy default changed');
  if (snapshot.state.selectedId !== null) fail('fresh runtime begins with a selected record');
  if (snapshot.state.extracted !== false) fail('fresh runtime begins with a confirmed extraction');
  if (snapshot.state.photoAdded !== false) fail('fresh runtime begins with a confirmed demo addition');
  if (!Array.isArray(snapshot.state.feedback) || snapshot.state.feedback.length !== 0) fail('fresh runtime feedback draft is not empty');
  if (snapshot.state.trades.length !== snapshot.initialTrades.length || snapshot.state.trades === snapshot.initialTrades) fail('fresh runtime fixture is not an isolated in-memory copy');

  const draftStart = source.indexOf('var draftDefaults =');
  const draftEnd = source.indexOf('var extractButton =');
  if (draftStart < 0 || draftEnd <= draftStart) {
    fail('public demo draft defaults cannot be inspected deterministically');
    return;
  }
  const draftDefaults = vm.runInNewContext(`(function () { ${source.slice(draftStart, draftEnd)}\nreturn draftDefaults; })()`);
  const expectedDraft = {
    symbol: 'NQ', side: 'Long', date: '2026-08-26', quantity: '1', entry: '19862', exit: '19901',
    setup: 'Opening range reclaim', note: 'Waited for price to reclaim the opening range, then recorded the close after momentum slowed.',
  };
  if (JSON.stringify(draftDefaults) !== JSON.stringify(expectedDraft)) fail('fresh runtime preloaded extraction draft changed');
  for (const [id, value] of Object.entries(expectedDraft)) {
    if (id === 'side' || id === 'note') continue;
    const tag = html.match(new RegExp(`<input\\b[^>]*\\bid=["']draft-${id}["'][^>]*>`, 'i'))?.[0] || '';
    const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`\\bvalue=["']${escapedValue}["']`).test(tag)) fail(`fresh page draft-${id} does not match its reset value`);
  }
  const sideSelect = html.match(/<select\b[^>]*\bid=["']draft-side["'][^>]*>[\s\S]*?<\/select>/i)?.[0] || '';
  if (!/<select\b[^>]*>\s*<option\b[^>]*>\s*Long\s*<\/option>/i.test(sideSelect)) fail('fresh page draft side does not match its reset value');
  const note = html.match(/<textarea\b[^>]*\bid=["']draft-note["'][^>]*>([\s\S]*?)<\/textarea>/i)?.[1];
  if (note !== expectedDraft.note) fail('fresh page draft note does not match its reset value');
  if (!/<button\b[^>]*\bid=["']confirm-draft["'][^>]*\bdisabled\b/i.test(html)) fail('fresh page begins with a confirmable demo addition');
  const feedbackDraft = html.match(/<textarea\b[^>]*\bid=["']feedback-message["'][^>]*>([\s\S]*?)<\/textarea>/i)?.[1];
  if (feedbackDraft !== '') fail('fresh page feedback draft is not empty');
}

function verifyFormsAreMemoryOnly() {
  const html = readFileSync('apps/public-terminal/src/index.html', 'utf8');
  const source = readFileSync('apps/public-terminal/src/app.js', 'utf8');
  const formIds = [...html.matchAll(/<form\b[^>]*\bid=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
  if (!formIds.length) fail('public demo form contract has no forms to verify');
  for (const id of formIds) {
    const binding = source.match(new RegExp(`var\\s+(\\w+)\\s*=\\s*document\\.getElementById\\(["']${id}["']\\)`));
    if (!binding) {
      fail(`public form ${id} has no local JavaScript binding`);
      continue;
    }
    const listener = `${binding[1]}.addEventListener('submit', function (event) {\n    event.preventDefault();`;
    if (!source.includes(listener)) fail(`public form ${id} is not synchronously blocked with preventDefault`);
  }
}

function resolveLocalReference(ownerFile, reference) {
  const clean = reference.split(/[?#]/)[0];
  if (!clean || clean.startsWith('#') || clean.startsWith('data:')) return null;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(clean)) return false;
  return path.resolve(path.dirname(ownerFile), clean);
}

function verifyAssetGraph(root) {
  const entry = path.join(root, 'index.html');
  const pending = [entry];
  const visited = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    if (!existsSync(file)) {
      fail(`local asset graph references missing file ${file}`);
      continue;
    }
    const text = readFileSync(file, 'utf8');
    const references = [];
    if (/\.html$/i.test(file)) {
      for (const match of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) references.push(match[1]);
    }
    if (/\.css$/i.test(file)) {
      for (const match of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) references.push(match[1]);
      for (const match of text.matchAll(/@import\s+["']([^"']+)["']/gi)) references.push(match[1]);
    }
    if (/\.(?:js|mjs)$/i.test(file)) {
      for (const match of text.matchAll(/\bimport(?:\s+[^"']*?\s+from\s+|\s*\(\s*)["']([^"']+)["']/g)) references.push(match[1]);
    }
    for (const reference of references) {
      const resolved = resolveLocalReference(file, reference);
      if (resolved === false) fail(`${file} references non-local asset ${reference}`);
      else if (resolved) pending.push(resolved);
    }
  }
  const expected = ['app.js', 'index.html', 'styles.css'];
  const actual = [...visited].map((file) => path.relative(root, file)).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`public browser asset graph changed: ${actual.join(', ')}`);
}

function request(port, method, requestPath) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, method, path: requestPath }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`static server did not start: ${output}`)), 5000);
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/Static app listening on (\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`static server exited with ${code}: ${output}`));
    });
  });
}

async function verifyStaticServer() {
  const child = spawn(process.execPath, ['scripts/serve-static-app.mjs', 'apps/public-terminal'], {
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const port = await waitForServer(child);
    const cases = [
      ['GET', '/', 200],
      ['HEAD', '/app.js', 200],
      ['POST', '/', 405],
      ['OPTIONS', '/', 405],
      ['GET', '/api', 404],
      ['GET', '/api/session', 404],
      ['GET', '/missing', 404],
    ];
    for (const [method, requestPath, expectedStatus] of cases) {
      const response = await request(port, method, requestPath);
      if (response.status !== expectedStatus) fail(`${method} ${requestPath} returned ${response.status}, expected ${expectedStatus}`);
      if (response.headers['set-cookie']) fail(`${method} ${requestPath} set a cookie`);
      if (response.headers['x-content-type-options'] !== 'nosniff') fail(`${method} ${requestPath} omitted nosniff`);
      if (response.headers['referrer-policy'] !== 'strict-origin-when-cross-origin') fail(`${method} ${requestPath} omitted referrer policy`);
      if (!response.headers['permissions-policy']) fail(`${method} ${requestPath} omitted permissions policy`);
      const csp = response.headers['content-security-policy'] || '';
      for (const directive of ["connect-src 'none'", "form-action 'none'", "frame-ancestors 'none'", "script-src 'self'", "style-src 'self'"]) {
        if (!csp.includes(directive)) fail(`${method} ${requestPath} CSP omitted ${directive}`);
      }
      if (expectedStatus === 405 && response.headers.allow !== 'GET, HEAD') fail(`${method} ${requestPath} omitted Allow: GET, HEAD`);
      if (method === 'HEAD' && response.body.length !== 0) fail(`HEAD ${requestPath} returned a response body`);
    }
  } catch (error) {
    fail(error.message);
  } finally {
    child.kill();
  }
}

for (const script of ['build:marketing', 'build:public']) {
  const run = spawnSync('npm', ['run', script], { stdio: 'inherit', shell: true });
  if (run.status !== 0) process.exit(run.status ?? 1);
}

verifyScannerRules();
for (const root of PUBLIC_ROOTS) {
  scan(path.join(root, 'src'), root === 'apps/public-terminal');
  scan(path.join(root, 'dist'), root === 'apps/public-terminal');
}
verifyResetContract();
verifyFormsAreMemoryOnly();
verifyAssetGraph('apps/public-terminal/dist');
await verifyStaticServer();

const marketing = readFileSync('apps/marketing/src/index.html', 'utf8');
if (!marketing.includes('https://app.vitalistradingsystems.com')) fail('marketing login link does not target the public application');
if (!existsSync('apps/web/public/robots.txt') || !readFileSync('apps/web/public/robots.txt', 'utf8').includes('Disallow: /')) fail('private portal robots.txt is not deny-all');
const authRoutes = readFileSync('apps/api/src/routes/auth.ts', 'utf8');
if (authRoutes.includes("app.post('/api/auth/demo'")) fail('private portal still registers credential-free demo login');
const earlyAccess = readFileSync('apps/api/src/routes/earlyAccess.ts', 'utf8');
if (earlyAccess.includes("app.post('/api/early-access'")) fail('private portal still registers public early-access admission');
const sessions = readFileSync('apps/api/src/auth/sessions.ts', 'utf8');
if (!sessions.includes('config.PRIVATE_SESSION_COOKIE')) fail('private sessions do not use the private cookie configuration');
const privateServer = readFileSync('apps/api/src/server.ts', 'utf8');
if (!privateServer.includes("X-Robots-Tag', 'noindex, nofollow")) fail('private portal does not set X-Robots-Tag');

if (failures) process.exit(1);
console.log('Public demo isolation and public/private build boundary checks passed.');
