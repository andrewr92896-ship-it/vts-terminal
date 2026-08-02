import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';

// Shown after login when the account still has a temporary password (an admin
// just created or reset it). Blocks the terminal until a new password is set.
export function ChangePassword() {
  const { user, changePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change password.');
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: 'var(--app-h)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(1200px 600px at 70% -10%,#0d2150 0%,#060f24 55%)',
        padding: 24,
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: '100%',
          maxWidth: 380,
          background: 'linear-gradient(180deg,rgba(13,31,68,.72),rgba(11,26,58,.8))',
          border: '1px solid rgba(62,92,152,.35)',
          borderRadius: 16,
          padding: '34px 30px',
          boxShadow: '0 20px 60px rgba(0,0,0,.45)',
          animation: 'popIn .4s ease',
        }}
      >
        <h1 style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 700, color: '#eef3ff' }}>
          Set a new password
        </h1>
        <p style={{ margin: '0 0 22px', fontSize: 12.5, color: '#8ea3cc', lineHeight: 1.5 }}>
          Welcome{user ? `, ${user.displayName.split(' ')[0]}` : ''}. Your account uses a
          temporary password. Choose a new one to continue.
        </p>

        <label style={labelStyle}>Temporary password</label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          autoFocus
          style={inputStyle}
        />

        <label style={{ ...labelStyle, marginTop: 16 }}>New password</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          style={inputStyle}
        />

        <label style={{ ...labelStyle, marginTop: 16 }}>Confirm new password</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          style={inputStyle}
        />

        {error && <div style={errorStyle}>{error}</div>}

        <button
          type="submit"
          disabled={busy || !currentPassword || !newPassword || !confirm}
          style={{
            width: '100%',
            marginTop: 24,
            padding: '12px',
            border: 'none',
            borderRadius: 8,
            cursor: busy ? 'default' : 'pointer',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '0.3px',
            color: '#0c2768',
            background: 'linear-gradient(180deg,#EBCB74,#C9A24B)',
            opacity: busy || !currentPassword || !newPassword || !confirm ? 0.6 : 1,
          }}
        >
          {busy ? 'Saving...' : 'Save password'}
        </button>

        <button
          type="button"
          onClick={() => logout()}
          style={{
            width: '100%',
            marginTop: 12,
            padding: '10px',
            border: 'none',
            background: 'transparent',
            color: '#7488b5',
            fontSize: 12.5,
            cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </form>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  color: '#8ea3cc',
  marginBottom: 7,
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

const errorStyle: React.CSSProperties = {
  marginTop: 16,
  fontSize: 12.5,
  color: '#ff8a80',
  background: 'rgba(239,84,104,.1)',
  border: '1px solid rgba(239,84,104,.4)',
  borderRadius: 7,
  padding: '9px 12px',
};
