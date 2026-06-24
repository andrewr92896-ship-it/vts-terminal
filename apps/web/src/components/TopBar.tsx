import { useState, type CSSProperties } from 'react';
import type { BrokerStatus, RoleKey, User } from '../api/types';
import {
  type Theme,
  type WorkspaceKey,
  type BrandMeta,
  accentGradient,
  WORKSPACE_LABELS,
} from '../theme/themes';
import { ALL_ROLES, ROLE_LABELS, canAccessWorkspace, isAdmin, rolesSummary } from '../auth/access';
import { useResponsive } from '../hooks/useMediaQuery';
import { usePrivacy } from '../privacy/privacy';
import { useDealership } from '../workspaces/kia/dealership';
import { useAlertSound, ALERT_SOUNDS } from '../sound/alertSound';
import { APP_VERSION } from '../meta/version';
import { Clock } from './Clock';

interface TopBarProps {
  user: User;
  effectiveRoles: RoleKey[];
  actingRole: RoleKey | null;
  workspace: WorkspaceKey;
  workspaces: WorkspaceKey[];
  theme: Theme;
  brand: BrandMeta;
  brokers: BrokerStatus[];
  onSwitchWorkspace: (ws: WorkspaceKey) => void;
  onOpenClaude: () => void;
  onOpenAccount: () => void;
  onOpenAdmin: () => void;
  onSetActingRole: (r: RoleKey | null) => void;
  onLogout: () => void;
}

function brokerDotColor(status: BrokerStatus['status']): string {
  switch (status) {
    case 'live':
      return '#35c47b';
    case 'pending':
      return '#f2994a';
    case 'error':
      return '#ef5468';
    default:
      return '#52617f'; // unconfigured
  }
}

export function TopBar(props: TopBarProps) {
  const {
    user,
    effectiveRoles,
    actingRole,
    workspace,
    workspaces,
    theme,
    brand,
    brokers,
    onSwitchWorkspace,
    onOpenClaude,
    onOpenAccount,
    onOpenAdmin,
    onSetActingRole,
    onLogout,
  } = props;

  const [menuOpen, setMenuOpen] = useState(false);
  // Secondary controls (privacy, trade-alert sound, broker status, clock on
  // narrow) all live behind a single settings (gear) dropdown to keep the row
  // tidy. The admin "view as role" preview list is a collapsible sub-section
  // inside the user menu so it stays out of the way until needed.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewAsOpen, setViewAsOpen] = useState(false);
  const { isPhone, isTablet } = useResponsive();
  const { privacy, toggle: togglePrivacy } = usePrivacy();
  const sound = useAlertSound();
  // The trade-alert sound is only for users who can see the Trading workspace
  // (full traders and view-only traders); nobody else gets the control or hears it.
  const canTrade = canAccessWorkspace(effectiveRoles, 'trading');
  const dealership = useDealership();
  // In the Kia workspace the sub-label follows the dealership-name toggle.
  const brandSub = workspace === 'kia' ? dealership.name : brand.sub;
  // "narrow" = phones and small tablets. We restructure the single crowded row
  // into stacked rows + a scrollable workspace switcher so nothing overflows.
  const narrow = isTablet;
  const accentGrad = accentGradient(theme);
  const isTrading = workspace === 'trading';
  const userName = user.displayName.split(' ')[0] || user.username;

  // Brand block (wordmark image or styled text).
  const brandEl = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
      {brand.wordmark ? (
        <img
          src={brand.wordmark}
          alt={brand.sub}
          style={{ height: narrow ? 28 : 34, display: 'block' }}
        />
      ) : (
        <div style={{ lineHeight: 1.05, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 800,
              fontSize: isPhone ? '17px' : brand.size,
              letterSpacing: isPhone ? '1px' : brand.letterSpacing,
              color: brand.color,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {brand.name(userName)}
          </div>
          <div
            style={{
              fontSize: 9,
              letterSpacing: '2px',
              textTransform: 'uppercase',
              color: '#8ea3cc',
              marginTop: 3,
              whiteSpace: 'nowrap',
            }}
          >
            {brandSub}
          </div>
        </div>
      )}
    </div>
  );

  // Workspace switcher. On narrow screens it becomes a full-width, horizontally
  // scrollable tab row with comfortable (>=44px) tap targets.
  const workspaceNav = (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: narrow ? 6 : 4,
        ...(narrow
          ? {
              width: '100%',
              // min-width:0 + max-width:100% stop this scrollable flex child
              // from expanding to its content's intrinsic width (a flex item's
              // default min-width:auto), which would otherwise widen the whole
              // header past the viewport instead of scrolling within the row.
              minWidth: 0,
              maxWidth: '100%',
              overflowX: 'auto',
              flexWrap: 'nowrap',
              WebkitOverflowScrolling: 'touch',
              paddingBottom: 2,
            }
          : {
              // On desktop the switcher also scrolls within its own space when
              // the row is tight (e.g. an admin sees every workspace on a
              // landscape tablet), so it never pushes the right-side controls
              // off the edge.
              minWidth: 0,
              overflowX: 'auto',
              flexWrap: 'nowrap',
            }),
      }}
    >
      {workspaces.map((w) => {
        const active = w === workspace;
        return (
          <button
            key={w}
            onClick={() => onSwitchWorkspace(w)}
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 12.5,
              letterSpacing: '0.5px',
              padding: narrow ? '11px 15px' : '7px 14px',
              borderRadius: 5,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              flex: 'none',
              whiteSpace: 'nowrap',
              color: active ? theme.accentText : '#8ea3cc',
              background: active ? accentGrad : 'transparent',
            }}
          >
            {WORKSPACE_LABELS[w]}
          </button>
        );
      })}
      <span
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: '0.5px',
          color: theme.accent,
          border: `1px solid ${theme.accent}`,
          borderRadius: 4,
          padding: '2px 7px',
          opacity: 0.75,
          marginLeft: 6,
          flex: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {APP_VERSION}
      </span>
    </nav>
  );

  const canAdmin = isAdmin(effectiveRoles);

  // Shared menu-item styles (used by the settings and user dropdowns).
  const moreItemBtn: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    width: '100%',
    textAlign: 'left',
    background: 'transparent',
    border: 'none',
    color: '#cfe0ff',
    fontSize: 12.5,
    fontWeight: 600,
    padding: '9px 8px',
    borderRadius: 6,
    cursor: 'pointer',
  };
  const moreLabel: CSSProperties = {
    fontSize: 9.5,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    color: '#6f84b2',
  };

  // Ask Claude stays a first-class button on the bar at every width.
  const askClaudeBtn = (
    <button
      onClick={onOpenClaude}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        flex: 'none',
        fontSize: 12.5,
        fontWeight: 600,
        color: theme.accentText,
        background: accentGrad,
        border: 'none',
        padding: narrow ? '10px 13px' : '8px 14px',
        borderRadius: 6,
        cursor: 'pointer',
        letterSpacing: '0.2px',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: theme.accentText }} />
      Ask Claude
    </button>
  );

  // Settings (gear) dropdown: privacy, trade-alert sound, broker status, plus
  // the time on narrow screens (where there is no room for an inline clock).
  const showClockInMenu = narrow;
  const hasStatus = showClockInMenu || (isTrading && brokers.length > 0);
  const settingsMenu = (
    <div style={{ position: 'relative', flex: 'none' }}>
      <button
        onClick={() => setSettingsOpen((v) => !v)}
        aria-label="Settings"
        title="Settings: privacy, alerts, status"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: narrow ? 40 : 36,
          height: narrow ? 40 : 36,
          fontSize: 17,
          lineHeight: 1,
          color: settingsOpen ? theme.accent : '#cfe0ff',
          background: 'rgba(0,0,0,.18)',
          border: `1px solid ${settingsOpen ? theme.accent : '#2a4170'}`,
          borderRadius: 8,
          cursor: 'pointer',
        }}
      >
        ⚙
      </button>

      {settingsOpen && (
        <>
          <div onClick={() => setSettingsOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 10px)',
              minWidth: 250,
              background: '#0c1c3c',
              border: '1px solid #1d3560',
              borderRadius: 10,
              boxShadow: '0 16px 40px rgba(0,0,0,.5)',
              padding: 10,
              zIndex: 41,
              maxHeight: '70vh',
              overflowY: 'auto',
            }}
          >
            {hasStatus && (
              <div style={{ padding: '2px 6px 8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={moreLabel}>Status</span>
                  {showClockInMenu && <Clock compact />}
                </div>
                {isTrading && brokers.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
                    {brokers.map((b) => (
                      <span
                        key={b.key}
                        title={`${b.name} (${b.platform}): ${
                          b.status === 'unconfigured' ? 'Not configured yet (Stage 2)' : b.status
                        }`}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: '#8ea3cc', fontFamily: "'IBM Plex Mono', monospace" }}
                      >
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: brokerDotColor(b.status),
                            animation: b.status === 'live' ? 'livePulse 2.4s infinite' : 'none',
                          }}
                        />
                        {b.short}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={hasStatus ? { borderTop: '1px solid #1d3560', paddingTop: 6 } : undefined}>
              <button onClick={togglePrivacy} style={moreItemBtn}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: privacy ? '#e0a23a' : '#6f84b2', flex: 'none' }} />
                {privacy ? 'Privacy on' : 'Privacy off'}
                <span style={{ marginLeft: 'auto', fontSize: 10, color: '#6f84b2' }}>
                  {privacy ? 'hiding names and $' : 'visible'}
                </span>
              </button>
            </div>

            {canTrade && (
              <div style={{ borderTop: '1px solid #1d3560', marginTop: 6, paddingTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px 8px' }}>
                  <span style={moreLabel}>Trade alert sound</span>
                  <button
                    onClick={() => sound.setEnabled(!sound.enabled)}
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 10,
                      fontWeight: 600,
                      color: sound.enabled ? '#35c47b' : '#6f84b2',
                      background: 'rgba(0,0,0,.18)',
                      border: `1px solid ${sound.enabled ? 'rgba(53,196,123,.3)' : '#2a4170'}`,
                      padding: '5px 10px',
                      borderRadius: 6,
                      cursor: 'pointer',
                    }}
                  >
                    {sound.enabled ? 'On' : 'Off'}
                  </button>
                </div>
                {ALERT_SOUNDS.map((s) => {
                  const on = s.key === sound.soundKey;
                  return (
                    <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        onClick={() => sound.setSoundKey(s.key)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 9,
                          flex: '1 1 auto',
                          textAlign: 'left',
                          background: on ? 'rgba(235,203,116,.1)' : 'transparent',
                          border: 'none',
                          color: on ? '#EBCB74' : '#cfe0ff',
                          fontSize: 12.5,
                          padding: '8px',
                          borderRadius: 6,
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ width: 12, height: 12, borderRadius: '50%', flex: 'none', border: `2px solid ${on ? '#EBCB74' : '#52617f'}`, background: on ? '#EBCB74' : 'transparent' }} />
                        {s.label}
                      </button>
                      <button
                        onClick={() => sound.preview(s.key)}
                        title={`Preview ${s.label}`}
                        aria-label={`Preview ${s.label}`}
                        style={{ flex: 'none', background: 'rgba(255,255,255,.05)', border: '1px solid #2a4170', color: '#cfe0ff', fontSize: 11, padding: '6px 9px', borderRadius: 6, cursor: 'pointer' }}
                      >
                        ▶
                      </button>
                    </div>
                  );
                })}
                <div style={{ fontSize: 10.5, color: '#6f84b2', padding: '8px 8px 2px', lineHeight: 1.45 }}>
                  Plays on this device when a new TradingView alert arrives.
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );

  // User / role badge with dropdown.
  const userBadge = (
    <div style={{ position: 'relative', flex: 'none' }}>
      <button
        onClick={() => setMenuOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'linear-gradient(135deg,#143FA0,#0A2A6B)',
            border: `1px solid ${theme.accent}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'IBM Plex Mono', monospace",
            fontWeight: 600,
            fontSize: 13,
            color: theme.accent,
            flex: 'none',
          }}
        >
          {userName.charAt(0).toUpperCase()}
        </div>
        <div style={{ lineHeight: 1.2, textAlign: 'left' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#eef3ff' }}>{userName}</div>
          <div
            style={{
              fontSize: 9.5,
              color: theme.accent,
              letterSpacing: '0.6px',
              textTransform: 'uppercase',
            }}
          >
            {rolesSummary(effectiveRoles)}
            {actingRole ? ' · preview' : ''}
          </div>
        </div>
      </button>

      {menuOpen && (
        <>
          <div
            onClick={() => setMenuOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
          />
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 10px)',
              minWidth: 220,
              background: '#0c1c3c',
              border: '1px solid #1d3560',
              borderRadius: 10,
              boxShadow: '0 16px 40px rgba(0,0,0,.5)',
              padding: 8,
              zIndex: 41,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: '#7488b5',
                padding: '6px 8px 8px',
              }}
            >
              Signed in as <strong style={{ color: '#cfe0ff' }}>{user.username}</strong>
              <br />
              Roles: {rolesSummary(user.roles)}
            </div>

            {/* Admin tools live inside the user menu now, not on the bar. */}
            {canAdmin && (
              <div style={{ borderTop: '1px solid #1d3560', paddingTop: 6, marginTop: 4 }}>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenAdmin();
                  }}
                  style={{ ...moreItemBtn, fontWeight: 600 }}
                >
                  User management
                </button>
              </div>
            )}

            {/* "View as role" is a collapsible sub-section so the role list
                stays tucked away until an admin actually wants to preview. */}
            {isAdmin(user.roles) && (
              <div style={{ borderTop: '1px solid #1d3560', paddingTop: 6, marginTop: 6 }}>
                <button
                  onClick={() => setViewAsOpen((v) => !v)}
                  style={{ ...moreItemBtn, fontWeight: 600 }}
                >
                  View as role
                  {actingRole && (
                    <span style={{ fontSize: 10, color: '#EBCB74' }}>· {ROLE_LABELS[actingRole]}</span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#6f84b2' }}>
                    {viewAsOpen ? '▴' : '▾'}
                  </span>
                </button>
                {viewAsOpen && (
                  <div style={{ marginTop: 2 }}>
                    <button
                      onClick={() => {
                        onSetActingRole(null);
                        setMenuOpen(false);
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        background: !actingRole ? 'rgba(235,203,116,.1)' : 'transparent',
                        border: 'none',
                        color: !actingRole ? '#EBCB74' : '#cfe0ff',
                        fontSize: 12.5,
                        padding: '8px 8px 8px 18px',
                        borderRadius: 6,
                        cursor: 'pointer',
                      }}
                    >
                      My access (all my roles)
                    </button>
                    {ALL_ROLES.map((r) => {
                      const on = actingRole === r;
                      return (
                        <button
                          key={r}
                          onClick={() => {
                            onSetActingRole(on ? null : r);
                            setMenuOpen(false);
                          }}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            background: on ? 'rgba(235,203,116,.1)' : 'transparent',
                            border: 'none',
                            color: on ? '#EBCB74' : '#cfe0ff',
                            fontSize: 12.5,
                            padding: '8px 8px 8px 18px',
                            borderRadius: 6,
                            cursor: 'pointer',
                          }}
                        >
                          {ROLE_LABELS[r]}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div style={{ borderTop: '1px solid #1d3560', paddingTop: 6, marginTop: 6 }}>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onOpenAccount();
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  color: '#cfe0ff',
                  fontSize: 12.5,
                  fontWeight: 600,
                  padding: '8px',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                Account settings
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  color: '#ff8a80',
                  fontSize: 12.5,
                  fontWeight: 600,
                  padding: '8px',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  // Narrow layout: stacked rows. The header is not sticky here (it scrolls
  // away) — the TabBar takes over as the sticky bar so the variable header
  // height never has to be reconciled with the tab row's offset.
  if (narrow) {
    return (
      <header
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: isPhone ? '10px 14px' : '12px 18px',
          background: theme.headerBg,
          borderBottom: `1px solid ${theme.headerBorder}`,
          position: 'relative',
          zIndex: 30,
          // Constrain the header to the viewport. We deliberately do NOT clip
          // overflow here — the flex children below carry min-width:0 so the
          // scrollable switcher scrolls within its own row, and clipping would
          // also cut off the absolutely-positioned user-badge dropdown.
          width: '100%',
          maxWidth: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            minWidth: 0,
            maxWidth: '100%',
          }}
        >
          {brandEl}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
            {askClaudeBtn}
            {settingsMenu}
            {userBadge}
          </div>
        </div>
        {workspaceNav}
      </header>
    );
  }

  // Desktop layout — unchanged.
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 24,
        padding: '0 26px',
        height: 62,
        background: theme.headerBg,
        borderBottom: `1px solid ${theme.headerBorder}`,
        position: 'sticky',
        top: 0,
        zIndex: 30,
      }}
    >
      {/* Left: brand + workspace switcher + version pill. Shrinks (and the
          switcher scrolls) so it never pushes the right group off-screen. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 30, minWidth: 0, flex: '1 1 auto' }}>
        {brandEl}
        {workspaceNav}
      </div>

      {/* Right: a small clock, Ask Claude, a settings (gear) dropdown that holds
          privacy / alerts / broker status, and the user badge (with admin tools
          and role preview inside it). flex:none keeps the badge fully visible. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 'none' }}>
        <Clock compact />
        {askClaudeBtn}
        {settingsMenu}
        {userBadge}
      </div>
    </header>
  );
}
