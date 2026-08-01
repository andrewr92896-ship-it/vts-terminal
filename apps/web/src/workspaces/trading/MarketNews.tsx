import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useNowTick } from '../../hooks/useNowTick';
import { Icon } from '../../components/Icon';
import { C, tint } from '../../theme/tokens';
import { ScreenTitle } from './ScreenTitle';
import { newsFeeds, affectedInstruments, deriveWatchlist, DEFAULT_WATCHLIST } from './newsRelevance';
import { decodeEntities, fmtDayKey, fmtTime } from './newsFormat';
import type { MarketNewsData, MarketNewsStreams, NewsItem, StreamChannel } from '../../api/types';

// Market News — the desk's headline feed plus an embedded YouTube live-stream
// wall (watch a press conference beside the headlines). This screen deliberately
// carries no AI overview, no "how it could affect us" note, no impact dots and
// no economic calendar — the calendar moved to Market Data, and the rest were
// removed to keep the screen free of recommendation-flavoured copy. A single
// tape-read glyph per headline is the one directional cue, switchable off here.
const SHOW_BIAS = true;

const REFRESH_MS = 120_000;
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
  const mk = (key: string, name: string, handle: string, channelId: string): StreamChannel => ({
    key,
    name,
    handle,
    channelId,
    live: false,
  });
  return {
    channels: [
      mk('fed', 'Federal Reserve', '@federalreserve', 'UCAzhpt9DmG6PnHXjmJTvRGQ'),
      mk('reuters', 'Reuters', '@Reuters', ''),
      mk('cnbc', 'CNBC Television', '@CNBCtelevision', ''),
      mk('ecb', 'European Central Bank', '@ecbeuro', ''),
    ],
    watching: [],
    docked: null,
    cols: 2,
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

function embedSrc(c: StreamChannel): string {
  return c.channelId ? `https://www.youtube.com/embed/live_stream?channel=${c.channelId}&autoplay=1&rel=0` : '';
}
function channelUrl(c: StreamChannel): string {
  if (c.channelId) return `https://www.youtube.com/channel/${c.channelId}/live`;
  if (c.handle) return `https://www.youtube.com/${c.handle}/live`;
  return 'https://www.youtube.com';
}

export function MarketNews() {
  // Keep the "x ago" ages fresh between the 120s data polls.
  const now = useNowTick(30_000);
  const { user } = useAuth();
  // The channel list is desk-wide, so reshaping it needs Trading write access —
  // a view-only role and the public demo watch the wall but can't change it.
  const canWrite = !!user && !user.access.readOnlyWorkspaces.includes('trading');

  // --- headline feed ---
  const [data, setData] = useState<MarketNewsData | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>(DEFAULT_WATCHLIST);
  const [err, setErr] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // --- live-stream setup (persisted per user) ---
  const [streams, setStreams] = useState<MarketNewsStreams | null>(null);
  const [liveConfigured, setLiveConfigured] = useState(false);

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
      const at = lastLoaded ? `Showing headlines from ${fmtTime(lastLoaded)} ET. ` : '';
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
        setLiveConfigured(r.liveConfigured);
      })
      .catch(() => setStreams(localDefaultStreams()));
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

  // Adding or removing a channel changes what the whole desk sees, so it goes
  // straight to the server rather than through the debounced view-state save,
  // and the reply is the authoritative list (with the id it managed to resolve).
  async function addChannel(url: string, name: string): Promise<string | null> {
    try {
      const r = await api.addMarketNewsChannel({ url, name: name || undefined });
      setStreams(r.streams);
      setLiveConfigured(r.liveConfigured);
      return null;
    } catch (e) {
      return e instanceof ApiError ? e.message : "Couldn't add that channel.";
    }
  }

  function removeChannel(key: string, name: string): void {
    if (!window.confirm(`Remove ${name} from the desk's stream wall?`)) return;
    api
      .removeMarketNewsChannel(key)
      .then((r) => {
        setStreams(r.streams);
        setLiveConfigured(r.liveConfigured);
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
            <div style={subtitle}>
              {"Every headline the desk's feeds carry, newest first, with the instruments each story mentions. All times Eastern."}
            </div>
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
          onAddChannel={addChannel}
          onRemoveChannel={removeChannel}
          streams={streams}
          liveConfigured={liveConfigured}
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
  liveConfigured,
  contentW,
  liveOpen,
  setLiveOpen,
  mutate,
  canEdit,
  onAddChannel,
  onRemoveChannel,
}: {
  streams: MarketNewsStreams | null;
  liveConfigured: boolean;
  contentW: number;
  liveOpen: boolean;
  setLiveOpen: (v: boolean) => void;
  mutate: (fn: (s: MarketNewsStreams) => MarketNewsStreams) => void;
  // The channel list is desk-wide, so changing it needs write access — a
  // view-only role and the demo can watch the wall but not reshape it.
  canEdit: boolean;
  onAddChannel: (url: string, name: string) => Promise<string | null>;
  onRemoveChannel: (key: string, name: string) => void;
}) {
  if (!streams) return null;
  const channels = streams.channels;
  const watching = streams.watching;
  const liveCount = channels.filter((c) => c.live).length;

  const maxCols = contentW >= 1500 ? 6 : contentW >= 1240 ? 4 : contentW >= 900 ? 3 : 1;
  const cols = Math.min(streams.cols, maxCols);

  const tiles = watching
    .map((k) => channels.find((c) => c.key === k))
    .filter((c): c is StreamChannel => !!c && c.key !== streams.docked);
  const dockedChan = streams.docked ? channels.find((c) => c.key === streams.docked) : null;

  const toggleWatch = (key: string) =>
    mutate((s) => {
      const open = s.watching.includes(key);
      return {
        ...s,
        watching: open ? s.watching.filter((k) => k !== key) : [...s.watching, key],
        docked: open && s.docked === key ? null : s.docked,
      };
    });
  const closeTile = (key: string) =>
    mutate((s) => ({
      ...s,
      watching: s.watching.filter((k) => k !== key),
      docked: s.docked === key ? null : s.docked,
    }));
  const toggleNotify = (key: string) =>
    mutate((s) => ({ ...s, notify: { ...s.notify, [key]: !s.notify[key] } }));
  const watchingLabel =
    `${tiles.length} ${tiles.length === 1 ? 'stream' : 'streams'} open` +
    (streams.cols > maxCols ? ` · ${maxCols} across at this width` : '');

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
          {liveCount} live · {channels.length} channels
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setLiveOpen(!liveOpen)} style={{ background: 'none', border: 'none', fontSize: 11, fontWeight: 600, color: C.muted, cursor: 'pointer' }}>
            {liveOpen ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {liveOpen && (
        <>
          {!liveConfigured && (
            <div style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.5, marginBottom: 12 }}>
              Live status and viewer counts aren't wired up yet (sample) — channels read as offline. Any channel with a channel ID still plays here when it goes live.
            </div>
          )}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: contentW >= 900 ? 'minmax(0,1fr) 288px' : 'minmax(0,1fr)',
              gap: 20,
              alignItems: 'start',
            }}
          >
            {/* left column: layout controls + tiles */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', color: C.faint }}>
                  LAYOUT
                </span>
                {[1, 2, 3, 4, 5, 6].map((n) => {
                  const active = streams.cols === n;
                  return (
                    <button
                      key={n}
                      onClick={() => mutate((s) => ({ ...s, cols: n }))}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '5px 10px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        color: active ? C.gold : C.muted,
                        background: active ? GOLD_TINT_GRADIENT : 'rgba(255,255,255,.02)',
                        border: `1px solid ${active ? tint(C.gold, 0.35) : C.line2}`,
                      }}
                    >
                      {n} up
                    </button>
                  );
                })}
                <span style={{ marginLeft: 'auto', fontSize: 10.5, color: C.faint }}>{watchingLabel}</span>
              </div>

              {dockedChan && (
                <div style={{ ...noticePanel, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: C.muted }}>{dockedChan.name} is playing in the corner.</span>
                  <button onClick={() => mutate((s) => ({ ...s, docked: null }))} style={{ ...ghostBtn, marginLeft: 'auto' }}>
                    Bring it back here
                  </button>
                </div>
              )}

              {tiles.length === 0 && !dockedChan ? (
                <StreamsEmpty channels={channels} onWatch={(k) => toggleWatch(k)} />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(cols, Math.max(1, tiles.length))}, minmax(0,1fr))`, gap: 12 }}>
                  {tiles.map((c) => (
                    <StreamTile
                      key={c.key}
                      c={c}
                      liveConfigured={liveConfigured}
                      onDock={() => mutate((s) => ({ ...s, docked: c.key }))}
                      onClose={() => closeTile(c.key)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* right column: channel list */}
            <div style={{ ...card, padding: 0 }}>
              {channels.map((c, i) => {
                const isWatching = watching.includes(c.key);
                const armed = !!streams.notify[c.key];
                return (
                  <div
                    key={c.key}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '11px 13px',
                      borderTop: `1px solid ${i === 0 ? 'transparent' : C.line}`,
                      background: isWatching ? tint(C.gold, 0.04) : 'transparent',
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
                      onClick={() => toggleWatch(c.key)}
                      style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: isWatching ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.name}
                        </span>
                        {isWatching && (
                          <span style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', color: C.gold, border: `1px solid ${tint(C.gold, 0.4)}`, borderRadius: 4, padding: '1px 5px' }}>
                            OPEN
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
                        {c.live ? c.streamTitle ?? 'Live' : c.lastLive ?? 'Offline'}
                      </div>
                      {c.handle && <div style={{ fontFamily: C.mono, fontSize: 9.5, color: '#3A4A6C', marginTop: 2 }}>{c.handle}</div>}
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button
                        onClick={() => toggleNotify(c.key)}
                        title={armed ? 'Alert on when this channel goes live' : 'Alert me when this channel goes live'}
                        style={{ width: 24, height: 24, display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        <Icon name="bell" size={13} color={armed ? C.gold : '#3A4A6C'} />
                      </button>
                      {canEdit && (
                        <button
                          onClick={() => onRemoveChannel(c.key, c.name)}
                          title="Remove this channel from the desk's wall"
                          style={{ width: 24, height: 24, display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#3A4A6C', fontSize: 15, lineHeight: 1 }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {canEdit && <AddChannelForm onAdd={onAddChannel} count={channels.length} />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Paste a YouTube channel link and it joins the desk's wall. The link is parsed
// server-side, so anything YouTube shows in the address bar works — /@handle,
// /channel/UC…, or the older /c/ and /user/ forms.
function AddChannelForm({
  onAdd,
  count,
}: {
  onAdd: (url: string, name: string) => Promise<string | null>;
  count: number;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!url.trim() || busy) return;
    setBusy(true);
    const problem = await onAdd(url.trim(), name.trim());
    setBusy(false);
    if (problem) {
      setErr(problem);
      return;
    }
    setUrl('');
    setName('');
    setErr(null);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
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
        }}
      >
        + Add a channel
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

function StreamTile({
  c,
  liveConfigured,
  onDock,
  onClose,
}: {
  c: StreamChannel;
  liveConfigured: boolean;
  onDock: () => void;
  onClose: () => void;
}) {
  // Embed when the channel has an id AND we don't positively know it's offline.
  // Before the poller exists (or with no API key) live-state is unknown, so we
  // still embed and let the keyless live_stream player self-show offline —
  // better than claiming "not live" about a channel we never checked.
  const canEmbed = !!c.channelId && (c.live || !liveConfigured);
  return (
    <div style={{ background: C.panel, borderRadius: 12, overflow: 'hidden', border: `1px solid ${c.live ? tint(C.red, 0.35) : C.line}` }}>
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
          {c.live ? c.streamTitle ?? 'Live' : `Offline · last stream ${c.lastTitle ?? '—'}`}
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
        Open as many channels as you want — they play side by side here, so a press conference runs beside the headlines instead of in another tab.
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
        maxWidth: 'calc(100vw - 40px)',
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
                {fmtTime(h.publishedAt)} ET · {fmtDayKey(h.publishedAt)}
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
const subtitle: CSSProperties = { fontSize: 12.5, color: C.muted, margin: '6px 0 0', maxWidth: 640 };
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
