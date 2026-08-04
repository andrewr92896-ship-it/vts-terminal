import crypto from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  supportRequests,
  supportRequestMessages,
  type SupportRequestRow,
  type SupportRequestMessageRow,
} from '../db/schema.js';
import { aiConfigured, chatClaude, extractJson } from '../ai/claude.js';
import { getPrompt } from '../ai/prompts.js';
import { withGuardrails } from '../ai/guardrails.js';
import { addSuggestion, fileBugReportFromConversation } from '../feedback/service.js';

// The chat-bubble Support tab. A user picks a category — bug, suggestion, or a
// general question — and an AI intake collects the details it needs. The intake
// conversation is driven from the client and only persisted once it is complete,
// then routed to the right admin section:
//   bug        -> Bug Reports  (feedback.bugReports)
//   suggestion -> Suggestions  (feedback.suggestions)
//   support    -> Support      (supportRequests, below)

export const SUPPORT_KINDS = ['bug', 'suggestion', 'support'] as const;
export type SupportKind = (typeof SUPPORT_KINDS)[number];

const MAX_BODY = 4000;
const MAX_TURNS = 40;
// After this many reporter turns the intake always files, so it can never loop
// asking forever.
const FORCE_FILE_AT = 3;

export interface SupportMessage {
  role: 'user' | 'ai';
  body: string;
}

// The human label substituted into the {kind} placeholder of the intake prompt.
function kindLabel(kind: SupportKind): string {
  switch (kind) {
    case 'bug':
      return 'bug report';
    case 'suggestion':
      return 'suggestion';
    default:
      return 'general support question';
  }
}

function fallbackReply(kind: SupportKind, needMore: boolean): { needMore: boolean; reply: string } {
  if (needMore) {
    return {
      needMore: true,
      reply:
        kind === 'bug'
          ? 'Thanks for flagging this. Could you add a bit more — what were you doing right before it happened, and what did you expect to see instead?'
          : kind === 'suggestion'
            ? 'Could you say a little more about the problem it would solve or how you picture it working?'
            : 'Happy to help. Could you add a little more detail about what you need and where in the terminal you ran into it?',
    };
  }
  return {
    needMore: false,
    reply: `Thanks — your ${kindLabel(
      kind,
    )} has been sent to the admins. Reach out again anytime.`,
  };
}

// Run the AI intake over the current conversation and decide whether to ask for
// one more detail or hand it off. Best-effort: if AI is unconfigured or errors,
// fall back to a scripted reply (ask once on the first turn, then file).
async function triage(
  kind: SupportKind,
  conversation: SupportMessage[],
): Promise<{ needMore: boolean; reply: string }> {
  const userTurns = conversation.filter((m) => m.role === 'user').length;
  const forceFile = userTurns >= FORCE_FILE_AT;
  if (!aiConfigured()) return fallbackReply(kind, !forceFile && userTurns <= 1);

  const system = await withGuardrails((await getPrompt('support_intake')).replaceAll('{kind}', kindLabel(kind)), {
    structured: true,
  });
  const messages = conversation.map((m) => ({
    role: (m.role === 'ai' ? 'assistant' : 'user') as 'user' | 'assistant',
    content: m.body,
  }));
  if (forceFile) {
    messages.push({
      role: 'user',
      content:
        '(System: you now have enough detail. Do not ask anything else — thank them and confirm it was sent to the admins.)',
    });
  }
  try {
    const raw = await chatClaude(messages, system);
    const parsed = extractJson(raw) as { needMore?: unknown; reply?: unknown } | null;
    const reply = parsed && typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim() : '';
    const needMore = !forceFile && parsed?.needMore === true;
    if (!reply) return fallbackReply(kind, needMore);
    return { needMore, reply: reply.slice(0, 1500) };
  } catch {
    return fallbackReply(kind, !forceFile && userTurns <= 1);
  }
}

// Persist a completed general support request (the transcript, closing reply
// included) so it shows in the admin Support section.
async function fileSupportRequest(
  user: { id: string; displayName: string; teamId: string | null },
  conversation: SupportMessage[],
): Promise<void> {
  const firstUser = conversation.find((m) => m.role === 'user')?.body?.trim() ?? '';
  const summary = (firstUser.split('\n')[0] || 'Support request').slice(0, 140);
  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(supportRequests).values({
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
    await db.insert(supportRequestMessages).values({
      id: crypto.randomUUID(),
      requestId: id,
      role: m.role,
      body: m.body.slice(0, MAX_BODY),
      createdAt: new Date(at),
    });
    at += 1;
  }
}

// Compose the note stored on a filed suggestion from the intake — the reporter's
// own words (their turns), so the admin sees the idea in context.
function suggestionBody(conversation: SupportMessage[]): string {
  const said = conversation
    .filter((m) => m.role === 'user')
    .map((m) => m.body.trim())
    .filter(Boolean)
    .join('\n\n');
  return (said || 'Suggestion').slice(0, MAX_BODY);
}

export interface SupportTurnResult {
  needMore: boolean;
  reply: string;
  submitted: boolean;
}

// One turn of the Support tab intake. The client sends the whole conversation so
// far; we triage, and if the intake is complete we persist to the right admin
// destination and report submitted=true.
export async function supportTurn(
  user: { id: string; displayName: string; teamId: string | null },
  kind: SupportKind,
  conversation: SupportMessage[],
): Promise<SupportTurnResult> {
  const trimmed = conversation
    .filter((m) => typeof m.body === 'string' && m.body.trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role === 'ai' ? 'ai' : 'user', body: m.body.slice(0, MAX_BODY) } as SupportMessage));
  if (trimmed.length === 0 || trimmed[trimmed.length - 1].role !== 'user') {
    throw new Error('Say what you need and the assistant will help file it');
  }

  const { needMore, reply } = await triage(kind, trimmed);
  if (needMore) return { needMore: true, reply, submitted: false };

  // Complete — file it, closing reply included, to the matching admin section.
  const full: SupportMessage[] = [...trimmed, { role: 'ai', body: reply }];
  if (kind === 'bug') {
    await fileBugReportFromConversation(user, full);
  } else if (kind === 'suggestion') {
    await addSuggestion(user, suggestionBody(trimmed));
  } else {
    await fileSupportRequest(user, full);
  }
  return { needMore: false, reply, submitted: true };
}

// ---- Admin views (general support requests only) ----

export interface SupportRequestMessageView {
  id: string;
  role: 'user' | 'ai';
  body: string;
  createdAt: number;
}
export interface SupportRequestView {
  id: string;
  author: string;
  summary: string;
  status: string; // 'submitted' | 'resolved'
  createdAt: number;
  updatedAt: number;
  messages: SupportRequestMessageView[];
}

function toMessageView(row: SupportRequestMessageRow): SupportRequestMessageView {
  return { id: row.id, role: row.role === 'ai' ? 'ai' : 'user', body: row.body, createdAt: row.createdAt.getTime() };
}

async function messagesFor(requestId: string): Promise<SupportRequestMessageView[]> {
  const rows = await db
    .select()
    .from(supportRequestMessages)
    .where(eq(supportRequestMessages.requestId, requestId))
    .orderBy(supportRequestMessages.createdAt, supportRequestMessages.id);
  return rows.map(toMessageView);
}

async function toView(row: SupportRequestRow): Promise<SupportRequestView> {
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

export async function listSupportRequests(): Promise<SupportRequestView[]> {
  const rows = await db.select().from(supportRequests).orderBy(desc(supportRequests.createdAt), desc(supportRequests.id));
  return Promise.all(rows.map(toView));
}

export async function setSupportRequestStatus(
  id: string,
  status: 'submitted' | 'resolved',
): Promise<SupportRequestView[]> {
  await db.update(supportRequests).set({ status, updatedAt: new Date() }).where(eq(supportRequests.id, id));
  return listSupportRequests();
}

export async function removeSupportRequest(id: string): Promise<SupportRequestView[]> {
  await db.delete(supportRequests).where(eq(supportRequests.id, id));
  return listSupportRequests();
}

export async function latestSupportRequestAt(): Promise<number> {
  const rows = await db
    .select({ updatedAt: supportRequests.updatedAt })
    .from(supportRequests)
    .orderBy(desc(supportRequests.updatedAt))
    .limit(1);
  return rows[0]?.updatedAt ? rows[0].updatedAt.getTime() : 0;
}
