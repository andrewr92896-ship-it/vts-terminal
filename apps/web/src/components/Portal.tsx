import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import type { RoleKey, NavOrderOverride } from '../api/types';
import {
  THEMES,
  DEFAULT_SCREEN,
  WORKSPACE_LABELS,
  type WorkspaceKey,
  type Theme,
} from '../theme/themes';
import { NAV, navFor, accentFor } from '../theme/nav';
import { applyNavOrder } from '../theme/navOrder';
import { C } from '../theme/tokens';
import {
  canAccessEmployeePortal,
  canAccessFunded,
  canAccessWorkspace,
  workspacesForRoles,
} from '../auth/access';
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
import { BadgesProvider } from './UserBadges';
import { AccountSettings } from './AccountSettings';
import { PrivacyProvider, usePrivacy } from '../privacy/privacy';
import { TeamChat } from './TeamChat';
import { getStudyTint, onStudyTintChange, studyBgTint, studyThemeForLevel } from '../workspaces/studies/studyTint';
import { Screen } from '../workspaces/Screens';
import { AdminUsers } from '../workspaces/admin/AdminUsers';
import { AdminTeams } from '../workspaces/admin/AdminTeams';
import { AdminBadges } from '../workspaces/admin/AdminBadges';
import { AdminAiInstructions } from '../workspaces/admin/AdminAiInstructions';
import { AdminPatchNotes } from '../workspaces/admin/AdminPatchNotes';
import { AdminContent } from '../workspaces/admin/AdminContent';
import { AdminEarlyAccess } from '../workspaces/admin/AdminEarlyAccess';
import { AdminViewAs } from '../workspaces/admin/AdminViewAs';
import { AdminSuggestions } from '../workspaces/admin/AdminSuggestions';
import { AdminMessageTemplates } from '../workspaces/admin/AdminMessageTemplates';
import { AdminBugReports } from '../workspaces/admin/AdminBugReports';
import { AdminSupport } from '../workspaces/admin/AdminSupport';
import { AdminSidebarLayout } from '../workspaces/admin/AdminSidebarLayout';
import {
  HelpHowTo,
  HelpAnnouncements,
  HelpPatchNotes,
  HelpBugReport,
  HelpSuggestion,
} from '../workspaces/help/HelpScreens';
import { HelpRules, HelpTerms, HelpPrivacy } from '../workspaces/help/LegalScreens';
import { LiveWall } from '../workspaces/trading/LiveWall';
import { TradingDesk } from '../workspaces/trading/TradingDesk';
import { Alerts } from '../workspaces/trading/Alerts';
import { FundedScreen } from '../workspaces/trading/FundedScreen';
import { FundedChallengeScreen } from '../workspaces/trading/FundedChallenge';
import { StrategySessions } from '../workspaces/trading/StrategySessions';
import { TradingTodo } from '../workspaces/trading/TradingTodo';
import { MarketNews } from '../workspaces/trading/MarketNews';
import { ComingSoon, COMING_SOON_SCREENS } from '../workspaces/investments/ComingSoon';

// The Studies screens are code-split into a lazy chunk that only loads when the
// Studies workspace is opened — keeping the initial app load lean for everyone
// else.
const StudyGameHub = lazy(() =>
  import('../workspaces/studies/StudyGameHub').then((m) => ({ default: m.StudyGameHub })),
);
const StudyHub = lazy(() =>
  import('../workspaces/studies/StudyHub').then((m) => ({ default: m.StudyHub })),
);
const FlashcardsHub = lazy(() =>
  import('../workspaces/studies/FlashcardsHub').then((m) => ({ default: m.FlashcardsHub })),
);
const StudyCreation = lazy(() =>
  import('../workspaces/studies/StudyCreation').then((m) => ({ default: m.StudyCreation })),
);
const StudyGuidesLibrary = lazy(() =>
  import('../workspaces/studies/StudyGuides').then((m) => ({ default: m.StudyGuidesLibrary })),
);
const TradingTeam = lazy(() =>
  import('../workspaces/myportal/TradingTeam').then((m) => ({ default: m.TradingTeam })),
);
const MyPortalSettings = lazy(() =>
  import('../workspaces/myportal/MyPortalSettings').then((m) => ({ default: m.MyPortalSettings })),
);
const Preferences = lazy(() =>
  import('../workspaces/myportal/Preferences').then((m) => ({ default: m.Preferences })),
);
const DeletedTrades = lazy(() =>
  import('../workspaces/trading/DeletedTrades').then((m) => ({ default: m.DeletedTrades })),
);

// Screens that have real implementations; everything else falls back to the
// branded placeholder. `onNavigate` lets a screen jump to another tab.
function renderScreen(
  screen: string,
  theme: Theme,
  onNavigate: (screen: string) => void,
  canFunded: boolean,
) {
  // The private Funded section is role-gated; refuse it defensively (a deep link
  // or stale state) for anyone without the `funded` role.
  if (screen === 'prop' && !canFunded) {
    return (
      <div style={{ maxWidth: 620, margin: '40px auto 0', textAlign: 'center', color: C.muted, fontSize: 13.5 }}>
        This section isn’t enabled for your account.
      </div>
    );
  }
  switch (screen) {
    case 'live':
      return <LiveWall />;
    case 'alerts':
      return <Alerts onNavigate={onNavigate} />;
    case 'desk':
      return <TradingDesk />;
    case 'funded':
      return <FundedScreen />;
    case 'prop':
      return <FundedChallengeScreen />;
    case 'sessions':
      return <StrategySessions />;
    case 'news':
      return <MarketNews />;
    case 'td_trading':
      return <TradingTodo />;
    case 'st_home':
      return <StudyHub theme={theme} onNavigate={onNavigate} />;
    // The Study Game, Test Mode, and Progress sections are all deck launchers
    // over the team's own study games. Keyed distinctly so switching between them
    // remounts with the right target instead of React reusing the instance.
    case 'st_game':
      return <StudyGameHub key="st_game" theme={theme} target="play" onNavigate={onNavigate} />;
    case 'st_cards':
      return <FlashcardsHub theme={theme} onNavigate={onNavigate} />;
    case 'st_test':
      return <StudyGameHub key="st_test" theme={theme} target="test" onNavigate={onNavigate} />;
    case 'st_progress':
      return <StudyGameHub key="st_progress" theme={theme} target="progress" onNavigate={onNavigate} />;
    case 'st_decks':
      return <StudyCreation theme={theme} onNavigate={onNavigate} />;
    case 'st_guides':
      return <StudyGuidesLibrary theme={theme} onNavigate={onNavigate} />;
    // Admin workspace sections. Access is gated by the sidebar/workspace filter
    // (admins only) and enforced server-side on every admin endpoint.
    case 'ad_users':
      return <AdminUsers theme={theme} />;
    case 'ad_teams':
      return <AdminTeams theme={theme} />;
    case 'ad_badges':
      return <AdminBadges theme={theme} />;
    case 'ad_ai':
      return <AdminAiInstructions theme={theme} />;
    case 'ad_notes':
      return <AdminPatchNotes theme={theme} />;
    case 'ad_content':
      return <AdminContent theme={theme} />;
    case 'ad_early':
      return <AdminEarlyAccess theme={theme} />;
    default:
      return null;
  }
}

// Which admin section each pollable activity source maps to, for the sidebar's
// new-activity dots. Keys are section screen keys; values index the hubActivity
// response (see the admin dots logic in Portal).
const SECTION_ACTIVITY: Record<string, 'suggestions' | 'bugs' | 'support'> = {
  ad_suggestions: 'suggestions',
  ad_bugs: 'bugs',
  ad_support: 'support',
};

function pickInitialWorkspace(allowed: WorkspaceKey[]): WorkspaceKey {
  if (allowed.includes('trading')) return 'trading';
  return allowed[0] ?? 'studies';
}

// The breadcrumb label for the current section (uses the nav config).
function sectionLabelFor(workspace: WorkspaceKey, screen: string): string {
  const nav = navFor(workspace);
  const match = nav?.sections.find((s) => s.key === screen);
  if (match) return match.label;
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
  const [chatOpen, setChatOpen] = useState(false);

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

  // Founder-set sidebar ordering, applied over the code-default nav for every
  // user. Loaded once; the Developer Portal's Sidebar Layout editor updates it
  // live (via setNavOverride) so a save re-orders the real sidebar immediately.
  const [navOverride, setNavOverride] = useState<NavOrderOverride | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .navLayout()
      .then((r) => alive && setNavOverride(r.order))
      .catch(() => {
        /* transient — the code-default nav renders until the next load */
      });
    return () => {
      alive = false;
    };
  }, []);
  const orderedNav = useMemo(() => applyNavOrder(NAV, navOverride), [navOverride]);

  // While a study game is being played, its level recolours the Studies
  // workspace (published by the player via studyTint). Re-render on change.
  const [, forceTint] = useState(0);
  useEffect(() => onStudyTintChange(() => forceTint((t) => t + 1)), []);
  const studyTint = workspace === 'studies' ? getStudyTint() : null;
  const theme = studyTint ? studyThemeForLevel(studyTint.hue, studyTint.sat) : THEMES[workspace];
  const contentTint: string | null = studyTint ? studyBgTint(studyTint.hue, studyTint.sat) : null;

  // Admin new-activity dots. We poll the per-source activity timestamps and
  // compare each against a locally stored last-seen so a solid red blinking dot
  // shows next to the Admin workspace and the specific administration tab
  // (Suggestions / Bug Reports / Support) until the admin opens that section.
  const isAdminUser = allowed.includes('admin');
  const [adminActivity, setAdminActivity] = useState<{ suggestions: number; bugs: number; support: number } | null>(
    null,
  );
  const [adminSeen, setAdminSeen] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const key of Object.keys(SECTION_ACTIVITY)) {
      try {
        const v = localStorage.getItem(`vts-admin-seen-${key}`);
        if (v) out[key] = Number(v);
      } catch {
        /* storage may be blocked */
      }
    }
    return out;
  });

  const markAdminSectionSeen = useCallback((key: string) => {
    setAdminSeen((prev) => {
      const at = Date.now();
      if ((prev[key] ?? 0) >= at) return prev;
      try {
        localStorage.setItem(`vts-admin-seen-${key}`, String(at));
      } catch {
        /* storage may be blocked */
      }
      return { ...prev, [key]: at };
    });
  }, []);

  useEffect(() => {
    if (!isAdminUser) {
      setAdminActivity(null);
      return;
    }
    let alive = true;
    const tick = () =>
      api
        .hubActivity()
        .then((a) => alive && setAdminActivity({ suggestions: a.suggestions, bugs: a.bugs, support: a.support }))
        .catch(() => {
          /* transient — keep last values */
        });
    void tick();
    const id = window.setInterval(tick, 20000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [isAdminUser]);

  const sectionDots = useMemo(() => {
    const dots = new Set<string>();
    if (adminActivity) {
      for (const [key, src] of Object.entries(SECTION_ACTIVITY)) {
        if (adminActivity[src] > (adminSeen[key] ?? 0)) dots.add(key);
      }
    }
    return dots;
  }, [adminActivity, adminSeen]);

  // Light up whichever workspace actually contains the section with unseen
  // activity — derived from the nav rather than hardcoded, so moving a section
  // between workspaces (e.g. Suggestions to the Developer Portal) keeps its dot
  // pointing at the right row.
  const workspaceDots = useMemo(() => {
    const dots = new Set<WorkspaceKey>();
    for (const key of sectionDots) {
      const owner = NAV.find((w) => w.sections.some((sec) => sec.key === key));
      if (owner) dots.add(owner.key);
    }
    return dots;
  }, [sectionDots]);

  // Viewing an administration section clears its dot even as fresh activity
  // arrives while it stays open.
  useEffect(() => {
    if (screen in SECTION_ACTIVITY) markAdminSectionSeen(screen);
  }, [screen, adminActivity, markAdminSectionSeen]);

  const accent = accentFor(workspace);
  const scrollRef = useRef<HTMLDivElement>(null);

  const resetScroll = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, []);

  const selectWorkspace = useCallback(
    (ws: WorkspaceKey) => {
      setWorkspace(ws);
      setScreen(DEFAULT_SCREEN[ws]);
      // Keep the mobile nav drawer open when switching workspaces so the owner
      // can pick a section next; the drawer closes only on a section select
      // (see selectScreen).
      resetScroll();
    },
    [resetScroll],
  );

  const selectScreen = useCallback(
    (scr: string) => {
      setScreen(scr);
      setNavOpen(false);
      if (scr in SECTION_ACTIVITY) markAdminSectionSeen(scr);
      resetScroll();
    },
    [resetScroll, markAdminSectionSeen],
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

  // The private Funded section follows the same "view as role" preview as the
  // rest of the nav; never revealed to the demo.
  const canFunded = !user!.isDemo && canAccessFunded(effectiveRoles);

  // The Employee Portal row above the workspaces list. Needs the `employee` role
  // AND a company-domain sign-in email; follows the same "view as role" preview
  // and is never shown to the demo. The row only opens /employee in a new tab —
  // that site has its own sign-in, so revealing it grants nothing on its own.
  const canEmployee = !user!.isDemo && canAccessEmployeePortal(effectiveRoles, user!.email);

  // Keep the selected screen valid for the current workspace. Also bounce a
  // non-funded viewer off the private Funded section if stale state lands there.
  useEffect(() => {
    const nav = navFor(workspace);
    if (!nav) return;
    const fundedLocked = screen === 'prop' && !canFunded;
    if (!nav.sections.some((s) => s.key === screen) || fundedLocked) {
      setScreen(DEFAULT_SCREEN[workspace]);
    }
  }, [workspace, screen, canFunded]);

  // Screens that need the live user or the acting-role controls (which the
  // stateless renderScreen doesn't have): the Site Help workspace and the Admin
  // View-as / Suggestions / Bug Reports sections. Returns null for anything else
  // so it falls through to renderScreen and then the placeholder.
  function renderExtra(scr: string): React.ReactNode {
    // The Investments workspace sections and the My Portal ▸ Investment Holdings
    // summary are all themed "Coming Soon" placeholders for now (the foundation).
    if (COMING_SOON_SCREENS.has(scr)) return <ComingSoon screen={scr} theme={theme} />;
    switch (scr) {
      case 'my_team':
        return <TradingTeam theme={theme} user={user!} />;
      case 'my_prefs':
        return <Preferences theme={theme} />;
      case 'my_settings':
        return <MyPortalSettings theme={theme} />;
      case 'deleted':
        return <DeletedTrades />;
      case 'hp_howto':
        return <HelpHowTo theme={theme} />;
      case 'hp_news':
        return <HelpAnnouncements theme={theme} user={user!} />;
      case 'hp_notes':
        return <HelpPatchNotes theme={theme} />;
      case 'hp_bug':
        return <HelpBugReport theme={theme} user={user!} />;
      case 'hp_suggest':
        return <HelpSuggestion theme={theme} user={user!} />;
      case 'hp_rules':
        return <HelpRules theme={theme} />;
      case 'hp_terms':
        return <HelpTerms theme={theme} />;
      case 'hp_privacy':
        return <HelpPrivacy theme={theme} />;
      case 'ad_sidebar':
        return (
          <AdminSidebarLayout
            theme={theme}
            nav={orderedNav}
            override={navOverride}
            onApply={setNavOverride}
          />
        );
      case 'ad_viewas':
        return <AdminViewAs theme={theme} actingRole={actingRole} onSetActingRole={changeActingRole} />;
      case 'ad_templates':
        return <AdminMessageTemplates theme={theme} />;
      case 'ad_suggestions':
        return <AdminSuggestions theme={theme} />;
      case 'ad_bugs':
        return <AdminBugReports theme={theme} />;
      case 'ad_support':
        return <AdminSupport theme={theme} />;
      default:
        return null;
    }
  }

  const sidebar = (
    <Sidebar
      key="app-sidebar"
      workspace={workspace}
      screen={screen}
      workspaces={allowed}
      nav={orderedNav}
      canFunded={canFunded}
      canEmployee={canEmployee}
      collapsed={isPhone ? false : collapsed}
      workspaceDots={workspaceDots}
      sectionDots={sectionDots}
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
      showMenuButton={isPhone}
      onOpenNav={() => setNavOpen(true)}
      onOpenClaude={() => setAiOpen(true)}
      onOpenAccount={() => setAccountOpen(true)}
      onOpenChat={() => setChatOpen(true)}
      onLogout={logout}
    />
  );

  // Keyed so React preserves this subtree — and every screen's state inside it,
  // e.g. an in-progress study game — when a phone rotation flips `isPhone` and
  // the layout swaps between the phone (drawer) and wide (grid) branches below.
  // `main` sits at a different child position in each branch, so without a
  // stable key React reconciles by position, finds a different element in that
  // slot, and remounts the whole content area — which would reset the active
  // game back to its picker (and wipe any half-filled form) on every rotate.
  const main = (
    <div key="app-main" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh' }}>
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
            {renderExtra(screen) ?? renderScreen(screen, theme, selectScreen, canFunded) ?? <Screen screen={screen} theme={theme} />}
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
          <span style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {(
              [
                ['hp_terms', 'Terms'],
                ['hp_privacy', 'Privacy'],
                ['hp_rules', 'Rules'],
              ] as const
            ).map(([scr, label]) => (
              <button
                key={scr}
                onClick={() => {
                  goTo('help', scr);
                  resetScroll();
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  fontSize: 10.5,
                  color: C.faint,
                  letterSpacing: '0.3px',
                }}
              >
                {label}
              </button>
            ))}
            <span style={{ fontSize: 10.5, color: C.faint, fontFamily: C.mono }}>{user!.access.label}</span>
          </span>
        </footer>
      </main>
    </div>
  );

  return (
    <PrivacyProvider>
      <BadgesProvider>
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

          <TeamChat
            open={chatOpen}
            onOpen={() => setChatOpen(true)}
            onClose={() => setChatOpen(false)}
            theme={theme}
            user={user!}
          />

          {isDemo && tourOpen && (
            <DemoTour theme={theme} onGo={goTo} onOpenClaude={() => setAiOpen(true)} onClose={closeTour} />
          )}
      </AlertSoundProvider>
      </BadgesProvider>
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
