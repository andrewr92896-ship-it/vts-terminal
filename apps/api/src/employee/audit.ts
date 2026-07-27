import crypto from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { employeeAuditLog, type EmployeeAuditRow } from '../db/schema.js';

// The employee portal's append-only audit trail. Every sign-in attempt, refusal,
// lockout and write lands here. Nothing in the portal updates or deletes a row,
// so the log is the record of what happened even when the underlying data has
// since changed.
//
// Writes are fire-and-forget on purpose: auditing must never be the reason a
// legitimate request fails, so a logging error is swallowed (and surfaced to the
// server log) rather than propagated to the caller.

export type AuditAction =
  // authentication
  | 'login.success'
  | 'login.failed'
  | 'login.locked'
  | 'login.denied'
  | 'login.totp_failed'
  | 'logout'
  | 'session.revoked'
  // second factor
  | '2fa.enrolled'
  | '2fa.reset'
  | '2fa.recovery_used'
  | '2fa.recovery_regenerated'
  // access control
  | 'access.denied'
  | 'access.blocked_ip'
  | 'access.csrf_rejected'
  // content
  | 'announcement.created'
  | 'announcement.updated'
  | 'announcement.deleted'
  | 'document.created'
  | 'document.updated'
  | 'document.deleted'
  // wording
  | 'copy.updated'
  | 'copy.reset'
  | 'copy.hidden'
  // tasks
  | 'task.assigned'
  // people
  | 'people.granted'
  | 'people.updated'
  | 'people.revoked';

export interface AuditInput {
  action: AuditAction;
  userId?: string | null;
  actor?: string | null;
  target?: string | null;
  detail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  ok?: boolean;
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    await db.insert(employeeAuditLog).values({
      id: crypto.randomUUID(),
      at: new Date(),
      userId: input.userId ?? null,
      actor: input.actor ?? null,
      action: input.action,
      target: input.target ?? null,
      detail: input.detail ?? null,
      ip: input.ip ?? null,
      // User agents are attacker-controlled and can be enormous; keep a usable
      // prefix rather than whatever was sent.
      userAgent: input.userAgent ? input.userAgent.slice(0, 300) : null,
      ok: input.ok ?? true,
    });
  } catch (err) {
    console.error('employee audit write failed', err);
  }
}

export interface AuditEntry {
  id: string;
  at: number;
  userId: string | null;
  actor: string | null;
  action: string;
  target: string | null;
  detail: string | null;
  ip: string | null;
  ok: boolean;
}

function toEntry(r: EmployeeAuditRow): AuditEntry {
  return {
    id: r.id,
    at: r.at.getTime(),
    userId: r.userId,
    actor: r.actor,
    action: r.action,
    target: r.target,
    detail: r.detail,
    ip: r.ip,
    ok: r.ok,
  };
}

// The whole trail (portal admins only) or one person's own activity.
export async function readAudit(
  opts: { userId?: string; limit?: number } = {},
): Promise<AuditEntry[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const base = db.select().from(employeeAuditLog);
  const rows = opts.userId
    ? await base.where(eq(employeeAuditLog.userId, opts.userId)).orderBy(desc(employeeAuditLog.at)).limit(limit)
    : await base.orderBy(desc(employeeAuditLog.at)).limit(limit);
  return rows.map(toEntry);
}
