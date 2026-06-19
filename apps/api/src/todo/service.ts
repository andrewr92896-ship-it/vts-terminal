import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  todoSections,
  todoItems,
  type TodoItemRow,
  type TodoSectionRow,
} from '../db/schema.js';
import { TODO_TEMPLATE } from './template.js';

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

// Create the default list for a user the first time they open To Do.
async function seedUser(userId: string): Promise<void> {
  const existing = await db
    .select({ id: todoSections.id })
    .from(todoSections)
    .where(eq(todoSections.userId, userId))
    .limit(1);
  if (existing[0]) return;

  const today = etTodayMs();
  const now = new Date();

  for (let s = 0; s < TODO_TEMPLATE.length; s++) {
    const tpl = TODO_TEMPLATE[s];
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
  if (hyphen) return 'dash';
  return 'check';
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
    const isCheck = (r: TodoItemRow) => markerFor(sec.type, r.hyphen) === 'check';
    // Completed checkable items float to the top (prototype behavior); the
    // rest keep their stored order.
    const ordered = (bySection.get(sec.id) ?? []).slice().sort((a, b) => {
      const ad = isCheck(a) && a.done;
      const bd = isCheck(b) && b.done;
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

export async function toggleItem(userId: string, itemId: string): Promise<void> {
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
}

export async function removeItem(userId: string, itemId: string): Promise<void> {
  await db
    .delete(todoItems)
    .where(and(eq(todoItems.id, itemId), eq(todoItems.userId, userId)));
}
