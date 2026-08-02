import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { usePrivacy } from '../../privacy/privacy';
import { useResponsive } from '../../hooks/useMediaQuery';
import { C, tint } from '../../theme/tokens';
import { ScreenTitle } from './ScreenTitle';
import {
  ISO_DATE_RE,
  clockLabel,
  countdown,
  etClock,
  etDay,
  etGap,
  etMonthDay,
  etTime,
  isoStamp,
  nextMeetingStamp,
  prevMeetingStamp,
  sameEtDay,
  sessionOpen,
} from './etClock';
import type {
  CalendarEvent,
  CustomMetric,
  MarketDataLayout,
  MarketDataPayload,
  MarketFreshness,
  MarketGroupKey,
  MarketSeries,
  NewsImpact,
} from '../../api/types';

// Advanced Trading ▸ Market Data — every rate, print and price the desk watches:
// a customizable strip of pinned tiles, the next Fed decision, the full series
// board, and the Forex Factory release calendar. Deliberately factual: no AI
// read and no recommendation-flavoured copy anywhere on this screen (that was a
// design decision, not an omission — see docs/design/market-data/).
//
// How real the figures are, by region:
//   • the calendar is the live Forex Factory feed (the same rows Market News
//     shows), so those figures are real;
//   • the FX, dollar-index, crypto, commodity and index rows are quoted live
//     from OANDA, changes included (see api trading/marketQuotes.ts);
//   • the policy, inflation, labor, yield, VIX and liquidity rows come live from
//     FRED (see api trading/marketMacro.ts);
//   • what is left carries the design's placeholder figures — the rows no free
//     provider covers (meeting odds, the ISM surveys, the MOVE index and a few
//     more). Those arrive with `sample: true`, show a distinct freshness dot,
//     and are counted in the notice under the header.

const REFRESH_MS = 120_000;
const TICK_MS = 1000;

// Two values the shell tokens don't carry: de-emphasised column labels / unset
// stars, and the hairline between rows inside a table card.
const DIM = '#3A4A6C';
const ROW_LINE = 'rgba(21,33,57,.7)';

const GOLD_TINT = 'linear-gradient(180deg, rgba(235,203,116,.16), rgba(235,203,116,.08))';
const GOLD_BORDER = 'rgba(235,203,116,.35)';

// The freshness dot, and its legend. `sample` is not one of the API's
// `MarketFreshness` values — it is the `sample` flag surfacing through the same
// vocabulary, because "where did this number come from" is the question the dot
// already answers and a placeholder figure is not a live feed.
const FRESHNESS: Record<MarketFreshness, { label: string; color: string }> = {
  live: { label: 'Live feed', color: C.green },
  manual: { label: 'Manual', color: C.amber },
  stale: { label: 'Stale', color: C.faint },
};
const SAMPLE_FRESHNESS = { label: 'Sample', color: DIM };
const LEGEND = [FRESHNESS.live, FRESHNESS.manual, SAMPLE_FRESHNESS, FRESHNESS.stale];

function freshnessOf(m: BoardMetric): { label: string; color: string } {
  return m.sample ? SAMPLE_FRESHNESS : FRESHNESS[m.source];
}

const IMPACT: Record<NewsImpact, { label: string; color: string }> = {
  high: { label: 'High', color: C.red },
  medium: { label: 'Med', color: C.amber },
  low: { label: 'Low', color: C.faint },
};

// A board row / tile: a catalog series, or one the trader typed in. Custom
// metrics are always `manual` and carry their single entered change.
type BoardMetric = MarketSeries & { custom?: true };

function customToMetric(c: CustomMetric): BoardMetric {
  return {
    id: c.id,
    group: c.group,
    label: c.label,
    value: c.value,
    unit: c.unit,
    asOf: c.asOf,
    source: 'manual',
    money: false,
    session: null,
    changes: [c.delta || '—', '—', '—', '—', '—'],
    review: { body: 'Manual entry', last: 'when you update it', next: '' },
    sample: false, // the trader's own figure, not a design placeholder
    custom: true,
  };
}

// "Crypto", "FX & dollar and Crypto", "FX & dollar, Crypto and Sessions".
function listWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// Colour a display change string by its leading character. A signed zero
// ("+0.0%") is not movement, so it reads as neutral rather than green.
function changeColor(v: string): string {
  if (!v || v === '—') return DIM;
  if (v.charAt(0) === '+' && !/^\+0(\.0+)?%?$/.test(v)) return C.green;
  if (v.charAt(0) === '−' || v.charAt(0) === '-') return C.red;
  return C.muted;
}

interface ReviewInfo {
  body: string;
  text: string;
  soon: boolean; // next review 0-7 days out
}

// "BLS · Jul 14 → Aug 12", or a cadence phrase verbatim ("Interbank ·
// continuous"). `next: 'fomc'` resolves to the live next-meeting date.
function reviewInfo(m: BoardMetric, now: number, fomc: number): ReviewInfo {
  const { body, last, next } = m.review;
  if (!ISO_DATE_RE.test(last)) return { body, text: last, soon: false };
  const lastLabel = etMonthDay(isoStamp(last));
  const nextStamp = next === 'fomc' ? fomc : next ? isoStamp(next) : null;
  if (nextStamp === null) return { body, text: `${lastLabel} → tbc`, soon: false };
  const days = Math.ceil((nextStamp - now) / 86400000);
  return {
    body,
    text: `${lastLabel} → ${etMonthDay(nextStamp)}`,
    soon: days >= 0 && days <= 7,
  };
}

export function MarketData() {
  const { user } = useAuth();
  // Read-only for trading view-only roles and the demo: the board can be read
  // and searched, but nothing pins, removes or persists.
  const canWrite = !!user && !user.access.readOnlyWorkspaces.includes('trading');
  const { privacy, toggle: togglePrivacy } = usePrivacy();
  const { isPhone } = useResponsive();

  const [data, setData] = useState<MarketDataPayload | null>(null);
  const [calendar, setCalendar] = useState<CalendarEvent[]>([]);
  const [layout, setLayout] = useState<MarketDataLayout | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [view, setView] = useState<'board' | 'calendar'>('board');
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [q, setQ] = useState('');
  const [groupFilter, setGroupFilter] = useState<'all' | MarketGroupKey>('all');
  const [calCcy, setCalCcy] = useState<'all' | 'USD' | 'EUR'>('all');
  const [calImpact, setCalImpact] = useState<'all' | 'medhigh' | 'high'>('all');
  const [openCal, setOpenCal] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ id: string; label: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  // A 1s tick drives the Fed countdown and the session Open/Closed rows, which
  // must be right to the second rather than as of the last poll.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // Column set is chosen from the *content* width, not the viewport: the sidebar
  // collapses, so a media query would drop columns at the wrong moment.
  const wellRef = useRef<HTMLDivElement | null>(null);
  const [wellWidth, setWellWidth] = useState(1200);
  useEffect(() => {
    const el = wellRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWellWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const undoTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (undoTimer.current) window.clearTimeout(undoTimer.current);
    },
    [],
  );

  const load = useCallback(async () => {
    try {
      const [payload, news] = await Promise.all([api.marketData(), api.marketNews()]);
      setData(payload);
      setCalendar(news.calendar);
      setLoadedAt(Date.now());
      setErr(null);
    } catch (e) {
      // Keep whatever is on screen and say what still works — the portal's
      // convention for a failed refresh over live data.
      setErr(
        e instanceof ApiError
          ? `Couldn't refresh: ${e.message}`
          : "Couldn't refresh the market data.",
      );
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  // The trader's own arrangement. Best-effort: a failure here leaves the board
  // on the catalog default rather than blocking the screen.
  useEffect(() => {
    api
      .marketDataLayout()
      .then((r) => setLayout(r.layout))
      .catch(() => {});
  }, []);

  // Persist on every change, optimistically. A save failure surfaces in the
  // banner but never rolls the UI back mid-drag.
  const commit = useCallback(
    (next: MarketDataLayout) => {
      setLayout(next);
      if (!canWrite) return;
      setBusy(true);
      api
        .saveMarketDataLayout(next)
        .then((r) => setLayout(r.layout))
        .catch((e) =>
          setErr(e instanceof ApiError ? `Couldn't save the board: ${e.message}` : "Couldn't save the board."),
        )
        .finally(() => setBusy(false));
    },
    [canWrite],
  );

  const groups = data?.groups ?? [];
  const meetings = data?.meetings ?? [];
  const meetingYear = data?.meetingYear ?? new Date().getFullYear();

  // Catalog + the trader's own metrics, sessions resolved against the clock.
  const allMetrics: BoardMetric[] = useMemo(() => {
    // A session's value is Open/Closed against the live ET clock rather than
    // anything the payload carried; every other series is passed through.
    const series: BoardMetric[] = (data?.series ?? []).map((m) =>
      m.session ? { ...m, value: sessionOpen(now, m.session) ? 'Open' : 'Closed' } : m,
    );
    return series.concat((layout?.custom ?? []).map(customToMetric));
  }, [data, layout, now]);

  const byId = useMemo(() => new Map(allMetrics.map((m) => [m.id, m])), [allMetrics]);
  const hidden = layout?.hidden ?? [];
  const pinned = layout?.pinned ?? data?.defaultPins ?? [];
  const visible = useMemo(
    () => allMetrics.filter((m) => !hidden.includes(m.id)),
    [allMetrics, hidden],
  );

  const fomc = useMemo(
    () => (meetings.length ? nextMeetingStamp(now, meetings, meetingYear) : 0),
    [now, meetings, meetingYear],
  );

  // ---- board filtering ----
  const needle = q.trim().toLowerCase();
  const boardMetrics = useMemo(
    () =>
      visible.filter((m) => {
        if (groupFilter !== 'all' && m.group !== groupFilter) return false;
        if (!needle) return true;
        const hay = `${m.label} ${m.group} ${m.value} ${m.unit} ${m.asOf}`.toLowerCase();
        return hay.includes(needle);
      }),
    [visible, groupFilter, needle],
  );

  // ---- calendar splitting ----
  const { calUpcoming, calPast } = useMemo(() => {
    const pass = (e: CalendarEvent) => {
      const ccy = (e.country ?? '').toUpperCase();
      if (calCcy !== 'all' && ccy !== calCcy) return false;
      if (calImpact === 'high' && e.impact !== 'high') return false;
      if (calImpact === 'medhigh' && e.impact === 'low') return false;
      return true;
    };
    const rows = calendar.filter(pass);
    const cut = now - 6 * 3600_000;
    return {
      calUpcoming: rows.filter((e) => e.eventTime >= cut).sort((a, b) => a.eventTime - b.eventTime),
      calPast: rows.filter((e) => e.eventTime < cut).sort((a, b) => b.eventTime - a.eventTime),
    };
  }, [calendar, calCcy, calImpact, now]);

  // ---- mutations ----
  function togglePin(id: string) {
    if (!canWrite || !layout) return;
    const next = pinned.includes(id) ? pinned.filter((x) => x !== id) : pinned.concat([id]);
    commit({ ...layout, pinned: next });
  }

  function remove(id: string) {
    if (!canWrite || !layout) return;
    const m = byId.get(id);
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    commit({
      ...layout,
      hidden: layout.hidden.concat([id]),
      pinned: pinned.filter((x) => x !== id),
    });
    setUndo({ id, label: m?.label ?? 'Metric' });
    undoTimer.current = window.setTimeout(() => setUndo(null), 7000);
  }

  function restore(id: string) {
    if (!canWrite || !layout) return;
    commit({ ...layout, hidden: layout.hidden.filter((x) => x !== id) });
    setUndo(null);
  }

  function reorderPins(fromId: string, overId: string) {
    if (!layout || fromId === overId) return;
    const list = [...pinned];
    const from = list.indexOf(fromId);
    const to = list.indexOf(overId);
    if (from < 0 || to < 0) return;
    list.splice(to, 0, list.splice(from, 1)[0]);
    setLayout({ ...layout, pinned: list });
  }

  function addCustom(input: Omit<CustomMetric, 'id'>) {
    if (!canWrite || !layout) return;
    const id = `custom_${Math.random().toString(36).slice(2, 10)}`;
    commit({
      ...layout,
      custom: layout.custom.concat([{ ...input, id }]),
      pinned: pinned.concat([id]),
    });
    setAddOpen(false);
  }

  // Loading and hard-error states render *inside* the measured wrapper (see
  // `shell` below) rather than replacing it: the ResizeObserver has to be
  // attached from the first paint, or the column set stays on its initial guess
  // for the life of the screen.
  const shell = (body: ReactNode) => (
    <div ref={wellRef} style={wellStyle(isPhone)}>
      {body}
    </div>
  );
  if (err && !data) return shell(<div style={{ color: C.red, fontSize: 13 }}>{err}</div>);
  if (!data) return shell(<div style={{ color: C.muted, fontSize: 13 }}>Loading market data…</div>);

  const pinnedMetrics = pinned.flatMap((id) => {
    const m = byId.get(id);
    return m && !hidden.includes(id) ? [m] : [];
  });
  const removedMetrics = hidden.flatMap((id) => {
    const m = byId.get(id);
    return m ? [m] : [];
  });
  const filtersActive = needle !== '' || groupFilter !== 'all';
  // Which groups carry at least one real figure, and how many rows are still
  // placeholders. Drives the notice above.
  const sampleCount = visible.filter((m) => m.sample).length;
  const liveGroups = groups.filter((g) => visible.some((m) => m.group === g.key && !m.sample));
  const liveGroupLabels = liveGroups.map((g) => g.label);
  // Whether the macro provider is demonstrably answering. The notice explains
  // the leftovers as "rows no free provider covers", and that is only true when
  // the providers are actually up — with FRED unreachable the same rows are
  // placeholders for an entirely different reason, and saying otherwise would
  // blame the data instead of the outage.
  const macroLive = liveGroups.some((g) =>
    (['policy', 'inflation', 'labor', 'yields', 'macro'] as MarketGroupKey[]).includes(g.key),
  );

  return (
    <div ref={wellRef} style={wellStyle(isPhone)}>
      {/* ---- header ---- */}
      <div style={headRow}>
        <div style={{ minWidth: 0 }}>
          <ScreenTitle>Market Data</ScreenTitle>
          <div style={subtitle}>
            {
              'Every rate, print and price the desk watches — pinned where you want them, searchable, and on the Forex Factory release schedule. All times Eastern.'
            }
          </div>
        </div>
        <div style={headActions}>
          {/* "Data as of" is the last successful fetch, not the wall clock — the
              label would otherwise state something untrue every second. */}
          <span style={asOf}>
            {loadedAt ? `Data as of ${etClock(loadedAt)} ET` : 'Loading…'}
          </span>
          <button onClick={() => void load()} style={ghostBtn}>
            Refresh
          </button>
          <button
            onClick={togglePrivacy}
            style={{
              ...ghostBtn,
              color: privacy ? C.amber : '#DFE7FA',
              borderColor: privacy ? C.amber : C.line2,
            }}
          >
            {privacy ? 'Privacy on' : 'Privacy'}
          </button>
          {canWrite && (
            <button
              onClick={() => {
                setEditing((v) => !v);
                setAddOpen(false);
              }}
              style={
                editing
                  ? { ...ghostBtn, background: GOLD_TINT, color: C.gold, borderColor: 'rgba(235,203,116,.4)' }
                  : ghostBtn
              }
            >
              {editing ? 'Done' : 'Customize board'}
            </button>
          )}
        </div>
      </div>

      {err && (
        <div onClick={() => setErr(null)} style={banner}>
          {loadedAt
            ? `Showing the last values from ${etClock(loadedAt)} ET. ${err}`
            : err}{' '}
          — click to dismiss.
        </div>
      )}

      {/* What is live and what is not, counted off the payload rather than
          hardcoded, so this stops overstating the moment a provider lands. */}
      {data.sampleValues && (
        <div style={sampleNotice}>
          <b style={{ fontWeight: 700 }}>{macroLive ? 'Mostly live.' : 'Partly live.'}</b>{' '}
          {liveGroupLabels.length > 0 && `${listWords(liveGroupLabels)} read live. `}
          {`The other ${sampleCount} still show the design's placeholder figures — they carry the grey Sample dot.`}{' '}
          {macroLive &&
            'Those are the rows no free data provider covers: meeting odds, the dot plot, the ISM surveys, the MOVE index, blended EPS and the crypto flow rows. '}
          The economic calendar and the Fed countdown are real.
        </div>
      )}

      {/* ---- Fed decision bar ---- */}
      {fomc > 0 && <FedBar now={now} fomc={fomc} meetings={meetings} year={meetingYear} />}

      {/* ---- pinned strip ---- */}
      <div style={stripHead}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', minWidth: 0 }}>
          <span style={sectionLabel}>Pinned data</span>
          <span style={countMono}>{pinnedMetrics.length}</span>
          <span style={hint}>
            {editing ? 'Drag to reorder · ★ unpin · × remove' : 'Always visible, on every view.'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {LEGEND.map((f) => (
              <span key={f.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ ...dot, background: f.color }} />
                <span style={legendLabel}>{f.label}</span>
              </span>
            ))}
          </div>
          {editing && (
            <button onClick={() => setAddOpen((v) => !v)} style={ghostBtn}>
              + Custom metric
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div style={editBanner}>
          Edit mode — drag a pinned tile to reorder, ★ to pin or unpin, × to remove. Every removal
          can be undone.
        </div>
      )}

      {addOpen && editing && (
        <CustomMetricForm groups={groups} busy={busy} onCancel={() => setAddOpen(false)} onAdd={addCustom} />
      )}

      {pinnedMetrics.length === 0 ? (
        <div style={{ ...card, ...emptyCard }}>
          Nothing pinned. Star a series on the board below to keep it up here.
        </div>
      ) : (
        <div style={tileGrid}>
          {pinnedMetrics.map((m) => (
            <Tile
              key={m.id}
              m={m}
              now={now}
              fomc={fomc}
              privacy={privacy}
              editing={editing && canWrite}
              dragging={dragId === m.id}
              onDragStart={() => setDragId(m.id)}
              onDragEnter={() => dragId && reorderPins(dragId, m.id)}
              onDragEnd={() => {
                setDragId(null);
                if (layout) commit(layout);
              }}
              onUnpin={() => togglePin(m.id)}
              onRemove={() => remove(m.id)}
            />
          ))}
        </div>
      )}

      {/* ---- view switcher ---- */}
      <div style={switcherRow}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Pill active={view === 'board'} onClick={() => setView('board')} count={boardMetrics.length}>
            Data board
          </Pill>
          <Pill
            active={view === 'calendar'}
            onClick={() => setView('calendar')}
            count={calUpcoming.length + calPast.length}
          >
            Economic calendar
          </Pill>
        </div>
        <div style={switcherHint}>
          {view === 'board'
            ? 'Search every series, ★ pins it to the strip, × removes it.'
            : 'Actual against forecast, Eastern Time, past releases dimmed below.'}
        </div>
      </div>

      {view === 'board' ? (
        <BoardView
          groups={groups}
          metrics={boardMetrics}
          periods={data.periods}
          pinned={pinned}
          removed={removedMetrics}
          width={wellWidth}
          now={now}
          fomc={fomc}
          privacy={privacy}
          editing={editing && canWrite}
          canWrite={canWrite}
          total={visible.length}
          pinnedCount={pinnedMetrics.length}
          q={q}
          groupFilter={groupFilter}
          filtersActive={filtersActive}
          onQ={setQ}
          onGroup={setGroupFilter}
          onClear={() => {
            setQ('');
            setGroupFilter('all');
          }}
          onTogglePin={togglePin}
          onRemove={remove}
          onRestore={restore}
        />
      ) : (
        <CalendarView
          upcoming={calUpcoming}
          past={calPast}
          now={now}
          ccy={calCcy}
          impact={calImpact}
          openId={openCal}
          onCcy={setCalCcy}
          onImpact={setCalImpact}
          onToggle={(id) => setOpenCal((cur) => (cur === id ? null : id))}
        />
      )}

      <div style={disclaimer}>Market data is informational only — not investment advice.</div>

      {undo && (
        <div style={toast}>
          <span style={{ fontSize: 12.5, color: C.text }}>
            Removed “{undo.label}” from the board.
          </span>
          <button onClick={() => restore(undo.id)} style={undoBtn}>
            Undo
          </button>
          <button onClick={() => setUndo(null)} style={toastX} title="Dismiss">
            ×
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fed decision bar
// ---------------------------------------------------------------------------

function FedBar({
  now,
  fomc,
  meetings,
  year,
}: {
  now: number;
  fomc: number;
  meetings: string[];
  year: number;
}) {
  const presser = fomc + 1800_000;
  // Between the statement and the press conference the countdown re-targets.
  const afterStatement = now >= fomc;
  const target = afterStatement ? presser : fomc;
  const prev = prevMeetingStamp(fomc, meetings, year);
  const dateLine = sameEtDay(fomc, now) ? 'Today' : etDay(fomc);

  // The two nearest meetings' pricing. Sample figures, same as the board.
  const odds = [
    { label: etMonthDay(fomc), cut: 78, note: 'cut fully priced by December' },
    { label: etMonthDay(nextMeetingStamp(fomc + 3600_000, meetings, year)), cut: 54, note: 'second cut a coin flip' },
  ];

  return (
    <div style={fedPanel}>
      <div style={{ flex: '1 1 270px', minWidth: 240 }}>
        <div style={fedEyebrow}>Next Federal Reserve decision</div>
        <div style={fedDate}>{`${dateLine} · ${etTime(fomc)} ET`}</div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
          {`Statement ${etTime(fomc)} · Powell press conference ${etTime(presser)} · ${etMonthDay(fomc)}, ${year}`}
        </div>
      </div>

      <Stat label={afterStatement ? 'Until press conference' : 'Until statement'}>
        <span style={{ ...fedFigure, color: C.gold }}>{countdown(target - now)}</span>
      </Stat>

      <Stat label="Last reviewed">
        <span style={fedFigure}>{etMonthDay(prev)}</span>
        <div style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>held at 4.25–4.50%</div>
      </Stat>

      <Stat label="Target range">
        <span style={fedFigure}>
          4.25–4.50
          <span style={{ fontSize: 11, color: C.faint, marginLeft: 3 }}>%</span>
        </span>
      </Stat>

      <div style={oddsGrid}>
        {odds.map((o) => (
          <div key={o.label}>
            <div style={statLabel}>{o.label}</div>
            <div style={{ fontSize: 10.5, color: C.muted, fontFamily: C.mono, margin: '3px 0 4px' }}>
              {`cut ${o.cut}% · hold ${100 - o.cut}%`}
            </div>
            <div style={oddsTrack}>
              <div style={{ width: `${o.cut}%`, background: C.green }} />
              <div style={{ width: `${100 - o.cut}%`, background: C.hover }} />
            </div>
            <div style={{ fontSize: 10.5, color: C.faint, marginTop: 4 }}>{o.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ flex: 'none' }}>
      <div style={statLabel}>{label}</div>
      <div style={{ marginTop: 3 }}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pinned tile
// ---------------------------------------------------------------------------

function Tile({
  m,
  now,
  fomc,
  privacy,
  editing,
  dragging,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onUnpin,
  onRemove,
}: {
  m: BoardMetric;
  now: number;
  fomc: number;
  privacy: boolean;
  editing: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onUnpin: () => void;
  onRemove: () => void;
}) {
  const fresh = freshnessOf(m);
  const rev = reviewInfo(m, now, fomc);
  const masked = m.money && privacy;
  const open = m.session ? sessionOpen(now, m.session) : false;
  const context = m.session
    ? open
      ? `closes ${clockLabel(m.session[1])}`
      : `opens ${clockLabel(m.session[0])}`
    : m.asOf;

  return (
    <div
      draggable={editing}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={onDragEnd}
      style={{ ...card, ...tileBox, opacity: dragging ? 0.45 : 1, cursor: editing ? 'grab' : 'default' }}
    >
      <div style={{ ...tileLabelRow, paddingRight: editing ? 54 : 0 }}>
        <span style={{ ...dot, marginTop: 3, background: fresh.color }} />
        <span style={tileLabel}>{m.label}</span>
      </div>

      <div style={{ ...tileFigure, color: m.session ? (open ? C.green : C.text) : C.text }}>
        {masked ? '•••••' : m.value}
        {m.unit && !masked && <span style={tileUnit}>{m.unit}</span>}
      </div>

      <div style={tileContext}>{context}</div>

      <div style={changeGrid}>
        {m.changes.map((v, i) => (
          <div key={i} style={{ minWidth: 0 }}>
            <div style={periodLabel}>{['1D', '1W', '1M', 'YTD', '1Y'][i]}</div>
            <div
              style={{
                ...changeValue,
                color: masked ? C.muted : changeColor(v),
              }}
            >
              {masked ? '•••' : v}
            </div>
          </div>
        ))}
      </div>

      <div style={tileFooter}>
        <span style={reviewBody}>{rev.body}</span>
        <span style={{ ...reviewCycle, color: rev.soon ? C.gold : C.faint }}>{rev.text}</span>
      </div>

      {editing && (
        <div style={tileControls}>
          <span style={{ fontSize: 11, color: C.faint, cursor: 'grab' }} title="Drag to reorder">
            ⠿
          </span>
          <button onClick={onUnpin} style={iconBtn(11, C.gold)} title="Unpin">
            ★
          </button>
          <button onClick={onRemove} style={iconBtn(14, C.faint)} title="Remove">
            ×
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data board
// ---------------------------------------------------------------------------

// Column set by content width. The five change columns never drop — they are the
// point of the board; the review columns go first because the tiles still carry
// that information.
interface BoardCols {
  template: string;
  showBody: boolean;
  showCycle: boolean;
  // The narrowest the row may get before the card scrolls sideways instead of
  // squeezing. Without it the fixed columns are simply clipped by the card's
  // overflow: hidden, which silently eats the 1Y column on a phone.
  minWidth: number;
}

function boardColumns(width: number): BoardCols {
  if (width >= 1060) {
    return {
      template: 'minmax(0,1fr) 96px repeat(5, 58px) 116px 136px 22px',
      showBody: true,
      showCycle: true,
      minWidth: 980,
    };
  }
  if (width >= 860) {
    return {
      template: 'minmax(0,1fr) 96px repeat(5, 58px) 136px 22px',
      showBody: false,
      showCycle: true,
      minWidth: 840,
    };
  }
  return {
    template: 'minmax(0,1fr) 90px repeat(5, 54px) 22px',
    showBody: false,
    showCycle: false,
    minWidth: 580,
  };
}

function BoardView({
  groups,
  metrics,
  periods,
  pinned,
  removed,
  width,
  now,
  fomc,
  privacy,
  editing,
  canWrite,
  total,
  pinnedCount,
  q,
  groupFilter,
  filtersActive,
  onQ,
  onGroup,
  onClear,
  onTogglePin,
  onRemove,
  onRestore,
}: {
  groups: { key: MarketGroupKey; label: string }[];
  metrics: BoardMetric[];
  periods: string[];
  pinned: string[];
  removed: BoardMetric[];
  width: number;
  now: number;
  fomc: number;
  privacy: boolean;
  editing: boolean;
  canWrite: boolean;
  total: number;
  pinnedCount: number;
  q: string;
  groupFilter: 'all' | MarketGroupKey;
  filtersActive: boolean;
  onQ: (v: string) => void;
  onGroup: (v: 'all' | MarketGroupKey) => void;
  onClear: () => void;
  onTogglePin: (id: string) => void;
  onRemove: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  const cols = boardColumns(width);
  const sections = groups
    .map((g) => ({ ...g, rows: metrics.filter((m) => m.group === g.key) }))
    .filter((g) => g.rows.length > 0);

  return (
    <>
      <div style={toolbar}>
        <label style={field}>
          <span style={fieldLabel}>Find data</span>
          <input
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder="rate, CPI, yield, gold…"
            style={{ ...input, width: 232 }}
          />
        </label>
        <label style={field}>
          <span style={fieldLabel}>Group</span>
          <select
            value={groupFilter}
            onChange={(e) => onGroup(e.target.value as 'all' | MarketGroupKey)}
            style={{ ...input, ...selectChrome, minWidth: 172 }}
          >
            <option value="all">All groups</option>
            {groups.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        {filtersActive && (
          <button onClick={onClear} style={{ ...ghostBtn, marginBottom: 1 }}>
            Clear
          </button>
        )}
        <span style={{ ...countLine, marginLeft: 'auto' }}>
          {`${metrics.length} of ${total} series · ${pinnedCount} pinned`}
        </span>
      </div>

      {sections.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: 30, fontSize: 12.5, color: C.muted }}>
          Nothing matches that. Clear the filters, or add it yourself with{' '}
          <span style={{ color: C.gold }}>Customize board → + Custom metric</span>.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sections.map((g) => (
            <div key={g.key} style={{ ...card, padding: 0, overflow: 'hidden' }}>
             <div style={{ overflowX: 'auto' }}>
              <div style={{ ...tableHead, gridTemplateColumns: cols.template, minWidth: cols.minWidth }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                  <span style={sectionLabel}>{g.label}</span>
                  <span style={countMono}>{g.rows.length}</span>
                </span>
                <span style={{ ...colLabel, textAlign: 'right' }}>Value</span>
                {periods.map((p) => (
                  <span key={p} style={{ ...periodColLabel, textAlign: 'right' }}>
                    {p}
                  </span>
                ))}
                {cols.showBody && <span style={colLabel}>Reviewed by</span>}
                {cols.showCycle && <span style={colLabel}>Last → next review</span>}
                <span />
              </div>
              {g.rows.map((m) => (
                <Row
                  key={m.id}
                  m={m}
                  cols={cols}
                  now={now}
                  fomc={fomc}
                  privacy={privacy}
                  editing={editing}
                  canWrite={canWrite}
                  pinned={pinned.includes(m.id)}
                  onTogglePin={() => onTogglePin(m.id)}
                  onRemove={() => onRemove(m.id)}
                />
              ))}
             </div>
            </div>
          ))}
        </div>
      )}

      {editing && removed.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 9 }}>
            <span style={sectionLabel}>Removed</span>
            <span style={countMono}>{removed.length}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {removed.map((m) => (
              <span key={m.id} style={removedChip}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: C.muted }}>
                  {m.label}
                </span>
                <button onClick={() => onRestore(m.id)} style={iconBtn(11, C.gold)}>
                  + restore
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function Row({
  m,
  cols,
  now,
  fomc,
  privacy,
  editing,
  canWrite,
  pinned,
  onTogglePin,
  onRemove,
}: {
  m: BoardMetric;
  cols: BoardCols;
  now: number;
  fomc: number;
  privacy: boolean;
  editing: boolean;
  canWrite: boolean;
  pinned: boolean;
  onTogglePin: () => void;
  onRemove: () => void;
}) {
  const fresh = freshnessOf(m);
  const rev = reviewInfo(m, now, fomc);
  const masked = m.money && privacy;
  const open = m.session ? sessionOpen(now, m.session) : false;

  return (
    <div style={{ ...tableRow, gridTemplateColumns: cols.template, minWidth: cols.minWidth }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ ...dot, background: fresh.color }} />
        <span style={rowName}>{m.label}</span>
      </span>
      <span style={{ ...rowValue, color: m.session ? (open ? C.green : C.text) : C.text }}>
        {masked ? '•••••' : m.value}
        {m.unit && !masked && <span style={rowUnit}>{m.unit}</span>}
      </span>
      {m.changes.map((v, i) => (
        <span key={i} style={{ ...rowChange, color: masked ? C.muted : changeColor(v) }}>
          {masked ? '•••' : v}
        </span>
      ))}
      {cols.showBody && <span style={rowBody}>{rev.body}</span>}
      {cols.showCycle && (
        <span style={{ ...rowCycle, color: rev.soon ? C.gold : C.faint }}>{rev.text}</span>
      )}
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
        {canWrite && (
          <button
            onClick={onTogglePin}
            style={iconBtn(11, pinned ? C.gold : DIM)}
            title={pinned ? 'Unpin' : 'Pin to the strip'}
          >
            ★
          </button>
        )}
        {editing && (
          <button onClick={onRemove} style={iconBtn(14, C.faint)} title="Remove">
            ×
          </button>
        )}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Economic calendar
// ---------------------------------------------------------------------------

const CAL_COLUMNS = '78px 34px 12px minmax(0,1fr) 80px 80px 80px';
// Fixed columns + gaps + a readable minimum for the event name; below this the
// card scrolls sideways rather than clipping the Previous column.
const CAL_MIN_WIDTH = 660;

function CalendarView({
  upcoming,
  past,
  now,
  ccy,
  impact,
  openId,
  onCcy,
  onImpact,
  onToggle,
}: {
  upcoming: CalendarEvent[];
  past: CalendarEvent[];
  now: number;
  ccy: 'all' | 'USD' | 'EUR';
  impact: 'all' | 'medhigh' | 'high';
  openId: string | null;
  onCcy: (v: 'all' | 'USD' | 'EUR') => void;
  onImpact: (v: 'all' | 'medhigh' | 'high') => void;
  onToggle: (id: string) => void;
}) {
  const groupByDay = (rows: CalendarEvent[]) => {
    const out: { day: string; items: CalendarEvent[] }[] = [];
    for (const e of rows) {
      const day = etDay(e.eventTime);
      const g = out.find((x) => x.day === day);
      if (g) g.items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  };

  return (
    <>
      <div style={toolbar}>
        <label style={field}>
          <span style={fieldLabel}>Currency</span>
          <select
            value={ccy}
            onChange={(e) => onCcy(e.target.value as 'all' | 'USD' | 'EUR')}
            style={{ ...input, ...selectChrome, minWidth: 150 }}
          >
            <option value="all">All</option>
            <option value="USD">USD only</option>
            <option value="EUR">EUR only</option>
          </select>
        </label>
        <label style={field}>
          <span style={fieldLabel}>Impact</span>
          <select
            value={impact}
            onChange={(e) => onImpact(e.target.value as 'all' | 'medhigh' | 'high')}
            style={{ ...input, ...selectChrome, minWidth: 150 }}
          >
            <option value="all">All</option>
            <option value="medhigh">Medium & up</option>
            <option value="high">High only</option>
          </select>
        </label>
        <span style={{ ...countLine, marginLeft: 'auto' }}>
          {`${upcoming.length} upcoming · ${past.length} released`}
        </span>
      </div>

      {upcoming.length + past.length === 0 ? (
        <div style={{ ...card, ...emptyCard }}>
          No releases in range — the Forex Factory feed populates within a few minutes.
        </div>
      ) : (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
         <div style={{ overflowX: 'auto' }}>
          <div style={{ ...calHead, gridTemplateColumns: CAL_COLUMNS, minWidth: CAL_MIN_WIDTH }}>
            <span style={colLabel}>Time ET</span>
            <span style={colLabel}>Ccy</span>
            <span />
            <span style={colLabel}>Event</span>
            <span style={{ ...colLabel, textAlign: 'right' }}>Actual</span>
            <span style={{ ...colLabel, textAlign: 'right' }}>Forecast</span>
            <span style={{ ...colLabel, textAlign: 'right' }}>Previous</span>
          </div>

          {groupByDay(upcoming).map((g) => (
            <DayGroup key={`u-${g.day}`} day={g.day} items={g.items} now={now} openId={openId} onToggle={onToggle} />
          ))}
          {groupByDay(past).map((g) => (
            <DayGroup
              key={`p-${g.day}`}
              day={g.day}
              items={g.items}
              now={now}
              openId={openId}
              onToggle={onToggle}
              past
            />
          ))}
         </div>
        </div>
      )}
    </>
  );
}

function DayGroup({
  day,
  items,
  now,
  openId,
  onToggle,
  past,
}: {
  day: string;
  items: CalendarEvent[];
  now: number;
  openId: string | null;
  onToggle: (id: string) => void;
  past?: boolean;
}) {
  return (
    <div style={past ? { opacity: 0.62 } : undefined}>
      <div style={{ ...dayHead, minWidth: CAL_MIN_WIDTH }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: past ? C.muted : C.gold }}>{day}</span>
        {past && <span style={dayTag}>released</span>}
      </div>
      {items.map((e) => (
        <EventRow key={e.id} e={e} now={now} open={openId === e.id} onToggle={() => onToggle(e.id)} />
      ))}
    </div>
  );
}

function EventRow({
  e,
  now,
  open,
  onToggle,
}: {
  e: CalendarEvent;
  now: number;
  open: boolean;
  onToggle: () => void;
}) {
  const im = IMPACT[e.impact];
  const ahead = e.eventTime - now;
  const soon = ahead > 0 && ahead < 4 * 3600_000;
  const clickable = !!e.explainer;

  return (
    <div
      onClick={clickable ? onToggle : undefined}
      style={{
        ...calRow,
        gridTemplateColumns: CAL_COLUMNS,
        minWidth: CAL_MIN_WIDTH,
        cursor: clickable ? 'pointer' : 'default',
      }}
    >
      <span>
        <span style={{ fontFamily: C.mono, fontSize: 11.5, color: C.text }}>{etTime(e.eventTime)}</span>
        {ahead > 0 && (
          <div style={{ fontFamily: C.mono, fontSize: 9.5, color: soon ? C.gold : C.faint, marginTop: 2 }}>
            {etGap(ahead)}
          </div>
        )}
      </span>
      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted }}>{e.country ?? '—'}</span>
      <span style={{ ...dot, marginTop: 5, background: im.color }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ fontSize: 12.5, color: C.text }}>{e.title}</span>
        {clickable && (
          <span style={{ fontSize: 10, color: C.faint, marginLeft: 7 }}>
            {open ? 'ⓘ hide' : 'ⓘ what this is'}
          </span>
        )}
        {open && e.explainer && (
          <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, maxWidth: 660, marginTop: 5 }}>
            {e.explainer}
          </div>
        )}
      </span>
      <span style={{ ...calFig, color: e.actual ? C.text : DIM, fontWeight: e.actual ? 600 : 400 }}>
        {e.actual ?? '—'}
      </span>
      <span style={{ ...calFig, color: C.muted }}>{e.forecast ?? '—'}</span>
      <span style={{ ...calFig, color: C.faint }}>{e.previous ?? '—'}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom metric form
// ---------------------------------------------------------------------------

function CustomMetricForm({
  groups,
  busy,
  onCancel,
  onAdd,
}: {
  groups: { key: MarketGroupKey; label: string }[];
  busy: boolean;
  onCancel: () => void;
  onAdd: (input: Omit<CustomMetric, 'id'>) => void;
}) {
  const [label, setLabel] = useState('');
  const [group, setGroup] = useState<MarketGroupKey>(groups[0]?.key ?? 'policy');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const [delta, setDelta] = useState('');
  const [asOf, setAsOf] = useState('entered by you');

  const ready = label.trim() !== '' && value.trim() !== '';

  return (
    <div style={formPanel}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={sectionLabel}>New custom metric</span>
        <span style={{ ...hint, marginLeft: 'auto' }}>
          Anything the feeds don&rsquo;t carry — your own numbers, marked as manual.
        </span>
      </div>
      <div style={formGrid}>
        <label style={field}>
          <span style={fieldLabel}>Label</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. 5s30s spread" style={input} />
        </label>
        <label style={field}>
          <span style={fieldLabel}>Group</span>
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value as MarketGroupKey)}
            style={{ ...input, ...selectChrome }}
          >
            {groups.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label style={field}>
          <span style={fieldLabel}>Value</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 68" style={input} />
        </label>
        <label style={field}>
          <span style={fieldLabel}>Unit</span>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="% · bps · K" style={input} />
        </label>
        <label style={field}>
          <span style={fieldLabel}>Change</span>
          <input value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="▲ 2" style={input} />
        </label>
        <label style={field}>
          <span style={fieldLabel}>As of</span>
          <input value={asOf} onChange={(e) => setAsOf(e.target.value)} style={input} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={() => ready && onAdd({ label: label.trim(), group, value: value.trim(), unit: unit.trim(), delta: delta.trim(), asOf: asOf.trim() || 'entered by you' })}
          disabled={!ready || busy}
          style={{ ...addBtn, opacity: !ready || busy ? 0.6 : 1 }}
        >
          Add tile
        </button>
        <button onClick={onCancel} style={ghostBtn}>
          Cancel
        </button>
        <span style={hint}>It pins straight to the strip and can be removed like any other tile.</span>
      </div>
    </div>
  );
}

function Pill({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 12.5,
        padding: '7px 13px',
        borderRadius: 8,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        fontFamily: 'inherit',
        background: active ? GOLD_TINT : 'rgba(255,255,255,.02)',
        border: `1px solid ${active ? GOLD_BORDER : C.line2}`,
        color: active ? C.gold : C.muted,
        fontWeight: active ? 600 : 500,
      }}
    >
      {children}
      <span style={{ fontFamily: C.mono, fontSize: 11 }}>{count}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Styles — transcribed from docs/design/market-data/README.md
// ---------------------------------------------------------------------------

// The shell's scroller carries no padding: other Trading screens make their
// gutter with maxWidth + auto margins, but this board is meant to use the full
// content width, so it pads itself instead.
function wellStyle(isPhone: boolean): CSSProperties {
  return {
    color: C.text,
    animation: 'fadeIn .25s ease',
    padding: isPhone ? '14px' : '22px 32px 8px',
  };
}

const card: CSSProperties = {
  background: C.panel,
  border: `1px solid ${C.line}`,
  borderRadius: 12,
  padding: '14px 15px',
};
const emptyCard: CSSProperties = { textAlign: 'center', padding: 30, fontSize: 12.5, color: C.muted };

const headRow: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 14,
  flexWrap: 'wrap',
  marginBottom: 0,
};
const subtitle: CSSProperties = { fontSize: 12.5, color: C.muted, margin: '6px 0 0', maxWidth: 720 };
const headActions: CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  alignItems: 'center',
  marginLeft: 'auto',
};
const asOf: CSSProperties = { fontSize: 11, fontFamily: C.mono, color: C.faint, whiteSpace: 'nowrap' };

const ghostBtn: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: '#DFE7FA',
  background: 'rgba(255,255,255,.05)',
  border: `1px solid ${C.line2}`,
  padding: '8px 12px',
  borderRadius: 7,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontFamily: 'inherit',
};
const addBtn: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: C.text,
  background: 'rgba(235,203,116,.14)',
  border: '1px solid rgba(235,203,116,.4)',
  borderRadius: 7,
  padding: '8px 14px',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const banner: CSSProperties = {
  marginTop: 14,
  fontSize: 12.5,
  color: '#ffb4ab',
  background: 'rgba(240,89,110,.1)',
  border: '1px solid rgba(240,89,110,.4)',
  borderRadius: 8,
  padding: '9px 12px',
  cursor: 'pointer',
};
const sampleNotice: CSSProperties = {
  marginTop: 14,
  fontSize: 12,
  lineHeight: 1.55,
  color: '#F3E3B8',
  background: tint(C.amber, 0.08),
  border: `1px solid ${tint(C.amber, 0.35)}`,
  borderRadius: 8,
  padding: '9px 12px',
};
const editBanner: CSSProperties = {
  fontSize: 12.5,
  color: '#F3E3B8',
  background: 'rgba(235,203,116,.08)',
  border: `1px solid ${GOLD_BORDER}`,
  borderRadius: 8,
  padding: '9px 12px',
  marginBottom: 12,
};

const fedPanel: CSSProperties = {
  background: C.panel2,
  border: '1px solid rgba(235,203,116,.35)',
  borderRadius: 10,
  padding: '14px 16px',
  display: 'flex',
  alignItems: 'flex-start',
  gap: 26,
  flexWrap: 'wrap',
  marginTop: 16,
};
const fedEyebrow: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '.8px',
  textTransform: 'uppercase',
  color: C.gold,
};
const fedDate: CSSProperties = {
  fontSize: 19,
  fontWeight: 600,
  fontFamily: C.mono,
  color: '#fff',
  letterSpacing: '-0.4px',
  marginTop: 4,
};
const fedFigure: CSSProperties = {
  fontSize: 25,
  fontWeight: 600,
  fontFamily: C.mono,
  color: C.text,
  letterSpacing: '-0.5px',
};
const statLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '.8px',
  textTransform: 'uppercase',
  color: C.faint,
};
const oddsGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(172px, 1fr))',
  gap: 18,
  flex: '1 1 360px',
};
const oddsTrack: CSSProperties = {
  display: 'flex',
  height: 5,
  borderRadius: 3,
  overflow: 'hidden',
  background: 'rgba(255,255,255,.05)',
};

const stripHead: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0,1fr) auto',
  gap: 14,
  alignItems: 'center',
  margin: '18px 0 9px',
};
const sectionLabel: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: '1.4px',
  textTransform: 'uppercase',
  color: C.faint,
};
const countMono: CSSProperties = { fontSize: 11, fontFamily: C.mono, color: C.faint };
const hint: CSSProperties = { fontSize: 10.5, color: C.faint };
const legendLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '.4px',
  textTransform: 'uppercase',
  color: C.faint,
};
const dot: CSSProperties = { flex: 'none', width: 6, height: 6, borderRadius: '50%' };

const tileGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(224px, 1fr))',
  gap: 12,
};
const tileBox: CSSProperties = { position: 'relative' };
const tileLabelRow: CSSProperties = { display: 'flex', gap: 6, height: 24, overflow: 'hidden' };
const tileLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '.8px',
  textTransform: 'uppercase',
  color: C.faint,
  lineHeight: '10px',
};
const tileFigure: CSSProperties = {
  fontSize: 25,
  fontWeight: 600,
  fontFamily: C.mono,
  letterSpacing: '-0.5px',
  marginTop: 6,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const tileUnit: CSSProperties = { fontSize: 11, fontWeight: 400, color: C.faint, marginLeft: 3 };
const tileContext: CSSProperties = {
  fontSize: 10.5,
  color: C.faint,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const changeGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(5, minmax(0,1fr))',
  gap: 2,
  marginTop: 9,
};
const periodLabel: CSSProperties = {
  fontSize: 8,
  fontWeight: 700,
  letterSpacing: '.5px',
  color: DIM,
};
const changeValue: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 600,
  fontFamily: C.mono,
  marginTop: 2,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const tileFooter: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  marginTop: 9,
  paddingTop: 8,
  borderTop: `1px solid ${C.line}`,
};
const reviewBody: CSSProperties = {
  fontSize: 10,
  color: C.muted,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const reviewCycle: CSSProperties = {
  fontSize: 10,
  fontFamily: C.mono,
  marginLeft: 'auto',
  whiteSpace: 'nowrap',
};
const tileControls: CSSProperties = {
  position: 'absolute',
  top: 8,
  right: 9,
  display: 'flex',
  gap: 4,
  alignItems: 'center',
};

function iconBtn(size: number, color: string): CSSProperties {
  return {
    background: 'none',
    border: 'none',
    padding: 0,
    fontSize: size,
    lineHeight: 1,
    color,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
}

const switcherRow: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: 14,
  flexWrap: 'wrap',
  borderBottom: `1px solid ${C.line}`,
  margin: '22px 0 14px',
  paddingBottom: 10,
};
const switcherHint: CSSProperties = {
  fontSize: 11,
  color: C.faint,
  textAlign: 'right',
  maxWidth: 440,
  marginLeft: 'auto',
};

const toolbar: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 10,
  flexWrap: 'wrap',
  marginBottom: 14,
};
const field: CSSProperties = { display: 'flex', flexDirection: 'column', minWidth: 0 };
const fieldLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '.8px',
  textTransform: 'uppercase',
  color: C.faint,
  marginBottom: 6,
};
const input: CSSProperties = {
  background: 'rgba(255,255,255,.03)',
  border: `1px solid ${C.line2}`,
  borderRadius: 7,
  fontSize: 12.5,
  padding: '9px 11px',
  color: C.text,
  outline: 'none',
  fontFamily: 'inherit',
};
const selectChrome: CSSProperties = {
  cursor: 'pointer',
  appearance: 'none',
  padding: '9px 30px 9px 11px',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%2393A5C9' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 11px center',
};
const countLine: CSSProperties = { fontSize: 10.5, color: C.faint, whiteSpace: 'nowrap' };

const tableHead: CSSProperties = {
  display: 'grid',
  gap: 10,
  alignItems: 'center',
  padding: '11px 16px',
  background: C.panel2,
  borderBottom: `1px solid ${C.line}`,
};
const colLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '.4px',
  textTransform: 'uppercase',
  color: DIM,
};
const periodColLabel: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  fontFamily: C.mono,
  letterSpacing: '.4px',
  color: DIM,
};
const tableRow: CSSProperties = {
  display: 'grid',
  gap: 10,
  alignItems: 'center',
  padding: '8px 16px',
  borderTop: `1px solid ${ROW_LINE}`,
};
const rowName: CSSProperties = {
  fontSize: 12.5,
  color: C.text,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const rowValue: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  fontFamily: C.mono,
  textAlign: 'right',
  whiteSpace: 'nowrap',
};
const rowUnit: CSSProperties = { fontSize: 10, fontWeight: 400, color: C.faint, marginLeft: 3 };
const rowChange: CSSProperties = {
  fontSize: 11,
  fontFamily: C.mono,
  textAlign: 'right',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const rowBody: CSSProperties = {
  fontSize: 11.5,
  color: C.muted,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const rowCycle: CSSProperties = { fontSize: 11, fontFamily: C.mono, whiteSpace: 'nowrap' };

const removedChip: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 9,
  border: `1px dashed ${C.line2}`,
  borderRadius: 8,
  padding: '8px 11px',
};

const calHead: CSSProperties = {
  display: 'grid',
  gap: 12,
  alignItems: 'center',
  padding: '10px 16px',
  background: C.panel2,
};
const dayHead: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 9,
  padding: '9px 16px',
  borderTop: `1px solid ${C.line}`,
  background: 'rgba(255,255,255,.014)',
};
const dayTag: CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '.4px',
  color: C.faint,
};
const calRow: CSSProperties = {
  display: 'grid',
  gap: 12,
  alignItems: 'start',
  padding: '8px 16px',
  borderTop: `1px solid ${ROW_LINE}`,
};
const calFig: CSSProperties = { fontSize: 11.5, fontFamily: C.mono, textAlign: 'right' };

const formPanel: CSSProperties = {
  background: C.panel2,
  border: `1px solid ${C.line}`,
  borderRadius: 10,
  padding: '14px 16px',
  marginBottom: 12,
};
const formGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(152px, 1fr))',
  gap: 10,
  alignItems: 'start',
};

const disclaimer: CSSProperties = {
  fontSize: 10.5,
  color: C.faint,
  letterSpacing: '.3px',
  marginTop: 16,
};

const toast: CSSProperties = {
  position: 'fixed',
  bottom: 24,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 55,
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  background: C.panel2,
  border: `1px solid ${C.line2}`,
  borderRadius: 10,
  padding: '10px 12px 10px 16px',
  boxShadow: '0 16px 40px rgba(0,0,0,.5)',
};
const undoBtn: CSSProperties = {
  border: `1px solid ${C.line2}`,
  background: 'rgba(255,255,255,.05)',
  fontSize: 12.5,
  fontWeight: 600,
  color: C.text,
  padding: '7px 14px',
  borderRadius: 7,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const toastX: CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: 18,
  color: C.faint,
  cursor: 'pointer',
  lineHeight: 1,
  fontFamily: 'inherit',
};
