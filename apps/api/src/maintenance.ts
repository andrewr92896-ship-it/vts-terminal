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
export function maintenanceExempt(url: string): boolean {
  const path = url.split('?')[0] ?? '';
  return path === '/api/health' || path === '/api/health/';
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

export const MAINTENANCE_TITLE = 'VTS Terminal is temporarily unavailable';
export const MAINTENANCE_MESSAGE =
  'The terminal is closed for scheduled maintenance. Nothing has been lost — your records, trades and settings are exactly where you left them. Please try again later.';

// Self-contained on purpose: static assets are behind the same gate, so a page
// that reached for a stylesheet or a logo would render unstyled and broken at
// the one moment it needs to look deliberate.
function page(): string {
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
</style>
</head><body><main>
  <span class="tag">Under maintenance</span>
  <h1>${MAINTENANCE_TITLE}</h1>
  <p>${MAINTENANCE_MESSAGE}</p>
</main></body></html>`;
}

// An API caller gets JSON and a browser gets the page. A client that asked for
// JSON and received HTML reports a parse error, which is a worse thing to put
// in front of somebody than the notice itself.
export function maintenanceReply(url: string): MaintenanceReply {
  const path = url.split('?')[0] ?? '';
  if (path.startsWith('/api')) {
    return {
      status: 503,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ error: 'maintenance', message: MAINTENANCE_MESSAGE }),
    };
  }
  return { status: 503, contentType: 'text/html; charset=utf-8', body: page() };
}
