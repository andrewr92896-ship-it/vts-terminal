import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { THEMES } from '../theme/themes';
import { useResponsive } from '../hooks/useMediaQuery';
import { Icon } from '../components/Icon';
import { LegalDocBody, RulesBody } from '../workspaces/help/LegalScreens';
import { TERMS, PRIVACY, LEGAL_EFFECTIVE_DATE, LEGAL_VERSION, COMPANY } from '../legal/content';

// Shown once after login (and again whenever the documents are updated) before
// the terminal loads: the user must review and accept the Terms of Service and
// Privacy Policy to operate the platform. Records acceptance server-side, which
// clears `mustAcceptTerms`. The read-only demo never reaches this screen.
export function AcceptTerms() {
  const { user, acceptTerms, logout } = useAuth();
  const theme = THEMES.help;
  const { isPhone } = useResponsive();
  const [agreed, setAgreed] = useState(false);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Unlock the agree checkbox once the reader has reached the end of the
  // documents — proper clickwrap, a genuine opportunity to review.
  //
  // THIS IS DONE WITH AN INTERSECTION OBSERVER ON A MARKER AT THE END, not by
  // watching a scroll position, and that is the whole fix. The previous version
  // listened for `scroll` on the inner box alone. On a phone the card is taller
  // than the viewport, so the PAGE scrolls and the inner box never does: the
  // handler never fired, the checkbox never enabled, and there was no way off
  // the screen at all. An end marker is indifferent to which element moved — it
  // answers "has the reader got to the bottom", which is the actual question.
  //
  // On a phone there is now no inner scroller either (see the container below),
  // so the marker is observed against the viewport; on a desktop the box is the
  // root. Either way, one scroller and one signal.
  useEffect(() => {
    const marker = endRef.current;
    if (!marker) return;
    // No IntersectionObserver (very old browser) — unlock rather than trap.
    if (typeof IntersectionObserver === 'undefined') {
      setScrolledToEnd(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setScrolledToEnd(true);
      },
      { root: isPhone ? null : scrollRef.current, rootMargin: '0px 0px 64px 0px' },
    );
    observer.observe(marker);
    return () => observer.disconnect();
  }, [isPhone]);

  // Belt and braces: if the documents fit without scrolling at all, there is
  // nothing to scroll to and the observer may never report an intersection
  // change. Unlock immediately in that case.
  useEffect(() => {
    const el = scrollRef.current;
    if (!isPhone && el && el.scrollHeight <= el.clientHeight + 4) setScrolledToEnd(true);
  }, [isPhone]);

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
        // `center` on a card taller than the screen clips its top off with no
        // way to scroll back up. Start it at the top wherever it does not fit.
        alignItems: isPhone ? 'flex-start' : 'center',
        justifyContent: 'center',
        background: theme.pageBg,
        padding: isPhone ? 16 : 24,
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
          // Only cap the card where the inner box is the scroller. On a phone
          // the card is as tall as its content and the page scrolls it.
          ...(isPhone ? null : { maxHeight: 'calc(var(--app-h) - 48px)' }),
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

        {/* Say up front what has to happen. The checkbox at the bottom already
            explains itself, but that is the wrong place for it: somebody who has
            not scrolled yet cannot see it, so they meet a disabled checkbox with
            no idea why. This is the one instruction on the screen and it belongs
            where the reader starts. It disappears once they get there — at that
            point it is telling them to do something they have already done. */}
        {!scrolledToEnd && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              marginBottom: 14,
              padding: '10px 13px',
              borderRadius: 9,
              border: '1px solid rgba(235,203,116,.35)',
              background: 'rgba(235,203,116,.08)',
              fontSize: 12.5,
              lineHeight: 1.5,
              color: '#EBCB74',
            }}
          >
            <Icon name="chevron-down" size={15} color="#EBCB74" />
            <span>Scroll to the bottom to accept.</span>
          </div>
        )}

        {/* On a phone this is NOT a scroller — the page scrolls, which is how
            reading works on a phone and removes the nested-scroll trap that made
            this screen impossible to get past. On a desktop it keeps its own
            scroll area so the buttons stay in view.

            `minHeight: 0` on the desktop branch is load-bearing: a flex child
            defaults to `min-height: auto` and will not shrink below its content,
            so without it the box grows to fit all three documents and pushes the
            controls off the card instead of scrolling. */}
        <div
          ref={scrollRef}
          style={{
            ...(isPhone
              ? { overflow: 'visible' }
              : { flex: 1, minHeight: 0, overflowY: 'auto' }),
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
          {/* The end marker. Reaching this is what unlocks the checkbox. */}
          <div ref={endRef} aria-hidden style={{ height: 1 }} />
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
                Read to the end of the documents to enable this.
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
