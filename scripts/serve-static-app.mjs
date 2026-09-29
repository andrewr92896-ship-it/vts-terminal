#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const appRoot = process.argv[2];
const canonicalArg = process.argv.find((arg) => arg.startsWith('--canonical='));
const canonical = canonicalArg?.slice('--canonical='.length).replace(/\/$/, '');
// `--market` mounts the one dynamic route this server has: the demo board's
// market data, read live from public providers by THIS process.
//
// It is a flag rather than always-on because this server also serves apps that
// have no board. The route has to live here at all because the demo runs in a
// browser with no session and the content-security policy below allows
// `connect-src 'self'` and nothing else — so a browser-side fetch to a data
// provider is refused before it is made, and this process is the only thing on
// the public side that can read one on the demo's behalf.
const marketEnabled = process.argv.includes('--market');
if (!appRoot) {
  console.error('Usage: node scripts/serve-static-app.mjs <app-root> [--canonical=https://example.com] [--market]');
  process.exit(1);
}
const root = path.resolve(appRoot, 'dist');
const port = Number(process.env.PORT || 3000);
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
]);

const MARKET_PATH = '/demo/market-data';
const CALENDAR_PATH = '/demo/market-news';

createServer(async (request, response) => {
  const host = String(request.headers.host || '').split(':')[0].toLowerCase();
  if (canonical && host.startsWith('www.')) {
    response.writeHead(308, { Location: canonical + (request.url || '/') });
    response.end();
    return;
  }
  let urlPath;
  try {
    urlPath = decodeURIComponent((request.url || '/').split('?')[0]);
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Bad request');
    return;
  }
  if (marketEnabled && urlPath === CALENDAR_PATH) {
    // The calendar only. Headlines are deliberately not served here — see
    // `calendarFeed.mjs` — so the bundle keeps its own, each naming its source.
    let calendar = [];
    try {
      const { readPublicCalendar } = await import('../apps/public-terminal/server/calendarFeed.mjs');
      calendar = await readPublicCalendar();
    } catch {
      calendar = [];
    }
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=300',
    });
    response.end(JSON.stringify({ calendar }));
    return;
  }

  if (marketEnabled && urlPath === MARKET_PATH) {
    // Read-only, no credential, no account data, same origin as the bundle.
    // A provider that will not answer is not an error here: the payload simply
    // carries Sample rows, and the client keeps whatever it already had.
    let payload;
    try {
      const { readPublicMarketData } = await import('../apps/public-terminal/server/marketFeed.mjs');
      payload = await readPublicMarketData();
    } catch {
      response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end('{"error":"market data unavailable"}');
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      // Short, because the demo is often left open on a screen during a
      // demonstration and a board pinned to a stale minute is the thing this
      // whole route exists to stop.
      'Cache-Control': 'public, max-age=60',
    });
    response.end(JSON.stringify(payload));
    return;
  }

  const candidate = path.resolve(root, '.' + (urlPath === '/' ? '/index.html' : urlPath));
  if (!candidate.startsWith(root + path.sep) || !existsSync(candidate) || !statSync(candidate).isFile()) {
    response.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': types.get(path.extname(candidate)) || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    // TradingView is allowed BY NAME, and nothing else is.
    //
    // The Live Wall's chart, watchlist and ticker tape are TradingView's public
    // embed widgets — the same ones the private portal uses. They take no
    // credential and carry no account data, so there is no boundary reason to
    // replace them, and replacing them with a drawing is what made the demo
    // look like a different product. A widget is a <script> from
    // s3.tradingview.com that renders an iframe from tradingview.com, so both
    // need naming; `default-src 'self'` alone silently blocks both and the tile
    // renders empty with no error anybody sees.
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' https://s3.tradingview.com https://www.tradingview.com",
      "frame-src https://www.tradingview.com https://s.tradingview.com",
      "connect-src 'self' https://*.tradingview.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://*.tradingview.com",
      "font-src 'self' data:",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join('; '),
  });
  createReadStream(candidate).pipe(response);
}).listen(port, '0.0.0.0', () => {
  console.log(`Static app listening on ${port}`);
  if (!marketEnabled) return;
  // WARM IT ON BOOT, AND KEEP IT WARM. A cold process would make the first
  // visitor wait on the providers, and the first visitor during a demonstration
  // is the demonstration. Refreshed on an unref'd timer so it never holds the
  // process open, and failures are swallowed: an unreachable provider leaves
  // the board on Sample rows, which is the designed outcome rather than an
  // error worth restarting for.
  const warm = async () => {
    try {
      const { readPublicMarketData } = await import('../apps/public-terminal/server/marketFeed.mjs');
      const { readPublicCalendar } = await import('../apps/public-terminal/server/calendarFeed.mjs');
      await Promise.all([readPublicMarketData(), readPublicCalendar()]);
    } catch (error) {
      console.warn('market feed warm-up failed:', error?.message ?? error);
    }
  };
  warm();
  setInterval(warm, 10 * 60_000).unref();
});
