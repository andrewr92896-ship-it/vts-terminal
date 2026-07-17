import { useState, type CSSProperties } from 'react';
import type { WorkspaceKey } from '../theme/themes';
import { NAV, navFor, SERIES65_ONLY_SECTIONS, FUNDED_ONLY_SECTIONS, type NavWorkspace } from '../theme/nav';
import { C, tint } from '../theme/tokens';
import { APP_VERSION } from '../meta/version';
import { Icon } from './Icon';

interface SidebarProps {
  workspace: WorkspaceKey;
  screen: string;
  workspaces: WorkspaceKey[]; // the ones this user may see, in nav order
  // Whether this user's team may use the Series 65 track. When false, the
  // Series 65 sections are hidden (the Subjects hub and Study Games stay).
  canSeries65: boolean;
  // Whether the private Funded (prop-challenge) section is revealed.
  canFunded: boolean;
  collapsed: boolean;
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
  const { workspace, screen, workspaces, canSeries65, canFunded, collapsed, onToggle, onSelectWorkspace, onSelectScreen } =
    props;

  const current = navFor(workspace);
  const accent = current?.accent ?? C.gold;
  // Hide the Series 65 sections for teams that can't use that track, and the
  // private Funded section from anyone without the `funded` role.
  const sections = (current?.sections ?? []).filter(
    (s) =>
      (canSeries65 || !SERIES65_ONLY_SECTIONS.has(s.key)) &&
      (canFunded || !FUNDED_ONLY_SECTIONS.has(s.key)),
  );
  // Show only the workspaces this user can access, in the canonical nav order.
  const visible: NavWorkspace[] = NAV.filter((w) => workspaces.includes(w.key));

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
  onClick,
}: {
  kind: 'ws' | 'sec';
  active: boolean;
  icon: string;
  label: string;
  count?: number;
  accent: string;
  collapsed: boolean;
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
      </span>
      {!collapsed && (
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      )}
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
