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
// Routing is state-based, matching the main portal's convention — the URL stays
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
  // Labelled by default. The rail collapses to icons on request, but a portal
  // this small should never make someone hover six unlabelled glyphs to find
  // out what is in it.
  const [navOpen, setNavOpen] = useState(true);
  // Where the outstanding sign-in code went, and whether it actually sent.
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [codeDelivered, setCodeDelivered] = useState(true);
  // 30 straight after a send; 0 when a reload resumed a flow already in progress.
  const [codeCooldown, setCodeCooldown] = useState(30);
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
        // A reload mid-code lands back on the code screen rather than starting
        // the whole sign-in again — the pending session is still good.
        setCodeSentTo(s.sentTo ?? null);
        setCodeDelivered(true);
        setCodeCooldown(0);
        setPhase('verifying');
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
          setCodeCooldown(30);
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
        initialCooldown={codeCooldown}
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
      {/* Top bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 22px',
          background: EMP.forest,
          color: EMP.onDark,
          position: 'sticky',
          top: 0,
          zIndex: 20,
        }}
      >
        <button
          onClick={() => setNavOpen((v) => !v)}
          aria-label="Toggle navigation"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: RADIUS.control,
            border: '1px solid rgba(255,255,255,.22)',
            background: 'rgba(255,255,255,.1)',
            color: EMP.onDark,
            cursor: 'pointer',
          }}
        >
          <Icon name={navOpen ? 'panel-left-close' : 'panel-left-open'} size={15} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
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
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {"Employee Portal"}
          </span>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              color: '#ffffff',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 180,
            }}
          >
            {me.name}
          </span>
          <a
            href="/"
            title="Main portal"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
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
            }}
          >
            <Icon name="log-out" size={14} />
            {"Sign out"}
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Sidebar — collapses to a top strip on narrow screens */}
        <nav
          style={{
            width: navOpen ? 216 : 60,
            flex: 'none',
            borderRight: `1px solid ${EMP.line}`,
            background: EMP.panel,
            padding: navOpen ? '16px 12px' : '16px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            transition: 'width .18s ease',
          }}
        >
          {items.map((item) => {
            const active = item.key === screen;
            return (
              <button
                key={item.key}
                onClick={() => setScreen(item.key)}
                title={item.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: navOpen ? '9px 11px' : '9px 0',
                  justifyContent: navOpen ? 'flex-start' : 'center',
                  borderRadius: RADIUS.control,
                  border: '1px solid transparent',
                  borderColor: active ? tint(EMP.accent, 0.28) : 'transparent',
                  background: active ? tint(EMP.accent, 0.09) : 'transparent',
                  color: active ? EMP.accent : EMP.muted,
                  cursor: 'pointer',
                  fontSize: 12.5,
                  fontFamily: EMP.sans,
                  fontWeight: active ? 600 : 500,
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <Icon name={item.icon} size={16} />
                {navOpen && (
                  <span>
                    {item.label}
                  </span>
                )}
              </button>
            );
          })}

          <div
            style={{
              marginTop: 'auto',
              paddingTop: 12,
              borderTop: `1px solid ${EMP.lineSoft}`,
              textAlign: navOpen ? 'left' : 'center',
            }}
          >
            <span style={{ fontFamily: EMP.sans, fontSize: 10, fontWeight: 700, color: EMP.faint, letterSpacing: '0.8px' }}>
              {navOpen ? "SECURE ZONE" : '●'}
            </span>
          </div>
        </nav>

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
    </div>
  );
}
