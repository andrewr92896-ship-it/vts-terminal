import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../api/client';
import { useResponsive } from '../hooks/useMediaQuery';
import { canAccessWorkspace, isWorkspaceReadOnly } from '../auth/access';
import { BrokerConnectionsPanel } from '../workspaces/trading/BrokerConnectionsPanel';
import { usePushNotifications } from '../push/usePushNotifications';
import type { Theme } from '../theme/themes';
import { accentGradient } from '../theme/themes';

interface AccountSettingsProps {
  open: boolean;
  theme: Theme;
  onClose: () => void;
}

// Self-service account settings, opened from the user badge menu. Lets a user
// update their display name and username, and change their password. The
// admin's original-username record is kept server-side, so renaming here is
// safe.
export function AccountSettings({ open, theme, onClose }: AccountSettingsProps) {
  const { user, updateProfile, changePassword } = useAuth();
  const { isPhone } = useResponsive();
  const accentGrad = accentGradient(theme);
  // The public demo is look-only: it can open settings to see them, but cannot
  // change its profile or password (the server refuses these regardless).
  const isDemo = !!user?.isDemo;

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  // Seed the form from the current user whenever the panel opens.
  useEffect(() => {
    if (open && user) {
      setDisplayName(user.displayName);
      setUsername(user.username);
      setEmail(user.email ?? '');
      setProfileMsg(null);
      setPwMsg(null);
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    }
  }, [open, user]);

  if (!open || !user) return null;

  // Only full trading users (not view-only) may add their own broker APIs. The
  // server enforces this on every connection write too.
  const canManageBrokers =
    canAccessWorkspace(user.roles, 'trading') && !isWorkspaceReadOnly(user.roles, 'trading');
  // Anyone on the trading desk (full or view-only) can turn on phone alerts for
  // their own device. The demo is look-only and never subscribes.
  const canUsePush = !isDemo && canAccessWorkspace(user.roles, 'trading');

  const emailChanged = email.trim().toLowerCase() !== (user.email ?? '').toLowerCase();
  const profileChanged =
    displayName.trim() !== user.displayName ||
    username.trim().toLowerCase() !== user.username ||
    emailChanged;

  async function saveProfile() {
    if (!user) return;
    setProfileMsg(null);
    const patch: { username?: string; displayName?: string; email?: string } = {};
    if (displayName.trim() !== user.displayName) patch.displayName = displayName.trim();
    if (username.trim().toLowerCase() !== user.username) patch.username = username.trim();
    if (emailChanged) patch.email = email.trim();
    if (!patch.username && !patch.displayName && !patch.email) return;
    setProfileBusy(true);
    try {
      await updateProfile(patch);
      setProfileMsg({ ok: true, text: 'Profile updated.' });
    } catch (err) {
      setProfileMsg({
        ok: false,
        text: err instanceof ApiError ? err.message : 'Could not update profile.',
      });
    } finally {
      setProfileBusy(false);
    }
  }

  async function savePassword() {
    setPwMsg(null);
    if (newPassword.length < 8) {
      setPwMsg({ ok: false, text: 'New password must be at least 8 characters.' });
      return;
    }
    if (newPassword !== confirm) {
      setPwMsg({ ok: false, text: 'New passwords do not match.' });
      return;
    }
    setPwBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPwMsg({ ok: true, text: 'Password changed.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    } catch (err) {
      setPwMsg({
        ok: false,
        text: err instanceof ApiError ? err.message : 'Could not change password.',
      });
    } finally {
      setPwBusy(false);
    }
  }

  const saveBtn = (disabled: boolean): React.CSSProperties => ({
    border: 'none',
    background: accentGrad,
    color: theme.accentText,
    fontWeight: 600,
    fontSize: 13,
    padding: '10px 16px',
    borderRadius: 8,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    minHeight: 40,
  });

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
          <strong style={{ fontSize: 15, color: '#eef3ff' }}>Account settings</strong>
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
          {/* Profile */}
          <section>
            <div style={sectionLabel}>Profile</div>
            <label style={fieldLabel}>Display name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              readOnly={isDemo}
              style={inputStyle}
            />
            <label style={{ ...fieldLabel, marginTop: 14 }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="email"
              readOnly={isDemo}
              style={inputStyle}
            />
            <p style={hintStyle}>Your email is what you sign in with.</p>
            <label style={{ ...fieldLabel, marginTop: 14 }}>Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              readOnly={isDemo}
              style={inputStyle}
            />
            <p style={hintStyle}>
              A short handle shown around the portal. Changing it won't affect how your
              account appears to the admin.
            </p>
            {profileMsg && (
              <div style={msgStyle(profileMsg.ok)}>{profileMsg.text}</div>
            )}
            {!isDemo && (
              <div style={{ marginTop: 12 }}>
                <button
                  onClick={saveProfile}
                  disabled={
                    profileBusy ||
                    !profileChanged ||
                    !displayName.trim() ||
                    !username.trim() ||
                    !email.trim()
                  }
                  style={saveBtn(
                    profileBusy ||
                      !profileChanged ||
                      !displayName.trim() ||
                      !username.trim() ||
                      !email.trim(),
                  )}
                >
                  {profileBusy ? 'Saving...' : 'Save profile'}
                </button>
              </div>
            )}
          </section>

          {!isDemo && <div style={{ height: 1, background: '#1d3560' }} />}

          {/* Password */}
          {!isDemo && (
          <section>
            <div style={sectionLabel}>Password</div>
            <label style={fieldLabel}>Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              style={inputStyle}
            />
            <label style={{ ...fieldLabel, marginTop: 14 }}>New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              style={inputStyle}
            />
            <label style={{ ...fieldLabel, marginTop: 14 }}>Confirm new password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              style={inputStyle}
            />
            {pwMsg && <div style={msgStyle(pwMsg.ok)}>{pwMsg.text}</div>}
            <div style={{ marginTop: 12 }}>
              <button
                onClick={savePassword}
                disabled={pwBusy || !currentPassword || !newPassword || !confirm}
                style={saveBtn(pwBusy || !currentPassword || !newPassword || !confirm)}
              >
                {pwBusy ? 'Saving...' : 'Change password'}
              </button>
            </div>
          </section>
          )}

          {/* Phone notifications — any trading-desk user, their own device. */}
          {canUsePush && (
            <>
              <div style={{ height: 1, background: '#1d3560' }} />
              <PhoneNotificationsSection accent={accentGrad} accentText={theme.accentText} />
              <div style={{ height: 1, background: '#1d3560' }} />
              <PushoverSection accent={accentGrad} accentText={theme.accentText} />
            </>
          )}

          {/* Broker connections, for full trading users only. */}
          {canManageBrokers && (
            <>
              <div style={{ height: 1, background: '#1d3560' }} />
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

// Self-serve phone-alert opt-in, shown in settings so every trader can turn it
// on for their own device (alerts + trade open/close). Push is per-device, so
// each person enables it once on each phone/laptop they want buzzed.
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

const sectionLabel: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: '0.6px',
  textTransform: 'uppercase',
  color: '#7488b5',
  marginBottom: 12,
  fontWeight: 600,
};

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  letterSpacing: '0.4px',
  textTransform: 'uppercase',
  color: '#8ea3cc',
  marginBottom: 6,
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
