import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ApiError } from '../../../api/client';
import { Icon } from '../../../components/Icon';
import { sharedFetch } from './tileFeed';
import { BORDER, BORDER2, FAINT, GOLD, MONO, MUTED, PANEL, TEXT } from '../tvChart';

// The shell every Live Wall tile is built in: the draggable header, the remove
// button, the settings a tile exposes while the board is being edited, and the
// scrolling body beneath.
//
// It exists because the wall went from seven tile kinds to two dozen, and
// each one had been re-implementing the same header markup. One frame means a
// change to how a tile looks is a change in one file, and — more importantly —
// that every tile drags, scrolls and removes identically.

export function TileFrame({
  title,
  icon,
  count,
  editing,
  onRemove,
  controls,
  status,
  footer,
  children,
  bodyStyle,
}: {
  title: string;
  icon?: string;
  /** A figure drawn beside the title (a row count, usually). */
  count?: number | string | null;
  editing: boolean;
  onRemove: () => void;
  /** Per-tile settings, shown only while the board is being edited. */
  controls?: ReactNode;
  /** A short reading shown at the right of the header when not editing. */
  status?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  bodyStyle?: CSSProperties;
}) {
  return (
    <div style={tileWrap}>
      <div className="tile-header" style={{ ...header, cursor: editing ? 'move' : 'default' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          {/* Classed so the board can hide it where the header is not a drag
              handle — a phone, where the tile moves with the cell's arrows. A
              grip that promises a drag which does nothing is worse than none. */}
          {editing && <span className="tile-grip" style={{ color: FAINT, fontSize: 13, lineHeight: 1 }}>⠿</span>}
          {icon && !editing && <Icon name={icon} size={13} color={FAINT} />}
          <span style={titleText}>{title}</span>
          {count !== undefined && count !== null && <span style={countChip}>{count}</span>}
        </div>
        <div className="no-drag" style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
          {editing ? (
            <>
              {controls}
              <button onClick={onRemove} style={{ ...iconBtn, color: '#ffb4ab' }} title="Remove tile">
                ✕
              </button>
            </>
          ) : (
            status
          )}
        </div>
      </div>
      <div style={{ ...body, ...bodyStyle }}>{children}</div>
      {footer && <div style={footerBar}>{footer}</div>}
    </div>
  );
}

// The three things a data tile says before it has data. Kept in one component so
// "loading", "nothing yet" and "that failed" never drift apart in tone.
export function TileMessage({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'error' }) {
  return <div style={{ ...hint, ...(tone === 'error' ? { color: '#ffb4ab' } : null) }}>{children}</div>;
}

// A headline figure with its label — the shape most of the summary tiles open
// with (net worth, portfolio value, win rate, challenge equity).
export function TileStat({
  label,
  value,
  sub,
  color,
  size = 26,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  color?: string;
  size?: number;
}) {
  return (
    <div style={{ padding: '13px 14px 11px' }}>
      <div style={statLabel}>{label}</div>
      <div style={{ fontSize: size, fontWeight: 700, color: color ?? '#fff', fontFamily: MONO, lineHeight: 1.15 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 4, lineHeight: 1.45 }}>{sub}</div>}
    </div>
  );
}

// A label/value pair in a list — the body of most summary tiles.
export function TileRow({
  label,
  value,
  color,
  strong,
}: {
  label: ReactNode;
  value: ReactNode;
  color?: string;
  strong?: boolean;
}) {
  return (
    <div style={rowLine}>
      <span style={{ fontSize: 11.5, color: MUTED, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: strong ? 700 : 600,
          color: color ?? TEXT,
          fontFamily: MONO,
          flex: '0 0 auto',
          marginLeft: 10,
        }}
      >
        {value}
      </span>
    </div>
  );
}

// The small select a tile uses for its own settings while editing.
export function TileSelect({
  value,
  onChange,
  title,
  options,
  width = 130,
}: {
  value: string;
  onChange: (v: string) => void;
  title: string;
  options: { value: string; label: string }[];
  width?: number;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...miniSelect, maxWidth: width }} title={title}>
      {options.map((o) => (
        <option key={o.value} value={o.value} style={{ background: '#091633', color: TEXT }}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// Poll an endpoint for a tile.
//
// Three rules every tile on this wall follows, and the reason this is a hook
// rather than copied into each one:
//
//  - a failed REFRESH keeps the last good data on screen. A tile that blanks
//    because one poll timed out is worse than a tile showing a reading from a
//    minute ago, which is what a wall of them is for.
//  - nothing is written after unmount. Twenty tiles each holding a timer and a
//    pending request will otherwise all resolve into a board that has moved on.
//  - two tiles reading the same endpoint make ONE request (tileFeed.ts). `key`
//    is what identifies "the same endpoint", so it must name the request and
//    everything that varies it — `studies:leaderboard:<deckId>`, not
//    `studies:leaderboard`, or every leaderboard tile would show the first
//    deck's standings.
export function useTileData<T>(
  key: string,
  fetcher: () => Promise<T>,
  refreshMs: number,
  deps: unknown[] = [],
): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const firstLoad = useRef(true);
  // Hold the fetcher in a ref so an inline arrow (which every call site passes)
  // doesn't restart the interval on every render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async () => {
    try {
      // Half the poll interval as the staleness bound: comfortably wide enough
      // to absorb tiles that opened together or drifted into lockstep, and
      // narrow enough that a tile never shows an answer older than it would
      // have fetched for itself.
      const d = await sharedFetch(key, () => fetcherRef.current(), refreshMs / 2);
      if (!alive.current) return;
      setData(d);
      setError(null);
    } catch (e) {
      if (!alive.current) return;
      // Only surface a failure while there is nothing to show. Once the tile has
      // data, a failed refresh leaves it standing.
      if (firstLoad.current) setError(e instanceof ApiError ? e.message : 'Could not load this tile');
    } finally {
      firstLoad.current = false;
    }
  }, [key, refreshMs]);

  useEffect(() => {
    alive.current = true;
    void load();
    // A hidden tab does not poll.
    //
    // A board of twenty tiles left open in a background tab was making twenty
    // requests a cycle, indefinitely, for a screen nobody was looking at — the
    // wall multiplied a cost that was negligible when a board held two tiles.
    // Coming back re-reads immediately, so the reader never sees a stale board;
    // what they no longer pay for is the hours in between.
    const tick = () => {
      if (document.visibilityState === 'hidden') return;
      void load();
    };
    const id = window.setInterval(tick, refreshMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive.current = false;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshMs, ...deps]);

  return { data, error, reload: () => void load() };
}

// ---- money / number formatting shared by the summary tiles ----

export function money(n: number | null | undefined, currency = 'USD'): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2,
  });
}

export function signedMoney(n: number | null | undefined, currency = 'USD'): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n > 0 ? '+' : ''}${money(n, currency)}`;
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

export function plColor(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n === 0) return TEXT;
  return n > 0 ? '#35c47b' : '#ef5468';
}

// Money the reader has asked to hide (privacy mode, or the wall's Hide $).
export const HIDDEN = '••••';

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
const titleText: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: '#fff',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const body: CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto' };
const footerBar: CSSProperties = {
  flex: '0 0 auto',
  padding: '6px 10px',
  borderTop: `1px solid ${BORDER}`,
  background: 'rgba(4,12,30,.4)',
  fontSize: 10,
  color: FAINT,
  lineHeight: 1.45,
};
const hint: CSSProperties = { padding: '18px 14px', fontSize: 11.5, color: MUTED, textAlign: 'center', lineHeight: 1.5 };
const statLabel: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: '.6px',
  textTransform: 'uppercase',
  color: FAINT,
  marginBottom: 5,
};
const rowLine: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '7px 14px',
  borderTop: `1px solid rgba(22,41,79,.55)`,
};
const countChip: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  color: GOLD,
  border: '1px solid rgba(235,203,116,.4)',
  borderRadius: 5,
  padding: '1px 6px',
  flex: '0 0 auto',
};
const miniSelect: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  color: TEXT,
  background: 'rgba(4,12,30,.6)',
  border: `1px solid ${BORDER2}`,
  borderRadius: 6,
  padding: '4px 6px',
  outline: 'none',
  cursor: 'pointer',
};
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
