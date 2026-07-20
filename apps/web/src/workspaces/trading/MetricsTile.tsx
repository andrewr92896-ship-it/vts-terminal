import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError } from '../../api/client';
import { usePrivacy } from '../../privacy/privacy';
import type { BoardTile, TradeLogData } from '../../api/types';
import { configFrom } from './outcome';
import { profitFactorStats, profitFactorText, scaledProfitFactorText, summarizeTrades, unrealizedProfitFactorStats } from './tradeStats';
import { BORDER, BORDER2, FAINT, GREEN, MONO, MUTED, PANEL, RED } from './tvChart';
import { EditableText } from '../../copy/SiteCopy';
import { Icon } from '../../components/Icon';

const REFRESH_MS = 20_000;

const usd = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
const signedUsd = (n: number) => `${n > 0 ? '+' : ''}${usd(n)}`;

// A compact desk-metrics tile for the Live Wall — the Trade Log's headline
// numbers (realized + open P/L, net, win rate, profit factor, trades) in one
// board cell. Team-scoped like the Trade Log. Polls on its own interval and
// keeps the last snapshot on a failed refresh.
export function MetricsTile({
  tile,
  editing,
  onRemove,
}: {
  tile: BoardTile;
  editing: boolean;
  onRemove: () => void;
}) {
  const { privacy } = usePrivacy();
  const [data, setData] = useState<TradeLogData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // '' = the whole desk; otherwise one trader's ownerId.
  const [trader, setTrader] = useState('');
  const firstLoad = useRef(true);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const d = await api.tradeLog();
      if (!alive.current) return;
      setData(d);
      setError(null);
    } catch (e) {
      if (!alive.current) return;
      if (firstLoad.current) setError(e instanceof ApiError ? e.message : 'Could not load metrics');
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

  // Distinct traders for the picker, plus the chosen scope's trades + summary —
  // whole desk (server summary) or one trader (recomputed the same way).
  const config = data ? configFrom(data) : null;
  const traders = data
    ? [...new Map(data.trades.map((t) => [t.ownerId, t.ownerName || t.owner])).entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const shownTrades = data ? (trader ? data.trades.filter((t) => t.ownerId === trader) : data.trades) : [];
  const s = data && config ? (trader ? summarizeTrades(shownTrades, config) : data.summary) : undefined;
  const canSeeBalances = (s?.totalRealizedPl ?? null) !== null;
  const showMoney = canSeeBalances && !privacy;
  const pf = config ? profitFactorStats(shownTrades, config) : null;
  const upf = unrealizedProfitFactorStats(shownTrades);
  const realized = s?.totalRealizedPl ?? 0;
  const unreal = s?.totalUnrealizedPl ?? 0;
  const net = realized + unreal;

  const money = (n: number) => (!showMoney ? '•••' : signedUsd(n));
  const plColor = (n: number) => (n > 0 ? GREEN : n < 0 ? RED : MUTED);

  return (
    <div style={tileWrap}>
      <div className="tile-header" style={{ ...header, cursor: editing ? 'move' : 'default' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {editing && <span style={{ color: FAINT, fontSize: 13, lineHeight: 1 }}>⠿</span>}
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{tile.title || 'Desk Metrics'}</span>
        </div>
        <div className="no-drag" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {traders.length > 1 && (
            <TraderPicker value={trader} options={traders} onChange={setTrader} />
          )}
          {editing && <button onClick={onRemove} style={iconBtn} title="Remove tile">✕</button>}
        </div>
      </div>
      <div style={body}>
        {!data && !error && <div style={hint}><EditableText id="metrics.loading">Loading metrics…</EditableText></div>}
        {error && !data && <div style={{ ...hint, color: '#ffb4ab' }}>{error}</div>}
        {data && s && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(112px,1fr))', gap: 1, background: BORDER }}>
            <Stat label="Realized P/L" value={s.totalRealizedPl == null ? 'hidden' : money(realized)} color={plColor(realized)} sub="closed" />
            <Stat label="Unrealized P/L" value={!canSeeBalances ? 'hidden' : money(unreal)} color={plColor(unreal)} sub={`${s.open} open`} />
            <Stat label="Net P/L" value={!canSeeBalances ? 'hidden' : money(net)} color={plColor(net)} sub="realized + open" />
            <Stat label="Win Rate" value={s.wins + s.losses > 0 ? `${Math.round(s.winRate * 100)}%` : '—'} sub={`${s.wins}W · ${s.losses}L`} />
            <Stat label="Profit Factor" value={pf ? profitFactorText(pf) : '—'} sub={pf ? `scaled ${scaledProfitFactorText(pf)}` : undefined} />
            <Stat label="Unrealized PF" value={profitFactorText(upf)} sub={`scaled ${scaledProfitFactorText(upf)}`} />
            <Stat label="Trades" value={String(s.total)} sub={`${s.open} open · ${s.closed} closed`} wide />
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, color, wide }: { label: string; value: string; sub?: string; color?: string; wide?: boolean }) {
  return (
    <div style={{ background: 'rgba(9,20,46,1)', padding: '10px 12px', ...(wide ? { gridColumn: '1 / -1' } : null) }}>
      <div style={{ fontSize: 9, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 700, color: color ?? '#fff', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 9.5, color: FAINT, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// A compact, on-theme trader picker for the tile header. Replaces the native
// <select> (whose OS dropdown clashes with the dark theme) with a pill button
// and a portal-rendered menu — the portal escapes the tile's `overflow:hidden`,
// and it closes on outside click or scroll so it never floats detached.
function TraderPicker({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { id: string; name: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const items = [{ id: '', name: 'Whole desk' }, ...options];
  const current = items.find((o) => o.id === value) ?? items[0];

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  function toggle() {
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen((v) => !v);
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="Show metrics for the whole desk or one trader"
        style={pickerBtn}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current.name}</span>
        <Icon name="chevron-down" size={12} color={FAINT} />
      </button>
      {open &&
        rect &&
        createPortal(
          <>
            <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200 }} />
            <div
              style={{
                position: 'fixed',
                top: rect.bottom + 6,
                right: Math.max(8, window.innerWidth - rect.right),
                minWidth: Math.max(rect.width, 168),
                maxWidth: 'min(80vw, 280px)',
                maxHeight: '50vh',
                overflowY: 'auto',
                background: '#0C1C3C',
                border: `1px solid ${BORDER2}`,
                borderRadius: 10,
                boxShadow: '0 16px 40px rgba(0,0,0,.5)',
                padding: 6,
                zIndex: 201,
              }}
            >
              {items.map((o) => {
                const sel = o.id === value;
                return (
                  <button
                    key={o.id || 'desk'}
                    onClick={() => {
                      onChange(o.id);
                      setOpen(false);
                    }}
                    style={menuRow(sel)}
                  >
                    <span style={{ flex: '0 0 16px', display: 'inline-flex' }}>
                      {sel ? <Icon name="check" size={13} color={GREEN} /> : null}
                    </span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </>,
          document.body,
        )}
    </>
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
const pickerBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  maxWidth: 150,
  background: 'rgba(255,255,255,.04)',
  border: `1px solid ${BORDER2}`,
  borderRadius: 999,
  color: '#cfe0ff',
  fontSize: 11,
  fontWeight: 600,
  padding: '5px 10px',
  lineHeight: 1,
  cursor: 'pointer',
};
const menuRow = (sel: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  background: sel ? 'rgba(255,255,255,.06)' : 'transparent',
  border: 'none',
  borderRadius: 7,
  color: sel ? '#fff' : '#cfe0ff',
  fontSize: 13,
  fontWeight: sel ? 700 : 500,
  fontFamily: 'inherit',
  textAlign: 'left',
  padding: '9px 8px',
  cursor: 'pointer',
});
const hint: CSSProperties = { padding: '18px 14px', fontSize: 11.5, color: MUTED, textAlign: 'center', lineHeight: 1.5 };
const iconBtn: CSSProperties = {
  fontSize: 12,
  lineHeight: 1,
  color: '#ffb4ab',
  background: 'rgba(255,255,255,.05)',
  border: `1px solid ${BORDER2}`,
  borderRadius: 6,
  padding: '4px 7px',
  cursor: 'pointer',
};
