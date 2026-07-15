import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useNowTick } from '../../hooks/useNowTick';
import { useAuth } from '../../auth/AuthContext';
import { affectedInstruments, deriveWatchlist, newsFeeds, NEWS_FEEDS, DEFAULT_WATCHLIST } from './newsRelevance';
import type {
  CalendarEvent,
  EventInput,
  MarketNewsData,
  NewsBias,
  NewsCategory,
  NewsImpact,
  NewsInput,
  NewsItem,
  TruthPost,
} from '../../api/types';

const GOLD = '#EBCB74';
const GREEN = '#35c47b';
const RED = '#ef5468';
const AMBER = '#e0a23a';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const CARD = 'rgba(13,31,68,.5)';
const PANEL = 'rgba(11,26,58,.5)';
const INPUT_BG = '#091633';
const BORDER = '#16294f';
const BORDER2 = '#1c3a7a';

const REFRESH_MS = 120_000;

const IMPACT: Record<NewsImpact, { label: string; color: string }> = {
  high: { label: 'High', color: RED },
  medium: { label: 'Med', color: AMBER },
  low: { label: 'Low', color: FAINT },
};
const BIAS: Record<NewsBias, { label: string; color: string }> = {
  bullish: { label: 'Bullish', color: GREEN },
  bearish: { label: 'Bearish', color: RED },
  neutral: { label: 'Neutral', color: MUTED },
};
const CATEGORY: Record<NewsCategory, string> = {
  markets: 'Markets',
  geopolitical: 'Geopolitical',
  economic: 'Economic',
  crypto: 'Crypto',
  other: 'Other',
};

const ET = 'America/New_York';
function fmtTime(ms: number): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: 'numeric', minute: '2-digit' }).format(ms);
}
function fmtDayKey(ms: number): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'short', month: 'short', day: 'numeric' }).format(ms);
}
function fmtRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 0) return fmtTime(ms);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return fmtDayKey(ms);
}
// Datetime-local <-> ms helpers, interpreted in the browser's local zone.
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MarketNews() {
  // Keep the "x ago" headline times fresh between the 120s data polls.
  useNowTick();
  const { user } = useAuth();
  // Read-only for trading view-only roles AND the public demo (which is marked
  // read-only on every workspace). Gates the compose/edit/remove controls below.
  const canWrite = !!user && !user.access.readOnlyWorkspaces.includes('trading');

  const [data, setData] = useState<MarketNewsData | null>(null);
  const [truth, setTruth] = useState<TruthPost[]>([]);
  // The instruments this trader actually trades, used to tag each headline with
  // the positions it would affect. Best-effort: defaults until the log loads.
  const [watchlist, setWatchlist] = useState<string[]>(DEFAULT_WATCHLIST);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [brief, setBrief] = useState<string | null>(null);
  const [briefBusy, setBriefBusy] = useState(false);
  // Which subfeed is showing, and the story filters within it (impact / bias).
  const [feed, setFeed] = useState<string>('all');
  const [impactFilter, setImpactFilter] = useState<'all' | 'high' | 'medhigh'>('all');
  const [biasFilter, setBiasFilter] = useState<'all' | NewsBias>('all');

  async function load() {
    try { setData(await api.marketNews()); setErr(null); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed to load'); }
    // Best-effort: the Truth Social feed may be empty if the server poll is
    // blocked, so a failure here never affects the rest of the page.
    api.tradingTruth().then((r) => setTruth(r.posts)).catch(() => {});
  }
  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derive the watchlist from the trade log once on mount. Best-effort — on any
  // failure (or an empty log) the default majors set keeps the tags working.
  useEffect(() => {
    api.tradeLog()
      .then((r) => setWatchlist(deriveWatchlist(r.trades.map((t) => t.instrument))))
      .catch(() => {});
  }, []);

  async function run(p: Promise<MarketNewsData>): Promise<boolean> {
    setBusy(true);
    try { setData(await p); setErr(null); return true; } catch (e) { setErr(e instanceof ApiError ? e.message : 'Action failed'); return false; } finally { setBusy(false); }
  }

  async function getBrief() {
    setBriefBusy(true);
    try { setBrief((await api.newsBrief()).brief); setErr(null); }
    catch (e) { setErr(e instanceof ApiError ? (e.status === 503 ? 'Claude isn’t configured yet — an API key needs to be set on the server.' : e.message) : 'Brief failed'); }
    finally { setBriefBusy(false); }
  }

  // Upcoming events first; split out past events into their own (collapsed-feel) tail.
  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const cal = data?.calendar ?? [];
    return {
      upcoming: cal.filter((e) => e.eventTime >= now - 6 * 3600_000),
      past: cal.filter((e) => e.eventTime < now - 6 * 3600_000).reverse(),
    };
  }, [data]);

  if (err && !data) return <div style={{ color: RED, padding: 20, fontSize: 13 }}>{err}</div>;
  if (!data) return <div style={{ color: MUTED, padding: 20, fontSize: 13 }}>Loading market news…</div>;

  const headlines = data.headlines;

  // Tab counts key on topic membership only (the impact/bias filters narrow the
  // list inside a feed but leave the tab counts stable).
  const counts: Record<string, number> = { all: headlines.length, trump: truth.length, calendar: data.calendar.length };
  for (const f of NEWS_FEEDS) counts[f.key] = 0;
  for (const h of headlines) for (const k of newsFeeds(h)) counts[k] = (counts[k] ?? 0) + 1;

  const isNewsTab = feed !== 'trump' && feed !== 'calendar';

  // Headlines for the active news tab, after the impact/bias filters.
  const shown = isNewsTab
    ? headlines.filter((h) => {
        if (feed !== 'all' && !newsFeeds(h).includes(feed)) return false;
        if (impactFilter === 'high' && h.impact !== 'high') return false;
        if (impactFilter === 'medhigh' && h.impact === 'low') return false;
        if (biasFilter !== 'all' && h.bias !== biasFilter) return false;
        return true;
      })
    : [];

  const tabs: { key: string; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'trump', label: 'Trump' },
    ...NEWS_FEEDS,
    { key: 'calendar', label: 'Calendar' },
  ];

  const filtersActive = impactFilter !== 'all' || biasFilter !== 'all';

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Market News</h2>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6 }}>
            Live headlines across the desk's markets, each read by Claude for bias, impact, and how it could affect our trading — plus Trump's Truth Social posts and the Forex Factory economic calendar (Eastern Time).
          </div>
        </div>
        <button onClick={() => void getBrief()} disabled={briefBusy} style={{ ...ghostBtn, opacity: briefBusy ? 0.6 : 1 }}>
          {briefBusy ? 'Briefing…' : '✨ Brief me'}
        </button>
      </div>

      {err && <div onClick={() => setErr(null)} style={banner}>{err} — click to dismiss.</div>}

      {brief && (
        <div style={{ ...card, borderLeft: `3px solid ${GOLD}`, marginBottom: 16, position: 'relative' }}>
          <div style={{ fontSize: 9.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: GOLD, marginBottom: 6 }}>Claude desk brief · Sonnet</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: '#dce6fb', whiteSpace: 'pre-wrap' }}>{brief}</div>
          <button onClick={() => setBrief(null)} style={{ position: 'absolute', top: 10, right: 12, background: 'none', border: 'none', color: FAINT, fontSize: 16, cursor: 'pointer' }}>×</button>
        </div>
      )}

      {/* Subfeed tabs */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 12, scrollbarWidth: 'none' }}>
        {tabs.map((t) => {
          const active = feed === t.key;
          const n = counts[t.key] ?? 0;
          return (
            <button key={t.key} onClick={() => setFeed(t.key)} style={{ ...tabBtn, ...(active ? tabBtnActive : null), opacity: !active && n === 0 && t.key !== 'all' ? 0.5 : 1 }}>
              {t.label}
              <span style={{ marginLeft: 6, fontSize: 10, color: active ? '#0c2768' : FAINT, fontFamily: "'IBM Plex Mono', monospace" }}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* Story filters (news feeds only) */}
      {isNewsTab && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <FilterGroup label="Impact" value={impactFilter} onChange={(v) => setImpactFilter(v as typeof impactFilter)}
            options={[{ v: 'all', l: 'All' }, { v: 'medhigh', l: 'Med+' }, { v: 'high', l: 'High' }]} />
          <FilterGroup label="Bias" value={biasFilter} onChange={(v) => setBiasFilter(v as typeof biasFilter)}
            options={[{ v: 'all', l: 'All' }, { v: 'bullish', l: 'Bullish', c: GREEN }, { v: 'bearish', l: 'Bearish', c: RED }, { v: 'neutral', l: 'Neutral' }]} />
          {filtersActive && (
            <button onClick={() => { setImpactFilter('all'); setBiasFilter('all'); }} style={{ ...smallBtn, borderColor: 'transparent', color: FAINT }}>Clear</button>
          )}
        </div>
      )}

      {/* Trump / Truth Social feed */}
      {feed === 'trump' && (
        truth.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', padding: '34px 20px', color: MUTED, fontSize: 13 }}>
            No Truth Social posts yet — the feed mirrors @realDonaldTrump's posts as they land.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {truth.map((p) => (
              <div key={p.id} style={{ ...card, borderLeft: `3px solid ${GOLD}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#fff' }}>{p.author} <span style={{ color: FAINT, fontWeight: 400 }}>· @realDonaldTrump</span></span>
                  <span style={{ fontSize: 10.5, color: FAINT, fontFamily: "'IBM Plex Mono', monospace" }}>{fmtRelative(p.postedAt)}</span>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.55, color: '#dce6fb', whiteSpace: 'pre-wrap' }}>{p.content}</div>
                {p.url && (
                  <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 7, fontSize: 11, color: GOLD, textDecoration: 'none' }}>
                    View on Truth Social →
                  </a>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* Economic calendar feed */}
      {feed === 'calendar' && (
        data.calendar.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', padding: '34px 20px', color: MUTED, fontSize: 13 }}>
            No events yet — the Forex Factory feed populates within a few minutes.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <CalendarColumn events={upcoming} canWrite={canWrite} busy={busy} run={run} />
            {past.length > 0 && (
              <div style={{ opacity: 0.65 }}>
                <div style={{ fontSize: 10, letterSpacing: '0.5px', textTransform: 'uppercase', color: FAINT, margin: '4px 0 8px' }}>Past</div>
                <CalendarColumn events={past} canWrite={canWrite} busy={busy} run={run} />
              </div>
            )}
          </div>
        )
      )}

      {/* News headline feeds */}
      {isNewsTab && (
        headlines.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', padding: '34px 20px', color: MUTED, fontSize: 13 }}>
            No headlines yet — the live news feeds populate within a few minutes.
          </div>
        ) : shown.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', padding: '34px 20px', color: MUTED, fontSize: 13 }}>
            No stories match this filter{feed !== 'all' ? ' in this feed' : ''}. {filtersActive ? 'Try clearing the filters.' : 'Check back shortly.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {shown.map((h) => (
              <HeadlineCard key={h.id} h={h} canWrite={canWrite} busy={busy} watchlist={watchlist}
                onSave={(p) => run(api.updateNews(h.id, p))}
                onRemove={() => run(api.removeNews(h.id))} />
            ))}
          </div>
        )
      )}
    </div>
  );
}

function FilterGroup({ label, value, options, onChange }: { label: string; value: string; options: { v: string; l: string; c?: string }[]; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 10, letterSpacing: '0.4px', textTransform: 'uppercase', color: FAINT, fontWeight: 600 }}>{label}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {options.map((o) => {
          const active = value === o.v;
          return (
            <button key={o.v} onClick={() => onChange(o.v)} style={{
              fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${active ? (o.c ?? BORDER2) : BORDER}`,
              background: active ? (o.c ? `${o.c}22` : 'rgba(255,255,255,.08)') : 'transparent',
              color: active ? (o.c ?? TEXT) : MUTED,
            }}>{o.l}</button>
          );
        })}
      </div>
    </div>
  );
}

function HeadlineCard({ h, canWrite, busy, watchlist, onSave, onRemove }: { h: NewsItem; canWrite: boolean; busy: boolean; watchlist: string[]; onSave: (p: NewsInput) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  // Which of the trader's instruments this headline is likely to move.
  const affected = useMemo(() => affectedInstruments(h, watchlist), [h, watchlist]);
  if (editing) {
    return <NewsForm busy={busy} initial={h} submitLabel="Save" onSubmit={(p) => { onSave(p); setEditing(false); }} onCancel={() => setEditing(false)} />;
  }
  const im = IMPACT[h.impact];
  const bi = BIAS[h.bias];
  const arrow = h.bias === 'bullish' ? '▲' : h.bias === 'bearish' ? '▼' : '●';
  return (
    <div style={{ ...card, padding: '13px 15px', borderLeft: `3px solid ${bi.color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: bi.color, background: `${bi.color}1e`, border: `1px solid ${bi.color}55`, borderRadius: 6, padding: '3px 9px' }}>
          <span style={{ fontSize: 9 }}>{arrow}</span>{bi.label}
        </span>
        <span style={{ ...chip, color: im.color, borderColor: im.color }}>{im.label} impact</span>
        <span style={chip}>{CATEGORY[h.category]}</span>
        {affected.length > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9.5, color: FAINT, letterSpacing: '0.3px' }}>affects</span>
            {affected.slice(0, 5).map((sym) => (
              <span key={sym} style={{ ...chip, color: GOLD, borderColor: 'rgba(235,203,116,.5)', background: 'rgba(235,203,116,.08)' }}>{sym}</span>
            ))}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10.5, color: FAINT, fontFamily: "'IBM Plex Mono', monospace" }}>{fmtRelative(h.publishedAt)}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', lineHeight: 1.4 }}>{h.title}</div>
      {h.tradeNote ? (
        // Claude's desk read — only labelled when it's an actual AI note.
        <div style={{ marginTop: 8, padding: '8px 11px', background: 'rgba(255,255,255,.03)', borderRadius: 8, border: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 9, letterSpacing: '0.5px', textTransform: 'uppercase', color: bi.color, fontWeight: 700, marginBottom: 3 }}>How it could affect us</div>
          <div style={{ fontSize: 12.5, color: '#d4def5', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{h.tradeNote}</div>
        </div>
      ) : h.body ? (
        // Raw source excerpt (no AI read yet) — shown plainly, never mislabeled.
        <div style={{ fontSize: 12.5, color: '#c4d2ee', lineHeight: 1.55, marginTop: 6, whiteSpace: 'pre-wrap' }}>{h.body}</div>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9, flexWrap: 'wrap' }}>
        {h.source && <span style={{ fontSize: 11, color: MUTED }}>{h.source}</span>}
        {h.url && <a href={h.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: GOLD, textDecoration: 'none' }}>Source ↗</a>}
        {canWrite && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button onClick={() => setEditing(true)} style={smallBtn}>Edit</button>
            <button onClick={() => !busy && onRemove()} title="Remove" style={{ ...smallBtn, color: '#ff9a9a', borderColor: 'transparent' }}>×</button>
          </span>
        )}
      </div>
    </div>
  );
}

function CalendarColumn({ events, canWrite, busy, run }: { events: CalendarEvent[]; canWrite: boolean; busy: boolean; run: (p: Promise<MarketNewsData>) => Promise<boolean> }) {
  // Group by ET day.
  const groups: { day: string; items: CalendarEvent[] }[] = [];
  for (const e of events) {
    const day = fmtDayKey(e.eventTime);
    const g = groups.find((x) => x.day === day);
    if (g) g.items.push(e);
    else groups.push({ day, items: [e] });
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {groups.map((g) => (
        <div key={g.day}>
          <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, marginBottom: 6 }}>{g.day}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {g.items.map((e) => (
              <EventRow key={e.id} e={e} canWrite={canWrite} busy={busy}
                onSave={(p) => run(api.updateCalendarEvent(e.id, p))}
                onRemove={() => run(api.removeCalendarEvent(e.id))} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EventRow({ e, canWrite, busy, onSave, onRemove }: { e: CalendarEvent; canWrite: boolean; busy: boolean; onSave: (p: EventInput) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return <EventForm busy={busy} initial={e} submitLabel="Save" onSubmit={(p) => { onSave(p); setEditing(false); }} onCancel={() => setEditing(false)} />;
  }
  const im = IMPACT[e.impact];
  return (
    <div style={{ ...panel, padding: '9px 12px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={{ flex: 'none', width: 6, height: 6, marginTop: 6, borderRadius: '50%', background: im.color }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: TEXT }}>{fmtTime(e.eventTime)}</span>
          {e.country && <span style={{ fontSize: 10, color: MUTED }}>{e.country}</span>}
          <span style={{ fontSize: 12.5, color: '#e7eefb', fontWeight: 500 }}>{e.title}</span>
        </div>
        {(e.forecast || e.previous || e.actual) && (
          <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10.5, color: MUTED }}>
            {e.actual && <span>Act <b style={{ color: TEXT }}>{e.actual}</b></span>}
            {e.forecast && <span>Fcst <b style={{ color: '#cdd9f3' }}>{e.forecast}</b></span>}
            {e.previous && <span>Prev <b style={{ color: '#cdd9f3' }}>{e.previous}</b></span>}
          </div>
        )}
      </div>
      {canWrite && (
        <span style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setEditing(true)} style={{ ...smallBtn, padding: '3px 7px' }}>Edit</button>
          <button onClick={() => !busy && onRemove()} title="Remove" style={{ ...smallBtn, padding: '3px 7px', color: '#ff9a9a', borderColor: 'transparent' }}>×</button>
        </span>
      )}
    </div>
  );
}

function NewsForm({ initial, busy, submitLabel, onSubmit, onCancel }: { initial?: NewsItem; busy: boolean; submitLabel: string; onSubmit: (input: NewsInput) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [source, setSource] = useState(initial?.source ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [category, setCategory] = useState<NewsCategory>(initial?.category ?? 'markets');
  const [impact, setImpact] = useState<NewsImpact>(initial?.impact ?? 'medium');
  const [bias, setBias] = useState<NewsBias>(initial?.bias ?? 'neutral');

  function submit() {
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), body: body.trim() || null, source: source.trim() || null, url: url.trim() || null, category, impact, bias });
  }
  return (
    <div style={{ ...panel, marginBottom: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED, marginBottom: 10 }}>{initial ? 'Edit headline' : 'New headline'}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Headline" style={{ ...input, flex: '1 1 100%' }} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Detail / context (optional)" rows={2} style={{ ...input, flex: '1 1 100%', resize: 'vertical', fontFamily: 'inherit' }} />
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source (e.g. Reuters)" style={{ ...input, flex: '1 1 160px' }} />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link (https://…)" style={{ ...input, flex: '1 1 200px' }} />
        <select value={category} onChange={(e) => setCategory(e.target.value as NewsCategory)} style={{ ...input, flex: '0 0 140px' }}>
          {(Object.keys(CATEGORY) as NewsCategory[]).map((c) => <option key={c} value={c}>{CATEGORY[c]}</option>)}
        </select>
        <select value={impact} onChange={(e) => setImpact(e.target.value as NewsImpact)} style={{ ...input, flex: '0 0 130px' }}>
          <option value="high">High impact</option>
          <option value="medium">Med impact</option>
          <option value="low">Low impact</option>
        </select>
        <select value={bias} onChange={(e) => setBias(e.target.value as NewsBias)} style={{ ...input, flex: '0 0 130px' }}>
          <option value="neutral">Neutral</option>
          <option value="bullish">Bullish</option>
          <option value="bearish">Bearish</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={submit} disabled={busy || !title.trim()} style={{ ...goldBtn, opacity: busy || !title.trim() ? 0.6 : 1 }}>{submitLabel}</button>
        <button onClick={onCancel} style={ghostBtn}>Cancel</button>
      </div>
    </div>
  );
}

function EventForm({ initial, busy, submitLabel, onSubmit, onCancel }: { initial?: CalendarEvent; busy: boolean; submitLabel: string; onSubmit: (input: EventInput) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [country, setCountry] = useState(initial?.country ?? '');
  const [impact, setImpact] = useState<NewsImpact>(initial?.impact ?? 'medium');
  const [when, setWhen] = useState(toLocalInput(initial?.eventTime ?? Date.now()));
  const [forecast, setForecast] = useState(initial?.forecast ?? '');
  const [previous, setPrevious] = useState(initial?.previous ?? '');
  const [actual, setActual] = useState(initial?.actual ?? '');

  function submit() {
    const ms = new Date(when).getTime();
    if (!title.trim() || Number.isNaN(ms)) return;
    onSubmit({ title: title.trim(), country: country.trim() || null, impact, eventTime: ms, forecast: forecast.trim() || null, previous: previous.trim() || null, actual: actual.trim() || null });
  }
  return (
    <div style={{ ...panel, marginBottom: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED, marginBottom: 10 }}>{initial ? 'Edit event' : 'New calendar event'}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event (e.g. CPI m/m)" style={{ ...input, flex: '1 1 220px' }} />
        <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country (e.g. US)" style={{ ...input, flex: '0 0 110px' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: MUTED }}>
          When<input value={when} onChange={(e) => setWhen(e.target.value)} type="datetime-local" style={{ ...input, width: 210 }} />
        </label>
        <select value={impact} onChange={(e) => setImpact(e.target.value as NewsImpact)} style={{ ...input, flex: '0 0 130px' }}>
          <option value="high">High impact</option>
          <option value="medium">Med impact</option>
          <option value="low">Low impact</option>
        </select>
        <input value={forecast} onChange={(e) => setForecast(e.target.value)} placeholder="Forecast" style={{ ...input, flex: '1 1 110px' }} />
        <input value={previous} onChange={(e) => setPrevious(e.target.value)} placeholder="Previous" style={{ ...input, flex: '1 1 110px' }} />
        <input value={actual} onChange={(e) => setActual(e.target.value)} placeholder="Actual" style={{ ...input, flex: '1 1 110px' }} />
      </div>
      <div style={{ fontSize: 10.5, color: FAINT, marginTop: 8 }}>Time is entered in your local zone and shown to everyone in Eastern Time.</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={submit} disabled={busy || !title.trim()} style={{ ...goldBtn, opacity: busy || !title.trim() ? 0.6 : 1 }}>{submitLabel}</button>
        <button onClick={onCancel} style={ghostBtn}>Cancel</button>
      </div>
    </div>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 };
const panel: CSSProperties = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px' };
const input: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 7, color: TEXT, fontSize: 12.5, padding: '9px 11px', outline: 'none' };
const chip: CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: '0.3px', color: MUTED, border: `1px solid ${BORDER2}`, borderRadius: 5, padding: '2px 7px' };
const goldBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', fontWeight: 700, fontSize: 12, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '8px 12px', borderRadius: 7, cursor: 'pointer' };
const smallBtn: CSSProperties = { background: 'none', border: `1px solid ${BORDER2}`, color: MUTED, fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 6, cursor: 'pointer' };
const banner: CSSProperties = { marginBottom: 14, fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', cursor: 'pointer' };
const tabBtn: CSSProperties = { flex: 'none', display: 'inline-flex', alignItems: 'center', fontSize: 12, fontWeight: 600, color: MUTED, background: 'rgba(255,255,255,.04)', border: `1px solid ${BORDER}`, padding: '6px 12px', borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap' };
const tabBtnActive: CSSProperties = { background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', border: '1px solid transparent' };
