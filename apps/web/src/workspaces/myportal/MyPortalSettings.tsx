import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import type { BrokerStatus } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { C } from '../../theme/tokens';
import { usePrivacy } from '../../privacy/privacy';
import { useCheckForUpdates } from '../../hooks/useCheckForUpdates';
import { useAuth } from '../../auth/AuthContext';
import { canAccessFunded, canAccessWorkspace, workspacesForRoles } from '../../auth/access';
import { homeOptions, pickInitialWorkspace, resolveHome } from '../../theme/homeScreen';
import { NotificationsConnectionsPanel } from '../../components/DeviceSettings';
import { SectionHeader, panel, panelLabel } from '../admin/adminUi';

// Which screen the terminal opens on. Two pickers rather than one long list of
// every screen in the terminal: the workspace narrows it, and the pair is what
// gets stored anyway (a section key means nothing without its workspace).
//
// The options come from `homeOptions` — the same function the launcher resolves
// through — so this can never offer a screen that would not actually open.
function HomePagePicker({ theme }: { theme: Theme }) {
  const { user, refreshUser } = useAuth();
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const options = useMemo(() => {
    if (!user) return [];
    return homeOptions(workspacesForRoles(user.roles, user.access.features), {
      canFunded: !user.isDemo && canAccessFunded(user.access.features),
      canTeams: !!user.access.features.tradingTeams,
    });
  }, [user]);

  // What is in force right now, which is not the same as what is stored: a
  // stored screen the account can no longer reach falls back, and the picker
  // should show where you will actually land rather than a choice that is no
  // longer honoured.
  const current = useMemo(
    () =>
      user
        ? resolveHome(user, options, pickInitialWorkspace(workspacesForRoles(user.roles, user.access.features)))
        : null,
    [user, options],
  );

  const chosen = !!user?.homeWorkspace && !!user?.homeScreen;

  async function save(homeWorkspace: string | null, homeScreen: string | null) {
    setStatus('saving');
    try {
      await api.updateProfile({ homeWorkspace, homeScreen });
      // Re-read the user so the launcher and this picker agree immediately
      // rather than at the next sign-in.
      await refreshUser();
      setStatus('saved');
      window.setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 1800);
    } catch {
      setStatus('error');
    }
  }

  if (!user || !current || options.length === 0) return null;

  const ws = options.find((o) => o.workspace === current.workspace) ?? options[0];

  const select: React.CSSProperties = {
    background: 'rgba(0,0,0,.18)',
    border: `1px solid ${theme.navBorder}`,
    borderRadius: 8,
    color: C.text,
    fontSize: 13.5,
    padding: '10px 12px',
    outline: 'none',
    cursor: 'pointer',
    width: '100%',
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ flex: '1 1 180px', minWidth: 160, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11.5, color: C.faint }}>
          {"Workspace"}
          <select
            value={ws.workspace}
            onChange={(e) => {
              const next = options.find((o) => o.workspace === e.target.value);
              if (!next) return;
              // Changing workspace re-points the section too — the old section
              // key belongs to a different workspace and would not resolve.
              void save(next.workspace, next.sections[0]?.key ?? null);
            }}
            style={select}
          >
            {options.map((o) => (
              <option key={o.workspace} value={o.workspace}>{o.label}</option>
            ))}
          </select>
        </label>
        <label style={{ flex: '1 1 180px', minWidth: 160, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11.5, color: C.faint }}>
          {"Section"}
          <select
            value={current.screen}
            onChange={(e) => void save(ws.workspace, e.target.value)}
            style={select}
          >
            {ws.sections.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, color: status === 'error' ? '#ffb4ab' : C.faint, minHeight: 14 }}>
          {status === 'saving'
            ? 'Saving…'
            : status === 'saved'
              ? 'Saved'
              : status === 'error'
                ? 'Could not save — try again.'
                : chosen
                  ? 'Opens here when you launch the terminal.'
                  : 'Not set — the terminal opens where it always has.'}
        </span>
        {chosen && (
          <button
            onClick={() => void save(null, null)}
            style={{
              marginLeft: 'auto',
              background: 'rgba(255,255,255,.05)',
              border: `1px solid ${theme.navBorder}`,
              borderRadius: 7,
              color: C.muted,
              fontSize: 11.5,
              fontWeight: 600,
              padding: '7px 12px',
              cursor: 'pointer',
            }}
          >
            {"Reset to default"}
          </button>
        )}
      </div>
    </>
  );
}

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

        {/* Home page */}
        <section style={panel(theme)}>
          <div style={panelLabel}>
            {"Home page"}
          </div>
          <HomePagePicker theme={theme} />
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
