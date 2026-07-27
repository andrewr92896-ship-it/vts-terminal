import { useState, type CSSProperties } from 'react';
import type { WorkspaceKey } from '../theme/themes';
import { NAV, navFor, FUNDED_ONLY_SECTIONS, type NavWorkspace } from '../theme/nav';
import { C, tint } from '../theme/tokens';
import { APP_VERSION } from '../meta/version';
import { Icon } from './Icon';

interface SidebarProps {
  workspace: WorkspaceKey;
  screen: string;
  workspaces: WorkspaceKey[]; // the ones this user may see, in nav order
  // The effective nav (workspace + section order), already reordered by any
  // founder-set sidebar layout. Falls back to the code-default NAV when absent.
  nav?: NavWorkspace[];
  // Whether the private Funded (prop-challenge) section is revealed.
  canFunded: boolean;
  // Whether the Employee Portal row is revealed (the `employee` role plus a
  // company-domain sign-in email). It sits above the workspaces list.
  canEmployee?: boolean;
  collapsed: boolean;
  // Nav rows that should show a blinking red "new notification" dot: workspace
  // keys (e.g. the Admin workspace) and section keys (e.g. ad_bugs) with unseen
  // activity. Empty/absent means no dots.
  workspaceDots?: Set<WorkspaceKey>;
  sectionDots?: Set<string>;
  onToggle: () => void;
  onSelectWorkspace: (ws: WorkspaceKey) => void;
  onSelectScreen: (screen: string) => void;
}

const navLabel: CSSProperties = {
  fontSize: 10.5,
  letterSpacing: '1.4px',
  textTransform: 'uppercase',
  color: C.faint,
  fontWeight: 600,
  padding: '0 10px',
  marginBottom: 8,
};

export function Sidebar(props: SidebarProps) {
  const {
    workspace,
    screen,
    workspaces,
    nav,
    canFunded,
    canEmployee,
    collapsed,
    workspaceDots,
    sectionDots,
    onToggle,
    onSelectWorkspace,
    onSelectScreen,
  } = props;

  // The effective nav — the founder-reordered layout when provided, otherwise
  // the code default. Both drive workspace order and each workspace's sections.
  const navList = nav ?? NAV;
  const current = navList.find((w) => w.key === workspace) ?? navFor(workspace);
  const accent = current?.accent ?? C.gold;
  // Hide the private Funded section from anyone without the `funded` role.
  const sections = (current?.sections ?? []).filter((s) => canFunded || !FUNDED_ONLY_SECTIONS.has(s.key));
  // Show only the workspaces this user can access, in the effective nav order.
  const visible: NavWorkspace[] = navList.filter((w) => workspaces.includes(w.key));

  return (
    <aside
      style={{
        background: C.side,
        borderRight: `1px solid ${C.line}`,
        padding: collapsed ? '18px 12px' : '22px 16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: collapsed ? 18 : 22,
        overflowY: 'auto',
        overflowX: 'hidden',
        transition: 'padding .18s ease',
        height: '100%',
      }}
    >
      {/* Brand + collapse toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 8,
          padding: collapsed ? 0 : '2px 4px 0',
          minHeight: 30,
        }}
      >
        {collapsed ? (
          <span
            style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: C.gold, letterSpacing: '1px' }}
          >
            VTS
          </span>
        ) : (
          <img
            src="/brand/vitalis-wordmark.png"
            alt="Vitalis Trading Systems"
            style={{ width: 148, display: 'block' }}
          />
        )}
        {!collapsed && (
          <button
            onClick={onToggle}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            style={toggleBtn}
          >
            <Icon name="panel-left-close" size={16} />
          </button>
        )}
      </div>
      {collapsed && (
        <button onClick={onToggle} title="Expand sidebar" aria-label="Expand sidebar" style={{ ...toggleBtn, alignSelf: 'center' }}>
          <Icon name="panel-left-open" size={16} />
        </button>
      )}

      {/* Employee Portal — pinned above the workspaces list because it is not
          one. It leaves this app entirely for /employee, a separate site with
          its own sign-in, and opens in a new tab so the portal stays put. */}
      {canEmployee && <EmployeePortalLink collapsed={collapsed} />}

      {/* Workspaces */}
      <nav>
        {collapsed ? (
          <div style={{ height: 1, background: C.line, margin: '0 6px 8px' }} />
        ) : (
          <div style={navLabel}>Workspaces</div>
        )}
        {visible.map((w) => (
          <NavRow
            key={w.key}
            kind="ws"
            collapsed={collapsed}
            active={w.key === workspace}
            icon={w.icon}
            label={w.label}
            accent={w.accent}
            dot={workspaceDots?.has(w.key)}
            onClick={() => onSelectWorkspace(w.key)}
          />
        ))}
      </nav>

      {/* Sections of the current workspace */}
      {current && (
        <nav>
          {collapsed ? (
            <div style={{ height: 1, background: C.line, margin: '0 6px 8px' }} />
          ) : (
            <div style={navLabel}>{current.group}</div>
          )}
          {sections.map((s) => (
            <NavRow
              key={s.key}
              kind="sec"
              collapsed={collapsed}
              active={s.key === screen}
              icon={s.icon}
              label={s.label}
              count={s.count}
              accent={accent}
              dot={sectionDots?.has(s.key)}
              onClick={() => onSelectScreen(s.key)}
            />
          ))}
        </nav>
      )}

      {/* Version badge, pinned to the bottom */}
      {collapsed ? (
        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            justifyContent: 'center',
            padding: '12px 0 0',
            borderTop: `1px solid ${C.line}`,
          }}
        >
          <span style={{ fontFamily: C.mono, fontSize: 8, color: C.gold, letterSpacing: '0.5px' }}>
            {APP_VERSION}
          </span>
        </div>
      ) : (
        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 10px 0',
            borderTop: `1px solid ${C.line}`,
          }}
        >
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, letterSpacing: '0.5px' }}>
            VTS Portal
          </span>
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: C.mono,
              fontSize: 9.5,
              color: C.gold,
              border: `1px solid ${tint(C.gold, 0.35)}`,
              borderRadius: 4,
              padding: '2px 7px',
            }}
          >
            {APP_VERSION}
          </span>
        </div>
      )}
    </aside>
  );
}

// The Employee Portal row. A plain anchor with target="_blank", so the browser
// opens the separate employee site in a new tab and this portal stays where it
// is. rel="noopener noreferrer" matters here beyond the usual hygiene: it denies
// the new tab a window.opener handle back into the signed-in portal, and stops
// the employee site's URL leaking as a referrer.
//
// The accent is the employee site's own terracotta, so the row previews where it
// leads rather than borrowing one of this portal's workspace colours.
const EMPLOYEE_ACCENT = '#C25A38';

function EmployeePortalLink({ collapsed }: { collapsed: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <div>
      <a
        href="/employee"
        target="_blank"
        rel="noopener noreferrer"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title="Employee Portal — opens the separate, secured employee site in a new tab"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          padding: collapsed ? '10px 0' : '10px 11px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderRadius: 9,
          fontSize: 13.5,
          fontWeight: 600,
          textDecoration: 'none',
          color: hover ? C.text : C.muted,
          background: hover ? tint(EMPLOYEE_ACCENT, 0.12) : tint(EMPLOYEE_ACCENT, 0.05),
          border: `1px solid ${tint(EMPLOYEE_ACCENT, hover ? 0.42 : 0.22)}`,
          transition: 'background-color .15s ease, color .15s ease, border-color .15s ease',
        }}
      >
        <Icon name="shield-check" size={16} color={EMPLOYEE_ACCENT} />
        {!collapsed && (
          <>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Employee Portal
            </span>
            <Icon name="external-link" size={13} color={C.faint} />
          </>
        )}
      </a>
    </div>
  );
}

const toggleBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 30,
  height: 30,
  flex: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  color: C.faint,
  background: 'rgba(255,255,255,.03)',
  border: `1px solid ${C.line2}`,
};

function NavRow({
  kind,
  active,
  icon,
  label,
  count,
  accent,
  collapsed,
  dot,
  onClick,
}: {
  kind: 'ws' | 'sec';
  active: boolean;
  icon: string;
  label: string;
  count?: number;
  accent: string;
  collapsed: boolean;
  dot?: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const isSecActive = kind === 'sec' && active;

  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    padding: collapsed ? '10px 0' : '9px 10px',
    borderRadius: 8,
    justifyContent: collapsed ? 'center' : 'flex-start',
    fontSize: 13.5,
    fontWeight: active ? 600 : 500,
    cursor: 'pointer',
    marginBottom: 2,
    position: 'relative',
    color: isSecActive ? accent : active || hover ? C.text : C.muted,
    background: isSecActive
      ? `linear-gradient(180deg, ${tint(accent, 0.16)}, ${tint(accent, 0.08)})`
      : active
        ? 'rgba(255,255,255,.045)'
        : hover
          ? 'rgba(255,255,255,.03)'
          : 'transparent',
    transition: 'background-color .15s ease, color .15s ease',
    width: '100%',
    textAlign: 'left',
    border: 'none',
    fontFamily: 'inherit',
  };
  // The workspace icon takes its own accent when active; an active section takes
  // the current workspace accent. Everything else is faint.
  const iconColor = isSecActive ? accent : kind === 'ws' && active ? accent : C.faint;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={style}
      title={collapsed ? label : undefined}
    >
      <span style={{ position: 'relative', display: 'inline-flex', flex: 'none' }}>
        <Icon name={icon} size={16} color={iconColor} />
        {collapsed && count != null && (
          <span
            style={{
              position: 'absolute',
              top: -5,
              right: -6,
              width: 6,
              height: 6,
              borderRadius: 3,
              background: C.gold,
            }}
          />
        )}
        {/* When the rail is collapsed the label is hidden, so the new-activity
            dot rides on the icon instead of sitting at the row's end. */}
        {collapsed && dot && <BlinkDot corner />}
      </span>
      {!collapsed && (
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      )}
      {!collapsed && dot && <BlinkDot />}
      {!collapsed && count != null && (
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>{count}</span>
      )}
      {collapsed && hover && (
        <span
          style={{
            position: 'absolute',
            left: 'calc(100% + 10px)',
            top: '50%',
            transform: 'translateY(-50%)',
            whiteSpace: 'nowrap',
            background: '#0C1C3C',
            border: `1px solid ${C.line2}`,
            color: C.text,
            fontSize: 12,
            fontWeight: 500,
            padding: '6px 10px',
            borderRadius: 7,
            boxShadow: '0 8px 24px rgba(0,0,0,.5)',
            zIndex: 45,
            pointerEvents: 'none',
          }}
        >
          {label}
        </span>
      )}
    </button>
  );
}

// A solid red blinking dot marking new, unseen admin activity. `corner` pins it
// to the top-right of the icon for the collapsed rail; otherwise it sits inline
// at the end of the row.
function BlinkDot({ corner = false }: { corner?: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        flex: 'none',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: C.red,
        boxShadow: `0 0 6px ${C.red}`,
        animation: 'vtsBlink 1s steps(1, end) infinite',
        ...(corner
          ? { position: 'absolute', top: -4, right: -5, border: '1.5px solid ' + C.side }
          : { marginLeft: 6 }),
      }}
    />
  );
}
