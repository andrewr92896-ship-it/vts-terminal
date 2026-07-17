import { useState, type CSSProperties, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';

// How-did-you-hear options. "Other" reveals a free-text field; whatever is
// chosen (or typed) is sent as the request's `source`.
const SOURCES = [
  'Search engine',
  'Social media',
  'Friend or colleague',
  'Industry event',
  'Other',
] as const;

export function EarlyAccessModal({ onClose }: { onClose: () => void }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [source, setSource] = useState('');
  const [otherSource, setOtherSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const resolvedSource = source === 'Other' ? otherSource.trim() : source;
  const canSubmit =
    !!firstName.trim() && !!email.trim() && !!resolvedSource && !busy;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!firstName.trim()) return setError('Please enter your first name.');
    if (!email.trim()) return setError('Please enter your email address.');
    if (!resolvedSource) return setError('Please tell us how you heard about us.');
    setBusy(true);
    try {
      await api.requestEarlyAccess({
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        email: email.trim(),
        source: resolvedSource,
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
        aria-label="Request early access"
        onClick={(e) => e.stopPropagation()}
        style={dialogStyle}
      >
        <div style={headerStyle}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#eef3ff' }}>Request Early Access</div>
            <div style={{ fontSize: 11.5, color: '#8ea3cc', marginTop: 3 }}>
              Tell us a little about you and we’ll be in touch.
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
            <p style={{ fontSize: 12.5, color: '#8ea3cc', lineHeight: 1.6, margin: '0 auto 20px', maxWidth: 300 }}>
              Thanks{firstName.trim() ? `, ${firstName.trim()}` : ''}. We’ll review your request and reach
              out at <strong style={{ color: '#cfe0ff' }}>{email.trim()}</strong>.
            </p>
            <button onClick={onClose} style={primaryBtn}>
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} style={{ padding: '18px 24px 24px' }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px' }}>
                <label style={labelStyle}>First name</label>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jane"
                  autoFocus
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <label style={labelStyle}>
                  Last name <span style={{ color: '#5d72a0', textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                </label>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Smith"
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <label style={labelStyle}>Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoCapitalize="none"
                autoCorrect="off"
                style={inputStyle}
              />
            </div>

            <div style={{ marginTop: 14 }}>
              <label style={labelStyle}>How did you hear about us?</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">Select one…</option>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {source === 'Other' && (
                <input
                  value={otherSource}
                  onChange={(e) => setOtherSource(e.target.value)}
                  placeholder="Tell us how you found us"
                  style={{ ...inputStyle, marginTop: 10 }}
                />
              )}
            </div>

            {error && <div style={errorStyle}>{error}</div>}

            <button type="submit" disabled={!canSubmit} style={{ ...primaryBtn, marginTop: 20, opacity: canSubmit ? 1 : 0.6 }}>
              {busy ? 'Sending…' : 'Submit request'}
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

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '11px 13px',
  fontSize: 14,
  color: '#eef3ff',
  background: 'rgba(6,15,36,.6)',
  border: '1px solid #1d3560',
  borderRadius: 8,
  outline: 'none',
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
