import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { BrokerStatus } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { C } from '../../theme/tokens';
import { usePrivacy } from '../../privacy/privacy';
import { useCheckForUpdates } from '../../hooks/useCheckForUpdates';
import { useAuth } from '../../auth/AuthContext';
import { canAccessWorkspace } from '../../auth/access';
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

// My Terminal ▸ Settings. The personal device/account controls that used to live
// under the top-bar settings cog: privacy mode, broker status, the widget and
// broker connections, and "check for updates".
//
// Everything to do with ALERTS left here for Advanced Trading ▸ Alert Settings
// (owner instruction, 2026-08) — phone notifications, Pushover, which trade
// events buzz you, the alert sound and price alerts. One home for the things
// that interrupt you, rather than three.
export function MyPortalSettings({ theme }: { theme: Theme }) {
  const { user } = useAuth();
  const { privacy, toggle: togglePrivacy } = usePrivacy();
  const appUpdate = useCheckForUpdates();

  // `features` is required, not optional — canAccessWorkspace reads the desk
  // opt-in off it and answers false for everyone when it is missing.
  const canTrade = !!user && canAccessWorkspace(user.roles, 'trading', user.access.features);

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
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Broker status */}
        {hasBrokerStatus && (
          <section style={panel(theme)}>
            <div style={panelLabel}>
              {"Status"}
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
            {"Privacy"}
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
                "Privacy on"
              ) : (
                "Privacy off"
              )}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 11.5, color: C.faint }}>
              {privacy ? (
                "hiding names &amp; $"
              ) : (
                "visible"
              )}
            </span>
          </button>
          <p style={{ margin: '10px 0 0', fontSize: 11.5, color: C.faint, lineHeight: 1.5 }}>
            {"When on, names and dollar amounts are masked across the terminal — useful when sharing your screen. Nothing is changed, only what's shown."}
          </p>
        </section>

        {/* Devices & connections. Everything that BUZZES you — phone alerts,
            Pushover, which trade events reach you, the alert sound and price
            alerts — moved to Advanced Trading ▸ Alert Settings (owner
            instruction, 2026-08), so this panel is now the widget and the
            brokers. It renders nothing at all without the desk opt-in, which is
            why the whole section is hidden in that case rather than drawing an
            empty box. */}
        {canTrade && (
          <section style={panel(theme)}>
            <div style={panelLabel}>
              {"Devices &amp; connections"}
            </div>
            <NotificationsConnectionsPanel theme={theme} />
          </section>
        )}

        {/* App updates */}
        <section style={panel(theme)}>
          <div style={panelLabel}>
            {"App"}
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
