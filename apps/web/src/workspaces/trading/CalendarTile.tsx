import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useNowTick } from '../../hooks/useNowTick';
import type { BoardTile, CalendarEvent, NewsImpact } from '../../api/types';
import { fmtDayKey, fmtTime } from './newsFormat';
import { BORDER, BORDER2, FAINT, GOLD, MONO, MUTED, PANEL, RED, TEXT } from './tvChart';
import { EditableText } from '../../copy/SiteCopy';

const REFRESH_MS = 120_000;
const AMBER = '#e0a23a';

const IMPACT_COLOR: Record<NewsImpact, string> = { high: RED, medium: AMBER, low: FAINT };
const IMPACT_OPTIONS: { key: NonNullable<BoardTile['minImpact']>; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'medhigh', label: 'Med+' },
  { key: 'high', label: 'High' },
];

// An upcoming economic-calendar feed for the chart board — the same Forex
// Factory events as the Market News calendar, showing what's ahead (plus the
// last few hours' releases so a just-passed print stays visible), grouped by ET
// day and filtered to an impact level chosen per tile. Polls on its own interval
// and keeps the last snapshot on a failed refresh.
export function CalendarTile({
  tile,
  editing,
  onChange,
  onRemove,
}: {
  tile: BoardTile;
  editing: boolean;
  onChange: (patch: Partial<BoardTile>) => void;
  onRemove: () => void;
}) {
  useNowTick();
  const [calendar, setCalendar] = useState<CalendarEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const firstLoad = useRef(true);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const d = await api.marketNews();
      if (!alive.current) return;
      setCalendar(d.calendar);
      setError(null);
    } catch (e) {
      if (!alive.current) return;
      if (firstLoad.current) setError(e instanceof ApiError ? e.message : 'Could not load the calendar');
    } finally {
      firstLoad.current = false;
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      alive.current = false;
      window.clearInterval(id);
    };
  }, [load]);

  const minImpact = tile.minImpact ?? 'medhigh';

  // Upcoming events (keep the last 6h so a just-released print stays visible),
  // impact-filtered, grouped by ET day.
  const groups = useMemo(() => {
    if (!calendar) return [];
    const now = Date.now();
    const upcoming = calendar
      .filter((e) => e.eventTime >= now - 6 * 3600_000)
      .filter((e) => {
        if (minImpact === 'high') return e.impact === 'high';
        if (minImpact === 'medhigh') return e.impact !== 'low';
        return true;
      })
      .sort((a, b) => a.eventTime - b.eventTime);
    const out: { day: string; items: CalendarEvent[] }[] = [];
    for (const e of upcoming) {
      const day = fmtDayKey(e.eventTime);
      const g = out.find((x) => x.day === day);
      if (g) g.items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  }, [calendar, minImpact]);

  const count = groups.reduce((n, g) => n + g.items.length, 0);
  const now = Date.now();

  return (
    <div style={tileWrap}>
      <div className="tile-header" style={{ ...header, cursor: editing ? 'move' : 'default' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {editing && <span style={{ color: FAINT, fontSize: 13, lineHeight: 1 }}>⠿</span>}
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{tile.title || 'Calendar'}</span>
          {calendar && <span style={countChip}>{count}</span>}
        </div>
        <div className="no-drag" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {editing ? (
            <>
              <div style={segWrap} title="Lowest impact to show">
                {IMPACT_OPTIONS.map((o) => (
                  <button key={o.key} onClick={() => onChange({ minImpact: o.key })} style={segBtn(minImpact === o.key)}>{o.label}</button>
                ))}
              </div>
              <button onClick={onRemove} style={{ ...iconBtn, color: '#ffb4ab' }} title="Remove tile">✕</button>
            </>
          ) : (
            <span style={{ fontSize: 10, color: FAINT, whiteSpace: 'nowrap' }}>Upcoming · ET</span>
          )}
        </div>
      </div>

      <div style={body}>
        {!calendar && !error && <div style={hint}><EditableText id="calendartile.loading">Loading calendar…</EditableText></div>}
        {error && !calendar && <div style={{ ...hint, color: '#ffb4ab' }}>{error}</div>}
        {calendar && count === 0 && (
          <div style={hint}>No upcoming events{minImpact !== 'all' ? ' at this impact' : ''}. The Forex Factory feed populates within a few minutes.</div>
        )}
        {groups.map((g) => (
          <div key={g.day}>
            <div style={dayLabel}>{g.day}</div>
            {g.items.map((e) => (
              <EventRow key={e.id} e={e} imminent={e.eventTime >= now && e.eventTime - now <= 3600_000} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function EventRow({ e, imminent }: { e: CalendarEvent; imminent: boolean }) {
  return (
    <div style={row}>
      <span style={{ flex: 'none', width: 6, height: 6, marginTop: 5, borderRadius: '50%', background: IMPACT_COLOR[e.impact] }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: imminent ? GOLD : TEXT, fontWeight: imminent ? 700 : 400 }}>{fmtTime(e.eventTime)}</span>
          {e.country && <span style={{ fontSize: 9.5, color: MUTED }}>{e.country}</span>}
          <span style={{ fontSize: 12, color: '#e7eefb' }}>{e.title}</span>
        </div>
        {(e.forecast || e.previous || e.actual) && (
          <div style={{ display: 'flex', gap: 10, marginTop: 3, fontSize: 10, color: MUTED }}>
            {e.actual && <span>Act <b style={{ color: TEXT }}>{e.actual}</b></span>}
            {e.forecast && <span>Fcst <b style={{ color: '#cdd9f3' }}>{e.forecast}</b></span>}
            {e.previous && <span>Prev <b style={{ color: '#cdd9f3' }}>{e.previous}</b></span>}
          </div>
        )}
      </div>
    </div>
  );
}

const tileWrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  background: 'rgba(9,20,46,1)',
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  overflow: 'hidden',
};
const header: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '7px 10px',
  background: PANEL,
  borderBottom: `1px solid ${BORDER}`,
  flex: '0 0 auto',
};
const body: CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto' };
const dayLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: GOLD,
  padding: '8px 11px 4px',
  position: 'sticky',
  top: 0,
  background: 'rgba(9,20,46,.96)',
  backdropFilter: 'blur(2px)',
};
const row: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  padding: '7px 11px',
  borderBottom: `1px solid rgba(22,41,79,.6)`,
};
const hint: CSSProperties = { padding: '18px 14px', fontSize: 11.5, color: MUTED, textAlign: 'center', lineHeight: 1.5 };
const countChip: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  color: GOLD,
  border: '1px solid rgba(235,203,116,.4)',
  borderRadius: 5,
  padding: '1px 6px',
};
const segWrap: CSSProperties = {
  display: 'inline-flex',
  background: 'rgba(4,12,30,.5)',
  border: `1px solid ${BORDER2}`,
  borderRadius: 6,
  padding: 2,
  gap: 2,
};
function segBtn(active: boolean): CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 700,
    color: active ? '#0c2768' : TEXT,
    background: active ? GOLD : 'transparent',
    border: 'none',
    borderRadius: 4,
    padding: '3px 7px',
    cursor: 'pointer',
  };
}
const iconBtn: CSSProperties = {
  fontSize: 12,
  lineHeight: 1,
  color: '#cfe',
  background: 'rgba(255,255,255,.05)',
  border: `1px solid ${BORDER2}`,
  borderRadius: 6,
  padding: '4px 7px',
  cursor: 'pointer',
};
