// MAINTENANCE MODE — the terminal, deliberately closed.
//
// One environment variable takes the whole private portal off the air and puts
// a plain notice in its place. It exists because the alternative was worse: an
// account that cannot sign in is told "Invalid email or password", because that
// answer is deliberately generic and cannot distinguish a wrong password from a
// closed door. Somebody who is simply locked out for the afternoon should not
// spend it wondering whether they have forgotten their own password.
//
// WHY AN ENVIRONMENT VARIABLE RATHER THAN A DEPLOY. Turning it on is something
// you want to do while something is already wrong, and a code change means a
// build, a deploy, and a rollback to undo. This is one variable and a restart,
// in both directions, and it cannot be forgotten in the source tree.
//
// IT ALSO SILENCES THE WATCHES (see `server.ts`). A terminal that is closed
// must not still be buzzing people's phones about trades they cannot open the
// app to look at. That is the same switch because it is the same decision — and
// it is why this stops notifications without deleting a single row.
//
// WHAT IT DOES NOT DO: it deletes nothing, disconnects nothing, and revokes
// nothing. Turn it off and everything is exactly as it was.

/** On only for the exact string `true`, so a stray value cannot close the site. */
export function maintenanceOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.PRIVATE_MAINTENANCE ?? '').trim().toLowerCase() === 'true';
}

// THE ONE PATH THAT MUST KEEP ANSWERING. Railway health-checks `/api/health`,
// and a deploy whose health check fails is rolled back — so a maintenance mode
// that blocked it would refuse to deploy at all, which is a spectacular way for
// this feature to fail exactly when it is needed. Matched on the path alone so
// a query string cannot slip past it.
function isHealth(path: string): boolean {
  return path === '/api/health' || path === '/api/health/';
}

// AND THE APP SHELL'S OWN FILES, WHICH IS NOT A CONVENIENCE — IT IS WHAT STOPS
// MAINTENANCE MODE FREEZING EVERY INSTALLED DEVICE.
//
// The terminal is a PWA: a service worker precaches the shell, so a phone that
// already has the app never asks the server for a page and never sees the
// notice above. The client draws its own from the 503 on an API call instead
// (see `maintenanceReply`) — but only if the device is running a build that
// knows how to. Getting it there means the worker updating, and the worker
// updates by re-fetching itself and everything in its precache list. Gate
// those and the device is stuck on whatever build it had when the terminal
// closed, permanently, for as long as it stays closed. Which is exactly the
// case this is for.
//
// So the files a worker needs are served throughout. NOT the navigation: `/`
// still answers with the notice, so a browser arriving fresh gets it on the
// first request rather than a second after the app has booted. And never
// `/employee` — that surface is deliberately network-only and hardened, and a
// closed terminal must not leave it standing.
//
// What is served is public JavaScript, CSS, fonts and icons. It carries no data
// and reaches no data: every request the shell makes is an `/api` one, and
// those are all refused.
const SHELL_FILES = new Set([
  '/index.html',
  '/sw.js',
  '/registerSW.js',
  '/push-sw.js',
  '/manifest.webmanifest',
]);

// Matched on the EXTENSION, at any depth — the precache list is a glob over the
// whole build (`**/*.{js,css,html,svg,png,ico,woff,woff2}`), so anything it can
// reach has to be servable or the worker's install fails and it never updates.
// `.html` is deliberately absent: that is a navigation, and `/index.html` is
// named above as the one exception the precache genuinely fetches.
const SHELL_FILE_PATTERN = /\.(?:js|mjs|css|map|png|jpe?g|gif|ico|svg|webmanifest|woff2?|ttf|otf|json|txt|mp3|wav)$/;

export function maintenanceExempt(url: string): boolean {
  const path = url.split('?')[0] ?? '';
  if (isHealth(path)) return true;
  // The hardened surface stays closed with everything else, and no asset rule
  // may reach it — `employee.html` and its chunks are already kept out of the
  // precache for the same reason.
  const file = path.slice(path.lastIndexOf('/') + 1);
  if (path === '/employee' || path.startsWith('/employee/') || file.startsWith('employee.') || file.startsWith('employee-')) {
    return false;
  }
  if (path.startsWith('/api')) return false;
  return SHELL_FILES.has(path) || SHELL_FILE_PATTERN.test(path);
}

export type MaintenanceReply = { status: 503; contentType: string; body: string };

// 503 with `Retry-After`, never 200. This is a temporary condition, and saying
// so is what stops a crawler recording the notice as the site's actual content
// or treating the pages as gone.
const RETRY_AFTER_SECONDS = 3600;
export const MAINTENANCE_HEADERS: Record<string, string> = {
  'Retry-After': String(RETRY_AFTER_SECONDS),
  'Cache-Control': 'no-store',
};

// WHERE TO SEND SOMEBODY WHO CANNOT COME IN. The apex is the primary domain, so
// the people who land on this notice are not only the three who can sign in —
// and the public demo is a working thing to look at while the portal is closed.
//
// The default is the same URL the marketing site already uses for the demo. It
// is a default rather than a required variable so the button is there without
// anybody configuring it, and a variable rather than a literal so a changed
// domain is a restart instead of a deploy.
const PUBLIC_TERMINAL_DEFAULT = 'https://app.vitalistradingsystems.com/?demo=1';

export function publicTerminalUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = (env.PUBLIC_TERMINAL_URL ?? '').trim();
  if (!value) return PUBLIC_TERMINAL_DEFAULT;
  // http(s) ONLY. This string is put into an href, and an environment read is
  // not a trusted input: `javascript:` in a link on the one page served to
  // everybody, signed in or not, is a hole worth closing for two lines.
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return PUBLIC_TERMINAL_DEFAULT;
    return value;
  } catch {
    return PUBLIC_TERMINAL_DEFAULT;
  }
}

// Escaped before it reaches the attribute, for the same reason: a value with a
// quote in it would otherwise break out of the href and into the markup.
const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const MAINTENANCE_TITLE = 'VTS Terminal is temporarily unavailable';
export const MAINTENANCE_DEMO_NOTE =
  'A separate site with sample data. Nothing there is saved, and it is not your account.';
export const MAINTENANCE_MESSAGE =
  'The terminal is closed for scheduled maintenance. Nothing has been lost — your records, trades and settings are exactly where you left them. Please try again later.';

// Self-contained on purpose: static assets are behind the same gate, so a page
// that reached for a stylesheet or a logo would render unstyled and broken at
// the one moment it needs to look deliberate.
function page(env: NodeJS.ProcessEnv = process.env): string {
  const demo = escapeHtml(publicTerminalUrl(env));
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${MAINTENANCE_TITLE}</title>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;
    background:#050b18;color:#eef3ff;
    font:15px/1.6 'IBM Plex Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  main{width:min(520px,100%);background:#0a1426;border:1px solid #1e2e52;
    border-radius:14px;padding:32px}
  h1{margin:0 0 12px;font-size:20px;font-weight:700}
  p{margin:0;color:#9fb0d6;font-size:13.5px}
  .tag{display:inline-block;margin-bottom:18px;padding:4px 10px;border-radius:999px;
    border:1px solid #2a3d68;color:#7f90b6;font-size:11px;letter-spacing:.08em;
    text-transform:uppercase;font-family:'IBM Plex Mono',ui-monospace,monospace}
  a.demo{display:inline-block;margin-top:22px;padding:11px 20px;border-radius:9px;
    background:#5AC8FA;color:#04101f;font-size:13.5px;font-weight:700;text-decoration:none}
  a.demo:focus-visible{outline:2px solid #eef3ff;outline-offset:2px}
  .demo-note{margin-top:10px;color:#7f90b6;font-size:12px}
</style>
</head><body><main>
  <span class="tag">Under maintenance</span>
  <h1>${MAINTENANCE_TITLE}</h1>
  <p>${MAINTENANCE_MESSAGE}</p>
  <a class="demo" href="${demo}">Try the public demo</a>
  <p class="demo-note">${MAINTENANCE_DEMO_NOTE}</p>
</main></body></html>`;
}

// An API caller gets JSON and a browser gets the page. A client that asked for
// JSON and received HTML reports a parse error, which is a worse thing to put
// in front of somebody than the notice itself.
//
// THE JSON BODY IS NOT ONLY AN ERROR — IT IS HOW THE NOTICE REACHES A PHONE
// THAT ALREADY HAS THE APP. The terminal is an installed PWA with a precached
// shell, so a returning partner is served `index.html` out of their own device
// and the page above is never fetched at all: they got the ordinary sign-in
// screen and, on submitting it, a generic failure — which is the exact thing
// this feature exists to stop somebody spending an afternoon on. (That is why
// the notice only appeared in a private window, where there is no worker.)
//
// What DOES still reach a cached client is every API call, so the client reads
// this body and draws the same notice itself (`web/src/lib/maintenance.ts`).
// The wording and the demo link are sent from here rather than mirrored there,
// so the served page and the in-app card cannot come to say different things.
export function maintenanceReply(url: string, env: NodeJS.ProcessEnv = process.env): MaintenanceReply {
  const path = url.split('?')[0] ?? '';
  if (path.startsWith('/api')) {
    return {
      status: 503,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        error: 'maintenance',
        message: MAINTENANCE_MESSAGE,
        title: MAINTENANCE_TITLE,
        demoUrl: publicTerminalUrl(env),
        demoNote: MAINTENANCE_DEMO_NOTE,
      }),
    };
  }
  return { status: 503, contentType: 'text/html; charset=utf-8', body: page(env) };
}
