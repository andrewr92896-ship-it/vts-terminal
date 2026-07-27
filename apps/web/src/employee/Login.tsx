import { useState, type FormEvent, type ReactNode } from 'react';
import { EmployeeApiError, employeeApi, setCsrfToken, type EmployeeMe } from './api';
import { EMP, RADIUS, SHADOW } from './theme';
import { T } from './copy';
import { Button, ErrorNote, Field, Input } from './ui';
import { Icon } from '../components/Icon';

// The employee portal's front door.
//
// This is a *second* sign-in, not a continuation of the main portal's. Someone
// already signed in at vitalistradingsystems.com arrives here signed out, on
// purpose: the two surfaces share an account and nothing else. The form asks for
// a password first and reveals the authenticator field only once the server says
// that account has a second factor enrolled — so the page never confirms whether
// an address exists before the password is right.

export function EmployeeLogin({
  onSignedIn,
  onEnrollNeeded,
}: {
  onSignedIn: (me: EmployeeMe) => void;
  onEnrollNeeded: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needCode, setNeedCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await employeeApi.login(email.trim(), password, needCode ? code.trim() : undefined);
      setCsrfToken(res.csrfToken);
      if (res.status === 'enroll_required') {
        onEnrollNeeded();
        return;
      }
      if (res.me) onSignedIn(res.me);
    } catch (err) {
      const apiErr = err as EmployeeApiError;
      if (apiErr.need === 'totp') {
        // The password checked out; the account wants its second factor. Only
        // show a message if we were already asking — the first time through,
        // revealing the field is explanation enough.
        setError(needCode ? apiErr.message : '');
        setNeedCode(true);
        setCode('');
      } else {
        setError(apiErr.message || 'Sign-in failed');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <Field label={<T id="emp.login.email">Work email</T>}>
          <Input
            value={email}
            onChange={setEmail}
            type="email"
            autoComplete="username"
            placeholder="you@vitalistradingsystems.com"
            autoFocus
            disabled={needCode}
          />
        </Field>
        <Field label={<T id="emp.login.password">Password</T>}>
          <Input
            value={password}
            onChange={setPassword}
            type="password"
            autoComplete="current-password"
            disabled={needCode}
          />
        </Field>

        {needCode && (
          <Field
            label={<T id="emp.login.code">Authenticator code</T>}
            hint={
              <T id="emp.login.code_hint">
                Six digits from your authenticator app. A single-use recovery code works here too.
              </T>
            }
          >
            <Input
              value={code}
              onChange={setCode}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={16}
              autoFocus
              placeholder="000000"
              style={{ fontFamily: EMP.mono, letterSpacing: '3px', fontSize: 16 }}
            />
          </Field>
        )}

        <ErrorNote>{error}</ErrorNote>

        <Button type="submit" variant="primary" disabled={busy} style={{ padding: '11px 15px' }}>
          {busy ? (
            <T id="emp.login.busy">Checking…</T>
          ) : needCode ? (
            <T id="emp.login.verify">Verify and enter</T>
          ) : (
            <T id="emp.login.submit">Sign in</T>
          )}
        </Button>

        {needCode && (
          <button
            type="button"
            onClick={() => {
              setNeedCode(false);
              setCode('');
              setError('');
            }}
            style={{
              background: 'none',
              border: 'none',
              color: EMP.faint,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: EMP.sans,
            }}
          >
            <T id="emp.login.back">Start over</T>
          </button>
        )}
      </form>
    </Shell>
  );
}

// The two-factor enrollment walkthrough, shown once — after a first correct
// password on an account that has no authenticator yet. There is no way past it:
// the session issued at that point can reach these endpoints and nothing else.
export function EmployeeEnroll({ onEnrolled }: { onEnrolled: (me: EmployeeMe) => void }) {
  const [secret, setSecret] = useState('');
  const [otpauth, setOtpauth] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [me, setMe] = useState<EmployeeMe | null>(null);
  const [started, setStarted] = useState(false);

  async function begin() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await employeeApi.beginEnroll();
      setSecret(res.secret);
      setOtpauth(res.otpauthUrl);
      setStarted(true);
    } catch (err) {
      setError((err as EmployeeApiError).message || 'Could not start setup');
    } finally {
      setBusy(false);
    }
  }

  async function complete(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await employeeApi.completeEnroll(code.trim());
      setRecovery(res.recoveryCodes);
      setMe(res.me);
    } catch (err) {
      setError((err as EmployeeApiError).message || 'That code is not valid');
    } finally {
      setBusy(false);
    }
  }

  // Step 3 — the recovery codes, shown exactly once.
  if (recovery && me) {
    return (
      <Shell title="Save your recovery codes">
        <p style={{ margin: '0 0 14px', fontSize: 12.5, color: EMP.muted, lineHeight: 1.65 }}>
          <T id="emp.enroll.recovery_blurb">
            These are shown once and never again. Each one signs you in a single time if you lose your
            phone. Keep them somewhere only you can reach.
          </T>
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 8,
            fontFamily: EMP.mono,
            fontSize: 13,
            color: EMP.text,
            background: EMP.panel2,
            border: `1px solid ${EMP.line2}`,
            borderRadius: RADIUS.control,
            padding: 14,
            marginBottom: 14,
          }}
        >
          {recovery.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            onClick={() => {
              void navigator.clipboard?.writeText(recovery.join('\n'));
            }}
          >
            <Icon name="copy" size={14} />
            <T id="emp.enroll.copy_codes">Copy codes</T>
          </Button>
          <Button variant="primary" onClick={() => onEnrolled(me)}>
            <T id="emp.enroll.done">I have saved them — continue</T>
          </Button>
        </div>
      </Shell>
    );
  }

  // Step 2 — pair the app and confirm with a live code.
  if (started) {
    return (
      <Shell title="Set up your authenticator">
        <p style={{ margin: '0 0 14px', fontSize: 12.5, color: EMP.muted, lineHeight: 1.65 }}>
          <T id="emp.enroll.blurb">
            Add this key to an authenticator app (1Password, Authy, Google Authenticator), then type the
            six digits it shows to confirm the pairing.
          </T>
        </p>
        <div style={{ marginBottom: 14 }}>
          <Field label={<T id="emp.enroll.key">Setup key</T>}>
            <div
              style={{
                fontFamily: EMP.mono,
                fontSize: 14,
                letterSpacing: '2px',
                color: EMP.forest,
                background: EMP.panel2,
                border: `1px solid ${EMP.line2}`,
                borderRadius: RADIUS.control,
                padding: '11px 12px',
                wordBreak: 'break-all',
              }}
            >
              {secret.replace(/(.{4})/g, '$1 ').trim()}
            </div>
          </Field>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <Button
              onClick={() => {
                void navigator.clipboard?.writeText(secret);
              }}
            >
              <Icon name="copy" size={14} />
              <T id="emp.enroll.copy_key">Copy key</T>
            </Button>
            <Button
              onClick={() => {
                void navigator.clipboard?.writeText(otpauth);
              }}
              title="The otpauth:// URI, for apps that accept a pasted link"
            >
              <Icon name="external-link" size={14} />
              <T id="emp.enroll.copy_link">Copy setup link</T>
            </Button>
          </div>
        </div>

        <form onSubmit={complete} style={{ display: 'grid', gap: 12 }}>
          <Field label={<T id="emp.enroll.confirm">Confirmation code</T>}>
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
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <T id="emp.enroll.busy">Confirming…</T> : <T id="emp.enroll.submit">Confirm</T>}
          </Button>
        </form>
      </Shell>
    );
  }

  // Step 1 — explain why this is happening before asking for anything.
  return (
    <Shell title="Two-factor setup required">
      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: EMP.muted, lineHeight: 1.65 }}>
        <T id="emp.enroll.intro">
          The employee portal requires a second factor. Set one up now — it takes about a minute, and
          you will need it every time you sign in here.
        </T>
      </p>
      <ErrorNote>{error}</ErrorNote>
      <Button variant="primary" onClick={begin} disabled={busy} style={{ marginTop: error ? 12 : 0 }}>
        {busy ? <T id="emp.enroll.starting">Starting…</T> : <T id="emp.enroll.start">Begin setup</T>}
      </Button>
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
            <T id="emp.login.eyebrow">Vitalis Trading Systems</T>
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
            {title ? title : <T id="emp.login.title">Employee Portal</T>}
          </h1>
          {!title && (
            <p style={{ margin: '8px 0 0', fontSize: 12.5, color: EMP.muted, lineHeight: 1.6 }}>
              <T id="emp.login.subtitle">
                A separate, secured area with its own sign-in. Your main portal session does not carry
                over.
              </T>
            </p>
          )}
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
            <T id="emp.login.back_to_portal">← Back to the main portal</T>
          </a>
        </div>
      </div>
    </div>
  );
}
