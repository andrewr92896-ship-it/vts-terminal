import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { THEMES } from '../theme/themes';
import { LegalDocBody, RulesBody } from '../workspaces/help/LegalScreens';
import { TERMS, PRIVACY, LEGAL_EFFECTIVE_DATE, LEGAL_VERSION, COMPANY } from '../legal/content';

// Shown once after login (and again whenever the documents are updated) before
// the portal loads: the user must review and accept the Terms of Service and
// Privacy Policy to operate the platform. Records acceptance server-side, which
// clears `mustAcceptTerms`. The read-only demo never reaches this screen.
export function AcceptTerms() {
  const { user, acceptTerms, logout } = useAuth();
  const theme = THEMES.help;
  const [agreed, setAgreed] = useState(false);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Enable the agree checkbox only once the user has scrolled through the
  // documents (proper clickwrap: a genuine opportunity to review). If the
  // content somehow fits without scrolling, unlock immediately.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 4) setScrolledToEnd(true);
  }, []);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) setScrolledToEnd(true);
  }

  async function onAccept() {
    if (!agreed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await acceptTerms();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record your acceptance. Please try again.');
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: 'var(--app-h)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: theme.pageBg,
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 880,
          background: 'linear-gradient(180deg,rgba(13,31,68,.72),rgba(11,26,58,.8))',
          border: '1px solid rgba(62,92,152,.35)',
          borderRadius: 16,
          padding: '28px 26px',
          boxShadow: '0 20px 60px rgba(0,0,0,.45)',
          animation: 'popIn .4s ease',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(var(--app-h) - 48px)',
        }}
      >
        <h1 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700, color: '#eef3ff' }}>
          Review & accept to continue
        </h1>
        <p style={{ margin: '0 0 4px', fontSize: 12.5, color: '#8ea3cc', lineHeight: 1.55 }}>
          Welcome{user ? `, ${user.displayName.split(' ')[0]}` : ''}. Before using {COMPANY.product}, please
          review the Rules &amp; Conduct, the Terms of Service, and the Privacy Policy below. You must agree to
          continue. You can reopen these any time from Site Help.
        </p>
        <div
          style={{
            margin: '4px 0 14px',
            fontSize: 10.5,
            color: '#7488b5',
            fontFamily: "'IBM Plex Mono', monospace",
            letterSpacing: '0.3px',
          }}
        >
          {COMPANY.entity} · Effective {LEGAL_EFFECTIVE_DATE} · v{LEGAL_VERSION}
        </div>

        <div
          ref={scrollRef}
          onScroll={onScroll}
          style={{
            flex: 1,
            minHeight: 220,
            overflowY: 'auto',
            padding: '18px 20px',
            borderRadius: 12,
            border: `1px solid ${theme.navBorder}`,
            background: 'rgba(6,15,36,.5)',
          }}
        >
          <RulesBody theme={theme} />
          <div style={{ height: 28 }} />
          <LegalDocBody doc={TERMS} theme={theme} />
          <div style={{ height: 28 }} />
          <LegalDocBody doc={PRIVACY} theme={theme} />
        </div>

        {error && (
          <div
            style={{
              marginTop: 14,
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

        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            marginTop: 16,
            fontSize: 13,
            lineHeight: 1.5,
            color: scrolledToEnd ? '#dfe7fa' : '#6f82ab',
            cursor: scrolledToEnd ? 'pointer' : 'default',
          }}
        >
          <input
            type="checkbox"
            checked={agreed}
            disabled={!scrolledToEnd}
            onChange={(e) => setAgreed(e.target.checked)}
            style={{ marginTop: 2, width: 17, height: 17, flex: 'none', accentColor: theme.accent }}
          />
          <span>
            I have read and agree to the Terms of Service and the Privacy Policy, and I understand that {COMPANY.product}{' '}
            is an informational and educational tool only and does not provide financial or investment advice.
            {!scrolledToEnd && (
              <span style={{ display: 'block', fontSize: 11, color: '#7488b5', marginTop: 3 }}>
                Scroll through the documents above to enable this.
              </span>
            )}
          </span>
        </label>

        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => void onAccept()}
            disabled={!agreed || busy}
            style={{
              flex: 1,
              minWidth: 200,
              padding: '12px',
              border: 'none',
              borderRadius: 8,
              cursor: !agreed || busy ? 'default' : 'pointer',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.3px',
              color: theme.accentText,
              background: `linear-gradient(180deg,${theme.accent},${theme.accent2})`,
              opacity: !agreed || busy ? 0.55 : 1,
            }}
          >
            {busy ? 'Saving…' : 'Agree & Continue'}
          </button>
          <button
            type="button"
            onClick={() => logout()}
            disabled={busy}
            style={{
              padding: '12px 18px',
              border: `1px solid ${theme.navBorder}`,
              background: 'transparent',
              borderRadius: 8,
              color: '#9fb0d6',
              fontSize: 13,
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            Decline & sign out
          </button>
        </div>
      </div>
    </div>
  );
}
