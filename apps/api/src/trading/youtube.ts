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
  // The live video's own id when this reading came from the Data API. The wall
  // embeds a video id rather than the flaky live_stream endpoint, so recording
  // it here gives a second, independent way to get a playable tile on installs
  // that do have a key — the keyless page read is the first.
  videoId?: string;
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

// ---- Identifying a channel from whatever you were given ----
//
// A channel can be named four ways, and only one of them costs nothing:
//
//   youtube.com/channel/UC…   the id, literally — free, no API call
//   youtube.com/@handle       a handle, resolvable for 1 unit
//   youtube.com/c/Name        a legacy custom URL; usually the handle too
//   youtube.com/user/Name     a legacy username; may not equal the handle
//
// So parsing is not cosmetic: reading `/channel/UC…` correctly is the
// difference between a free answer and a quota-spending lookup, and reading it
// *incorrectly* is worse than not trying — the old parser turned that URL into
// the handle "channel", which spends a unit, fails, and gets negative-cached.

// A YouTube channel id: "UC" + 22 chars of base64url. Checked rather than
// trusted, so a malformed path segment can never be passed off as an id.
const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;

export interface YouTubeRef {
  // Set when the input names the channel by id — nothing to resolve.
  channelId: string;
  // Set when the input names it by handle/custom name — resolvable for 1 unit.
  handle: string;
}

// Pull whatever identifies a channel out of a bare handle or any YouTube URL.
// Both fields empty means the input named no channel (a /watch URL, junk).
export function parseYouTubeRef(raw: string): YouTubeRef {
  const text = (raw || '').trim();
  if (!text) return { channelId: '', handle: '' };

  // A bare id, or one sitting in a /channel/ path.
  const idPath = text.match(/channel\/(UC[A-Za-z0-9_-]{22})/);
  if (idPath) return { channelId: idPath[1], handle: '' };
  if (CHANNEL_ID_RE.test(text)) return { channelId: text, handle: '' };

  // A handle, with or without a URL around it: /@name, or just @name.
  const at = text.match(/@([A-Za-z0-9._-]+)/);
  if (at) return { channelId: '', handle: at[1].toLowerCase() };

  // Legacy custom-URL forms. Best effort: these usually match the handle, but
  // /user/ is a pre-handle username and may not, in which case the resolver
  // simply misses and the row stays handle-only.
  const legacy = text.match(/youtube\.com\/(?:c|user)\/([A-Za-z0-9._-]+)/i);
  if (legacy) return { channelId: '', handle: legacy[1].toLowerCase() };

  // Any other youtube.com URL (/watch, /playlist, /results…) names no channel.
  if (/youtube\.com|youtu\.be/i.test(text)) return { channelId: '', handle: '' };

  // Not a URL at all — treat it as a bare handle typed without the @.
  const bare = text.match(/^[A-Za-z0-9._-]+$/);
  return { channelId: '', handle: bare ? text.toLowerCase() : '' };
}

// The channel id an input carries outright, or '' when it carries none. This is
// the free path — no API key, no quota, no waiting for the poller.
export function channelIdFromRef(raw: string): string {
  return parseYouTubeRef(raw).channelId;
}

// Resolve a handle to its channel id WITHOUT the Data API, by reading the
// channel's own page. YouTube renders the id into the HTML in several places;
// the canonical link is the most stable, with the embedded JSON as a fallback.
//
// Why this exists: users paste `youtube.com/@Name` far more often than the
// `/channel/UC…` form, and without an id a tile cannot embed at all. Going
// through the Data API instead would mean a channel is unusable until an API key
// is configured and the poller has run — for a link the trader just pasted and
// expects to work. This costs no quota and needs no key.
//
// Best-effort by design: a layout change upstream makes this return null, which
// simply leaves the channel handle-only until the API path (if configured)
// resolves it. It never throws and never blocks for long.
const CHANNEL_PAGE_TIMEOUT_MS = 6000;

export async function resolveHandleKeyless(rawHandle: string): Promise<string | null> {
  const handle = normHandle(rawHandle);
  if (!handle) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CHANNEL_PAGE_TIMEOUT_MS);
    const res = await fetch(`https://www.youtube.com/@${encodeURIComponent(handle)}`, {
      signal: ctrl.signal,
      headers: {
        // Without a browser-ish UA YouTube serves a consent/interstitial page
        // that carries no channel id.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    const canonical = html.match(
      /<link\s+rel="canonical"\s+href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/,
    );
    if (canonical) return canonical[1];
    const embedded = html.match(/"(?:channelId|externalId)":"(UC[A-Za-z0-9_-]{22})"/);
    return embedded ? embedded[1] : null;
  } catch {
    return null;
  }
}

// The channel id for whatever was pasted, cheapest route first: read it out of
// the URL (free), then the channel page (free), then the Data API (1 unit, and
// only when a key is set). Returns '' when nothing resolved.
export async function resolveChannelId(raw: string): Promise<string> {
  const direct = channelIdFromRef(raw);
  if (direct) return direct;
  const handle = normHandle(raw);
  if (!handle) return '';
  const cached = handleCache.get(handle);
  if (cached) return cached;
  const keyless = await resolveHandleKeyless(handle);
  if (keyless) {
    handleCache.set(handle, keyless);
    handleMisses.delete(handle);
    return keyless;
  }
  return (await resolveHandle(handle)) ?? '';
}

// The bare handle the Data API's `forHandle` expects (no @, lowercased), or ''
// when the input names the channel some other way. Callers treat '' as "nothing
// to look up" rather than looking up an empty handle.
export function normHandle(raw: string): string {
  return parseYouTubeRef(raw).handle;
}

export function cachedChannelIdForHandle(handle: string): string | undefined {
  const id = handleCache.get(normHandle(handle));
  return id || undefined;
}

export function cachedLiveState(channelId: string): LiveState | undefined {
  const e = liveCache.get(channelId);
  if (!e) return undefined;
  if (Date.now() - e.checkedAt > LIVE_TTL_MS) return undefined;
  const { checkedAt: _drop, ...state } = e;
  return state;
}

// ---------------------------------------------------------------------------
// The live *video*, resolved without a key — what actually makes a tile play
// ---------------------------------------------------------------------------
//
// The wall used to embed `youtube.com/embed/live_stream?channel=<id>` and rely
// on that endpoint to find the channel's current broadcast by itself. It is the
// only keyless option that needs nothing but a channel id, but it is also
// unreliable: it renders "This video is unavailable" for channels that are
// plainly live, and it is the reason four tiles could sit dead at once.
//
// Embedding a **video id** — the ordinary `youtube.com/embed/<videoId>` player —
// has no such problem. So the job here is to learn that id for free: a channel's
// own `/live` page redirects to whatever it is broadcasting, and names it in the
// canonical link. When the channel is dark the page canonicalizes back to the
// channel itself and there is no video id to find, which is the offline answer.
//
// This matters most for the one channel that is dark nearly all the time. The
// Fed streams a press conference eight times a year, and those are the hours
// this wall exists for: the path that lights that tile up cannot be the one that
// depends on an API key being present, because the key is optional and the
// meeting is not repeatable. This route needs no key, no quota and no poller —
// it is the same free channel-page read `resolveHandleKeyless` already does.
//
// A **scheduled** broadcast is reported too, with `live: false`. The Fed puts
// its stream up as a waiting room before the press conference starts, and
// embedding that is exactly right — the tile shows YouTube's own "starts in…"
// countdown and rolls into the stream by itself at the top of the hour, with
// nobody watching for the moment it flips.

export interface LiveVideo {
  videoId: string;
  title?: string;
  // True only while actually broadcasting. A waiting room is `false` — it may
  // be embedded, but it must never be badged LIVE.
  live: boolean;
  // A broadcast that has been scheduled but has not started.
  upcoming: boolean;
}

// The outcome of one read, and the distinction that matters: `ok` says the page
// was actually fetched and understood. `ok: true, video: null` is "we looked and
// the channel is dark" — a real answer. `ok: false` is "we could not find out",
// which must NOT be reported as darkness, or a channel the server simply cannot
// reach gets a confident "not live right now" and loses the fallback embed that
// would otherwise have played it.
export interface LiveRead {
  video: LiveVideo | null;
  ok: boolean;
}

interface LiveVideoEntry extends LiveRead {
  checkedAt: number;
}

// How long an answer stands before it is re-read. The dark figure is the one
// that decides how long after the Fed goes live the tile starts playing, so it
// is deliberately short: worst case here plus the screen's own poll, i.e. under
// three minutes. It costs one plain page fetch per channel, cached across every
// desk watching it, so a tighter cadence is affordable in a way the Data API's
// quota never was.
const LIVE_VIDEO_TTL_LIVE_MS = 90 * 1000;
const LIVE_VIDEO_TTL_DARK_MS = 2 * 60 * 1000;
// A failed read is retried sooner than a dark one — it carries no information,
// and the sooner it is replaced by a real answer the better.
const LIVE_VIDEO_TTL_FAILED_MS = 60 * 1000;
const LIVE_PAGE_TIMEOUT_MS = 6000;

const liveVideoCache = new Map<string, LiveVideoEntry>();
// Reads in flight, keyed by channel, so a burst of readers shares one fetch —
// and so a caller that wants to wait can await the one already running.
const liveVideoPending = new Map<string, Promise<void>>();

// Past this an answer is too old to stand behind at all and the channel reads as
// unknown again. Far longer than the refresh cadences above, because this is not
// the "go and re-read" threshold — it is the "stop believing the last answer"
// one.
const LIVE_VIDEO_MAX_AGE_MS = 15 * 60 * 1000;

// Whether it is time to re-read. Governs fetching only.
function liveVideoFresh(e: LiveVideoEntry): boolean {
  const ttl = !e.ok
    ? LIVE_VIDEO_TTL_FAILED_MS
    : e.video?.live
      ? LIVE_VIDEO_TTL_LIVE_MS
      : LIVE_VIDEO_TTL_DARK_MS;
  return Date.now() - e.checkedAt < ttl;
}

// What we currently believe — **stale-while-revalidate**, and that distinction is
// the whole point. The TTLs above decide when to go and look again; they must not
// decide what to show in the meantime.
//
// Tying the two together is a bug with teeth: a stream that is playing perfectly
// well drops out of the payload the moment its 90-second reading expires, so the
// tile blanks until a background read lands — and a page refresh timed into that
// gap makes a working stream vanish. The last answer stands until a new one
// replaces it, or until it is old enough (LIVE_VIDEO_MAX_AGE_MS) that believing
// it would be worse than admitting we do not know.
export function cachedLiveRead(channelId: string): LiveRead | undefined {
  const e = liveVideoCache.get(channelId);
  if (!e) return undefined;
  if (Date.now() - e.checkedAt > LIVE_VIDEO_MAX_AGE_MS) return undefined;
  return { video: e.video, ok: e.ok };
}

// Read the channel's `/live` page and report what it is broadcasting. Never
// throws: a failure comes back as `ok: false`, which the tile treats as "unknown"
// and falls back on, rather than as darkness.
export async function fetchLiveVideo(channelId: string): Promise<LiveRead> {
  if (!CHANNEL_ID_RE.test(channelId)) return { video: null, ok: false };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), LIVE_PAGE_TIMEOUT_MS);
    const res = await fetch(`https://www.youtube.com/channel/${channelId}/live`, {
      signal: ctrl.signal,
      headers: {
        // Same reason as resolveHandleKeyless: without a browser-ish UA YouTube
        // serves a consent interstitial that names no video.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return { video: null, ok: false };
    return readLivePage(await res.text());
  } catch {
    return { video: null, ok: false };
  }
}

// The parsing half, split out from the fetch so it can be exercised directly
// against saved pages.
//
// The `ok` flag is the whole point of the split return. A page we understood
// says either "here is the broadcast" or "this channel is dark" — both are
// answers. A page we did not understand (a consent wall, a bot check, markup
// that moved) carries no canonical link at all, and must be reported as a
// non-answer so the tile keeps its fallback instead of being told the channel
// is off air.
export function readLivePage(html: string): LiveRead {
  const canonical = html.match(
    /<link\s+rel="canonical"\s+href="https:\/\/www\.youtube\.com\/(watch\?v=[A-Za-z0-9_-]{11}|channel\/UC[A-Za-z0-9_-]{22}|@[A-Za-z0-9._-]+)"/,
  );
  // No canonical link of any recognised shape: this is not a page we read.
  if (!canonical) return { video: null, ok: false };
  return { video: parseLivePage(html), ok: true };
}

// What the page says is playing, or null when it says nothing is. Callers that
// need to tell "nothing" from "could not read" use readLivePage.
export function parseLivePage(html: string): LiveVideo | null {
  try {
    // The canonical link is the reliable one: on a live (or scheduled) channel
    // it points at the watch URL, and on a dark one back at the channel.
    const canonical = html.match(
      /<link\s+rel="canonical"\s+href="https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})"/,
    );
    const videoId = canonical?.[1];
    if (!videoId) return null;

    // Distinguish "broadcasting now" from "scheduled", and both from a finished
    // stream. This is the part to be careful with: `/live` on a dark channel
    // sometimes lands on the *last* broadcast, whose page still says it was live
    // content. Reading that as live would park a replay of the last press
    // conference in the tile and badge it LIVE — worse than showing nothing.
    //
    // So only the two present-tense flags count. `isLiveNow` is the player's own
    // "it is happening right now"; `liveBroadcastContent` is the same fact in the
    // metadata. `isLiveContent` / `isLiveBroadcast` are deliberately NOT used —
    // they stay true forever on the recording of a stream that ended.
    const live = /"isLiveNow":\s*true/.test(html) || /"liveBroadcastContent":"live"/.test(html);
    const upcoming =
      !live && (/"isUpcoming":\s*true/.test(html) || /"liveBroadcastContent":"upcoming"/.test(html));
    if (!live && !upcoming) return null;
    const titleTag = html.match(/<meta\s+name="title"\s+content="([^"]{1,300})"/);
    const title = titleTag?.[1] ? decodeHtml(titleTag[1]) : undefined;
    return { videoId, title, live, upcoming };
  } catch {
    return null;
  }
}

// Minimal entity decoding for the handful that show up in a YouTube title.
function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// Refresh what we hold, if it has gone stale. Returns the promise so a caller
// that wants to wait can — most do not.
export function refreshLiveVideo(channelId: string): Promise<void> {
  if (!CHANNEL_ID_RE.test(channelId)) return Promise.resolve();
  const e = liveVideoCache.get(channelId);
  if (e && liveVideoFresh(e)) return Promise.resolve();
  const running = liveVideoPending.get(channelId);
  if (running) return running;
  const p = fetchLiveVideo(channelId)
    .then((read) => {
      liveVideoCache.set(channelId, { ...read, checkedAt: Date.now() });
    })
    .catch(() => {
      // A thrown failure is still a failure, not darkness — `ok: false`, so the
      // tile keeps its fallback and this is retried on the short cadence.
      liveVideoCache.set(channelId, { video: null, ok: false, checkedAt: Date.now() });
    })
    .finally(() => {
      liveVideoPending.delete(channelId);
    });
  liveVideoPending.set(channelId, p);
  return p;
}

// True when this channel has never been read, so the first paint of a wall can
// afford to wait briefly for a real answer instead of showing a cold tile for a
// whole poll cycle.
export function liveVideoUnknown(channelId: string): boolean {
  return CHANNEL_ID_RE.test(channelId) && !liveVideoCache.has(channelId);
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
        id?: string;
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
    videoId: liveVid.id,
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
