import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../api/client';
import { isAdmin } from '../auth/access';
import type { User } from '../api/types';
import { C, GOLD_GRADIENT } from '../theme/tokens';
import { useResponsive } from '../hooks/useMediaQuery';
import { Icon } from '../components/Icon';

// Site-wide editable copy.
//
// Any hardcoded label, blurb, heading, button, or explanation on the site can be
// wrapped in <EditableText> so an admin can rewrite it live — no deploy needed.
// The bundled text (the code default) stays the source of truth; an admin edit
// stores an override in app_settings under the "copy.<id>" key, which everyone
// then sees. Blank/identical-to-default clears the override.
//
// This is the universal mechanism: whenever new coded copy is added anywhere in
// the portal, wrap it in <EditableText id="…"> so it inherits the same
// admin-editable behavior. It is *only* for text coded into the site (labels,
// explanations, empty states). It is NOT for user/team-created data (a study
// game's title, a trade's ticker) or live figures — those are never wrapped.

// Sentinel override meaning "this coded text is hidden". Stored like any other
// override (it survives because it isn't blank), but the components render
// nothing for it — so an admin can remove a piece of copy entirely, not just
// reword it. A distinctive token no one would type keeps it apart from real copy.
const HIDDEN = '[[vts:hidden]]';

interface EditTarget {
  key: string;
  def: string;
  current: string;
  rect: DOMRect;
  /** Rich blurb — the value supports `**bold**` markers; show the hint. */
  rich?: boolean;
}

// Placeholder shown to an admin (in edit mode only) where copy is hidden, so the
// hidden text stays discoverable and can be clicked to restore.
const hiddenPreviewStyle = { opacity: 0.5, textDecoration: 'line-through' } as const;

interface SiteCopyCtx {
  /** Admin — may toggle edit mode and rewrite copy. */
  canEdit: boolean;
  /** Whether "edit wording" mode is currently on. */
  editing: boolean;
  /** Resolve a copy key to its override, or the bundled default. */
  get: (key: string, def: string) => string;
  /** Open the inline editor for a piece of copy (only meaningful in edit mode). */
  begin: (t: EditTarget) => void;
}

const Ctx = createContext<SiteCopyCtx | null>(null);

export function SiteCopyProvider({ user, children }: { user: User; children: ReactNode }) {
  const canEdit = isAdmin(user.roles) && !user.isDemo;
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState<EditTarget | null>(null);

  // Everyone loads the overrides so customized wording renders for all users;
  // only admins can turn on edit mode and change it.
  useEffect(() => {
    let alive = true;
    api
      .siteContent()
      .then((r) => {
        if (alive) setOverrides(r.copy ?? {});
      })
      .catch(() => {
        /* transient — bundled defaults render until the next load */
      });
    return () => {
      alive = false;
    };
  }, []);

  const get = useCallback(
    (key: string, def: string) => {
      const v = overrides[key];
      return v == null ? def : v;
    },
    [overrides],
  );

  const begin = useCallback((t: EditTarget) => setTarget(t), []);

  const applyOverride = useCallback((key: string, value: string, def: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      // A blank value, or one identical to the bundled default, is not an
      // override — the server clears it and so do we.
      if (!value.trim() || value.trim() === def.trim()) delete next[key];
      else next[key] = value;
      return next;
    });
  }, []);

  const value = useMemo<SiteCopyCtx>(() => ({ canEdit, editing, get, begin }), [canEdit, editing, get, begin]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {canEdit && (
        <EditModeToggle editing={editing} onToggle={() => setEditing((v) => !v)} />
      )}
      {canEdit && editing && <EditModeBanner onDone={() => setEditing(false)} />}
      {target && (
        <CopyEditor
          target={target}
          onClose={() => setTarget(null)}
          onSaved={(v) => {
            applyOverride(target.key, v, target.def);
            setTarget(null);
          }}
        />
      )}
    </Ctx.Provider>
  );
}

/**
 * Wrap any piece of site-coded text so admins can rewrite it live.
 *
 * Usage: <EditableText id="studyhub.title">Study Hub</EditableText>
 * For copy that can't be a plain-string child (embedded markup, interpolation),
 * pass the default via the `text` prop and render nothing else.
 *
 * Outside an admin edit session it renders exactly the resolved text (its
 * override, or the default) with no wrapper — so it never disturbs layout.
 */
export function EditableText({
  id,
  text,
  children,
}: {
  id: string;
  text?: string;
  children?: ReactNode;
}) {
  const ctx = useContext(Ctx);
  const ref = useRef<HTMLSpanElement>(null);
  const def = text ?? (typeof children === 'string' ? children : '');

  // No provider (shouldn't happen inside the portal) or nothing editable: render
  // the raw content untouched.
  if (!ctx || !def) return <>{text ?? children}</>;

  const value = ctx.get(id, def);
  const hidden = value === HIDDEN;

  // Hidden copy renders as nothing for everyone; only an admin in edit mode sees
  // a struck-through placeholder so it can be clicked and restored.
  if (!ctx.editing || !ctx.canEdit) return hidden ? null : <>{value}</>;

  return (
    <span
      ref={ref}
      role="button"
      tabIndex={0}
      title={hidden ? 'Hidden — click to restore' : 'Edit this wording'}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = ref.current?.getBoundingClientRect();
        if (rect) ctx.begin({ key: id, def, current: value, rect });
      }}
      style={{
        cursor: 'pointer',
        outline: `1px dashed ${C.gold}`,
        outlineOffset: 2,
        borderRadius: 3,
        background: 'rgba(235,203,116,.14)',
        boxDecorationBreak: 'clone',
        WebkitBoxDecorationBreak: 'clone',
      }}
    >
      {hidden ? <span style={hiddenPreviewStyle}>{def}</span> : value}
    </span>
  );
}

// Render an inline-markdown string: **bold** segments become <strong>, the rest
// is plain text. Keeps the editable value a single plain string an admin can
// retype, while still supporting the emphasized words in coded blurbs.
function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(p);
    if (m) return <strong key={i}>{m[1]}</strong>;
    return <span key={i}>{p}</span>;
  });
}

/**
 * Like <EditableText>, but for a coded blurb that contains emphasized words.
 * The default (and the stored override) is a single string using `**bold**`
 * markers; it renders with those words bolded. Use this instead of leaving a
 * paragraph with embedded <strong> unwrapped — it makes such blurbs editable.
 *
 * Usage: <EditableRich id="studyhub.cards.blurb" text="In **Study Creation** …" />
 */
export function EditableRich({ id, text }: { id: string; text: string }) {
  const ctx = useContext(Ctx);
  const ref = useRef<HTMLSpanElement>(null);

  if (!ctx || !text) return <>{renderInline(text)}</>;

  const value = ctx.get(id, text);
  const hidden = value === HIDDEN;

  if (!ctx.editing || !ctx.canEdit) return hidden ? null : <>{renderInline(value)}</>;

  return (
    <span
      ref={ref}
      role="button"
      tabIndex={0}
      title={hidden ? 'Hidden — click to restore' : 'Edit this wording'}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = ref.current?.getBoundingClientRect();
        if (rect) ctx.begin({ key: id, def: text, current: value, rect, rich: true });
      }}
      style={{
        cursor: 'pointer',
        outline: `1px dashed ${C.gold}`,
        outlineOffset: 2,
        borderRadius: 3,
        background: 'rgba(235,203,116,.14)',
        boxDecorationBreak: 'clone',
        WebkitBoxDecorationBreak: 'clone',
      }}
    >
      {hidden ? <span style={hiddenPreviewStyle}>{renderInline(text)}</span> : renderInline(value)}
    </span>
  );
}

/** The floating admin shield beside the corner chat bubble that turns edit mode on/off. */
function EditModeToggle({ editing, onToggle }: { editing: boolean; onToggle: () => void }) {
  const { isPhone } = useResponsive();
  const base = isPhone ? 14 : 22;
  return (
    <button
      onClick={onToggle}
      aria-label={editing ? 'Stop editing site wording' : 'Edit site wording'}
      aria-pressed={editing}
      title={editing ? 'Stop editing site wording' : 'Edit site wording'}
      style={{
        position: 'fixed',
        // Sit just to the left of the 52px-wide chat bubble.
        right: base + 52 + 12,
        bottom: base + 4,
        width: 44,
        height: 44,
        borderRadius: '50%',
        border: `1px solid ${C.gold}`,
        background: editing ? GOLD_GRADIENT : '#0A2A6B',
        color: editing ? C.goldText : C.gold,
        cursor: 'pointer',
        boxShadow: '0 8px 24px rgba(0,0,0,.45)',
        zIndex: 45,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
      }}
    >
      <Icon name="shield" size={19} />
    </button>
  );
}

/** A top banner shown while edit mode is on, explaining it and offering an exit. */
function EditModeBanner({ onDone }: { onDone: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 80,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        maxWidth: 'calc(100vw - 24px)',
        background: 'linear-gradient(180deg,#1a1405,#120d02)',
        border: `1px solid ${C.gold}`,
        borderTop: 'none',
        borderRadius: '0 0 12px 12px',
        padding: '9px 14px',
        boxShadow: '0 10px 30px rgba(0,0,0,.5)',
        animation: 'popIn .2s ease',
      }}
    >
      <Icon name="pencil" size={15} color={C.gold} />
      <span style={{ fontSize: 12.5, color: C.text }}>
        <strong style={{ color: C.gold }}>Editing site wording</strong>
        <span style={{ color: C.muted }}> — click any highlighted text to change it.</span>
      </span>
      <button
        onClick={onDone}
        style={{
          border: 'none',
          background: GOLD_GRADIENT,
          color: C.goldText,
          fontSize: 12,
          fontWeight: 700,
          padding: '6px 13px',
          borderRadius: 7,
          cursor: 'pointer',
        }}
      >
        Done
      </button>
    </div>
  );
}

/** The inline popover that edits one piece of copy, anchored near the clicked text. */
function CopyEditor({
  target,
  onClose,
  onSaved,
}: {
  target: EditTarget;
  onClose: () => void;
  onSaved: (value: string) => void;
}) {
  const isHidden = target.current === HIDDEN;
  // Start the textarea empty for hidden copy, so typing + Save restores it.
  const [value, setValue] = useState(isHidden ? '' : target.current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOverridden = target.current !== target.def;

  // Anchor below the text when there's room, otherwise above; clamp to viewport.
  const width = 360;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const left = Math.max(10, Math.min(target.rect.left, vw - width - 10));
  const below = target.rect.bottom + 320 < vh;
  const top = below ? target.rect.bottom + 8 : undefined;
  const bottom = below ? undefined : vh - target.rect.top + 8;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.adminSaveCopy(target.key, value);
      onSaved(value);
    } catch {
      setError('Could not save. Try again.');
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      await api.adminResetCopy(target.key);
      onSaved(target.def);
    } catch {
      setError('Could not reset. Try again.');
      setBusy(false);
    }
  }

  // Hide this piece of copy entirely — it renders as nothing for everyone until
  // an admin restores it (by resetting, or saving new text).
  async function hide() {
    setBusy(true);
    setError(null);
    try {
      await api.adminSaveCopy(target.key, HIDDEN);
      onSaved(HIDDEN);
    } catch {
      setError('Could not hide. Try again.');
      setBusy(false);
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 84 }} />
      <div
        role="dialog"
        aria-label="Edit wording"
        style={{
          position: 'fixed',
          left,
          top,
          bottom,
          width,
          maxWidth: 'calc(100vw - 20px)',
          background: 'linear-gradient(180deg,#0b1a3a,#081226)',
          border: `1px solid ${C.gold}`,
          borderRadius: 12,
          boxShadow: '0 24px 60px rgba(0,0,0,.55)',
          zIndex: 85,
          padding: 14,
          animation: 'popIn .18s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Icon name="pencil" size={14} color={C.gold} />
          <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.text }}>Edit wording</div>
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              color: isOverridden ? C.gold : C.faint,
              border: `1px solid ${isOverridden ? C.gold : C.line2}`,
              borderRadius: 5,
              padding: '2px 6px',
            }}
          >
            {isHidden ? 'Hidden' : isOverridden ? 'Customized' : 'Default'}
          </span>
        </div>

        {isHidden && (
          <div style={{ marginBottom: 10, fontSize: 11.5, color: C.muted, lineHeight: 1.45 }}>
            This text is hidden. Type replacement text and Save to bring it back, or Reset for the built-in copy.
          </div>
        )}

        <textarea
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={Math.min(8, Math.max(2, Math.ceil(value.length / 42)))}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: '#091633',
            border: `1px solid ${C.line2}`,
            borderRadius: 8,
            color: C.text,
            fontSize: 13,
            fontFamily: 'inherit',
            lineHeight: 1.5,
            padding: '9px 11px',
            outline: 'none',
            resize: 'vertical',
          }}
        />

        {target.rich && (
          <div style={{ marginTop: 6, fontSize: 11, color: C.faint, lineHeight: 1.4 }}>
            Wrap a word in <span style={{ color: C.muted, fontWeight: 700 }}>**double asterisks**</span> to bold it.
          </div>
        )}

        {isOverridden && (
          <div style={{ marginTop: 8, fontSize: 11, color: C.faint, lineHeight: 1.4 }}>
            <span style={{ color: C.muted, fontWeight: 600 }}>Default: </span>
            {target.def}
          </div>
        )}

        {error && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#ffb4ab' }}>{error}</div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <button
            onClick={() => void save()}
            disabled={busy || value === target.current}
            style={{
              border: 'none',
              background: GOLD_GRADIENT,
              color: C.goldText,
              fontSize: 12.5,
              fontWeight: 700,
              padding: '8px 14px',
              borderRadius: 7,
              cursor: busy || value === target.current ? 'default' : 'pointer',
              opacity: busy || value === target.current ? 0.55 : 1,
            }}
          >
            Save
          </button>
          <button
            onClick={reset}
            disabled={busy || !isOverridden}
            title="Reset to the built-in default"
            style={{
              border: `1px solid ${C.line2}`,
              background: 'rgba(255,255,255,.05)',
              color: isOverridden ? C.muted : C.faint,
              fontSize: 12.5,
              fontWeight: 600,
              padding: '8px 12px',
              borderRadius: 7,
              cursor: busy || !isOverridden ? 'default' : 'pointer',
              opacity: !isOverridden ? 0.55 : 1,
            }}
          >
            Reset
          </button>
          {!isHidden && (
            <button
              onClick={hide}
              disabled={busy}
              title="Hide this text everywhere"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                border: `1px solid ${C.line2}`,
                background: 'rgba(240,89,110,.08)',
                color: '#ef8a99',
                fontSize: 12.5,
                fontWeight: 600,
                padding: '8px 12px',
                borderRadius: 7,
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.55 : 1,
              }}
            >
              <Icon name="eye-off" size={13} />
              Hide
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              marginLeft: 'auto',
              border: 'none',
              background: 'none',
              color: C.faint,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              padding: '8px 4px',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
