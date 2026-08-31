import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  api,
  ApiError,
  type AlertRepeatPrefs,
  type GroupAlertKind,
  type NotifLevel,
  type NotifPrefFlags,
  type NotifPrefLevels,
  type NotifTarget,
  type PushoverTestKind,
} from '../api/client';
import { hasEntitlement, tierOfFeature } from '../auth/access';
import { TierMark } from './TierMark';
import { ReviewMark } from './ReviewMark';
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

      {/* The two ACCOUNT-level switches, under the per-device one they qualify.
          Phone notifications above are this browser; these follow the person. */}
      <AccountSwitches accent={accent} accentText={accentText} />
    </section>
  );
}

// The account master switch, and whether the group may buzz you.
//
// They sit inside Phone notifications rather than in a section of their own
// because they answer the same question at a different scope — that panel turns
// this DEVICE on and off, and these turn the ACCOUNT on and off. Splitting them
// apart would leave somebody switching a device off and wondering why their
// other phone still rang.
function AccountSwitches({ accent, accentText }: { accent: string; accentText: string }) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<AlertRepeatPrefs | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Group alerts are part of Private Groups, which is Max — so the same feature
  // key gates and marks them. Reaching them also needs the grant, which is what
  // `teamId` stands in for here: an account in no group has nobody to be nudged
  // by, so the row would be a switch over nothing.
  const canGroup = !!user && hasEntitlement(user, 'teams');
  const inGroup = !!user?.teamId;

  useEffect(() => {
    let alive = true;
    api
      .alertRepeatPrefs()
      .then((r) => alive && setPrefs(r.prefs))
      .catch(() => {
        /* leave the rows out entirely rather than drawing switches that cannot save */
      });
    return () => {
      alive = false;
    };
  }, []);

  async function save(patch: Partial<AlertRepeatPrefs>) {
    if (!prefs) return;
    const before = prefs;
    setPrefs({ ...prefs, ...patch });
    setError(null);
    try {
      const r = await api.saveAlertRepeatPrefs(patch);
      setPrefs(r.prefs);
    } catch (e) {
      setPrefs(before);
      setError(e instanceof ApiError ? e.message : 'Couldn’t save that — try again.');
    }
  }

  if (!prefs) return null;

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid #16294f', paddingTop: 6 }}>
      <SwitchRow
        label="Account notifications"
        hint="Off silences every alert for your account, on every device."
        on={prefs.accountAlerts}
        accent={accent}
        accentText={accentText}
        onClick={() => void save({ accountAlerts: !prefs.accountAlerts })}
      />
      {inGroup && (
        <SwitchRow
          label="Group notifications"
          hint={
            canGroup
              ? 'Let people in your group send you a notification.'
              : 'Included with Max. Lets people in your group send you a notification.'
          }
          on={canGroup && prefs.groupAlerts}
          disabled={!canGroup}
          accent={accent}
          accentText={accentText}
          mark={
            <>
              <TierMark tier={tierOfFeature('teams', user?.access.membership)} size={12} dim={!canGroup} />
              {/* Founder-level only — an ordinary member sees nothing. */}
              <ReviewMark id="groupAlerts" size={12} />
            </>
          }
          onClick={() => canGroup && void save({ groupAlerts: !prefs.groupAlerts })}
        />
      )}
      {error && <div style={{ fontSize: 12, color: '#ff9a9a', marginTop: 6 }}>{error}</div>}
    </div>
  );
}

function SwitchRow({
  label,
  hint,
  on,
  accent,
  accentText,
  onClick,
  mark,
  disabled,
}: {
  label: string;
  hint: string;
  on: boolean;
  accent: string;
  accentText: string;
  onClick: () => void;
  mark?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div style={{ padding: '10px 0', opacity: disabled ? 0.65 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: '#dfe7fa' }}>
          {label}
          {mark}
        </span>
        <ToggleSwitch on={on} accent={accent} accentText={accentText} onClick={onClick} />
      </div>
      <div style={{ ...hintStyle, marginTop: 4 }}>{hint}</div>
    </div>
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
  // THREE STATES, NOT TWO. `false` is the server SAYING it holds no application
  // token; 'unreachable' is not having been able to ask. They were one value,
  // so every failure of this request — a 503 while the terminal is closed for
  // maintenance, a dropped connection, a 500 — rendered "Pushover isn't set up
  // on the server yet": a claim about the server's configuration that the
  // client was in no position to make, and one that sends somebody to look at
  // the wrong thing. It cost an evening pointed at a token that was there all
  // along. Same rule as the Live Wall's `unavailable` and Market Data's
  // `sample`: what could not be read must never be reported as what was read.
  const [configured, setConfigured] = useState<boolean | null | 'unreachable'>(null);
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
        // Deliberately left alone on failure: the test panel reads this to
        // decide whether its button can do anything, and an unread status is
        // not evidence that Pushover is disconnected.
      })
      .catch(() => alive && setConfigured('unreachable'));
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
      ) : configured === 'unreachable' ? (
        <div style={hintStyle}>
          Couldn’t reach the server to check whether Pushover is set up. This says nothing about
          your Pushover account — try again in a moment.
        </div>
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
// The repeating test is the one that answers the question the standard test
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
            which === 'repeating'
              ? 'Repeating test sent. It keeps going until you acknowledge it — in the Pushover app, or just by opening the terminal.'
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
    ...btn(busy === 'repeating'),
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
            <button onClick={() => void fire('repeating')} disabled={busy != null} style={loudBtn}>
              {busy === 'repeating' ? 'Sending…' : 'Test repeating alert'}
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
          A repeating alert keeps going until you acknowledge it, and is the only kind that sounds
          through silent mode and Focus on iPhone — which needs Override Silent Mode switched on
          under Emergency Priority in the Pushover app’s notification settings.
        </p>
      )}
      {msg && <div style={msgStyle(msg.ok)}>{msg.text}</div>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Which trade events buzz you
// ---------------------------------------------------------------------------

// The six trade events a trader can toggle per watched trader, in display
// order. Order pairs each level's place/move so the panel reads top-to-bottom.
//
// **A LABEL IS THE NOTIFICATION THAT ARRIVES, NOT SOMETHING YOU DO.** Until
// 2026-08 they read "Placing trades" / "Placing SL", which named an action the
// trader takes on the desk rather than the thing this panel switches on and off
// — and the rows sit under a picker that can name somebody else, so a row
// labelled "Placing trades" was describing a teammate's fill as your own doing.
// Each one now matches the notification it governs ("Trade opened · EURUSD"),
// and SL/TP are written out, since nothing on screen said what the letters were.
// Labels only — the keys are the stored columns and are unchanged.
const NOTIF_EVENT_ROWS: { key: keyof NotifPrefFlags; label: string }[] = [
  { key: 'open', label: 'Trade opened' },
  { key: 'close', label: 'Trade closed' },
  { key: 'placeSl', label: 'Stop loss set' },
  { key: 'moveSl', label: 'Stop loss moved' },
  { key: 'placeTp', label: 'Take profit set' },
  { key: 'moveTp', label: 'Take profit moved' },
];

// Choose which teammate you want trade notifications about, and — per teammate —
// which trade events buzz you. Prefs are per recipient (this user), so everyone
// tunes their own feed. A teammate you've never touched defaults to everything
// on, matching the old whole-team behaviour.
export function PerUserNotificationsSection({ accent, accentText }: { accent: string; accentText: string }) {
  const [targets, setTargets] = useState<NotifTarget[] | null>(null);
  const [prefs, setPrefs] = useState<Record<string, NotifPrefFlags>>({});
  const [levels, setLevels] = useState<Record<string, NotifPrefLevels>>({});
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
        setLevels(d.levels);
        if (d.targets.length) setSelected(d.targets[0].id);
      })
      .catch(() => alive && setTargets([]));
    return () => {
      alive = false;
    };
  }, []);

  // Flags and levels are saved together, so both writes go through here. The
  // optimistic update is reverted as a pair on failure — reverting one and not
  // the other would leave the screen showing a combination nothing stored.
  async function save(nextFlags: NotifPrefFlags, nextLevels: NotifPrefLevels) {
    if (!selected) return;
    const prevFlags = prefs[selected];
    const prevLevels = levels[selected];
    setPrefs((p) => ({ ...p, [selected]: nextFlags }));
    setLevels((l) => ({ ...l, [selected]: nextLevels }));
    setError(null);
    try {
      await api.setNotificationPref(selected, nextFlags, nextLevels);
    } catch (e) {
      if (prevFlags) setPrefs((p) => ({ ...p, [selected]: prevFlags }));
      if (prevLevels) setLevels((l) => ({ ...l, [selected]: prevLevels }));
      setError(e instanceof ApiError ? e.message : 'Couldn’t save that — try again.');
    }
  }

  const flags = selected ? prefs[selected] : undefined;
  const lv = selected ? levels[selected] : undefined;

  function toggle(key: keyof NotifPrefFlags) {
    if (!flags || !lv) return;
    void save({ ...flags, [key]: !flags[key] }, lv);
  }

  function setLevel(key: keyof NotifPrefFlags, level: NotifLevel) {
    if (!flags || !lv) return;
    void save(flags, { ...lv, [key]: level });
  }

  // The copy names WHOSE trades these are AND WHO IS NOTIFIED, because with a
  // teammate picked the panel reads as though it were setting up THEIR alerts.
  // It is not: prefs are per recipient, so this is the signed-in reader's own
  // feed and nothing here reaches the person named. "Choose exactly which of
  // your trade actions buzz your phone" said neither half — it claimed the
  // trades were yours, and left who gets buzzed to be inferred from a dropdown
  // with somebody else's name in it.
  const target = targets?.find((t) => t.id === selected);
  const watchingSelf = !target || target.isSelf;
  const whose = watchingSelf ? 'your own trades' : `${target!.name}’s trades`;

  return (
    <section>
      <div style={sectionLabel}>Trade notifications</div>
      <p style={{ ...hintStyle, marginTop: 0, marginBottom: 12 }}>
        Which of {whose} buzz your phone. Everything is on by default — turn off what you don’t
        want to hear about.
        {!watchingSelf && (
          <>
            {' '}
            These are your alerts only — nothing here changes what {target!.name} is told about.
          </>
        )}
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
            <label style={{ display: 'block', marginBottom: 14 }}>
              {/* "Notify me about", not "Whose trades" — the dropdown holds
                  another person's name, and the one thing a name in a box
                  cannot say is which end of the notification they are on. */}
              <span style={{ ...hintStyle, display: 'block', marginBottom: 6 }}>Notify me about</span>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.isSelf ? ' (you)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          {flags && lv && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {NOTIF_EVENT_ROWS.map((row) => (
                <div key={row.key} style={{ padding: '10px 0', borderTop: '1px solid #16294f' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      fontSize: 13.5,
                      color: '#dfe7fa',
                    }}
                  >
                    <span>{row.label}</span>
                    <ToggleSwitch on={flags[row.key]} accent={accent} accentText={accentText} onClick={() => toggle(row.key)} />
                  </label>
                  {/* The level only means something for an event you are being
                      told about at all, so it appears with the switch on rather
                      than sitting there greyed out. */}
                  {flags[row.key] && (
                    <LevelPicker value={lv[row.key]} onChange={(v) => setLevel(row.key, v)} />
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {error && <div style={{ fontSize: 12, color: '#ff9a9a', marginTop: 8 }}>{error}</div>}
    </section>
  );
}

// How loud one event is, quietest first. The labels say what the PHONE does
// rather than naming a priority — "Silent" is meaningful to somebody choosing;
// "priority -1" is not.
const LEVEL_ROWS: { key: NotifLevel; label: string; hint: string }[] = [
  { key: 'silent', label: 'Silent', hint: 'Arrives with no sound or vibration' },
  { key: 'normal', label: 'Normal', hint: 'Sounds, unless you are in Pushover’s quiet hours' },
  { key: 'alert', label: 'Alert', hint: 'Sounds even during Pushover’s quiet hours' },
  { key: 'repeating', label: 'Repeating', hint: 'Repeats until you acknowledge it' },
];

// Pushover only — web push has no equivalent, so this never changes whether the
// phone-alert copy is sent, just how Pushover delivers its own. Exported so the
// rollover-close panel picks its levels with this same control — a second copy
// is how two screens come to describe "Repeating" differently.
export function LevelPicker({ value, onChange }: { value: NotifLevel; onChange: (v: NotifLevel) => void }) {
  const active = LEVEL_ROWS.find((r) => r.key === value) ?? LEVEL_ROWS[2];
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {LEVEL_ROWS.map((r) => {
          const on = r.key === value;
          return (
            <button
              key={r.key}
              onClick={() => onChange(r.key)}
              title={r.hint}
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                padding: '6px 11px',
                borderRadius: 999,
                cursor: 'pointer',
                color: on ? '#0c2768' : '#9fb0d6',
                background: on ? '#EBCB74' : 'rgba(255,255,255,.05)',
                border: `1px solid ${on ? '#EBCB74' : '#1d3560'}`,
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>
      <div style={{ ...hintStyle, marginTop: 6 }}>
        {active.hint}. Loudness applies to Pushover only — phone alerts are unaffected.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nudge the group
// ---------------------------------------------------------------------------

// Send everybody else in your private group a notification. Rendered in TWO
// places — here on Alert Settings, and on My Terminal ▸ My Group — from this one
// component, so the two can never offer different things.
//
// **There is no message box, deliberately** (owner instruction, 2026-08). The
// notification carries the sender's name and nothing else. Free text on a push
// that sounds through silent mode on other people's phones is a different
// feature with a different set of problems, and on a trading desk it is the
// point at which a nudge would become a signal to act.
//
// The sender picks only how loud: a standard alert, or a repeating one.
export function GroupAlertSender({
  accent,
  accentText,
  members,
}: {
  accent: string;
  accentText: string;
  // The group roster, when the host screen already has it (My Group does). When
  // absent — Alert Settings — it is fetched here, so the two renders offer the
  // same thing without the settings screen needing to know about groups.
  members?: { userId: string; displayName: string; username: string }[];
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<GroupAlertKind | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [fetched, setFetched] = useState<{ userId: string; displayName: string; username: string }[]>([]);
  // Empty = everybody, which is both the default and what the button did before
  // picking people was possible.
  const [picked, setPicked] = useState<string[]>([]);

  const canSend = !!user && hasEntitlement(user, 'teams');
  const inGroup = !!user?.teamId;
  const provided = members != null;

  useEffect(() => {
    if (provided || !inGroup || !canSend) return;
    let alive = true;
    api
      .myPortal()
      .then((d) => {
        if (alive) setFetched(d.team?.members ?? []);
      })
      .catch(() => {
        /* fall back to whole-group only — the send still works without a roster */
      });
    return () => {
      alive = false;
    };
  }, [provided, inGroup, canSend]);

  // Never offer yourself: the server excludes the sender anyway, so a row for
  // yourself would be a checkbox that changes nothing.
  const roster = (provided ? members : fetched).filter((m) => m.userId !== user?.id);

  // Hidden outright for anybody not in a group, matching how the rest of the
  // group features behave — there is nothing to buy that would give you one.
  if (!inGroup || user?.isDemo) return null;

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function send(kind: GroupAlertKind) {
    setBusy(kind);
    setMsg(null);
    try {
      const r = await api.sendGroupAlert(kind, picked);
      const who = picked.length === 0 ? 'in your group' : 'of the people you picked';
      setMsg({
        ok: true,
        text:
          r.recipients === 0
            ? `Nobody ${who} has group notifications switched on, so nothing was sent.`
            : `Sent to ${r.recipients} ${r.recipients === 1 ? 'person' : 'people'}.`,
      });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Couldn’t send that — try again.' });
    } finally {
      setBusy(null);
    }
  }

  const ghost: React.CSSProperties = {
    background: 'rgba(255,255,255,.05)',
    border: '1px solid #1d3560',
    color: '#dfe7fa',
    fontWeight: 600,
    fontSize: 12.5,
    padding: '10px 14px',
    borderRadius: 8,
    cursor: busy ? 'default' : 'pointer',
    opacity: busy ? 0.6 : 1,
    minHeight: 40,
  };

  return (
    <section>
      <div style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>Notify your group</span>
        <TierMark tier={tierOfFeature('teams', user?.access.membership)} size={12} dim={!canSend} />
        <ReviewMark id="groupAlerts" size={12} />
      </div>
      <p style={{ ...hintStyle, marginTop: 0, marginBottom: 12 }}>
        Buzz your whole group, or just the people you pick. They see your name and nothing else —
        there is no message.
      </p>

      {!canSend ? (
        <UpgradeNotice feature="teams" compact />
      ) : (
        <>
          {/* Who to reach. "Everyone" is a chip rather than a checkbox because
              it is a state, not an extra recipient — picking nobody IS
              everybody, so pressing it simply clears the selection. Drawn only
              when there is somebody to choose between. */}
          {roster.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              <PickChip label="Everyone" on={picked.length === 0} onClick={() => setPicked([])} />
              {roster.map((m) => (
                <PickChip
                  key={m.userId}
                  label={m.displayName?.trim() || m.username}
                  on={picked.includes(m.userId)}
                  onClick={() => toggle(m.userId)}
                />
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => void send('standard')} disabled={busy != null} style={ghost}>
              {busy === 'standard' ? 'Sending…' : 'Send alert'}
            </button>
            <button
              onClick={() => void send('repeating')}
              disabled={busy != null}
              style={{ ...ghost, background: accent, border: 'none', color: accentText }}
            >
              {busy === 'repeating' ? 'Sending…' : 'Send repeating alert'}
            </button>
          </div>
          <p style={{ ...hintStyle, marginTop: 10, marginBottom: 0 }}>
            A repeating alert keeps going on their phone until they acknowledge it. One notification
            per minute.
          </p>
        </>
      )}
      {msg && <div style={msgStyle(msg.ok)}>{msg.text}</div>}
    </section>
  );
}

// One selectable name in the recipient picker. Same shape as the level chips
// above, so the two read as one control family.
function PickChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      style={{
        fontSize: 11.5,
        fontWeight: 600,
        padding: '6px 11px',
        borderRadius: 999,
        cursor: 'pointer',
        color: on ? '#0c2768' : '#9fb0d6',
        background: on ? '#EBCB74' : 'rgba(255,255,255,.05)',
        border: `1px solid ${on ? '#EBCB74' : '#1d3560'}`,
      }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Repeat timing
// ---------------------------------------------------------------------------

// How often a repeating alert repeats and for how long. ONE setting shared by
// every event set to Repeating — anything worth waking somebody for wants the
// same urgency, and six copies of two numbers is six things to keep in step.
//
// The bounds are Pushover's, not a preference: it refuses a retry under 30
// seconds or an expiry over 3 hours. The server clamps rather than rejects, so
// these inputs are a convenience, not the enforcement.
export function RepeatTimingSection() {
  const [prefs, setPrefs] = useState<AlertRepeatPrefs | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    let alive = true;
    api
      .alertRepeatPrefs()
      .then((r) => alive && setPrefs(r.prefs))
      .catch(
        () =>
          alive &&
          setPrefs({ repeatEverySeconds: 30, repeatForSeconds: 300, accountAlerts: true, groupAlerts: true }),
      );
    return () => {
      alive = false;
    };
  }, []);

  async function persist(next: AlertRepeatPrefs) {
    setPrefs(next);
    setStatus('saving');
    try {
      const r = await api.saveAlertRepeatPrefs(next);
      // Take the server's answer back: it clamps, so this is where an
      // out-of-range number visibly becomes the one actually in force.
      setPrefs(r.prefs);
      setStatus('saved');
      window.setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 1800);
    } catch {
      setStatus('error');
    }
  }

  if (!prefs) return null;

  const everyMin = Math.round((prefs.repeatEverySeconds / 60) * 10) / 10;
  const forMin = Math.round(prefs.repeatForSeconds / 60);

  return (
    <section>
      <div style={sectionLabel}>Repeating alerts</div>
      <p style={{ ...hintStyle, marginTop: 0, marginBottom: 12 }}>
        How often a repeating alert buzzes, and how long it keeps going if you don’t acknowledge it.
        Used by every event you set to Repeating.
      </p>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#9fb0d6' }}>
          Repeat every
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              min={30}
              max={3600}
              step={30}
              value={prefs.repeatEverySeconds}
              onChange={(e) => setPrefs({ ...prefs, repeatEverySeconds: Number(e.target.value) || 0 })}
              onBlur={() => void persist(prefs)}
              style={{ ...inputStyle, width: 110 }}
            />
            <span style={{ fontSize: 12, color: '#6f84b2' }}>seconds</span>
          </span>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#9fb0d6' }}>
          Keep going for
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              min={1}
              max={180}
              step={1}
              value={forMin}
              onChange={(e) =>
                setPrefs({ ...prefs, repeatForSeconds: Math.max(0, Number(e.target.value) || 0) * 60 })
              }
              onBlur={() => void persist(prefs)}
              style={{ ...inputStyle, width: 110 }}
            />
            <span style={{ fontSize: 12, color: '#6f84b2' }}>minutes</span>
          </span>
        </label>
      </div>

      <p style={{ ...hintStyle, marginTop: 10, marginBottom: 0 }}>
        Currently: every {everyMin === Math.round(everyMin) ? everyMin : everyMin.toFixed(1)} min
        {everyMin === 1 ? '' : 's'} for up to {forMin} minute{forMin === 1 ? '' : 's'}. Pushover’s own
        limits are 30 seconds at the shortest and 3 hours at the longest.
      </p>
      <div style={{ fontSize: 11, color: status === 'error' ? '#ffb4ab' : '#6f84b2', marginTop: 6, minHeight: 14 }}>
        {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Could not save — try again.' : ''}
      </div>
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
