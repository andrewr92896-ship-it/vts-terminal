// Shared Series 65 quiz progress: the rolling answer history (persisted per user
// in localStorage) and the accuracy stats derived from it. Used by both the
// Practice Quiz and the Progress screen so they always agree.

import { SERIES65_TOPICS, type Series65Topic } from './series65Questions';

export const HISTORY_CAP = 400; // bound the stored rolling history

export interface HistEntry {
  topic: Series65Topic;
  correct: boolean;
}

export function historyKey(userId: string | undefined): string {
  return `vts_series65_history_${userId ?? 'anon'}`;
}

export function loadHistory(key: string): HistEntry[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e.correct === 'boolean' && SERIES65_TOPICS.includes(e.topic))
      .slice(-HISTORY_CAP);
  } catch {
    return [];
  }
}

export function saveHistory(key: string, history: HistEntry[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(history.slice(-HISTORY_CAP)));
  } catch {
    /* ignore storage failures */
  }
}

export interface Series65Stats {
  overall: number | null; // accuracy % over the last 100 answers
  overallN: number; // how many answers are in that window
  perTopic: Record<Series65Topic, { pct: number | null; n: number }>; // last 20 each
  total: number; // total answers recorded
}

function pct(window: HistEntry[]): number | null {
  return window.length ? Math.round((100 * window.filter((h) => h.correct).length) / window.length) : null;
}

export function computeStats(history: HistEntry[]): Series65Stats {
  const overallWindow = history.slice(-100);
  const perTopic = {} as Record<Series65Topic, { pct: number | null; n: number }>;
  for (const t of SERIES65_TOPICS) {
    const w = history.filter((h) => h.topic === t).slice(-20);
    perTopic[t] = { pct: pct(w), n: w.length };
  }
  return {
    overall: pct(overallWindow),
    overallN: overallWindow.length,
    perTopic,
    total: history.length,
  };
}
