// From navGates, NEVER from './nav' — importing the gates out of that module
// pulls the whole private NAV array into the public bundle, labels included.
import { FUNDED_ONLY_SECTIONS, TEAM_ONLY_SECTIONS } from './navGates';

// MY TERMINAL IS THE ONE CUSTOMIZABLE WORKSPACE (owner instruction, 2026-08).
// A section from anywhere else in the terminal can be pinned onto it, and any of
// its own rows can be taken off — "put Closed Trades & Metrics on it if you want
// it there, and take it off again".
//
// THIS IS NOT A NAV ORDER OVERRIDE, and the distinction is the whole reason the
// shape below is a DIFF rather than a list. AGENTS.md records why the old
// Sidebar Layout editor was removed and must not come back: it stored a complete
// ordering install-wide, so a code change to the order silently lost to the
// stored one and looked like it had not deployed. Nothing here can do that.
//
//   * `NAV` still decides the order of every workspace and of every section
//     inside every workspace, My Terminal's own rows included.
//   * What is stored is only what the user CHANGED: which of My Terminal's rows
//     they took off, and which rows from elsewhere they pinned on.
//   * So a section added to `NAV` in a later deploy APPEARS — for everyone,
//     customized or not — because nothing stored claims to be the whole list.
//
// It is per user, on the account (not the device), like the display time zone
// and the home screen: the personal board a person builds should follow them
// between their phone and their desk.
//
// EVERY FUNCTION TAKES THE NAV IT IS WORKING ON. The private terminal passes its
// `NAV`; the public terminal passes its own compile-time allowlist, which is a
// deliberately narrower list and not the same array. One set of rules over two
// navs — the alternative is a second copy of these rules for the public shell,
// which is how the two come to disagree about what "customized" means.
export interface MyTerminalLayout {
  // Section keys pinned onto My Terminal from other workspaces, in the order
  // they were added — which is the only order the user themselves chose.
  add: string[];
  // Keys of My Terminal's OWN NAV rows the user has taken off.
  hide: string[];
  // THE ROWS THE USER HAS DELIBERATELY POSITIONED, in the order they put them
  // (owner request, 2026-08 — dragged into place in the editor).
  //
  // IT IS A PARTIAL ORDER, NOT A LIST OF THE WORKSPACE, and that is what keeps
  // this on the right side of the rule above. A key absent from here is not
  // "unplaced and therefore missing" — it renders in its ordinary place, after
  // the positioned ones. So a section added to `NAV` in a later deploy still
  // APPEARS for somebody who has arranged their board, which is the property the
  // old install-wide Sidebar Layout editor destroyed and the reason it was
  // removed. Arriving at the END is the same rule a pin already follows: new
  // rows land where somebody who just gained one looks for them.
  //
  // A key for a row that is currently hidden or unpinned is KEPT rather than
  // pruned — turning that row back on returns it to where it was put, instead of
  // dropping it at the bottom of a board somebody has arranged. Bounded by the
  // number of sections that exist, and capped again at the route.
  order: string[];
}

export const MY_TERMINAL_DEFAULT: MyTerminalLayout = { add: [], hide: [], order: [] };

// A pin is a SECOND entry point, never a move: the section keeps its home in its
// own workspace, so taking it off My Terminal can never make it unreachable.
export const MY_TERMINAL_WORKSPACE = 'myportal';

// The minimum shape both navs satisfy. Deliberately structural rather than the
// private `NavWorkspace`, so the public terminal's own (readonly, narrower) nav
// is accepted without either side importing the other's types.
export interface NavSectionLike {
  key: string;
  label: string;
  icon: string;
}
export interface NavWorkspaceLike {
  key: string;
  label: string;
  accent: string;
  sections: readonly NavSectionLike[];
}
export type NavLike = readonly NavWorkspaceLike[];


// A stored value is untrusted input — it comes back off an account row that may
// have been written by an older build. Anything unrecognised is dropped rather
// than repaired, and the result is always a usable layout.
export function parseMyTerminal(raw: unknown): MyTerminalLayout {
  const value =
    typeof raw === 'string'
      ? (() => {
          try {
            return JSON.parse(raw) as unknown;
          } catch {
            return null;
          }
        })()
      : raw;
  if (!value || typeof value !== 'object') return MY_TERMINAL_DEFAULT;
  const record = value as { add?: unknown; hide?: unknown; order?: unknown };
  const keys = (list: unknown): string[] =>
    Array.isArray(list) ? [...new Set(list.filter((k): k is string => typeof k === 'string' && !!k))] : [];
  // `order` absent is the ordinary case — every layout stored before ordering
  // existed — and reads as "nothing positioned", which renders exactly as it
  // did before.
  return { add: keys(record.add), hide: keys(record.hide), order: keys(record.order) };
}

export interface MyTerminalReach {
  // The workspaces this account may see — `workspacesForRoles`, the same list
  // the sidebar is given.
  workspaces: readonly string[];
  canFunded: boolean;
  canTeams: boolean;
}

// The section filters MIRROR Sidebar.tsx exactly. A row hidden there must not be
// offerable here, and a row pinned here must not be one the sidebar would refuse
// to draw — that is the same rule homeScreen.ts follows for the home picker.
function reachable(section: NavSectionLike, reach: MyTerminalReach): boolean {
  return (
    (reach.canFunded || !FUNDED_ONLY_SECTIONS.has(section.key)) &&
    (reach.canTeams || !TEAM_ONLY_SECTIONS.has(section.key))
  );
}

function nativeWorkspace(nav: NavLike): NavWorkspaceLike | undefined {
  return nav.find((w) => w.key === MY_TERMINAL_WORKSPACE);
}

// Every section anywhere the account can reach, other than My Terminal's own —
// the pool a pin is drawn from, keyed for lookup.
export function pinnableSections(
  nav: NavLike,
  reach: MyTerminalReach,
): Map<string, { section: NavSectionLike; workspace: NavWorkspaceLike }> {
  const allowed = new Set(reach.workspaces);
  const out = new Map<string, { section: NavSectionLike; workspace: NavWorkspaceLike }>();
  for (const workspace of nav) {
    if (workspace.key === MY_TERMINAL_WORKSPACE || !allowed.has(workspace.key)) continue;
    for (const section of workspace.sections) {
      if (reachable(section, reach)) out.set(section.key, { section, workspace });
    }
  }
  return out;
}

// What My Terminal's section list actually is for this account: its own rows in
// NAV order minus the ones taken off, then the pinned ones in the order they
// were added. A pin whose section no longer exists — renamed away, or a
// workspace this account can no longer reach — is simply dropped, the same rule
// the Market Data layout follows, so a catalog change never strands a layout.
export function myTerminalSections(
  nav: NavLike,
  layout: MyTerminalLayout,
  reach: MyTerminalReach,
): NavSectionLike[] {
  const hidden = new Set(layout.hide);
  const own = (nativeWorkspace(nav)?.sections ?? []).filter((s) => reachable(s, reach) && !hidden.has(s.key));
  const pool = pinnableSections(nav, reach);
  const pinned = layout.add.map((key) => pool.get(key)?.section).filter((s): s is NavSectionLike => !!s);
  return applyOrder([...own, ...pinned], layout.order);
}

// The user's own arrangement, applied to whatever the board currently holds.
//
// POSITIONED ROWS FIRST, IN THEIR ORDER; EVERYTHING ELSE AFTER, IN ITS ORDINARY
// ORDER. Both halves matter. A key in `order` that is no longer on the board is
// skipped rather than leaving a gap, and a row the arrangement has never heard
// of — a section added to the nav in a later deploy — still appears, at the end.
// That second half is the whole reason this is a partial order: an arrangement
// that claimed to be the complete list would silently swallow it.
function applyOrder(sections: NavSectionLike[], order: readonly string[]): NavSectionLike[] {
  if (order.length === 0) return sections;
  const byKey = new Map(sections.map((s) => [s.key, s]));
  const placed: NavSectionLike[] = [];
  const seen = new Set<string>();
  for (const key of order) {
    const section = byKey.get(key);
    if (section && !seen.has(key)) {
      placed.push(section);
      seen.add(key);
    }
  }
  return [...placed, ...sections.filter((s) => !seen.has(s.key))];
}

// Which of My Terminal's own rows are currently on, for the editor. Rows the
// account cannot reach at all are absent rather than drawn off — they are not a
// choice this person has.
export function myTerminalOwnRows(
  nav: NavLike,
  layout: MyTerminalLayout,
  reach: MyTerminalReach,
): { section: NavSectionLike; on: boolean }[] {
  const hidden = new Set(layout.hide);
  return (nativeWorkspace(nav)?.sections ?? [])
    .filter((s) => reachable(s, reach))
    .map((section) => ({ section, on: !hidden.has(section.key) }));
}

// The pinnable pool, grouped by the workspace each section lives in, for the
// editor's second half.
export function myTerminalPinRows(
  nav: NavLike,
  layout: MyTerminalLayout,
  reach: MyTerminalReach,
): { workspace: NavWorkspaceLike; sections: { section: NavSectionLike; on: boolean }[] }[] {
  const pinned = new Set(layout.add);
  const allowed = new Set(reach.workspaces);
  return nav.filter((w) => w.key !== MY_TERMINAL_WORKSPACE && allowed.has(w.key))
    .map((workspace) => ({
      workspace,
      sections: workspace.sections
        .filter((s) => reachable(s, reach))
        .map((section) => ({ section, on: pinned.has(section.key) })),
    }))
    .filter((group) => group.sections.length > 0);
}

// MY TERMINAL MAY NEVER BE EMPTIED. A workspace with no rows is one the sidebar
// draws as a heading over nothing, with no way back to the editor that emptied
// it — so the last row cannot be taken off. This is a rule about the RESULT, not
// about which row it is, so it holds however the two lists are edited.
export function canApplyMyTerminal(nav: NavLike, next: MyTerminalLayout, reach: MyTerminalReach): boolean {
  return myTerminalSections(nav, next, reach).length > 0;
}

export function toggleOwnRow(layout: MyTerminalLayout, key: string, on: boolean): MyTerminalLayout {
  const hide = layout.hide.filter((k) => k !== key);
  return { ...layout, hide: on ? hide : [...hide, key] };
}

export function togglePinnedRow(layout: MyTerminalLayout, key: string, on: boolean): MyTerminalLayout {
  const add = layout.add.filter((k) => k !== key);
  // Appended rather than inserted: a pin lands at the end of the board, which is
  // where somebody who just added it looks for it.
  return { ...layout, add: on ? [...add, key] : add };
}

// Record an arrangement. `keys` is the board as the user has just left it, in
// full — the editor knows every row it is showing, so there is nothing partial
// about what it hands over. What makes the STORED value partial is that the
// board it describes is only what exists today; `applyOrder` is where a row
// nobody has positioned finds its place.
export function reorderMyTerminal(layout: MyTerminalLayout, keys: readonly string[]): MyTerminalLayout {
  const next = [...new Set(keys.filter((k) => !!k))];
  // Keys already positioned but not on the board right now are KEPT, appended
  // after the new arrangement, so hiding a row and showing it again does not
  // cost the place it was given.
  const kept = layout.order.filter((k) => !next.includes(k));
  return { ...layout, order: [...next, ...kept] };
}

// Move one row by one place, for the keyboard and for touch — where the drag
// events never fire at all. `keys` is the board as currently rendered, so this
// works whether or not anything has been arranged before.
export function nudgeMyTerminal(
  layout: MyTerminalLayout,
  keys: readonly string[],
  key: string,
  delta: -1 | 1,
): MyTerminalLayout {
  const list = [...keys];
  const from = list.indexOf(key);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= list.length) return layout;
  list.splice(to, 0, ...list.splice(from, 1));
  return reorderMyTerminal(layout, list);
}

// True when the account has customized anything, so the editor can offer a reset
// and the sidebar can say the board is the default one.
export function isDefaultMyTerminal(layout: MyTerminalLayout): boolean {
  return layout.add.length === 0 && layout.hide.length === 0 && layout.order.length === 0;
}
