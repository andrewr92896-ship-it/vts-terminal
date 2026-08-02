import { useCallback, useEffect, useState } from 'react';
import { employeeApi, setCsrfToken, type EmployeeMe } from './api';
import { EMP, RADIUS, tint } from './theme';
import { EmployeeLogin, EmployeeVerify } from './Login';
import { Overview } from './screens/Overview';
import { Directory } from './screens/Directory';
import { Announcements } from './screens/Announcements';
import { Documents } from './screens/Documents';
import { Security } from './screens/Security';
import { People } from './screens/People';
import { Icon } from '../components/Icon';

// The employee portal's shell.
//
// Routing is state-based, matching the main terminal's convention — the URL stays
// /employee. That is the point: /employee is one hardened surface with one
// entry, not a set of addressable pages. What *is* URL-separated is the portal
// itself, which is a different bundle served from a different HTML entry with a
// different session behind it.

type Screen = 'overview' | 'directory' | 'announcements' | 'documents' | 'security' | 'people';

interface NavItem {
  key: Screen;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

// Labels are the bundled defaults; each is editable under `emp.nav.<key>`.
const NAV: NavItem[] = [
  { key: 'overview', label: 'Overview', icon: 'briefcase' },
  { key: 'directory', label: 'Directory', icon: 'users' },
  { key: 'announcements', label: 'Announcements', icon: 'megaphone' },
  { key: 'documents', label: 'Documents', icon: 'file-text' },
  { key: 'security', label: 'Security', icon: 'shield-check' },
  { key: 'people', label: 'People', icon: 'user-plus', adminOnly: true },
];

type Phase = 'loading' | 'signed_out' | 'verifying' | 'ready';

export function EmployeeApp() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [me, setMe] = useState<EmployeeMe | null>(null);
  const [screen, setScreen] = useState<Screen>('overview');
  // Where the outstanding sign-in code went, and whether it actually sent.
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [codeDelivered, setCodeDelivered] = useState(true);
  const [rememberDays, setRememberDays] = useState(30);

  // Bootstrap: ask the server whether this browser already holds an employee
  // session. The answer is authoritative — nothing about the signed-in state is
  // kept in storage on the device.
  const bootstrap = useCallback(async () => {
    try {
      const s = await employeeApi.session();
      if (!s.authenticated) {
        setCsrfToken(null);
        setMe(null);
        setPhase('signed_out');
        return;
      }
      setCsrfToken(s.csrfToken ?? null);
      if (s.rememberDays) setRememberDays(s.rememberDays);
      if (s.stage === 'pending_2fa') {
        // Opening the portal starts a sign-in from the beginning, always.
        //
        // A pending session is half a sign-in: the password is spent but the
        // code is not in yet. Resuming one on page load meant coming back to
        // /employee later dropped you on a code screen referring to a code that
        // had almost certainly expired — and it left that half-authenticated
        // state addressable for the session's full lifetime. Ending it here
        // costs one password re-entry and makes the front door predictable:
        // arriving at /employee always shows the sign-in form.
        await employeeApi.logout().catch(() => {});
        setCsrfToken(null);
        setMe(null);
        setPhase('signed_out');
        return;
      }
      setMe(s.me ?? null);
      setPhase(s.me ? 'ready' : 'signed_out');
    } catch {
      setCsrfToken(null);
      setPhase('signed_out');
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // The session has a hard idle timeout server-side. Re-checking on tab focus
  // means an expired session shows the sign-in screen straight away rather than
  // failing on the next click.
  useEffect(() => {
    if (phase !== 'ready') return;
    function onFocus() {
      void employeeApi.session().then((s) => {
        if (!s.authenticated) {
          setCsrfToken(null);
          setMe(null);
          setPhase('signed_out');
        }
      }).catch(() => {});
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [phase]);

  async function signOut() {
    try {
      await employeeApi.logout();
    } catch {
      // Even if the call fails, drop everything on this side.
    }
    setCsrfToken(null);
    setMe(null);
    setScreen('overview');
    setPhase('signed_out');
  }

  if (phase === 'loading') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: EMP.bg,
          color: EMP.muted,
          fontFamily: EMP.sans,
          fontSize: 12.5,
          letterSpacing: '0.5px',
        }}
      >
        Opening employee portal…
      </div>
    );
  }

  if (phase === 'signed_out') {
    return (
      <EmployeeLogin
        onSignedIn={(user) => {
          setMe(user);
          setPhase('ready');
        }}
        onCodeSent={(sentTo, delivered) => {
          setCodeSentTo(sentTo);
          setCodeDelivered(delivered);
          setPhase('verifying');
        }}
      />
    );
  }

  if (phase === 'verifying') {
    return (
      <EmployeeVerify
        sentTo={codeSentTo}
        delivered={codeDelivered}
        rememberDays={rememberDays}
        onVerified={(user) => {
          setMe(user);
          setPhase('ready');
        }}
        onStartOver={() => {
          // Drop the pending session outright, so an abandoned attempt does not
          // sit there holding a live code.
          void employeeApi.logout().catch(() => {});
          setCsrfToken(null);
          setCodeSentTo(null);
          setPhase('signed_out');
        }}
      />
    );
  }

  if (!me) return null;

  const items = NAV.filter((n) => !n.adminOnly || me.isPortalAdmin);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: EMP.bg,
        color: EMP.text,
        fontFamily: EMP.sans,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top bar — the masthead and the navigation, in one band across the top.
          There is no side rail and nothing here scrolls sideways: every row is
          `flexWrap: 'wrap'`, so when the window is too narrow to hold a row the
          bar grows *taller* and the items reflow onto another line. Labels are
          never abbreviated or clipped to an ellipsis — a nav item you cannot
          read in full is a nav item you have to guess at, and the whole bar is
          six words wide, so there is always room to spend a line on it. */}
      <header
        style={{
          background: EMP.forest,
          color: EMP.onDark,
          position: 'sticky',
          top: 0,
          zIndex: 20,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '10px 14px',
            padding: '12px 22px 10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ color: EMP.apricot, display: 'flex' }}>
              <Icon name="shield-check" size={17} />
            </span>
            <span
              style={{
                fontFamily: EMP.serif,
                fontSize: 17,
                fontWeight: 600,
                letterSpacing: '0.2px',
                whiteSpace: 'nowrap',
              }}
            >
              {"Employee Portal"}
            </span>
          </div>

          <div
            style={{
              marginLeft: 'auto',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 10,
            }}
          >
            <span
              style={{
                fontSize: 13.5,
                fontWeight: 700,
                color: '#ffffff',
                minWidth: 0,
                // Left free to wrap. A name long enough to fill the bar takes a
                // second line rather than an ellipsis — the flex line-breaking
                // moves it whole first, so an ordinary name never splits.
                overflowWrap: 'anywhere',
              }}
            >
              {me.name}
            </span>
            <a
              href="/"
              title="Main terminal"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                flex: 'none',
                borderRadius: RADIUS.control,
                border: '1px solid rgba(255,255,255,.22)',
                color: EMP.onDark,
                textDecoration: 'none',
              }}
            >
              <Icon name="external-link" size={15} />
            </a>
            <button
              onClick={signOut}
              title="Sign out of the employee portal"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 12px',
                borderRadius: RADIUS.control,
                border: '1px solid rgba(255,255,255,.22)',
                background: 'rgba(255,255,255,.1)',
                color: EMP.onDark,
                cursor: 'pointer',
                fontSize: 12.5,
                fontWeight: 600,
                fontFamily: EMP.sans,
                whiteSpace: 'nowrap',
              }}
            >
              <Icon name="log-out" size={14} />
              {"Sign out"}
            </button>
          </div>
        </div>

        <nav
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 6,
            padding: '9px 22px 11px',
            borderTop: '1px solid rgba(255,255,255,.11)',
          }}
        >
          {items.map((item) => {
            const active = item.key === screen;
            return (
              <button
                key={item.key}
                onClick={() => setScreen(item.key)}
                aria-current={active ? 'page' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flex: 'none',
                  padding: '7px 12px',
                  borderRadius: RADIUS.control,
                  border: `1px solid ${active ? tint(EMP.apricot, 0.5) : 'rgba(255,255,255,.14)'}`,
                  background: active ? 'rgba(255,255,255,.13)' : 'transparent',
                  color: active ? EMP.apricot : EMP.onDarkMuted,
                  cursor: 'pointer',
                  fontSize: 12.5,
                  fontFamily: EMP.sans,
                  fontWeight: active ? 600 : 500,
                  // The label carries the whole meaning of the control, so it is
                  // never truncated. `nowrap` keeps a two-word item whole; the
                  // bar wraps around it instead of breaking it.
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon name={item.icon} size={15} />
                <span>{item.label}</span>
              </button>
            );
          })}

          <span
            style={{
              marginLeft: 'auto',
              fontFamily: EMP.sans,
              fontSize: 10,
              fontWeight: 700,
              color: 'rgba(255,255,255,.42)',
              letterSpacing: '0.8px',
              whiteSpace: 'nowrap',
            }}
          >
            {"SECURE ZONE"}
          </span>
        </nav>
      </header>

      <main style={{ flex: 1, minWidth: 0, padding: '24px 28px 44px', overflowX: 'hidden' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          {screen === 'overview' && <Overview onNavigate={(s) => setScreen(s as Screen)} />}
          {screen === 'directory' && <Directory />}
          {screen === 'announcements' && <Announcements canManage={me.isPortalAdmin} />}
          {screen === 'documents' && <Documents canManage={me.isPortalAdmin} />}
          {screen === 'security' && <Security me={me} onMeChanged={setMe} />}
          {screen === 'people' && me.isPortalAdmin && <People myUserId={me.userId} />}
        </div>
      </main>
    </div>
  );
}
