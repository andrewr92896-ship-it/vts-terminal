import { useCallback, useEffect, useRef, useState } from 'react';
import type { Model } from './types';

/**
 * The editor's three states, and the history between them.
 *
 *   working    what is on screen right now. Never left the browser.
 *   saved      the draft on the server. Nobody but the owner ever sees it.
 *   published  what visitors are served.
 *
 * SAVE IS EXPLICIT, BUT NOTHING IS EVER LOST. Those are usually in tension —
 * an explicit Save on a form somebody will leave mid-sentence is a way to lose
 * work — so the working state is kept in this browser as it is typed. Leaving
 * the screen, closing the tab or coming back tomorrow all land on exactly what
 * was left, still unsaved, still not deployed. The button means what it says
 * and the work survives anyway.
 *
 * THE LOCAL COPY IS STAMPED WITH THE SAVED DRAFT IT WAS EDITED FROM, and
 * discarded if that no longer matches. An arrangement only means anything
 * against the version it was made on; replaying it over a draft saved from
 * another browser would silently undo that one. Same rule as VTS's wall drafts.
 */

const KEY = 'vts:site-editor:working';

/**
 * How long typing has to pause before it becomes one undo step.
 *
 * Per keystroke, undo would walk back a letter at a time and be useless. Per
 * save, it would throw away a paragraph. A pause is where a person thinks a
 * change ended, so that is where the step goes.
 */
const HISTORY_IDLE_MS = 500;

/** Bounded so a long session cannot grow without limit. */
const HISTORY_MAX = 120;

const sig = (m: Model | null) => JSON.stringify(m ?? null);

type Stored = { stamp: string; model: Model };

function readLocal(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    if (typeof parsed?.stamp !== 'string' || !parsed?.model?.head) return null;
    return parsed;
  } catch {
    // A private window, blocked storage, or something else's key. Falling back
    // costs the unsaved copy; throwing would cost the whole screen.
    return null;
  }
}

export type EditorState = {
  model: Model | null;
  /** Differs from the saved draft — Save would do something. */
  unsaved: boolean;
  canUndo: boolean;
  canRedo: boolean;
  edit: (next: Model) => void;
  undo: () => void;
  redo: () => void;
  /**
   * Adopt a model as both working and saved.
   *
   * `discardLocal` is the difference between LOADING and REVERTING, and it is
   * load-bearing: on load the unsaved copy in this browser is exactly what
   * should come back, and on revert it is exactly what is being thrown away.
   * Without it, Revert restored the very edits it was pressed to discard.
   */
  adopt: (model: Model, opts?: { discardLocal?: boolean }) => void;
};

export function useEditorState(): EditorState {
  const [model, setModel] = useState<Model | null>(null);
  const [saved, setSaved] = useState<string>(sig(null));

  // Past and future are refs rather than state: they change on every keystroke
  // and nothing renders from their contents, only from whether they are empty.
  const past = useRef<Model[]>([]);
  const future = useRef<Model[]>([]);
  const [depth, setDepth] = useState({ past: 0, future: 0 });
  const historyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The model as it was before the current burst of typing. */
  const beforeBurst = useRef<Model | null>(null);

  const writeLocal = useCallback(
    (next: Model, stamp: string) => {
      try {
        localStorage.setItem(KEY, JSON.stringify({ stamp, model: next }));
      } catch {
        /* the edit is still on screen; it simply is not kept across a reload */
      }
    },
    [],
  );

  const adopt = useCallback((next: Model, opts?: { discardLocal?: boolean }) => {
    const stamp = sig(next);
    setSaved(stamp);
    // A local copy is only honoured when it was edited from THIS saved draft —
    // and never when the caller is deliberately throwing it away.
    const local = opts?.discardLocal ? null : readLocal();
    const start = local?.stamp === stamp ? local.model : next;
    setModel(start);
    past.current = [];
    future.current = [];
    setDepth({ past: 0, future: 0 });
    beforeBurst.current = null;
    try {
      if (opts?.discardLocal || (local && local.stamp !== stamp)) localStorage.removeItem(KEY);
    } catch {
      /* nothing to clean up that matters */
    }
  }, []);

  const edit = useCallback(
    (next: Model) => {
      setModel((prev) => {
        if (prev && beforeBurst.current === null) beforeBurst.current = prev;
        return next;
      });
      writeLocal(next, saved);
      future.current = [];

      // One history entry per burst of typing: the timer is restarted on every
      // keystroke, so the entry lands when the typing stops.
      if (historyTimer.current) clearTimeout(historyTimer.current);
      historyTimer.current = setTimeout(() => {
        const before = beforeBurst.current;
        beforeBurst.current = null;
        if (!before) return;
        past.current = [...past.current, before].slice(-HISTORY_MAX);
        setDepth({ past: past.current.length, future: 0 });
      }, HISTORY_IDLE_MS);

      setDepth((d) => ({ ...d, future: 0 }));
    },
    [saved, writeLocal],
  );

  /**
   * Undo and redo, and the reason they flush the pending burst first: pressing
   * undo mid-sentence has to walk back the sentence, not the letter before it.
   */
  const undo = useCallback(() => {
    if (historyTimer.current) clearTimeout(historyTimer.current);
    const before = beforeBurst.current;
    beforeBurst.current = null;
    if (before) past.current = [...past.current, before].slice(-HISTORY_MAX);

    const prev = past.current[past.current.length - 1];
    if (!prev) return;
    past.current = past.current.slice(0, -1);
    setModel((current) => {
      if (current) future.current = [current, ...future.current].slice(0, HISTORY_MAX);
      return prev;
    });
    writeLocal(prev, saved);
    setDepth({ past: past.current.length, future: future.current.length });
  }, [saved, writeLocal]);

  const redo = useCallback(() => {
    const next = future.current[0];
    if (!next) return;
    future.current = future.current.slice(1);
    setModel((current) => {
      if (current) past.current = [...past.current, current].slice(-HISTORY_MAX);
      return next;
    });
    writeLocal(next, saved);
    setDepth({ past: past.current.length, future: future.current.length });
  }, [saved, writeLocal]);

  useEffect(
    () => () => {
      if (historyTimer.current) clearTimeout(historyTimer.current);
    },
    [],
  );

  return {
    model,
    unsaved: model !== null && sig(model) !== saved,
    canUndo: depth.past > 0 || beforeBurst.current !== null,
    canRedo: depth.future > 0,
    edit,
    undo,
    redo,
    adopt,
  };
}
