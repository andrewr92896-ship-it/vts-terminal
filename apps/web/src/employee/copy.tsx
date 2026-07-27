import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { employeeApi } from './api';
import { EMP, tint } from './theme';
import { Icon } from '../components/Icon';

// Editable wording for the employee portal.
//
// Every developer-authored string on this surface is wrapped in <T>. It renders
// the bundled default until someone overrides it, at which point everyone sees
// the new wording — no deploy. A developer turns on "edit wording" mode from the
// floating pencil, clicks any highlighted string, and rewrites, resets, or hides
// it in place.
//
// Two things this is NOT for:
//   • anything out of the database — a person's name, a document title someone
//     typed, an announcement body. Those are content, not copy.
//   • live figures — counts, dates, times. Wrapping those would let a rewrite
//     silently contradict the data underneath it.
// If a developer typed it into a .tsx file, it belongs here. Otherwise it does not.
//
// Overrides are stored server-side under `copy.emp.<id>` and the write endpoint
// refuses any key outside the `emp.` namespace, so this surface can never reach
// across and rewrite the main portal's wording.

// The sentinel meaning "render nothing at all". Shared with the main portal's
// <EditableText> so a hidden string behaves the same on both surfaces.
const HIDDEN = '[[vts:hidden]]';

interface EditTarget {
  id: string;
  /** The bundled default, i.e. what a reset restores. */
  def: string;
  /** What is on screen right now — the override, or the default. */
  current: string;
  rect: DOMRect;
}

interface CopyCtx {
  /** Resolve an id to its override, or the bundled default. */
  get: (id: string, def: string) => string;
  /** Founder-level — may turn edit mode on. */
  canEdit: boolean;
  /** Whether edit mode is currently on. */
  editing: boolean;
  /** Open the editor for one string. */
  begin: (target: EditTarget) => void;
}

const Ctx = createContext<CopyCtx | null>(null);

export function EmployeeCopyProvider({
  canEdit = false,
  children,
}: {
  canEdit?: boolean;
  children: ReactNode;
}) {
  const [copy, setCopy] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState<EditTarget | null>(null);

  useEffect(() => {
    let alive = true;
    // Best-effort: wording overrides are a nicety, never a reason for the portal
    // to fail to render. On failure every <T> falls back to its bundled default.
    employeeApi
      .copy()
      .then((r) => {
        if (alive) setCopy(r.copy ?? {});
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Losing the role mid-session (or signing out) must close the editor too.
  useEffect(() => {
    if (!canEdit && editing) {
      setEditing(false);
      setTarget(null);
    }
  }, [canEdit, editing]);

  const get = useCallback((id: string, def: string) => copy[id] ?? def, [copy]);

  const value = useMemo<CopyCtx>(
    () => ({ get, canEdit, editing, begin: setTarget }),
    [get, canEdit, editing],
  );

  // Applied locally after a successful write, so the page updates instantly
  // without refetching the whole map.
  function applyLocal(id: string, next: string | null) {
    setCopy((prev) => {
      const copyMap = { ...prev };
      if (next === null) delete copyMap[id];
      else copyMap[id] = next;
      return copyMap;
    });
  }

  return (
    <Ctx.Provider value={value}>
      {children}
      {canEdit && (
        <EditModeToggle
          editing={editing}
          onToggle={() => {
            setEditing((v) => !v);
            setTarget(null);
          }}
        />
      )}
      {canEdit && editing && <EditModeBanner onDone={() => { setEditing(false); setTarget(null); }} />}
      {canEdit && editing && target && (
        <CopyEditor
          target={target}
          onClose={() => setTarget(null)}
          onSaved={(next) => {
            applyLocal(target.id, next);
            setTarget(null);
          }}
        />
      )}
    </Ctx.Provider>
  );
}

// The highlight a string wears while edit mode is on. Derived from the portal's
// accent token rather than hardcoded, so a future restyle carries it along.
const highlight: CSSProperties = {
  cursor: 'pointer',
  outline: `1px dashed ${EMP.accent}`,
  outlineOffset: 2,
  borderRadius: 4,
  background: tint(EMP.accent, 0.12),
  // Keeps the highlight intact when the string wraps across lines.
  boxDecorationBreak: 'clone',
  WebkitBoxDecorationBreak: 'clone',
};

const hiddenPreview: CSSProperties = { opacity: 0.5, textDecoration: 'line-through' };

/**
 * Wrap any developer-authored string:
 *
 *   <T id="emp.docs.title">Documents</T>
 *   <T id="emp.docs.title" text={someVariable} />
 *
 * Outside edit mode this renders the resolved text and nothing else — no wrapper
 * element, no styling, no layout effect.
 */
export function T({
  id,
  children,
  text,
}: {
  id: string;
  children?: ReactNode;
  text?: string;
}) {
  const ctx = useContext(Ctx);
  const ref = useRef<HTMLSpanElement>(null);
  const def = text ?? (typeof children === 'string' ? children : '');

  // No provider, or nothing to resolve: render the raw content untouched.
  if (!ctx || !def) return <>{text ?? children}</>;

  const value = ctx.get(id, def);
  const hidden = value === HIDDEN;

  if (!ctx.editing || !ctx.canEdit) return hidden ? null : <>{value}</>;

  return (
    <span
      ref={ref}
      role="button"
      tabIndex={0}
      title={hidden ? `${id} — hidden, click to restore` : `${id} — click to edit`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = ref.current?.getBoundingClientRect();
        if (rect) ctx.begin({ id, def, current: value, rect });
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        const rect = ref.current?.getBoundingClientRect();
        if (rect) ctx.begin({ id, def, current: value, rect });
      }}
      style={highlight}
    >
      {/* A hidden string stays visible to a developer in edit mode — struck
          through — so it remains discoverable and can be restored. */}
      {hidden ? <span style={hiddenPreview}>{def}</span> : value}
    </span>
  );
}

/**
 * The string form, for places that need a plain value rather than a node — a
 * placeholder, a title attribute, an aria-label. These resolve overrides but
 * cannot be click targets, since there is no element to click.
 */
export function useCopy(id: string, def: string): string {
  const ctx = useContext(Ctx);
  if (!ctx) return def;
  const value = ctx.get(id, def);
  return value === HIDDEN ? '' : value;
}

/** The floating pencil. Present only for developers; the server is the real gate. */
function EditModeToggle({ editing, onToggle }: { editing: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-label={editing ? 'Stop editing wording' : 'Edit wording'}
      aria-pressed={editing}
      title={editing ? 'Stop editing wording' : 'Edit wording'}
      style={{
        position: 'fixed',
        right: 26,
        bottom: 26,
        width: 52,
        height: 52,
        borderRadius: '50%',
        border: editing ? `1px solid ${EMP.accent2}` : `1.5px solid ${EMP.accent}`,
        background: editing ? EMP.accent : EMP.panel,
        color: editing ? EMP.accentText : EMP.accent,
        cursor: 'pointer',
        boxShadow: '0 8px 24px rgba(0,0,0,.4)',
        zIndex: 55,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        transition: 'background .15s ease, color .15s ease, border-color .15s ease',
      }}
    >
      <Icon name="pencil" size={20} />
    </button>
  );
}

/** The banner shown while edit mode is on, with the way out. */
function EditModeBanner({ onDone }: { onDone: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        maxWidth: 'calc(100vw - 24px)',
        background: EMP.side,
        border: `1px solid ${tint(EMP.accent, 0.4)}`,
        borderRadius: 999,
        padding: '9px 12px 9px 18px',
        boxShadow: '0 10px 30px rgba(0,0,0,.45)',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: EMP.accent,
          flex: 'none',
        }}
      />
      <span style={{ fontSize: 13, color: EMP.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        Editing wording — click any highlighted text to change it
      </span>
      <button
        onClick={onDone}
        style={{
          border: 'none',
          background: EMP.accent,
          color: EMP.accentText,
          fontSize: 12.5,
          fontWeight: 700,
          padding: '6px 14px',
          borderRadius: 999,
          cursor: 'pointer',
          flex: 'none',
          fontFamily: EMP.sans,
        }}
      >
        Done
      </button>
    </div>
  );
}

/**
 * The editor for one string. Anchored under the text that was clicked, flipped
 * above when it would overflow, and clamped to the viewport — on a narrow screen
 * it becomes a bottom sheet instead.
 */
function CopyEditor({
  target,
  onClose,
  onSaved,
}: {
  target: EditTarget;
  onClose: () => void;
  onSaved: (next: string | null) => void;
}) {
  const isHidden = target.current === HIDDEN;
  // Start empty for a hidden string, so typing and saving restores it.
  const [value, setValue] = useState(isHidden ? '' : target.current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const sheet = vw < 640;

  const width = 320;
  const gutter = 14;
  const left = Math.max(gutter, Math.min(target.rect.left, vw - width - gutter));
  const below = target.rect.bottom + 300 < vh;

  async function run(fn: () => Promise<void>, onOk: () => void) {
    setBusy(true);
    setError('');
    try {
      await fn();
      onOk();
    } catch (e) {
      setError((e as Error).message || 'Could not save. Try again.');
      setBusy(false);
    }
  }

  const save = () =>
    run(
      async () => {
        // Blank, or identical to the coded default, means "no override" rather
        // than "store this" — the server treats a blank value the same way.
        if (!value.trim() || value === target.def) await employeeApi.resetCopy(target.id);
        else await employeeApi.saveCopy(target.id, value);
      },
      () => onSaved(!value.trim() || value === target.def ? null : value),
    );

  const reset = () => run(() => employeeApi.resetCopy(target.id).then(() => undefined), () => onSaved(null));

  const hide = () =>
    run(() => employeeApi.saveCopy(target.id, HIDDEN).then(() => undefined), () => onSaved(HIDDEN));

  const box: CSSProperties = sheet
    ? {
        position: 'fixed',
        left: gutter,
        right: gutter,
        bottom: gutter,
        width: 'auto',
      }
    : {
        position: 'fixed',
        left,
        width,
        ...(below ? { top: target.rect.bottom + 10 } : { bottom: vh - target.rect.top + 10 }),
      };

  return (
    <>
      {/* Click-outside closes without saving. */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 65 }} />
      <div
        role="dialog"
        aria-label="Edit wording"
        style={{
          ...box,
          maxWidth: 'calc(100vw - 28px)',
          background: EMP.panel,
          border: `1px solid ${EMP.line2}`,
          borderRadius: 12,
          boxShadow: '0 18px 44px rgba(0,0,0,.5)',
          zIndex: 70,
          padding: 14,
          fontFamily: EMP.sans,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.6px',
              textTransform: 'uppercase',
              color: EMP.accent,
            }}
          >
            Edit wording
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              color: EMP.faint,
              cursor: 'pointer',
              display: 'flex',
              padding: 2,
            }}
          >
            <Icon name="x-circle" size={15} />
          </button>
        </div>

        {/* The id, so a developer always knows which string they are editing. */}
        <div
          style={{
            fontFamily: EMP.mono,
            fontSize: 11,
            color: EMP.muted,
            background: EMP.bg,
            border: `1px solid ${EMP.line}`,
            borderRadius: 4,
            padding: '4px 7px',
            marginBottom: 10,
            wordBreak: 'break-all',
          }}
        >
          {target.id}
        </div>

        <textarea
          value={value}
          autoFocus
          rows={3}
          maxLength={4000}
          onChange={(e) => setValue(e.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: EMP.bg,
            border: `1px solid ${EMP.line2}`,
            borderRadius: 6,
            padding: '9px 10px',
            color: EMP.text,
            fontSize: 13.5,
            lineHeight: 1.5,
            fontFamily: EMP.sans,
            resize: 'vertical',
            outline: 'none',
          }}
        />

        <div style={{ fontSize: 11.5, color: EMP.faint, margin: '7px 0 11px', lineHeight: 1.5 }}>
          {isHidden
            ? 'This text is hidden. Type a replacement and save to restore it.'
            : 'Leave it blank to go back to the built-in wording.'}
        </div>

        {error && (
          <div style={{ fontSize: 12, color: EMP.red, marginBottom: 10, lineHeight: 1.5 }}>{error}</div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={save} disabled={busy} style={btn('primary', busy)}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button onClick={reset} disabled={busy} style={btn('ghost', busy)}>
            Reset
          </button>
          <button onClick={hide} disabled={busy} style={{ ...btn(isHidden ? 'restore' : 'hide', busy), marginLeft: 'auto' }}>
            {isHidden ? 'Restore' : 'Hide'}
          </button>
        </div>
      </div>
    </>
  );
}

function btn(kind: 'primary' | 'ghost' | 'hide' | 'restore', busy: boolean): CSSProperties {
  const base: CSSProperties = {
    fontSize: 12.5,
    fontWeight: 700,
    padding: '7px 14px',
    borderRadius: 6,
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.6 : 1,
    fontFamily: EMP.sans,
    border: `1px solid ${EMP.line2}`,
    background: 'transparent',
    color: EMP.muted,
  };
  if (kind === 'primary') {
    return { ...base, background: EMP.accent, color: EMP.accentText, border: 'none' };
  }
  if (kind === 'hide') {
    return { ...base, color: EMP.red, borderColor: tint(EMP.red, 0.35), background: tint(EMP.red, 0.08) };
  }
  if (kind === 'restore') {
    return { ...base, color: EMP.green, borderColor: tint(EMP.green, 0.35), background: tint(EMP.green, 0.08) };
  }
  return base;
}
