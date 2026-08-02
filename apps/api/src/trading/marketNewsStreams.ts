import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  marketNewsChannels,
  marketNewsStreams,
  type MarketNewsChannelRow,
  type MarketNewsStreamsRow,
} from '../db/schema.js';
import {
  cachedChannelIdForHandle,
  cachedLiveRead,
  cachedLiveState,
  channelIdFromRef,
  liveVideoUnknown,
  normHandle,
  parseYouTubeRef,
  refreshLiveVideo,
  resolveChannelId,
  youtubeConfigured,
} from './youtube.js';

// The Market News live-stream wall: the news channels a desk follows, plus each
// trader's own view state over them (which streams are open and in what order,
// which one is docked, the column count, and which channels buzz them when they
// go live).
//
// The channel list is **owned by the desk, not by the code**. A trader pastes a
// YouTube link and the channel appears for their whole team, scoped by `team_id`
// — the same boundary trade data uses. The four starter channels below are a
// one-time seed per team, not a permanent catalog: once seeded they are ordinary
// rows that can be renamed or removed like any other.
//
// **On quota, since this used to be a fixed list for that reason.** Watching a
// stream costs nothing: the embed player is keyless, plays when the channel is
// live and shows its own offline card otherwise. Quota is only spent on the
// things *around* the player — the LIVE badge, viewer counts and go-live pushes —
// and that spend is already bounded by the poller's round-robin
// (`YOUTUBE_CHANNELS_PER_TICK`) and its daily ceiling: adding channels lengthens
// each one's refresh interval rather than multiplying the daily bill. So a desk
// can follow as many channels as it likes; what degrades past roughly 15–20
// distinct channels is how quickly a LIVE badge appears, never the ability to
// watch. Keep that property — it is why per-team channels are affordable at all.

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
  // The video the channel is broadcasting (or has scheduled), resolved keylessly
  // from its own /live page. When set, the tile embeds this rather than the
  // unreliable live_stream endpoint — see youtube.ts for why that matters.
  liveVideoId?: string;
  // A resolved video that has not started yet: embeddable (it is YouTube's own
  // waiting room) but deliberately not badged LIVE.
  upcoming?: boolean;
  // The channel is broadcasting but has restricted embedding, so no player on
  // this site can show it. Not a fault to hide: the tile says so plainly and
  // sends the trader to YouTube, rather than rendering the bare "Video
  // unavailable" box that looks identical to something being broken.
  embedBlocked?: boolean;
  // True once a keyless read has actually answered for this channel. Without it
  // the client cannot tell "we looked, it is dark" from "we have not looked
  // yet", and those want opposite tiles: the honest offline card for the first,
  // and the old optimistic embed for the second (an install whose server cannot
  // reach youtube.com never gets an answer, and must still be able to play).
  liveChecked?: boolean;
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
// The starter set. Seeded into a desk's channel list the first time that desk
// opens the wall, then owned by the desk — nothing here is consulted again.
//
// Keys match the slugs the old code-resident catalog used, so a tile a trader
// already had open keeps working across this change.
// ---------------------------------------------------------------------------
// Channel ids are seeded outright rather than left to the resolver. A row with
// no id cannot embed at all, so the desk that starts with these should never
// have to wait on a lookup — and a lookup that fails (YouTube changing its page,
// no outbound access) would otherwise leave a starter channel permanently dead.
const SEED_CHANNELS: CatalogChannel[] = [
  {
    key: 'yahoofinance',
    name: 'Yahoo Finance',
    handle: '@YahooFinance',
    channelId: 'UCEAZeUIeJs0IjQiqTCdVSIg',
    alwaysOn: true,
  },
  {
    key: 'bloomberg',
    name: 'Bloomberg Television',
    handle: '@markets',
    channelId: 'UCIALMKvObZNtJ6AmdCLP7Lg',
    alwaysOn: true,
  },
  // The one starter channel that is NOT always on, and deliberately so: the Fed
  // broadcasts for a few hours eight times a year. Its tile carries the FOMC
  // countdown in place of a dead player for the rest of the time.
  {
    key: 'fed',
    name: 'Federal Reserve',
    handle: '@federalreserve',
    channelId: 'UCAzhpt9DmG6PnHXjmJTvRGQ',
  },
  { key: 'reuters', name: 'Reuters', handle: '@Reuters', channelId: '', alwaysOn: true },
];

// Channels known to refuse embedded playback, by channel id.
//
// The automatic route is `playableInEmbed` on the page (see `embeddableFrom`),
// and it stays the general mechanism. This list is for the case where YouTube
// does not state the flag anywhere we can read but the refusal is established
// beyond doubt by observation.
//
// **Bloomberg Television** is here on direct evidence: its tile rendered "This
// video is unavailable" through *both* embed routes — the channel embed and a
// resolved video id — across several deploys, while Yahoo Finance played through
// the identical code path each time, and the wall independently reported
// Bloomberg as live throughout. That isolates it to the broadcaster's own embed
// restriction. Without this the tile shows YouTube's bare error box, which reads
// as a fault in the terminal rather than a setting at Bloomberg.
//
// Remove an entry the moment a channel starts allowing embedding again — this is
// a statement of fact about a channel, not a preference. Nothing here attempts
// to work around the restriction; it only changes what the trader is told.
const EMBED_RESTRICTED_CHANNELS = new Set<string>(['UCIALMKvObZNtJ6AmdCLP7Lg']);

// How many channels one desk may follow. Not a quota limit — watching is free —
// but a guard against a runaway list, and past this the LIVE badge on any one
// channel refreshes too slowly to be worth much.
export const MAX_TEAM_CHANNELS = 24;

// The scope key a desk's channels live under. A trader on a team shares that
// team's wall; one on no team gets their own, matching how scopedTraderIds
// treats a team-less viewer.
export interface ChannelViewer {
  id: string;
  teamId: string | null;
}
export function channelScope(viewer: ChannelViewer): string {
  return viewer.teamId ?? `user:${viewer.id}`;
}

function rowToChannel(r: MarketNewsChannelRow): CatalogChannel {
  return {
    key: r.key,
    name: r.name,
    handle: r.handle,
    channelId: r.channelId,
    alwaysOn: r.alwaysOn,
  };
}

// A desk's channels, seeding the starter set the first time it is asked for.
// The seed is idempotent: the unique (team_id, key) index means a concurrent
// first load cannot double-insert, and an ignored conflict leaves the winner.
export async function teamChannels(scope: string): Promise<CatalogChannel[]> {
  const rows = await db
    .select()
    .from(marketNewsChannels)
    .where(eq(marketNewsChannels.teamId, scope));
  if (rows.length > 0) return rows.map(rowToChannel);

  const now = new Date();
  await db
    .insert(marketNewsChannels)
    .values(
      SEED_CHANNELS.map((c) => ({
        id: crypto.randomUUID(),
        teamId: scope,
        key: c.key,
        name: c.name,
        handle: c.handle,
        channelId: c.channelId,
        alwaysOn: c.alwaysOn === true,
        addedBy: null,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoNothing();
  const seeded = await db
    .select()
    .from(marketNewsChannels)
    .where(eq(marketNewsChannels.teamId, scope));
  return seeded.map(rowToChannel);
}

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

// The poller's work list: every channel any desk follows, deduped by the id it
// resolves to. Cost scales with *distinct channels across the install*, never
// with headcount — ten traders on one desk following the same wall is one set of
// checks. The round-robin then spreads those over ticks, so a longer list means
// slower badges rather than a bigger daily bill.
export async function listFollowedChannels(): Promise<{ handle: string; channelId: string }[]> {
  const rows = await db
    .select({ handle: marketNewsChannels.handle, channelId: marketNewsChannels.channelId })
    .from(marketNewsChannels);
  const seen = new Set<string>();
  const out: { handle: string; channelId: string }[] = [];
  for (const r of rows) {
    const dedupe = resolvedChannelId(r) || normHandle(r.handle);
    if (!dedupe || seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({ handle: r.handle, channelId: r.channelId });
  }
  return out;
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

// Attach live-state to each of the desk's channels, and fill in a channelId the
// poller resolved from a handle after the row was saved.
function withLiveState(view: MarketNewsView, channels: CatalogChannel[]): MarketNewsStreams {
  return {
    ...view,
    channels: channels.map((c) => {
      const channelId = resolvedChannelId(c);
      const live = channelId ? cachedLiveState(channelId) : undefined;
      const base: StreamChannel = {
        ...c,
        channelId,
        handle: displayHandle(c.handle),
        live: false,
        ...live,
        ...(EMBED_RESTRICTED_CHANNELS.has(channelId) ? { embedBlocked: true } : {}),
      };
      // Two independent routes to a playable tile, on purpose — this wall has to
      // work for a Fed press conference that happens eight times a year and
      // cannot be rehearsed. The keyless page read is the one that always
      // applies; the Data API poller is the second, and only exists when a key
      // is set. Either one producing a video id is enough.
      const read = channelId ? cachedLiveRead(channelId) : undefined;
      const video = read?.ok ? read.video : null;
      // `liveChecked` means we know — the page was read and understood. A failed
      // read (`ok: false`) is NOT knowledge: reporting it as darkness would tell
      // the client a channel is off air on the strength of never having found
      // out, and take away the fallback embed that might have played it.
      const checked = read?.ok === true;
      if (!video) {
        if (live?.videoId) return { ...base, liveVideoId: live.videoId, liveChecked: true };
        return checked ? { ...base, live: false, liveChecked: true } : base;
      }
      return {
        ...base,
        // Only an authoritative id reaches the tile. A read that established the
        // channel is live without naming a trustworthy video leaves this unset,
        // and the tile plays the channel-based embed instead — knowing it is on
        // and knowing what to play are separate facts.
        liveVideoId: video.videoId ?? live?.videoId,
        upcoming: video.upcoming,
        live: video.live,
        embedBlocked: video.embeddable === false || base.embedBlocked === true,
        liveChecked: true,
        streamTitle: video.title ?? base.streamTitle,
      };
    }),
  };
}

// How long the first load of a wall will wait for a real answer. Only ever paid
// on a channel nothing is known about yet — a cold process — and capped low
// enough that a slow YouTube delays the screen rather than hanging it.
const COLD_READ_BUDGET_MS = 2500;

// Ask for a fresh live reading on every channel that has an id.
//
// Steady state is fire-and-forget: the response never waits, it serves the last
// answer (stale-while-revalidate) and the background read updates it for the
// next poll. The one exception is a channel that has **never** been read — on a
// cold process every tile would otherwise sit blank for a whole poll cycle,
// which reads as "the wall is broken" rather than "not checked yet". For those,
// and only those, wait briefly for the truth.
async function refreshLiveVideos(channels: CatalogChannel[]): Promise<void> {
  const ids = channels.map((c) => resolvedChannelId(c)).filter(Boolean);
  const cold: Promise<void>[] = [];
  for (const id of ids) {
    const first = liveVideoUnknown(id);
    const p = refreshLiveVideo(id);
    if (first) cold.push(p);
    else void p.catch(() => {});
  }
  if (cold.length === 0) return;
  await Promise.race([
    Promise.allSettled(cold).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, COLD_READ_BUDGET_MS)),
  ]);
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

// Drop anything that doesn't name one of this desk's channels and clamp `cols`
// to the 1–6 the layout pills offer. This is also what quietly cleans up after a
// channel is removed: a row still referencing it simply loses that reference.
function sanitize(view: MarketNewsView, keys: Set<string>): MarketNewsView {
  // One stream at a time. Enforced here as well as in the client, so a saved
  // view from before the limit — or a hand-rolled request — collapses to a
  // single channel rather than reopening a wall of them.
  const watching = [...new Set(view.watching.filter((k) => keys.has(k)))].slice(0, 1);
  const docked = view.docked && keys.has(view.docked) ? view.docked : null;
  const cols = Math.min(6, Math.max(1, Math.round(view.cols) || 2));
  const notify: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(view.notify)) if (keys.has(k) && v) notify[k] = true;
  return { watching, docked, cols, notify };
}

function rowToView(row: MarketNewsStreamsRow, keys: Set<string>): MarketNewsView {
  return sanitize(
    {
      watching: parseStrings(row.watching),
      docked: row.docked ?? null,
      cols: row.cols,
      notify: parseNotify(row.notify),
    },
    keys,
  );
}

// Handles we have recently tried to resolve, so a channel that will not resolve
// is not refetched on every screen poll. A success is cached process-wide by
// youtube.ts, so this only paces the failures.
const resolveAttempts = new Map<string, number>();
const RESOLVE_RETRY_MS = 30 * 60_000;

// Fill in ids for channels that don't have one yet, in the background.
//
// The seeded starter channels are stored with whatever id the seed carried —
// which for a handle-only channel is none — and pasted @handle links can fail to
// resolve first time. Without this the only thing that ever fills those in is
// the poller, which is production-only AND needs a YOUTUBE_API_KEY, so a desk
// with no key would stare at "channel ID is still being looked up" forever.
// Resolution itself is keyless (the channel's own page), so this works with no
// API key at all.
//
// Deliberately not awaited: a screen load must not wait on YouTube.
function resolveMissingIds(scope: string, channels: CatalogChannel[]): void {
  const now = Date.now();
  for (const c of channels) {
    if (c.channelId || !c.handle) continue;
    const handle = normHandle(c.handle);
    if (!handle) continue;
    const tried = resolveAttempts.get(handle);
    if (tried !== undefined && now - tried < RESOLVE_RETRY_MS) continue;
    resolveAttempts.set(handle, now);
    void resolveChannelId(c.handle)
      .then(async (id) => {
        if (!id) return;
        await db
          .update(marketNewsChannels)
          .set({ channelId: id, updatedAt: new Date() })
          .where(and(eq(marketNewsChannels.teamId, scope), eq(marketNewsChannels.key, c.key)));
      })
      .catch(() => {
        /* best-effort: the next read past the cooldown tries again */
      });
  }
}

export async function getMarketNewsStreams(viewer: ChannelViewer): Promise<MarketNewsStreams> {
  const [channels, row] = await Promise.all([
    teamChannels(channelScope(viewer)),
    db
      .select()
      .from(marketNewsStreams)
      .where(eq(marketNewsStreams.userId, viewer.id))
      .limit(1)
      .then((r) => r[0]),
  ]);
  resolveMissingIds(channelScope(viewer), channels);
  await refreshLiveVideos(channels);
  const keys = new Set(channels.map((c) => c.key));
  return withLiveState(row ? rowToView(row, keys) : defaultMarketNewsView(), channels);
}

export async function setMarketNewsStreams(
  viewer: ChannelViewer,
  view: MarketNewsView,
): Promise<MarketNewsStreams> {
  const userId = viewer.id;
  const channels = await teamChannels(channelScope(viewer));
  const clean = sanitize(view, new Set(channels.map((c) => c.key)));
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
  return withLiveState(clean, channels);
}

// Every desk row that resolves to this channel id, so the go-live push can find
// who armed the bell. The same channel followed by two desks is two rows with
// possibly different keys, hence a list rather than one entry.
export async function channelsWithId(
  channelId: string,
): Promise<{ key: string; name: string; teamId: string }[]> {
  if (!channelId) return [];
  const rows = await db.select().from(marketNewsChannels);
  return rows
    .filter((r) => resolvedChannelId(r) === channelId)
    .map((r) => ({ key: r.key, name: r.name, teamId: r.teamId }));
}

// ---------------------------------------------------------------------------
// Adding and removing channels
// ---------------------------------------------------------------------------

export class ChannelError extends Error {}

// A stable key for a new row. Derived from the handle where there is one so the
// key is readable in a saved view, with a random suffix so two channels with
// similar names can never collide.
function makeKey(handle: string, channelId: string): string {
  const base = (normHandle(handle) || channelId.slice(2, 10) || 'channel')
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 20)
    .toLowerCase();
  return `${base || 'channel'}_${crypto.randomUUID().slice(0, 6)}`;
}

// Add a channel to the desk's wall from a pasted YouTube link.
//
// Resolution goes cheapest-first (see resolveChannelId): the id straight out of
// a /channel/ URL, then the channel's own page, then the Data API. A channel
// that resolves is immediately watchable — the embed player needs no key. One
// that doesn't is still saved, and the poller picks the id up later; the tile
// links out until then rather than pretending to play.
export async function addTeamChannel(
  viewer: ChannelViewer,
  input: { url: string; name?: string; alwaysOn?: boolean },
): Promise<CatalogChannel> {
  const scope = channelScope(viewer);
  const ref = parseYouTubeRef(input.url);
  if (!ref.channelId && !ref.handle) {
    throw new ChannelError(
      "That doesn't look like a YouTube channel link. Paste the channel's address — youtube.com/@name or youtube.com/channel/UC…",
    );
  }

  const existing = await teamChannels(scope);
  if (existing.length >= MAX_TEAM_CHANNELS) {
    throw new ChannelError(`A desk can follow up to ${MAX_TEAM_CHANNELS} channels. Remove one first.`);
  }

  const channelId = await resolveChannelId(input.url);
  const handle = ref.handle ? `@${ref.handle}` : '';

  // Same channel twice on one wall makes "which tile is open" ambiguous.
  const already = existing.find((c) =>
    channelId ? resolvedChannelId(c) === channelId : !!handle && normHandle(c.handle) === ref.handle,
  );
  if (already) throw new ChannelError(`${already.name} is already on the wall.`);

  const name = (input.name ?? '').trim().slice(0, 60) || (ref.handle ? `@${ref.handle}` : 'New channel');
  const row = {
    id: crypto.randomUUID(),
    teamId: scope,
    key: makeKey(handle, channelId),
    name,
    handle,
    channelId,
    alwaysOn: input.alwaysOn === true,
    addedBy: viewer.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await db.insert(marketNewsChannels).values(row);
  return rowToChannel(row as MarketNewsChannelRow);
}

// Remove a channel from the desk's wall. Saved tiles referencing it are dropped
// on the next read rather than eagerly rewritten across every teammate's row.
export async function removeTeamChannel(viewer: ChannelViewer, key: string): Promise<void> {
  const scope = channelScope(viewer);
  await db
    .delete(marketNewsChannels)
    .where(and(eq(marketNewsChannels.teamId, scope), eq(marketNewsChannels.key, key)));
}

// Rename a channel, or flip its 24/7 tag.
export async function updateTeamChannel(
  viewer: ChannelViewer,
  key: string,
  patch: { name?: string; alwaysOn?: boolean },
): Promise<void> {
  const scope = channelScope(viewer);
  const set: Partial<MarketNewsChannelRow> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, 60);
    if (!name) throw new ChannelError('A channel needs a name.');
    set.name = name;
  }
  if (patch.alwaysOn !== undefined) set.alwaysOn = patch.alwaysOn;
  await db
    .update(marketNewsChannels)
    .set(set)
    .where(and(eq(marketNewsChannels.teamId, scope), eq(marketNewsChannels.key, key)));
}

// Fill in ids the poller resolved after a row was saved, so a handle-only
// channel becomes embeddable permanently rather than only while the cache holds.
export async function persistResolvedIds(): Promise<void> {
  const rows = await db.select().from(marketNewsChannels);
  for (const r of rows) {
    if (r.channelId) continue;
    const id = cachedChannelIdForHandle(r.handle);
    if (!id) continue;
    await db
      .update(marketNewsChannels)
      .set({ channelId: id, updatedAt: new Date() })
      .where(eq(marketNewsChannels.id, r.id));
  }
}
