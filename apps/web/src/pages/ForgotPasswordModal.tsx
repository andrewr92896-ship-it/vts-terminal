import { useState, type CSSProperties, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';

export function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSubmit = !!email.trim() && !busy;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return setError('Please enter your email address.');
    setBusy(true);
    try {
      await api.requestPasswordReset({
        email: email.trim(),
        note: note.trim() || undefined,
      });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not send your request. Try again.',
      );
      setBusy(false);
    }
  }

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Reset your password"
        onClick={(e) => e.stopPropagation()}
        style={dialogStyle}
      >
        <div style={headerStyle}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#eef3ff' }}>Forgot your password?</div>
            <div style={{ fontSize: 11.5, color: '#8ea3cc', marginTop: 3 }}>
              Enter your email and we’ll reset it for you.
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={closeBtn}>
            ×
          </button>
        </div>

        {done ? (
          <div style={{ padding: '28px 24px', textAlign: 'center' }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: '50%',
                margin: '0 auto 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(53,196,123,.14)',
                border: '1px solid rgba(53,196,123,.5)',
                color: '#7fe0c0',
                fontSize: 22,
              }}
            >
              ✓
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#eef3ff', marginBottom: 6 }}>
              Request received
            </div>
            <p style={{ fontSize: 12.5, color: '#8ea3cc', lineHeight: 1.6, margin: '0 auto 20px', maxWidth: 320 }}>
              If <strong style={{ color: '#cfe0ff' }}>{email.trim()}</strong> is on file, we’ll email a
              temporary password shortly. Check your inbox — you’ll set a new password the next time you
              sign in.
            </p>
            <button onClick={onClose} style={primaryBtn}>
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} style={{ padding: '18px 24px 24px' }}>
            <div>
              <label style={labelStyle}>Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoCapitalize="none"
                autoCorrect="off"
                autoFocus
                style={inputStyle}
              />
              <p style={helpStyle}>Use the email you sign in with.</p>
            </div>

            <div style={{ marginTop: 14 }}>
              <label style={labelStyle}>
                Message <span style={{ color: '#5d72a0', textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything we should know?"
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
              />
            </div>

            {error && <div style={errorStyle}>{error}</div>}

            <button type="submit" disabled={!canSubmit} style={{ ...primaryBtn, marginTop: 20, opacity: canSubmit ? 1 : 0.6 }}>
              {busy ? 'Sending…' : 'Request password reset'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  background: 'rgba(3,8,20,.7)',
  backdropFilter: 'blur(2px)',
  zIndex: 60,
  animation: 'fadeIn .2s ease',
};

const dialogStyle: CSSProperties = {
  position: 'relative',
  width: 'min(440px, 100%)',
  maxHeight: '92vh',
  overflowY: 'auto',
  background: 'linear-gradient(180deg,#0d1f44,#0b1a3a)',
  border: '1px solid rgba(62,92,152,.4)',
  borderRadius: 16,
  boxShadow: '0 24px 70px rgba(0,0,0,.6)',
  animation: 'popIn .25s ease',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
  padding: '20px 24px 14px',
  borderBottom: '1px solid rgba(62,92,152,.28)',
};

const closeBtn: CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#8ea3cc',
  fontSize: 24,
  lineHeight: 1,
  cursor: 'pointer',
  padding: 0,
  flex: 'none',
};

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 10.5,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  color: '#8ea3cc',
  marginBottom: 7,
};

const helpStyle: CSSProperties = {
  margin: '7px 0 0',
  fontSize: 10.5,
  color: '#6f84b2',
  letterSpacing: '0.2px',
  lineHeight: 1.5,
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '11px 13px',
  fontSize: 14,
  color: '#eef3ff',
  background: 'rgba(6,15,36,.6)',
  border: '1px solid #1d3560',
  borderRadius: 8,
  outline: 'none',
  fontFamily: 'inherit',
};

const primaryBtn: CSSProperties = {
  width: '100%',
  padding: '12px',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: '0.3px',
  color: '#0c2768',
  background: 'linear-gradient(180deg,#EBCB74,#C9A24B)',
};

const errorStyle: CSSProperties = {
  marginTop: 16,
  fontSize: 12.5,
  color: '#ff8a80',
  background: 'rgba(239,84,104,.1)',
  border: '1px solid rgba(239,84,104,.4)',
  borderRadius: 7,
  padding: '9px 12px',
};
