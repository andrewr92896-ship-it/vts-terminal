#!/usr/bin/env node
// The public terminal and the public API behind one origin, for testing.
//
// The two are separate services in production, sitting behind one hostname —
// the terminal reaches the API at `/public/v1/*` on its own origin. This is that
// arrangement, in one process, so a browser can be pointed at a REAL account
// rather than at the demo.
//
// It is a TEST HARNESS and is not the production server. The static half is
// deliberately the same `serve-static-app.mjs` behaviour (index.html for
// anything that is not a file), and the API half calls the request handler
// directly rather than proxying to a second process, so there is no second port
// and nothing to wait for.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const url = process.env.PUBLIC_DATABASE_URL;
if (!url) {
  console.error('PUBLIC_DATABASE_URL is required.');
  process.exit(1);
}

const { handleRequest } = await import('../apps/public-api/dist/src/server.js');
const { PostgresPublicStore } = await import('../apps/public-api/dist/src/postgresStore.js');

const store = new PostgresPublicStore(url);
// The market provider REFUSES, exactly as `HttpPublicMarketProvider` does when
// no upstream is configured — which is the state the public service actually
// ships in until one is wired. Answering `{}` instead was a shape production
// never serves, and the screens crashed on it for a reason that could never
// have happened; a 503 is the real thing they have to survive.
const refuse = async () => { throw Object.assign(new Error('Public market data provider is not configured.'), { status: 503 }); };
const market = { marketData: refuse, marketNews: refuse };

const root = path.resolve('apps/public-terminal/dist');
const port = Number(process.env.PORT || 4174);

// HTTPS, with a throwaway self-signed certificate, because the public API
// REFUSES a non-HTTPS entry in `PUBLIC_ALLOWED_ORIGINS` outright — a production
// safeguard, and one this harness must model rather than work around. Served
// over plain HTTP the browser's Origin was `http://…`, matched nothing, and the
// origin guard refused every write before it reached any code; the suite was
// read-only, so nothing noticed. The browser is told to accept the certificate
// (`ignoreHTTPSErrors`); nothing here is protecting anything.
const certDir = mkdtempSync(path.join(tmpdir(), 'vts-harness-tls-'));
const keyFile = path.join(certDir, 'key.pem');
const certFile = path.join(certDir, 'cert.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
  '-keyout', keyFile, '-out', certFile, '-subj', '/CN=127.0.0.1',
  '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
const tls = { key: readFileSync(keyFile), cert: readFileSync(certFile) };
const types = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'], ['.woff2', 'font/woff2'], ['.txt', 'text/plain; charset=utf-8'],
]);

createServer(tls, (request, response) => {
  const pathname = new URL(request.url || '/', 'http://harness.invalid').pathname;
  if (pathname.startsWith('/public/v1')) {
    handleRequest(request, response, { store, market }).catch((error) => {
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ message: String(error) }));
    });
    return;
  }
  const asked = path.join(root, pathname);
  const file = existsSync(asked) && statSync(asked).isFile() ? asked : path.join(root, 'index.html');
  response.writeHead(200, { 'Content-Type': types.get(path.extname(file)) ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => console.log(`public stack on https://127.0.0.1:${port}`));
