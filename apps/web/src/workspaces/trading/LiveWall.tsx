import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useResponsive } from '../../hooks/useMediaQuery';
import { usePrivacy } from '../../privacy/privacy';
import { BrokerConnections } from './BrokerConnections';
import { DeskSettingsModal } from './DeskSettingsModal';
import { configFrom } from './outcome';
import { TradeCard, etTime } from './TradeCard';
import type { LiveWall as LiveWallData } from '../../api/types';

// Trading workspace palette — navy/gold "pro-terminal" theme. Hard-coded here
// so the screen is self-contained, the same way Kia/Wealth screens own their
// palette.
const GOLD = '#EBCB74';
const GREEN = '#35c47b';
const RED = '#ef5468';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const CARD = 'rgba(13,31,68,.5)';
const BORDER = '#16294f';
const BORDER2 = '#1c3a7a';

const REFRESH_MS = 10_000;

// The chart board pulls in react-grid-layout and the TradingView embeds, so it
// is code-split — it only loads when the trader opens the Charts view, keeping
// the initial app bundle lean (same pattern as the Studies screens).
const ChartBoard = lazy(() => import('./ChartBoard').then((m) => ({ default: m.ChartBoard })));

export function LiveWall() {
  const { isPhone } = useResponsive();
  const { privacy } = usePrivacy();
  const { user } = useAuth();
  const [data, setData] = useState<LiveWallData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // A failed *refresh* after the first load: keep the last data on screen but
  // tell the user it is stale, instead of silently showing frozen positions.
  const [staleError, setStaleError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hideMoney, setHideMoney] = useState(false);
  const [connOpen, setConnOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Two views on the wall: the customizable multi-chart board with saved
  // presets ("Master", the default) and the live positions grid.
  const [view, setView] = useState<'positions' | 'charts'>('charts');
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const d = await api.liveWall();
      setData(d);
      setLoadError(null);
      setStaleError(null);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to load the Live Wall';
      // First load with no data yet: show the full-screen error. Later failures
      // keep the last good data and surface a thin "stale" banner instead.
      if (firstLoad.current) setLoadError(msg);
      else setStaleError(msg);
    } finally {
      firstLoad.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  // The demo (and trading view-only roles) can browse the wall but not manage
  // broker connections — hide the entry point to the connection editor.
  const readOnly = !!user?.access.readOnlyWorkspaces.includes('trading');

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Live Wall</h2>
            {view === 'positions' && data && (
              <span style={data.source === 'sample' ? sampledPill : livePill}>{data.source === 'sample' ? 'Sample data' : 'Live'}</span>
            )}
          </div>
          {/* Master (charts board) ⇄ Positions view toggle */}
          <div style={segWrap}>
            <button onClick={() => setView('charts')} style={segBtn(view === 'charts')}>Master</button>
            <button onClick={() => setView('positions')} style={segBtn(view === 'positions')}>Positions</button>
          </div>
        </div>
        {view === 'positions' && data && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, color: FAINT, fontFamily: "'IBM Plex Mono', monospace" }}>
              Updated {etTime(data.generatedAt)} ET
            </span>
            {data.canSeeBalances && (
              <button onClick={() => setHideMoney((v) => !v)} style={ghostBtn}>
                {hideMoney ? 'Show $' : 'Hide $'}
              </button>
            )}
            {!readOnly && (
              <button onClick={() => setConnOpen(true)} style={ghostBtn}>Connections</button>
            )}
            <button onClick={() => setSettingsOpen(true)} style={ghostBtn} title="Trade desk settings">⚙ Settings</button>
            <button onClick={() => void load()} disabled={refreshing} style={{ ...goldBtn, opacity: refreshing ? 0.6 : 1 }}>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        )}
      </div>

      <BrokerConnections open={connOpen} onClose={() => setConnOpen(false)} onChanged={() => void load()} />
      <DeskSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} readOnly={readOnly} onSaved={() => void load()} />

      {/* Master board — kept mounted (just hidden) when the Positions view is
          open, so the preset you have open and any unsaved edits survive
          switching to Positions and back. */}
      <div style={{ display: view === 'charts' ? 'block' : 'none' }}>
        <Suspense fallback={<div style={{ color: MUTED, padding: 20, fontSize: 13 }}>Loading charts…</div>}>
          <ChartBoard />
        </Suspense>
      </div>

      {view === 'positions' &&
        (loadError ? (
          <div style={{ color: RED, padding: 20, fontSize: 13 }}>{loadError}</div>
        ) : !data ? (
          <div style={{ color: MUTED, padding: 20, fontSize: 13 }}>Loading the wall…</div>
        ) : (
          <>
            {staleError && (
              <div style={warnBanner}>
                Showing the last positions from {etTime(data.generatedAt)} ET. Couldn't refresh: {staleError}
              </div>
            )}

            {data.note && <div style={data.source === 'sample' ? infoBanner : warnBanner}>{data.note}</div>}

            {/* Trade cards */}
            {data.trades.length === 0 ? (
              <div style={{ ...card, textAlign: 'center', padding: '40px 20px', color: MUTED, fontSize: 13 }}>
                No open positions right now. New fills appear here automatically.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fill,minmax(300px,1fr))', gap: 13 }}>
                {data.trades.map((t) => (
                  <TradeCard
                    key={t.id}
                    t={t}
                    config={configFrom(data)}
                    mine={t.ownerId === user?.id}
                    readOnly={readOnly}
                    showMoney={data.canSeeBalances && !privacy && !hideMoney}
                    showFxMoney={!privacy && !hideMoney}
                    canSeeBalances={data.canSeeBalances}
                    onClosed={() => void load()}
                  />
                ))}
              </div>
            )}
          </>
        ))}
    </div>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12 };
// Positions ⇄ Charts segmented control.
const segWrap: CSSProperties = {
  display: 'inline-flex',
  background: 'rgba(4,12,30,.5)',
  border: `1px solid ${BORDER2}`,
  borderRadius: 8,
  padding: 3,
  gap: 3,
};
function segBtn(active: boolean): CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 700,
    color: active ? '#0c2768' : '#cbd8f5',
    background: active ? GOLD : 'transparent',
    border: 'none',
    borderRadius: 6,
    padding: '6px 14px',
    cursor: 'pointer',
  };
}
const ghostBtn: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: '#dfe7fa',
  background: 'rgba(255,255,255,.05)',
  border: `1px solid ${BORDER2}`,
  padding: '7px 12px',
  borderRadius: 7,
  cursor: 'pointer',
};
const goldBtn: CSSProperties = {
  border: 'none',
  background: `linear-gradient(180deg,${GOLD},${'#C9A24B'})`,
  color: '#0c2768',
  fontWeight: 700,
  fontSize: 11.5,
  padding: '8px 14px',
  borderRadius: 7,
  cursor: 'pointer',
};
const livePill: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: '0.6px',
  textTransform: 'uppercase',
  color: GREEN,
  border: `1px solid ${GREEN}`,
  borderRadius: 5,
  padding: '2px 7px',
};
const sampledPill: CSSProperties = { ...livePill, color: GOLD, border: `1px solid ${GOLD}` };
const infoBanner: CSSProperties = {
  marginBottom: 14,
  fontSize: 12.5,
  color: '#f3e3b8',
  background: 'rgba(235,203,116,.08)',
  border: '1px solid rgba(235,203,116,.35)',
  borderRadius: 8,
  padding: '9px 12px',
};
const warnBanner: CSSProperties = {
  marginBottom: 14,
  fontSize: 12.5,
  color: '#ffb4ab',
  background: 'rgba(239,84,104,.1)',
  border: '1px solid rgba(239,84,104,.4)',
  borderRadius: 8,
  padding: '9px 12px',
};
