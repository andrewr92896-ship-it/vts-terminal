import type { TodoItemRow, TodoMarker, TodoSectionRow, TodoSectionType } from './types.js';

// To Do display rules, mirrored from apps/api/src/todo/service.ts.
//
// Kept as pure functions with no store in sight so both store implementations
// and the route share one definition of what a marker, a timer or a done daily
// item IS — the component that renders this is the portal's own, and two
// definitions would make one screen behave two ways.

const DAY = 86_400_000;

/** UTC-midnight of "today" in Eastern Time, so day differences are exact integers. */
export function etTodayMs(): number {
  return Date.parse(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()) + 'T00:00:00Z');
}

// The categories a new public account starts with: structure, no tasks. A blank
// screen with no shape to it is harder to start using than an empty one that
// already suggests where things go.
export const STARTER_SECTIONS: Array<{ n: number; icon: string; title: string; type: TodoSectionType; intervalDays: number | null }> = [
  { n: 1, icon: '⭐', title: 'Priority', type: 'one', intervalDays: null },
  { n: 2, icon: '📋', title: 'Daily Routine', type: 'daily', intervalDays: null },
  { n: 3, icon: '📋', title: 'Weekly', type: 'routine', intervalDays: 7 },
  { n: 4, icon: '📋', title: 'Monthly', type: 'routine', intervalDays: 30 },
  { n: 5, icon: '💰', title: 'Finance', type: 'one', intervalDays: null },
  { n: 6, icon: '🏠', title: 'Personal / Home', type: 'one', intervalDays: null },
];

export function markerFor(type: TodoSectionType, hyphen: boolean): TodoMarker {
  if (type === 'note') return 'dot';
  if (type === 'daily') return 'check';
  return hyphen ? 'dash' : 'check';
}

// A daily item counts as done only for the Eastern day it was checked. While
// checked, dueAt holds the next ET midnight; once today reaches it the check
// clears on its own, with no write needed to display it that way.
export function dailyDone(item: TodoItemRow, todayMs: number): boolean {
  return item.done && item.dueAt != null && item.dueAt > todayMs;
}

export interface DecoratedItem {
  id: string; code: string; text: string; marker: TodoMarker; checkable: boolean;
  done: boolean; recurring: boolean; timer: string | null; overdue: boolean; dueToday: boolean;
}

export function decorate(item: TodoItemRow, type: TodoSectionType, todayMs: number): DecoratedItem {
  const marker = markerFor(type, item.hyphen);
  if (type === 'daily') {
    // No timer or overdue here: the daily reset is implicit in the section, and
    // saying "due today" about something that is due every day is noise.
    return { id: item.id, code: '', text: item.text, marker: 'check', checkable: true,
      done: dailyDone(item, todayMs), recurring: false, timer: null, overdue: false, dueToday: false };
  }
  const checkable = marker === 'check';
  const recurring = item.intervalDays != null && item.dueAt != null;
  let timer: string | null = null; let overdue = false; let dueToday = false;
  if (recurring && item.dueAt != null) {
    const diff = Math.round((item.dueAt - todayMs) / DAY);
    if (diff > 0) timer = `+${diff} ${diff === 1 ? 'day' : 'days'}`;
    else if (diff === 0) { timer = 'due today'; dueToday = !item.done; overdue = !item.done; }
    else { timer = `${diff} ${diff === -1 ? 'day' : 'days'}`; overdue = !item.done; }
  }
  return { id: item.id, code: '', text: item.text, marker, checkable,
    // An unchecked-able line (a dash or a note bullet) is never "done" — it has
    // no checkbox, so reporting a stored true would draw a state nobody can set.
    done: checkable ? item.done : false, recurring, timer, overdue, dueToday };
}

export function buildSections(sections: TodoSectionRow[], items: TodoItemRow[], todayMs: number) {
  return sections
    .slice()
    .sort((a, b) => a.n - b.n)
    .map((s) => {
      const mine = items.filter((i) => i.sectionId === s.id).sort((a, b) => a.position - b.position);
      const decorated = mine.map((i) => decorate(i, s.type, todayMs));
      return {
        id: s.id, n: s.n, icon: s.icon, title: s.title, type: s.type,
        // `tag` is NOT a concept without a public meaning — the To Do screen
        // filters on `tag === 'trading'` and adds new items to the first
        // section carrying it, so a null tag is a screen that shows nothing
        // whatever is in it and cannot be added to either. Privately the tag
        // marks the desk's own list among several; publicly there is one To Do
        // screen and one list, so every section belongs on it.
        //
        // `life` stays false: it is a private-desk grouping with no public
        // counterpart, and the component reads it, so it is stated rather than
        // left undefined.
        tag: 'trading', life: false,
        // What is left to do, not how many lines there are — a checked task and
        // a reference dash both stop counting toward "still to do".
        count: decorated.filter((i) => i.checkable && !i.done).length,
        empty: decorated.length === 0,
        items: decorated,
      };
    });
}

/** The next ET midnight — how long a daily check lasts. */
export function nextEtMidnight(todayMs: number): number {
  return todayMs + DAY;
}
