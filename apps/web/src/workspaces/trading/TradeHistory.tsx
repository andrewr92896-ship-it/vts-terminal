import { useState, type CSSProperties } from 'react';
import { TradeLog } from './TradeLog';
import { LiveBrokers } from './LiveBrokers';
import { DeskSettingsModal } from './DeskSettingsModal';
import { useAuth } from '../../auth/AuthContext';

// Trading navy/gold palette — matches the Live Wall and the Trade Log.
const TEXT = '#eef3ff';
const BORDER2 = '#1c3a7a';

// Closed Trades & Metrics — reviewing what has already been traded: the desk's
// closed trades and what they scored, with the capital in the connected broker
// accounts on the same page.
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
// Placing a trade is the other screen: Live Trades (TradeDesk.tsx). This one was
// called "Trade Desk" until that screen existed, then "Trade Analysis", then
// "Trade History"; its section key is still `desk` through every rename, so the
// how-to wording and every in-app link keep pointing at it.
//
// **ONE PAGE, no tabs** (owner instruction, 2026-08). Live Brokers was a second
// tab beside the trade log; it is now the last panel on this page. The two
// answer one question between them — what the trades did, and what the accounts
// behind them hold — and a tab meant you could only ever read half the answer.
// `DeskView` survives because `initialView` is still passed by in-app links and
// the legacy `log` / `history` / `metrics` section aliases; every value now
// lands on the same page, and `brokers` scrolls to the broker panel.
export type DeskView = 'log' | 'brokers' | 'history';

export function TradeHistory({ initialView = 'log' }: { initialView?: DeskView }) {
  const { user } = useAuth();
  const readOnly = !!user?.access.readOnlyWorkspaces.includes('trading');
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Bumped when desk settings are saved, to remount the views so they refetch
  // with the new break-even band applied.
  const [rev, setRev] = useState(0);

  return (
    <div style={{ color: TEXT, animation: 'fadeIn .25s ease' }}>
      {/* The one Settings button for the whole desk. It sat beside the tab bar;
          with the tabs gone it keeps its place at the top of the page. */}
      <div style={{ maxWidth: 1280, margin: '0 auto 18px', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={() => setSettingsOpen(true)} style={gearBtn} title="Trade history settings">
          <span aria-hidden style={{ fontSize: 14 }}>⚙</span> {"Settings"}
        </button>
      </div>

      <TradeLog key={`log-${rev}`} />

      {/* The connected accounts, below the record of what was traded on them.
          `initialView === 'brokers'` used to open a tab; it now brings the
          panel into view, so an old link still lands on what it named. */}
      <div id="live-brokers" ref={(el) => { if (el && initialView === 'brokers') el.scrollIntoView({ block: 'start' }); }} style={{ marginTop: 26 }}>
        <LiveBrokers key={`brokers-${rev}`} />
      </div>

      <DeskSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        readOnly={readOnly}
        onSaved={() => setRev((r) => r + 1)}
      />
    </div>
  );
}

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
