import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { BrokerStatus } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { C } from '../../theme/tokens';
import { usePrivacy } from '../../privacy/privacy';
import { useAlertSound, ALERT_SOUNDS } from '../../sound/alertSound';
import { useCheckForUpdates } from '../../hooks/useCheckForUpdates';
import { useAuth } from '../../auth/AuthContext';
import { canAccessWorkspace } from '../../auth/access';
import { EditableText } from '../../copy/SiteCopy';
import { NotificationsConnectionsPanel } from '../../components/DeviceSettings';
import { SectionHeader, panel, panelLabel } from '../admin/adminUi';

function brokerDotColor(status: BrokerStatus['status']): string {
  switch (status) {
    case 'live':
      return C.green;
    case 'pending':
      return C.amber;
    case 'error':
      return C.red;
    default:
      return C.faint;
  }
}

// My Portal ▸ Settings. Home of the personal device/account controls that used
// to live under the top-bar settings cog: privacy mode, the trade-alert sound,
// broker status, notifications & connections, and the "check for updates"
// action. All of these are per-user / per-device and persist locally, so they
// belong to the user's own workspace rather than a global menu.
export function MyPortalSettings({ theme }: { theme: Theme }) {
  const { user } = useAuth();
  const { privacy, toggle: togglePrivacy } = usePrivacy();
  const sound = useAlertSound();
  const appUpdate = useCheckForUpdates();

  const canTrade = !!user && canAccessWorkspace(user.roles, 'trading');

  const [brokers, setBrokers] = useState<BrokerStatus[]>([]);
  useEffect(() => {
    if (!canTrade) {
      setBrokers([]);
      return;
    }
    let alive = true;
    api
      .brokerStatus()
      .then((r) => alive && setBrokers(r.brokers))
      .catch(() => {
        /* ignore — the status strip simply stays hidden */
      });
    return () => {
      alive = false;
    };
  }, [canTrade]);

  const hasBrokerStatus = canTrade && brokers.length > 0;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 20px 40px' }}>
      <SectionHeader
        title="Settings"
        subtitle="Your personal device and connection preferences. These are saved for you and, where noted, for this device only."
        titleId="my_settings.title"
        subtitleId="my_settings.subtitle"
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Broker status */}
        {hasBrokerStatus && (
          <section style={panel(theme)}>
            <div style={panelLabel}>
              <EditableText id="my_settings.status.label">Status</EditableText>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {brokers.map((b) => (
                <span
                  key={b.key}
                  title={`${b.name} (${b.platform}): ${
                    b.status === 'unconfigured' ? 'Not configured yet' : b.status
                  }`}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted, fontFamily: C.mono }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: brokerDotColor(b.status),
                      animation: b.status === 'live' ? 'livePulse 2.4s infinite' : 'none',
                    }}
                  />
                  {b.short}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Privacy mode */}
        <section style={panel(theme)}>
          <div style={panelLabel}>
            <EditableText id="my_settings.privacy.label">Privacy</EditableText>
          </div>
          <button
            onClick={togglePrivacy}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              width: '100%',
              textAlign: 'left',
              background: 'rgba(0,0,0,.18)',
              border: `1px solid ${theme.navBorder}`,
              borderRadius: 8,
              padding: '12px 14px',
              cursor: 'pointer',
              color: C.text,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: privacy ? C.amber : C.faint,
                flex: 'none',
              }}
            />
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>
              {privacy ? (
                <EditableText id="my_settings.privacy.on">Privacy on</EditableText>
              ) : (
                <EditableText id="my_settings.privacy.off">Privacy off</EditableText>
              )}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 11.5, color: C.faint }}>
              {privacy ? (
                <EditableText id="my_settings.privacy.on_hint">hiding names &amp; $</EditableText>
              ) : (
                <EditableText id="my_settings.privacy.off_hint">visible</EditableText>
              )}
            </span>
          </button>
          <p style={{ margin: '10px 0 0', fontSize: 11.5, color: C.faint, lineHeight: 1.5 }}>
            <EditableText id="my_settings.privacy.help">
              When on, names and dollar amounts are masked across the portal — useful when sharing
              your screen. Nothing is changed, only what's shown.
            </EditableText>
          </p>
        </section>

        {/* Trade alert sound */}
        {canTrade && (
          <section style={panel(theme)}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ ...panelLabel, marginBottom: 0 }}>
                <EditableText id="my_settings.sound.label">Trade alert sound</EditableText>
              </span>
              <button
                onClick={() => sound.setEnabled(!sound.enabled)}
                style={{
                  fontFamily: C.mono,
                  fontSize: 11,
                  fontWeight: 600,
                  color: sound.enabled ? C.green : C.faint,
                  background: 'rgba(0,0,0,.18)',
                  border: `1px solid ${sound.enabled ? 'rgba(53,196,123,.35)' : theme.navBorder}`,
                  padding: '6px 12px',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                {sound.enabled ? (
                  <EditableText id="my_settings.sound.on">On</EditableText>
                ) : (
                  <EditableText id="my_settings.sound.off">Off</EditableText>
                )}
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ALERT_SOUNDS.map((s) => {
                const on = s.key === sound.soundKey;
                return (
                  <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => sound.setSoundKey(s.key)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        flex: '1 1 auto',
                        textAlign: 'left',
                        fontSize: 13.5,
                        fontWeight: 500,
                        color: on ? C.gold : C.text,
                        background: on ? 'rgba(235,203,116,.1)' : 'rgba(0,0,0,.18)',
                        border: `1px solid ${on ? 'rgba(235,203,116,.35)' : theme.navBorder}`,
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
                          border: `2px solid ${on ? C.gold : C.faint}`,
                          background: on ? C.gold : 'transparent',
                        }}
                      />
                      {s.label}
                    </button>
                    <button
                      onClick={() => sound.preview(s.key)}
                      title={`Preview ${s.label}`}
                      aria-label={`Preview ${s.label}`}
                      style={{
                        flex: 'none',
                        background: 'rgba(255,255,255,.05)',
                        border: `1px solid ${theme.navBorder}`,
                        color: C.text,
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
            <p style={{ margin: '12px 0 0', fontSize: 11.5, color: C.faint, lineHeight: 1.5 }}>
              <EditableText id="my_settings.sound.help">
                Plays on this device when a new TradingView alert arrives.
              </EditableText>
            </p>
          </section>
        )}

        {/* Notifications & connections */}
        <section style={panel(theme)}>
          <div style={panelLabel}>
            <EditableText id="my_settings.connections.label">Notifications &amp; connections</EditableText>
          </div>
          <NotificationsConnectionsPanel theme={theme} />
        </section>

        {/* App updates */}
        <section style={panel(theme)}>
          <div style={panelLabel}>
            <EditableText id="my_settings.app.label">App</EditableText>
          </div>
          <button
            onClick={() => void appUpdate.run()}
            disabled={appUpdate.state === 'checking' || appUpdate.state === 'applying'}
            title="Check for a new version and update this device"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'rgba(0,0,0,.18)',
              border: `1px solid ${theme.navBorder}`,
              borderRadius: 8,
              padding: '11px 14px',
              fontSize: 13,
              fontWeight: 600,
              color: C.text,
              cursor:
                appUpdate.state === 'checking' || appUpdate.state === 'applying' ? 'default' : 'pointer',
            }}
          >
            {appUpdate.state === 'checking'
              ? 'Checking…'
              : appUpdate.state === 'applying'
                ? 'Updating…'
                : appUpdate.state === 'uptodate'
                  ? 'You’re on the latest ✓'
                  : appUpdate.state === 'error'
                    ? 'Couldn’t check — try again'
                    : 'Check for updates'}
          </button>
        </section>
      </div>
    </div>
  );
}
