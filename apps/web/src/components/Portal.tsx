import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import type { BrokerStatus, RoleKey } from '../api/types';
import {
  THEMES,
  DEFAULT_SCREEN,
  WORKSPACE_LABELS,
  type WorkspaceKey,
  type Theme,
} from '../theme/themes';
import { navFor, accentFor } from '../theme/nav';
import { C } from '../theme/tokens';
import { canAccessWorkspace, workspacesForRoles } from '../auth/access';
import { useResponsive } from '../hooks/useMediaQuery';
import { AlertSoundProvider } from '../sound/alertSound';
import { AlertSoundWatcher } from '../sound/AlertSoundWatcher';
import { DemoTour } from './DemoTour';
import { ErrorBoundary } from './ErrorBoundary';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { Icon } from './Icon';
import { InstallPrompt } from './InstallPrompt';
import { AskClaudePanel } from './AskClaudePanel';
import { AccountSettings } from './AccountSettings';
import { PrivacyProvider, usePrivacy } from '../privacy/privacy';
import { DealershipProvider } from '../workspaces/kia/dealership';
import { HelpHub } from './HelpHub';
import {
  currentStudyLevel,
  currentStudyTheme,
  onStudyLevelChange,
  studyBgTint,
} from '../workspaces/studies/studyTheme';
import { Screen } from '../workspaces/Screens';
import { AdminUsers } from '../workspaces/AdminUsers';
import { TodoAll } from '../workspaces/TodoAll';
import { KiaDashboard } from '../workspaces/kia/KiaDashboard';
import { KiaNews } from '../workspaces/kia/KiaNews';
import { KiaProductKnowledge } from '../workspaces/kia/KiaProductKnowledge';
import { KiaTodo } from '../workspaces/kia/KiaTodo';
import { LlcWorkspace } from '../workspaces/llc/LlcWorkspace';
import { LiveWall } from '../workspaces/trading/LiveWall';
import { TradingDesk } from '../workspaces/trading/TradingDesk';
import { Alerts } from '../workspaces/trading/Alerts';
import { FundedScreen } from '../workspaces/trading/FundedScreen';
import { StrategySessions } from '../workspaces/trading/StrategySessions';
import { TradingTodo } from '../workspaces/trading/TradingTodo';
import { MarketNews } from '../workspaces/trading/MarketNews';

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
    case 'desk':
      return <TradingDesk />;
    // Legacy screen keys — the Trade Log, History, and Live Brokers screens are
    // now views inside the consolidated Trade Desk tab. Kept so deep links and
    // in-app navigation (e.g. Alerts, the demo tour) still land on the right view.
    case 'log':
      return <TradingDesk initialView="log" />;
    case 'history':
      return <TradingDesk initialView="history" />;
    case 'metrics':
      return <TradingDesk initialView="brokers" />;
    case 'funded':
      return <FundedScreen />;
    case 'sessions':
      return <StrategySessions />;
    case 'news':
      return <MarketNews />;
    case 'td_trading':
      return <TradingTodo />;
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
    case 'st_home':
      return <StudyHub theme={theme} onNavigate={onNavigate} />;
    // Keyed distinctly so switching between the Study Game and Test Mode (both
    // rendered by Series65Game) remounts with the right initial view instead of
    // React reusing the instance and keeping the previous view.
    case 'st_game':
      return <Series65Game key="st_game" theme={theme} />;
    case 'st_test':
      return <Series65Game key="st_test" theme={theme} initialView="test" />;
    case 'st_progress':
      return <StudyProgress theme={theme} onNavigate={onNavigate} />;
    default:
      // The Vitalis LLC workspace's sections all share one router.
      if (screen.startsWith('llc_')) return <LlcWorkspace screen={screen} />;
      return null;
  }
}

function pickInitialWorkspace(allowed: WorkspaceKey[]): WorkspaceKey {
  if (allowed.includes('trading')) return 'trading';
  return allowed[0] ?? 'studies';
}

// The breadcrumb label for the current section (uses the nav config, with a
// small fallback for legacy Trade Desk sub-views).
function sectionLabelFor(workspace: WorkspaceKey, screen: string): string {
  const nav = navFor(workspace);
  const match = nav?.sections.find((s) => s.key === screen);
  if (match) return match.label;
  if (screen === 'log' || screen === 'history' || screen === 'metrics') return 'Trade Desk';
  return nav?.sections[0]?.label ?? '';
}

export function Portal() {
  const { user, logout } = useAuth();
  const { isPhone } = useResponsive();

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
  const [aiOpen, setAiOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [brokers, setBrokers] = useState<BrokerStatus[]>([]);

  // Sidebar collapse (desktop) — persisted per the design handoff.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('vts_sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });
  const toggleCollapsed = useCallback(() => {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem('vts_sidebar_collapsed', next ? '1' : '0');
      } catch {
        /* private mode can block storage */
      }
      return next;
    });
  }, []);

  // Mobile off-canvas nav drawer.
  const [navOpen, setNavOpen] = useState(false);

  // Bumped whenever the Study Game level changes, so the Studies workspace
  // re-tints to the new level's colour the moment the learner levels up.
  const [studyLevelTick, setStudyLevelTick] = useState(0);
  useEffect(() => onStudyLevelChange(() => setStudyLevelTick((t) => t + 1)), []);

  // The Studies workspace recolours to the learner's current level; every other
  // workspace uses its fixed theme.
  const theme = useMemo(
    () => (workspace === 'studies' ? currentStudyTheme(user?.id) : THEMES[workspace]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspace, user?.id, studyLevelTick],
  );
  // A level-hued wash layered over the content area's dark background, so the
  // whole study page carries the level colour (null for other workspaces).
  const contentTint = useMemo(
    () => (workspace === 'studies' ? studyBgTint(currentStudyLevel(user?.id)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspace, user?.id, studyLevelTick],
  );
  const accent = accentFor(workspace);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Broker status drives the settings-menu dots (Trading only).
  useEffect(() => {
    if (!allowed.includes('trading')) {
      setBrokers([]);
      return;
    }
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

  const resetScroll = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, []);

  const selectWorkspace = useCallback(
    (ws: WorkspaceKey) => {
      setWorkspace(ws);
      setScreen(DEFAULT_SCREEN[ws]);
      setNavOpen(false);
      resetScroll();
    },
    [resetScroll],
  );

  const selectScreen = useCallback(
    (scr: string) => {
      setScreen(scr);
      setNavOpen(false);
      resetScroll();
    },
    [resetScroll],
  );

  // Demo mode: a one-click, read-only showcase with a guided tour.
  const isDemo = !!user?.isDemo;
  const [tourOpen, setTourOpen] = useState(false);
  const goTo = useCallback((ws: WorkspaceKey, scr: string) => {
    setWorkspace(ws);
    setScreen(scr);
  }, []);
  useEffect(() => {
    if (isDemo && sessionStorage.getItem('vts-demo-tour') !== 'seen') {
      setTourOpen(true);
    }
  }, [isDemo]);
  function closeTour() {
    setTourOpen(false);
    try {
      sessionStorage.setItem('vts-demo-tour', 'seen');
    } catch {
      /* private mode can block storage */
    }
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

  // Keep the selected screen valid for the current workspace.
  useEffect(() => {
    const nav = navFor(workspace);
    if (!nav) return;
    const legacyTradeDesk = screen === 'log' || screen === 'history' || screen === 'metrics';
    if (!nav.sections.some((s) => s.key === screen) && !legacyTradeDesk) {
      setScreen(DEFAULT_SCREEN[workspace]);
    }
  }, [workspace, screen]);

  const canTrade = canAccessWorkspace(effectiveRoles, 'trading');

  const sidebar = (
    <Sidebar
      workspace={workspace}
      screen={screen}
      workspaces={allowed}
      collapsed={isPhone ? false : collapsed}
      onToggle={isPhone ? () => setNavOpen(false) : toggleCollapsed}
      onSelectWorkspace={selectWorkspace}
      onSelectScreen={selectScreen}
    />
  );

  const topBar = (
    <TopBar
      user={user!}
      effectiveRoles={effectiveRoles}
      actingRole={actingRole}
      workspaceLabel={WORKSPACE_LABELS[workspace]}
      sectionLabel={sectionLabelFor(workspace, screen)}
      accent={accent}
      brokers={brokers}
      canTrade={canTrade}
      showMenuButton={isPhone}
      onOpenNav={() => setNavOpen(true)}
      onOpenClaude={() => setAiOpen(true)}
      onOpenAccount={() => setAccountOpen(true)}
      onOpenAdmin={() => setAdminOpen(true)}
      onSetActingRole={changeActingRole}
      onLogout={logout}
    />
  );

  const main = (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh' }}>
      {isDemo && <DemoBanner accent={accent} onTour={() => setTourOpen(true)} onExit={logout} />}
      {topBar}
      <PrivacyBanner />
      <InstallPrompt theme={theme} />
      <main
        ref={scrollRef}
        data-vts-scroll-root
        style={{
          flex: 1,
          overflowY: 'auto',
          position: 'relative',
          background: contentTint ? `${contentTint}, ${C.bg}` : undefined,
          transition: 'background 0.5s ease',
        }}
      >
        <ErrorBoundary resetKey={screen}>
          <Suspense fallback={<div style={{ padding: 24, color: C.muted, fontSize: 13 }}>Loading…</div>}>
            {renderScreen(screen, theme, selectScreen) ?? <Screen screen={screen} theme={theme} />}
          </Suspense>
        </ErrorBoundary>
        <footer
          style={{
            padding: isPhone ? '14px' : '16px 32px',
            borderTop: `1px solid ${C.line}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 10.5, color: C.faint, letterSpacing: '0.3px' }}>
            © 2026 Vitalis Trading Systems LLC. All rights reserved. Confidential.
          </span>
          <span style={{ fontSize: 10.5, color: C.faint, fontFamily: C.mono }}>{user!.access.label}</span>
        </footer>
      </main>
    </div>
  );

  return (
    <PrivacyProvider>
      <DealershipProvider>
        <AlertSoundProvider>
          {canAccessWorkspace(effectiveRoles, 'trading') && <AlertSoundWatcher />}

          {isPhone ? (
            <div style={{ height: '100vh', overflow: 'hidden', background: C.bg, color: C.text }}>
              {main}
              {/* Off-canvas nav drawer */}
              {navOpen && (
                <>
                  <div
                    onClick={() => setNavOpen(false)}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 55, animation: 'fadeIn .2s ease' }}
                  />
                  <div
                    style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      bottom: 0,
                      width: 264,
                      zIndex: 56,
                      animation: 'slideInLeft .2s ease',
                    }}
                  >
                    {sidebar}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `${collapsed ? 72 : 248}px 1fr`,
                height: '100vh',
                overflow: 'hidden',
                background: C.bg,
                color: C.text,
                transition: 'grid-template-columns .18s ease',
              }}
            >
              {sidebar}
              {main}
            </div>
          )}

          <AskClaudePanel
            open={aiOpen}
            theme={theme}
            workspace={workspace}
            workspaceLabel={WORKSPACE_LABELS[workspace]}
            onClose={() => setAiOpen(false)}
          />
          <AccountSettings open={accountOpen} theme={theme} onClose={() => setAccountOpen(false)} />

          {/* User management — opened from the avatar menu (admins only). */}
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
                  background: C.bg,
                  border: isPhone ? 'none' : `1px solid ${C.line2}`,
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
                    background: C.side,
                    borderBottom: `1px solid ${C.line}`,
                  }}
                >
                  <strong style={{ fontSize: 15, color: C.text }}>User Management</strong>
                  <button
                    onClick={() => setAdminOpen(false)}
                    aria-label="Close"
                    style={{ background: 'none', border: 'none', color: C.muted, fontSize: 22, lineHeight: 1, cursor: 'pointer' }}
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

          <HelpHub screen={screen} theme={theme} user={user!} />

          {isDemo && tourOpen && (
            <DemoTour theme={theme} onGo={goTo} onOpenClaude={() => setAiOpen(true)} onClose={closeTour} />
          )}
        </AlertSoundProvider>
      </DealershipProvider>
    </PrivacyProvider>
  );
}

// Amber "Privacy mode on" banner shown under the top bar when masking is active.
function PrivacyBanner() {
  const { privacy } = usePrivacy();
  if (!privacy) return null;
  return (
    <div
      style={{
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 32px',
        background: 'rgba(229,164,59,.08)',
        borderBottom: '1px solid rgba(229,164,59,.25)',
        fontSize: 12,
        color: C.amber,
      }}
    >
      <Icon name="eye-off" size={14} />
      Privacy mode on — names and dollar amounts are hidden.
    </div>
  );
}

function DemoBanner({ accent, onTour, onExit }: { accent: string; onTour: () => void; onExit: () => void }) {
  return (
    <div
      style={{
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: 12,
        padding: '8px 16px',
        background: C.panel2,
        borderBottom: `1px solid ${C.line2}`,
        fontSize: 12,
      }}
    >
      <span style={{ color: C.text }}>
        <strong style={{ color: accent }}>Demo mode</strong>
        <span style={{ color: C.muted }}> · read-only · simulated data. The live portal is available on request.</span>
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onTour}
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: C.goldText,
            background: 'linear-gradient(180deg, #EBCB74, #C9A24B)',
            border: 'none',
            padding: '6px 12px',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          Take the tour
        </button>
        <button
          onClick={onExit}
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: C.muted,
            background: 'rgba(255,255,255,.05)',
            border: `1px solid ${C.line2}`,
            padding: '6px 12px',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          Exit demo
        </button>
      </div>
    </div>
  );
}
