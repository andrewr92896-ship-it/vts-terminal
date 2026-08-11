import { useCallback, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { canAccessWorkspace, hasEntitlement } from '../../auth/access';
import { UpgradeNotice } from '../../components/UpgradeNotice';
import {
  PerUserNotificationsSection,
  PhoneNotificationsSection,
  PushoverSection,
  RepeatTimingSection,
  SendTestSection,
  sectionLabel,
  hintStyle,
} from '../../components/NotificationSettings';
import { usePushNotifications } from '../../push/usePushNotifications';
import { useAlertSound, ALERT_SOUNDS } from '../../sound/alertSound';
import { THEMES, accentGradient } from '../../theme/themes';
import { ScreenTitle } from './ScreenTitle';
import { PriceAlertSettings, SessionAlertSettings } from './alertPanels';

// Advanced Trading ▸ Alert Settings — the ONE home for everything the terminal
// can buzz you about (owner instruction, 2026-08). Before this, the controls
// were scattered: phone alerts, Pushover and the per-trade toggles sat in My
// Terminal ▸ Settings among the device preferences, price alerts sat under them,
// and the session alerts were on the Strategy Sessions screen. Three places to
// look for one job.
//
// Marked PREMIUM in the sidebar (`SECTION_FEATURE.alerts` → `alertSettings`).
// Two panels are deliberately outside that feature and render for any account
// that reaches this screen:
//
//   • Phone notifications — web push takes no credential from anybody, so a
//     free account still gets told when its price alert fires. It is the reason
//     charging for Pushover is honest: what Max buys is the Pushover channel and
//     its sound, never being notified at all.
//   • Price alerts — included with every account for the same reason. An alert
//     nobody can be told about is not an alert.
//
// That is the same split Market Data makes, where the series board is Premium
// and the economic calendar on the same screen is free.
//
// Worth knowing: this screen lives in Advanced Trading, which is an OPT-IN, so
// an account that has not switched the desk on cannot reach the two free panels
// here either. That was the owner's call when the alert controls were
// consolidated; the alternative was leaving them in two places.
export function AlertSettings() {
  const { user } = useAuth();
  const theme = THEMES.trading;
  const accent = accentGradient(theme);
  const accentText = theme.accentText;

  // One push subscription and one Pushover status, owned here and handed to the
  // panels that need them — see PushControls in NotificationSettings.
  const push = usePushNotifications();
  const [pushoverReady, setPushoverReady] = useState(false);
  const onPushoverChange = useCallback((connected: boolean) => setPushoverReady(connected), []);

  const sound = useAlertSound();

  const isDemo = !!user?.isDemo;
  // The desk opt-in. `features` is required, not optional — canAccessWorkspace
  // reads the opt-in off it and answers false for everyone when it is missing.
  const canTrade = !!user && canAccessWorkspace(user.roles, 'trading', user.access.features);
  const paid = hasEntitlement(user, 'alertSettings');

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '4px 0 40px' }}>
      <div style={{ marginBottom: 6 }}>
        <ScreenTitle>Alert Settings</ScreenTitle>
      </div>
      <p style={{ ...hintStyle, marginTop: 0, marginBottom: 22, fontSize: 12.5 }}>
        Every alert the terminal can send you, and how it reaches you.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* The demo never subscribes a device, never holds a Pushover key and
            has every write refused, so all it could show is a column of dead
            controls. It says so instead. */}
        {isDemo && (
          <section>
            <div style={sectionLabel}>Alerts</div>
            <p style={{ ...hintStyle, marginTop: 0 }}>
              The demo account doesn’t send alerts.
            </p>
          </section>
        )}

        {/* ---- Included with every account ---- */}
        {!isDemo && <PhoneNotificationsSection accent={accent} accentText={accentText} push={push} />}

        {!isDemo && (
          <>
            <Divider />
            <PushoverSection accent={accent} accentText={accentText} onConnectedChange={onPushoverChange} />
          </>
        )}

        {/* ---- Premium ---- */}
        {!isDemo && (
          <>
            <Divider />
            {paid ? (
              <SendTestSection
                accent={accent}
                accentText={accentText}
                push={push}
                pushoverReady={pushoverReady}
              />
            ) : (
              <section>
                <div style={sectionLabel}>Send a test</div>
                <UpgradeNotice feature="alertSettings" compact />
              </section>
            )}
          </>
        )}

        {paid && canTrade && !isDemo && (
          <>
            <Divider />
            <PerUserNotificationsSection accent={accent} accentText={accentText} />
            <Divider />
            {/* Directly under the per-event levels, because it is the setting
                the Repeating rung above depends on — reading them apart would
                leave "Repeating" meaning nothing in particular. */}
            <RepeatTimingSection />
          </>
        )}

        {/* The sound this device plays when a TradingView alert arrives. Per
            device, unlike everything above it, which is per account. */}
        {paid && canTrade && !isDemo && (
          <>
            <Divider />
            <TradeAlertSound
              enabled={sound.enabled}
              soundKey={sound.soundKey}
              setEnabled={sound.setEnabled}
              setSoundKey={sound.setSoundKey}
              preview={sound.preview}
            />
          </>
        )}

        {/* Session open / close / pre-open. Moved off the Strategy Sessions
            screen so every alert opt-in reads in one list; the sessions
            themselves are still built and edited there.

            These last two draw their own collapsible headers, so they take no
            sectionLabel — one screen, one name per panel. */}
        {paid && canTrade && !isDemo && (
          <>
            <Divider />
            <SessionAlertSettings />
          </>
        )}

        {/* ---- Included with every account ---- */}
        {!isDemo && (
          <>
            <Divider />
            <PriceAlertSettings />
          </>
        )}
      </div>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: '#1d3560' }} />;
}

// The per-device alert sound. Lifted out of My Terminal ▸ Settings with the rest
// of the alert controls; the picker itself is unchanged.
function TradeAlertSound({
  enabled,
  soundKey,
  setEnabled,
  setSoundKey,
  preview,
}: {
  enabled: boolean;
  soundKey: string;
  setEnabled: (v: boolean) => void;
  setSoundKey: (k: string) => void;
  preview: (k: string) => void;
}) {
  const GOLD = '#EBCB74';
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ ...sectionLabel, marginBottom: 0 }}>Trade alert sound</span>
        <button
          onClick={() => setEnabled(!enabled)}
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            fontWeight: 600,
            color: enabled ? '#35c47b' : '#6f84b0',
            background: 'rgba(0,0,0,.18)',
            border: `1px solid ${enabled ? 'rgba(53,196,123,.35)' : '#16294f'}`,
            padding: '6px 12px',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          {enabled ? 'On' : 'Off'}
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ALERT_SOUNDS.map((s) => {
          const on = s.key === soundKey;
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setSoundKey(s.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flex: '1 1 auto',
                  textAlign: 'left',
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: on ? GOLD : '#eef3ff',
                  background: on ? 'rgba(235,203,116,.1)' : 'rgba(0,0,0,.18)',
                  border: `1px solid ${on ? 'rgba(235,203,116,.35)' : '#16294f'}`,
                  padding: '11px 13px',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    flex: 'none',
                    border: `2px solid ${on ? GOLD : '#6f84b0'}`,
                    background: on ? GOLD : 'transparent',
                  }}
                />
                {s.label}
              </button>
              <button
                onClick={() => preview(s.key)}
                title={`Preview ${s.label}`}
                aria-label={`Preview ${s.label}`}
                style={{
                  flex: 'none',
                  background: 'rgba(255,255,255,.05)',
                  border: '1px solid #16294f',
                  color: '#eef3ff',
                  fontSize: 12,
                  padding: '10px 14px',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                ▶
              </button>
            </div>
          );
        })}
      </div>
      <p style={{ ...hintStyle, marginTop: 12, marginBottom: 0 }}>
        Plays on this device when a new TradingView alert arrives.
      </p>
    </section>
  );
}
