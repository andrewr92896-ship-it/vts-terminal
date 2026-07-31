import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { marketNewsStreams, type MarketNewsStreamsRow } from '../db/schema.js';
import { cachedChannelIdForHandle, cachedLiveState, youtubeConfigured } from './youtube.js';

// How one trader has set up the Market News live-stream wall: the YouTube
// channels they follow and their personal viewing state (open streams and their
// order, the docked stream, the desired column count, per-channel go-live
// alerts). Personal, never shared — two traders on the same desk keep their own
// channel lists. A trader with no stored row falls back to the default set.

// A followed YouTube channel. Only the identity fields (key/name/handle/
// channelId) are persisted; the live-state fields are attached on read by
// `withLiveState` from a go-live poller — offline until that poller is wired.
export interface StreamChannel {
  key: string;
  name: string;
  handle: string;
  channelId: string;
  // Live-state — not persisted; filled per request once the YouTube poller
  // exists (see LIVE_STREAMS_CONFIGURED). Offline for everyone until then.
  live: boolean;
  streamTitle?: string;
  viewers?: string;
  lastLive?: string;
  lastTitle?: string;
}

export interface MarketNewsStreams {
  channels: StreamChannel[];
  watching: string[];
  docked: string | null;
  cols: number;
  notify: Record<string, boolean>;
}

// The identity subset actually written to the row.
type StoredChannel = Pick<StreamChannel, 'key' | 'name' | 'handle' | 'channelId'>;

// True once the YouTube Data API is wired up (a YOUTUBE_API_KEY is set), which
// is what makes live status, stream titles and viewer counts real. Without a
// key every channel reads offline and the screen says its live-state is sample.
// Channels that carry a channel ID still embed the keyless live_stream player,
// which plays when the channel is actually live regardless of this flag.
export function liveStreamsConfigured(): boolean {
  return youtubeConfigured();
}

const MAX_CHANNELS = 40;
const MAX_TEXT = 80;

// Real, working default channels — the desk's usual live sources. These are
// genuine channel handles/IDs, not sample data; only their live-state is
// unknown until the poller lands. Nothing is open by default.
const DEFAULT_CHANNELS: StoredChannel[] = [
  { key: 'fed', name: 'Federal Reserve', handle: '@federalreserve', channelId: 'UCAzhpt9DmG6PnHXjmJTvRGQ' },
  { key: 'reuters', name: 'Reuters', handle: '@Reuters', channelId: '' },
  { key: 'cnbc', name: 'CNBC Television', handle: '@CNBCtelevision', channelId: '' },
  { key: 'ecb', name: 'European Central Bank', handle: '@ecbeuro', channelId: '' },
];

export function defaultMarketNewsStreams(): MarketNewsStreams {
  return withLiveState({
    channels: DEFAULT_CHANNELS.map((c) => ({ ...c })),
    watching: [],
    docked: null,
    cols: 2,
    notify: {},
  });
}

// Attach live-state to each channel from the poller's cache, and fill in a
// channelId the poller has resolved from a handle (so a handle-only channel
// becomes embeddable without the trader re-saving it — the resolved id is NOT
// written back to the row; the cache is the source and it re-resolves cheaply).
// With no API key, or before the first poll, every channel reads offline.
function withLiveState(cfg: {
  channels: StoredChannel[];
  watching: string[];
  docked: string | null;
  cols: number;
  notify: Record<string, boolean>;
}): MarketNewsStreams {
  return {
    ...cfg,
    channels: cfg.channels.map((c) => {
      const channelId = c.channelId || (c.handle ? cachedChannelIdForHandle(c.handle) ?? '' : '');
      const live = channelId ? cachedLiveState(channelId) : undefined;
      return { ...c, channelId, live: false, ...live };
    }),
  };
}

function parseChannels(raw: string): StoredChannel[] {
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.flatMap((x) => {
      if (!x || typeof x !== 'object') return [];
      const o = x as Record<string, unknown>;
      const key = typeof o.key === 'string' ? o.key : '';
      const name = typeof o.name === 'string' ? o.name : '';
      if (!key || !name) return [];
      return [
        {
          key,
          name,
          handle: typeof o.handle === 'string' ? o.handle : '',
          channelId: typeof o.channelId === 'string' ? o.channelId : '',
        },
      ];
    });
  } catch {
    return [];
  }
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

// Trim to sane bounds and drop any dangling references — a `watching`/`docked`/
// `notify` entry that names a channel no longer in the list is discarded, and
// `cols` is clamped to the 1–6 the layout pills offer.
function sanitize(input: MarketNewsStreams): {
  channels: StoredChannel[];
  watching: string[];
  docked: string | null;
  cols: number;
  notify: Record<string, boolean>;
} {
  const channels: StoredChannel[] = [];
  const seen = new Set<string>();
  for (const c of input.channels.slice(0, MAX_CHANNELS)) {
    const key = c.key.slice(0, MAX_TEXT);
    const name = c.name.trim().slice(0, MAX_TEXT);
    if (!key || !name || seen.has(key)) continue;
    seen.add(key);
    channels.push({
      key,
      name,
      handle: (c.handle ?? '').trim().slice(0, MAX_TEXT),
      channelId: (c.channelId ?? '').trim().slice(0, MAX_TEXT),
    });
  }
  const keys = new Set(channels.map((c) => c.key));
  const watching = [...new Set(input.watching.filter((k) => keys.has(k)))].slice(0, MAX_CHANNELS);
  const docked = input.docked && keys.has(input.docked) ? input.docked : null;
  const cols = Math.min(6, Math.max(1, Math.round(input.cols) || 2));
  const notify: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(input.notify)) if (keys.has(k) && v) notify[k] = true;
  return { channels, watching, docked, cols, notify };
}

function rowToStreams(row: MarketNewsStreamsRow): MarketNewsStreams {
  const clean = sanitize({
    channels: parseChannels(row.channels).map((c) => ({ ...c, live: false })),
    watching: parseStrings(row.watching),
    docked: row.docked ?? null,
    cols: row.cols,
    notify: parseNotify(row.notify),
  });
  return withLiveState(clean);
}

// Every distinct channel any trader follows, deduped by channelId (or by handle
// when the id isn't known yet). This is the poller's work list — it polls the
// union of everyone's channels once, not once per trader, so the quota cost
// scales with distinct channels rather than with headcount.
//
// The default set counts only when NOBODY has saved a row yet: those defaults
// are what a new trader sees, so a fresh install still shows live status on day
// one. Once anyone has their own list, the defaults stop being polled — a desk
// that removed them and added its own channels must not keep paying quota for
// channels no one follows any more.
export async function listFollowedChannels(): Promise<{ handle: string; channelId: string }[]> {
  const rows = await db
    .select({ channels: marketNewsStreams.channels })
    .from(marketNewsStreams);
  const all: StoredChannel[] = rows.length === 0 ? [...DEFAULT_CHANNELS] : [];
  for (const r of rows) all.push(...parseChannels(r.channels));
  const out: { handle: string; channelId: string }[] = [];
  const seen = new Set<string>();
  for (const c of all) {
    const key = c.channelId || normKey(c.handle);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ handle: c.handle, channelId: c.channelId });
  }
  return out;
}

function normKey(handle: string): string {
  return (handle || '').trim().replace(/^@/, '').toLowerCase();
}

export async function getMarketNewsStreams(userId: string): Promise<MarketNewsStreams> {
  const row = (
    await db.select().from(marketNewsStreams).where(eq(marketNewsStreams.userId, userId)).limit(1)
  )[0];
  return row ? rowToStreams(row) : defaultMarketNewsStreams();
}

export async function setMarketNewsStreams(
  userId: string,
  streams: MarketNewsStreams,
): Promise<MarketNewsStreams> {
  const clean = sanitize(streams);
  const now = new Date();
  const values = {
    channels: JSON.stringify(clean.channels),
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
