import { useState } from 'react';
import type { BrokerStatus, RoleKey, User } from '../api/types';
import {
  type Theme,
  type WorkspaceKey,
  type BrandMeta,
  accentGradient,
  WORKSPACE_LABELS,
} from '../theme/themes';
import { ALL_ROLES, ROLE_LABELS, isAdmin, rolesSummary } from '../auth/access';
import { useResponsive } from '../hooks/useMediaQuery';
import { usePrivacy } from '../privacy/privacy';
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
  soundOn: boolean;
  onSwitchWorkspace: (ws: WorkspaceKey) => void;
  onToggleSound: () => void;
  onOpenClaude: () => void;
  onOpenAccount: () => void;
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
    soundOn,
    onSwitchWorkspace,
    onToggleSound,
    onOpenClaude,
    onOpenAccount,
    onSetActingRole,
    onLogout,
  } = props;

  const [menuOpen, setMenuOpen] = useState(false);
  const { isPhone, isTablet } = useResponsive();
  const { privacy, toggle: togglePrivacy } = usePrivacy();
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
            {brand.sub}
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
          : {}),
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
        Pre-Alpha V 0.2
      </span>
    </nav>
  );

  // Secondary controls: broker dots (Trading), clock, sound, Ask Claude.
  const controls = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: narrow ? 12 : 18,
        ...(narrow ? { flexWrap: 'wrap', minWidth: 0, maxWidth: '100%' } : {}),
      }}
    >
      {isTrading && brokers.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 13,
            paddingRight: 16,
            borderRight: '1px solid #234584',
          }}
        >
          {brokers.map((b) => (
            <span
              key={b.key}
              title={`${b.name} (${b.platform}) — ${
                b.status === 'unconfigured' ? 'Not configured yet (Stage 2)' : b.status
              }`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 10.5,
                color: '#8ea3cc',
                fontFamily: "'IBM Plex Mono', monospace",
              }}
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

      <Clock />

      <button
        onClick={togglePrivacy}
        title="Privacy mode — hide customer names and dollar amounts for demos"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 10,
          letterSpacing: '0.4px',
          color: privacy ? '#e0a23a' : '#6f84b2',
          background: privacy ? 'rgba(224,162,58,.12)' : 'rgba(0,0,0,.18)',
          border: `1px solid ${privacy ? 'rgba(224,162,58,.45)' : '#2a4170'}`,
          padding: narrow ? '11px 13px' : '7px 11px',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: privacy ? '#e0a23a' : '#6f84b2',
          }}
        />
        {privacy ? 'PRIVACY ON' : 'PRIVACY'}
      </button>

      <button
        onClick={onToggleSound}
        title="Trade-alert sound"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 10,
          letterSpacing: '0.4px',
          color: soundOn ? '#35c47b' : '#6f84b2',
          background: 'rgba(0,0,0,.18)',
          border: `1px solid ${soundOn ? 'rgba(53,196,123,.3)' : '#2a4170'}`,
          padding: narrow ? '11px 13px' : '7px 11px',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: soundOn ? '#35c47b' : '#6f84b2',
          }}
        />
        {soundOn ? 'ALERTS ON' : 'MUTED'}
      </button>

      <button
        onClick={onOpenClaude}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          fontSize: 12.5,
          fontWeight: 600,
          color: theme.accentText,
          background: accentGrad,
          border: 'none',
          padding: narrow ? '11px 14px' : '8px 14px',
          borderRadius: 6,
          cursor: 'pointer',
          letterSpacing: '0.2px',
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: theme.accentText,
          }}
        />
        Ask Claude
      </button>
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

            {isAdmin(user.roles) && (
              <div style={{ borderTop: '1px solid #1d3560', paddingTop: 8, marginTop: 4 }}>
                <div
                  style={{
                    fontSize: 9.5,
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                    color: '#6f84b2',
                    padding: '2px 8px 6px',
                  }}
                >
                  View as role (preview)
                </div>
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
                    padding: '8px',
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
                        padding: '8px',
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
          {userBadge}
        </div>
        {controls}
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
      {/* Left: brand + workspace switcher + version pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
        {brandEl}
        {workspaceNav}
      </div>

      {/* Right: broker dots, clock, alerts, Ask Claude, user badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        {controls}
        {userBadge}
      </div>
    </header>
  );
}
