import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { EarlyAccessModal } from './EarlyAccessModal';

export function Login() {
  const { login, demoLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [earlyAccessOpen, setEarlyAccessOpen] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not sign in. Try again.',
      );
      setBusy(false);
    }
  }

  async function onDemo() {
    setError(null);
    setDemoBusy(true);
    try {
      await demoLogin();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The demo is unavailable right now.');
      setDemoBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(1200px 600px at 70% -10%,#0d2150 0%,#060f24 55%)',
        padding: 24,
        position: 'relative',
      }}
    >
      <img
        src="/brand/vitalis-wordmark.png"
        alt=""
        aria-hidden
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          width: '60vw',
          maxWidth: 880,
          opacity: 0.06,
          pointerEvents: 'none',
          filter: 'drop-shadow(0 0 70px rgba(235,203,116,.3))',
          userSelect: 'none',
        }}
      />

      <form
        onSubmit={onSubmit}
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 380,
          background:
            'linear-gradient(180deg,rgba(13,31,68,.72),rgba(11,26,58,.8))',
          border: '1px solid rgba(62,92,152,.35)',
          borderRadius: 16,
          padding: '34px 30px',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 20px 60px rgba(0,0,0,.45)',
          animation: 'popIn .4s ease',
        }}
      >
        <img
          src="/brand/vitalis-wordmark.png"
          alt="Vitalis Trading Systems"
          style={{ display: 'block', width: 220, margin: '0 auto 6px' }}
        />
        <p
          style={{
            textAlign: 'center',
            margin: '0 0 26px',
            fontSize: 11,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: '#8ea3cc',
          }}
        >
          Portal Login
        </p>

        <label style={labelStyle}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="you@vitalistradingsystems.com"
          autoFocus
          style={inputStyle}
        />
        <p style={helpStyle}>Your email is what you sign in with.</p>

        <label style={{ ...labelStyle, marginTop: 16 }}>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          style={inputStyle}
        />

        {error && (
          <div
            style={{
              marginTop: 16,
              fontSize: 12.5,
              color: '#ff8a80',
              background: 'rgba(239,84,104,.1)',
              border: '1px solid rgba(239,84,104,.4)',
              borderRadius: 7,
              padding: '9px 12px',
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !email || !password}
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
            opacity: busy || !email || !password ? 0.6 : 1,
          }}
        >
          {busy ? 'Signing in...' : 'Sign In'}
        </button>

        {/* One-click public demo: no credentials, read-only, simulated data. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 14px' }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(62,92,152,.35)' }} />
          <span style={{ fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase', color: '#5d72a0' }}>
            or
          </span>
          <div style={{ flex: 1, height: 1, background: 'rgba(62,92,152,.35)' }} />
        </div>

        <button
          type="button"
          onClick={onDemo}
          disabled={demoBusy}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: 8,
            cursor: demoBusy ? 'default' : 'pointer',
            fontSize: 13.5,
            fontWeight: 700,
            letterSpacing: '0.3px',
            color: '#eaf1ff',
            background: 'rgba(255,255,255,.05)',
            border: '1px solid rgba(124,156,224,.5)',
            opacity: demoBusy ? 0.6 : 1,
          }}
        >
          {demoBusy ? 'Loading demo...' : 'View Demo'}
        </button>
        <p style={{ textAlign: 'center', margin: '8px 0 0', fontSize: 10.5, color: '#6f84b2', lineHeight: 1.5 }}>
          A read-only tour with simulated data. No account needed.
        </p>

        <button
          type="button"
          onClick={() => setEarlyAccessOpen(true)}
          style={{
            width: '100%',
            marginTop: 14,
            padding: '11px',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.3px',
            color: '#EBCB74',
            background: 'transparent',
            border: '1px solid rgba(235,203,116,.45)',
          }}
        >
          Request Early Access
        </button>
        <p style={{ textAlign: 'center', margin: '8px 0 0', fontSize: 10.5, color: '#6f84b2', lineHeight: 1.5 }}>
          Not a member yet? Ask to join.
        </p>

        <p
          style={{
            textAlign: 'center',
            marginTop: 22,
            marginBottom: 0,
            fontSize: 10.5,
            color: '#5d72a0',
            letterSpacing: '0.3px',
          }}
        >
          © 2026 Vitalis Trading Systems LLC. All rights reserved. Confidential.
        </p>
        <p
          style={{
            textAlign: 'center',
            marginTop: 6,
            marginBottom: 0,
            fontSize: 10.5,
            color: '#5d72a0',
            letterSpacing: '0.3px',
          }}
        >
          Inquiries:{' '}
          <a href="mailto:Andrew@vitalistradingsystems.com" style={{ color: '#7c9ce0' }}>
            Andrew@vitalistradingsystems.com
          </a>
        </p>
      </form>

      {earlyAccessOpen && <EarlyAccessModal onClose={() => setEarlyAccessOpen(false)} />}
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

const helpStyle: React.CSSProperties = {
  margin: '7px 0 0',
  fontSize: 10.5,
  color: '#6f84b2',
  letterSpacing: '0.2px',
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
