import crypto from 'node:crypto';
import { desc, eq, inArray, ne } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  bugReportMessages,
  bugReports,
  suggestions,
  type BugReportRow,
  type BugReportMessageRow,
  type SuggestionRow,
} from '../db/schema.js';
import { aiConfigured, chatClaude, extractJson } from '../ai/claude.js';
import { getPrompt } from '../ai/prompts.js';
import { withGuardrails } from '../ai/guardrails.js';
import { sendToUsers } from '../notifications/push.js';
import { sendPushoverToUsers } from '../notifications/pushover.js';

// Suggestions & bug reports submitted from the Site Help workspace. Both land in
// the Admin workspace. Suggestions are a plain note; bug reports run through a
// short AI intake that either asks the reporter for one more detail or thanks
// them and files the ticket for the admins.

const MAX_BODY = 4000;

// ---- Suggestions ----

export interface SuggestionView {
  id: string;
  author: string;
  body: string;
  status: string;
  createdAt: number;
}

function toSuggestionView(row: SuggestionRow): SuggestionView {
  return { id: row.id, author: row.author, body: row.body, status: row.status, createdAt: row.createdAt.getTime() };
}

export async function addSuggestion(
  user: { id: string; displayName: string; teamId: string | null },
  body: string,
): Promise<SuggestionView> {
  const text = body.trim();
  if (!text) throw new Error('A suggestion is required');
  const row = {
    id: crypto.randomUUID(),
    userId: user.id,
    author: user.displayName,
    teamId: user.teamId,
    body: text.slice(0, MAX_BODY),
    status: 'new',
    createdAt: new Date(),
  };
  await db.insert(suggestions).values(row);
  return toSuggestionView(row as SuggestionRow);
}

export async function listSuggestions(): Promise<SuggestionView[]> {
  const rows = await db.select().from(suggestions).orderBy(desc(suggestions.createdAt), desc(suggestions.id));
  return rows.map(toSuggestionView);
}

export async function setSuggestionStatus(id: string, status: 'new' | 'reviewed'): Promise<SuggestionView[]> {
  await db.update(suggestions).set({ status }).where(eq(suggestions.id, id));
  return listSuggestions();
}

export async function removeSuggestion(id: string): Promise<SuggestionView[]> {
  await db.delete(suggestions).where(eq(suggestions.id, id));
  return listSuggestions();
}

export async function latestSuggestionAt(): Promise<number> {
  const rows = await db
    .select({ createdAt: suggestions.createdAt })
    .from(suggestions)
    .orderBy(desc(suggestions.createdAt))
    .limit(1);
  return rows[0]?.createdAt ? rows[0].createdAt.getTime() : 0;
}

// ---- Bug reports (with AI intake) ----

export interface BugMessageView {
  id: string;
  role: 'user' | 'ai' | 'admin';
  body: string;
  createdAt: number;
}
export interface BugReportView {
  id: string;
  author: string;
  summary: string;
  status: string; // 'open' | 'submitted' | 'resolved'
  createdAt: number;
  updatedAt: number;
  messages: BugMessageView[];
}

function toBugMessageView(row: BugReportMessageRow): BugMessageView {
  const role = row.role === 'ai' ? 'ai' : row.role === 'admin' ? 'admin' : 'user';
  return { id: row.id, role, body: row.body, createdAt: row.createdAt.getTime() };
}

async function messagesFor(reportId: string): Promise<BugMessageView[]> {
  const rows = await db
    .select()
    .from(bugReportMessages)
    .where(eq(bugReportMessages.reportId, reportId))
    .orderBy(bugReportMessages.createdAt, bugReportMessages.id);
  return rows.map(toBugMessageView);
}

async function toBugReportView(row: BugReportRow): Promise<BugReportView> {
  return {
    id: row.id,
    author: row.author,
    summary: row.summary,
    status: row.status,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    messages: await messagesFor(row.id),
  };
}

// The support-intake persona is admin-editable (Admin ▸ AI Instructions,
// prompt id "support"); the default lives in ai/prompts.ts.

function fallbackReply(needMore: boolean): { needMore: boolean; reply: string } {
  return needMore
    ? {
        needMore: true,
        reply:
          'Thanks for flagging this. Could you add a bit more detail — what were you doing right before it happened, and what did you expect to see instead?',
      }
    : {
        needMore: false,
        reply:
          'Thanks for the report. Your ticket has been sent to the admins. Reach out again if anything else comes up.',
      };
}

// Run the AI intake over the current conversation and decide whether to ask for
// more detail or file the ticket. Best-effort: if AI is unconfigured or errors,
// fall back to a sensible scripted reply (ask once on the first turn, then file).
async function triage(
  conversation: BugMessageView[],
  turnIndex: number,
): Promise<{ needMore: boolean; reply: string }> {
  // Never keep asking forever: after two clarifying rounds, always file.
  const forceFile = turnIndex >= 2;
  if (!aiConfigured()) return fallbackReply(!forceFile && turnIndex === 0);
  const messages = conversation.map((m) => ({
    role: (m.role === 'ai' ? 'assistant' : 'user') as 'user' | 'assistant',
    content: m.body,
  }));
  if (forceFile) {
    messages.push({
      role: 'user',
      content: '(System: you now have enough detail. Do not ask anything else — thank them and confirm the ticket was sent to the admins.)',
    });
  }
  try {
    const raw = await chatClaude(messages, await withGuardrails(await getPrompt('support'), { structured: true }));
    const parsed = extractJson(raw) as { needMore?: unknown; reply?: unknown } | null;
    const reply = parsed && typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim() : '';
    const needMore = !forceFile && parsed?.needMore === true;
    if (!reply) return fallbackReply(needMore);
    return { needMore, reply: reply.slice(0, 1500) };
  } catch {
    return fallbackReply(!forceFile && turnIndex === 0);
  }
}

async function insertMessage(reportId: string, role: 'user' | 'ai' | 'admin', body: string, at: Date): Promise<void> {
  await db.insert(bugReportMessages).values({
    id: crypto.randomUUID(),
    reportId,
    role,
    body: body.slice(0, MAX_BODY),
    createdAt: at,
  });
}

// Open a new bug report from the reporter's first message and return it with the
// AI's first reply appended.
export async function createBugReport(
  user: { id: string; displayName: string; teamId: string | null },
  body: string,
): Promise<BugReportView> {
  const text = body.trim();
  if (!text) throw new Error('Describe the bug to report it');
  const now = new Date();
  const id = crypto.randomUUID();
  const summary = text.split('\n')[0].slice(0, 140);
  await db.insert(bugReports).values({
    id,
    userId: user.id,
    author: user.displayName,
    teamId: user.teamId,
    summary,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  });
  await insertMessage(id, 'user', text, now);

  const conversation: BugMessageView[] = [{ id: 'seed', role: 'user', body: text, createdAt: now.getTime() }];
  const result = await triage(conversation, 0);
  await insertMessage(id, 'ai', result.reply, new Date());
  await db
    .update(bugReports)
    .set({ status: result.needMore ? 'open' : 'submitted', updatedAt: new Date() })
    .where(eq(bugReports.id, id));

  const row = (await db.select().from(bugReports).where(eq(bugReports.id, id)).limit(1))[0];
  return toBugReportView(row);
}

// File a completed bug report straight from an intake conversation (used by the
// chat-bubble Support tab, whose AI intake runs client-side and only persists
// once it has enough detail). The whole transcript is stored so the admin sees
// the same clarified thread a Site Help report produces, and it lands 'submitted'.
export async function fileBugReportFromConversation(
  user: { id: string; displayName: string; teamId: string | null },
  conversation: { role: 'user' | 'ai'; body: string }[],
): Promise<void> {
  const firstUser = conversation.find((m) => m.role === 'user')?.body?.trim() ?? '';
  const summary = (firstUser.split('\n')[0] || 'Bug report').slice(0, 140);
  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(bugReports).values({
    id,
    userId: user.id,
    author: user.displayName,
    teamId: user.teamId,
    summary,
    status: 'submitted',
    createdAt: now,
    updatedAt: now,
  });
  let at = now.getTime();
  for (const m of conversation) {
    // Preserve ordering with strictly increasing timestamps.
    await insertMessage(id, m.role, m.body, new Date(at));
    at += 1;
  }
}

export class BugReportForbiddenError extends Error {}
export class BugReportClosedError extends Error {}

// Append a reporter reply. While the report is still in AI intake (no admin has
// joined) this runs the intake again to gather detail or file the ticket. Once
// an admin has replied, the thread is a human ↔ human conversation: the reply is
// just appended and the AI stays out of it.
export async function replyToBugReport(
  user: { id: string },
  reportId: string,
  body: string,
): Promise<BugReportView> {
  const text = body.trim();
  if (!text) throw new Error('A reply is required');
  const report = (await db.select().from(bugReports).where(eq(bugReports.id, reportId)).limit(1))[0];
  if (!report) throw new Error('Report not found');
  if (report.userId !== user.id) throw new BugReportForbiddenError('This is not your report');

  const before = await messagesFor(reportId);
  const adminJoined = before.some((m) => m.role === 'admin');

  if (report.status === 'resolved') throw new BugReportClosedError('This report has been resolved');
  // Before an admin joins, replies are only allowed while the AI is still asking
  // for detail ('open'); a plain AI-filed ticket ('submitted') is closed.
  if (!adminJoined && report.status !== 'open') {
    throw new BugReportClosedError('This report has already been submitted');
  }

  const now = new Date();
  await insertMessage(reportId, 'user', text, now);

  if (adminJoined) {
    // Human conversation — no AI turn. Keep it active for the admin to see.
    await db.update(bugReports).set({ status: 'submitted', updatedAt: now }).where(eq(bugReports.id, reportId));
    const row = (await db.select().from(bugReports).where(eq(bugReports.id, reportId)).limit(1))[0];
    return toBugReportView(row);
  }

  // AI intake mode: how many reporter turns so far (this new one included)? Used
  // to cap the clarification loop.
  const existing = await messagesFor(reportId);
  const userTurns = existing.filter((m) => m.role === 'user').length; // includes the one just added
  const result = await triage(existing, userTurns - 1);
  await insertMessage(reportId, 'ai', result.reply, new Date());
  await db
    .update(bugReports)
    .set({ status: result.needMore ? 'open' : 'submitted', updatedAt: new Date() })
    .where(eq(bugReports.id, reportId));

  const row = (await db.select().from(bugReports).where(eq(bugReports.id, reportId)).limit(1))[0];
  return toBugReportView(row);
}

// An admin replies to a bug report from the admin Bug Reports section. This posts
// a human 'admin' turn (no AI), marks the ticket active ('submitted') so it isn't
// mistaken for done, and notifies the reporter that they have a reply. The admin
// is authenticated at the route; replies show generically as "Admin".
export async function adminReplyToBugReport(reportId: string, body: string): Promise<BugReportView[]> {
  const text = body.trim();
  if (!text) throw new Error('A reply is required');
  const report = (await db.select().from(bugReports).where(eq(bugReports.id, reportId)).limit(1))[0];
  if (!report) throw new Error('Report not found');

  const now = new Date();
  await insertMessage(reportId, 'admin', text, now);
  await db.update(bugReports).set({ status: 'submitted', updatedAt: now }).where(eq(bugReports.id, reportId));

  // Let the reporter know a human replied (best-effort; never blocks the reply).
  const preview = text.length > 120 ? `${text.slice(0, 120)}…` : text;
  try {
    await Promise.allSettled([
      sendToUsers([report.userId], {
        title: 'Reply to your bug report',
        body: preview,
        url: '/',
        tag: `bug-${reportId}`,
      }),
      sendPushoverToUsers([report.userId], {
        title: 'Reply to your bug report',
        message: preview,
      }),
    ]);
  } catch {
    /* notifications are best-effort */
  }

  return listAllBugReports();
}

// A reporter's own list of the bug reports they have filed (for the Site Help UI).
export async function listMyBugReports(userId: string): Promise<BugReportView[]> {
  const rows = await db
    .select()
    .from(bugReports)
    .where(eq(bugReports.userId, userId))
    .orderBy(desc(bugReports.createdAt), desc(bugReports.id));
  return Promise.all(rows.map(toBugReportView));
}

// Every bug report, for the admin Bug Reports section.
export async function listAllBugReports(): Promise<BugReportView[]> {
  const rows = await db.select().from(bugReports).orderBy(desc(bugReports.createdAt), desc(bugReports.id));
  return Promise.all(rows.map(toBugReportView));
}

export async function setBugReportStatus(
  id: string,
  status: 'open' | 'submitted' | 'resolved',
): Promise<BugReportView[]> {
  await db.update(bugReports).set({ status, updatedAt: new Date() }).where(eq(bugReports.id, id));
  return listAllBugReports();
}

export async function removeBugReport(id: string): Promise<BugReportView[]> {
  await db.delete(bugReports).where(eq(bugReports.id, id));
  return listAllBugReports();
}

export async function latestBugReportAt(): Promise<number> {
  const rows = await db
    .select({ updatedAt: bugReports.updatedAt })
    .from(bugReports)
    .orderBy(desc(bugReports.updatedAt))
    .limit(1);
  return rows[0]?.updatedAt ? rows[0].updatedAt.getTime() : 0;
}

// How many bug reports are still waiting on a person: not resolved, and with no
// admin reply after the reporter's latest message. The AI intake's own replies
// don't count — it answers every report instantly, so counting them would mean
// nothing ever reads as waiting. This drives the sidebar's Bug Reports dot, so
// the dot is a live state ("someone still needs to answer this") rather than a
// "since you last looked" reading that a resolved report could leave stuck on.
export async function countBugReportsAwaiting(): Promise<number> {
  const reports = await db
    .select({ id: bugReports.id })
    .from(bugReports)
    .where(ne(bugReports.status, 'resolved'));
  if (!reports.length) return 0;

  const msgs = await db
    .select({ reportId: bugReportMessages.reportId, role: bugReportMessages.role, createdAt: bugReportMessages.createdAt })
    .from(bugReportMessages)
    .where(inArray(bugReportMessages.reportId, reports.map((r) => r.id)));

  const lastUser = new Map<string, number>();
  const lastAdmin = new Map<string, number>();
  for (const m of msgs) {
    const at = m.createdAt.getTime();
    const map = m.role === 'admin' ? lastAdmin : m.role === 'ai' ? null : lastUser;
    if (!map) continue;
    if ((map.get(m.reportId) ?? -1) < at) map.set(m.reportId, at);
  }

  let awaiting = 0;
  for (const r of reports) {
    const user = lastUser.get(r.id);
    if (user === undefined) continue; // nothing from the reporter to answer
    if ((lastAdmin.get(r.id) ?? -1) < user) awaiting += 1;
  }
  return awaiting;
}
