import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import type { AlertRecord, BoardTile } from '../../api/types';
import { BORDER, BORDER2, FAINT, GOLD, GREEN, MONO, MUTED, PANEL, RED, TEXT } from './tvChart';
import { ScrollLockButton } from './scrollLock';
import { EditableText } from '../../copy/SiteCopy';

const REFRESH_MS = 30_000;
const ET = 'America/New_York';

function etTime(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    timeZone: ET,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
function fmtPrice(n: number | null): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return String(Number(n.toFixed(5)));
}

// Which alerts a tile shows: every active (non-dismissed) alert, or only the
// unanalyzed "new" ones. Saved with the preset via the tile's alertsFilter.
const FILTER_OPTIONS: { key: NonNullable<BoardTile['alertsFilter']>; label: string }[] = [
  { key: 'active', label: 'All' },
  { key: 'new', label: 'New' },
];

// A live TradingView-alerts feed for the chart board — the same webhook alerts
// as the Alerts screen, in a compact read view that a trader can pin onto the
// Master board next to their charts. Polls on its own interval and keeps the
// last snapshot on a failed refresh. (Screenshot analysis stays on the full
// Alerts screen; the tile is a glanceable feed.)
export function AlertsTile({
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
  const [alerts, setAlerts] = useState<AlertRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const firstLoad = useRef(true);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const d = await api.tradingAlerts();
      if (!alive.current) return;
      setAlerts(d.alerts);
      setError(null);
    } catch (e) {
      if (!alive.current) return;
      if (firstLoad.current) setError(e instanceof ApiError ? e.message : 'Could not load alerts');
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

  const filter = tile.alertsFilter ?? 'active';

  const shown = useMemo(() => {
    if (!alerts) return [];
    return alerts.filter((a) => {
      if (a.status === 'dismissed') return false;
      if (filter === 'new' && a.status !== 'new') return false;
      return true;
    });
  }, [alerts, filter]);

  return (
    <div style={tileWrap}>
      <div className="tile-header" style={{ ...header, cursor: editing ? 'move' : 'default' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {editing && <span style={{ color: FAINT, fontSize: 13, lineHeight: 1 }}>⠿</span>}
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{tile.title || 'Alerts'}</span>
          {alerts && <span style={countChip}>{shown.length}</span>}
        </div>
        <div className="no-drag" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ScrollLockButton />
          {editing ? (
            <>
              <div style={segWrap} title="Which alerts to show">
                {FILTER_OPTIONS.map((o) => (
                  <button key={o.key} onClick={() => onChange({ alertsFilter: o.key })} style={segBtn(filter === o.key)}>{o.label}</button>
                ))}
              </div>
              <button onClick={onRemove} style={{ ...iconBtn, color: '#ffb4ab' }} title="Remove tile">✕</button>
            </>
          ) : (
            <span style={{ fontSize: 10, color: FAINT, whiteSpace: 'nowrap' }}>TradingView</span>
          )}
        </div>
      </div>

      <div style={body}>
        {!alerts && !error && <div style={hint}><EditableText id="alertstile.loading">Loading alerts…</EditableText></div>}
        {error && !alerts && <div style={{ ...hint, color: '#ffb4ab' }}>{error}</div>}
        {alerts && shown.length === 0 && (
          <div style={hint}>No {filter === 'new' ? 'new ' : ''}alerts yet. TradingView webhook alerts appear here automatically.</div>
        )}
        {shown.map((a) => (
          <AlertRow key={a.id} a={a} />
        ))}
      </div>
    </div>
  );
}

function AlertRow({ a }: { a: AlertRecord }) {
  const long = a.side === 'long';
  const sideColor = a.side ? (long ? GREEN : RED) : MUTED;
  const analyzed = a.status === 'analyzed';
  return (
    <div style={{ ...row, borderLeft: `3px solid ${sideColor}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#fff' }}>{a.instrument ?? 'Alert'}</span>
        {a.side && <span style={{ ...badge, color: sideColor, border: `1px solid ${sideColor}` }}>{long ? 'LONG' : 'SHORT'}</span>}
        <span style={{ ...badge, color: analyzed ? GREEN : GOLD, border: `1px solid ${analyzed ? GREEN : GOLD}` }}>
          {analyzed ? 'ANALYZED' : 'NEW'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 9.5, color: FAINT, fontFamily: MONO, whiteSpace: 'nowrap' }}>{etTime(a.receivedAt)}</span>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: MUTED }}>
        {a.price != null && <span>@ <b style={{ color: TEXT, fontFamily: MONO }}>{fmtPrice(a.price)}</b></span>}
        {a.timeframe && <span style={chip}>{a.timeframe}</span>}
        {a.strategy && <span style={{ ...chip, color: GOLD, borderColor: 'rgba(235,203,116,.4)' }}>{a.strategy}</span>}
      </div>
      {a.message && (
        <div style={{ fontSize: 10.5, color: '#8fa3cc', fontStyle: 'italic', marginTop: 4, lineHeight: 1.4 }}>“{a.message}”</div>
      )}
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
const row: CSSProperties = { padding: '9px 11px', borderBottom: `1px solid rgba(22,41,79,.6)` };
const hint: CSSProperties = { padding: '18px 14px', fontSize: 11.5, color: MUTED, textAlign: 'center', lineHeight: 1.5 };
const countChip: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  color: GOLD,
  border: '1px solid rgba(235,203,116,.4)',
  borderRadius: 5,
  padding: '1px 6px',
};
const chip: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 600,
  color: MUTED,
  border: `1px solid ${BORDER2}`,
  borderRadius: 5,
  padding: '2px 7px',
};
const badge: CSSProperties = { fontSize: 8.5, fontWeight: 800, letterSpacing: '0.5px', borderRadius: 4, padding: '1px 5px' };
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
