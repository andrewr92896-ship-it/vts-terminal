#!/usr/bin/env node
// vitalistradingsystems.com — the marketing site's own server.
//
// It was a static file server (scripts/serve-static-app.mjs). It still serves
// the stylesheet, robots.txt and the viewer script that way; what changed is
// that the PAGE is rendered per request from a document, and the document is
// read off the private portal, where the Site Editor writes it.
//
// THE SEED IS THE FALLBACK, AND THE SEED IS TODAY'S PAGE. With no portal
// address set, or a portal that has never answered, this serves exactly what
// the hand-written file served — verify:marketing-render is what pins that.
// Once the portal has answered, its last good document stands until a newer
// one replaces it: an outage at the portal is a page that stops updating, not
// a page that disappears. Same shape as the portfolio's site-state read.
//
// THE PORTAL IS NEVER IMPORTED, ONLY ASKED. This service must not carry any
// private code (scripts/verify-public-boundary.mjs), so what crosses the line
// is one public JSON route and one public file route, both read-only.

import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarketing, validateMarketing } from './render/render.mjs';
import { MARKETING_SEED } from './render/seed.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, 'src');
const port = Number(process.env.PORT || 3000);
const canonical = (process.env.CANONICAL_ORIGIN || 'https://vitalistradingsystems.com').replace(/\/$/, '');

/**
 * Where the portal is. The ORIGIN is what is configured; both routes are
 * derived from it, so the two cannot be pointed at different places.
 */
function portalOrigin() {
  const raw = process.env.SITE_CONTENT_ORIGIN ?? '';
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    console.warn(`[marketing] SITE_CONTENT_ORIGIN is not a URL: ${raw}`);
    return '';
  }
}
const ORIGIN = portalOrigin();
const CONTENT_URL = ORIGIN ? `${ORIGIN}/api/public/site/marketing/content` : '';
const FILES_URL = ORIGIN ? `${ORIGIN}/api/public/site/marketing/files/` : '';
const POLL_MS = Number(process.env.SITE_CONTENT_POLL_SECONDS || 15) * 1000;

let model = MARKETING_SEED;
let page = renderMarketing(model);
let lastRead = null;
let publishedAt = null;

async function readOnce() {
  if (!CONTENT_URL) return;
  try {
    const res = await fetch(CONTENT_URL, { signal: AbortSignal.timeout(8000) });
    if (res.status === 404) {
      // Nothing published yet: the seed is the page, and that is correct.
      lastRead = { at: Date.now(), published: false };
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const next = body?.model;
    const problem = validateMarketing(next);
    if (problem) throw new Error(`document refused: ${problem}`);
    if (JSON.stringify(next) !== JSON.stringify(model)) {
      model = next;
      page = renderMarketing(model);
      console.log(`[marketing] page updated (published ${body.publishedAt ?? 'unknown'})`);
    }
    publishedAt = body.publishedAt ?? null;
    lastRead = { at: Date.now(), published: true };
  } catch (err) {
    console.warn(`[marketing] could not read the portal: ${err.message}`);
  }
}

const types = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
]);

const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  // TradingView is allowed BY NAME, as before, and YouTube's no-cookie host is
  // the one addition: a video block is an iframe from it. Nothing else.
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' https://s3.tradingview.com https://www.tradingview.com",
    "frame-src https://www.tradingview.com https://s.tradingview.com https://www.youtube-nocookie.com",
    "connect-src 'self' https://*.tradingview.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://*.tradingview.com",
    "font-src 'self' data:",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; '),
};

function text(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { ...HEADERS, 'Content-Type': type });
  res.end(body);
}

/** An uploaded file, fetched from the portal and passed through. */
async function proxyFile(slug, req, res) {
  if (!FILES_URL || !/^[a-z0-9][a-z0-9.-]*$/.test(slug)) return text(res, 404, 'Not found');
  try {
    const upstream = await fetch(FILES_URL + encodeURIComponent(slug), { signal: AbortSignal.timeout(15000) });
    if (!upstream.ok) return text(res, upstream.status === 404 ? 404 : 502, 'Not found');
    const headers = { ...HEADERS };
    for (const h of ['content-type', 'content-length', 'content-disposition', 'cache-control', 'etag']) {
      const v = upstream.headers.get(h);
      if (v) headers[h] = v;
    }
    res.writeHead(200, headers);
    if (req.method === 'HEAD' || !upstream.body) return res.end();
    for await (const chunk of upstream.body) res.write(chunk);
    res.end();
  } catch (err) {
    console.warn(`[marketing] file ${slug}: ${err.message}`);
    text(res, 502, 'Not available');
  }
}

const server = createServer(async (req, res) => {
  const host = String(req.headers.host || '').split(':')[0].toLowerCase();
  if (host.startsWith('www.')) {
    res.writeHead(308, { Location: canonical + (req.url || '/') });
    return res.end();
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return text(res, 405, 'Method not allowed');
  let urlPath;
  try {
    urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch {
    return text(res, 400, 'Bad request');
  }

  if (urlPath === '/' || urlPath === '/index.html') {
    res.writeHead(200, { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(req.method === 'HEAD' ? undefined : page);
  }
  if (urlPath === '/healthz') {
    return text(
      res,
      200,
      JSON.stringify({ ok: true, portal: ORIGIN || null, lastReadFromPortal: lastRead, publishedAt }),
      'application/json; charset=utf-8',
    );
  }
  if (urlPath.startsWith('/files/')) return proxyFile(urlPath.slice('/files/'.length), req, res);

  const candidate = path.resolve(root, '.' + urlPath);
  if (!candidate.startsWith(root + path.sep) || !existsSync(candidate) || !statSync(candidate).isFile()) {
    return text(res, 404, 'Not found');
  }
  res.writeHead(200, {
    ...HEADERS,
    'Content-Type': types.get(path.extname(candidate)) || 'application/octet-stream',
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(candidate).pipe(res);
});

// The first read is awaited so the first visitor after a deploy gets the
// published page rather than the seed for one poll interval.
await readOnce();
if (CONTENT_URL) {
  const timer = setInterval(readOnce, POLL_MS);
  timer.unref();
  console.log(`[marketing] reading ${CONTENT_URL} every ${POLL_MS / 1000}s`);
} else {
  console.log('[marketing] SITE_CONTENT_ORIGIN unset — serving the seed');
}
server.listen(port, '0.0.0.0', () => console.log(`Marketing site listening on ${port}`));

// So a test can import this file without it listening: only the process that
// was RUN starts the server. (import.meta.url is the file; argv[1] the entry.)
export { readOnce };
