import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { api, ApiError } from '../../api/client';
import { hasEntitlement, tierOfFeature } from '../../auth/access';
import { useAuth } from '../../auth/AuthContext';
import { useNowTick } from '../../hooks/useNowTick';
import { zoneAbbr } from '../../lib/timezone';
import { Icon } from '../../components/Icon';
import { TierMark } from '../../components/TierMark';
import { UpgradeNotice } from '../../components/UpgradeNotice';
import { C, tint } from '../../theme/tokens';
import { ScreenTitle } from './ScreenTitle';
import { newsFeeds, affectedInstruments, deriveWatchlist, DEFAULT_WATCHLIST } from './newsRelevance';
import { decodeEntities, fmtDayKey, fmtTime } from './newsFormat';
import { countdown, etDay, nextMeetingStamp, prevMeetingStamp } from './etClock';
import type { MarketNewsData, MarketNewsStreams, MembershipTier, NewsItem, StreamChannel } from '../../api/types';

// The FOMC statement schedule, as sent with the stream wall. Same list Market
// Data's countdown bar reads — the server holds one copy of it.
export interface FomcSchedule {
  meetings: string[];
  meetingYear: number;
}

// Market News — the desk's headline feed plus an embedded YouTube live-stream
// wall (watch a press conference beside the headlines). This screen deliberately
// carries no AI overview, no "how it could affect us" note, no impact dots and
// no economic calendar — the calendar moved to Market Data, and the rest were
// removed to keep the screen free of recommendation-flavoured copy. A single
// tape-read glyph per headline is the one directional cue, switchable off here.
const SHOW_BIAS = true;

const REFRESH_MS = 120_000;
// The stream wall re-reads faster than the headline feed: it is how a tile finds
// out a channel went live, and a press conference starting is worth catching
// within the minute. The read is cheap — the server answers from its own cache.
const STREAM_REFRESH_MS = 45_000;
const ET = 'America/New_York';

// Topic pills. `rates` isn't one of newsRelevance's feed keys, so membership for
// it is matched here; the others reuse `newsFeeds`.
const TOPICS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'fed', label: 'Federal Reserve' },
  { key: 'eurusd', label: 'EUR/USD' },
  { key: 'gold', label: 'Metals' },
  { key: 'btc', label: 'Crypto' },
  { key: 'indices', label: 'Indices' },
  { key: 'rates', label: 'Rates & yields' },
];
const RATES_RE =
  /\b(yield|yields|treasur\w*|bond|bonds|basis point|basis points|bps|bp|auction|bid-to-cover|2s10s|10-year|two-year|ten-year|coupon|curve|tips)\b/i;

const CATEGORY_LABEL: Record<string, string> = {
  markets: 'Markets',
  geopolitical: 'Geopolitical',
  economic: 'Economic',
  crypto: 'Crypto',
  other: 'Markets',
};

// A default matching the server's, so the screen still works if the streams
// call fails (or on a read-only demo that can't persist).
function localDefaultStreams(): MarketNewsStreams {
  const mk = (
    key: string,
    name: string,
    handle: string,
    channelId: string,
    free = false,
  ): StreamChannel => ({
    key,
    name,
    handle,
    channelId,
    free,
    live: false,
  });
  // The same starter set the server seeds, in the same order — the free channel
  // first. A fallback that named channels the desk does not have would offer
  // tiles that can never play.
  return {
    channels: [
      mk('yahoofinance', 'Yahoo Finance', '@YahooFinance', 'UCEAZeUIeJs0IjQiqTCdVSIg', true),
      mk('bloomberg', 'Bloomberg Television', '@markets', 'UCIALMKvObZNtJ6AmdCLP7Lg'),
      mk('fed', 'Federal Reserve', '@federalreserve', 'UCAzhpt9DmG6PnHXjmJTvRGQ'),
      mk('reuters', 'Reuters', '@Reuters', ''),
    ],
    watching: [],
    docked: null,
    cols: 2,
    // The cautious answer while the server has not said: one at a time. The real
    // limit arrives with the first successful read.
    maxWatching: 1,
    notify: {},
  };
}

// --- time helpers (all Eastern) ---
function etDayKey(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
}
function shortAge(ms: number, now: number): string {
  const m = Math.floor((now - ms) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
function bucketLabel(ms: number, now: number): string {
  if (now - ms < 3600_000) return 'Last hour';
  const today = etDayKey(now);
  if (etDayKey(ms) === today) return 'Earlier today';
  if (etDayKey(ms) === etDayKey(now - 86400_000)) return 'Yesterday';
  return fmtDayKey(ms);
}

function topicsOf(h: NewsItem): string[] {
  const set = new Set(newsFeeds(h).filter((k) => k !== 'markets'));
  const text = [h.title, h.body, h.source].filter(Boolean).join(' ');
  if (RATES_RE.test(text)) set.add('rates');
  return [...set];
}

// What a tile actually plays.
//
// The channel-based `live_stream?channel=` embed is the workhorse: it plays
// these channels reliably, it needs nothing but the channel id, and it shows
// YouTube's own card when the channel is dark. A specific video id is used only
// when the server resolved one it trusts — worth it for a *scheduled* broadcast
// (the Fed's waiting room, which the channel embed cannot show) and for the
// Data API's answer.
//
// Deliberately not "video id first". Pointing the player at a guessed id renders
// "This video is unavailable" on a channel that is broadcasting perfectly well,
// which is strictly worse than the channel embed — knowing a channel is live and
// knowing which video to play are separate facts, and only the second one breaks
// the tile when it is wrong.
function embedSrc(c: StreamChannel): string {
  if (c.liveVideoId) return `https://www.youtube.com/embed/${c.liveVideoId}?autoplay=1&rel=0`;
  return c.channelId ? `https://www.youtube.com/embed/live_stream?channel=${c.channelId}&autoplay=1&rel=0` : '';
}
// The Fed's own YouTube channel — the one starter tile that is dark between
// meetings, and the reason the FOMC countdown exists. Matched on the channel id,
// which is the identity YouTube itself agrees on; the handle is the fallback for
// a row whose id has not been filled in yet.
const FED_CHANNEL_ID = 'UCAzhpt9DmG6PnHXjmJTvRGQ';
function isFedChannel(c: StreamChannel): boolean {
  if (c.channelId) return c.channelId === FED_CHANNEL_ID;
  return /federalreserve/i.test(c.handle);
}

// Whether the server actually established this channel's state. When it did not,
// the screen must not say "Offline" — a tile can be playing perfectly well via
// the fallback embed while we have no reading, and calling that offline is
// simply false. Say nothing instead.
function liveKnown(c: StreamChannel): boolean {
  return c.liveChecked === true;
}

// The window around a Fed decision when the tile should try to play rather than
// show the countdown. The Fed is dark all but a few hours a year, so the
// countdown is right almost always — but on the day itself the stream is the
// whole point, and it must not be hidden behind the countdown just because the
// server could not confirm the channel is live.
function inFedMeetingWindow(fomc: FomcSchedule, now: number): boolean {
  const next = nextMeetingStamp(now, fomc.meetings, fomc.meetingYear);
  const prev = prevMeetingStamp(now, fomc.meetings, fomc.meetingYear);
  const near = (t: number) => now >= t - 2 * 3600_000 && now <= t + 8 * 3600_000;
  return near(next) || near(prev);
}

// "3d 5h ago" — the mirror of etGap's "in 3d 5h", for the meeting just gone.
function agoLabel(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d ${h % 24}h ago`;
  if (h >= 1) return `${h}h ${mins % 60}m ago`;
  return `${mins}m ago`;
}

function channelUrl(c: StreamChannel): string {
  if (c.channelId) return `https://www.youtube.com/channel/${c.channelId}/live`;
  if (c.handle) return `https://www.youtube.com/${c.handle}/live`;
  return 'https://www.youtube.com';
}

export function MarketNews({ onOpenMembership }: { onOpenMembership?: () => void } = {}) {
  // Keep the "x ago" ages fresh between the 120s data polls.
  const now = useNowTick(30_000);
  const { user } = useAuth();
  // Market News lives in the always-on Markets workspace, so the wall is not
  // gated on the Advanced Trading opt-in — mirroring the server, which puts
  // these endpoints on `requireMarkets`. The read-only demo is the exception:
  // it watches the wall but cannot reshape what the desk sees (demoGuard refuses
  // every non-GET, so this only hides controls that would fail anyway).
  // Adding, renaming and removing a channel is Max (owner decision, 2026-08:
  // Yahoo Finance is free, the rest of the seeded wall is Premium, and bringing
  // your own channel is Max). The server refuses the writes regardless; this
  // just stops the control offering something that would come back 402.
  const canWrite = !!user && !user.isDemo && hasEntitlement(user, 'customStreams');

  // --- headline feed ---
  const [data, setData] = useState<MarketNewsData | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>(DEFAULT_WATCHLIST);
  const [err, setErr] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // --- live-stream setup (persisted per user) ---
  const [streams, setStreams] = useState<MarketNewsStreams | null>(null);
  const [fomc, setFomc] = useState<FomcSchedule | null>(null);

  // --- feed filters / ephemeral UI ---
  const [topic, setTopic] = useState('all');
  const [source, setSource] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [liveOpen, setLiveOpen] = useState(true);

  // Content-column width drives the responsive column counts (the sidebar
  // collapses, so a media query would fire at the wrong moment).
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [contentW, setContentW] = useState(1120);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setContentW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  async function load(manual = false) {
    if (manual) setBusy(true);
    try {
      const d = await api.marketNews();
      setData(d);
      setErr(null);
      setLastLoaded(Date.now());
    } catch (e) {
      const at = lastLoaded ? `Showing headlines from ${fmtTime(lastLoaded)} ${zoneAbbr(lastLoaded)}. ` : '';
      const why = e instanceof ApiError ? e.message : 'request failed';
      setErr(`${at}Couldn't refresh: ${why}.`);
    } finally {
      if (manual) setBusy(false);
    }
  }
  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load persisted stream setup once; fall back to the local default so the
  // wall still works when the call fails (or on the read-only demo).
  useEffect(() => {
    api
      .marketNewsStreams()
      .then((r) => {
        setStreams(r.streams);
        if (r.fomc) setFomc(r.fomc);
      })
      .catch(() => setStreams(localDefaultStreams()));
  }, []);

  // Then keep the *channels* fresh on a short poll, without touching this
  // trader's own view state. This is what makes a tile start playing on its own
  // when a channel goes live: the server's live reading is what changes, and a
  // trader watching for the Fed press conference should not have to reload the
  // page to catch it. Only the channel list is taken from the reply — watching /
  // docked / notify stay local, or a poll landing mid-edit would stamp on it.
  useEffect(() => {
    const id = window.setInterval(() => {
      api
        .marketNewsStreams()
        .then((r) => {
          if (r.fomc) setFomc(r.fomc);
          setStreams((prev) => (prev ? { ...prev, channels: r.streams.channels } : r.streams));
        })
        .catch(() => {
          /* best-effort: the wall keeps showing what it last knew */
        });
    }, STREAM_REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  // Derive the watchlist from the trade log once, for the instrument tags.
  useEffect(() => {
    api
      .tradeLog()
      .then((r) => setWatchlist(deriveWatchlist(r.trades.map((t) => t.instrument))))
      .catch(() => {});
  }, []);

  // Persist the stream setup (debounced) on every change after the initial load.
  const loadedRef = useRef(false);
  useEffect(() => {
    if (!streams) return;
    if (!loadedRef.current) {
      loadedRef.current = true;
      return;
    }
    const t = window.setTimeout(() => {
      api.saveMarketNewsStreams(streams).catch(() => {});
    }, 700);
    return () => window.clearTimeout(t);
  }, [streams]);

  const mutate = (fn: (s: MarketNewsStreams) => MarketNewsStreams) =>
    setStreams((prev) => (prev ? fn(prev) : prev));

  // Adding, editing or removing a channel changes what the whole desk sees, so
  // it goes straight to the server rather than through the debounced view-state
  // save, and the reply is the authoritative list (with the id it managed to
  // resolve).
  async function addChannel(url: string, name: string, alwaysOn: boolean): Promise<string | null> {
    try {
      const r = await api.addMarketNewsChannel({ url, name: name || undefined, alwaysOn });
      setStreams(r.streams);
      return null;
    } catch (e) {
      return e instanceof ApiError ? e.message : "Couldn't add that channel.";
    }
  }

  // Renaming leaves the channel's `key` alone — it is derived from the handle
  // and id, not the name — so the trader's own watching/docked/notify state
  // survives an edit rather than quietly detaching from the row.
  async function editChannel(
    key: string,
    patch: { name?: string; alwaysOn?: boolean },
  ): Promise<string | null> {
    try {
      const r = await api.updateMarketNewsChannel(key, patch);
      setStreams(r.streams);
      return null;
    } catch (e) {
      return e instanceof ApiError ? e.message : "Couldn't save that channel.";
    }
  }

  function removeChannel(key: string, name: string): void {
    if (!window.confirm(`Remove ${name} from the desk's stream wall?`)) return;
    api
      .removeMarketNewsChannel(key)
      .then((r) => {
        setStreams(r.streams);
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : "Couldn't remove that channel."));
  }

  const headlines = data?.headlines ?? [];

  // Topic counts (over every headline, stable regardless of the active filter).
  const topicCounts = useMemo(() => {
    const out: Record<string, number> = { all: headlines.length };
    for (const t of TOPICS) if (t.key !== 'all') out[t.key] = 0;
    for (const h of headlines) for (const k of topicsOf(h)) out[k] = (out[k] ?? 0) + 1;
    return out;
  }, [headlines]);

  // Source counts (over every headline), for the Sources rail.
  const sourceRows = useMemo(() => {
    const out: Record<string, number> = {};
    for (const h of headlines) {
      const s = h.source;
      if (s) out[s] = (out[s] ?? 0) + 1;
    }
    return Object.entries(out).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [headlines]);

  const sourceActive = source !== 'all' && sourceRows.some(([s]) => s === source);

  const shown = useMemo(
    () =>
      headlines.filter(
        (h) =>
          (topic === 'all' || topicsOf(h).includes(topic)) && (!sourceActive || h.source === source),
      ),
    [headlines, topic, source, sourceActive],
  );

  // Group the filtered headlines into recency buckets, newest first.
  const groups = useMemo(() => {
    const gs: { label: string; items: NewsItem[] }[] = [];
    for (const h of shown) {
      const label = bucketLabel(h.publishedAt, now);
      const g = gs.find((x) => x.label === label);
      if (g) g.items.push(h);
      else gs.push({ label, items: [h] });
    }
    return gs;
  }, [shown, now]);

  const newest = headlines.reduce((a, h) => Math.max(a, h.publishedAt), 0);
  const filtersActive = topic !== 'all' || sourceActive;

  const clearFilters = () => {
    setTopic('all');
    setSource('all');
  };

  if (err && !data) {
    return (
      <div ref={rootRef} style={rootStyle}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <div style={{ color: C.red, fontSize: 13 }}>{err}</div>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div ref={rootRef} style={rootStyle}>
        <div style={{ maxWidth: 1120, margin: '0 auto', color: C.muted, fontSize: 13 }}>Loading market news…</div>
      </div>
    );
  }

  return (
    <div ref={rootRef} style={rootStyle}>
      <div style={{ maxWidth: 1120, margin: '0 auto', color: C.text }}>
        {/* ---- screen header ---- */}
        <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <ScreenTitle>Market News</ScreenTitle>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, animation: 'livePulse 2s infinite' }} />
              <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>
                {newest ? `Newest ${shortAge(newest, now)} ago · ${shown.length} of ${headlines.length}` : `${shown.length} of ${headlines.length}`}
              </span>
            </span>
            <button onClick={() => void load(true)} disabled={busy} style={{ ...ghostBtn, opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {err && (
          <div onClick={() => setErr(null)} style={banner}>
            {err} — click to dismiss.
          </div>
        )}

        {/* ---- live streams block ---- */}
        <LiveStreams
          canEdit={canWrite}
          canAddTier={tierOfFeature('customStreams', user?.access.membership)}
          paidTier={tierOfFeature('presetStreams', user?.access.membership)}
          canWatchPaid={!!user && hasEntitlement(user, 'presetStreams')}
          onOpenMembership={onOpenMembership}
          onAddChannel={addChannel}
          onEditChannel={editChannel}
          onRemoveChannel={removeChannel}
          streams={streams}
          fomc={fomc}
          now={now}
          contentW={contentW}
          liveOpen={liveOpen}
          setLiveOpen={setLiveOpen}
          mutate={mutate}
        />

        {/* ---- topic pills ---- */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 18 }}>
          {TOPICS.map((t) => {
            const active = topic === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTopic(t.key)}
                style={{
                  ...pillBase,
                  fontWeight: active ? 600 : 500,
                  color: active ? C.gold : C.muted,
                  background: active ? GOLD_TINT_GRADIENT : 'rgba(255,255,255,.02)',
                  borderColor: active ? tint(C.gold, 0.35) : C.line2,
                }}
              >
                {t.label}
                <span style={{ fontFamily: C.mono, fontSize: 11, color: active ? C.gold : C.faint }}>
                  {topicCounts[t.key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* ---- active filter chips ---- */}
        {filtersActive && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
            <span style={miniLabel}>FILTERED BY</span>
            {topic !== 'all' && (
              <FilterChip label={TOPICS.find((t) => t.key === topic)?.label ?? topic} onClear={() => setTopic('all')} />
            )}
            {sourceActive && <FilterChip label={source} onClear={() => setSource('all')} />}
            <button onClick={clearFilters} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 11, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}>
              Clear all
            </button>
          </div>
        )}

        {/* ---- feed grid ---- */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: contentW >= 900 ? 'minmax(0,1fr) 288px' : 'minmax(0,1fr)',
            gap: 28,
            alignItems: 'start',
            marginTop: 18,
          }}
        >
          <div>
            {headlines.length === 0 ? (
              <EmptyCard>No headlines yet — the live feeds populate within a few minutes.</EmptyCard>
            ) : shown.length === 0 ? (
              <div style={{ ...emptyCard }}>
                <div style={{ color: C.muted, fontSize: 13, marginBottom: 12 }}>No headlines match this filter.</div>
                <button onClick={clearFilters} style={ghostBtn}>
                  Clear the filters
                </button>
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.label} style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={groupLabel}>{g.label}</span>
                    <span style={{ fontFamily: C.mono, fontSize: 11, color: '#3A4A6C' }}>{g.items.length}</span>
                    <span style={{ flex: 1, height: 1, background: C.line }} />
                  </div>
                  {g.items.map((h) => (
                    <HeadlineRow
                      key={h.id}
                      h={h}
                      now={now}
                      watchlist={watchlist}
                      open={openId === h.id}
                      onToggle={() => setOpenId(openId === h.id ? null : h.id)}
                    />
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Sources rail */}
          <div style={{ ...card, padding: '13px 15px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={miniLabel}>SOURCES</span>
              <span style={{ fontSize: 10, color: '#3A4A6C' }}>click to filter</span>
            </div>
            {sourceRows.length === 0 ? (
              <div style={{ fontSize: 11.5, color: C.faint }}>No sources yet.</div>
            ) : (
              sourceRows.map(([name, count]) => {
                const active = sourceActive && source === name;
                return (
                  <button
                    key={name}
                    onClick={() => setSource(active ? 'all' : name)}
                    style={{
                      display: 'flex',
                      width: '100%',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: '5px 0',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        color: active ? C.gold : C.muted,
                        fontWeight: active ? 600 : 400,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {name}
                    </span>
                    <span style={{ fontFamily: C.mono, fontSize: 11, color: active ? C.gold : C.faint }}>{count}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ---- content footer (informational only) ---- */}
        <div style={{ marginTop: 20, fontSize: 10.5, color: C.faint, letterSpacing: '0.3px' }}>
          Headlines are reproduced from the desk's news feeds for information only — not investment advice.
        </div>
      </div>

      {/* ---- docked mini-player ---- */}
      {streams && streams.docked && (() => {
        const c = streams.channels.find((x) => x.key === streams.docked);
        if (!c) return null;
        return (
          <MiniPlayer
            c={c}
            onUndock={() => mutate((s) => ({ ...s, docked: null }))}
            onClose={() =>
              mutate((s) => ({ ...s, docked: null, watching: s.watching.filter((k) => k !== c.key) }))
            }
          />
        );
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live streams block
// ---------------------------------------------------------------------------

function LiveStreams({
  streams,
  fomc,
  now,
  contentW,
  liveOpen,
  setLiveOpen,
  mutate,
  canEdit,
  canAddTier,
  paidTier,
  canWatchPaid,
  onOpenMembership,
  onAddChannel,
  onEditChannel,
  onRemoveChannel,
}: {
  streams: MarketNewsStreams | null;
  // The FOMC schedule behind the Federal Reserve tile's countdown; null until
  // the streams payload has loaded, which simply leaves the old offline card.
  fomc: FomcSchedule | null;
  now: number;
  contentW: number;
  liveOpen: boolean;
  setLiveOpen: (v: boolean) => void;
  mutate: (fn: (s: MarketNewsStreams) => MarketNewsStreams) => void;
  // The channel list is desk-wide, so changing it needs write access — a
  // view-only role and the demo can watch the wall but not reshape it.
  canEdit: boolean;
  // What adding your own channel costs, and what the rest of the wall costs.
  // Drawn on every reader's rail including a Max member's, so the list says what
  // each row is worth rather than looking identical to a free account's.
  canAddTier: MembershipTier | null;
  paidTier: MembershipTier | null;
  // Whether this reader may actually play a non-free channel. The server
  // enforces it too (sanitize drops what the account cannot watch).
  canWatchPaid: boolean;
  onOpenMembership?: () => void;
  onAddChannel: (url: string, name: string, alwaysOn: boolean) => Promise<string | null>;
  onEditChannel: (key: string, patch: { name?: string; alwaysOn?: boolean }) => Promise<string | null>;
  onRemoveChannel: (key: string, name: string) => void;
}) {
  // Raised when a reader clicks something their tier does not carry. Shown
  // where the player would be, so the answer to "why did nothing happen" is in
  // the place they were already looking.
  const [lockedNotice, setLockedNotice] = useState(false);

  if (!streams) return null;
  const channels = streams.channels;
  const watching = streams.watching;
  const liveCount = channels.filter((c) => c.live).length;
  // Whether any channel's state was actually established. Drives whether the
  // live count is worth showing at all.
  const anyKnown = channels.some(liveKnown);

  const tiles = watching
    .map((k) => channels.find((c) => c.key === k))
    .filter((c): c is StreamChannel => !!c && c.key !== streams.docked);
  const dockedChan = streams.docked ? channels.find((c) => c.key === streams.docked) : null;

  // The grid is COMPUTED, never chosen — the layout picker was deliberately
  // removed and is not coming back. One tile takes the full column, which is the
  // readable player; beyond that it is two across and wraps, so four streams are
  // a 2×2 rather than a row of thumbnails. Two is the ceiling for the same
  // reason the wall was cut to one in the first place: a quarter-width tile is
  // not a player.
  const tileCols = tiles.length <= 1 || contentW < 720 ? 1 : 2;

  // How many may play at once, as the SERVER answered it — one on a free
  // account, a wall on Premium and above. sanitize() enforces the same number,
  // so this only decides what the rail offers.
  const maxWatching = Math.max(1, streams.maxWatching || 1);
  const multi = maxWatching > 1;

  // Picking a channel ADDS it when several may play, and REPLACES what is
  // playing when only one may. The single-stream case still reads as a channel
  // selector — the way a television does — rather than a set of checkboxes;
  // picking the open one again closes it either way.
  //
  // At the cap, the longest-open tile makes way rather than the click being
  // refused. Silently doing nothing on a click is the worse failure: there is
  // nothing on screen to explain it.
  const toggleWatch = (key: string) =>
    mutate((s) => {
      const open = s.watching.includes(key);
      if (open) return { ...s, watching: s.watching.filter((k) => k !== key), docked: s.docked === key ? null : s.docked };
      if (!multi) {
        return {
          ...s,
          watching: [key],
          // With one stream allowed, switching channels retires whatever was
          // docked — the docked player was the previous channel, and leaving it
          // running would be a second stream.
          docked: null,
        };
      }
      const next = [...s.watching.filter((k) => k !== key), key];
      return { ...s, watching: next.slice(Math.max(0, next.length - maxWatching)) };
    });
  const closeTile = (key: string) =>
    mutate((s) => ({
      ...s,
      watching: s.watching.filter((k) => k !== key),
      docked: s.docked === key ? null : s.docked,
    }));
  const toggleNotify = (key: string) =>
    mutate((s) => ({ ...s, notify: { ...s.notify, [key]: !s.notify[key] } }));
  return (
    <div style={{ marginTop: 20, paddingBottom: 20, borderBottom: `1px solid ${C.line}` }}>
      {/* block header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        {liveCount > 0 && (
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.red, boxShadow: `0 0 6px ${C.red}`, animation: 'livePulse 2s infinite' }} />
        )}
        <span style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1.4px', color: C.faint, whiteSpace: 'nowrap' }}>
          LIVE STREAMS
        </span>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: '#3A4A6C' }}>
          {/* "0 live" is only worth saying when the count means something. With
              no reading on any channel it is not a count of anything, and it read
              as "nothing is on" beside a tile that was visibly playing. */}
          {anyKnown ? `${liveCount} live · ` : ''}
          {channels.length} channels
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setLiveOpen(!liveOpen)} style={{ background: 'none', border: 'none', fontSize: 11, fontWeight: 600, color: C.muted, cursor: 'pointer' }}>
            {liveOpen ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {liveOpen && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: contentW >= 900 ? 'minmax(0,1fr) 288px' : 'minmax(0,1fr)',
              gap: 20,
              alignItems: 'start',
            }}
          >
            {/* left column: tiles */}
            <div>
              {dockedChan && (
                <div style={{ ...noticePanel, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: C.muted }}>{dockedChan.name} is playing in the corner.</span>
                  <button onClick={() => mutate((s) => ({ ...s, docked: null }))} style={{ ...ghostBtn, marginLeft: 'auto' }}>
                    Bring it back here
                  </button>
                </div>
              )}

              {lockedNotice && (
                <div style={{ marginBottom: 12 }}>
                  <UpgradeNotice feature="presetStreams" onOpenMembership={onOpenMembership} compact />
                </div>
              )}

              {tiles.length === 0 && !dockedChan ? (
                <StreamsEmpty channels={channels} onWatch={(k) => toggleWatch(k)} />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tileCols}, minmax(0,1fr))`, gap: 12 }}>
                  {tiles.map((c) => (
                    <StreamTile
                      key={c.key}
                      c={c}
                      fomc={fomc}
                      now={now}
                      onDock={() => mutate((s) => ({ ...s, docked: c.key }))}
                      onClose={() => closeTile(c.key)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* right column: channel list */}
            <div style={{ ...card, padding: 0 }}>
              {channels.map((c, i) => (
                <ChannelRow
                  key={c.key}
                  c={c}
                  first={i === 0}
                  isWatching={watching.includes(c.key)}
                  armed={!!streams.notify[c.key]}
                  canEdit={canEdit}
                  // Every channel that is not included with every account is
                  // marked, for every reader. Locked is the narrower question —
                  // whether THIS reader may open it.
                  tier={c.free ? null : paidTier}
                  locked={!c.free && !canWatchPaid}
                  onWatch={() => (!c.free && !canWatchPaid ? setLockedNotice(true) : toggleWatch(c.key))}
                  onNotify={() => toggleNotify(c.key)}
                  onEdit={onEditChannel}
                  onRemove={() => onRemoveChannel(c.key, c.name)}
                />
              ))}
              <AddChannelForm
                onAdd={onAddChannel}
                count={channels.length}
                canEdit={canEdit}
                tier={canAddTier}
                onLocked={() => setLockedNotice(true)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// One row of the channel rail: the live dot, the channel as a selector button,
// and the per-channel controls. It owns its own edit state so the rail can be
// rendered from a plain map — and so a rename in progress is not thrown away by
// the 45s channel poll refreshing the list underneath it.
function ChannelRow({
  c,
  first,
  isWatching,
  armed,
  canEdit,
  tier,
  locked,
  onWatch,
  onNotify,
  onEdit,
  onRemove,
}: {
  c: StreamChannel;
  first: boolean;
  isWatching: boolean;
  armed: boolean;
  canEdit: boolean;
  // What this channel costs, or null when it is included with every account.
  // Drawn for every reader — a Max member sees the star too, so the rail states
  // what each row is worth instead of looking the same as a free account's.
  tier: MembershipTier | null;
  // Whether THIS reader is short of that tier. Only dims the row and diverts the
  // click to the upgrade prompt; the mark above shows either way.
  locked: boolean;
  onWatch: () => void;
  onNotify: () => void;
  onEdit: (key: string, patch: { name?: string; alwaysOn?: boolean }) => Promise<string | null>;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div style={{ padding: '11px 13px', borderTop: `1px solid ${first ? 'transparent' : C.line}` }}>
        <ChannelEditForm
          c={c}
          onSave={(patch) => onEdit(c.key, patch)}
          onDone={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '11px 13px',
        borderTop: `1px solid ${first ? 'transparent' : C.line}`,
        background: isWatching ? tint(C.gold, 0.04) : 'transparent',
        opacity: locked ? 0.75 : 1,
      }}
    >
      <span
        style={{
          flex: 'none',
          width: 7,
          height: 7,
          marginTop: 5,
          borderRadius: '50%',
          background: c.live ? C.red : '#3A4A6C',
          boxShadow: c.live ? `0 0 6px ${C.red}` : 'none',
          animation: c.live ? 'livePulse 2s infinite' : 'none',
        }}
      />
      <button
        onClick={onWatch}
        style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: isWatching ? C.gold : locked ? C.muted : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.name}
          </span>
          <TierMark tier={tier} size={12} dim={locked} />
          {isWatching && (
            <span style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', color: C.gold, border: `1px solid ${tint(C.gold, 0.4)}`, borderRadius: 4, padding: '1px 5px' }}>
              PLAYING
            </span>
          )}
          {c.alwaysOn && (
            <span
              title="Broadcasts around the clock"
              style={{ fontFamily: C.mono, fontSize: 8.5, fontWeight: 700, color: C.faint, border: `1px solid ${C.line2}`, borderRadius: 4, padding: '1px 5px' }}
            >
              24/7
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: c.live ? C.muted : C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
          {c.live
            ? c.streamTitle ?? 'Live'
            : liveKnown(c)
              ? c.lastLive ?? 'Offline'
              : 'Status unconfirmed'}
        </div>
        {c.handle && <div style={{ fontFamily: C.mono, fontSize: 9.5, color: '#3A4A6C', marginTop: 2 }}>{c.handle}</div>}
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          onClick={onNotify}
          title={armed ? 'Alert on when this channel goes live' : 'Alert me when this channel goes live'}
          style={{ width: 24, height: 24, display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <Icon name="bell" size={13} color={armed ? C.gold : '#3A4A6C'} />
        </button>
        {canEdit && (
          <button
            onClick={() => setEditing(true)}
            title="Rename this channel, or mark it as broadcasting 24/7"
            style={{ width: 24, height: 24, display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <Icon name="pencil" size={12} color="#3A4A6C" />
          </button>
        )}
        {canEdit && (
          <button
            onClick={onRemove}
            title="Remove this channel from the desk's wall"
            style={{ width: 24, height: 24, display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#3A4A6C', fontSize: 15, lineHeight: 1 }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

// Rename a channel and set whether it broadcasts around the clock. The 24/7 tag
// is not decoration: a channel marked always-on keeps its player up even when
// the server's own live reading says dark, which from a datacenter is the answer
// most often got wrong (a consent wall reads exactly like an off-air channel).
// Without this the flag could only ever be true for the seeded starter channels,
// so a trader's own 24/7 stream was stuck reading "not live right now".
function ChannelEditForm({
  c,
  onSave,
  onDone,
}: {
  c: StreamChannel;
  onSave: (patch: { name?: string; alwaysOn?: boolean }) => Promise<string | null>;
  onDone: () => void;
}) {
  const [name, setName] = useState(c.name);
  const [alwaysOn, setAlwaysOn] = useState(c.alwaysOn === true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const next = name.trim();
    if (!next || busy) return;
    setBusy(true);
    // Send both every time: the server's patch schema refuses an empty body,
    // and sending the pair keeps a save meaningful even when only one changed.
    const problem = await onSave({ name: next, alwaysOn });
    setBusy(false);
    if (problem) {
      setErr(problem);
      return;
    }
    onDone();
  }

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', color: C.faint, marginBottom: 7 }}>
        Edit channel
      </div>
      <input
        autoFocus
        value={name}
        onChange={(e) => { setName(e.target.value); setErr(null); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit();
          if (e.key === 'Escape') onDone();
        }}
        maxLength={60}
        placeholder="Channel name"
        style={inputStyle}
      />
      <AlwaysOnToggle checked={alwaysOn} onChange={setAlwaysOn} />
      {err && <div style={{ fontSize: 11, color: '#ffb4ab', lineHeight: 1.45, marginTop: 7 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
        <button
          onClick={() => void submit()}
          disabled={!name.trim() || busy}
          style={{
            border: 'none',
            background: `linear-gradient(180deg, ${C.gold}, ${C.gold2})`,
            color: C.goldText,
            fontWeight: 700,
            fontSize: 11.5,
            padding: '7px 12px',
            borderRadius: 7,
            cursor: !name.trim() || busy ? 'default' : 'pointer',
            opacity: !name.trim() || busy ? 0.6 : 1,
            fontFamily: 'inherit',
          }}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onDone}
          style={{ background: 'rgba(255,255,255,.05)', border: `1px solid ${C.line2}`, color: '#DFE7FA', fontSize: 11.5, fontWeight: 600, padding: '7px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// The 24/7 tick, shared by the add and edit forms so both describe the flag the
// same way. The hint states what it actually does, because "24/7" alone reads as
// a label rather than the playback decision it is.
function AlwaysOnToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 8, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 2, accentColor: C.gold, cursor: 'pointer' }}
      />
      <span style={{ minWidth: 0 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: C.text }}>Broadcasts 24/7</span>
        <span style={{ display: 'block', fontSize: 10, color: C.faint, lineHeight: 1.45, marginTop: 2 }}>
          Keeps the player up even when we can't confirm the stream is on. Tick it for a
          round-the-clock channel; leave it off for one that is dark between events.
        </span>
      </span>
    </label>
  );
}

// Paste a YouTube channel link and it joins the desk's wall. The link is parsed
// server-side, so anything YouTube shows in the address bar works — /@handle,
// /channel/UC…, or the older /c/ and /user/ forms.
function AddChannelForm({
  onAdd,
  count,
  canEdit,
  tier,
  onLocked,
}: {
  onAdd: (url: string, name: string, alwaysOn: boolean) => Promise<string | null>;
  count: number;
  // Whether this reader may actually add one. The button is drawn either way —
  // hiding it left a free account with no way to learn the wall takes its own
  // channels at all, which is the same reason a locked Studies tile is shown
  // rather than removed.
  canEdit: boolean;
  // What adding costs. Drawn for everyone, including somebody who holds it.
  tier: MembershipTier | null;
  onLocked: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [alwaysOn, setAlwaysOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!url.trim() || busy) return;
    setBusy(true);
    const problem = await onAdd(url.trim(), name.trim(), alwaysOn);
    setBusy(false);
    if (problem) {
      setErr(problem);
      return;
    }
    setUrl('');
    setName('');
    setAlwaysOn(false);
    setErr(null);
    setOpen(false);
  }

  if (!open || !canEdit) {
    return (
      <button
        onClick={() => (canEdit ? setOpen(true) : onLocked())}
        style={{
          marginTop: 4,
          padding: '9px 11px',
          background: 'none',
          border: `1px dashed ${C.line2}`,
          borderRadius: 8,
          color: C.muted,
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          opacity: canEdit ? 1 : 0.75,
        }}
      >
        <span>+ Add a channel</span>
        <TierMark tier={tier} size={12} dim={!canEdit} />
      </button>
    );
  }

  return (
    <div style={{ marginTop: 4, padding: 11, border: `1px solid ${C.line2}`, borderRadius: 8, background: 'rgba(255,255,255,.02)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', color: C.faint, marginBottom: 7 }}>
        Add a channel
      </div>
      <input
        autoFocus
        value={url}
        onChange={(e) => { setUrl(e.target.value); setErr(null); }}
        onKeyDown={(e) => e.key === 'Enter' && void submit()}
        placeholder="Paste a YouTube channel link"
        style={inputStyle}
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void submit()}
        placeholder="Name it (optional)"
        style={{ ...inputStyle, marginTop: 6 }}
      />
      <AlwaysOnToggle checked={alwaysOn} onChange={setAlwaysOn} />
      {err && <div style={{ fontSize: 11, color: '#ffb4ab', lineHeight: 1.45, marginTop: 7 }}>{err}</div>}
      <div style={{ fontSize: 10, color: C.faint, lineHeight: 1.45, marginTop: 7 }}>
        Any form works — youtube.com/@name or /channel/UC…. It joins the whole desk's wall.
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
        <button
          onClick={() => void submit()}
          disabled={!url.trim() || busy}
          style={{
            border: 'none',
            background: `linear-gradient(180deg, ${C.gold}, ${C.gold2})`,
            color: C.goldText,
            fontWeight: 700,
            fontSize: 11.5,
            padding: '7px 12px',
            borderRadius: 7,
            cursor: 'pointer',
            opacity: !url.trim() || busy ? 0.6 : 1,
            fontFamily: 'inherit',
          }}
        >
          {busy ? 'Adding…' : 'Add'}
        </button>
        <button
          onClick={() => { setOpen(false); setErr(null); }}
          style={{ background: 'rgba(255,255,255,.05)', border: `1px solid ${C.line2}`, color: '#DFE7FA', fontSize: 11.5, fontWeight: 600, padding: '7px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Cancel
        </button>
        <span style={{ marginLeft: 'auto', alignSelf: 'center', fontFamily: C.mono, fontSize: 10, color: '#3A4A6C' }}>
          {count} on the wall
        </span>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  background: '#091633',
  border: `1px solid ${C.line2}`,
  borderRadius: 7,
  color: C.text,
  fontSize: 12,
  padding: '8px 10px',
  outline: 'none',
  fontFamily: 'inherit',
};

// What the Federal Reserve tile shows while the Fed is dark, which is nearly all
// the time: when the next rate decision lands and how long ago the last one was.
// The Fed is the one channel on the wall worth keeping open when it is *not*
// broadcasting, and this is the reason why.
function FedMeetingCard({ fomc, now }: { fomc: FomcSchedule; now: number }) {
  const next = nextMeetingStamp(now, fomc.meetings, fomc.meetingYear);
  const prev = prevMeetingStamp(now, fomc.meetings, fomc.meetingYear);
  // Four tiles across leaves each one about 280px wide, so this has to fit a
  // ~155px-tall box. Everything here is sized to survive that: no explanatory
  // sentence (it wrapped to three lines and pushed the card over its own
  // footer), tight gaps, and `clamp` so the countdown grows on a wide tile
  // without blowing out a narrow one.
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '10px 12px', textAlign: 'center', overflow: 'hidden' }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.1px', color: C.faint, whiteSpace: 'nowrap' }}>
        Next FOMC decision
      </div>
      <div style={{ fontFamily: C.mono, fontSize: 'clamp(18px, 7cqw, 28px)', fontWeight: 700, color: C.gold, lineHeight: 1.05, whiteSpace: 'nowrap' }}>
        {countdown(next - now)}
      </div>
      <div style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>
        {etDay(next)} · 2:00 PM ET
      </div>
      <div style={{ fontSize: 10, color: C.faint, lineHeight: 1.4 }}>
        Last decision {etDay(prev)} · {agoLabel(now - prev)}
      </div>
    </div>
  );
}

function StreamTile({
  c,
  fomc,
  now,
  onDock,
  onClose,
}: {
  c: StreamChannel;
  fomc: FomcSchedule | null;
  now: number;
  onDock: () => void;
  onClose: () => void;
}) {
  // Play the resolved video whenever there is one — that covers a live stream
  // and a scheduled one (YouTube's waiting room rolls into the broadcast by
  // itself, so nobody has to catch the moment it starts).
  //
  // With no resolved video the question is whether we actually looked. Once the
  // server has read the channel, "dark" is the truth and the tile says so. Until
  // then — a server that cannot reach youtube.com never gets an answer — fall
  // back to the old optimistic embed rather than claiming a channel is off air
  // on the strength of never having checked.
  // Play when there is a video to play, when we know the channel is on (the
  // channel-based embed handles that case and is proven to work), or when we
  // simply have no reading — never claim dark on the strength of not looking.
  // The only case that does NOT play is a channel positively established as off
  // air, which is what the offline card is for.
  // **Our reading never suppresses the player.** The embedded player is the one
  // authority on whether a stream is on: it plays when the channel is live and
  // shows YouTube's own card when it is not. A server-side reading is a guess by
  // comparison — from a datacenter a consent or redirect page is indistinguish-
  // able from a dark channel, so "dark" is the answer we get wrong most often.
  // Letting that guess win took a 24/7 channel that was visibly broadcasting and
  // replaced it with "not live right now".
  //
  // So a channel that is *meant* to be on always tries. Only a channel that is
  // genuinely dark most of the time (the Fed) is allowed to skip the player on a
  // negative reading, because there the countdown is the better thing to show and
  // being wrong for a few minutes costs nothing.
  const alwaysTries = c.alwaysOn === true;
  const canEmbed =
    !c.embedBlocked &&
    (!!c.liveVideoId ||
      (!!c.channelId && (alwaysTries || c.live || !!c.upcoming || !liveKnown(c))));
  // The Fed's countdown replaces a dead player, never a live one. It shows when
  // the tile has nothing to play, and also when the state is merely unknown —
  // the Fed is dark all but a few hours a year, so "unknown" almost always means
  // dark. The exception is the meeting window itself, where the stream matters
  // more than the countdown and the tile should attempt to play regardless.
  const fedWindow = !!fomc && inFedMeetingWindow(fomc, now);
  const showFedCard = !!fomc && isFedChannel(c) && !c.live && (!canEmbed || (!liveKnown(c) && !fedWindow));
  return (
    <div style={{ background: C.panel, borderRadius: 12, overflow: 'hidden', border: `1px solid ${c.live ? tint(C.red, 0.35) : C.line}` }}>
      {/* The 16:9 media box. `overflow: hidden` is load-bearing: a card inside it
          that runs long must be clipped, not allowed to spill over the tile's own
          caption below. `containerType` gives the card a width to size against. */}
      <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', background: '#050B18', overflow: 'hidden', containerType: 'inline-size' }}>
        {c.embedBlocked ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, textAlign: 'center', overflow: 'hidden' }}>
            {/* The badge states a fact about *now*, so it is tied to the live
                reading rather than printed unconditionally. Hardcoding it put
                "LIVE NOW" on a tile whose own caption, and the header count,
                both said the channel was off air. */}
            {c.live && (
              <span style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#fff', background: C.red, borderRadius: 4, padding: '2px 6px' }}>
                Live now
              </span>
            )}
            <div style={{ fontSize: 11.5, color: C.muted, maxWidth: 310, lineHeight: 1.5 }}>
              {c.live
                ? `${c.name} is broadcasting, but this channel does not allow its stream to play outside YouTube.`
                : `${c.name} does not allow its stream to play outside YouTube. Open it there to watch when it is on.`}
            </div>
            <a
              href={channelUrl(c)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11.5, fontWeight: 600, color: C.text, background: tint(C.red, 0.12), border: `1px solid ${tint(C.red, 0.45)}`, padding: '7px 12px', borderRadius: 7, textDecoration: 'none' }}
            >
              Watch on YouTube ↗
            </a>
          </div>
        ) : showFedCard ? (
          <FedMeetingCard fomc={fomc!} now={now} />
        ) : canEmbed ? (
          <iframe
            title={c.name}
            src={embedSrc(c)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 11.5, color: C.muted, maxWidth: 300, lineHeight: 1.5 }}>
              {c.channelId
                ? `${c.name} is not live right now. This slot starts playing when it goes live.`
                : `${c.name} can't play here yet — its channel ID is still being looked up. Watch it on YouTube in the meantime.`}
            </div>
            <a href={channelUrl(c)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 600, color: C.gold, textDecoration: 'none' }}>
              Open on YouTube ↗
            </a>
          </div>
        )}
      </div>
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.line}`, background: C.panel2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {c.live && (
            <span style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#fff', background: C.red, borderRadius: 4, padding: '1px 5px' }}>
              LIVE
            </span>
          )}
          <span style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
          <button onClick={onClose} title="Stop watching" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.faint, fontSize: 15, cursor: 'pointer', lineHeight: 1 }}>
            ×
          </button>
        </div>
        <div style={{ fontSize: 11, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 3 }}>
          {c.live
            ? c.streamTitle ?? 'Live'
            : c.upcoming
              ? c.streamTitle ?? 'Scheduled — waiting to start'
              : liveKnown(c) && !alwaysTries
                ? `Offline · last stream ${c.lastTitle ?? '—'}`
                : // Either no reading at all, or a "dark" reading on a channel
                  // that broadcasts round the clock — where a negative answer is
                  // more likely our read having failed than the channel being
                  // off air. The player above is showing the truth either way,
                  // so do not contradict it with a flat "Offline".
                  'Live status unconfirmed — the player above shows whether it is on'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap', marginTop: 6 }}>
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint }}>{c.live ? c.viewers ?? '' : c.lastLive ?? 'offline'}</span>
          <button onClick={onDock} style={{ background: 'none', border: 'none', fontSize: 10.5, fontWeight: 600, color: C.muted, cursor: 'pointer' }}>
            Dock to corner
          </button>
          <a href={channelUrl(c)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10.5, fontWeight: 600, color: C.gold, textDecoration: 'none' }}>
            YouTube ↗
          </a>
        </div>
      </div>
    </div>
  );
}

function StreamsEmpty({ channels, onWatch }: { channels: StreamChannel[]; onWatch: (key: string) => void }) {
  const firstLive = channels.find((c) => c.live);
  return (
    <div style={{ background: C.panel, border: `1px dashed ${C.line2}`, borderRadius: 12, padding: '34px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 13, color: C.muted, maxWidth: 430, margin: '0 auto', lineHeight: 1.55 }}>
        Pick a channel to watch it here beside the headlines instead of in another tab. One plays at a time — choosing another switches to it.
      </div>
      {firstLive && (
        <button
          onClick={() => onWatch(firstLive.key)}
          style={{ marginTop: 14, fontSize: 11.5, fontWeight: 600, color: C.text, background: tint(C.red, 0.12), border: `1px solid ${tint(C.red, 0.45)}`, padding: '8px 13px', borderRadius: 7, cursor: 'pointer' }}
        >
          Watch {firstLive.name}
        </button>
      )}
    </div>
  );
}

function MiniPlayer({ c, onUndock, onClose }: { c: StreamChannel; onUndock: () => void; onClose: () => void }) {
  const canEmbed = !!c.channelId;
  return (
    <div
      style={{
        position: 'fixed',
        right: 20,
        bottom: 20,
        width: 380,
        maxWidth: 'calc(var(--app-w) - 40px)',
        zIndex: 60,
        background: C.panel,
        border: `1px solid ${C.line2}`,
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 16px 40px rgba(0,0,0,.5)',
      }}
    >
      <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', background: '#050B18' }}>
        {canEmbed ? (
          <iframe
            title={c.name}
            src={embedSrc(c)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14, textAlign: 'center' }}>
            <a href={channelUrl(c)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 600, color: C.gold, textDecoration: 'none' }}>
              Open on YouTube ↗
            </a>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', background: C.panel2 }}>
        {c.live && (
          <span style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#fff', background: C.red, borderRadius: 4, padding: '1px 5px' }}>
            LIVE
          </span>
        )}
        <span style={{ fontSize: 11.5, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
          {c.name}
          {c.live && c.streamTitle ? ` — ${c.streamTitle}` : ''}
        </span>
        <button onClick={onUndock} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 12, fontWeight: 600, color: C.muted, cursor: 'pointer' }}>
          Undock
        </button>
        <button onClick={onClose} title="Stop watching" style={{ background: 'none', border: 'none', color: C.faint, fontSize: 15, cursor: 'pointer', lineHeight: 1 }}>
          ×
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Headline feed pieces
// ---------------------------------------------------------------------------

function HeadlineRow({
  h,
  now,
  watchlist,
  open,
  onToggle,
}: {
  h: NewsItem;
  now: number;
  watchlist: string[];
  open: boolean;
  onToggle: () => void;
}) {
  const mentions = useMemo(() => affectedInstruments(h, watchlist).slice(0, 3), [h, watchlist]);
  const bias =
    h.bias === 'bullish'
      ? { glyph: '▲', color: C.green, label: 'Tape read: bullish' }
      : h.bias === 'bearish'
        ? { glyph: '▼', color: C.red, label: 'Tape read: bearish' }
        : { glyph: '●', color: C.faint, label: 'Tape read: flat' };
  const excerpt = h.body ? decodeEntities(h.body) : '';
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'grid',
        gridTemplateColumns: '48px minmax(0,1fr)',
        gap: 14,
        alignItems: 'start',
        padding: '13px 0',
        borderTop: `1px solid ${C.line}`,
        cursor: 'pointer',
      }}
    >
      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>{shortAge(h.publishedAt, now)}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.45, color: open ? '#fff' : C.text }}>
          {decodeEntities(h.title)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 7 }}>
          {SHOW_BIAS && (
            <span title={bias.label} style={{ fontSize: 9, color: bias.color }}>
              {bias.glyph}
            </span>
          )}
          {h.source && <span style={{ fontSize: 11.5, color: C.muted }}>{h.source}</span>}
          <span style={{ fontSize: 10, color: '#3A4A6C' }}>·</span>
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.6px', color: C.faint }}>
            {CATEGORY_LABEL[h.category] ?? 'Markets'}
          </span>
          {mentions.map((sym) => (
            <span
              key={sym}
              style={{
                fontFamily: C.mono,
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '.3px',
                color: C.gold,
                background: tint(C.gold, 0.1),
                border: `1px solid ${tint(C.gold, 0.3)}`,
                borderRadius: 5,
                padding: '1px 6px',
              }}
            >
              {sym}
            </span>
          ))}
        </div>
        {open && (
          <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: `2px solid ${C.line2}` }}>
            {excerpt && <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, maxWidth: 660 }}>{excerpt}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: excerpt ? 8 : 0 }}>
              {h.url && (
                <a
                  href={h.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{ fontSize: 11.5, fontWeight: 600, color: C.gold, textDecoration: 'none' }}
                >
                  Open at {h.source ?? 'source'} ↗
                </a>
              )}
              <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint }}>
                {fmtTime(h.publishedAt)} {zoneAbbr(h.publishedAt)} · {fmtDayKey(h.publishedAt)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        fontWeight: 600,
        color: C.gold,
        background: tint(C.gold, 0.12),
        border: `1px solid ${tint(C.gold, 0.4)}`,
        borderRadius: 6,
        padding: '4px 9px',
      }}
    >
      {label}
      <button onClick={onClear} style={{ background: 'none', border: 'none', color: C.gold2, fontSize: 12, cursor: 'pointer', lineHeight: 1, padding: 0 }}>
        ×
      </button>
    </span>
  );
}

function EmptyCard({ children }: { children: ReactNode }) {
  return <div style={{ ...emptyCard, color: C.muted, fontSize: 13 }}>{children}</div>;
}

// ---------------------------------------------------------------------------
// styles
// ---------------------------------------------------------------------------

const rootStyle: CSSProperties = { color: C.text, animation: 'fadeIn .25s ease', padding: '22px 32px 8px' };
const card: CSSProperties = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' };
const noticePanel: CSSProperties = { background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 13px' };
const emptyCard: CSSProperties = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: '32px 18px', textAlign: 'center' };
const ghostBtn: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: '#DFE7FA',
  background: 'rgba(255,255,255,.05)',
  border: `1px solid ${C.line2}`,
  padding: '8px 12px',
  borderRadius: 7,
  cursor: 'pointer',
};
const pillBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  fontSize: 12.5,
  padding: '7px 13px',
  borderRadius: 8,
  border: '1px solid',
  cursor: 'pointer',
};
const miniLabel: CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', color: C.faint };
const groupLabel: CSSProperties = { fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1.4px', color: C.faint };
const banner: CSSProperties = {
  marginTop: 14,
  fontSize: 12.5,
  color: '#ffb4ab',
  background: tint(C.red, 0.1),
  border: `1px solid ${tint(C.red, 0.4)}`,
  borderRadius: 8,
  padding: '9px 12px',
  cursor: 'pointer',
};
const GOLD_TINT_GRADIENT = `linear-gradient(180deg, ${tint(C.gold, 0.16)}, ${tint(C.gold, 0.08)})`;
