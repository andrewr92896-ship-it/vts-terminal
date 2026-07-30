// YouTube Data API client + in-memory caches for the Market News live-stream
// wall. Two jobs: resolve a channel `@handle` to its `UC…` channelId (so a
// handle-only channel becomes embeddable), and read a channel's live state
// (is it streaming now, the stream title, concurrent viewers). Both are read
// through the caches below; the background poller (youtubeWatch.ts) is the only
// thing that writes them.
//
// QUOTA is the governing constraint, and it dictates the whole approach. The
// Data API's default budget is 10,000 units/day. The obvious way to find a
// channel's current live video — `search.list?eventType=live` — costs **100
// units per channel per check**: four channels polled every five minutes would
// burn ~57,600 units/day and exhaust the budget before lunch, every day.
//
// So detection goes the cheap way instead, at **2 units** per channel per check
// (a 50× saving), which is what makes a real polling cadence affordable:
//
//   1. `channels.list?part=contentDetails` → the channel's uploads playlist id.
//      1 unit, and cached for the process's life (it never changes).
//   2. `playlistItems.list` → the few most recent video ids. 1 unit.
//   3. `videos.list?part=snippet,liveStreamingDetails` → the one whose
//      `liveBroadcastContent` is `live`, plus its concurrent viewers. 1 unit.
//
// A live broadcast surfaces in the channel's uploads feed, so steps 2–3 find it
// without ever paying for a search. `search.list` is kept as an explicit opt-in
// fallback (YOUTUBE_USE_SEARCH=true) for a channel whose live stream does not
// show up in uploads.
//
// On top of that: a daily unit ledger, a hard budget ceiling, and a hard stop
// when the API reports the quota exhausted. When the budget is spent the poller
// simply stops refreshing and the last known state ages out — nothing is faked.

import { config } from '../config.js';

const API = 'https://www.googleapis.com/youtube/v3';
const FETCH_TIMEOUT_MS = 8000;

// Cost in quota units of each endpoint we call (per the Data API docs).
const COST_SEARCH = 100;
const COST_VIDEOS = 1;
const COST_CHANNELS = 1;
const COST_PLAYLIST_ITEMS = 1;
// How many recent uploads to inspect for a live broadcast. A live stream sits at
// the top of the uploads feed; a few gives slack for a channel that published
// something else while streaming.
const RECENT_UPLOADS = 5;

// A cached live entry older than this is treated as unknown (offline), so a
// stalled poller can never leave a channel stuck showing LIVE. Comfortably
// larger than a sane poll interval.
const LIVE_TTL_MS = 30 * 60 * 1000;

export interface LiveState {
  live: boolean;
  streamTitle?: string;
  viewers?: string;
  lastLive?: string;
  lastTitle?: string;
}

interface LiveEntry extends LiveState {
  checkedAt: number;
}

// Read through `config`, not process.env: a hosting dashboard hands you an
// empty string the moment someone creates the variable and tabs away, and
// `blankAsUnset` there turns that back into "not configured" rather than
// letting the watch start and 400 on every call with an empty key.
function apiKey(): string {
  return config.YOUTUBE_API_KEY || '';
}
export function youtubeConfigured(): boolean {
  return !!apiKey();
}

// handle (normalized, no leading @) -> channelId. Positive results only.
const handleCache = new Map<string, string>();
// Handles that did NOT resolve, with when we last tried. Without this a handle
// that never resolves (a typo, a deleted channel) is re-queried on every single
// tick, forever — cheap per call but permanent, pointless spend. Retried only
// after HANDLE_RETRY_MS in case the channel later appears.
const handleMisses = new Map<string, number>();
const HANDLE_RETRY_MS = 6 * 60 * 60 * 1000;
// channelId -> live entry (with its own freshness stamp).
const liveCache = new Map<string, LiveEntry>();

// Normalize whatever is stored as a channel's handle to the bare handle the
// Data API's forHandle expects: strip a URL wrapper, a leading @, lowercase.
export function normHandle(raw: string): string {
  let h = (raw || '').trim();
  const at = h.match(/@[A-Za-z0-9._-]+/);
  if (at) h = at[0];
  else {
    const m = h.match(/youtube\.com\/@?([A-Za-z0-9._-]+)/i);
    if (m) h = m[1];
  }
  return h.replace(/^@/, '').toLowerCase();
}

export function cachedChannelIdForHandle(handle: string): string | undefined {
  const id = handleCache.get(normHandle(handle));
  return id || undefined;
}

// ---- pasting a link ----

// What a pasted reference turned out to be. A trader copies whatever is in
// their address bar, which is rarely the channel id: it may be a handle URL, a
// /channel/UC… URL, a watch/live/share link to the stream itself, or one of the
// legacy /c/ and /user/ vanity URLs.
export type ChannelRef =
  | { kind: 'channelId'; value: string }
  | { kind: 'handle'; value: string }
  | { kind: 'video'; value: string }
  | { kind: 'username'; value: string }
  | { kind: 'custom'; value: string }
  | { kind: 'unknown'; value: string };

// Parse a pasted reference without calling the API. Order matters: a watch URL
// can also carry a channel id in a query param, and a /channel/UC… URL contains
// something that looks like a path segment, so the most specific forms are
// tested first.
export function parseChannelRef(raw: string): ChannelRef {
  const s = (raw || '').trim();
  if (!s) return { kind: 'unknown', value: '' };

  // A bare channel id or a /channel/UC… URL.
  const id = s.match(/(?:^|\/|=)(UC[A-Za-z0-9_-]{20,})(?:$|[/?&#])/);
  if (id) return { kind: 'channelId', value: id[1] };

  // Video forms: watch?v=, youtu.be/, /live/, /shorts/, /embed/.
  const v =
    s.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
    s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/i) ||
    s.match(/youtube\.com\/(?:live|shorts|embed|v)\/([A-Za-z0-9_-]{11})/i);
  if (v) return { kind: 'video', value: v[1] };

  // Handle: @name, or youtube.com/@name.
  const h = s.match(/youtube\.com\/@([A-Za-z0-9._-]+)/i) || s.match(/^@([A-Za-z0-9._-]+)$/);
  if (h) return { kind: 'handle', value: h[1] };

  // Legacy vanity URLs.
  const user = s.match(/youtube\.com\/user\/([A-Za-z0-9._-]+)/i);
  if (user) return { kind: 'username', value: user[1] };
  const custom = s.match(/youtube\.com\/c\/([A-Za-z0-9._%-]+)/i);
  if (custom) return { kind: 'custom', value: decodeURIComponent(custom[1]) };

  // A bare word with no URL around it: treat as a handle, which is what a
  // trader typing "federalreserve" almost always means.
  if (/^[A-Za-z0-9._-]+$/.test(s)) return { kind: 'handle', value: s };
  return { kind: 'unknown', value: s };
}

// A channel identified well enough to follow.
export interface ResolvedChannel {
  channelId: string;
  name: string;
  handle: string;
}

// Read a channel's own details by id (1 unit). Gives us the display name and
// its canonical handle, so a trader never has to type either.
async function channelById(channelId: string): Promise<ResolvedChannel | null> {
  if (!canSpend(COST_CHANNELS)) return null;
  spend(COST_CHANNELS);
  const json = await fetchJson(`/channels?part=snippet&id=${encodeURIComponent(channelId)}`);
  const item = (json.items as { id?: string; snippet?: { title?: string; customUrl?: string } }[] | undefined)?.[0];
  if (!item?.id) return null;
  return {
    channelId: item.id,
    name: item.snippet?.title ?? '',
    handle: item.snippet?.customUrl ? `@${item.snippet.customUrl.replace(/^@/, '')}` : '',
  };
}

// Turn a pasted reference into a real channel. Costs 1–2 units and is only ever
// called from a trader's explicit "add this channel" action, never the poller.
// Returns null when the reference cannot be resolved (bad link, unknown handle,
// no API key, or over budget) — the caller decides what to tell the user.
export async function resolveChannelRef(raw: string): Promise<ResolvedChannel | null> {
  const ref = parseChannelRef(raw);
  if (ref.kind === 'unknown') return null;
  if (!youtubeConfigured()) return null;

  switch (ref.kind) {
    case 'channelId':
      return channelById(ref.value);

    case 'handle': {
      const id = await resolveHandle(ref.value);
      return id ? channelById(id) : null;
    }

    case 'video': {
      // A link to the stream itself: the video tells us whose channel it is.
      if (!canSpend(COST_VIDEOS)) return null;
      spend(COST_VIDEOS);
      const json = await fetchJson(`/videos?part=snippet&id=${encodeURIComponent(ref.value)}`);
      const snip = (json.items as { snippet?: { channelId?: string; channelTitle?: string } }[] | undefined)?.[0]
        ?.snippet;
      if (!snip?.channelId) return null;
      // Prefer the channel's own record (it carries the handle); fall back to
      // the title the video already gave us if that lookup is over budget.
      return (
        (await channelById(snip.channelId)) ?? {
          channelId: snip.channelId,
          name: snip.channelTitle ?? '',
          handle: '',
        }
      );
    }

    case 'username': {
      // Legacy /user/ URLs still have a direct, 1-unit lookup.
      if (!canSpend(COST_CHANNELS)) return null;
      spend(COST_CHANNELS);
      const json = await fetchJson(`/channels?part=snippet&forUsername=${encodeURIComponent(ref.value)}`);
      const item = (json.items as { id?: string; snippet?: { title?: string; customUrl?: string } }[] | undefined)?.[0];
      if (item?.id) {
        return {
          channelId: item.id,
          name: item.snippet?.title ?? '',
          handle: item.snippet?.customUrl ? `@${item.snippet.customUrl.replace(/^@/, '')}` : '',
        };
      }
      // Many /user/ URLs are also valid handles these days.
      const id = await resolveHandle(ref.value);
      return id ? channelById(id) : null;
    }

    case 'custom': {
      // A /c/ vanity URL has no direct lookup in the Data API. Try it as a
      // handle (usually the same word); otherwise give up rather than spend
      // 100 units on a search for a form that is mostly retired.
      const id = await resolveHandle(ref.value);
      return id ? channelById(id) : null;
    }
  }
}

export function cachedLiveState(channelId: string): LiveState | undefined {
  const e = liveCache.get(channelId);
  if (!e) return undefined;
  if (Date.now() - e.checkedAt > LIVE_TTL_MS) return undefined;
  const { checkedAt: _drop, ...state } = e;
  return state;
}

// ---- daily quota ledger ----
// The budget resets each UTC day (matching Google's quota reset). A 403 with
// reason quotaExceeded slams it shut for the rest of the day.
function dailyBudget(): number {
  const n = Number(process.env.YOUTUBE_DAILY_QUOTA);
  return Number.isFinite(n) && n > 0 ? n : 9000;
}
let ledgerDay = '';
let unitsUsed = 0;
let exhausted = false;

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}
function rollDay(): void {
  const d = utcDay();
  if (d !== ledgerDay) {
    ledgerDay = d;
    unitsUsed = 0;
    exhausted = false;
  }
}
function canSpend(units: number): boolean {
  rollDay();
  return !exhausted && unitsUsed + units <= dailyBudget();
}
function spend(units: number): void {
  unitsUsed += units;
}
export function quotaStatus(): { day: string; unitsUsed: number; budget: number; exhausted: boolean } {
  rollDay();
  return { day: ledgerDay, unitsUsed, budget: dailyBudget(), exhausted };
}

class QuotaError extends Error {}

async function fetchJson(path: string): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${API}${path}&key=${encodeURIComponent(apiKey())}`, {
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (res.status === 403) {
      // Distinguish a quota exhaustion (stop for the day) from other 403s.
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const reason = firstErrorReason(body);
      if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
        exhausted = true;
        throw new QuotaError(reason);
      }
      throw new Error(`YouTube 403 ${reason || ''}`.trim());
    }
    if (!res.ok) throw new Error(`YouTube ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

function firstErrorReason(body: Record<string, unknown>): string | undefined {
  const err = body.error as { errors?: { reason?: string }[] } | undefined;
  return err?.errors?.[0]?.reason;
}

function abbrevViewers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M watching`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K watching`;
  return `${n} watching`;
}

// Resolve a handle to a channelId (channels.list, 1 unit). Cached on success;
// returns the id, or null when unresolved or over budget.
export async function resolveHandle(rawHandle: string): Promise<string | null> {
  const handle = normHandle(rawHandle);
  if (!handle) return null;
  const hit = handleCache.get(handle);
  if (hit) return hit;
  const missedAt = handleMisses.get(handle);
  if (missedAt !== undefined && Date.now() - missedAt < HANDLE_RETRY_MS) return null;
  if (!youtubeConfigured() || !canSpend(COST_CHANNELS)) return null;
  spend(COST_CHANNELS);
  const json = await fetchJson(`/channels?part=id&forHandle=${encodeURIComponent(handle)}`);
  const items = (json.items as { id?: string }[] | undefined) ?? [];
  const id = items[0]?.id;
  if (id) {
    handleMisses.delete(handle);
    handleCache.set(handle, id);
    return id;
  }
  handleMisses.set(handle, Date.now());
  return null;
}

// channelId -> uploads playlist id. Never changes, so this is cached for the
// life of the process and costs 1 unit once per channel.
const uploadsCache = new Map<string, string>();

async function uploadsPlaylist(channelId: string): Promise<string | null> {
  const hit = uploadsCache.get(channelId);
  if (hit) return hit;
  if (!canSpend(COST_CHANNELS)) return null;
  spend(COST_CHANNELS);
  const json = await fetchJson(
    `/channels?part=contentDetails&id=${encodeURIComponent(channelId)}`,
  );
  const items = (json.items as
    | { contentDetails?: { relatedPlaylists?: { uploads?: string } } }[]
    | undefined) ?? [];
  const id = items[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!id) return null;
  uploadsCache.set(channelId, id);
  return id;
}

// Read a channel's current live state, the cheap way (2 units steady-state):
// the recent uploads give candidate video ids, and one videos.list says which
// (if any) is actually broadcasting plus its concurrent viewers. Writes the
// cache; returns the state, or null when over budget (leaving any prior entry
// to age out on its own TTL rather than asserting a stale reading).
export async function fetchLiveState(channelId: string): Promise<LiveState | null> {
  if (!youtubeConfigured()) return null;

  const playlist = await uploadsPlaylist(channelId);
  if (!playlist) return useSearchFallback() ? fetchLiveStateViaSearch(channelId) : null;

  if (!canSpend(COST_PLAYLIST_ITEMS)) return null;
  spend(COST_PLAYLIST_ITEMS);
  const recent = await fetchJson(
    `/playlistItems?part=contentDetails&playlistId=${encodeURIComponent(playlist)}&maxResults=${RECENT_UPLOADS}`,
  );
  const ids = ((recent.items as { contentDetails?: { videoId?: string } }[] | undefined) ?? [])
    .map((i) => i.contentDetails?.videoId)
    .filter((v): v is string => !!v);
  if (ids.length === 0) return cacheState(channelId, { live: false });

  if (!canSpend(COST_VIDEOS)) return null;
  spend(COST_VIDEOS);
  const vids = await fetchJson(
    `/videos?part=snippet,liveStreamingDetails&id=${encodeURIComponent(ids.join(','))}`,
  );
  const items = (vids.items as
    | {
        snippet?: { title?: string; liveBroadcastContent?: string };
        liveStreamingDetails?: { concurrentViewers?: string; actualEndTime?: string };
      }[]
    | undefined) ?? [];
  const liveVid = items.find((v) => v.snippet?.liveBroadcastContent === 'live');
  if (!liveVid) {
    // Not live. Name the most recent completed broadcast if there is one, so the
    // tile can read "Offline · last stream <title>" from real data.
    const past = items.find((v) => v.liveStreamingDetails?.actualEndTime);
    return cacheState(channelId, { live: false, lastTitle: past?.snippet?.title });
  }
  const cv = Number(liveVid.liveStreamingDetails?.concurrentViewers);
  return cacheState(channelId, {
    live: true,
    streamTitle: liveVid.snippet?.title,
    viewers: Number.isFinite(cv) && cv > 0 ? abbrevViewers(cv) : undefined,
  });
}

function cacheState(channelId: string, state: LiveState): LiveState {
  liveCache.set(channelId, { ...state, checkedAt: Date.now() });
  return state;
}

// Opt-in only. 100 units a call, so this is off unless a channel genuinely
// needs it (its live stream never appears in the uploads feed).
function useSearchFallback(): boolean {
  return (process.env.YOUTUBE_USE_SEARCH || '').toLowerCase() === 'true';
}

async function fetchLiveStateViaSearch(channelId: string): Promise<LiveState | null> {
  if (!canSpend(COST_SEARCH)) return null;
  spend(COST_SEARCH);
  const search = await fetchJson(
    `/search?part=snippet&channelId=${encodeURIComponent(channelId)}&eventType=live&type=video&maxResults=1`,
  );
  const found = (search.items as { id?: { videoId?: string }; snippet?: { title?: string } }[] | undefined) ?? [];
  const videoId = found[0]?.id?.videoId;
  if (!videoId) return cacheState(channelId, { live: false });
  let title = found[0]?.snippet?.title;
  let viewers: string | undefined;
  if (canSpend(COST_VIDEOS)) {
    spend(COST_VIDEOS);
    try {
      const vids = await fetchJson(`/videos?part=liveStreamingDetails,snippet&id=${encodeURIComponent(videoId)}`);
      const v = (vids.items as
        | { snippet?: { title?: string }; liveStreamingDetails?: { concurrentViewers?: string } }[]
        | undefined)?.[0];
      if (v?.snippet?.title) title = v.snippet.title;
      const cv = Number(v?.liveStreamingDetails?.concurrentViewers);
      if (Number.isFinite(cv) && cv > 0) viewers = abbrevViewers(cv);
    } catch {
      // A failed viewer refresh still leaves us confidently "live".
    }
  }
  return cacheState(channelId, { live: true, streamTitle: title, viewers });
}

export function isQuotaError(err: unknown): boolean {
  return err instanceof QuotaError;
}
