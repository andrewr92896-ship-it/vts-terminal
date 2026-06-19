import { useState } from 'react';
import type { BrokerStatus, Role, User } from '../api/types';
import {
  type Theme,
  type WorkspaceKey,
  type BrandMeta,
  accentGradient,
  WORKSPACE_LABELS,
} from '../theme/themes';
import { ROLE_BADGE } from '../auth/access';
import { Clock } from './Clock';

interface TopBarProps {
  user: User;
  effectiveRole: Role;
  actingRole: Role | null;
  workspace: WorkspaceKey;
  workspaces: WorkspaceKey[];
  theme: Theme;
  brand: BrandMeta;
  brokers: BrokerStatus[];
  soundOn: boolean;
  onSwitchWorkspace: (ws: WorkspaceKey) => void;
  onToggleSound: () => void;
  onOpenClaude: () => void;
  onSetActingRole: (r: Role | null) => void;
  onLogout: () => void;
}

const ROLES: Role[] = ['Admin', 'Trader', 'Sales', 'Viewer'];

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
    effectiveRole,
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
    onSetActingRole,
    onLogout,
  } = props;

  const [menuOpen, setMenuOpen] = useState(false);
  const accentGrad = accentGradient(theme);
  const isTrading = workspace === 'trading';
  const userName = user.displayName.split(' ')[0] || user.username;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          {brand.useWordmark ? (
            <img
              src="/brand/vitalis-wordmark.png"
              alt="Vitalis Trading Systems"
              style={{ height: 34, display: 'block' }}
            />
          ) : (
            <div style={{ lineHeight: 1.05 }}>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: brand.size,
                  letterSpacing: brand.letterSpacing,
                  color: brand.color,
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
                }}
              >
                {brand.sub}
              </div>
            </div>
          )}
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
                  padding: '7px 14px',
                  borderRadius: 5,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
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
            }}
          >
            Pre-Alpha V 0.2
          </span>
        </nav>
      </div>

      {/* Right: broker dots, clock, alerts, Ask Claude, user badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
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
                    animation:
                      b.status === 'live' ? 'livePulse 2.4s infinite' : 'none',
                  }}
                />
                {b.short}
              </span>
            ))}
          </div>
        )}

        <Clock />

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
            padding: '7px 11px',
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
            padding: '8px 14px',
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

        {/* User / role badge with dropdown */}
        <div style={{ position: 'relative' }}>
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
              }}
            >
              {userName.charAt(0).toUpperCase()}
            </div>
            <div style={{ lineHeight: 1.2, textAlign: 'left' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#eef3ff' }}>
                {userName}
              </div>
              <div
                style={{
                  fontSize: 9.5,
                  color: theme.accent,
                  letterSpacing: '0.6px',
                  textTransform: 'uppercase',
                }}
              >
                {ROLE_BADGE[effectiveRole]}
                {actingRole && actingRole !== user.role ? ' · preview' : ''}
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
                  Role: {ROLE_BADGE[user.role]}
                </div>

                {user.role === 'Admin' && (
                  <div
                    style={{ borderTop: '1px solid #1d3560', paddingTop: 8, marginTop: 4 }}
                  >
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
                    {ROLES.map((r) => {
                      const on = effectiveRole === r;
                      return (
                        <button
                          key={r}
                          onClick={() => {
                            onSetActingRole(r === user.role ? null : r);
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
                          {ROLE_BADGE[r]}
                          {r === user.role ? ' (your role)' : ''}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div style={{ borderTop: '1px solid #1d3560', paddingTop: 6, marginTop: 6 }}>
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
      </div>
    </header>
  );
}
