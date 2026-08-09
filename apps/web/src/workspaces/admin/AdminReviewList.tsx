import type { CSSProperties } from 'react';
import { Icon } from '../../components/Icon';
import {
  RISK_COLOR,
  WIP_COLOR,
  allReviewMarks,
  type ReviewKey,
  type ReviewMark,
} from '../../auth/reviewMarks';
import type { Theme } from '../../theme/themes';
import { SectionHeader, panel, panelLabel } from './adminUi';

// Developer Terminal ▸ Under Review — everything the terminal carries a status
// mark on, with the note saying why, in one place.
//
// The marks themselves are scattered across the app by design: they sit beside
// the feature so it is obvious what is being talked about. That makes them good
// at reminding and bad at auditing — "what is still outstanding" was a walk
// through every workspace. This is the other half.
//
// It is a READ of `auth/reviewMarks.ts` and nothing else. No state, no route, no
// stored copy — so the screen cannot fall out of step with what the terminal
// actually draws, and there is no second list to keep in sync. Changing what is
// flagged means editing that one map.
//
// Founder-level, like the whole workspace. The amber notes are compliance
// assessments of the owner's own product and must not reach a customer.

const LABELS: Record<ReviewKey, string> = {
  tradeDesk: 'Live Trades — placing an order',
  brokerConnections: 'Broker connections',
  teams: 'Private groups — shared position visibility',
  teamChat: 'Group chat',
  tradingAlerts: 'Trading alerts (TradingView webhooks)',
  strategySessions: 'Strategy Sessions — the Bull / Bear / Two-way bias',
  newsBias: 'Market News — the tape-read glyph',
  ai: 'VTS AI',
  metricsCoach: 'The AI read of a funded challenge',
  funded: 'Funded Trades tracking',
  leadTraderBadge: 'The "Lead Trader" badge title',
  legalCredentials: 'Terms + Privacy — "read-only credentials"',
  finances: 'Finances — the whole workspace',
  investments: 'Investments — the whole workspace',
  generalNews: 'News ▸ World and Politics',
};

// Where each one is marked in the terminal, so a flagged item can be found.
const WHERE: Record<ReviewKey, string> = {
  tradeDesk: 'Advanced Trading ▸ Live Trades in the sidebar, and the Order Ticket wall tile',
  brokerConnections: 'My Terminal ▸ Settings ▸ Broker connections',
  teams: 'My Terminal ▸ My Group, and the Live Wall’s Preset Settings',
  teamChat: 'The chat bubble’s Group chat tab, and the Group Chat wall tile',
  tradingAlerts: 'The Alerts tile in the Live Wall’s tile picker',
  strategySessions: 'Advanced Trading ▸ Strategy Sessions, in the sidebar',
  newsBias: 'News ▸ Market News, at the foot of the feed',
  ai: 'The Ask VTS AI panel header',
  metricsCoach: 'Advanced Trading ▸ Funded Trades, beside the AI read',
  funded: 'Advanced Trading ▸ Funded Trades, in the sidebar',
  leadTraderBadge: 'My Terminal ▸ My Group ▸ Badge',
  legalCredentials: 'Nowhere — it is a claim in the documents, not a control',
  finances: 'The Finances workspace row, and every section inside it',
  investments: 'The Investments workspace row, and every section inside it',
  generalNews: 'News ▸ World and News ▸ Politics, in the sidebar',
};

export function AdminReviewList({ theme }: { theme: Theme }) {
  const rows = allReviewMarks();
  const risky = rows.filter((r) => r.mark.risk);
  const wip = rows.filter((r) => r.mark.wip);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionHeader
        title="Under Review"
        subtitle="What the terminal marks, and why. Nobody but a developer sees the amber notes."
      />

      <div style={panel(theme)}>
        <div style={{ ...panelLabel, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon name="alert-triangle" size={13} color={RISK_COLOR} />
          <span>Flagged for review · {risky.length}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {risky.map(({ key, mark }) => (
            <Row key={key} id={key} mark={mark} color={RISK_COLOR} note={mark.risk!} />
          ))}
        </div>
      </div>

      <div style={panel(theme)}>
        <div style={{ ...panelLabel, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon name="message-circle-dashed" size={13} color={WIP_COLOR} />
          <span>Still being built · {wip.length}</span>
        </div>
        {/* Said plainly, because it is the one thing about these two lists that
            is easy to get backwards. */}
        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#8298c4' }}>
          Everyone sees these marks. The flagged notes above are yours alone.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {wip.map(({ key, mark }) => (
            <Row key={key} id={key} mark={mark} color={WIP_COLOR} note={mark.wip!} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({
  id,
  mark,
  color,
  note,
}: {
  id: ReviewKey;
  mark: ReviewMark;
  color: string;
  note: string;
}) {
  return (
    <div style={rowStyle(color)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#eef3ff' }}>{LABELS[id]}</span>
        {/* A feature carrying both marks says so here, so the two lists read as
            one picture rather than two unrelated ones. */}
        {mark.wip && mark.risk && (
          <span style={bothTag}>
            <Icon name="message-circle-dashed" size={10} color={WIP_COLOR} />
            <span>also unfinished</span>
          </span>
        )}
      </div>
      <p style={{ margin: '5px 0 0', fontSize: 12, color: '#a9bbdd', lineHeight: 1.5 }}>{note}</p>
      <p style={{ margin: '5px 0 0', fontSize: 11, color: '#7488b5' }}>{WHERE[id]}</p>
    </div>
  );
}

const rowStyle = (color: string): CSSProperties => ({
  borderLeft: `3px solid ${color}`,
  paddingLeft: 11,
});

const bothTag: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 10,
  fontWeight: 600,
  color: WIP_COLOR,
  border: `1px solid ${WIP_COLOR}55`,
  borderRadius: 5,
  padding: '1px 6px',
};
