import crypto from 'node:crypto';
import { inArray, lt } from 'drizzle-orm';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { terminalAuthLimits } from '../db/schema.js';

export const LOGIN_OTP_RESEND_COOLDOWN_MS = 30_000;
export const LOGIN_OTP_SEND_WINDOW_MS = 60 * 60_000;
export const LOGIN_OTP_SENDS_PER_USER = 5;
export const LOGIN_OTP_SENDS_PER_IP = 20;
export const TERMINAL_AUTH_FAILURE_WINDOW_MS = 15 * 60_000;
export const TERMINAL_AUTH_FAILURE_LIMIT = 5;
export const TERMINAL_AUTH_LOCK_MS = 15 * 60_000;

const IP_SEND_COOLDOWN_MS = 1_000;
const STALE_LIMIT_MS = 2 * 60 * 60_000;

function scopeId(value: string): string {
  return crypto
    .createHmac('sha256', `vts-terminal-auth-limit:${config.SESSION_SECRET}`)
    .update(value)
    .digest('hex');
}

interface Scope {
  id: string;
  maxSends: number;
  sendCooldownMs: number;
}

function authScopes(subject: string, ip: string): Scope[] {
  return [
    {
      id: scopeId(`subject:${subject}`),
      maxSends: LOGIN_OTP_SENDS_PER_USER,
      sendCooldownMs: LOGIN_OTP_RESEND_COOLDOWN_MS,
    },
    {
      id: scopeId(`ip:${ip || 'unknown'}`),
      maxSends: LOGIN_OTP_SENDS_PER_IP,
      sendCooldownMs: IP_SEND_COOLDOWN_MS,
    },
  ];
}

function retrySeconds(untilMs: number, nowMs: number): number {
  return Math.max(1, Math.ceil((untilMs - nowMs) / 1000));
}

export async function reserveTerminalTwoFactorSend(
  userId: string,
  ip: string,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const scopes = authScopes(`user:${userId}`, ip);
  const ids = scopes.map((scope) => scope.id);
  let blockedUntil = 0;

  await db.transaction(async (tx) => {
    const rows = await tx.select().from(terminalAuthLimits).where(inArray(terminalAuthLimits.id, ids));
    const byId = new Map(rows.map((row) => [row.id, row]));
    const nowMs = now.getTime();

    for (const scope of scopes) {
      const row = byId.get(scope.id);
      if (!row) continue;
      const lastSentAt = row.lastSentAt?.getTime() ?? 0;
      if (lastSentAt && nowMs - lastSentAt < scope.sendCooldownMs) {
        blockedUntil = Math.max(blockedUntil, lastSentAt + scope.sendCooldownMs);
      }
      const windowStartedAt = row.sendWindowStartedAt.getTime();
      if (nowMs - windowStartedAt < LOGIN_OTP_SEND_WINDOW_MS && row.sendCount >= scope.maxSends) {
        blockedUntil = Math.max(blockedUntil, windowStartedAt + LOGIN_OTP_SEND_WINDOW_MS);
      }
    }

    if (blockedUntil > nowMs) return;

    for (const scope of scopes) {
      const row = byId.get(scope.id);
      const inWindow = !!row && nowMs - row.sendWindowStartedAt.getTime() < LOGIN_OTP_SEND_WINDOW_MS;
      const sendWindowStartedAt = inWindow ? row.sendWindowStartedAt : now;
      const sendCount = inWindow ? row.sendCount + 1 : 1;
      const failureWindowStartedAt = row?.failureWindowStartedAt ?? now;
      await tx
        .insert(terminalAuthLimits)
        .values({
          id: scope.id,
          sendCount,
          sendWindowStartedAt,
          lastSentAt: now,
          failureCount: row?.failureCount ?? 0,
          failureWindowStartedAt,
          lockedUntil: row?.lockedUntil ?? null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: terminalAuthLimits.id,
          set: { sendCount, sendWindowStartedAt, lastSentAt: now, updatedAt: now },
        });
    }
  });

  return blockedUntil > now.getTime()
    ? { ok: false, retryAfter: retrySeconds(blockedUntil, now.getTime()) }
    : { ok: true };
}

export async function checkTerminalAuthLock(
  subject: string,
  ip: string,
  now = new Date(),
): Promise<{ locked: boolean; retryAfter: number }> {
  const ids = authScopes(subject, ip).map((scope) => scope.id);
  const rows = await db.select().from(terminalAuthLimits).where(inArray(terminalAuthLimits.id, ids));
  const nowMs = now.getTime();
  const until = rows.reduce((max, row) => Math.max(max, row.lockedUntil?.getTime() ?? 0), 0);
  return until > nowMs
    ? { locked: true, retryAfter: retrySeconds(until, nowMs) }
    : { locked: false, retryAfter: 0 };
}

export async function recordTerminalAuthFailure(
  subject: string,
  ip: string,
  now = new Date(),
): Promise<{ locked: boolean; retryAfter: number }> {
  const scopes = authScopes(subject, ip);
  let blockedUntil = 0;

  await db.transaction(async (tx) => {
    const ids = scopes.map((scope) => scope.id);
    const rows = await tx.select().from(terminalAuthLimits).where(inArray(terminalAuthLimits.id, ids));
    const byId = new Map(rows.map((row) => [row.id, row]));
    const nowMs = now.getTime();

    for (const scope of scopes) {
      const row = byId.get(scope.id);
      const inWindow =
        !!row && nowMs - row.failureWindowStartedAt.getTime() < TERMINAL_AUTH_FAILURE_WINDOW_MS;
      const failureWindowStartedAt = inWindow ? row.failureWindowStartedAt : now;
      const failureCount = inWindow ? row.failureCount + 1 : 1;
      const lockedUntil =
        failureCount >= TERMINAL_AUTH_FAILURE_LIMIT ? new Date(nowMs + TERMINAL_AUTH_LOCK_MS) : null;
      if (lockedUntil) blockedUntil = Math.max(blockedUntil, lockedUntil.getTime());
      await tx
        .insert(terminalAuthLimits)
        .values({
          id: scope.id,
          sendCount: row?.sendCount ?? 0,
          sendWindowStartedAt: row?.sendWindowStartedAt ?? now,
          lastSentAt: row?.lastSentAt ?? null,
          failureCount,
          failureWindowStartedAt,
          lockedUntil,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: terminalAuthLimits.id,
          set: { failureCount, failureWindowStartedAt, lockedUntil, updatedAt: now },
        });
    }
  });

  return blockedUntil > now.getTime()
    ? { locked: true, retryAfter: retrySeconds(blockedUntil, now.getTime()) }
    : { locked: false, retryAfter: 0 };
}

export async function clearTerminalAuthFailures(subject: string, ip: string): Promise<void> {
  const ids = authScopes(subject, ip).map((scope) => scope.id);
  await db
    .update(terminalAuthLimits)
    .set({
      failureCount: 0,
      failureWindowStartedAt: new Date(),
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(inArray(terminalAuthLimits.id, ids));
}

export async function purgeStaleTerminalAuthLimits(now = new Date()): Promise<void> {
  await db
    .delete(terminalAuthLimits)
    .where(lt(terminalAuthLimits.updatedAt, new Date(now.getTime() - STALE_LIMIT_MS)));
}
