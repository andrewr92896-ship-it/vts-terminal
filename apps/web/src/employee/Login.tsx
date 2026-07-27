import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { EmployeeApiError, employeeApi, setCsrfToken, type EmployeeMe } from './api';
import { EMP, RADIUS, SHADOW } from './theme';
import { Button, ErrorNote, Field, Input } from './ui';
import { Icon } from '../components/Icon';

// The employee portal's front door.
//
// This is a *second* sign-in, not a continuation of the main portal's. Someone
// already signed in at vitalistradingsystems.com arrives here signed out, on
// purpose: the two surfaces share an account and nothing else.
//
// Two steps: a password, then a six-digit code emailed to the account's company
// address. The code screen only ever appears once the password is right, so the
// page never confirms whether an address exists before then — and the code goes
// to the address on the account, not the one typed into the form.

export function EmployeeLogin({
  onSignedIn,
  onCodeSent,
}: {
  onSignedIn: (me: EmployeeMe) => void;
  onCodeSent: (sentTo: string | null, delivered: boolean) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await employeeApi.login(email.trim(), password);
      setCsrfToken(res.csrfToken);
      if (res.status === 'code_sent') {
        onCodeSent(res.sentTo ?? null, res.delivered !== false);
        return;
      }
      if (res.me) onSignedIn(res.me);
    } catch (err) {
      setError((err as EmployeeApiError).message || 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <Field label={"Work email"}>
          <Input
            value={email}
            onChange={setEmail}
            type="email"
            autoComplete="username"
            placeholder="you@vitalistradingsystems.com"
            autoFocus
          />
        </Field>
        <Field label={"Password"}>
          <Input value={password} onChange={setPassword} type="password" autoComplete="current-password" />
        </Field>

        <ErrorNote>{error}</ErrorNote>

        <Button type="submit" variant="primary" disabled={busy} style={{ padding: '11px 15px' }}>
          {busy ? "Checking…" : "Sign in"}
        </Button>
      </form>
    </Shell>
  );
}

// Step two: the code that was emailed to the employee's company address.
//
// This is not an enrollment wizard — there is nothing to set up. The password
// has been accepted, a six-digit code is already in their inbox, and this screen
// exists to take it back. The session behind it can reach these two endpoints
// and nothing else until the code is right.
export function EmployeeVerify({
  sentTo,
  delivered,
  rememberDays,
  onVerified,
  onStartOver,
}: {
  sentTo: string | null;
  delivered: boolean;
  rememberDays: number;
  onVerified: (me: EmployeeMe) => void;
  onStartOver: () => void;
}) {
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  // Matches the server's resend cooldown, so the button is only live when a
  // resend would actually be accepted.
  const [cooldown, setCooldown] = useState(30);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNote('');
    try {
      const res = await employeeApi.verifyCode(code.trim(), remember);
      onVerified(res.me);
    } catch (err) {
      setError((err as EmployeeApiError).message || 'That code is not valid');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (busy || cooldown > 0) return;
    setBusy(true);
    setError('');
    setNote('');
    try {
      const res = await employeeApi.resendCode();
      setNote(res.delivered ? 'A new code is on its way.' : 'Could not send the code — tell a portal administrator.');
      setCooldown(30);
    } catch (err) {
      const e = err as EmployeeApiError;
      setError(e.message || 'Could not send another code');
      if (e.retryAfter) setCooldown(e.retryAfter);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Check your email">
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: EMP.muted, lineHeight: 1.65 }}>
        {sentTo
          ? `We sent a six-digit code to ${sentTo}. It expires shortly and works once.`
          : 'We sent a six-digit code to your work address. It expires shortly and works once.'}
      </p>

      {!delivered && (
        <div style={{ marginBottom: 14 }}>
          <ErrorNote>
            {"The code could not be emailed. Ask a portal administrator to check the mail settings."}
          </ErrorNote>
        </div>
      )}

      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <Field label={"Sign-in code"}>
          <Input
            value={code}
            onChange={setCode}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            placeholder="000000"
            style={{ fontFamily: EMP.mono, letterSpacing: '3px', fontSize: 16 }}
          />
        </Field>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            fontSize: 12.5,
            color: EMP.muted,
            cursor: 'pointer',
            lineHeight: 1.5,
          }}
        >
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            style={{ flex: 'none' }}
          />
          <span>{`Remember this device for ${rememberDays} days — skip the code next time. Your password is still required.`}</span>
        </label>

        <ErrorNote>{error}</ErrorNote>
        {note && (
          <div style={{ fontSize: 12, color: EMP.muted }}>{note}</div>
        )}

        <Button type="submit" variant="primary" disabled={busy || code.trim().length < 6}>
          {busy ? "Checking…" : "Verify and enter"}
        </Button>

        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={resend}
            disabled={busy || cooldown > 0}
            style={{
              background: 'none',
              border: 'none',
              color: cooldown > 0 ? EMP.faint : EMP.accent,
              fontSize: 12,
              cursor: cooldown > 0 ? 'default' : 'pointer',
              fontFamily: EMP.sans,
              padding: 0,
            }}
          >
            {cooldown > 0 ? `Send a new code (${cooldown}s)` : 'Send a new code'}
          </button>
          <button
            type="button"
            onClick={onStartOver}
            style={{
              background: 'none',
              border: 'none',
              color: EMP.faint,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: EMP.sans,
              padding: 0,
            }}
          >
            {"Start over"}
          </button>
        </div>
      </form>
    </Shell>
  );
}

// The centred, chrome-free frame both flows sit in. No sidebar, no navigation:
// there is nothing to navigate to until you are through the door.
function Shell({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: EMP.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 18px',
        fontFamily: EMP.sans,
      }}
    >
      <div style={{ width: '100%', maxWidth: 430 }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: RADIUS.card,
              margin: '0 auto 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              // Forest, not terracotta: this badge is the page's one dark
              // anchor, the same role the masthead plays once you are inside.
              background: EMP.forest,
              color: EMP.apricot,
            }}
          >
            <Icon name="shield-check" size={22} />
          </div>
          <div
            style={{
              fontFamily: EMP.sans,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '1.4px',
              textTransform: 'uppercase',
              color: EMP.accent,
              marginBottom: 8,
            }}
          >
            {"Vitalis Trading Systems"}
          </div>
          <h1
            style={{
              margin: 0,
              fontFamily: EMP.serif,
              fontSize: 24,
              fontWeight: 700,
              color: EMP.text,
            }}
          >
            {title ? title : "Employee Portal"}
          </h1>
        </div>

        <div
          style={{
            background: EMP.panel,
            border: `1px solid ${EMP.line}`,
            borderRadius: RADIUS.card,
            padding: 24,
            boxShadow: SHADOW.popover,
          }}
        >
          {children}
        </div>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <a
            href="/"
            style={{
              color: EMP.faint,
              fontSize: 11.5,
              textDecoration: 'none',
              fontFamily: EMP.sans,
            }}
          >
            {"← Back to the main portal"}
          </a>
        </div>
      </div>
    </div>
  );
}
