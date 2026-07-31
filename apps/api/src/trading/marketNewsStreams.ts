import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { marketNewsStreams, type MarketNewsStreamsRow } from '../db/schema.js';
import {
  cachedChannelIdForHandle,
  cachedLiveState,
  channelIdFromRef,
  normHandle,
  youtubeConfigured,
} from './youtube.js';

// The Market News live-stream wall: a **curated, code-resident** list of news
// channels, plus each trader's own view state over it (which streams are open
// and in what order, which one is docked, the column count, and which channels
// buzz them when they go live).
//
// The catalog is deliberately fixed rather than user-editable, and that is a
// scaling decision, not a limitation. Live status costs YouTube Data API quota
// **per distinct channel** — the poller checks the deduped union of what is
// followed and every viewer reads one shared cache, so ten users cost the same
// as ten thousand. A fixed catalog therefore decouples quota from headcount
// entirely: this list at a five-minute cadence costs the same on a private desk
// as it would with the whole public signed up. Let users add arbitrary channels
// and distinct-channel count grows with the user base, which the 10,000
// units/day budget cannot absorb. Keep the catalog bounded (see the table in
// CLAUDE.md — roughly 15 channels at 5 minutes, or 20 at 10).
//
// This mirrors how Market Data works: catalog in code, arrangement per user.

// A channel on the wall. The identity fields come from the catalog below; the
// live-state fields are attached per request from the poller's cache.
export interface StreamChannel {
  key: string;
  name: string;
  handle: string;
  channelId: string;
  // Marks a channel that broadcasts continuously, so the trader can tell at a
  // glance which tiles will actually be playing versus which sit dark until
  // there is something to cover. Catalog fact, not a live reading.
  alwaysOn?: boolean;
  live: boolean;
  streamTitle?: string;
  viewers?: string;
  lastLive?: string;
  lastTitle?: string;
}

// What one trader has saved: view state only. No channel list — that is code.
export interface MarketNewsView {
  watching: string[];
  docked: string | null;
  cols: number;
  notify: Record<string, boolean>;
}

// What the screen receives: the catalog with live-state, plus that view state.
export interface MarketNewsStreams extends MarketNewsView {
  channels: StreamChannel[];
}

type CatalogChannel = Pick<StreamChannel, 'key' | 'name' | 'handle' | 'channelId' | 'alwaysOn'>;

// ---------------------------------------------------------------------------
// The curated catalog. Real channels, identical for every user.
//
// To add a channel: append a row with a stable `key` (a saved `watching` /
// `notify` entry references it), the display name, and whatever identifies the
// channel. To remove one, delete the row — stale references in saved rows are
// dropped on read.
//
// The `handle` field takes **any YouTube URL or a bare @handle** — paste the
// address bar and it is parsed (see parseYouTubeRef). Which form you paste only
// changes how the id is obtained:
//
//   .../channel/UC…   the id is read straight out of the URL. Free, instant,
//                     works with no API key — leave `channelId` blank.
//   .../@handle       resolved once by the poller (1 quota unit) and cached, so
//                     the tile cannot embed until that first resolution.
//
// So filling in `channelId` by hand is never required; it is just the same
// answer a /channel/ URL already gives you for nothing.
// ---------------------------------------------------------------------------
const CATALOG: CatalogChannel[] = [
  // ---- Always on ----
  // These run a continuous live stream, so a tile here is playing essentially
  // whenever the wall is open. Listed first because they are what you want
  // sitting open beside the headlines.
  { key: 'bloomberg', name: 'Bloomberg Television', handle: '@markets', channelId: '', alwaysOn: true },
  { key: 'yahoofinance', name: 'Yahoo Finance', handle: '@YahooFinance', channelId: '', alwaysOn: true },
  { key: 'skynews', name: 'Sky News', handle: '@SkyNews', channelId: '', alwaysOn: true },
  { key: 'dwnews', name: 'DW News', handle: '@dwnews', channelId: '', alwaysOn: true },
  { key: 'aljazeera', name: 'Al Jazeera English', handle: '@aljazeeraenglish', channelId: '', alwaysOn: true },

  // ---- When they broadcast ----
  // Dark most of the time and live for the thing you actually care about, so
  // arm the bell rather than keeping a tile open. The Fed is live for maybe a
  // few hours a month (FOMC statements and Chair pressers) — but those are the
  // hours that matter most on this desk, which is why it stays.
  {
    key: 'fed',
    name: 'Federal Reserve',
    handle: '@federalreserve',
    channelId: 'UCAzhpt9DmG6PnHXjmJTvRGQ',
  },
  { key: 'ecb', name: 'European Central Bank', handle: '@ecbeuro', channelId: '' },
  { key: 'reuters', name: 'Reuters', handle: '@Reuters', channelId: '' },
];

const CATALOG_KEYS = new Set(CATALOG.map((c) => c.key));

// True once the YouTube Data API is wired up (a YOUTUBE_API_KEY is set), which
// is what makes live status, stream titles and viewer counts real. Without a
// key every channel reads offline and the screen says its live-state is sample.
// A channel that carries a channel ID still embeds the keyless live_stream
// player, which plays when the channel is actually live regardless of this flag.
export function liveStreamsConfigured(): boolean {
  return youtubeConfigured();
}

export function defaultMarketNewsView(): MarketNewsView {
  return { watching: [], docked: null, cols: 2, notify: {} };
}

// The poller's work list: the catalog, which is the whole point — a fixed set
// whose cost never grows with the number of traders using the portal.
export function listFollowedChannels(): { handle: string; channelId: string }[] {
  return CATALOG.map((c) => ({ handle: c.handle, channelId: c.channelId }));
}

// The channel id for a catalog row, cheapest source first: the id written into
// the row, then one carried by the `handle` field itself (a /channel/UC… URL —
// free, no API call), then one the poller resolved from the handle. '' means
// the channel is not embeddable yet.
//
// Every caller uses this: the screen, the poller's round-robin, and the go-live
// notifier all have to agree on which id a row means, or a channel resolves one
// way for the wall and another for the buzz.
export function resolvedChannelId(c: { channelId: string; handle: string }): string {
  // Both fields go through the parser, so a URL pasted into either one works and
  // a malformed id is rejected rather than passed to the embed as if it were one.
  const explicit = channelIdFromRef(c.channelId);
  if (explicit) return explicit;
  if (!c.handle) return '';
  return channelIdFromRef(c.handle) || cachedChannelIdForHandle(c.handle) || '';
}

// The catalog's `handle` field is an *input* — it accepts a pasted URL of any
// shape — but the client renders it on the tile and builds a channel link from
// it, so the payload carries the tidy `@name` form instead of whatever was
// pasted. A row identified only by a /channel/ URL has no handle, and reads ''.
function displayHandle(raw: string): string {
  const h = normHandle(raw);
  return h ? `@${h}` : '';
}

// Attach live-state to each catalog entry, and fill in a channelId the poller
// resolved from a handle (so a handle-only channel becomes embeddable without
// anyone editing code — the resolved id lives in the cache, not the catalog).
function withLiveState(view: MarketNewsView): MarketNewsStreams {
  return {
    ...view,
    channels: CATALOG.map((c) => {
      const channelId = resolvedChannelId(c);
      const live = channelId ? cachedLiveState(channelId) : undefined;
      return { ...c, channelId, handle: displayHandle(c.handle), live: false, ...live };
    }),
  };
}

function parseStrings(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

function parseNotify(raw: string): Record<string, boolean> {
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: Record<string, boolean> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === 'boolean') out[k] = val;
    }
    return out;
  } catch {
    return {};
  }
}

// Drop anything that doesn't name a catalog channel and clamp `cols` to the 1–6
// the layout pills offer. This is also what quietly cleans up after a catalog
// edit: a row still referencing a removed channel simply loses that reference.
function sanitize(view: MarketNewsView): MarketNewsView {
  const watching = [...new Set(view.watching.filter((k) => CATALOG_KEYS.has(k)))];
  const docked = view.docked && CATALOG_KEYS.has(view.docked) ? view.docked : null;
  const cols = Math.min(6, Math.max(1, Math.round(view.cols) || 2));
  const notify: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(view.notify)) if (CATALOG_KEYS.has(k) && v) notify[k] = true;
  return { watching, docked, cols, notify };
}

function rowToView(row: MarketNewsStreamsRow): MarketNewsView {
  return sanitize({
    watching: parseStrings(row.watching),
    docked: row.docked ?? null,
    cols: row.cols,
    notify: parseNotify(row.notify),
  });
}

export async function getMarketNewsStreams(userId: string): Promise<MarketNewsStreams> {
  const row = (
    await db.select().from(marketNewsStreams).where(eq(marketNewsStreams.userId, userId)).limit(1)
  )[0];
  return withLiveState(row ? rowToView(row) : defaultMarketNewsView());
}

export async function setMarketNewsStreams(
  userId: string,
  view: MarketNewsView,
): Promise<MarketNewsStreams> {
  const clean = sanitize(view);
  const now = new Date();
  const values = {
    watching: JSON.stringify(clean.watching),
    docked: clean.docked,
    cols: clean.cols,
    notify: JSON.stringify(clean.notify),
  };
  await db
    .insert(marketNewsStreams)
    .values({ id: crypto.randomUUID(), userId, ...values, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: marketNewsStreams.userId, set: { ...values, updatedAt: now } });
  return withLiveState(clean);
}

// Every channel the notifier may need to name, for the go-live push.
export function catalogChannel(channelId: string, handle: string): CatalogChannel | undefined {
  return CATALOG.find(
    (c) =>
      (!!channelId && resolvedChannelId(c) === channelId) ||
      (!!c.handle && normHandle(c.handle) === normHandle(handle)),
  );
}

export function catalogChannels(): CatalogChannel[] {
  return CATALOG;
}
