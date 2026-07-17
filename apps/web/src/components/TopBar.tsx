import { useState, type CSSProperties, type ReactNode } from 'react';
import type { BrokerStatus, RoleKey, User } from '../api/types';
import { C, GOLD_GRADIENT, tint } from '../theme/tokens';
import { ALL_ROLES, ROLE_LABELS, isAdmin, rolesSummary } from '../auth/access';
import { useResponsive } from '../hooks/useMediaQuery';
import { usePrivacy } from '../privacy/privacy';
import { useAlertSound, ALERT_SOUNDS } from '../sound/alertSound';
import { Clock } from './Clock';
import { Icon } from './Icon';

interface TopBarProps {
  user: User;
  effectiveRoles: RoleKey[];
  actingRole: RoleKey | null;
  workspaceLabel: string;
  sectionLabel: string;
  accent: string;
  brokers: BrokerStatus[];
  canTrade: boolean;
  showMenuButton: boolean;
  onOpenNav: () => void;
  onOpenClaude: () => void;
  onOpenAccount: () => void;
  onOpenAdmin: () => void;
  onSetActingRole: (r: RoleKey | null) => void;
  onLogout: () => void;
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

const iconBtn = (active: boolean): CSSProperties => ({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  flex: 'none',
  color: active ? C.gold : C.muted,
  background: 'rgba(255,255,255,.02)',
  border: `1px solid ${active ? tint(C.gold, 0.4) : C.line2}`,
  borderRadius: 8,
  cursor: 'pointer',
});

const menuItem: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  textAlign: 'left',
  background: 'transparent',
  border: 'none',
  color: C.text,
  fontSize: 12.5,
  fontWeight: 500,
  fontFamily: 'inherit',
  padding: '9px 9px',
  borderRadius: 6,
  cursor: 'pointer',
};

const menuLabel: CSSProperties = {
  fontSize: 9.5,
  letterSpacing: '1px',
  textTransform: 'uppercase',
  color: C.faint,
  fontWeight: 600,
  padding: '4px 9px',
};

function Dropdown({
  open,
  onClose,
  width = 260,
  children,
}: {
  open: boolean;
  onClose: () => void;
  width?: number;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 'calc(100% + 10px)',
          minWidth: width,
          background: '#0C1C3C',
          border: `1px solid ${C.line2}`,
          borderRadius: 10,
          boxShadow: '0 16px 40px rgba(0,0,0,.5)',
          padding: 8,
          zIndex: 41,
          maxHeight: '72vh',
          overflowY: 'auto',
        }}
      >
        {children}
      </div>
    </>
  );
}

export function TopBar(props: TopBarProps) {
  const {
    user,
    effectiveRoles,
    actingRole,
    workspaceLabel,
    sectionLabel,
    accent,
    brokers,
    canTrade,
    showMenuButton,
    onOpenNav,
    onOpenClaude,
    onOpenAccount,
    onOpenAdmin,
    onSetActingRole,
    onLogout,
  } = props;

  const { isPhone } = useResponsive();
  const { privacy, toggle: togglePrivacy } = usePrivacy();
  const sound = useAlertSound();

  const [notifOpen, setNotifOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewAsOpen, setViewAsOpen] = useState(false);

  const canAdmin = isAdmin(effectiveRoles);
  const userName = user.displayName.split(' ')[0] || user.username;
  const hasBrokerStatus = canTrade && brokers.length > 0;

  return (
    <header
      style={{
        height: 64,
        flex: 'none',
        borderBottom: `1px solid ${C.line}`,
        background: C.side,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: isPhone ? '0 12px' : '0 24px 0 28px',
        position: 'relative',
        zIndex: 30,
      }}
    >
      {showMenuButton && (
        <button onClick={onOpenNav} aria-label="Open navigation" style={iconBtn(false)}>
          <Icon name="panel-left-open" size={18} />
        </button>
      )}

      {/* Breadcrumb: workspace › section */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          color: C.faint,
          fontWeight: 500,
          minWidth: 0,
        }}
      >
        {!isPhone && user.teamName && (
          <>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
              {user.teamName}
            </span>
            <Icon name="chevron-right" size={13} color={C.faint} />
          </>
        )}
        {!isPhone && (
          <>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {workspaceLabel}
            </span>
            <Icon name="chevron-right" size={13} color={C.faint} />
          </>
        )}
        <b style={{ color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sectionLabel}
        </b>
      </div>

      {/* Search — a visual affordance; ⌘K wiring is deferred. */}
      {!isPhone && (
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            width: 240,
            background: C.panel,
            border: `1px solid ${C.line}`,
            borderRadius: 8,
            padding: '8px 12px',
            color: C.faint,
            fontSize: 12.5,
          }}
        >
          <Icon name="search" size={15} />
          Search…
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: C.mono,
              fontSize: 10,
              border: `1px solid ${C.line2}`,
              borderRadius: 4,
              padding: '1px 5px',
            }}
          >
            ⌘K
          </span>
        </div>
      )}

      <div
        style={{
          marginLeft: isPhone ? 'auto' : 0,
          display: 'flex',
          alignItems: 'center',
          gap: isPhone ? 8 : 12,
          flex: 'none',
        }}
      >
        {!isPhone && <Clock compact />}

        <button
          onClick={onOpenClaude}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            flex: 'none',
            fontSize: 12.5,
            fontWeight: 600,
            color: C.goldText,
            background: GOLD_GRADIENT,
            border: 'none',
            padding: isPhone ? '9px 12px' : '9px 14px',
            borderRadius: 8,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <Icon name="sparkles" size={14} />
          {!isPhone && 'Ask VTS AI'}
        </button>

        {/* Notifications */}
        <div style={{ position: 'relative', flex: 'none' }}>
          <button onClick={() => setNotifOpen((v) => !v)} aria-label="Notifications" style={iconBtn(notifOpen)}>
            <Icon name="bell" size={17} />
          </button>
          <Dropdown open={notifOpen} onClose={() => setNotifOpen(false)} width={280}>
            <div style={menuLabel}>Notifications</div>
            <div style={{ padding: '14px 10px', textAlign: 'center', color: C.faint, fontSize: 12.5 }}>
              You're all caught up.
            </div>
          </Dropdown>
        </div>

        {/* Settings: privacy, trade-alert sound, broker status */}
        <div style={{ position: 'relative', flex: 'none' }}>
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            aria-label="Settings"
            title="Settings: privacy, alerts, status"
            style={iconBtn(settingsOpen)}
          >
            <Icon name="settings" size={17} />
          </button>
          <Dropdown open={settingsOpen} onClose={() => setSettingsOpen(false)} width={258}>
            {hasBrokerStatus && (
              <>
                <div style={menuLabel}>Status</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '2px 9px 10px' }}>
                  {brokers.map((b) => (
                    <span
                      key={b.key}
                      title={`${b.name} (${b.platform}): ${
                        b.status === 'unconfigured' ? 'Not configured yet' : b.status
                      }`}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: C.muted, fontFamily: C.mono }}
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
              </>
            )}

            <div style={hasBrokerStatus ? { borderTop: `1px solid ${C.line2}`, paddingTop: 6 } : undefined}>
              <button onClick={togglePrivacy} style={menuItem}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: privacy ? C.amber : C.faint,
                    flex: 'none',
                  }}
                />
                {privacy ? 'Privacy on' : 'Privacy off'}
                <span style={{ marginLeft: 'auto', fontSize: 10, color: C.faint }}>
                  {privacy ? 'hiding names & $' : 'visible'}
                </span>
              </button>
            </div>

            {canTrade && (
              <div style={{ borderTop: `1px solid ${C.line2}`, marginTop: 6, paddingTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 9px 8px' }}>
                  <span style={menuLabel}>Trade alert sound</span>
                  <button
                    onClick={() => sound.setEnabled(!sound.enabled)}
                    style={{
                      fontFamily: C.mono,
                      fontSize: 10,
                      fontWeight: 600,
                      color: sound.enabled ? C.green : C.faint,
                      background: 'rgba(0,0,0,.18)',
                      border: `1px solid ${sound.enabled ? tint(C.green, 0.3) : C.line2}`,
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
                          ...menuItem,
                          flex: '1 1 auto',
                          color: on ? C.gold : C.text,
                          background: on ? tint(C.gold, 0.1) : 'transparent',
                        }}
                      >
                        <span
                          style={{
                            width: 12,
                            height: 12,
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
                          border: `1px solid ${C.line2}`,
                          color: C.text,
                          fontSize: 11,
                          padding: '6px 9px',
                          borderRadius: 6,
                          cursor: 'pointer',
                        }}
                      >
                        ▶
                      </button>
                    </div>
                  );
                })}
                <div style={{ fontSize: 10.5, color: C.faint, padding: '8px 8px 2px', lineHeight: 1.45 }}>
                  Plays on this device when a new TradingView alert arrives.
                </div>
              </div>
            )}
          </Dropdown>
        </div>

        {/* Avatar / account menu */}
        <div style={{ position: 'relative', flex: 'none' }}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'linear-gradient(135deg,#143FA0,#0A2A6B)',
                border: `1px solid ${accent}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: C.mono,
                fontWeight: 600,
                fontSize: 13,
                color: accent,
                flex: 'none',
              }}
            >
              {userName.charAt(0).toUpperCase()}
            </div>
            {!isPhone && (
              <div style={{ lineHeight: 1.2, textAlign: 'left' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{userName}</div>
                <div style={{ fontSize: 9.5, color: accent, letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                  {rolesSummary(effectiveRoles)}
                  {actingRole ? ' · preview' : ''}
                </div>
              </div>
            )}
          </button>

          <Dropdown open={menuOpen} onClose={() => setMenuOpen(false)} width={230}>
            <div style={{ fontSize: 11, color: C.faint, padding: '6px 9px 8px', lineHeight: 1.5 }}>
              Signed in as <b style={{ color: C.text }}>{user.email ?? user.username}</b>
              <br />
              Roles: {rolesSummary(user.roles)}
            </div>

            {canAdmin && (
              <div style={{ borderTop: `1px solid ${C.line2}`, paddingTop: 6, marginTop: 4 }}>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenAdmin();
                  }}
                  style={menuItem}
                >
                  <Icon name="users" size={15} color={C.faint} />
                  User management
                </button>
              </div>
            )}

            {isAdmin(user.roles) && (
              <div style={{ borderTop: `1px solid ${C.line2}`, paddingTop: 6, marginTop: 6 }}>
                <button onClick={() => setViewAsOpen((v) => !v)} style={menuItem}>
                  <Icon name="eye" size={15} color={C.faint} />
                  View as role
                  {actingRole && <span style={{ fontSize: 10, color: C.gold }}>· {ROLE_LABELS[actingRole]}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: C.faint }}>{viewAsOpen ? '▴' : '▾'}</span>
                </button>
                {viewAsOpen && (
                  <div>
                    <button
                      onClick={() => {
                        onSetActingRole(null);
                        setMenuOpen(false);
                      }}
                      style={{
                        ...menuItem,
                        paddingLeft: 18,
                        color: !actingRole ? C.gold : C.text,
                        background: !actingRole ? tint(C.gold, 0.1) : 'transparent',
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
                            ...menuItem,
                            paddingLeft: 18,
                            color: on ? C.gold : C.text,
                            background: on ? tint(C.gold, 0.1) : 'transparent',
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

            <div style={{ borderTop: `1px solid ${C.line2}`, paddingTop: 6, marginTop: 6 }}>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onOpenAccount();
                }}
                style={menuItem}
              >
                <Icon name="settings-2" size={15} color={C.faint} />
                Account settings
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
                style={{ ...menuItem, color: C.red }}
              >
                <Icon name="log-out" size={15} />
                Sign out
              </button>
            </div>
          </Dropdown>
        </div>
      </div>
    </header>
  );
}
