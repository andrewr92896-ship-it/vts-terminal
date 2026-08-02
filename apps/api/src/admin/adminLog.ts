import crypto from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  adminLog,
  bugReports,
  earlyAccessRequests,
  supportRequests,
  type AdminLogState,
} from '../db/schema.js';

// The Administrator Log — what admins do, and what is waiting on them.
//
// It answers two questions on one screen: "what did an administrator do to
// somebody's account" and "what still needs a person". Those have different
// storage, deliberately:
//
//   • ADMIN ACTIONS are stored, in `admin_log`. A manual membership grant has no
//     other home, and the whole point of recording it is that it cannot be
//     un-recorded. Rows are written once and only ever resolved, never rewritten.
//
//   • TICKETS ARE PROJECTED, not copied. Bug reports, support requests and
//     early-access leads already carry their own status in their own tables, so
//     this module reads them at request time and presents them as log entries.
//     Copying them in would mean two rows that both claim to know whether a
//     ticket is open, and the day they disagree there is no way to say which is
//     right. Closing a bug report in the Bug Reports screen turns its entry green
//     here by itself, with nothing to keep in step.
//
// Suggestions are deliberately absent: they go to the software developers
// (Developer Terminal ▸ Suggestions), not to admins. Owner decision, 2026-08.

// The three states, and the colours they drive. These are distinct meanings, not
// a severity ladder:
//   • open     (red)   — still needs somebody.
//   • resolved (green) — was dealt with.
//   • info     (gray)  — a record of something that happened; asks nothing.
export type { AdminLogState };

export interface AdminLogEntry {
  id: string;
  kind: string;
  state: AdminLogState;
  title: string;
  detail: string | null;
  actorName: string | null;
  targetName: string | null;
  createdAt: number;
  resolvedAt: number | null;
  resolvedByName: string | null;
  // Where an entry that is not a stored row came from, so the screen can send
  // the reader to the section that can actually close it. Null for stored rows.
  source: 'bug' | 'support' | 'early_access' | null;
  sourceId: string | null;
}

// ---- Writing ----

export interface RecordInput {
  kind: string;
  state?: AdminLogState;
  title: string;
  detail?: string | null;
  actor?: { id: string; name: string } | null;
  target?: { id: string; name: string } | null;
}

// Record an administrative action. Best-effort by design: the log must never be
// the reason a legitimate admin action fails, so a caller that cannot write here
// still completes its work. The write is awaited (so a normal failure surfaces in
// the server log) but never allowed to throw upward.
export async function recordAdminAction(input: RecordInput): Promise<void> {
  try {
    await db.insert(adminLog).values({
      id: crypto.randomUUID(),
      kind: input.kind,
      state: input.state ?? 'info',
      title: input.title,
      detail: input.detail ?? null,
      actorId: input.actor?.id ?? null,
      actorName: input.actor?.name ?? null,
      targetUserId: input.target?.id ?? null,
      targetName: input.target?.name ?? null,
      createdAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
      resolvedByName: null,
    });
  } catch (err) {
    console.error('[admin-log] could not record action', input.kind, err);
  }
}

// Close a stored entry. Only ever applies to rows in `admin_log` — a projected
// ticket is closed in its own section, which is the only place that can actually
// resolve the underlying thing.
export async function resolveAdminLogEntry(
  id: string,
  by: { id: string; name: string },
): Promise<void> {
  await db
    .update(adminLog)
    .set({ resolvedAt: new Date(), resolvedBy: by.id, resolvedByName: by.name, state: 'resolved' })
    .where(eq(adminLog.id, id));
}

// ---- Reading ----

function personName(first: string, last: string | null): string {
  return last ? `${first} ${last}` : first;
}

// Everything, newest first: the stored actions merged with the live ticket
// projections. One list — the screen groups it by state, so an admin sees what
// is outstanding without having to visit four sections to find out.
export async function listAdminLog(limit = 300): Promise<AdminLogEntry[]> {
  const [stored, bugs, support, early] = await Promise.all([
    db.select().from(adminLog).orderBy(desc(adminLog.createdAt)).limit(limit),
    db.select().from(bugReports).orderBy(desc(bugReports.createdAt)).limit(limit),
    db.select().from(supportRequests).orderBy(desc(supportRequests.createdAt)).limit(limit),
    db.select().from(earlyAccessRequests).orderBy(desc(earlyAccessRequests.createdAt)).limit(limit),
  ]);

  const entries: AdminLogEntry[] = [];

  for (const r of stored) {
    entries.push({
      id: r.id,
      kind: r.kind,
      state: (r.state as AdminLogState) ?? 'info',
      title: r.title,
      detail: r.detail,
      actorName: r.actorName,
      targetName: r.targetName,
      createdAt: r.createdAt.getTime(),
      resolvedAt: r.resolvedAt ? r.resolvedAt.getTime() : null,
      resolvedByName: r.resolvedByName,
      source: null,
      sourceId: null,
    });
  }

  for (const r of bugs) {
    const done = r.status === 'resolved';
    entries.push({
      id: `bug:${r.id}`,
      kind: 'bug.reported',
      state: done ? 'resolved' : 'open',
      title: `Bug report from ${r.author}`,
      detail: r.summary,
      actorName: r.author,
      targetName: null,
      createdAt: r.createdAt.getTime(),
      // The source table has no "who closed it" column, so the log states when
      // it was last touched rather than inventing a name it does not know.
      resolvedAt: done ? r.updatedAt.getTime() : null,
      resolvedByName: null,
      source: 'bug',
      sourceId: r.id,
    });
  }

  for (const r of support) {
    const done = r.status === 'resolved';
    entries.push({
      id: `support:${r.id}`,
      kind: 'support.requested',
      state: done ? 'resolved' : 'open',
      title: `Support request from ${r.author}`,
      detail: r.summary,
      actorName: r.author,
      targetName: null,
      createdAt: r.createdAt.getTime(),
      resolvedAt: done ? r.updatedAt.getTime() : null,
      resolvedByName: null,
      source: 'support',
      sourceId: r.id,
    });
  }

  for (const r of early) {
    const done = r.status === 'handled';
    const who = personName(r.firstName, r.lastName);
    entries.push({
      id: `early:${r.id}`,
      kind: 'early_access.requested',
      state: done ? 'resolved' : 'open',
      title: `Early Access request from ${who}`,
      detail: r.email,
      actorName: who,
      targetName: null,
      createdAt: r.createdAt.getTime(),
      resolvedAt: null,
      resolvedByName: null,
      source: 'early_access',
      sourceId: r.id,
    });
  }

  entries.sort((a, b) => b.createdAt - a.createdAt);
  return entries.slice(0, limit);
}

// How many entries still need somebody. Drives the count beside the section in
// the sidebar, so an admin can see there is something waiting without opening it.
export async function countAdminLogOpen(): Promise<number> {
  const entries = await listAdminLog();
  return entries.filter((e) => e.state === 'open').length;
}
