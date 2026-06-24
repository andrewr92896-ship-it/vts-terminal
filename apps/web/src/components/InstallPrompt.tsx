import { useEffect, useState } from 'react';
import { type Theme, accentGradient } from '../theme/themes';
import { useResponsive } from '../hooks/useMediaQuery';

// The browser fires this before showing its own install prompt. We capture it
// so the portal can offer a one-tap "Install" button at the moment of our
// choosing (Android, desktop Chrome and Edge). iOS Safari never fires it.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Remember a dismissal so the banner never nags after the user closes it.
const DISMISS_KEY = 'vts-install-dismissed';

// True when the portal is already running as an installed app, so there is
// nothing to offer. Covers Android/desktop (display-mode) and iOS (standalone).
function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches;
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return Boolean(standalone || iosStandalone);
}

// iPhone and iPad, where install is a manual Share -> Add to Home Screen step
// because Apple gives no programmatic install. iPadOS reports as a Mac with a
// touch screen, so we treat that as iOS too.
function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iphone = /iPad|iPhone|iPod/.test(ua);
  const ipadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return iphone || ipadOs;
}

// Mobile-only "Install app" banner. It is additive and self-contained: it shows
// only on phones and tablets, only when the app is not already installed, and
// only when installation is actually possible. The desktop experience is never
// touched. On Android it triggers the real one-tap install (Chrome builds a
// WebAPK, so it lands in the app drawer like a native app); on iOS it expands
// the short Share -> Add to Home Screen steps.
export function InstallPrompt({ theme }: { theme: Theme }) {
  const { isTablet } = useResponsive();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(isInstalled);
  const [showIosSteps, setShowIosSteps] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(DISMISS_KEY) === '1';
  });

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      // Stop the browser's own mini-infobar so our banner is the single prompt.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const ios = isIos();
  // Show only on narrow screens, only when not installed or dismissed, and only
  // when we can actually help: a captured install event, or an iOS device.
  const canOffer = Boolean(deferred) || ios;
  if (!isTablet || installed || dismissed || !canOffer) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Private mode can block storage. The banner just reappears next visit.
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    // The event can be used only once; drop it either way.
    setDeferred(null);
  }

  const accentGrad = accentGradient(theme);

  return (
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        margin: '12px 14px 0',
        background: '#0c1c3c',
        border: `1px solid ${theme.navBorder}`,
        borderRadius: 12,
        padding: '12px 14px',
        boxShadow: '0 10px 30px rgba(0,0,0,.35)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <img
          src="/icon-192.png"
          alt=""
          aria-hidden
          style={{ width: 40, height: 40, borderRadius: 9, flex: 'none' }}
        />
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#eef3ff' }}>Install VTS Portal</div>
          <div style={{ fontSize: 11.5, color: '#9fb0d6', marginTop: 2 }}>
            Add it to your home screen to open it full screen, like an app.
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          style={{
            background: 'none',
            border: 'none',
            color: '#7488b5',
            fontSize: 20,
            lineHeight: 1,
            cursor: 'pointer',
            flex: 'none',
            padding: 4,
          }}
        >
          ×
        </button>
      </div>

      {deferred ? (
        // Android, desktop Chrome and Edge: real one-tap install.
        <button
          onClick={install}
          style={{
            marginTop: 12,
            width: '100%',
            fontSize: 13,
            fontWeight: 700,
            color: theme.accentText,
            background: accentGrad,
            border: 'none',
            padding: '11px 14px',
            borderRadius: 8,
            cursor: 'pointer',
            letterSpacing: '0.2px',
          }}
        >
          Install app
        </button>
      ) : (
        // iOS Safari: no programmatic install, so guide the manual steps.
        <>
          <button
            onClick={() => setShowIosSteps((v) => !v)}
            style={{
              marginTop: 12,
              width: '100%',
              fontSize: 13,
              fontWeight: 700,
              color: theme.accentText,
              background: accentGrad,
              border: 'none',
              padding: '11px 14px',
              borderRadius: 8,
              cursor: 'pointer',
              letterSpacing: '0.2px',
            }}
          >
            {showIosSteps ? 'Hide steps' : 'How to install'}
          </button>
          {showIosSteps && (
            <ol
              style={{
                margin: '12px 0 2px',
                paddingLeft: 20,
                fontSize: 12.5,
                lineHeight: 1.55,
                color: '#cfe0ff',
              }}
            >
              <li>
                Tap the Share button in Safari (the square with an arrow pointing up).
              </li>
              <li>
                Scroll down and tap <strong>Add to Home Screen</strong>.
              </li>
              <li>
                Tap <strong>Add</strong>, then open VTS Portal from your home screen.
              </li>
            </ol>
          )}
        </>
      )}
    </div>
  );
}
