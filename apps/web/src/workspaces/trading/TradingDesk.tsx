import { useState, type CSSProperties } from 'react';
import { TradeLog } from './TradeLog';
import { LiveBrokers } from './LiveBrokers';
import { History } from './History';

// Trading navy/gold palette — matches the Live Wall / Trade Log / History.
const GOLD = '#EBCB74';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const PANEL = 'rgba(11,26,58,.5)';
const BORDER = '#16294f';

// The Trade Log, Live Brokers, and History screens all cover the same ground —
// the desk's trades and the capital behind them — so they live together here
// under one tab, switched with the segmented control instead of three separate
// tabs. Each view is the original screen, rendered verbatim.
export type DeskView = 'log' | 'brokers' | 'history';

const VIEWS: { key: DeskView; label: string; hint: string }[] = [
  { key: 'log', label: 'Trade Log', hint: 'Every fill across the desk — slippage and realized P/L' },
  { key: 'brokers', label: 'Live Brokers', hint: 'Live account capital, pulled from the broker API' },
  { key: 'history', label: 'History', hint: 'Closed trades with per-strategy and per-instrument breakdowns' },
];

export function TradingDesk({ initialView = 'log' }: { initialView?: DeskView }) {
  const [view, setView] = useState<DeskView>(initialView);
  const active = VIEWS.find((v) => v.key === view) ?? VIEWS[0];

  return (
    <div style={{ color: TEXT, animation: 'fadeIn .25s ease' }}>
      {/* Sub-nav: pick one of the three consolidated views. */}
      <div style={{ maxWidth: 1280, margin: '0 auto 18px' }}>
        <div style={segWrap} role="tablist" aria-label="Trade desk views">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              role="tab"
              aria-selected={view === v.key}
              onClick={() => setView(v.key)}
              title={v.hint}
              style={{ ...segBtn, ...(view === v.key ? segActive : {}) }}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: FAINT, marginTop: 8, paddingLeft: 2 }}>{active.hint}</div>
      </div>

      {view === 'log' && <TradeLog />}
      {view === 'brokers' && <LiveBrokers />}
      {view === 'history' && <History />}
    </div>
  );
}

const segWrap: CSSProperties = {
  display: 'inline-flex',
  background: PANEL,
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  overflow: 'hidden',
  flexWrap: 'wrap',
};
const segBtn: CSSProperties = {
  background: 'none',
  border: 'none',
  color: MUTED,
  fontSize: 12.5,
  fontWeight: 600,
  padding: '9px 18px',
  cursor: 'pointer',
};
const segActive: CSSProperties = { background: 'rgba(235,203,116,.14)', color: GOLD };
