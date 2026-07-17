import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { BrokerStatus, NotificationItem, RoleKey, User } from '../api/types';
import { C, GOLD_GRADIENT, tint } from '../theme/tokens';
import { rolesSummary } from '../auth/access';
import { api } from '../api/client';
import { useResponsive } from '../hooks/useMediaQuery';
import { usePrivacy } from '../privacy/privacy';
import { useAlertSound, ALERT_SOUNDS } from '../sound/alertSound';
import { Clock } from './Clock';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { UserBadges } from './UserBadges';

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
  onOpenDeviceSettings: () => void;
  onOpenChat: () => void;
  onLogout: () => void;
}

const NOTIF_SEEN_KEY = 'vts-notif-seen';
const NOTIF_POLL_MS = 20000;

function timeAgo(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const NOTIF_ICON: Record<NotificationItem['kind'], string> = {
  chat: 'message-circle',
  suggestion: 'lightbulb',
  bug: 'bug',
};

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
    onOpenDeviceSettings,
    onOpenChat,
    onLogout,
  } = props;

  const { isPhone } = useResponsive();
  const { privacy, toggle: togglePrivacy } = usePrivacy();
  const sound = useAlertSound();

  const [notifOpen, setNotifOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // In-portal notifications (new team chat + admin suggestions/bugs). Unread is
  // computed from a locally stored last-seen timestamp so it survives reloads.
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [notifSeen, setNotifSeen] = useState<number>(() => {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(NOTIF_SEEN_KEY) : null;
    return v ? Number(v) : 0;
  });
  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const r = await api.notifications();
        if (alive) setNotifs(r.items);
      } catch {
        /* transient — keep last values */
      }
    }
    void tick();
    const id = window.setInterval(tick, NOTIF_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  const unreadCount = notifs.filter((n) => n.createdAt > notifSeen).length;
  function markNotifsSeen() {
    const latest = notifs.reduce((m, n) => Math.max(m, n.createdAt), notifSeen);
    setNotifSeen(latest);
    try {
      localStorage.setItem(NOTIF_SEEN_KEY, String(latest));
    } catch {
      /* storage may be blocked */
    }
  }
  function openNotifs() {
    setNotifOpen((v) => {
      const next = !v;
      if (next) markNotifsSeen();
      return next;
    });
  }

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
          <button onClick={openNotifs} aria-label="Notifications" style={iconBtn(notifOpen)}>
            <Icon name="bell" size={17} />
            {unreadCount > 0 && !notifOpen && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  minWidth: 15,
                  height: 15,
                  padding: '0 3px',
                  borderRadius: 8,
                  background: C.red,
                  color: '#fff',
                  fontSize: 9,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid ' + C.side,
                }}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <Dropdown open={notifOpen} onClose={() => setNotifOpen(false)} width={300}>
            <div style={menuLabel}>Notifications</div>
            {notifs.length === 0 ? (
              <div style={{ padding: '14px 10px', textAlign: 'center', color: C.faint, fontSize: 12.5 }}>
                You're all caught up.
              </div>
            ) : (
              <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                {notifs.slice(0, 20).map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      setNotifOpen(false);
                      if (n.kind === 'chat') onOpenChat();
                    }}
                    style={{
                      ...menuItem,
                      alignItems: 'flex-start',
                      gap: 9,
                      background: n.createdAt > notifSeen ? tint(C.gold, 0.06) : 'transparent',
                    }}
                  >
                    {n.kind === 'chat' ? (
                      <Avatar name={n.author} src={n.avatar} size={26} accent={C.gold} />
                    ) : (
                      <span style={{ flex: 'none', width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.05)', border: `1px solid ${C.line2}` }}>
                        <Icon name={NOTIF_ICON[n.kind]} size={13} color={C.muted} />
                      </span>
                    )}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.text }}>
                          {n.kind === 'chat' ? n.author : n.title}
                        </span>
                        <span style={{ fontSize: 9.5, color: C.faint, flex: 'none' }}>{timeAgo(n.createdAt)}</span>
                      </span>
                      <span style={{ display: 'block', fontSize: 11.5, color: C.muted, lineHeight: 1.45, whiteSpace: 'normal', overflow: 'hidden', textOverflow: 'ellipsis', maxHeight: 32 }}>
                        {n.kind === 'chat' ? n.body : `${n.author}: ${n.body}`}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
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

            {/* Phone notifications, Pushover, broker connections, and app
                updates open in their own panel from here. */}
            <div style={{ borderTop: `1px solid ${C.line2}`, marginTop: 6, paddingTop: 6 }}>
              <button
                onClick={() => {
                  setSettingsOpen(false);
                  onOpenDeviceSettings();
                }}
                style={menuItem}
              >
                <Icon name="bell-plus" size={15} color={C.faint} />
                Notifications & connections
                <span style={{ marginLeft: 'auto', fontSize: 10, color: C.faint }}>›</span>
              </button>
            </div>
          </Dropdown>
        </div>

        {/* Avatar / account menu */}
        <div style={{ position: 'relative', flex: 'none' }}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <Avatar name={user.displayName || userName} src={user.avatarUrl} size={32} accent={accent} />
            {!isPhone && (
              <div style={{ lineHeight: 1.2, textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{userName}</span>
                  <UserBadges roles={user.roles} badges={user.badges} size={13} />
                </div>
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
              {actingRole && <><br />Previewing as a member role · manage in Admin → View as role</>}
            </div>

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
