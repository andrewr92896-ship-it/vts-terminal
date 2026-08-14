import { NAV, FUNDED_ONLY_SECTIONS, TEAM_ONLY_SECTIONS } from './nav';
import { DEFAULT_SCREEN, type WorkspaceKey } from './themes';

// The screen the terminal opens on, chosen in My Terminal ▸ Settings.
//
// ONE module because the picker and the launcher have to agree: a screen the
// picker offers must be one the launcher will actually open, and a screen the
// launcher rejects must not be sitting in the picker looking chosen. Both call
// `homeOptions`, so the reachable set is defined once.
//
// What a stored choice means is deliberately NOT "go here": it is "go here if
// you still can". Roles, opt-ins and membership all move after the choice is
// saved — a desk opt-in switched off, a lapsed tier, a revoked grant — so the
// value is resolved on every launch and falls back rather than stranding
// somebody on a screen that refuses them.

export interface HomeChoice {
  workspace: WorkspaceKey;
  screen: string;
}

// Where the terminal opened before this setting existed, and still the fallback
// for anyone who has not chosen. Lives here rather than in Portal so the picker
// can show the same "not set" destination the launcher would use.
export function pickInitialWorkspace(allowed: WorkspaceKey[]): WorkspaceKey {
  if (allowed.includes('trading')) return 'trading';
  if (allowed.includes('myportal')) return 'myportal';
  return allowed[0] ?? 'studies';
}

export interface HomeOption {
  workspace: WorkspaceKey;
  label: string;
  sections: { key: string; label: string }[];
}

// Every workspace/section this account can currently reach, in sidebar order.
// `allowed` is the workspace list the caller already computed
// (workspacesForRoles); the section filters mirror Sidebar.tsx exactly — a row
// hidden there must not be offerable as a home page.
export function homeOptions(
  allowed: WorkspaceKey[],
  opts: { canFunded: boolean; canTeams: boolean },
): HomeOption[] {
  const set = new Set(allowed);
  return NAV.filter((w) => set.has(w.key)).map((w) => ({
    workspace: w.key,
    label: w.label,
    sections: w.sections
      .filter(
        (s) =>
          (opts.canFunded || !FUNDED_ONLY_SECTIONS.has(s.key)) &&
          (opts.canTeams || !TEAM_ONLY_SECTIONS.has(s.key)),
      )
      .map((s) => ({ key: s.key, label: s.label })),
  }));
}

// Where a launch should land. Falls back in the order that loses the least:
// the stored workspace with its own default screen if only the section is out
// of reach, then the caller's default workspace.
//
// The two stored values move together — a section key means nothing without the
// workspace it belongs to — so a half-stored choice resolves as no choice.
export function resolveHome(
  stored: { homeWorkspace: string | null; homeScreen: string | null },
  options: HomeOption[],
  fallbackWorkspace: WorkspaceKey,
): HomeChoice {
  const fallback: HomeChoice = {
    workspace: fallbackWorkspace,
    screen: DEFAULT_SCREEN[fallbackWorkspace],
  };
  if (!stored.homeWorkspace || !stored.homeScreen) return fallback;

  const ws = options.find((o) => o.workspace === stored.homeWorkspace);
  if (!ws) return fallback;
  const hasSection = ws.sections.some((s) => s.key === stored.homeScreen);
  return {
    workspace: ws.workspace,
    // The workspace is still reachable but that particular section is not —
    // opening its default screen is closer to what they asked for than sending
    // them somewhere else entirely.
    screen: hasSection ? stored.homeScreen : DEFAULT_SCREEN[ws.workspace],
  };
}
