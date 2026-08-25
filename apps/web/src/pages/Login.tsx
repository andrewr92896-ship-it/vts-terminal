import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../api/client';

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (recovering) emailInputRef.current?.focus();
  }, [recovering]);

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

  async function onRecoverySubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setRecoveryMessage(null);
    setBusy(true);
    try {
      const response = await api.forgotPassword(email);
      setRecoveryMessage(response.message);
    } catch {
      // A transport failure is the only distinct case the browser can know.
      // Server-side account/provider outcomes all use the generic success copy.
      setError('Could not submit the request. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function showRecovery() {
    setRecovering(true);
    setError(null);
    setRecoveryMessage(null);
  }

  function showLogin() {
    setRecovering(false);
    setError(null);
    setRecoveryMessage(null);
  }

  return (
    <div style={{
      minHeight: 'var(--app-h)', display: 'flex', alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(1200px 600px at 70% -10%,#0d2150 0%,#060f24 55%)',
      padding: 24,
    }}>
      <form onSubmit={recovering ? onRecoverySubmit : onSubmit}
        aria-labelledby="terminal-login-heading terminal-login-mode" style={{
        width: '100%', maxWidth: 380,
        background: 'linear-gradient(180deg,rgba(13,31,68,.72),rgba(11,26,58,.8))',
        border: '1px solid rgba(62,92,152,.35)', borderRadius: 16,
        padding: '34px 30px', boxShadow: '0 20px 60px rgba(0,0,0,.45)',
      }}>
        <img src="/brand/vitalis-wordmark.png" alt="Vitalis Trading Systems"
          style={{ display: 'block', width: 220, margin: '0 auto 6px' }} />
        <p id="terminal-login-heading" style={{
          textAlign: 'center', margin: '0 0 6px', fontSize: 11,
          letterSpacing: '2px', textTransform: 'uppercase', color: '#8ea3cc',
        }}>Private Portal</p>
        <p id="terminal-login-mode" style={{ textAlign: 'center', margin: '0 0 26px', fontSize: 11, color: '#6f84b2' }}>
          {recovering ? 'Password recovery' : 'Authorized accounts only'}
        </p>

        {recovering && (
          <p style={{ margin: '0 0 18px', color: '#8ea3cc', fontSize: 12.5, lineHeight: 1.55 }}>
            Enter your sign-in email. If recovery is available, we’ll email a temporary password.
          </p>
        )}

        <label htmlFor="terminal-email" style={labelStyle}>Email</label>
        <input ref={emailInputRef} id="terminal-email" type="email" value={email}
          onChange={(e) => setEmail(e.target.value)} required
          autoComplete="email" autoCapitalize="none" autoCorrect="off" autoFocus style={inputStyle} />

        {!recovering && (
          <>
            <label htmlFor="terminal-password" style={{ ...labelStyle, marginTop: 16 }}>Password</label>
            <input id="terminal-password" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} required
              autoComplete="current-password" style={inputStyle} />
            <button type="button" onClick={showRecovery} style={textButtonStyle}>
              Forgot password?
            </button>
          </>
        )}

        {error && <div style={{
          marginTop: 16, fontSize: 12.5, color: '#ff8a80',
          background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)',
          borderRadius: 7, padding: '9px 12px',
        }}>{error}</div>}

        {recoveryMessage && (
          <div role="status" aria-live="polite" style={statusStyle}>{recoveryMessage}</div>
        )}

        <button type="submit" disabled={busy || !email || (!recovering && !password)} style={{
          width: '100%', marginTop: 24, padding: 12, border: 'none',
          borderRadius: 8, cursor: busy ? 'default' : 'pointer',
          fontSize: 14, fontWeight: 700, color: '#0c2768',
          background: 'linear-gradient(180deg,#EBCB74,#C9A24B)',
          opacity: busy || !email || (!recovering && !password) ? .6 : 1,
        }}>
          {busy ? (recovering ? 'Submitting...' : 'Signing in...') : (recovering ? 'Email temporary password' : 'Sign In')}
        </button>

        {recovering && (
          <button type="button" onClick={showLogin} style={{ ...textButtonStyle, width: '100%', textAlign: 'center', marginTop: 12 }}>
            Back to sign in
          </button>
        )}

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
const textButtonStyle: React.CSSProperties = {
  display: 'block',
  margin: '9px 0 0 auto',
  padding: '3px 0',
  border: 'none',
  background: 'transparent',
  color: '#9fb0d6',
  fontSize: 12,
  cursor: 'pointer',
};
const statusStyle: React.CSSProperties = {
  marginTop: 16,
  fontSize: 12.5,
  lineHeight: 1.5,
  color: '#b9c8e8',
  background: 'rgba(108,158,255,.1)',
  border: '1px solid rgba(108,158,255,.35)',
  borderRadius: 7,
  padding: '9px 12px',
};
