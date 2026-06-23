import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  todoSections,
  todoItems,
  type TodoItemRow,
  type TodoSectionRow,
} from '../db/schema.js';
import { STARTER_SECTIONS } from './template.js';

const DAY = 86_400_000;

// UTC-midnight timestamp of "today" in Eastern Time. Storing all due dates
// the same way makes day differences exact integers regardless of zone.
function etTodayMs(): number {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
  }).format(new Date());
  return Date.parse(ymd + 'T00:00:00Z');
}

export type Marker = 'check' | 'dash' | 'dot';

export interface DecoratedItem {
  id: string;
  code: string;
  text: string;
  marker: Marker;
  checkable: boolean;
  done: boolean;
  recurring: boolean;
  timer: string | null;
  overdue: boolean;
  dueToday: boolean;
}

export interface DecoratedSection {
  id: string;
  n: number;
  icon: string;
  title: string;
  type: string;
  tag: string | null;
  life: boolean;
  count: number;
  empty: boolean;
  items: DecoratedItem[];
}

// Concurrent first-loads (e.g. React StrictMode firing two GETs at once)
// must not both seed. Share one in-flight seeding promise per user.
const seeding = new Map<string, Promise<void>>();

export async function ensureSeed(userId: string): Promise<void> {
  const inflight = seeding.get(userId);
  if (inflight) return inflight;
  const p = seedUser(userId);
  seeding.set(userId, p);
  try {
    await p;
  } finally {
    seeding.delete(userId);
  }
}

// Create the starter categories for a user the first time they open To Do.
// New users begin with empty categories (zero tasks); existing users are
// untouched because seeding only runs when a user has no sections yet.
async function seedUser(userId: string): Promise<void> {
  const existing = await db
    .select({ id: todoSections.id })
    .from(todoSections)
    .where(eq(todoSections.userId, userId))
    .limit(1);
  if (existing[0]) return;

  const today = etTodayMs();
  const now = new Date();

  for (let s = 0; s < STARTER_SECTIONS.length; s++) {
    const tpl = STARTER_SECTIONS[s];
    const sectionId = crypto.randomUUID();
    await db.insert(todoSections).values({
      id: sectionId,
      userId,
      n: tpl.n,
      icon: tpl.icon,
      title: tpl.title,
      type: tpl.type,
      tag: tpl.tag ?? null,
      life: !!tpl.life,
      position: s,
      createdAt: now,
    });

    for (let i = 0; i < tpl.items.length; i++) {
      const it = tpl.items[i];
      const recurring = tpl.type === 'routine';
      await db.insert(todoItems).values({
        id: crypto.randomUUID(),
        userId,
        sectionId,
        text: it.text,
        position: i,
        hyphen: !!it.hyphen,
        done: !!it.done,
        dueAt: recurring ? new Date(today + (it.offset ?? 0) * DAY) : null,
        intervalDays: recurring ? (tpl.intervalDays ?? null) : null,
        createdAt: now,
      });
    }
  }
}

function markerFor(type: string, hyphen: boolean): Marker {
  if (type === 'note') return 'dot';
  // Daily Routine items are checkable and reset every Eastern-Time day.
  if (type === 'daily') return 'check';
  if (hyphen) return 'dash';
  return 'check';
}

// A Daily Routine item counts as "done" only for the Eastern-Time day it was
// checked. While checked we store the next ET-midnight in dueAt; once today
// reaches that date the check clears on its own (no write needed to display
// it un-checked — toggle/normalize persist the reset on the next interaction).
function dailyDone(item: TodoItemRow, todayMs: number): boolean {
  return item.done && item.dueAt != null && item.dueAt.getTime() > todayMs;
}

// Recurring items auto-advance: once a completed task's due date passes,
// a new cycle begins (done clears, due date moves forward by the interval).
// Returns the possibly-updated row plus whether it changed.
function applyReset(
  item: TodoItemRow,
  todayMs: number,
): { item: TodoItemRow; changed: boolean } {
  if (item.intervalDays == null || item.dueAt == null) {
    return { item, changed: false };
  }
  if (!item.done) return { item, changed: false };
  let due = item.dueAt.getTime();
  if (due > todayMs) return { item, changed: false };
  while (due <= todayMs) due += item.intervalDays * DAY;
  return { item: { ...item, done: false, dueAt: new Date(due) }, changed: true };
}

function decorate(
  item: TodoItemRow,
  sectionType: string,
  todayMs: number,
): DecoratedItem {
  const marker = markerFor(sectionType, item.hyphen);

  // Daily Routine: checkable, resets each day, and shows no timer/overdue (the
  // daily reset is implicit in the section).
  if (sectionType === 'daily') {
    return {
      id: item.id,
      code: '',
      text: item.text,
      marker: 'check',
      checkable: true,
      done: dailyDone(item, todayMs),
      recurring: false,
      timer: null,
      overdue: false,
      dueToday: false,
    };
  }

  const checkable = marker === 'check';
  const recurring = item.intervalDays != null && item.dueAt != null;

  let timer: string | null = null;
  let overdue = false;
  let dueToday = false;

  if (recurring && item.dueAt) {
    const diff = Math.round((item.dueAt.getTime() - todayMs) / DAY);
    if (diff > 0) {
      timer = `+${diff} ${diff === 1 ? 'day' : 'days'}`;
    } else if (diff === 0) {
      timer = 'due today';
      dueToday = !item.done;
      overdue = !item.done;
    } else {
      timer = `${diff} ${diff === -1 ? 'day' : 'days'}`;
      overdue = !item.done;
    }
  }

  return {
    id: item.id,
    code: '',
    text: item.text,
    marker,
    checkable,
    done: checkable ? item.done : false,
    recurring,
    timer,
    overdue,
    dueToday,
  };
}

export async function getTodo(userId: string): Promise<DecoratedSection[]> {
  await ensureSeed(userId);
  const todayMs = etTodayMs();

  const sections = await db
    .select()
    .from(todoSections)
    .where(eq(todoSections.userId, userId));
  sections.sort((a, b) => a.position - b.position);

  const allItems = await db
    .select()
    .from(todoItems)
    .where(eq(todoItems.userId, userId));

  // Compute recurring resets for display only — GET performs no writes, so
  // concurrent reads never contend. The stored row is brought up to date the
  // next time the item is toggled (toggleItem applies the same reset first).
  const bySection = new Map<string, TodoItemRow[]>();
  for (const raw of allItems) {
    const { item } = applyReset(raw, todayMs);
    const list = bySection.get(item.sectionId) ?? [];
    list.push(item);
    bySection.set(item.sectionId, list);
  }

  return sections.map((sec: TodoSectionRow) => {
    // Effective done: daily items reset by day, so use the day-aware check.
    const doneNow = (r: TodoItemRow) =>
      sec.type === 'daily'
        ? dailyDone(r, todayMs)
        : markerFor(sec.type, r.hyphen) === 'check' && r.done;
    // Completed checkable items float to the top (prototype behavior); the
    // rest keep their stored order.
    const ordered = (bySection.get(sec.id) ?? []).slice().sort((a, b) => {
      const ad = doneNow(a);
      const bd = doneNow(b);
      if (ad !== bd) return ad ? -1 : 1;
      return a.position - b.position;
    });

    const items = ordered.map((r, idx) => {
      const d = decorate(r, sec.type, todayMs);
      d.code = `${sec.n}.${idx + 1}`;
      return d;
    });

    return {
      id: sec.id,
      n: sec.n,
      icon: sec.icon,
      title: sec.title,
      type: sec.type,
      tag: sec.tag,
      life: sec.life,
      count: items.length,
      empty: items.length === 0,
      items,
    };
  });
}

export async function addItem(
  userId: string,
  sectionId: string,
  text: string,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Empty task');

  const sec = (
    await db
      .select()
      .from(todoSections)
      .where(and(eq(todoSections.id, sectionId), eq(todoSections.userId, userId)))
      .limit(1)
  )[0];
  if (!sec) throw new Error('Section not found');

  // Negative position so new tasks appear first within their group.
  await db.insert(todoItems).values({
    id: crypto.randomUUID(),
    userId,
    sectionId,
    text: trimmed,
    position: -Date.now(),
    hyphen: sec.type === 'daily',
    done: false,
    dueAt: null,
    intervalDays: null,
    createdAt: new Date(),
  });
}

// Rename a task. Scoped to the calling user's own item; trims and caps length.
export async function updateItemText(userId: string, itemId: string, text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Empty task');
  const res = await db
    .update(todoItems)
    .set({ text: trimmed.slice(0, 500) })
    .where(and(eq(todoItems.id, itemId), eq(todoItems.userId, userId)));
  // libsql update returns rowsAffected; if nothing matched, the item isn't theirs.
  if ((res as { rowsAffected?: number }).rowsAffected === 0) throw new Error('Item not found');
}

// The persisted state of an item before a toggle, so the client can undo a
// check/uncheck (restoring the exact done flag and due date).
export interface ItemState {
  done: boolean;
  dueAt: number | null; // ms
}

export async function toggleItem(userId: string, itemId: string): Promise<ItemState> {
  const item = (
    await db
      .select()
      .from(todoItems)
      .where(and(eq(todoItems.id, itemId), eq(todoItems.userId, userId)))
      .limit(1)
  )[0];
  if (!item) throw new Error('Item not found');

  // Only checkable items toggle (not daily dashes or note dots).
  const sec = (
    await db
      .select({ type: todoSections.type })
      .from(todoSections)
      .where(eq(todoSections.id, item.sectionId))
      .limit(1)
  )[0];
  if (!sec || markerFor(sec.type, item.hyphen) !== 'check') {
    throw new Error('Item is not checkable');
  }

  // Snapshot the stored state up front so a toggle can be undone exactly.
  const previous: ItemState = { done: item.done, dueAt: item.dueAt ? item.dueAt.getTime() : null };

  // Daily Routine: check sets done for today (next reset = next ET midnight);
  // unchecking clears it.
  if (sec.type === 'daily') {
    const todayMs = etTodayMs();
    if (dailyDone(item, todayMs)) {
      await db.update(todoItems).set({ done: false, dueAt: null }).where(eq(todoItems.id, itemId));
    } else {
      await db
        .update(todoItems)
        .set({ done: true, dueAt: new Date(todayMs + DAY) })
        .where(eq(todoItems.id, itemId));
    }
    return previous;
  }

  if (item.intervalDays != null && item.dueAt != null) {
    const todayMs = etTodayMs();
    // Match what the user sees: bring any elapsed cycles up to date first.
    const { item: eff } = applyReset(item, todayMs);
    if (eff.done && eff.dueAt) {
      // Currently shown complete -> uncheck (persisting any reset advance).
      await db
        .update(todoItems)
        .set({ done: false, dueAt: eff.dueAt })
        .where(eq(todoItems.id, itemId));
    } else if (eff.dueAt) {
      // Complete: if it is due or overdue, schedule the next cycle.
      const dueMs = eff.dueAt.getTime();
      const nextDue =
        dueMs <= todayMs ? new Date(todayMs + (eff.intervalDays ?? 0) * DAY) : eff.dueAt;
      await db
        .update(todoItems)
        .set({ done: true, dueAt: nextDue })
        .where(eq(todoItems.id, itemId));
    }
  } else {
    await db.update(todoItems).set({ done: !item.done }).where(eq(todoItems.id, itemId));
  }
  return previous;
}

// Restore an item's done flag and due date to a captured state — the undo for a
// check/uncheck. Scoped to the calling user's own item.
export async function setItemState(
  userId: string,
  itemId: string,
  state: ItemState,
): Promise<void> {
  await db
    .update(todoItems)
    .set({ done: state.done, dueAt: state.dueAt != null ? new Date(state.dueAt) : null })
    .where(and(eq(todoItems.id, itemId), eq(todoItems.userId, userId)));
}

// The raw fields needed to restore a removed task exactly (undo).
export interface RemovedTodoItem {
  id: string;
  sectionId: string;
  text: string;
  position: number;
  hyphen: boolean;
  done: boolean;
  dueAt: number | null; // ms
  intervalDays: number | null;
}

// Remove a task and return its raw data so the client can offer an undo.
export async function removeItem(
  userId: string,
  itemId: string,
): Promise<RemovedTodoItem | null> {
  const row = (
    await db
      .select()
      .from(todoItems)
      .where(and(eq(todoItems.id, itemId), eq(todoItems.userId, userId)))
      .limit(1)
  )[0];
  if (!row) return null;

  await db
    .delete(todoItems)
    .where(and(eq(todoItems.id, itemId), eq(todoItems.userId, userId)));

  return {
    id: row.id,
    sectionId: row.sectionId,
    text: row.text,
    position: row.position,
    hyphen: row.hyphen,
    done: row.done,
    dueAt: row.dueAt ? row.dueAt.getTime() : null,
    intervalDays: row.intervalDays,
  };
}

// Re-insert a previously removed task (undo). Only restores into a section the
// user still owns; ignored if the same id already exists.
export async function restoreItem(
  userId: string,
  item: RemovedTodoItem,
): Promise<void> {
  const section = (
    await db
      .select({ id: todoSections.id })
      .from(todoSections)
      .where(and(eq(todoSections.id, item.sectionId), eq(todoSections.userId, userId)))
      .limit(1)
  )[0];
  if (!section) return; // section was deleted; nothing to restore into

  await db
    .insert(todoItems)
    .values({
      id: item.id,
      userId,
      sectionId: item.sectionId,
      text: item.text,
      position: item.position,
      hyphen: item.hyphen,
      done: item.done,
      dueAt: item.dueAt != null ? new Date(item.dueAt) : null,
      intervalDays: item.intervalDays,
      createdAt: new Date(),
    })
    .onConflictDoNothing();
}
