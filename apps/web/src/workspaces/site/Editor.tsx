import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { C, tint } from '../../theme/tokens';
import { DEPLOY } from './deploy';
import { Confirm } from './Confirm';
import { useEditorState } from './useEditorState';
import { History } from './History';
import {
  EDITOR_MIN,
  NAV_MAX,
  NAV_MIN,
  NAV_RAIL,
  PREVIEW_MIN,
  Splitter,
  useEditorLayout,
} from './panes';
import { FilesProvider } from './FileField';
import { Icon } from '../../components/Icon';
import { api, type ContentStatus, type ImportRead } from './siteApi';
import type { Model, Section, SectionType } from './types';
import { AddButton, Area, Group, Text, Tiny, moved } from './fields';
import { LinkList, SectionForm } from './SectionForm';

/**
 * Site Editor ▸ Editor — vitalistradingsystems.com.
 *
 * THREE STATES, AND EVERY CONTROL HERE EXISTS TO MOVE BETWEEN THEM:
 *
 *   working    what is on screen. Kept in this browser, never sent anywhere.
 *   saved      the draft on the server. Save puts it there. Nobody else sees it.
 *   published  what visitors are served. Deploy puts it there.
 *
 * The middle one is the point. Andrew asked for it because a long editing
 * session is not one decision — you want to stop for the night with the work
 * safe and the live site untouched, and come back to it.
 *
 * NOTHING IS EVER LOST DESPITE SAVE BEING EXPLICIT. The working state is
 * written to this browser as it is typed (see useEditorState), so closing the
 * tab mid-sentence loses nothing while Save still means what it says.
 *
 * SAVE AND DEPLOY BOTH ASK FIRST, and Deploy carries Railway's colour on
 * purpose: that is the interface Andrew already reads "changes are staged,
 * press this to apply them" from, and borrowing the colour borrows the habit.
 *
 * THE PREVIEW SHOWS THE WORKING STATE, posted into the frame rather than
 * fetched by it. Fetched, it could only ever show the last SAVE — so a change
 * would not appear until it was committed, which is the wrong way round.
 */

/**
 * The kinds of section the page can gain. `hero` is deliberately not offered —
 * the page has one and a second would be a second opening — so what can be
 * added is a grid of cards, a plain panel and the highlighted one.
 */
const TYPES: { type: SectionType; label: string }[] = [
  { type: 'grid', label: 'Card grid' },
  { type: 'boundary', label: 'Panel' },
  { type: 'early', label: 'Highlighted panel' },
  { type: 'certificates', label: 'Certificates' },
  { type: 'gallery', label: 'Image slideshow' },
];

/** A URL-safe anchor. Ids are links people paste, so they are never rewritten. */
function slugId(label: string, taken: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30) || 'section';
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

export function Editor() {
  const { model, unsaved, canUndo, canRedo, edit, undo, redo, adopt } = useEditorState();
  const [status, setStatus] = useState<ContentStatus | null>(null);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [ask, setAsk] = useState<'save' | 'deploy' | 'revert' | null>(null);
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  /** A version being looked at. Null means the preview shows the working state. */
  const [viewing, setViewing] = useState<Model | null>(null);
  /** A file that has been read and checked, waiting to be confirmed. */
  const [incoming, setIncoming] = useState<ImportRead | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  /** The three panes' widths, and whether the section list is open. */
  const [panes, setPanes] = useEditorLayout();
  const [dragging, setDragging] = useState(false);
  const panesRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await api.content();
        if (data.model) adopt(data.model);
        setStatus(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not read the content.');
      }
    })();
  }, [adopt]);

  /**
   * The preview is TOLD what to draw rather than asked to fetch it.
   *
   * Fetching, it could only ever show the last save — so an edit would not
   * appear until it was committed, which defeats the point of a preview. This
   * posts on every change; the frame renders it directly.
   */
  const shown = viewing ?? model;
  useEffect(() => {
    if (!frame?.contentWindow || !shown) return;
    frame.contentWindow.postMessage({ type: 'vts-site-model', model: shown }, window.location.origin);
  }, [frame, shown]);

  /** Undo and redo, on the keys everyone already presses. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') {
        if (!((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y')) return;
      }
      // Intercepted even inside a text field, deliberately. These inputs are
      // controlled by React, which overwrites their value on every render and
      // leaves the browser's own undo stack pointing at text that is no longer
      // there — so the native behaviour is already broken, and this is the only
      // undo that can be correct.
      e.preventDefault();
      const isRedo = e.shiftKey || e.key.toLowerCase() === 'y';
      isRedo ? redo() : undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  /** Warn before a reload or a close would abandon unsaved work. */
  useEffect(() => {
    if (!unsaved) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [unsaved]);

  const sections = model?.sections ?? [];
  const current = sections[Math.min(selected, Math.max(0, sections.length - 1))];
  const takenIds = useMemo(() => new Set(sections.map((s) => s.id)), [sections]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!model) return false;
    setBusy(true);
    setError(null);
    try {
      setStatus(await api.saveContent(model));
      adopt(model);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [model, adopt]);

  /**
   * Deploy SAVES FIRST when there is anything unsaved.
   *
   * The alternative — refusing until it is saved — is a button that tells you
   * to press another button. Railway's Deploy applies whatever is staged, and
   * the confirmation says outright that this will do the same.
   */
  const deploy = useCallback(async () => {
    if (unsaved && !(await save())) return;
    setBusy(true);
    setError(null);
    try {
      setStatus(await api.publishContent());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not deploy that.');
    } finally {
      setBusy(false);
    }
  }, [unsaved, save]);

  /** Back to the last SAVE — never to the last deploy. */
  const revert = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await api.content();
      // discardLocal, because the unsaved copy in this browser IS what is being
      // thrown away. Without it, Revert restored the edits it was pressed to
      // discard — which is the exact opposite of what the button says.
      if (data.model) adopt(data.model, { discardLocal: true });
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reload the saved version.');
    } finally {
      setBusy(false);
    }
  }, [adopt]);

  /**
   * Export what is on screen, as a file.
   *
   * The model goes to the server and comes back wrapped, so the format is
   * defined in one place and the file's list of referenced uploads is checked
   * against what actually exists. An invalid model is refused rather than
   * written — a backup is only ever opened at the moment it is needed, which is
   * the worst possible time to discover it cannot be restored.
   */
  const exportNow = useCallback(async () => {
    if (!model) return;
    setBusy(true);
    setError(null);
    try {
      const doc = await api.exportContent(model);
      const url = URL.createObjectURL(
        new Blob([`${JSON.stringify(doc, null, 2)}\n`], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `vitalistradingsystems-${doc.exportedAt.slice(0, 10)}.json`;
      a.click();
      // Revoked on the next tick rather than immediately: the click is
      // asynchronous, and a URL freed too early downloads an empty file.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export that.');
    } finally {
      setBusy(false);
    }
  }, [model]);

  /**
   * Read a chosen file and check it — without touching anything yet.
   *
   * Checking before asking is what lets the confirmation say what is in the
   * file: how many sections, when it was taken, and which uploads it needs that
   * are not here. "Are you sure?" about an unknown quantity is not a question
   * anybody can answer.
   */
  const pickFile = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const read = await api.importContent(JSON.parse(await file.text()));
      setIncoming(read);
    } catch (err) {
      setError(
        err instanceof SyntaxError
          ? 'That file is not readable JSON.'
          : err instanceof Error
            ? err.message
            : 'Could not read that file.',
      );
    } finally {
      setBusy(false);
    }
  }, []);

  /**
   * A dragged width is clamped against the panes beside it, never against a
   * constant alone: the section list may not push the form below its minimum,
   * and the form may not push the preview off the screen. Read off the live
   * container so a stored width from a wider window is corrected the moment it
   * is touched.
   */
  const total = () => panesRef.current?.getBoundingClientRect().width ?? 1200;
  const resizeNav = (px: number) => {
    const ceiling = Math.min(NAV_MAX, total() - EDITOR_MIN - (showPreview ? PREVIEW_MIN : 0));
    setPanes({ nav: Math.round(Math.max(NAV_MIN, Math.min(ceiling, px))) });
  };
  const resizeForm = (px: number) => {
    const navW = panes.navOpen ? panes.nav : NAV_RAIL;
    const ceiling = total() - navW - PREVIEW_MIN;
    setPanes({ editor: Math.round(Math.max(EDITOR_MIN, Math.min(ceiling, px))) });
  };

  if (!model) {
    return (
      <div
        style={{
          padding: 40,
          font: `400 14px/1.6 ${C.sans}`,
          color: error ? '#d99aa8' : C.faint,
        }}
      >
        {error ?? 'Loading…'}
      </div>
    );
  }

  const undeployed = unsaved || status?.dirty === true;

  return (
    // One file list for every picker on the screen — see editor/FileField.
    <FilesProvider>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            flexWrap: 'wrap',
            padding: '12px clamp(16px,3vw,28px)',
            borderBottom: `1px solid ${C.line}`,
            background: C.panel2,
            flex: 'none',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                font: `500 .64rem/1.4 ${C.mono}`,
                letterSpacing: '.2em',
                textTransform: 'uppercase',
                color: C.gold,
              }}
            >
              vitalistradingsystems.com
            </p>
            <h1
              style={{
                margin: '4px 0 0',
                font: `700 1.05rem/1.2 ${C.sans}`,
                color: C.text,
              }}
            >
              Editor
            </h1>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: 2,
                padding: 3,
                borderRadius: 9,
                border: `1px solid ${C.line}`,
                background: C.bg,
              }}
            >
              <Tiny label="Undo (Ctrl+Z)" icon="undo" disabled={!canUndo || busy} onClick={undo} />
              <Tiny
                label="Redo (Ctrl+Shift+Z)"
                icon="redo"
                disabled={!canRedo || busy}
                onClick={redo}
              />
            </div>

            <StatePill unsaved={unsaved} status={status} />

            <Ghost
              label={showPreview ? 'Hide preview' : 'Show preview'}
              icon="eye"
              onClick={() => setShowPreview((v) => !v)}
            />
            <Ghost
              label="Export"
              icon="download"
              disabled={busy}
              onClick={() => void exportNow()}
            />
            <Ghost
              label="Import"
              icon="upload"
              disabled={busy}
              onClick={() => picker.current?.click()}
            />
            <input
              ref={picker}
              type="file"
              accept="application/json,.json"
              // The value is cleared on every pick, or choosing the same file
              // twice fires no change event and the button appears dead.
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void pickFile(file);
              }}
              style={{ display: 'none' }}
            />
            <Ghost
              label="History"
              icon="history"
              disabled={busy}
              onClick={() => setHistoryOpen((v) => !v)}
            />
            <Ghost
              label="Revert"
              icon="refresh-cw"
              disabled={busy || !unsaved}
              onClick={() => setAsk('revert')}
            />
            <Ghost
              label="Save"
              icon="save"
              disabled={busy || !unsaved}
              onClick={() => setAsk('save')}
            />

            <DeployButton
              disabled={busy || !undeployed}
              staged={undeployed}
              onClick={() => setAsk('deploy')}
            />
          </div>
        </div>

        {error && (
          <p
            style={{
              margin: 0,
              padding: '10px clamp(16px,3vw,28px)',
              background: tint('#d99aa8', 0.08),
              borderBottom: `1px solid ${tint('#d99aa8', 0.28)}`,
              font: `400 13px/1.6 ${C.sans}`,
              color: '#d99aa8',
              flex: 'none',
            }}
          >
            {error}
          </p>
        )}

        <div ref={panesRef} style={{ flex: 1, minHeight: 0, display: 'flex', minWidth: 0 }}>
          <nav
            ref={navRef}
            // Named, because the shell's own rail is also a <nav> — without
            // this, "the section list" is not something a screen reader, or a
            // test, can ask for unambiguously.
            aria-label="Sections"
            style={{
              width: panes.navOpen ? panes.nav : NAV_RAIL,
              minWidth: panes.navOpen ? NAV_MIN : NAV_RAIL,
              // Shrinks under pressure from the panes beside it, but only down
              // to its minimum — `flex: none` would push the preview off the
              // screen on a narrow window instead.
              flex: `0 1 ${panes.navOpen ? panes.nav : NAV_RAIL}px`,
              borderRight: `1px solid ${C.line}`,
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: panes.navOpen ? '10px 10px 14px' : '10px 0',
              background: 'rgba(0,0,0,.12)',
            }}
          >
            {!panes.navOpen ? (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Tiny
                  label="Show sections"
                  icon="panel-left-open"
                  onClick={() => setPanes({ navOpen: true })}
                />
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                  <Tiny
                    label="Hide sections"
                    icon="panel-left-close"
                    onClick={() => setPanes({ navOpen: false })}
                  />
                </div>
                <SideRow
                  active={selected === -1}
                  label="Page & header"
                  icon="panel-left-open"
                  onClick={() => setSelected(-1)}
                />
                <div style={{ height: 1, background: C.line, margin: '10px 6px' }} />
                {sections.map((s, i) => (
                  <SideRow
                    key={s.id}
                    active={selected === i}
                    label={s.title || s.h1 || s.eyebrow || s.id}
                    icon={s.hidden ? 'eye-off' : 'file'}
                    dim={s.hidden === true}
                    onClick={() => setSelected(i)}
                  />
                ))}
                <div style={{ marginTop: 12 }}>
                  <AddSection
                    onAdd={(type, label) => {
                      const id = slugId(label, takenIds);
                      edit({
                        ...model,
                        sections: [
                      ...sections,
                      type === 'grid'
                        ? { id, type, items: [{}] }
                        : type === 'certificates'
                          ? { id, type, eyebrow: 'Certificates', title: label, items: [{}] }
                          : type === 'gallery'
                            ? { id, type, title: label, imgFit: 'contain', items: [{}] }
                            : { id, type, title: label, items: [] },
                    ],
                      });
                      setSelected(sections.length);
                    }}
                  />
                </div>
              </>
            )}
          </nav>

          {panes.navOpen && (
            <Splitter
              label="Resize the section list"
              start={() => navRef.current?.getBoundingClientRect().width ?? panes.nav}
              onResize={resizeNav}
              onDragging={setDragging}
            />
          )}

          <div
            ref={formRef}
            style={{
              // Until it is first dragged the form keeps the clamp it always
              // had, scaling with the window. After that it is a number.
              flex: !showPreview
                ? 1
                : panes.editor === null
                  ? '0 1 clamp(320px, 34%, 520px)'
                  : `0 1 ${panes.editor}px`,
              minWidth: showPreview ? EDITOR_MIN : 0,
              overflowY: 'auto',
              padding: 'clamp(16px,2.5vw,26px)',
            }}
          >
            {selected === -1 ? (
              <PageForm model={model} onChange={edit} />
            ) : current ? (
              <>
                <SectionHeaderControls
                  section={current}
                  index={selected}
                  count={sections.length}
                  onMove={(to) => {
                    edit({ ...model, sections: moved(sections, selected, to) });
                    setSelected(to);
                  }}
                  onRemove={() => {
                    if (sections.length === 1) {
                      setError('A page needs at least one section.');
                      return;
                    }
                    if (!window.confirm(`Delete the "${current.title || current.id}" section?`))
                      return;
                    edit({
                      ...model,
                      sections: sections.filter((_, n) => n !== selected),
                    });
                    setSelected(Math.max(0, selected - 1));
                  }}
                  onChange={(next) =>
                    edit({
                      ...model,
                      sections: sections.map((s, n) => (n === selected ? next : s)),
                    })
                  }
                />
                <SectionForm
                  // Keyed on the section, so moving to another one is a fresh
                  // form: rows are keyed by index, and without this the pickers
                  // and the add menu keep the previous section's state.
                  key={current.id}
                  section={current}
                  onChange={(next) =>
                    edit({
                      ...model,
                      sections: sections.map((s, n) => (n === selected ? next : s)),
                    })
                  }
                />
              </>
            ) : null}
          </div>

          {showPreview && (
            <Splitter
              label="Resize the form"
              start={() => formRef.current?.getBoundingClientRect().width ?? panes.editor ?? 420}
              onResize={resizeForm}
              onDragging={setDragging}
            />
          )}

          {showPreview && (
            <div
              style={{
                flex: '1 1 0',
                minWidth: PREVIEW_MIN,
                borderLeft: `1px solid ${C.line}`,
                background: C.bg,
                position: 'relative',
              }}
            >
              {viewing && (
                <div
                  style={{
                    position: 'absolute',
                    top: 10,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 2,
                    padding: '6px 13px',
                    borderRadius: 999,
                    background: tint(C.gold, 0.18),
                    border: `1px solid ${C.gold}`,
                    font: `600 10.5px/1 ${C.mono}`,
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    color: C.gold,
                    pointerEvents: 'none',
                  }}
                >
                  Viewing a saved version
                </div>
              )}
              <iframe
                ref={setFrame}
                src="/site-preview"
                title="Site preview"
                onLoad={() => {
                  // The frame may finish loading after the last edit, so the
                  // model is posted again here rather than only on change.
                  if (shown)
                    frame?.contentWindow?.postMessage(
                      { type: 'vts-site-model', model: shown },
                      window.location.origin,
                    );
                }}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  display: 'block',
                  // An iframe swallows the pointer, so a drag that crosses it
                  // would stop reporting. Off for exactly the drag's duration.
                  pointerEvents: dragging ? 'none' : 'auto',
                }}
              />
            </div>
          )}

          <History
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
            onPreview={setViewing}
            onRestore={(restored) => {
              setViewing(null);
              // Restored as the WORKING state: it is an edit like any other, and
              // goes live only through Save and Deploy.
              edit(restored);
              setSelected(0);
            }}
          />
        </div>

        <Confirm
          open={ask === 'save'}
          title="Save your changes?"
          body="This keeps your work on the server so it survives closing the tab or switching computers. It does NOT change the live site — visitors keep seeing what was last deployed."
          confirmLabel="Save"
          onCancel={() => setAsk(null)}
          onConfirm={() => {
            setAsk(null);
            void save();
          }}
        />

        <Confirm
          open={ask === 'revert'}
          title="Throw away unsaved changes?"
          body="Everything since your last save goes, including anything undo could have brought back. What is saved and what is live are both untouched."
          confirmLabel="Discard changes"
          tone="danger"
          onCancel={() => setAsk(null)}
          onConfirm={() => {
            setAsk(null);
            void revert();
          }}
        />

        <Confirm
          open={incoming !== null}
          title="Replace everything with this file?"
          body={
            <>
              {`This puts ${incoming?.sections ?? 0} section${incoming?.sections === 1 ? '' : 's'} on screen in place of what is there now`}
              {incoming?.exportedAt
                ? `, exported ${new Date(incoming.exportedAt).toLocaleDateString()}.`
                : '.'}{' '}
              Nothing is saved or deployed until you press Save — so you can look at it first, and
              undo it if it is the wrong file.
              {incoming && incoming.missing.length > 0 && (
                <>
                  {' '}
                  <strong style={{ color: C.gold }}>
                    {incoming.missing.length === 1
                      ? 'One file it points at is not uploaded here'
                      : `${incoming.missing.length} files it points at are not uploaded here`}
                  </strong>
                  {`: ${incoming.missing.join(', ')}. Those links will not work until you upload them again on the Files screen.`}
                </>
              )}
            </>
          }
          confirmLabel="Load it"
          onCancel={() => setIncoming(null)}
          onConfirm={() => {
            const model = incoming?.model;
            setIncoming(null);
            if (!model) return;
            setViewing(null);
            // Loaded as the WORKING state, exactly like restoring a saved
            // version: it is an edit, undoable, and reaches the live site only
            // through Save and Deploy.
            edit(model);
            setSelected(0);
          }}
        />

        <Confirm
          open={ask === 'deploy'}
          title="Deploy to vitalistradingsystems.com?"
          body={
            <>
              This publishes the page to vitalistradingsystems.com, where anyone can see it.
              {unsaved && ' Your unsaved changes are saved first.'}
              {' It reaches the site within about fifteen seconds.'}
            </>
          }
          confirmLabel="Deploy"
          tone="deploy"
          onCancel={() => setAsk(null)}
          onConfirm={() => {
            setAsk(null);
            void deploy();
          }}
        />
      </div>
    </FilesProvider>
  );
}

/** Which of the three states the work is in, in one line. */
function StatePill({ unsaved, status }: { unsaved: boolean; status: ContentStatus | null }) {
  // "Never deployed" is checked BEFORE "not deployed", because on a fresh
  // install the server reports the seed as differing from a published document
  // that does not exist — true, and "Saved, not deployed" is the wrong way to
  // say it when nothing has ever been saved or deployed at all.
  const [text, colour] = unsaved
    ? ['Unsaved changes', C.gold]
    : !status
      ? ['', C.muted]
      : !status.published
        ? ['Never deployed', C.muted]
        : status.dirty
          ? ['Saved, not deployed', DEPLOY.accent]
          : ['Deployed', C.muted];
  if (!text) return null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '6px 11px',
        borderRadius: 999,
        border: `1px solid ${C.line}`,
        font: `500 11px/1 ${C.mono}`,
        letterSpacing: '.1em',
        textTransform: 'uppercase',
        color: colour,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: text === 'Deployed' ? '#4f7f5f' : colour,
        }}
      />
      {text}
    </span>
  );
}

function DeployButton({
  disabled,
  staged,
  onClick,
}: {
  disabled: boolean;
  staged: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 20px',
        borderRadius: 8,
        border: 'none',
        background: staged ? (hover && !disabled ? DEPLOY.bgHover : DEPLOY.bg) : 'transparent',
        color: staged ? DEPLOY.text : C.faint,
        font: `600 13px/1 ${C.sans}`,
        fontFamily: C.sans,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled && staged ? 0.55 : 1,
        transition: 'background-color .14s ease',
      }}
    >
      {staged ? 'Deploy' : 'Deployed'}
    </button>
  );
}

function SideRow({
  active,
  label,
  icon,
  dim,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: string;
  dim?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        width: '100%',
        padding: '9px 10px',
        marginBottom: 2,
        borderRadius: 8,
        border: 'none',
        textAlign: 'left',
        cursor: 'pointer',
        font: `${active ? 600 : 500} 13px/1.3 ${C.sans}`,
        fontFamily: C.sans,
        color: active ? C.gold : dim ? C.faint : C.muted,
        background: active ? tint(C.gold, 0.12) : 'transparent',
      }}
    >
      <Icon name={icon} size={14} color={active ? C.gold : C.faint} />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </button>
  );
}

function AddSection({ onAdd }: { onAdd: (type: SectionType, label: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) return <AddButton label="Add section" onClick={() => setOpen(true)} />;
  return (
    <div style={{ border: `1px dashed ${C.line2}`, borderRadius: 9, padding: 10 }}>
      {TYPES.map((t) => (
        <button
          key={t.type}
          type="button"
          onClick={() => {
            onAdd(t.type, t.label);
            setOpen(false);
          }}
          style={{
            display: 'block',
            width: '100%',
            padding: '8px 10px',
            marginBottom: 2,
            borderRadius: 7,
            border: 'none',
            background: 'transparent',
            color: C.muted,
            font: `500 12.5px/1 ${C.sans}`,
            fontFamily: C.sans,
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function SectionHeaderControls({
  section,
  index,
  count,
  onMove,
  onRemove,
  onChange,
}: {
  section: Section;
  index: number;
  count: number;
  onMove: (to: number) => void;
  onRemove: () => void;
  onChange: (next: Section) => void;
}) {
  const [editingId, setEditingId] = useState(false);
  return (
    <div
      style={{
        marginBottom: 22,
        paddingBottom: 18,
        borderBottom: `1px solid ${C.line}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            font: `600 13px/1.3 ${C.sans}`,
            color: C.text,
          }}
        >
          {section.title || section.h1 || section.id}
        </span>
        <Tiny
          label="Move up"
          icon="chevron-up"
          disabled={index === 0}
          onClick={() => onMove(index - 1)}
        />
        <Tiny
          label="Move down"
          icon="chevron-down"
          disabled={index === count - 1}
          onClick={() => onMove(index + 1)}
        />
        <Tiny label="Delete section" icon="trash" danger onClick={onRemove} />
      </div>

      {/*
        THE ANCHOR IS EDITABLE BUT NOT BY ACCIDENT. These ids go into credential
        badges and job applications, and some of those links can never be
        updated — so changing one is a deliberate act behind its own control,
        and it is never rewritten when a title changes.
      */}
      {editingId ? (
        <Text
          label="Link anchor — changing this breaks links already shared"
          value={section.id}
          mono
          onChange={(v) => onChange({ ...section, id: v.trim() })}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingId(true)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            font: `400 11.5px/1.4 ${C.mono}`,
            color: C.faint,
            cursor: 'pointer',
          }}
        >
          #{section.id} — change anchor
        </button>
      )}
    </div>
  );
}

function PageForm({ model, onChange }: { model: Model; onChange: (m: Model) => void }) {
  const { head, bar } = model;
  const setHead = (patch: Partial<typeof head>) => onChange({ ...model, head: { ...head, ...patch } });
  const setBar = (patch: Partial<typeof bar>) => onChange({ ...model, bar: { ...bar, ...patch } });
  const setFooter = (patch: Partial<typeof model.footer>) =>
    onChange({ ...model, footer: { ...model.footer, ...patch } });
  return (
    <div>
      <Group title="Header">
        <Text label="Logo — alt text, first line" value={bar.mark ?? ''} onChange={(v) => setBar({ mark: v })} />
        <Text label="Logo — alt text, second line" value={bar.markEm ?? ''} onChange={(v) => setBar({ markEm: v })} />
      </Group>
      <Group title={`Menu — ${(bar.links ?? []).length}`}>
        <LinkList value={bar.links ?? []} onChange={(v) => setBar({ links: v })} noun="link" />
      </Group>
      <Group title="Page">
        <Text label="Browser title" value={head.title ?? ''} onChange={(v) => setHead({ title: v })} />
        <Area
          label="Description — what search engines show"
          value={head.description ?? ''}
          onChange={(v) => setHead({ description: v })}
          rows={3}
        />
        <Text label="Title when shared" value={head.ogTitle ?? ''} onChange={(v) => setHead({ ogTitle: v })} />
        <Area
          label="Description when shared"
          value={head.ogDescription ?? ''}
          onChange={(v) => setHead({ ogDescription: v })}
          rows={2}
        />
      </Group>
      <Group title="Footer">
        <Text label="Copyright line" value={model.footer.copyright ?? ''} onChange={(v) => setFooter({ copyright: v })} />
        <Area label="Disclaimer" value={model.footer.fine ?? ''} onChange={(v) => setFooter({ fine: v })} rows={3} />
      </Group>
    </div>
  );
}

function Ghost({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '9px 12px',
        borderRadius: 8,
        border: `1px solid ${C.line2}`,
        background: 'transparent',
        color: C.text,
        font: `500 12.5px/1 ${C.sans}`,
        fontFamily: C.sans,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Icon name={icon} size={13} color={C.text} />
      {label}
    </button>
  );
}
