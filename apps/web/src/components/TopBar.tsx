import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { NotificationItem, RoleKey, User } from '../api/types';
import { C, GOLD_GRADIENT, tint } from '../theme/tokens';
import {
  canZoomIn,
  canZoomOut,
  DEFAULT_ZOOM,
  resetZoom,
  useZoom,
  zoomIn,
  zoomLabel,
  zoomOut,
} from '../theme/zoom';
import {
  ALL_ROLES,
  isFounder,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  rolesSummary,
  TIER_GLYPHS,
  tierOfFeature,
} from '../auth/access';
import { api } from '../api/client';
import { useResponsive } from '../hooks/useMediaQuery';
import { Clock } from './Clock';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { UserBadges } from './UserBadges';

interface TopBarProps {
  user: User;
  effectiveRoles: RoleKey[];
  actingRole: RoleKey | null;
  onSetActingRole: (r: RoleKey | null) => void;
  workspaceLabel: string;
  sectionLabel: string;
  accent: string;
  showMenuButton: boolean;
  onOpenNav: () => void;
  onOpenClaude: () => void;
  onOpenAccount: () => void;
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
  support: 'life-buoy',
  violation: 'shield',
};

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
          maxHeight: 'calc(72 * var(--vh))',
          overflowY: 'auto',
        }}
      >
        {children}
      </div>
    </>
  );
}

// Terminal zoom, in the account menu. Scales the app itself rather than relying on
// the browser's zoom, which is per-origin, invisible to the app, and also scales
// the browser's own chrome.
//
// Stepping deliberately does NOT close the menu: zoom is something you nudge
// until it looks right, and closing after each press would mean reopening the
// menu for every step. Buttons disable at the ends of the ladder rather than
// silently doing nothing, and the reset row appears only when there is something
// to reset.
function ZoomControl() {
  const zoom = useZoom();
  const stepStyle = (enabled: boolean): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 26,
    flex: 'none',
    borderRadius: 7,
    background: enabled ? 'rgba(255,255,255,.04)' : 'transparent',
    border: `1px solid ${enabled ? C.line2 : 'transparent'}`,
    color: enabled ? C.text : C.faint,
    cursor: enabled ? 'pointer' : 'default',
    opacity: enabled ? 1 : 0.4,
  });
  return (
    <div style={{ borderTop: `1px solid ${C.line2}`, paddingTop: 6, marginTop: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 9px 6px' }}>
        <span style={{ fontSize: 12.5, fontWeight: 500, color: C.text, flex: 1 }}>Zoom</span>
        <button
          type="button"
          onClick={zoomOut}
          disabled={!canZoomOut(zoom)}
          title="Zoom out"
          aria-label="Zoom out"
          style={stepStyle(canZoomOut(zoom))}
        >
          <Icon name="zoom-out" size={15} />
        </button>
        <span
          style={{
            fontFamily: C.mono,
            fontSize: 11.5,
            color: C.muted,
            minWidth: 42,
            textAlign: 'center',
          }}
        >
          {zoomLabel(zoom)}
        </span>
        <button
          type="button"
          onClick={zoomIn}
          disabled={!canZoomIn(zoom)}
          title="Zoom in"
          aria-label="Zoom in"
          style={stepStyle(canZoomIn(zoom))}
        >
          <Icon name="zoom-in" size={15} />
        </button>
      </div>
      {zoom !== DEFAULT_ZOOM && (
        <button
          type="button"
          onClick={resetZoom}
          style={{ ...menuItem, fontSize: 11.5, color: C.muted, padding: '6px 9px' }}
        >
          <Icon name="refresh-cw" size={13} color={C.faint} />
          Reset to 100%
        </button>
      )}
    </div>
  );
}

// "View as role", in the account menu. Emulate someone holding only the one
// selected role, to see exactly what they see. Pure UI gating — the server still
// enforces your real roles on every request.
//
// **It lives here, and it has to** (owner decision, 2026-08). It was a Developer
// Terminal section, which is the one place a preview hides: choosing Member makes
// the Developer Terminal disappear, taking the control for getting back out with
// it. The account menu is on every screen in every role, so the way in and the
// way out are the same two taps whatever you are previewing.
//
// Shown on the reader's REAL roles (`user.roles`), never the effective ones —
// that is the whole point, and reading the effective roles here would recreate
// the trap it was moved to escape.
function ViewAsRole({
  actingRole,
  onPick,
}: {
  actingRole: RoleKey | null;
  onPick: (r: RoleKey | null) => void;
}) {
  const row = (active: boolean, label: string, title: string, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      title={title}
      style={{
        ...menuItem,
        gap: 9,
        fontSize: 12,
        padding: '6px 9px',
        color: active ? C.gold : C.text,
        fontWeight: active ? 700 : 500,
      }}
    >
      <span
        style={{
          width: 11,
          height: 11,
          flex: 'none',
          borderRadius: '50%',
          border: `2px solid ${active ? C.gold : '#5e7098'}`,
          background: active ? C.gold : 'transparent',
        }}
      />
      {label}
    </button>
  );

  return (
    <div style={{ borderTop: `1px solid ${C.line2}`, paddingTop: 6, marginTop: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 9px 4px' }}>
        <Icon name="eye" size={14} color={C.faint} />
        <span style={{ fontSize: 12.5, fontWeight: 500, color: C.text }}>{"View as role"}</span>
      </div>
      {row(!actingRole, 'My access', 'Your normal view, with every role you hold', () => onPick(null))}
      {ALL_ROLES.map((r: RoleKey) =>
        row(actingRole === r, ROLE_LABELS[r], ROLE_DESCRIPTIONS[r], () =>
          onPick(actingRole === r ? null : r),
        ),
      )}
    </div>
  );
}

export function TopBar(props: TopBarProps) {
  const {
    user,
    effectiveRoles,
    actingRole,
    onSetActingRole,
    workspaceLabel,
    sectionLabel,
    accent,
    showMenuButton,
    onOpenNav,
    onOpenClaude,
    onOpenAccount,
    onOpenChat,
    onLogout,
  } = props;

  const { isPhone } = useResponsive();

  // The glyph on the Ask VTS AI button — the marker of whichever tier `ai` sits
  // in. Falls back to the sparkles if the feature ever stops being paid.
  const aiTier = tierOfFeature('ai', user.access.membership);
  const aiGlyph = (aiTier && TIER_GLYPHS[aiTier]) || 'sparkles';

  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // In-terminal notifications (new team chat + admin suggestions/bugs). Unread is
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
          {/* The tier's own glyph, so the button says what VTS AI costs — the gem
              while `ai` is a Max feature, and the star by itself if it is ever
              moved to Premium. Read from the tier map the server sent rather than
              hardcoded, for the same reason the sidebar markers are. Drawn in the
              button's own text colour: the diamond blue would be washed out on
              gold, and the glyph is what carries the meaning. */}
          <Icon name={aiGlyph} size={14} />
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
              {actingRole && (
                <>
                  <br />
                  Previewing as <b style={{ color: C.gold }}>{ROLE_LABELS[actingRole]}</b> · switch
                  back below
                </>
              )}
            </div>

            <ZoomControl />

            {/* Founder-level only, and gated on the REAL roles so it survives a
                preview of a role that would not otherwise see it. */}
            {isFounder(user.roles) && (
              <ViewAsRole
                actingRole={actingRole}
                onPick={(r) => {
                  setMenuOpen(false);
                  onSetActingRole(r);
                }}
              />
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
