import { useState, type CSSProperties } from 'react';
import { TradeLog } from './TradeLog';
import { LiveBrokers } from './LiveBrokers';
import { DeskSettingsModal } from './DeskSettingsModal';
import { TierMark } from '../../components/TierMark';
import { tierOfFeature } from '../../auth/access';
import { useAuth } from '../../auth/AuthContext';
import type { PremiumFeature } from '../../api/types';

// Trading navy/gold palette — matches the Live Wall and the Trade Log.
const GOLD = '#EBCB74';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const PANEL = 'rgba(11,26,58,.5)';
const BORDER = '#16294f';
const BORDER2 = '#1c3a7a';

// Trade History — reviewing what has already been traded: the desk's trades and
// the capital behind them, switched with the segmented control.
//
// **History was removed** (owner decision, 2026-08). It listed the same closed
// trades the Trade Log already carried, from the same rows, so two screens
// answered one question and could disagree about it. Everything it had that the
// Trade Log did not was folded into the Trade Log rather than dropped: the
// day-of-week and month filters, the By Strategy / By Instrument breakdowns, the
// strategy column, the held time, and editing a closed trade you own even when
// the broker imported it. `history` still resolves as a view key so a saved
// `nav.order`, an in-app link or a stale bookmark lands on the log instead of
// nothing.
//
// Placing a trade is the other screen: Trade Desk (TradeDesk.tsx). This one was
// called "Trade Desk" until that screen existed, then "Trade Analysis"; its
// section key is still `desk` through both renames, so the how-to wording and
// every in-app link keep pointing at it.
export type DeskView = 'log' | 'brokers' | 'history';

// The tabs actually drawn. `history` is deliberately absent — it is still an
// accepted `initialView` and folds into the log.
const VIEWS: { key: Exclude<DeskView, 'history'>; label: string; feature?: PremiumFeature }[] = [
  { key: 'log', label: 'Trade Log' },
  // Live account capital only exists for a connected broker, so the tab carries
  // the mark of whatever tier `brokerConnections` sits in — read from the map the
  // server sent, so moving the feature moves the mark with it.
  { key: 'brokers', label: 'Live Brokers', feature: 'brokerConnections' },
];

export function TradeHistory({ initialView = 'log' }: { initialView?: DeskView }) {
  const { user } = useAuth();
  const readOnly = !!user?.access.readOnlyWorkspaces.includes('trading');
  // `history` folds into the log — the tab is gone, the key still resolves.
  const [view, setView] = useState<Exclude<DeskView, 'history'>>(
    initialView === 'brokers' ? 'brokers' : 'log',
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Bumped when desk settings are saved, to remount the active view so it
  // refetches with the new break-even band applied.
  const [rev, setRev] = useState(0);
  const membership = user?.access.membership;

  return (
    <div style={{ color: TEXT, animation: 'fadeIn .25s ease' }}>
      {/* Sub-nav: pick one of the three consolidated views, plus the one Settings
          button for the whole desk. */}
      <div style={{ maxWidth: 1280, margin: '0 auto 18px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={segWrap} role="tablist" aria-label="Trade history views">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                role="tab"
                aria-selected={view === v.key}
                onClick={() => setView(v.key)}
                style={{ ...segBtn, ...(view === v.key ? segActive : {}) }}
              >
                {v.label}
                {v.feature && <TierMark tier={tierOfFeature(v.feature, membership)} size={12} />}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setSettingsOpen(true)} style={gearBtn} title="Trade history settings">
          <span aria-hidden style={{ fontSize: 14 }}>⚙</span> {"Settings"}
        </button>
      </div>

      {view === 'log' && <TradeLog key={`log-${rev}`} />}
      {view === 'brokers' && <LiveBrokers key={`brokers-${rev}`} />}

      <DeskSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        readOnly={readOnly}
        onSaved={() => setRev((r) => r + 1)}
      />
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
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'none',
  border: 'none',
  color: MUTED,
  fontSize: 12.5,
  fontWeight: 600,
  padding: '9px 18px',
  cursor: 'pointer',
};
const segActive: CSSProperties = { background: 'rgba(235,203,116,.14)', color: GOLD };
const gearBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  fontWeight: 600,
  color: '#dfe7fa',
  background: 'rgba(255,255,255,.05)',
  border: `1px solid ${BORDER2}`,
  padding: '9px 14px',
  borderRadius: 8,
  cursor: 'pointer',
};
