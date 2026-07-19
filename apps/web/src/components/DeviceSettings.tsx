import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError, type NotifTarget, type NotifPrefFlags } from '../api/client';
import { useResponsive } from '../hooks/useMediaQuery';
import { canAccessWorkspace, isWorkspaceReadOnly } from '../auth/access';
import { BrokerConnectionsPanel } from '../workspaces/trading/BrokerConnectionsPanel';
import { usePushNotifications } from '../push/usePushNotifications';
import type { Theme } from '../theme/themes';
import { accentGradient } from '../theme/themes';

interface DeviceSettingsProps {
  open: boolean;
  theme: Theme;
  onClose: () => void;
}

// Device & connection settings, opened from the top-bar settings cog. Holds the
// per-device / account-connection controls that used to live in Account
// settings: phone notifications, Pushover, broker connections, and app updates.
// Account settings now keeps only who-you-are (profile, picture, password).
export function DeviceSettings({ open, theme, onClose }: DeviceSettingsProps) {
  const { user } = useAuth();
  const { isPhone } = useResponsive();
  const accentGrad = accentGradient(theme);
  const isDemo = !!user?.isDemo;

  if (!open || !user) return null;

  // Only full trading users (not view-only) may add their own broker APIs. The
  // server enforces this on every connection write too.
  const canManageBrokers =
    canAccessWorkspace(user.roles, 'trading') && !isWorkspaceReadOnly(user.roles, 'trading');
  // Anyone on the trading desk (full or view-only) can turn on phone alerts for
  // their own device. The demo is look-only and never subscribes.
  const canUsePush = !isDemo && canAccessWorkspace(user.roles, 'trading');

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,.5)',
          zIndex: 60,
          animation: 'fadeIn .2s ease',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          top: isPhone ? 0 : '50%',
          left: '50%',
          transform: isPhone ? 'translateX(-50%)' : 'translate(-50%,-50%)',
          width: isPhone ? '100%' : 'min(460px, 94vw)',
          maxHeight: isPhone ? '100%' : '90vh',
          height: isPhone ? '100%' : undefined,
          overflowY: 'auto',
          background: 'linear-gradient(180deg,#0b1a3a,#081226)',
          border: '1px solid #1d3560',
          borderRadius: isPhone ? 0 : 14,
          boxShadow: '0 24px 60px rgba(0,0,0,.55)',
          zIndex: 61,
          animation: 'popIn .25s ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 20px',
            borderBottom: '1px solid #1d3560',
            position: 'sticky',
            top: 0,
            background: '#0b1a3a',
          }}
        >
          <strong style={{ fontSize: 15, color: '#eef3ff' }}>Notifications & connections</strong>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: '#7488b5',
              fontSize: 22,
              lineHeight: 1,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Phone notifications — any trading-desk user, their own device. */}
          {canUsePush && (
            <>
              <PhoneNotificationsSection accent={accentGrad} accentText={theme.accentText} />
              <div style={{ height: 1, background: '#1d3560' }} />
              <PushoverSection accent={accentGrad} accentText={theme.accentText} />
              <div style={{ height: 1, background: '#1d3560' }} />
              <PerUserNotificationsSection accent={accentGrad} accentText={theme.accentText} />
            </>
          )}

          {/* Broker connections, for full trading users only. */}
          {canManageBrokers && (
            <>
              {canUsePush && <div style={{ height: 1, background: '#1d3560' }} />}
              <section>
                <div style={sectionLabel}>Broker connections</div>
                <BrokerConnectionsPanel />
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// Self-serve phone-alert opt-in, shown so every trader can turn it on for their
// own device (alerts + trade open/close). Push is per-device, so each person
// enables it once on each phone/laptop they want buzzed.
function PhoneNotificationsSection({ accent, accentText }: { accent: string; accentText: string }) {
  const { state, busy, error, enable, disable, sendTest } = usePushNotifications();

  const primaryBtn: React.CSSProperties = {
    border: 'none',
    background: accent,
    color: accentText,
    fontWeight: 600,
    fontSize: 13,
    padding: '10px 16px',
    borderRadius: 8,
    cursor: busy ? 'default' : 'pointer',
    opacity: busy ? 0.6 : 1,
    minHeight: 40,
  };
  const ghost: React.CSSProperties = {
    background: 'rgba(255,255,255,.05)',
    border: '1px solid #1d3560',
    color: '#dfe7fa',
    fontWeight: 600,
    fontSize: 12.5,
    padding: '10px 14px',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 40,
  };

  return (
    <section>
      <div style={sectionLabel}>Phone notifications</div>
      <p style={{ ...hintStyle, marginTop: 0, marginBottom: 12 }}>
        Get a push on this device when a trade opens or closes and when alerts fire — even with the
        app closed.
      </p>

      {state === 'unsupported' ? (
        <div style={hintStyle}>
          This device can’t receive web push here. On iPhone, add the portal to your Home Screen
          (Share → Add to Home Screen) and open it from that icon, then turn this on.
        </div>
      ) : state === 'unconfigured' ? (
        <div style={hintStyle}>Push isn’t set up on the server yet.</div>
      ) : state === 'denied' ? (
        <div style={hintStyle}>
          Notifications are blocked for this site. Turn them on in your browser or phone settings,
          then reopen this panel.
        </div>
      ) : state === 'on' ? (
        <>
          <div style={{ fontSize: 12.5, color: '#7fd6a3', marginBottom: 10, fontWeight: 600 }}>
            On for this device ✓
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => void sendTest()} style={ghost}>Send test</button>
            <button onClick={() => void disable()} disabled={busy} style={{ ...ghost, color: '#ff9a9a' }}>
              Turn off
            </button>
          </div>
        </>
      ) : (
        <button onClick={() => void enable()} disabled={busy} style={primaryBtn}>
          {busy ? 'Turning on…' : 'Turn on phone alerts'}
        </button>
      )}

      <p style={{ ...hintStyle, marginTop: 12, marginBottom: 0 }}>
        On iPhone this only works once the portal is installed to your Home Screen. Each device you
        want buzzed needs to be turned on once.
      </p>
      {error && <div style={{ fontSize: 12, color: '#ff9a9a', marginTop: 8 }}>{error}</div>}
    </section>
  );
}

// Pushover lets a trader get trade/alert notifications with a custom, can't-miss
// sound (chosen in the Pushover app). They paste their personal "user key" once;
// the app token lives on the server.
function PushoverSection({ accent, accentText }: { accent: string; accentText: string }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [connected, setConnected] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .pushoverStatus()
      .then((s) => alive && (setConfigured(s.configured), setConnected(s.connected)))
      .catch(() => alive && setConfigured(false));
    return () => {
      alive = false;
    };
  }, []);

  async function run(p: Promise<unknown>, okText: string) {
    setBusy(true);
    setMsg(null);
    try {
      await p;
      setMsg({ ok: true, text: okText });
      return true;
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Something went wrong' });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const primaryBtn: React.CSSProperties = {
    border: 'none',
    background: accent,
    color: accentText,
    fontWeight: 600,
    fontSize: 13,
    padding: '10px 16px',
    borderRadius: 8,
    cursor: busy ? 'default' : 'pointer',
    opacity: busy ? 0.6 : 1,
    minHeight: 40,
  };
  const ghost: React.CSSProperties = {
    background: 'rgba(255,255,255,.05)',
    border: '1px solid #1d3560',
    color: '#dfe7fa',
    fontWeight: 600,
    fontSize: 12.5,
    padding: '10px 14px',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 40,
  };

  return (
    <section>
      <div style={sectionLabel}>Pushover (custom alert sound)</div>
      <p style={{ ...hintStyle, marginTop: 0, marginBottom: 12 }}>
        Get trade and alert notifications through{' '}
        <a href="https://pushover.net/" target="_blank" rel="noreferrer" style={{ color: '#8ea3cc' }}>Pushover</a>{' '}
        with your own loud, custom sound — pick or upload it right in the Pushover app.
      </p>

      {configured === false ? (
        <div style={hintStyle}>Pushover isn’t set up on the server yet.</div>
      ) : configured == null ? (
        <div style={hintStyle}>Checking…</div>
      ) : connected ? (
        <>
          <div style={{ fontSize: 12.5, color: '#7fd6a3', marginBottom: 10, fontWeight: 600 }}>Connected ✓</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => void run(api.pushoverTest(), 'Test sent — check your phone.')} disabled={busy} style={ghost}>
              Send test
            </button>
            <button
              onClick={async () => {
                if (await run(api.pushoverDisconnect(), 'Disconnected.')) setConnected(false);
              }}
              disabled={busy}
              style={{ ...ghost, color: '#ff9a9a' }}
            >
              Disconnect
            </button>
          </div>
        </>
      ) : (
        <>
          <input
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Your Pushover user key"
            autoCapitalize="none"
            autoCorrect="off"
            style={inputStyle}
          />
          <p style={hintStyle}>
            Install the Pushover app, and copy your <b>User Key</b> from its home screen (or
            pushover.net). Each device you want buzzed needs the app installed.
          </p>
          <div style={{ marginTop: 4 }}>
            <button
              onClick={async () => {
                if (await run(api.pushoverConnect(keyInput.trim()), 'Connected — sending a test…')) {
                  setConnected(true);
                  setKeyInput('');
                  void api.pushoverTest().catch(() => {});
                }
              }}
              disabled={busy || keyInput.trim().length < 20}
              style={{ ...primaryBtn, opacity: busy || keyInput.trim().length < 20 ? 0.6 : 1 }}
            >
              {busy ? 'Connecting…' : 'Connect Pushover'}
            </button>
          </div>
        </>
      )}
      {msg && <div style={msgStyle(msg.ok)}>{msg.text}</div>}
    </section>
  );
}

// The six trade events a trader can toggle per watched teammate, in display
// order. Order pairs each level's place/move so the panel reads top-to-bottom.
const NOTIF_EVENT_ROWS: { key: keyof NotifPrefFlags; label: string }[] = [
  { key: 'open', label: 'Placing trades' },
  { key: 'close', label: 'Closing trades' },
  { key: 'placeSl', label: 'Placing SL' },
  { key: 'moveSl', label: 'Moving SL' },
  { key: 'placeTp', label: 'Placing TP' },
  { key: 'moveTp', label: 'Moving TP' },
];

// Choose which teammate you want trade notifications about, and — per teammate —
// which trade events buzz you. Prefs are per recipient (this user), so everyone
// tunes their own feed. A teammate you've never touched defaults to everything
// on, matching the old whole-team behaviour.
function PerUserNotificationsSection({ accent, accentText }: { accent: string; accentText: string }) {
  const [targets, setTargets] = useState<NotifTarget[] | null>(null);
  const [prefs, setPrefs] = useState<Record<string, NotifPrefFlags>>({});
  const [selected, setSelected] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .notificationPrefs()
      .then((d) => {
        if (!alive) return;
        setTargets(d.targets);
        setPrefs(d.prefs);
        if (d.targets.length) setSelected(d.targets[0].id);
      })
      .catch(() => alive && setTargets([]));
    return () => {
      alive = false;
    };
  }, []);

  async function toggle(key: keyof NotifPrefFlags) {
    if (!selected) return;
    const current = prefs[selected];
    if (!current) return;
    const next = { ...current, [key]: !current[key] };
    setPrefs((p) => ({ ...p, [selected]: next }));
    setError(null);
    try {
      await api.setNotificationPref(selected, next);
    } catch (e) {
      // Revert the optimistic flip on failure.
      setPrefs((p) => ({ ...p, [selected]: current }));
      setError(e instanceof ApiError ? e.message : 'Couldn’t save that — try again.');
    }
  }

  const flags = selected ? prefs[selected] : undefined;

  return (
    <section>
      <div style={sectionLabel}>Notify me about a trader</div>
      <p style={{ ...hintStyle, marginTop: 0, marginBottom: 12 }}>
        Pick a teammate and choose exactly which of their trade actions buzz your phone. Everyone’s
        on by default — turn off what you don’t want to hear about.
      </p>

      {targets == null ? (
        <div style={hintStyle}>Loading…</div>
      ) : targets.length === 0 ? (
        <div style={hintStyle}>No teammates to watch yet.</div>
      ) : (
        <>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            style={{ ...inputStyle, marginBottom: 14, cursor: 'pointer' }}
          >
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.isSelf ? ' (you)' : ''}
              </option>
            ))}
          </select>

          {flags && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {NOTIF_EVENT_ROWS.map((row) => (
                <label
                  key={row.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 2px',
                    cursor: 'pointer',
                    fontSize: 13.5,
                    color: '#dfe7fa',
                  }}
                >
                  <span>{row.label}</span>
                  <ToggleSwitch on={flags[row.key]} accent={accent} accentText={accentText} onClick={() => void toggle(row.key)} />
                </label>
              ))}
            </div>
          )}
        </>
      )}
      {error && <div style={{ fontSize: 12, color: '#ff9a9a', marginTop: 8 }}>{error}</div>}
    </section>
  );
}

// A small on/off pill switch. Kept local to this file — the only toggle UI here.
function ToggleSwitch({
  on,
  accent,
  accentText,
  onClick,
}: {
  on: boolean;
  accent: string;
  accentText: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      style={{
        position: 'relative',
        width: 44,
        height: 26,
        flexShrink: 0,
        borderRadius: 999,
        border: '1px solid #1d3560',
        background: on ? accent : 'rgba(255,255,255,.06)',
        cursor: 'pointer',
        padding: 0,
        transition: 'background .15s ease',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 20 : 2,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: on ? accentText : '#8ea3cc',
          transition: 'left .15s ease',
        }}
      />
    </button>
  );
}

const sectionLabel: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: '0.6px',
  textTransform: 'uppercase',
  color: '#7488b5',
  marginBottom: 12,
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 13px',
  fontSize: 14,
  color: '#eef3ff',
  background: 'rgba(6,15,36,.6)',
  border: '1px solid #1d3560',
  borderRadius: 8,
  outline: 'none',
};

const hintStyle: React.CSSProperties = {
  margin: '8px 0 0',
  fontSize: 11.5,
  color: '#6f84b2',
  lineHeight: 1.5,
};

function msgStyle(ok: boolean): React.CSSProperties {
  return {
    marginTop: 12,
    fontSize: 12.5,
    color: ok ? '#7fe0c0' : '#ff8a80',
    background: ok ? 'rgba(53,196,123,.1)' : 'rgba(239,84,104,.1)',
    border: `1px solid ${ok ? 'rgba(53,196,123,.4)' : 'rgba(239,84,104,.4)'}`,
    borderRadius: 7,
    padding: '9px 12px',
  };
}
