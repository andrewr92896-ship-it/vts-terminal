import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { usePrivacy } from '../../privacy/privacy';
import type { BoardTile, TradeLogData } from '../../api/types';
import { configFrom } from './outcome';
import { profitFactorStats, profitFactorText, scaledProfitFactorText, summarizeTrades, unrealizedProfitFactorStats } from './tradeStats';
import { BORDER, BORDER2, FAINT, GREEN, MONO, MUTED, PANEL, RED } from './tvChart';
import { EditableText } from '../../copy/SiteCopy';

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
    ? [...new Map(data.trades.map((t) => [t.ownerId, t.owner])).entries()]
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
            <select
              value={trader}
              onChange={(e) => setTrader(e.target.value)}
              title="Show metrics for the whole desk or one trader"
              style={selectStyle}
            >
              <option value="">Whole desk</option>
              {traders.map((tr) => (
                <option key={tr.id} value={tr.id}>@{tr.name}</option>
              ))}
            </select>
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
            <Stat label="Trades" value={String(s.total)} sub={`${s.open} open · ${s.closed} closed`} />
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'rgba(9,20,46,1)', padding: '10px 12px' }}>
      <div style={{ fontSize: 9, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 700, color: color ?? '#fff', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 9.5, color: FAINT, marginTop: 2 }}>{sub}</div>}
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
const selectStyle: CSSProperties = {
  background: 'rgba(4,12,30,.6)',
  border: `1px solid ${BORDER2}`,
  borderRadius: 6,
  color: '#dfe7fa',
  fontSize: 11,
  fontWeight: 600,
  padding: '4px 6px',
  cursor: 'pointer',
  maxWidth: 130,
};
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
