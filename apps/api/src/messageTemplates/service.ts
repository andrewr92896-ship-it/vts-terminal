import crypto from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  messageTemplates,
  MESSAGE_TEMPLATE_KINDS,
  type MessageTemplateKind,
  type MessageTemplateRow,
} from '../db/schema.js';

// The shared admin copy library. Software developers (founder-level) author the
// templates; every admin can read and copy them. Templates are site-wide, not
// per-user, so there is no scoping here — one list for the whole terminal.

const MAX_TITLE = 160;
const MAX_SUBJECT = 200;
const MAX_BODY = 8000;

export class MessageTemplateError extends Error {}

export interface MessageTemplateView {
  id: string;
  kind: MessageTemplateKind;
  title: string;
  subject: string | null;
  body: string;
  createdByName: string | null;
  createdAt: number;
  updatedAt: number;
}

function toView(row: MessageTemplateRow): MessageTemplateView {
  return {
    id: row.id,
    kind: (MESSAGE_TEMPLATE_KINDS as readonly string[]).includes(row.kind)
      ? (row.kind as MessageTemplateKind)
      : 'sms',
    title: row.title,
    subject: row.subject ?? null,
    body: row.body,
    createdByName: row.createdByName ?? null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

// Ordered by explicit position, then newest first — a stable list an author can
// arrange while keeping fresh templates near the top when positions tie.
export async function listMessageTemplates(): Promise<MessageTemplateView[]> {
  const rows = await db
    .select()
    .from(messageTemplates)
    .orderBy(asc(messageTemplates.position), asc(messageTemplates.title));
  return rows.map(toView);
}

export interface MessageTemplateInput {
  kind: MessageTemplateKind;
  title: string;
  subject?: string | null;
  body: string;
}

export async function createMessageTemplate(
  author: { id: string; displayName: string },
  input: MessageTemplateInput,
): Promise<MessageTemplateView[]> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new MessageTemplateError('A template title is required');
  if (!body) throw new MessageTemplateError('Template text is required');
  const kind: MessageTemplateKind = input.kind === 'email' ? 'email' : 'sms';
  const subject = kind === 'email' ? (input.subject ?? '').trim().slice(0, MAX_SUBJECT) : '';

  // Append to the end of the list.
  const existing = await db
    .select({ position: messageTemplates.position })
    .from(messageTemplates)
    .orderBy(asc(messageTemplates.position));
  const nextPos = existing.length ? Math.max(...existing.map((r) => r.position)) + 1 : 0;

  const now = new Date();
  await db.insert(messageTemplates).values({
    id: crypto.randomUUID(),
    kind,
    title: title.slice(0, MAX_TITLE),
    subject: subject || null,
    body: body.slice(0, MAX_BODY),
    createdBy: author.id,
    createdByName: author.displayName,
    position: nextPos,
    createdAt: now,
    updatedAt: now,
  });
  return listMessageTemplates();
}

export interface MessageTemplatePatch {
  kind?: MessageTemplateKind;
  title?: string;
  subject?: string | null;
  body?: string;
}

export async function updateMessageTemplate(
  id: string,
  patch: MessageTemplatePatch,
): Promise<MessageTemplateView[]> {
  const row = (await db.select().from(messageTemplates).where(eq(messageTemplates.id, id)).limit(1))[0];
  if (!row) throw new MessageTemplateError('Template not found');

  const set: Partial<MessageTemplateRow> = { updatedAt: new Date() };
  if (patch.kind !== undefined) set.kind = patch.kind === 'email' ? 'email' : 'sms';
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) throw new MessageTemplateError('A template title is required');
    set.title = title.slice(0, MAX_TITLE);
  }
  if (patch.body !== undefined) {
    const body = patch.body.trim();
    if (!body) throw new MessageTemplateError('Template text is required');
    set.body = body.slice(0, MAX_BODY);
  }
  if (patch.subject !== undefined) {
    const subject = (patch.subject ?? '').trim().slice(0, MAX_SUBJECT);
    set.subject = subject || null;
  }
  // A template switched away from email loses its now-meaningless subject line.
  if (set.kind === 'sms') set.subject = null;

  await db.update(messageTemplates).set(set).where(eq(messageTemplates.id, id));
  return listMessageTemplates();
}

export async function removeMessageTemplate(id: string): Promise<MessageTemplateView[]> {
  await db.delete(messageTemplates).where(eq(messageTemplates.id, id));
  return listMessageTemplates();
}
