import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Try again.');
      setBusy(false);
    }
  }

  return (
    <div style={{
      minHeight: 'var(--app-h)', display: 'flex', alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(1200px 600px at 70% -10%,#0d2150 0%,#060f24 55%)',
      padding: 24,
    }}>
      <form onSubmit={onSubmit} style={{
        width: '100%', maxWidth: 380,
        background: 'linear-gradient(180deg,rgba(13,31,68,.72),rgba(11,26,58,.8))',
        border: '1px solid rgba(62,92,152,.35)', borderRadius: 16,
        padding: '34px 30px', boxShadow: '0 20px 60px rgba(0,0,0,.45)',
      }}>
        <img src="/brand/vitalis-wordmark.png" alt="Vitalis Trading Systems"
          style={{ display: 'block', width: 220, margin: '0 auto 6px' }} />
        <p style={{
          textAlign: 'center', margin: '0 0 6px', fontSize: 11,
          letterSpacing: '2px', textTransform: 'uppercase', color: '#8ea3cc',
        }}>Private Portal</p>
        <p style={{ textAlign: 'center', margin: '0 0 26px', fontSize: 11, color: '#6f84b2' }}>
          Authorized accounts only
        </p>

        <label style={labelStyle}>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          autoComplete="email" autoCapitalize="none" autoCorrect="off" autoFocus style={inputStyle} />

        <label style={{ ...labelStyle, marginTop: 16 }}>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password" style={inputStyle} />

        {error && <div style={{
          marginTop: 16, fontSize: 12.5, color: '#ff8a80',
          background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)',
          borderRadius: 7, padding: '9px 12px',
        }}>{error}</div>}

        <button type="submit" disabled={busy || !email || !password} style={{
          width: '100%', marginTop: 24, padding: 12, border: 'none',
          borderRadius: 8, cursor: busy ? 'default' : 'pointer',
          fontSize: 14, fontWeight: 700, color: '#0c2768',
          background: 'linear-gradient(180deg,#EBCB74,#C9A24B)',
          opacity: busy || !email || !password ? .6 : 1,
        }}>{busy ? 'Signing in...' : 'Sign In'}</button>

        <p style={{ textAlign: 'center', margin: '22px 0 0', fontSize: 10.5, color: '#5d72a0' }}>
          © 2026 Vitalis Trading Systems LLC. All rights reserved.
        </p>
      </form>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, letterSpacing: '.5px',
  textTransform: 'uppercase', color: '#8ea3cc', marginBottom: 7,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 13px', fontSize: 14, color: '#eef3ff',
  background: 'rgba(6,15,36,.6)', border: '1px solid #1d3560',
  borderRadius: 8, outline: 'none',
};
