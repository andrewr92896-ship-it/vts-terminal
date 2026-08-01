import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessionAlertPrefs, type SessionAlertPrefRow } from '../db/schema.js';

// A user's Strategy Session notification preferences: buzz me when one of my
// sessions opens, when it closes, and/or a set number of minutes before it opens
// or before it closes. One row per user; a user with no row has everything off
// (opt-in). Read by the Trading Alerts settings UI and the background session
// watch.

export interface SessionAlertPrefs {
  notifyOpen: boolean;
  notifyClose: boolean;
  notifyPreOpen: boolean;
  preOpenLeadMin: number; // minutes before open for the heads-up (1–240)
  notifyPreClose: boolean;
  preCloseLeadMin: number; // minutes before close for the wrap-up warning (1–240)
}

export const DEFAULT_SESSION_ALERT_PREFS: SessionAlertPrefs = {
  notifyOpen: false,
  notifyClose: false,
  notifyPreOpen: false,
  preOpenLeadMin: 30,
  notifyPreClose: false,
  preCloseLeadMin: 15,
};

function rowToPrefs(row: SessionAlertPrefRow): SessionAlertPrefs {
  return {
    notifyOpen: row.notifyOpen,
    notifyClose: row.notifyClose,
    notifyPreOpen: row.notifyPreOpen,
    preOpenLeadMin: row.preOpenLeadMin,
    notifyPreClose: row.notifyPreClose,
    preCloseLeadMin: row.preCloseLeadMin,
  };
}

// Both lead times share the same bounds as the route's validator; clamped here
// too so a direct service call can't store an out-of-range value.
function cleanLead(value: number, fallback: number): number {
  return Math.max(1, Math.min(240, Math.round(value) || fallback));
}

export async function getSessionAlertPrefs(userId: string): Promise<SessionAlertPrefs> {
  const row = (
    await db.select().from(sessionAlertPrefs).where(eq(sessionAlertPrefs.userId, userId)).limit(1)
  )[0];
  return row ? rowToPrefs(row) : { ...DEFAULT_SESSION_ALERT_PREFS };
}

export async function setSessionAlertPrefs(
  userId: string,
  prefs: SessionAlertPrefs,
): Promise<SessionAlertPrefs> {
  const lead = cleanLead(prefs.preOpenLeadMin, 30);
  const closeLead = cleanLead(prefs.preCloseLeadMin, 15);
  const now = new Date();
  await db
    .insert(sessionAlertPrefs)
    .values({
      id: crypto.randomUUID(),
      userId,
      notifyOpen: prefs.notifyOpen,
      notifyClose: prefs.notifyClose,
      notifyPreOpen: prefs.notifyPreOpen,
      preOpenLeadMin: lead,
      notifyPreClose: prefs.notifyPreClose,
      preCloseLeadMin: closeLead,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: sessionAlertPrefs.userId,
      set: {
        notifyOpen: prefs.notifyOpen,
        notifyClose: prefs.notifyClose,
        notifyPreOpen: prefs.notifyPreOpen,
        preOpenLeadMin: lead,
        notifyPreClose: prefs.notifyPreClose,
        preCloseLeadMin: closeLead,
        updatedAt: now,
      },
    });
  return { ...prefs, preOpenLeadMin: lead, preCloseLeadMin: closeLead };
}

// Every user who has opted into at least one session notification. The watch
// uses this to know whose sessions to inspect each tick.
export async function usersWithSessionAlerts(): Promise<
  { userId: string; prefs: SessionAlertPrefs }[]
> {
  const rows = await db.select().from(sessionAlertPrefs);
  return rows
    .map((r) => ({ userId: r.userId, prefs: rowToPrefs(r) }))
    .filter(
      (r) =>
        r.prefs.notifyOpen || r.prefs.notifyClose || r.prefs.notifyPreOpen || r.prefs.notifyPreClose,
    );
}
