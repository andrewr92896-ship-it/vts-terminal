import type { StudyBugContext } from '../api/types';

// "Report a problem" — from wherever it went wrong, into the bug report flow the
// terminal already has.
//
// There is deliberately NO second ticketing system here. The chat bubble's
// Support tab, its AI intake, `bug_reports` and Admin ▸ Bug Reports are all
// unchanged; this is a channel that opens that surface with the machine context
// already attached, so somebody whose import failed does not have to describe
// the schema version they were on.
//
// A module-level pending value plus listeners, matching `studiesNav.ts`. The
// alternative — threading a callback from Portal down through the wizard, the
// handoff step and the importer — would put a prop on six components that only
// two of them use.

export interface ProblemReport {
  /** The opening line the thread starts with, in the reporter's stead. */
  intro: string;
  /** Whitelisted machine context. Never study content — see api/support/studyContext. */
  context: StudyBugContext;
  /**
   * A fragment the user may choose to include, offered but not attached.
   *
   * Held here rather than folded into `context` so the composer can show it as
   * an explicit choice: attaching study content to a bug report is a decision
   * the person makes, not a default the code takes for them.
   */
  offer?: { label: string; text: string } | null;
}

let pending: ProblemReport | null = null;
const listeners = new Set<() => void>();

/** Ask the chat bubble to open on a bug thread carrying this context. */
export function reportProblem(report: ProblemReport): void {
  pending = report;
  for (const fn of listeners) fn();
}

/** Consumed once, by the composer. Returns null if there is nothing waiting. */
export function takeProblemReport(): ProblemReport | null {
  const p = pending;
  pending = null;
  return p;
}

export function onProblemReport(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
