import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { useResponsive } from '../hooks/useMediaQuery';
import { canAccessWorkspace, isWorkspaceReadOnly } from '../auth/access';
import { BrokerConnectionsPanel } from '../workspaces/trading/BrokerConnectionsPanel';
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

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
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

  const profileChanged =
    displayName.trim() !== user.displayName || username.trim().toLowerCase() !== user.username;

  async function saveProfile() {
    if (!user) return;
    setProfileMsg(null);
    const patch: { username?: string; displayName?: string } = {};
    if (displayName.trim() !== user.displayName) patch.displayName = displayName.trim();
    if (username.trim().toLowerCase() !== user.username) patch.username = username.trim();
    if (!patch.username && !patch.displayName) return;
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
              style={inputStyle}
            />
            <label style={{ ...fieldLabel, marginTop: 14 }}>Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              style={inputStyle}
            />
            <p style={hintStyle}>
              Your username is what you sign in with. Changing it won't affect how your
              account appears to the admin.
            </p>
            {profileMsg && (
              <div style={msgStyle(profileMsg.ok)}>{profileMsg.text}</div>
            )}
            <div style={{ marginTop: 12 }}>
              <button
                onClick={saveProfile}
                disabled={profileBusy || !profileChanged || !displayName.trim() || !username.trim()}
                style={saveBtn(
                  profileBusy || !profileChanged || !displayName.trim() || !username.trim(),
                )}
              >
                {profileBusy ? 'Saving...' : 'Save profile'}
              </button>
            </div>
          </section>

          <div style={{ height: 1, background: '#1d3560' }} />

          {/* Password */}
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
