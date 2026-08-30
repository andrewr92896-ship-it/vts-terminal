// THE NOTICE, FOR A CLIENT THAT NEVER ASKS THE SERVER FOR A PAGE.
//
// `PRIVATE_MAINTENANCE` closes the terminal and the API serves a 503 notice in
// its place (`api/src/maintenance.ts`). That works perfectly for a browser that
// fetches the page — and not at all for the people it was written for. The
// terminal is an installed PWA with a precached shell, so a returning partner is
// served `index.html` out of their own device: the server's page is never
// requested, they get the ordinary sign-in screen, and submitting it fails with
// a generic error. Which is precisely the afternoon of "have I forgotten my own
// password?" the feature exists to prevent. It only appeared in a private
// window, where there is no worker to serve the stale shell.
//
// WHAT STILL REACHES A CACHED CLIENT IS EVERY API CALL — `/api` is deliberately
// never cached — so that is what carries the notice. `request()` reports the
// outcome of every response here, and the app draws the card.
//
// THE WORDING IS THE SERVER'S, NOT A COPY OF IT. The 503 body carries the
// title, the message and the demo link, so the served page and the in-app card
// cannot drift into saying different things. The constants below are only the
// fallback for a client cached from before the server sent them.

export type MaintenanceNotice = {
  title: string;
  message: string;
  demoUrl: string;
  demoNote: string;
};

const FALLBACK: MaintenanceNotice = {
  title: 'VTS Terminal is temporarily unavailable',
  message:
    'The terminal is closed for scheduled maintenance. Nothing has been lost — your records, trades and settings are exactly where you left them. Please try again later.',
  demoUrl: 'https://app.vitalistradingsystems.com/?demo=1',
  demoNote: 'A separate site with sample data. Nothing there is saved, and it is not your account.',
};

let notice: MaintenanceNotice | null = null;
const listeners = new Set<() => void>();

const str = (body: unknown, key: string): string | null => {
  if (!body || typeof body !== 'object') return null;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value : null;
};

// http(s) only, for the same reason the server checks it: this ends up in an
// href, and it arrives over the network.
const safeUrl = (value: string | null): string | null => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? value : null;
  } catch {
    return null;
  }
};

/**
 * Report what a response said. Called from `request()` for EVERY response,
 * because clearing matters as much as setting: the card is what the user is
 * looking at while it polls, so the moment the server answers as itself again
 * the terminal has to come back on its own.
 *
 * "As itself" is the test, not "successfully" — a 401 from a signed-out session
 * is the server working perfectly well. Only a 503 that names itself as
 * maintenance closes the app.
 */
export function noteResponse(status: number, body: unknown): void {
  const closed = status === 503 && str(body, 'error') === 'maintenance';
  if (!closed) {
    if (notice === null) return;
    notice = null;
    for (const listener of listeners) listener();
    return;
  }
  const next: MaintenanceNotice = {
    title: str(body, 'title') ?? FALLBACK.title,
    message: str(body, 'message') ?? FALLBACK.message,
    demoUrl: safeUrl(str(body, 'demoUrl')) ?? FALLBACK.demoUrl,
    demoNote: str(body, 'demoNote') ?? FALLBACK.demoNote,
  };
  // Still closed, and saying the same thing: nothing to redraw. The card polls
  // while it is up, so a store that handed out a fresh object each time would
  // re-render on every poll — and `useSyncExternalStore` compares by identity.
  if (notice
    && notice.title === next.title
    && notice.message === next.message
    && notice.demoUrl === next.demoUrl
    && notice.demoNote === next.demoNote) return;
  notice = next;
  for (const listener of listeners) listener();
}

export function maintenanceNotice(): MaintenanceNotice | null {
  return notice;
}

export function subscribeMaintenance(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
