import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { usePrivacy } from '../../privacy/privacy';
import type { BoardTile, LiveTrade, LiveWall } from '../../api/types';
import { configFrom } from './outcome';
import { TradeCard } from './TradeCard';
import { BORDER, BORDER2, FAINT, GOLD, GREEN, MONO, MUTED, PANEL, RED, TEXT } from './tvChart';

const REFRESH_MS = 12_000;

// A live "Open Positions" tile for the chart board — the same desk-wide open
// positions as the Positions view. Two layouts, chosen per tile and saved with
// the preset: a compact, scrollable list ('list', the default) that fits a
// small grid cell, or the full Live Wall trading cards ('cards') for the whole
// entry/fill/slippage/TP-SL/forex breakdown. Polls the Live Wall on its own
// interval and keeps the last snapshot on a failed refresh.
export function PositionsTile({
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
  const { user } = useAuth();
  const { privacy } = usePrivacy();
  const [data, setData] = useState<LiveWall | null>(null);
  const [error, setError] = useState<string | null>(null);
  const firstLoad = useRef(true);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const d = await api.liveWall();
      if (!alive.current) return;
      setData(d);
      setError(null);
    } catch (e) {
      if (!alive.current) return;
      if (firstLoad.current) setError(e instanceof ApiError ? e.message : 'Could not load positions');
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

  const view = tile.positionsView ?? 'list';
  const showMoney = !!data?.canSeeBalances && !privacy;
  // The demo (and trading view-only roles) can browse but not close positions.
  const readOnly = !!user?.access.readOnlyWorkspaces.includes('trading');

  return (
    <div style={tileWrap}>
      <div className="tile-header" style={{ ...header, cursor: editing ? 'move' : 'default' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {editing && <span style={{ color: FAINT, fontSize: 13, lineHeight: 1 }}>⠿</span>}
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{tile.title || 'Open Positions'}</span>
          {data && <span style={countChip}>{data.trades.length}</span>}
          {data && <span style={data.source === 'sample' ? sampleDot : liveDot}>{data.source === 'sample' ? 'sample' : 'live'}</span>}
        </div>
        <div className="no-drag" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* List ⇄ Cards layout picker — only while editing the board, saved with
              the preset. */}
          {editing && (
            <div style={segWrap} title="How to show open positions in this tile">
              <button onClick={() => onChange({ positionsView: 'list' })} style={segBtn(view === 'list')}>List</button>
              <button onClick={() => onChange({ positionsView: 'cards' })} style={segBtn(view === 'cards')}>Cards</button>
            </div>
          )}
          {editing && <button onClick={onRemove} style={{ ...iconBtn, color: '#ffb4ab' }} title="Remove tile">✕</button>}
        </div>
      </div>

      <div style={{ ...body, padding: view === 'cards' ? 10 : '4px 0' }}>
        {!data && !error && <div style={hint}>Loading positions…</div>}
        {error && !data && <div style={{ ...hint, color: '#ffb4ab' }}>{error}</div>}
        {data && data.trades.length === 0 && <div style={hint}>No open positions right now. New fills appear here automatically.</div>}
        {data && data.trades.length > 0 && view === 'cards' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.trades.map((t) => (
              <TradeCard
                key={t.id}
                t={t}
                config={configFrom(data)}
                mine={t.ownerId === user?.id}
                readOnly={readOnly}
                showMoney={showMoney}
                showFxMoney={!privacy}
                canSeeBalances={data.canSeeBalances}
                onClosed={() => void load()}
              />
            ))}
          </div>
        )}
        {data && data.trades.length > 0 && view === 'list' &&
          data.trades.map((t) => (
            <PositionRow key={t.id} t={t} mine={t.ownerId === user?.id} showMoney={showMoney} canSeeBalances={data.canSeeBalances} />
          ))}
      </div>
    </div>
  );
}

function PositionRow({ t, mine, showMoney, canSeeBalances }: { t: LiveTrade; mine: boolean; showMoney: boolean; canSeeBalances: boolean }) {
  const long = t.side === 'long';
  const sideColor = long ? GREEN : RED;
  const up = (t.unrealizedPl ?? 0) >= 0;
  const plColor = up ? GREEN : RED;
  const owner = t.owner.split('@')[0] || t.owner;

  return (
    <div style={row}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{t.instrument}</span>
          <span style={{ ...sideBadge, color: sideColor, border: `1px solid ${sideColor}` }}>{long ? 'L' : 'S'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          {!mine && <span style={{ fontSize: 9.5, color: '#9fb3e0', fontFamily: MONO }}>@{owner}</span>}
          <span style={{ fontSize: 9.5, color: FAINT }}>{t.brokerName}</span>
          {t.currentPrice != null && <span style={{ fontSize: 9.5, color: MUTED, fontFamily: MONO }}>@ {fmtPrice(t.currentPrice)}</span>}
        </div>
      </div>
      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        {!canSeeBalances ? (
          <span style={{ fontSize: 10, color: FAINT }}>P/L hidden</span>
        ) : t.unrealizedPl == null ? (
          <span style={{ fontSize: 12, color: MUTED, fontFamily: MONO }}>—</span>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: MONO, color: plColor }}>
            {showMoney ? `${up ? '+' : ''}${usd(t.unrealizedPl)}` : '•••'}
          </span>
        )}
        {t.forex?.pipsOpen != null && (
          <div style={{ fontSize: 10, fontWeight: 600, fontFamily: MONO, color: t.forex.pipsOpen >= 0 ? GREEN : RED, marginTop: 1 }}>
            {t.forex.pipsOpen > 0 ? '+' : ''}
            {t.forex.pipsOpen.toLocaleString('en-US', { maximumFractionDigits: 1 })} pips
          </div>
        )}
      </div>
    </div>
  );
}

const usd = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US');
function fmtPrice(n: number): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return String(Number(n.toFixed(5)));
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
const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '7px 11px',
  borderBottom: `1px solid rgba(22,41,79,.6)`,
};
const hint: CSSProperties = { padding: '18px 14px', fontSize: 11.5, color: MUTED, textAlign: 'center', lineHeight: 1.5 };
const sideBadge: CSSProperties = { fontSize: 8.5, fontWeight: 800, letterSpacing: '0.4px', borderRadius: 4, padding: '1px 4px' };
const countChip: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  color: GOLD,
  border: '1px solid rgba(235,203,116,.4)',
  borderRadius: 5,
  padding: '1px 6px',
};
// List ⇄ Cards segmented toggle in the tile header.
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
    fontSize: 10.5,
    fontWeight: 700,
    color: active ? '#0c2768' : TEXT,
    background: active ? GOLD : 'transparent',
    border: 'none',
    borderRadius: 4,
    padding: '3px 9px',
    cursor: 'pointer',
  };
}
const liveDot: CSSProperties = {
  fontSize: 8.5,
  fontWeight: 700,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  color: GREEN,
  border: `1px solid ${GREEN}`,
  borderRadius: 4,
  padding: '1px 5px',
};
const sampleDot: CSSProperties = { ...liveDot, color: GOLD, border: `1px solid ${GOLD}` };
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
