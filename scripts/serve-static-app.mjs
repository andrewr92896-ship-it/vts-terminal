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
  const urlPath = decodeURIComponent((request.url || '/').split('?')[0]);
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
  });
  createReadStream(candidate).pipe(response);
}).listen(port, '0.0.0.0', () => {
  console.log(`Static app listening on ${port}`);
});
