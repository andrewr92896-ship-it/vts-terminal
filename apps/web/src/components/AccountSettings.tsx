import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { useResponsive } from '../hooks/useMediaQuery';
import type { Theme } from '../theme/themes';
import { accentGradient } from '../theme/themes';
import { Avatar } from './Avatar';

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

  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<{ ok: boolean; text: string } | null>(null);

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

  const emailChanged = email.trim().toLowerCase() !== (user.email ?? '').toLowerCase();
  const profileChanged =
    displayName.trim() !== user.displayName ||
    username.trim().toLowerCase() !== user.username ||
    emailChanged;

  // Read a picked image file, crop it to a centered square, and shrink it to a
  // 256px JPEG data URL — small enough to store inline. Then save it.
  async function onPickAvatar(file: File) {
    setAvatarMsg(null);
    if (!file.type.startsWith('image/')) {
      setAvatarMsg({ ok: false, text: 'Please choose an image file.' });
      return;
    }
    setAvatarBusy(true);
    try {
      const dataUrl = await fileToSquareDataUrl(file, 256);
      await updateProfile({ avatar: dataUrl });
      setAvatarMsg({ ok: true, text: 'Photo updated.' });
    } catch (err) {
      setAvatarMsg({ ok: false, text: err instanceof ApiError ? err.message : 'Could not update photo.' });
    } finally {
      setAvatarBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removeAvatar() {
    setAvatarMsg(null);
    setAvatarBusy(true);
    try {
      await updateProfile({ avatar: '' });
      setAvatarMsg({ ok: true, text: 'Photo removed.' });
    } catch (err) {
      setAvatarMsg({ ok: false, text: err instanceof ApiError ? err.message : 'Could not remove photo.' });
    } finally {
      setAvatarBusy(false);
    }
  }

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
          width: isPhone ? '100%' : 'min(460px, calc(94 * var(--vw)))',
          maxHeight: isPhone ? '100%' : 'calc(90 * var(--vh))',
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

            {/* Profile picture */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
              <Avatar name={user.displayName} src={user.avatarUrl} size={64} accent="#EBCB74" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {!isDemo && (
                    <>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void onPickAvatar(f);
                        }}
                      />
                      <button
                        onClick={() => fileRef.current?.click()}
                        disabled={avatarBusy}
                        style={{
                          background: 'rgba(255,255,255,.05)',
                          border: '1px solid #1d3560',
                          color: '#dfe7fa',
                          fontWeight: 600,
                          fontSize: 12.5,
                          padding: '9px 14px',
                          borderRadius: 8,
                          cursor: avatarBusy ? 'default' : 'pointer',
                          opacity: avatarBusy ? 0.6 : 1,
                          minHeight: 38,
                        }}
                      >
                        {avatarBusy ? 'Saving…' : user.avatarUrl ? 'Change photo' : 'Add a photo'}
                      </button>
                      {user.avatarUrl && (
                        <button
                          onClick={() => void removeAvatar()}
                          disabled={avatarBusy}
                          style={{
                            background: 'rgba(255,255,255,.05)',
                            border: '1px solid #1d3560',
                            color: '#ff9a9a',
                            fontWeight: 600,
                            fontSize: 12.5,
                            padding: '9px 14px',
                            borderRadius: 8,
                            cursor: 'pointer',
                            minHeight: 38,
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </>
                  )}
                </div>
                <p style={{ ...hintStyle, margin: 0 }}>
                  {isDemo ? 'The demo can’t change its profile picture.' : 'A square image works best (JPG or PNG).'}
                </p>
              </div>
            </div>
            {avatarMsg && <div style={{ ...msgStyle(avatarMsg.ok), marginTop: 0, marginBottom: 14 }}>{avatarMsg.text}</div>}

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

          {/* Phone notifications, Pushover, broker connections, and app updates
              now live under the top-bar settings cog (see DeviceSettings). */}
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

// Load an image file, center-crop it to a square, and downscale to `size`px,
// returning a compact JPEG data URL suitable for storing inline as an avatar.
function fileToSquareDataUrl(file: File, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unavailable'));
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Could not process image'));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image'));
    };
    img.src = url;
  });
}
