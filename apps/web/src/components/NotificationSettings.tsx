import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError, type NotifTarget, type NotifPrefFlags, type PushoverTestKind } from '../api/client';
import { hasEntitlement, tierOfFeature } from '../auth/access';
import { TierMark } from './TierMark';
import { UpgradeNotice } from './UpgradeNotice';
import { usePushNotifications } from '../push/usePushNotifications';

// The notification-channel panels: phone (web push), Pushover, which of your
// trade actions buzz you, and the test tools.
//
// They live here rather than in DeviceSettings because their one home is now
// Advanced Trading ▸ Alert Settings (owner instruction, 2026-08) — every alert
// control in one place instead of buried among the device preferences.
// DeviceSettings keeps what is genuinely not an alert: the home-screen widget
// and broker connections. It imports the shared primitives at the foot of this
// file so the two screens still look like one terminal.

// ---------------------------------------------------------------------------
// Phone notifications (web push)
// ---------------------------------------------------------------------------

// Self-serve phone-alert opt-in, shown so every trader can turn it on for their
// own device (alerts + trade open/close). Push is per-device, so each person
// enables it once on each phone/laptop they want buzzed.
//
// Deliberately FREE and outside `alertSettings`: web push needs no credential
// from anyone, so a free account is still told when its price alert fires. See
// FEATURE_TIER — what a paid tier buys is Pushover and the tuning, never being
// notified at all.
// One push subscription, one hook instance. Both this panel and the test panel
// below need it, and two instances would not see each other — turning phone
// alerts on here would leave the test panel still reading "off" until a reload,
// with its test button disabled for no visible reason. The screen owns it and
// passes it to both.
export type PushControls = ReturnType<typeof usePushNotifications>;

export function PhoneNotificationsSection({
  accent,
  accentText,
  push,
}: {
  accent: string;
  accentText: string;
  push: PushControls;
}) {
  const { state, busy, error, enable, disable } = push;

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
          This device can’t receive web push here. On iPhone, add the terminal to your Home Screen
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
          {/* No "Send test" here — every test lives in Send a test below, so
              there is one place to look and one place to keep honest. */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
        On iPhone this only works once the terminal is installed to your Home Screen.
      </p>
      {error && <div style={{ fontSize: 12, color: '#ff9a9a', marginTop: 8 }}>{error}</div>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pushover
// ---------------------------------------------------------------------------

// Pushover lets a trader get trade/alert notifications with a custom, can't-miss
// sound (chosen in the Pushover app). They paste their personal "user key" once;
// the app token lives on the server.
// `onConnectedChange` exists for the same reason the push hook is lifted: the
// test panel has to know whether there is a Pushover key to send to, and a
// second status fetch of its own would go stale the moment somebody connected
// or disconnected here. This reports it upward instead.
export function PushoverSection({
  accent,
  accentText,
  onConnectedChange,
}: {
  accent: string;
  accentText: string;
  onConnectedChange?: (connected: boolean) => void;
}) {
  const { user } = useAuth();
  // Connecting Pushover hands the terminal a credential of the user's own, which
  // is what puts it at Max. Disconnecting is never gated, so somebody whose tier
  // lapsed can always take their key back out.
  const canConnect = !!user && hasEntitlement(user, 'pushover');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [connected, setConnected] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .pushoverStatus()
      .then((s) => {
        if (!alive) return;
        setConfigured(s.configured);
        setConnected(s.connected);
        onConnectedChange?.(s.configured && s.connected);
      })
      .catch(() => alive && setConfigured(false));
    return () => {
      alive = false;
    };
    // The callback is a stable useCallback in the one screen that passes it;
    // depending on it would re-fetch the status on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // App Store / Google Play icons that deep-link to the Pushover app. Icons
  // only — the click opens the store listing in a new tab.
  const storeLink: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    lineHeight: 0,
  };
  const storeImg: React.CSSProperties = {
    width: 40,
    height: 40,
    display: 'block',
    borderRadius: 9,
  };

  return (
    <section>
      <div style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 7 }}>
        <span>Pushover (custom alert sound)</span>
        {/* Marked for everyone, including somebody who holds the tier — the mark
            says what the feature costs rather than acting as a lock. */}
        <TierMark tier={tierOfFeature('pushover', user?.access.membership)} size={12} dim={!canConnect} />
      </div>
      <p style={{ ...hintStyle, marginTop: 0, marginBottom: 12 }}>
        Get trade and alert notifications through{' '}
        <a href="https://pushover.net/" target="_blank" rel="noreferrer" style={{ color: '#8ea3cc' }}>Pushover</a>{' '}
        with your own loud, custom sound — pick or upload it right in the Pushover app.
      </p>

      {/* Connecting takes a credential of the user's own, so it is Max. The
          section is still SHOWN — a free account has to be able to see what the
          tier buys. Phone notifications above stay free and need no key, so a
          price alert still reaches a free account. */}
      {!canConnect && !connected ? (
        <UpgradeNotice feature="pushover" compact />
      ) : configured === false ? (
        <div style={hintStyle}>Pushover isn’t set up on the server yet.</div>
      ) : configured == null ? (
        <div style={hintStyle}>Checking…</div>
      ) : connected ? (
        <>
          <div style={{ fontSize: 12.5, color: '#7fd6a3', marginBottom: 10, fontWeight: 600 }}>Connected ✓</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() =>
                void run(api.pushoverDisconnect(), 'Disconnected.').then((ok) => {
                  if (!ok) return;
                  setConnected(false);
                  onConnectedChange?.(false);
                })
              }
              disabled={busy}
              style={{ ...ghost, color: '#ff9a9a' }}
            >
              Disconnect
            </button>
            <a
              href="https://apps.apple.com/us/app/pushover-notifications/id506088175"
              target="_blank"
              rel="noreferrer"
              aria-label="Get Pushover on the App Store"
              title="Get Pushover on the App Store"
              style={storeLink}
            >
              <img src="/brand/app-store.png" alt="Download Pushover on the App Store" style={storeImg} />
            </a>
            <a
              href="https://play.google.com/store/apps/details?id=net.superblock.pushover"
              target="_blank"
              rel="noreferrer"
              aria-label="Get Pushover on Google Play"
              title="Get Pushover on Google Play"
              style={storeLink}
            >
              <img src="/brand/google-play.png" alt="Get Pushover on Google Play" style={storeImg} />
            </a>
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
            Your <b>User Key</b> is on the Pushover app's home screen, and on pushover.net.
          </p>
          <div style={{ marginTop: 4 }}>
            <button
              onClick={async () => {
                if (await run(api.pushoverConnect(keyInput.trim()), 'Connected — sending a test…')) {
                  setConnected(true);
                  setKeyInput('');
                  onConnectedChange?.(true);
                  void api.pushoverTest('standard').catch(() => {});
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

// ---------------------------------------------------------------------------
// Send a test
// ---------------------------------------------------------------------------

// Prove a channel works without waiting for a real trade. Every test SAYS it is
// a test in its own title (see notifications/pushover.ts and push.ts) — a test
// alert indistinguishable from a fill is worse than no test at all, because
// somebody woken at 3am reads the first line and acts on it.
//
// The emergency test is the one that answers the question the standard test
// cannot: whether an alert reaches you through silent mode and Focus. On iPhone
// that needs Critical Alerts switched on in the Pushover app, which is a phone
// setting the terminal cannot make on the user's behalf — so the only honest way
// to know it is right is to fire one and see.
export function SendTestSection({
  accent,
  accentText,
  push,
  pushoverReady,
}: {
  accent: string;
  accentText: string;
  push: PushControls;
  pushoverReady: boolean;
}) {
  const [busy, setBusy] = useState<'push' | PushoverTestKind | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function fire(which: 'push' | PushoverTestKind) {
    setBusy(which);
    setMsg(null);
    try {
      if (which === 'push') {
        await api.pushTest();
        setMsg({ ok: true, text: 'Test sent to this device’s phone alerts.' });
      } else {
        await api.pushoverTest(which);
        setMsg({
          ok: true,
          text:
            which === 'emergency'
              ? 'Emergency test sent. It repeats for about 2 minutes until you acknowledge it in the Pushover app.'
              : 'Test sent to Pushover.',
        });
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Couldn’t send that test — try again.' });
    } finally {
      setBusy(null);
    }
  }

  const btn = (active: boolean): React.CSSProperties => ({
    background: 'rgba(255,255,255,.05)',
    border: '1px solid #1d3560',
    color: '#dfe7fa',
    fontWeight: 600,
    fontSize: 12.5,
    padding: '10px 14px',
    borderRadius: 8,
    cursor: active ? 'default' : 'pointer',
    opacity: active ? 0.6 : 1,
    minHeight: 40,
  });
  const loudBtn: React.CSSProperties = {
    ...btn(busy === 'emergency'),
    background: accent,
    border: 'none',
    color: accentText,
  };

  const pushOn = push.state === 'on';

  return (
    <section>
      <div style={sectionLabel}>Send a test</div>
      <p style={{ ...hintStyle, marginTop: 0, marginBottom: 12 }}>
        Check an alert actually reaches you. Every test says <b>TEST</b> in its title, so one can
        never be mistaken for a real trade.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => void fire('push')} disabled={!pushOn || busy != null} style={btn(busy === 'push')}>
          {busy === 'push' ? 'Sending…' : 'Test phone alert'}
        </button>
        {pushoverReady && (
          <>
            <button onClick={() => void fire('standard')} disabled={busy != null} style={btn(busy === 'standard')}>
              {busy === 'standard' ? 'Sending…' : 'Test Pushover'}
            </button>
            <button onClick={() => void fire('emergency')} disabled={busy != null} style={loudBtn}>
              {busy === 'emergency' ? 'Sending…' : 'Test emergency alert'}
            </button>
          </>
        )}
      </div>

      {!pushOn && (
        <p style={{ ...hintStyle, marginTop: 10, marginBottom: 0 }}>
          Turn phone alerts on above to test them.
        </p>
      )}
      {pushoverReady && (
        <p style={{ ...hintStyle, marginTop: 10, marginBottom: 0 }}>
          An emergency alert repeats until you acknowledge it in the Pushover app, and is the only
          kind that sounds through silent mode and Focus on iPhone — which needs Override Silent Mode
          switched on under Emergency Priority in the Pushover app’s notification settings.
        </p>
      )}
      {msg && <div style={msgStyle(msg.ok)}>{msg.text}</div>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Which trade events buzz you
// ---------------------------------------------------------------------------

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
export function PerUserNotificationsSection({ accent, accentText }: { accent: string; accentText: string }) {
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
      <div style={sectionLabel}>Trade notifications</div>
      <p style={{ ...hintStyle, marginTop: 0, marginBottom: 12 }}>
        Choose exactly which of your trade actions buzz your phone. All on by default — turn off
        what you don’t want to hear about.
      </p>

      {targets == null ? (
        <div style={hintStyle}>Loading…</div>
      ) : targets.length === 0 ? (
        <div style={hintStyle}>Nothing to notify on yet.</div>
      ) : (
        <>
          {/* The picker only earns its place when there is a choice to make.
              Trade visibility is self-only, so this is normally a list of one —
              and a dropdown holding your own name and nothing else is a control
              that asks a question with a single answer. */}
          {targets.length > 1 && (
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
          )}

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

// ---------------------------------------------------------------------------
// Shared primitives — also used by DeviceSettings, so the two screens match.
// ---------------------------------------------------------------------------

// A small on/off pill switch.
export function ToggleSwitch({
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

export const sectionLabel: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: '0.6px',
  textTransform: 'uppercase',
  color: '#7488b5',
  marginBottom: 12,
  fontWeight: 600,
};

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 13px',
  fontSize: 14,
  color: '#eef3ff',
  background: 'rgba(6,15,36,.6)',
  border: '1px solid #1d3560',
  borderRadius: 8,
  outline: 'none',
};

export const hintStyle: React.CSSProperties = {
  margin: '8px 0 0',
  fontSize: 11.5,
  color: '#6f84b2',
  lineHeight: 1.5,
};

export function msgStyle(ok: boolean): React.CSSProperties {
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
