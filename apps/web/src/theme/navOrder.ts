import { NAV, type NavWorkspace } from './nav';
import type { NavOrderOverride } from '../api/types';

// Applies a founder-set sidebar ordering (see AdminSidebarLayout) over the
// code-default nav. The override is intentionally forgiving so it survives code
// changes to nav.ts:
//   - items listed in the override render first, in the override's order;
//   - items the override doesn't mention (e.g. a section added in code after the
//     override was saved) keep their default order, appended after the listed
//     ones — so new nav never disappears just because an old override exists;
//   - keys in the override that no longer exist in code are ignored.
// Pure: returns new arrays/objects, never mutating the input or NAV.

function orderBy<T>(items: T[], keyOf: (t: T) => string, order: string[] | undefined): T[] {
  if (!order || order.length === 0) return items;
  const rank = new Map(order.map((k, i) => [k, i]));
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      // Known keys sort by their override position; unknown keys fall to the end
      // but keep their original relative order (stable via the source index).
      const ra = rank.has(keyOf(a.item)) ? (rank.get(keyOf(a.item)) as number) : order.length + a.i;
      const rb = rank.has(keyOf(b.item)) ? (rank.get(keyOf(b.item)) as number) : order.length + b.i;
      return ra - rb;
    })
    .map((x) => x.item);
}

export function applyNavOrder(
  nav: NavWorkspace[],
  override: NavOrderOverride | null | undefined,
): NavWorkspace[] {
  if (!override) return nav;
  const workspaces = orderBy(nav, (w) => w.key, override.workspaces);
  return workspaces.map((w) => ({
    ...w,
    sections: orderBy(w.sections, (s) => s.key, override.sections?.[w.key]),
  }));
}

// Snapshot a nav array's current order into an override shape — used to seed the
// editor's working draft from the (already-ordered) nav.
export function buildNavOrder(nav: NavWorkspace[]): NavOrderOverride {
  const sections: Record<string, string[]> = {};
  for (const w of nav) sections[w.key] = w.sections.map((s) => s.key);
  return { workspaces: nav.map((w) => w.key), sections };
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

// Whether an override matches the code-default order (so the editor can clear
// the stored override instead of persisting a redundant copy).
export function isDefaultOrder(override: NavOrderOverride): boolean {
  const def = buildNavOrder(NAV);
  if (!sameOrder(override.workspaces, def.workspaces)) return false;
  const keys = new Set([...Object.keys(def.sections), ...Object.keys(override.sections)]);
  for (const k of keys) {
    if (!sameOrder(override.sections[k] ?? [], def.sections[k] ?? [])) return false;
  }
  return true;
}
