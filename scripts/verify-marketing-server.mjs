// The marketing server, as a process.
//
// The renderer is checked against the file; this checks the thing that is
// deployed: that with no portal configured the site serves the seed — today's
// page — that the health line says so, and that a bad path is a 404 rather
// than the page.
//
//   npm run verify:marketing-server

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

let pass = 0,
  fail = 0;
const ok = (cond, label, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
};
const norm = (h) => h.replace(/\s+/g, ' ').replace(/>\s+</g, '><').replace(/\s+>/g, '>').trim();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const PORT = 4712;
const B = `http://localhost:${PORT}`;
const start = (env) =>
  spawn('node', ['apps/marketing/server.mjs'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, PORT: String(PORT), ...env },
    stdio: 'ignore',
  });

console.log('\nA. NO PORTAL CONFIGURED — THE SEED IS THE PAGE');
let srv = start({ SITE_CONTENT_ORIGIN: '' });
await wait(900);
let r = await fetch(`${B}/`);
const page = await r.text();
const file = readFileSync(new URL('../apps/marketing/src/index.html', import.meta.url), 'utf8');
ok(r.status === 200 && norm(page) === norm(file), 'the root serves what src/index.html contains');
ok((r.headers.get('content-security-policy') ?? '').includes('youtube-nocookie.com'), 'the CSP allows the video host by name');
ok((r.headers.get('content-security-policy') ?? '').includes("frame-ancestors 'none'"), 'and still refuses to be framed');
r = await fetch(`${B}/styles.css`);
ok(r.status === 200 && (await r.text()).includes('.hero{'), 'the stylesheet is served');
r = await fetch(`${B}/healthz`);
let h = await r.json();
ok(h.ok === true && h.portal === null, 'health says no portal is configured', JSON.stringify(h));
r = await fetch(`${B}/nope`);
ok(r.status === 404, 'a missing path is a 404, not the page', `${r.status}`);
r = await fetch(`${B}/../server.mjs`);
ok(r.status === 404 || r.status === 400, 'and the tree cannot be walked', `${r.status}`);
r = await fetch(`${B}/files/anything.png`);
ok(r.status === 404, 'a file with no portal to fetch from is a 404', `${r.status}`);
r = await fetch(`${B}/`, { method: 'POST' });
ok(r.status === 405, 'writes are refused', `${r.status}`);
srv.kill();
await wait(300);

console.log('\nB. A PORTAL THAT ANSWERS');
// A stand-in for the private API's public route.
const { createServer } = await import('node:http');
const model = JSON.parse(JSON.stringify((await import('../apps/marketing/render/seed.mjs')).MARKETING_SEED));
model.sections[0].h1 = 'PUBLISHED FROM THE PORTAL';
let served = 0;
let maint = false;
const fake = createServer((req, res) => {
  if (req.url === '/api/public/site/marketing/state') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ maintenance: maint }));
  }
  if (req.url === '/api/public/site/marketing/content') {
    served++;
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ model, publishedAt: '2026-09-02T00:00:00Z' }));
  }
  if (req.url === '/api/public/site/marketing/files/pic.png') {
    res.writeHead(200, { 'content-type': 'image/png', 'content-length': '3' });
    return res.end('PNG');
  }
  res.writeHead(404);
  res.end();
}).listen(4713);
srv = start({ SITE_CONTENT_ORIGIN: 'http://localhost:4713/some/path?x=1', SITE_CONTENT_POLL_SECONDS: '1' });
await wait(1200);
r = await fetch(`${B}/`);
ok((await r.text()).includes('PUBLISHED FROM THE PORTAL'), 'the first visitor after boot gets the published page');
r = await fetch(`${B}/healthz`);
h = await r.json();
ok(h.portal === 'http://localhost:4713' && h.lastReadFromPortal?.published === true, 'health names the portal ORIGIN and the read', JSON.stringify(h));
r = await fetch(`${B}/files/pic.png`);
ok(r.status === 200 && (await r.text()) === 'PNG' && r.headers.get('content-type') === 'image/png', 'an uploaded file is passed through from the portal');
r = await fetch(`${B}/files/../secret`);
ok(r.status === 404, 'a file path that is not a slug is refused', `${r.status}`);

console.log('\nC. DOWN FOR MAINTENANCE');
maint = true;
await wait(1500);
r = await fetch(`${B}/`);
ok(r.status === 503 && (await r.text()).includes('Down for maintenance'), 'the switch replaces the page with the notice, as a 503', `${r.status}`);
ok(r.headers.get('retry-after') === '600' && r.headers.get('cache-control') === 'no-store', 'temporary, and never cached');
r = await fetch(`${B}/styles.css`);
ok(r.status === 503, 'every other path gets the notice too', `${r.status}`);
r = await fetch(`${B}/healthz`);
h = await r.json();
ok(r.status === 200 && h.maintenance === true, 'EXCEPT health, which still answers 200 and says so', JSON.stringify(h));
maint = false;
await wait(1500);
r = await fetch(`${B}/`);
ok(r.status === 200 && (await r.text()).includes('PUBLISHED FROM THE PORTAL'), 'off puts the page back exactly as it was');

// The portal goes away: the last good page stands, and a maintenance switch
// that was on FAILS OPEN — the portal being unreachable must never be what
// keeps the site down.
maint = true;
await wait(1500);
r = await fetch(`${B}/`);
ok(r.status === 503, 'maintenance is on again', `${r.status}`);
fake.close();
await wait(7500);
r = await fetch(`${B}/`);
ok(r.status === 200 && (await r.text()).includes('PUBLISHED FROM THE PORTAL'), 'when the portal stops answering, the last good page comes back on its own');
srv.kill();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
