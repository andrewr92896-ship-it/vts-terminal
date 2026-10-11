import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';

// Shown at sign-in when an admin has marked this account's sign-in address as
// being retired (`mustUpdateEmail`). The account sets the address it wants to
// use from now on, which is also where password resets go.
//
// IT IS SKIPPABLE, AND THAT IS THE POINT. The accounts that meet this screen
// are the ones whose mailbox is already closing, so a hard block would be the
// lockout the whole change exists to avoid — if the form could not be completed
// for any reason, the terminal would be unreachable. "Not now" drops through to
// the terminal and the prompt returns at the next sign-in, because the flag is
// server state and nothing here clears it.
//
// THE ADDRESS IS TYPED TWICE because nothing verifies it. There is no
// confirmation email in this flow, so a typo would silently point password
// recovery at an address nobody holds. Typing it twice is proportionate rather
// than a full verification round trip: with the password known and the code off,
// the cost of a typo is a recovery that would not arrive, which the account can
// sign in and correct.
export function UpdateEmail({ onSkip }: { onSkip: () => void }) {
  const { user, updateProfile } = useAuth();
  const [email, setEmail] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const current = user?.email ?? null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const next = email.trim().toLowerCase();
    if (next !== confirm.trim().toLowerCase()) {
      setError('The two addresses do not match.');
      return;
    }
    if (current && next === current.toLowerCase()) {
      setError('That is the address being shut off. Enter a different one.');
      return;
    }
    setBusy(true);
    try {
      await updateProfile({ email: next });
      setSaved(next);
    } catch (err) {
      // The server refuses an address that would drop the account out of the
      // admission allowlist, and says so — that message is the useful one, so
      // it is shown rather than replaced.
      setError(err instanceof ApiError ? err.message : 'Could not save that address.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={shellStyle}>
      {saved ? (
        <div style={cardStyle}>
          <h1 style={headingStyle}>Sign-in email updated</h1>
          <p style={bodyStyle}>
            Use <strong style={{ color: '#eef3ff' }}>{saved}</strong> to sign in from now on.
            Your password has not changed.
          </p>
          <button type="button" onClick={onSkip} style={primaryStyle}>
            Continue
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} style={cardStyle}>
          <h1 style={headingStyle}>Your sign-in email is being shut off</h1>
          <p style={bodyStyle}>
            {current ? (
              <>
                <strong style={{ color: '#eef3ff' }}>{current}</strong> is being closed. Set the
                address you want to use from now on — it becomes your sign-in, and password
                resets go to it.
              </>
            ) : (
              <>
                This account has no sign-in address. Set the one you want to use — it becomes
                your sign-in, and password resets go to it.
              </>
            )}
          </p>

          <label style={labelStyle}>New email address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
            style={inputStyle}
          />

          <label style={{ ...labelStyle, marginTop: 16 }}>Confirm it</label>
          <input
            type="email"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="email"
            style={inputStyle}
          />

          {error && <div style={errorStyle}>{error}</div>}

          <button
            type="submit"
            disabled={busy || !email || !confirm}
            style={{ ...primaryStyle, opacity: busy || !email || !confirm ? 0.6 : 1 }}
          >
            {busy ? 'Saving...' : 'Save address'}
          </button>

          <button type="button" onClick={onSkip} style={quietStyle}>
            Not now
          </button>
          <p style={{ ...bodyStyle, margin: '10px 0 0', fontSize: 11.5, textAlign: 'center' }}>
            Not now asks again next time you sign in. You can also change it from Settings.
          </p>
        </form>
      )}
    </div>
  );
}

const shellStyle: React.CSSProperties = {
  minHeight: 'var(--app-h)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'radial-gradient(1200px 600px at 70% -10%,#0d2150 0%,#060f24 55%)',
  padding: 24,
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 380,
  background: 'linear-gradient(180deg,rgba(13,31,68,.72),rgba(11,26,58,.8))',
  border: '1px solid rgba(62,92,152,.35)',
  borderRadius: 16,
  padding: '34px 30px',
  boxShadow: '0 20px 60px rgba(0,0,0,.45)',
  animation: 'popIn .4s ease',
};

const headingStyle: React.CSSProperties = {
  margin: '0 0 6px',
  fontSize: 19,
  fontWeight: 700,
  color: '#eef3ff',
  lineHeight: 1.3,
};

const bodyStyle: React.CSSProperties = {
  margin: '0 0 22px',
  fontSize: 12.5,
  color: '#8ea3cc',
  lineHeight: 1.5,
};

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

const primaryStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 24,
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

const quietStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 12,
  padding: '10px',
  border: 'none',
  background: 'transparent',
  color: '#7488b5',
  fontSize: 12.5,
  cursor: 'pointer',
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
