import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import type { RoleKey } from '../api/types';
import {
  THEMES,
  DEFAULT_SCREEN,
  WORKSPACE_LABELS,
  type WorkspaceKey,
  type Theme,
} from '../theme/themes';
import { NAV, navFor, accentFor, OPT_IN_WORKSPACES, TEAM_ONLY_SECTIONS } from '../theme/nav';
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
import { AdminSuggestions } from '../workspaces/admin/AdminSuggestions';
import { AdminMessageTemplates } from '../workspaces/admin/AdminMessageTemplates';
import { AdminBugReports } from '../workspaces/admin/AdminBugReports';
import { AdminSupport } from '../workspaces/admin/AdminSupport';
import { AdminLog } from '../workspaces/admin/AdminLog';
import { AdminGuidelines } from '../workspaces/admin/AdminGuidelines';
import { AdminRuleBreaking } from '../workspaces/admin/AdminRuleBreaking';
import { AdminWallTemplates } from '../workspaces/admin/AdminWallTemplates';
import { DevBlog } from '../workspaces/admin/DevBlog';
import {
  HelpHowTo,
  HelpAnnouncements,
  HelpPatchNotes,
  HelpBugReport,
  HelpSuggestion,
} from '../workspaces/help/HelpScreens';
import { HelpRules, HelpTerms, HelpPrivacy } from '../workspaces/help/LegalScreens';
import { LiveWall } from '../workspaces/trading/LiveWall';
import { TradeDesk } from '../workspaces/trading/TradeDesk';
import { TradeHistory } from '../workspaces/trading/TradeHistory';
import { Alerts } from '../workspaces/trading/Alerts';
import { FundedScreen } from '../workspaces/trading/FundedScreen';
import { FundedChallengeScreen } from '../workspaces/trading/FundedChallenge';
import { StrategySessions } from '../workspaces/trading/StrategySessions';
import { TradingTodo } from '../workspaces/trading/TradingTodo';
import { MarketData } from '../workspaces/trading/MarketData';
import { MarketNews } from '../workspaces/trading/MarketNews';
import { GeneralNews } from '../workspaces/news/GeneralNews';
import { INVESTMENT_SCREENS } from '../workspaces/investments/screens';
import { PremiumFeatures } from '../workspaces/myportal/PremiumFeatures';

// The Studies screens are code-split into a lazy chunk that only loads when the
// Studies workspace is opened — keeping the initial app load lean for everyone
// else.
const StudyGameHub = lazy(() =>
  import('../workspaces/studies/StudyGameHub').then((m) => ({ default: m.StudyGameHub })),
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
// The whole Investments workspace is one lazy chunk, the same treatment Studies
// gets — nobody who never opens it pays for its code.
const InvestmentsWorkspace = lazy(() =>
  import('../workspaces/investments').then((m) => ({ default: m.InvestmentsWorkspace })),
);
// My Terminal's cross-workspace roll-up — lazy, since it pulls in the shared
// Investments UI kit.
const NetWorthScreen = lazy(() =>
  import('../workspaces/myportal/NetWorth').then((m) => ({ default: m.NetWorthScreen })),
);
// Personal budgeting — lazy, since it pulls in the shared Investments UI kit the
// same way Net Worth does.
const BudgetScreen = lazy(() =>
  import('../workspaces/finances/Budget').then((m) => ({ default: m.BudgetScreen })),
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
      return <LiveWall onOpenMembership={() => onNavigate('my_access')} />;
    case 'alerts':
      return <Alerts onNavigate={onNavigate} />;
    // Placing trades (Trade Desk) and reviewing them (Trade History) are two
    // screens. `desk` stays on the review screen, which is what that key has
    // always routed to.
    case 'tradedesk':
      return <TradeDesk />;
    case 'desk':
      return <TradeHistory />;
    case 'funded':
      return <FundedScreen />;
    case 'prop':
      return <FundedChallengeScreen />;
    case 'sessions':
      return <StrategySessions />;
    case 'data':
      return <MarketData />;
    case 'news':
      return <MarketNews onOpenMembership={() => onNavigate('my_access')} />;
    // World and Politics read the same wire-service feed with a different
    // topic. One screen, two keys — see GeneralNews.
    case 'news_world':
      return <GeneralNews key="news_world" topic="world" />;
    case 'news_politics':
      return <GeneralNews key="news_politics" topic="politics" />;
    case 'td_trading':
      return <TradingTodo />;
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
    case 'ad_log':
      return <AdminLog theme={theme} />;
    case 'ad_guidelines':
      return <AdminGuidelines theme={theme} />;
    case 'ad_rules':
      return <AdminRuleBreaking theme={theme} />;
    case 'ad_walls':
      return <AdminWallTemplates theme={theme} />;
    case 'ad_blog':
      return <DevBlog theme={theme} />;
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
// Bug Reports is deliberately absent: its dot is not a "since you last looked"
// reading but a live state — see BUG_DOT_SECTION below.
const SECTION_ACTIVITY: Record<string, 'suggestions' | 'support'> = {
  ad_suggestions: 'suggestions',
  ad_support: 'support',
};

// Bug Reports lights up whenever a report is still waiting on a person (not
// resolved and not yet answered by an admin) and goes dark the moment the last
// one is handled — opening the section does not clear it, because the work is
// still outstanding until somebody replies or closes the report.
const BUG_DOT_SECTION = 'ad_bugs';
// Rule Breaking's dot follows the same live-count rule as Bug Reports rather
// than a last-seen stamp: reviewing the last violation has to clear it, and a
// stamp only ever moves forward.
const RULES_DOT_SECTION = 'ad_rules';

// Where a sign-in lands: My Terminal, which opens on the Live Wall — the one
// board that draws on every workspace, so it is the most useful thing to open on
// whatever the account has turned on. Every account reaches My Terminal, so the
// fallback below is a safety net rather than a real path.
function pickInitialWorkspace(allowed: WorkspaceKey[]): WorkspaceKey {
  if (allowed.includes('myportal')) return 'myportal';
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
  // The optional features this account has turned on (My Terminal ▸ Feature
  // Access). Kept alongside roles because they gate different things: a role is
  // what you're allowed to do, a feature is what you've asked to see.
  const features = user!.access.features;
  const allowed = useMemo(
    () => workspacesForRoles(effectiveRoles, features),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actingRole, user],
  );
  // Opt-in workspaces this user has NOT turned on. The sidebar still draws them,
  // dimmed and locked, so the feature is discoverable; clicking one opens
  // Premium Features rather than the workspace.
  const locked = useMemo(
    () =>
      new Set<WorkspaceKey>(
        (Object.keys(OPT_IN_WORKSPACES) as WorkspaceKey[]).filter((ws) => !allowed.includes(ws)),
      ),
    [allowed],
  );

  const [workspace, setWorkspace] = useState<WorkspaceKey>(() =>
    pickInitialWorkspace(workspacesForRoles(user!.roles, user!.access.features)),
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
  const [adminActivity, setAdminActivity] = useState<{
    suggestions: number;
    bugsAwaiting: number;
    support: number;
    violationsOpen: number;
  } | null>(null);
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

  // Also exposed to the admin sections themselves, so replying to or resolving a
  // bug report clears its dot immediately instead of on the next poll.
  const refreshAdminActivity = useCallback(() => {
    if (!isAdminUser) return;
    void api
      .hubActivity()
      .then((a) =>
        setAdminActivity({
          suggestions: a.suggestions,
          bugsAwaiting: a.bugsAwaiting ?? 0,
          support: a.support,
          violationsOpen: a.violationsOpen ?? 0,
        }),
      )
      .catch(() => {
        /* transient — keep last values */
      });
  }, [isAdminUser]);

  useEffect(() => {
    if (!isAdminUser) {
      setAdminActivity(null);
      return;
    }
    refreshAdminActivity();
    const id = window.setInterval(refreshAdminActivity, 20000);
    return () => window.clearInterval(id);
  }, [isAdminUser, refreshAdminActivity]);

  const sectionDots = useMemo(() => {
    const dots = new Set<string>();
    if (adminActivity) {
      for (const [key, src] of Object.entries(SECTION_ACTIVITY)) {
        if (adminActivity[src] > (adminSeen[key] ?? 0)) dots.add(key);
      }
      if (adminActivity.bugsAwaiting > 0) dots.add(BUG_DOT_SECTION);
      if (adminActivity.violationsOpen > 0) dots.add(RULES_DOT_SECTION);
    }
    return dots;
  }, [adminActivity, adminSeen]);

  // Light up whichever workspace actually contains the section with unseen
  // activity — derived from the nav rather than hardcoded, so moving a section
  // between workspaces (e.g. Suggestions to the Developer Terminal) keeps its dot
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
      // A locked (not-opted-into) workspace isn't a destination — it's an offer.
      // Send the click to the screen that can actually turn it on.
      if (locked.has(ws)) {
        setWorkspace('myportal');
        setScreen('my_access');
        resetScroll();
        return;
      }
      setWorkspace(ws);
      setScreen(DEFAULT_SCREEN[ws]);
      // Keep the mobile nav drawer open when switching workspaces so the owner
      // can pick a section next; the drawer closes only on a section select
      // (see selectScreen).
      resetScroll();
    },
    [resetScroll, locked],
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
  // Jump to a section wherever it lives, resolving its workspace from the nav.
  // `selectScreen` alone cannot do this: it only sets the screen, so a key
  // belonging to another workspace is bounced straight back by the effect that
  // keeps the two consistent.
  const goToSection = useCallback(
    (scr: string) => {
      const owner = NAV.find((w) => w.sections.some((sec) => sec.key === scr));
      if (owner && owner.key !== workspace) {
        setWorkspace(owner.key);
      }
      setScreen(scr);
      setNavOpen(false);
      resetScroll();
    },
    [workspace, resetScroll],
  );

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
    const nextAllowed = workspacesForRoles(r ? [r] : user!.roles, user!.access.features);
    if (!nextAllowed.includes(workspace)) {
      const ws = pickInitialWorkspace(nextAllowed);
      setWorkspace(ws);
      setScreen(DEFAULT_SCREEN[ws]);
    }
  }

  // The nested Funded Account opt-in. Never revealed to the demo.
  const canFunded = !user!.isDemo && canAccessFunded(features);
  // The Trading Teams grant. Not a role, not an opt-in, not a membership — a
  // software developer hands it out from Admin ▸ Users. Every team surface in
  // the terminal is hidden behind it; the server enforces the same on each
  // /api/my-portal/team* route.
  const canTeams = !!features.tradingTeams;

  // The Employee Portal row above the workspaces list. Needs the `employee` role
  // AND a company-domain sign-in email; follows the same "view as role" preview
  // and is never shown to the demo. The row only opens /employee in a new tab —
  // that site has its own sign-in, so revealing it grants nothing on its own.
  const canEmployee = !user!.isDemo && canAccessEmployeePortal(effectiveRoles, user!.email);

  // Keep the selected workspace and screen valid. Turning a feature off from
  // Premium Features can pull the workspace you are standing in out from under
  // you, so bounce out of it rather than leaving a dead screen mounted; the same
  // effect drops a viewer off the Funded section when that opt-in goes off.
  useEffect(() => {
    if (!allowed.includes(workspace)) {
      const ws = pickInitialWorkspace(allowed);
      setWorkspace(ws);
      setScreen(DEFAULT_SCREEN[ws]);
      return;
    }
    const nav = navFor(workspace);
    if (!nav) return;
    const fundedLocked = screen === 'prop' && !canFunded;
    // Trading Teams is granted, not chosen. Bounce off the screen if the grant
    // is not held — covers a revoked grant leaving somebody parked on it.
    const teamLocked = TEAM_ONLY_SECTIONS.has(screen) && !canTeams;
    if (!nav.sections.some((s) => s.key === screen) || fundedLocked || teamLocked) {
      setScreen(DEFAULT_SCREEN[workspace]);
    }
  }, [workspace, screen, canFunded, canTeams, allowed]);

  // Screens that need the live user or the acting-role controls (which the
  // stateless renderScreen doesn't have): the Site Help workspace and the Admin
  // View-as / Suggestions / Bug Reports sections. Returns null for anything else
  // so it falls through to renderScreen and then the placeholder.
  function renderExtra(scr: string): React.ReactNode {
    // The Investments workspace — the long-term portfolio tracker.
    if (INVESTMENT_SCREENS.has(scr)) return <InvestmentsWorkspace screen={scr} onNavigate={selectScreen} />;
    switch (scr) {
      // Net Worth moved to the Finances workspace; `my_networth` still resolves
      // so in-app links and any saved reference keep landing on it.
      case 'fin_networth':
      case 'my_networth':
        return <NetWorthScreen onNavigate={goToSection} />;
      case 'fin_budget':
        return <BudgetScreen onNavigate={goToSection} />;
      case 'my_team':
        return <TradingTeam theme={theme} user={user!} />;
      case 'my_access':
        return <PremiumFeatures theme={theme} />;
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
      // My Terminal ▸ Site Rules and Site Help ▸ Rules & Conduct render the SAME
      // document. Deliberately one screen behind two keys rather than a copy.
      case 'my_rules':
      case 'hp_rules':
        return <HelpRules theme={theme} />;
      case 'hp_terms':
        return <HelpTerms theme={theme} />;
      case 'hp_privacy':
        return <HelpPrivacy theme={theme} />;
      case 'ad_templates':
        return <AdminMessageTemplates theme={theme} />;
      case 'ad_suggestions':
        return <AdminSuggestions theme={theme} />;
      case 'ad_bugs':
        return <AdminBugReports theme={theme} onChanged={refreshAdminActivity} />;
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
      lockedWorkspaces={locked}
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
      onSetActingRole={changeActingRole}
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
    <div key="app-main" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, height: 'var(--app-h)' }}>
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
          {canAccessWorkspace(effectiveRoles, 'trading', features) && <AlertSoundWatcher />}

          {isPhone ? (
            <div style={{ height: 'var(--app-h)', overflow: 'hidden', background: C.bg, color: C.text }}>
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
                height: 'var(--app-h)',
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
            onOpenMembership={() => {
              setAiOpen(false);
              goToSection('my_access');
            }}
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
        <span style={{ color: C.muted }}> · read-only · simulated data. The live terminal is available on request.</span>
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
