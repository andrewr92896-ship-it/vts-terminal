#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const appRoot = process.argv[2];
const canonicalArg = process.argv.find((arg) => arg.startsWith('--canonical='));
const canonical = canonicalArg?.slice('--canonical='.length).replace(/\/$/, '');
if (!appRoot) {
  console.error('Usage: node scripts/serve-static-app.mjs <app-root> [--canonical=https://example.com]');
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

createServer((request, response) => {
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
});
