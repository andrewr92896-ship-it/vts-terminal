import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import type { BrokerStatus, RoleKey } from '../api/types';
import {
  THEMES,
  BRAND,
  TABS,
  DEFAULT_SCREEN,
  WORKSPACE_LABELS,
  type WorkspaceKey,
  type TabDef,
  type Theme,
} from '../theme/themes';
import { workspacesForRoles } from '../auth/access';
import { useResponsive } from '../hooks/useMediaQuery';
import { TopBar } from './TopBar';
import { TabBar } from './TabBar';
import { AskClaudePanel } from './AskClaudePanel';
import { AccountSettings } from './AccountSettings';
import { PrivacyProvider } from '../privacy/privacy';
import { DealershipProvider } from '../workspaces/kia/dealership';
import { PageHelp } from './PageHelp';
import { Screen } from '../workspaces/Screens';
import { AdminUsers } from '../workspaces/AdminUsers';
import { TodoAll } from '../workspaces/TodoAll';
import { KiaDashboard } from '../workspaces/kia/KiaDashboard';
import { KiaNews } from '../workspaces/kia/KiaNews';
import { KiaProductKnowledge } from '../workspaces/kia/KiaProductKnowledge';
import { KiaTodo } from '../workspaces/kia/KiaTodo';
import { WealthClients } from '../workspaces/wealth/WealthClients';
import { FinanceOverview } from '../workspaces/finance/FinanceOverview';
import { FinanceExpenses } from '../workspaces/finance/FinanceExpenses';
import { FinanceNetWorth } from '../workspaces/finance/FinanceNetWorth';
import { LiveWall } from '../workspaces/trading/LiveWall';
import { TradeLog } from '../workspaces/trading/TradeLog';
import { Alerts } from '../workspaces/trading/Alerts';
import { History } from '../workspaces/trading/History';
import { AccountMetrics } from '../workspaces/trading/AccountMetrics';

// The Studies screens bundle the 400-question Series 65 database, so they're
// code-split into a lazy chunk that only loads when the Studies workspace is
// opened — keeping the initial app load lean for everyone else.
const Series65Game = lazy(() =>
  import('../workspaces/studies/StudyGame').then((m) => ({ default: m.StudyGame })),
);
const StudyHub = lazy(() =>
  import('../workspaces/studies/StudyHub').then((m) => ({ default: m.StudyHub })),
);
const StudyProgress = lazy(() =>
  import('../workspaces/studies/StudyProgress').then((m) => ({ default: m.StudyProgress })),
);

// Screens that have real implementations; everything else falls back to the
// branded placeholder. `onNavigate` lets a screen jump to another tab.
function renderScreen(screen: string, theme: Theme, onNavigate: (screen: string) => void) {
  switch (screen) {
    case 'live':
      return <LiveWall />;
    case 'alerts':
      return <Alerts onNavigate={onNavigate} />;
    case 'log':
      return <TradeLog />;
    case 'history':
      return <History />;
    case 'metrics':
      return <AccountMetrics />;
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
    case 'wm_clients':
      return <WealthClients />;
    case 'fin_overview':
      return <FinanceOverview />;
    case 'fin_expenses':
      return <FinanceExpenses />;
    case 'fin_networth':
      return <FinanceNetWorth />;
    case 'st_home':
      return <StudyHub theme={theme} onNavigate={onNavigate} />;
    case 'st_game':
      return <Series65Game theme={theme} />;
    case 'st_progress':
      return <StudyProgress theme={theme} onNavigate={onNavigate} />;
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

  // Admin-only "view as role" preview: emulate someone who holds only the one
  // selected role. Pure UI gating; the server still enforces real roles.
  const [actingRole, setActingRole] = useState<RoleKey | null>(null);
  const effectiveRoles: RoleKey[] = actingRole ? [actingRole] : user!.roles;
  const allowed = useMemo(
    () => workspacesForRoles(effectiveRoles),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actingRole, user],
  );

  const [workspace, setWorkspace] = useState<WorkspaceKey>(() =>
    pickInitialWorkspace(workspacesForRoles(user!.roles)),
  );
  const [screen, setScreen] = useState<string>(() => DEFAULT_SCREEN[workspace]);
  const [soundOn, setSoundOn] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [brokers, setBrokers] = useState<BrokerStatus[]>([]);

  const theme = THEMES[workspace];
  const brand = BRAND[workspace];

  // Workspace sub-tabs. User management is opened from the top bar (not a tab).
  const tabs: TabDef[] = TABS[workspace];

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

  function changeActingRole(r: RoleKey | null) {
    setActingRole(r);
    const nextAllowed = workspacesForRoles(r ? [r] : user!.roles);
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
    <PrivacyProvider>
    <DealershipProvider>
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
      {/* Background wordmark watermark — for workspaces with a wordmark logo. */}
      {brand.wordmark && (
        <img
          src={brand.wordmark}
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
        effectiveRoles={effectiveRoles}
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
        onOpenAccount={() => setAccountOpen(true)}
        onOpenAdmin={() => setAdminOpen(true)}
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
        <Suspense fallback={<div style={{ padding: 24, color: '#8ea3cc', fontSize: 13 }}>Loading…</div>}>
          {renderScreen(screen, theme, setScreen) ?? <Screen screen={screen} theme={theme} />}
        </Suspense>
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

      <AskClaudePanel open={aiOpen} theme={theme} workspace={WORKSPACE_LABELS[workspace]} onClose={() => setAiOpen(false)} />
      <AccountSettings open={accountOpen} theme={theme} onClose={() => setAccountOpen(false)} />

      {/* User management — opened from the top-bar Admin button (admins only). */}
      {adminOpen && (
        <>
          <div
            onClick={() => setAdminOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 60, animation: 'fadeIn .2s ease' }}
          />
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed',
              top: isPhone ? 0 : '4vh',
              left: '50%',
              transform: 'translateX(-50%)',
              width: isPhone ? '100%' : 'min(1040px, 94vw)',
              height: isPhone ? '100%' : '92vh',
              overflowY: 'auto',
              background: theme.pageBg,
              border: isPhone ? 'none' : `1px solid ${theme.navBorder}`,
              borderRadius: isPhone ? 0 : 14,
              boxShadow: '0 24px 60px rgba(0,0,0,.55)',
              zIndex: 61,
              animation: 'popIn .25s ease',
            }}
          >
            <div
              style={{
                position: 'sticky',
                top: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                background: theme.headerBg,
                borderBottom: `1px solid ${theme.headerBorder}`,
              }}
            >
              <strong style={{ fontSize: 15, color: '#eef3ff' }}>User Management</strong>
              <button
                onClick={() => setAdminOpen(false)}
                aria-label="Close"
                style={{ background: 'none', border: 'none', color: '#9fb0d6', fontSize: 22, lineHeight: 1, cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: isPhone ? '16px 14px' : '20px 22px' }}>
              <AdminUsers theme={theme} />
            </div>
          </div>
        </>
      )}

      {/* Per-page "?" help button with a step-by-step tutorial for this screen. */}
      <PageHelp screen={screen} theme={theme} />
    </div>
    </DealershipProvider>
    </PrivacyProvider>
  );
}
