import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { marketNewsStreams, type MarketNewsStreamsRow } from '../db/schema.js';

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

// Flipped on once a server-side YouTube Data API poller populates live status,
// stream titles and viewer counts. Until then every channel reads offline and
// the screen says its live-state is sample. Channels that carry a channel ID
// still embed the keyless live_stream player, which plays when the channel is
// actually live regardless of this flag.
export const LIVE_STREAMS_CONFIGURED = false;

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

// Attach live-state to each channel. A no-op-shaped seam: when a go-live poller
// is added, look each channel up here instead of stamping everything offline.
function withLiveState(cfg: {
  channels: StoredChannel[];
  watching: string[];
  docked: string | null;
  cols: number;
  notify: Record<string, boolean>;
}): MarketNewsStreams {
  return { ...cfg, channels: cfg.channels.map((c) => ({ ...c, live: false })) };
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
