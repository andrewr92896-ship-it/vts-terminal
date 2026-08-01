import { useState, type CSSProperties, type ReactNode } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { Theme } from '../../theme/themes';
import { C } from '../../theme/tokens';
import { Icon } from '../../components/Icon';
import { SectionHeader, panel, panelLabel } from '../admin/adminUi';

// My Portal ▸ Feature Access. The optional parts of the portal, turned on and
// off by the person who uses them — no admin approval, no waiting.
//
// Only two things are optional, and both are about the trading desk. Everything
// else is included with every account and is listed below the toggles rather
// than hidden, so the screen reads as the whole picture of what you have rather
// than a near-empty page with two switches.
//
// Turning something off only hides it: no trade, account or setting is deleted,
// and turning it back on brings the workspace back exactly as it was. The server
// enforces all of this independently (features/service.ts) — this screen is the
// UI over it, not the gate.

export function FeatureAccess({ theme }: { theme: Theme }) {
  const { user, refreshUser } = useAuth();
  const features = user?.access.features;
  const isDemo = !!user?.isDemo;

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The acknowledgement shown before the desk can be switched on for the first
  // time. Once accepted the stamp is kept server-side, so coming back after an
  // opt-out does not ask again.
  const [confirming, setConfirming] = useState(false);

  const advancedTrading = !!features?.advancedTrading;
  const funded = !!features?.funded;
  const acknowledged = !!features?.tradingAckAt;

  async function save(patch: Parameters<typeof api.saveFeatures>[0], key: string) {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await api.saveFeatures(patch);
      // Re-read the user so the sidebar, routing and every screen gate pick the
      // change up immediately rather than on the next reload.
      await refreshUser();
      setConfirming(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save that change');
    } finally {
      setBusy(null);
    }
  }

  function toggleTrading() {
    if (advancedTrading) {
      void save({ advancedTrading: false }, 'trading');
      return;
    }
    // First time in: show what the desk actually does before turning it on.
    if (!acknowledged) {
      setConfirming(true);
      return;
    }
    void save({ advancedTrading: true }, 'trading');
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px 40px' }}>
      <SectionHeader
        title="Feature Access"
        subtitle="Choose which parts of the portal you want. Turning one off only hides it — nothing you have saved is deleted, and turning it back on restores it."
      />

      {isDemo && (
        <div style={noticeBox}>
          This is the read-only demo account, so these switches can't be changed.
        </div>
      )}

      {error && <div style={errorBox}>{error}</div>}

      <section style={panel(theme)}>
        <div style={panelLabel}>{"Optional features"}</div>

        <FeatureRow
          icon="candlestick-chart"
          accent={C.gold}
          title="Advanced Trading"
          on={advancedTrading}
          disabled={isDemo || busy != null}
          busy={busy === 'trading'}
          onToggle={toggleTrading}
        >
          The trading desk: place and manage real orders through your own broker,
          review your trade history and performance, set up strategy sessions and
          alerts, and keep a manual trade book by hand.
        </FeatureRow>

        {/* Funded sits under Advanced Trading — the challenge tracker is part of
            the desk, so it is indented and disabled until the desk is on. */}
        <div style={{ paddingLeft: 22, borderLeft: `1px solid ${C.line2}`, marginLeft: 8, marginTop: 12 }}>
          <FeatureRow
            icon="shield-check"
            accent={C.gold}
            title="Funded Account"
            on={funded}
            disabled={isDemo || !advancedTrading || busy != null}
            busy={busy === 'funded'}
            onToggle={() => void save({ funded: !funded }, 'funded')}
            note={!advancedTrading ? 'Turn on Advanced Trading first' : undefined}
          >
            Track a prop-firm challenge: equity against your target, and how much
            daily and overall drawdown you have left. Everything is entered by
            hand or read off a screenshot — prop firms don't offer connections,
            so nothing here links to an account.
          </FeatureRow>
        </div>
      </section>

      <section style={{ ...panel(theme), marginTop: 16 }}>
        <div style={panelLabel}>{"Included with your account"}</div>
        <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6, marginBottom: 12 }}>
          {"These are always on. There is nothing to turn on and nothing to pay for."}
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <IncludedRow icon="globe" title="Markets">
            Live charts, watchlists, market headlines, the economic calendar and
            the market-data board.
          </IncludedRow>
          <IncludedRow icon="landmark" title="Investments">
            Your long-term portfolio — retirement accounts, holdings, allocation
            and performance.
          </IncludedRow>
          <IncludedRow icon="graduation-cap" title="Studies">
            Study games, flashcards, practice tests and study guides.
          </IncludedRow>
          <IncludedRow icon="briefcase" title="My Portal">
            Your own summary, your trading team, and your settings.
          </IncludedRow>
          <IncludedRow icon="life-buoy" title="Site Help">
            How-to guides, announcements, patch notes, and the bug and suggestion
            forms.
          </IncludedRow>
        </div>
      </section>

      {confirming && (
        <TradingAcknowledgement
          busy={busy === 'trading'}
          onCancel={() => setConfirming(false)}
          onAccept={() => void save({ advancedTrading: true, acknowledgeTrading: true }, 'trading')}
        />
      )}
    </div>
  );
}

// The one thing standing between the switch and a live order ticket: a plain
// statement of what the desk does, confirmed once. Not a legal wall — an honest
// description, so nobody arrives at the Trade Desk surprised.
function TradingAcknowledgement({
  busy,
  onCancel,
  onAccept,
}: {
  busy: boolean;
  onCancel: () => void;
  onAccept: () => void;
}) {
  return (
    <div style={modalWrap} onClick={onCancel}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0, fontSize: 16.5, fontWeight: 700, color: C.text }}>
          {"Before you turn on Advanced Trading"}
        </h3>
        <ul style={{ margin: '14px 0 0', padding: '0 0 0 18px', color: C.muted, fontSize: 13, lineHeight: 1.7 }}>
          <li>
            The Trade Desk places <b style={{ color: C.text }}>real orders</b> with
            your own broker, under your own credentials. An order sent here is a
            live position.
          </li>
          <li>
            You connect your own broker account. The portal never holds your money
            — it can't deposit, withdraw, or move funds anywhere.
          </li>
          <li>
            Until you connect a broker there is nothing to trade with, and the desk
            has nothing to send an order to.
          </li>
          <li>
            Everything here is <b style={{ color: C.text }}>informational only</b> and
            is not investment advice. Your trades are your decisions.
          </li>
        </ul>
        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <button onClick={onAccept} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Turning on…' : 'I understand — turn it on'}
          </button>
          <button onClick={onCancel} style={ghostBtn}>{"Cancel"}</button>
        </div>
      </div>
    </div>
  );
}

function FeatureRow({
  icon,
  accent,
  title,
  children,
  on,
  disabled,
  busy,
  note,
  onToggle,
}: {
  icon: string;
  accent: string;
  title: string;
  children: ReactNode;
  on: boolean;
  disabled?: boolean;
  busy?: boolean;
  note?: string;
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        padding: '14px 4px',
        opacity: disabled && !busy ? 0.65 : 1,
      }}
    >
      <span style={{ flex: 'none', marginTop: 2 }}>
        <Icon name={icon} size={18} color={on ? accent : C.faint} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: on ? C.text : C.muted }}>{title}</div>
        <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6, marginTop: 4 }}>{children}</div>
        {note && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 6 }}>{note}</div>}
      </div>
      <Switch on={on} disabled={disabled} busy={busy} accent={accent} onToggle={onToggle} label={title} />
    </div>
  );
}

function Switch({
  on,
  disabled,
  busy,
  accent,
  label,
  onToggle,
}: {
  on: boolean;
  disabled?: boolean;
  busy?: boolean;
  accent: string;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      style={{
        flex: 'none',
        width: 46,
        height: 26,
        borderRadius: 13,
        border: `1px solid ${on ? accent : C.line2}`,
        background: on ? `${accent}33` : 'rgba(255,255,255,.04)',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background-color .15s ease, border-color .15s ease',
        marginTop: 2,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: busy ? C.faint : on ? accent : '#7488b5',
          transition: 'left .15s ease, background-color .15s ease',
        }}
      />
    </button>
  );
}

function IncludedRow({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <span style={{ flex: 'none', marginTop: 2 }}>
        <Icon name={icon} size={15} color={C.faint} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{title}</div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55, marginTop: 2 }}>{children}</div>
      </div>
    </div>
  );
}

const noticeBox: CSSProperties = {
  marginBottom: 14,
  fontSize: 12.5,
  color: C.muted,
  background: 'rgba(255,255,255,.04)',
  border: `1px solid ${C.line2}`,
  borderRadius: 8,
  padding: '9px 12px',
};
const errorBox: CSSProperties = {
  marginBottom: 14,
  fontSize: 12.5,
  color: '#ffb4ab',
  background: 'rgba(239,84,104,.1)',
  border: '1px solid rgba(239,84,104,.4)',
  borderRadius: 8,
  padding: '9px 12px',
};
const modalWrap: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(3,8,20,.72)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  zIndex: 120,
};
const modalCard: CSSProperties = {
  width: 'min(560px, 100%)',
  maxHeight: 'calc(86 * var(--vh))',
  overflowY: 'auto',
  background: '#0C1C3C',
  border: `1px solid ${C.line2}`,
  borderRadius: 12,
  padding: '20px 22px 22px',
  boxShadow: '0 24px 60px rgba(0,0,0,.55)',
};
const primaryBtn: CSSProperties = {
  border: 'none',
  background: `linear-gradient(180deg,${C.gold},#C9A24B)`,
  color: '#0c2768',
  fontWeight: 700,
  fontSize: 12.5,
  padding: '10px 16px',
  borderRadius: 8,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const ghostBtn: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: '#dfe7fa',
  background: 'rgba(255,255,255,.05)',
  border: `1px solid ${C.line2}`,
  padding: '10px 14px',
  borderRadius: 8,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
