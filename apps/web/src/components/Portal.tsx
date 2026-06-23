import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import type { BrokerStatus, Role } from '../api/types';
import {
  THEMES,
  BRAND,
  TABS,
  DEFAULT_SCREEN,
  type WorkspaceKey,
  type TabDef,
  type Theme,
} from '../theme/themes';
import { workspacesFor } from '../auth/access';
import { useResponsive } from '../hooks/useMediaQuery';
import { TopBar } from './TopBar';
import { TabBar } from './TabBar';
import { AskClaudePanel } from './AskClaudePanel';
import { Screen } from '../workspaces/Screens';
import { TodoAll } from '../workspaces/TodoAll';
import { KiaDashboard } from '../workspaces/kia/KiaDashboard';
import { KiaNews } from '../workspaces/kia/KiaNews';
import { KiaProductKnowledge } from '../workspaces/kia/KiaProductKnowledge';
import { KiaTodo } from '../workspaces/kia/KiaTodo';
import { Flashcards } from '../workspaces/studies/Flashcards';

// Screens that have real implementations; everything else falls back to the
// branded placeholder.
function renderScreen(screen: string, theme: Theme) {
  switch (screen) {
    case 'td_all':
      return <TodoAll />;
    case 'kia_dash':
      return <KiaDashboard />;
    case 'kia_news':
      return <KiaNews />;
    case 'kia_know':
      return <KiaProductKnowledge />;
    case 'kia_todo':
      return <KiaTodo />;
    case 'st_cards':
      return <Flashcards theme={theme} />;
    default:
      return null;
  }
}

function pickInitialWorkspace(allowed: WorkspaceKey[]): WorkspaceKey {
  if (allowed.includes('trading')) return 'trading';
  return allowed[0] ?? 'studies';
}

export function Portal() {
  const { user, logout } = useAuth();
  const { isPhone, isTablet } = useResponsive();

  // Admin-only "view as role" preview. Pure UI gating; the server still
  // enforces the real role on every request.
  const [actingRole, setActingRole] = useState<Role | null>(null);
  const effectiveRole: Role = actingRole ?? user!.role;
  const allowed = useMemo(() => workspacesFor(effectiveRole), [effectiveRole]);

  const [workspace, setWorkspace] = useState<WorkspaceKey>(() =>
    pickInitialWorkspace(workspacesFor(user!.role)),
  );
  const [screen, setScreen] = useState<string>(() => DEFAULT_SCREEN[workspace]);
  const [soundOn, setSoundOn] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);
  const [brokers, setBrokers] = useState<BrokerStatus[]>([]);

  const theme = THEMES[workspace];
  const brand = BRAND[workspace];

  // Trading tabs gain an Admin tab only for real Admins.
  const tabs: TabDef[] = useMemo(() => {
    const base = TABS[workspace];
    if (workspace === 'trading' && user!.role === 'Admin') {
      return [...base, { key: 'admin', label: 'Admin' }];
    }
    return base;
  }, [workspace, user]);

  // Broker status drives the top-bar dots (Trading only).
  useEffect(() => {
    if (!allowed.includes('trading')) return;
    let alive = true;
    api
      .brokerStatus()
      .then((r) => alive && setBrokers(r.brokers))
      .catch(() => {
        /* ignore — dots simply stay hidden */
      });
    return () => {
      alive = false;
    };
  }, [allowed]);

  function switchWorkspace(ws: WorkspaceKey) {
    setWorkspace(ws);
    setScreen(DEFAULT_SCREEN[ws]);
  }

  function changeActingRole(r: Role | null) {
    setActingRole(r);
    const role = r ?? user!.role;
    const nextAllowed = workspacesFor(role);
    if (!nextAllowed.includes(workspace)) {
      const ws = pickInitialWorkspace(nextAllowed);
      setWorkspace(ws);
      setScreen(DEFAULT_SCREEN[ws]);
    }
  }

  // Keep the selected screen valid for the current workspace's tabs.
  useEffect(() => {
    if (!tabs.some((t) => t.key === screen)) {
      setScreen(DEFAULT_SCREEN[workspace]);
    }
  }, [tabs, screen, workspace]);

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: theme.pageBg,
        color: '#dfe7fa',
      }}
    >
      {/* Background wordmark watermark — Trading only, matching the prototype. */}
      {brand.useWordmark && (
        <img
          src="/brand/vitalis-wordmark.png"
          alt=""
          aria-hidden
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%,-50%)',
            width: '66vw',
            maxWidth: 980,
            opacity: 0.06,
            pointerEvents: 'none',
            zIndex: 0,
            filter: 'drop-shadow(0 0 70px rgba(235,203,116,.3))',
            userSelect: 'none',
          }}
        />
      )}

      <TopBar
        user={user!}
        effectiveRole={effectiveRole}
        actingRole={actingRole}
        workspace={workspace}
        workspaces={allowed}
        theme={theme}
        brand={brand}
        brokers={brokers}
        soundOn={soundOn}
        onSwitchWorkspace={switchWorkspace}
        onToggleSound={() => setSoundOn((v) => !v)}
        onOpenClaude={() => setAiOpen(true)}
        onSetActingRole={changeActingRole}
        onLogout={logout}
      />

      <TabBar tabs={tabs} screen={screen} theme={theme} onSelect={setScreen} />

      <main
        style={{
          position: 'relative',
          zIndex: 1,
          flex: 1,
          padding: isPhone ? '16px 14px 28px' : isTablet ? '20px 18px 36px' : '22px 26px 40px',
        }}
      >
        {renderScreen(screen, theme) ?? <Screen screen={screen} theme={theme} />}
      </main>

      <footer
        style={{
          position: 'relative',
          zIndex: 1,
          padding: isPhone ? '14px 14px' : '16px 26px',
          borderTop: `1px solid ${theme.navBorder}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 10.5, color: '#5d72a0', letterSpacing: '0.3px' }}>
          Copyright 2024-2026 Vitalis Trading Systems LLC. Confidential.
        </span>
        <span
          style={{
            fontSize: 10.5,
            color: '#5d72a0',
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          {user!.access.label}
        </span>
      </footer>

      <AskClaudePanel open={aiOpen} theme={theme} onClose={() => setAiOpen(false)} />
    </div>
  );
}
