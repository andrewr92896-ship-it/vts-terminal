import { useEffect, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { api } from '../../api/client';
import type { NavOrderOverride } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { NAV, type NavWorkspace } from '../../theme/nav';
import { buildNavOrder, isDefaultOrder } from '../../theme/navOrder';
import { Icon } from '../../components/Icon';
import { SectionHeader, panel, ghostBtn, primaryBtn, msgStyle } from './adminUi';

// Developer Terminal ▸ Sidebar Layout. A founder-only tool to reorder the
// sidebar — the workspaces list and each workspace's sections — for everyone.
// The order is persisted as a single override (app_settings `nav.order`) that
// the whole app applies over its code-default nav (see theme/navOrder.ts). This
// editor never adds, removes, or moves a section between workspaces; it only
// reorders within the existing structure, so routing is untouched.
//
// A workspace row is an accordion: click it to open the workspace and reorder
// the sections inside it. The up/down arrows move a row within its own tier;
// "Expand all" opens every workspace so all sections are reorderable at once.

// Copy a nav array so reorders don't mutate the shared, already-ordered input.
function cloneNav(nav: NavWorkspace[]): NavWorkspace[] {
  return nav.map((w) => ({ ...w, sections: [...w.sections] }));
}

// Move the item at `from` by one slot (`dir` = -1 up, +1 down). Out-of-range
// moves are a no-op (returns the same array reference so callers can bail).
function moveBy<T>(arr: T[], from: number, dir: number): T[] {
  const to = from + dir;
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function AdminSidebarLayout({
  theme,
  nav,
  override,
  onApply,
}: {
  theme: Theme;
  // The effective (already-ordered) nav the sidebar is currently showing.
  nav: NavWorkspace[];
  // The saved override, or null when the sidebar is on its code default.
  override: NavOrderOverride | null;
  // Push a new order to the live sidebar (called after a successful save/reset).
  onApply: (order: NavOrderOverride | null) => void;
}) {
  const accentGrad = accentGradient(theme);

  // Working draft — the order being edited. Seeded from the live nav and
  // re-seeded if the saved order loads/changes while there are no unsaved edits.
  const [list, setList] = useState<NavWorkspace[]>(() => cloneNav(nav));
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!dirty) setList(cloneNav(nav));
  }, [nav, dirty]);

  function moveWorkspace(index: number, dir: number) {
    setList((cur) => {
      const next = moveBy(cur, index, dir);
      if (next !== cur) {
        setDirty(true);
        setMsg(null);
      }
      return next;
    });
  }

  function moveSection(wsKey: string, index: number, dir: number) {
    setList((cur) =>
      cur.map((w) => {
        if (w.key !== wsKey) return w;
        const sections = moveBy(w.sections, index, dir);
        if (sections !== w.sections) {
          setDirty(true);
          setMsg(null);
        }
        return sections === w.sections ? w : { ...w, sections };
      }),
    );
  }

  const allOpen = list.length > 0 && list.every((w) => expanded[w.key]);
  function toggleAll() {
    setExpanded(allOpen ? {} : Object.fromEntries(list.map((w) => [w.key, true])));
  }
  function toggleOne(key: string) {
    setExpanded((e) => ({ ...e, [key]: !e[key] }));
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const order = buildNavOrder(list);
    try {
      // Ordering back to the code default clears the override rather than
      // storing a redundant copy — keeps a future nav change from being frozen.
      if (isDefaultOrder(order)) {
        await api.adminResetNavLayout();
        onApply(null);
      } else {
        await api.adminSaveNavLayout(order);
        onApply(order);
      }
      setDirty(false);
      setMsg({ ok: true, text: 'Saved. Everyone now sees the sidebar in this order.' });
    } catch {
      setMsg({ ok: false, text: 'Could not save the layout. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  async function resetToDefault() {
    setBusy(true);
    setMsg(null);
    try {
      await api.adminResetNavLayout();
      onApply(null);
      setList(cloneNav(NAV));
      setDirty(false);
      setMsg({ ok: true, text: 'Reset to the built-in sidebar order.' });
    } catch {
      setMsg({ ok: false, text: 'Could not reset the layout. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  const canReset = override != null || dirty;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', color: '#dfe7fa' }}>
      <SectionHeader
        title="Sidebar Layout"
        subtitle="Reorder the workspaces and the sections inside each one. Changes apply to the sidebar for everyone once you save."
      />

      <div style={{ ...msgStyle(true), marginTop: 0, marginBottom: 16, color: '#9fb4dd', background: 'rgba(11,26,58,.5)', border: `1px solid ${theme.navBorder}` }}>
        {"This only changes the order — nothing is added, removed, or moved between workspaces."}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button onClick={toggleAll} disabled={busy} style={{ ...linkBtn, opacity: busy ? 0.55 : 1, cursor: busy ? 'default' : 'pointer' }}>
          <Icon name={allOpen ? 'chevrons-down-up' : 'chevrons-up-down'} size={14} />
          {allOpen ? (
            "Collapse all"
          ) : (
            "Expand all"
          )}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map((w, wi) => {
          const open = !!expanded[w.key];
          return (
            <div key={w.key} style={panel(theme)}>
              {/* The whole header row toggles the workspace open/closed; the move
                  arrows stopPropagation so they never toggle it by accident. */}
              <div
                role="button"
                tabIndex={0}
                aria-expanded={open}
                aria-label={open ? `Hide ${w.label} sections` : `Reorder ${w.label} sections`}
                onClick={() => toggleOne(w.key)}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleOne(w.key);
                  }
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
              >
                <Icon name="grip-vertical" size={16} color="#5f74a3" />
                <Icon name={w.icon} size={17} color={w.accent} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#eef3ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {w.label}
                  </div>
                  <div style={{ fontSize: 11, color: '#7488b5' }}>
                    {w.sections.length} section{w.sections.length === 1 ? '' : 's'}
                    {' · '}
                    {open ? (
                      "reorder below"
                    ) : (
                      "click to reorder"
                    )}
                  </div>
                </div>
                <MoveButtons
                  onUp={() => moveWorkspace(wi, -1)}
                  onDown={() => moveWorkspace(wi, 1)}
                  upDisabled={wi === 0 || busy}
                  downDisabled={wi === list.length - 1 || busy}
                  label={w.label}
                />
                {/* A plain rotating caret — an open/closed indicator, visually
                    distinct from the move arrows so the two aren't confused. */}
                <span style={{ ...caret, flex: 'none' }} aria-hidden>
                  <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#9fb4dd" />
                </span>
              </div>

              {open && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${theme.navBorder}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.4px', textTransform: 'uppercase', color: '#7f93bd', marginBottom: 2 }}>
                    {"Reorder sections"}
                  </div>
                  {w.sections.map((s, si) => (
                    <div
                      key={s.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '7px 8px 7px 10px',
                        borderRadius: 8,
                        background: 'rgba(6,15,36,.45)',
                        border: '1px solid #16294b',
                      }}
                    >
                      <Icon name="grip-vertical" size={14} color="#455a86" />
                      <Icon name={s.icon} size={15} color="#8ea3cc" />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#dfe7fa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.label}
                      </span>
                      <MoveButtons
                        onUp={() => moveSection(w.key, si, -1)}
                        onDown={() => moveSection(w.key, si, 1)}
                        upDisabled={si === 0 || busy}
                        downDisabled={si === w.sections.length - 1 || busy}
                        label={s.label}
                        small
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {msg && <div style={msgStyle(msg.ok)}>{msg.text}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <button
          onClick={save}
          disabled={busy || !dirty}
          style={{ ...primaryBtn(theme, accentGrad), opacity: busy || !dirty ? 0.55 : 1, cursor: busy || !dirty ? 'default' : 'pointer' }}
        >
          {busy ? 'Saving…' : "Save layout"}
        </button>
        <button
          onClick={resetToDefault}
          disabled={busy || !canReset}
          title="Restore the built-in sidebar order"
          style={{ ...ghostBtn, opacity: busy || !canReset ? 0.55 : 1, cursor: busy || !canReset ? 'default' : 'pointer' }}
        >
          {"Reset to default"}
        </button>
      </div>
    </div>
  );
}

const iconBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 34,
  height: 34,
  flex: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  color: '#aebcd8',
  background: 'rgba(0,0,0,.18)',
  border: '1px solid #2a4170',
};

const caret: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 34,
};

const linkBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12.5,
  fontWeight: 600,
  color: '#aebcd8',
  background: 'transparent',
  border: 'none',
  padding: '4px 6px',
  fontFamily: 'inherit',
};

function MoveButtons({
  onUp,
  onDown,
  upDisabled,
  downDisabled,
  label,
  small,
}: {
  onUp: () => void;
  onDown: () => void;
  upDisabled: boolean;
  downDisabled: boolean;
  label: string;
  small?: boolean;
}) {
  const size = small ? 30 : 34;
  const btn = (disabled: boolean): CSSProperties => ({
    ...iconBtn,
    width: size,
    height: size,
    opacity: disabled ? 0.4 : 1,
    cursor: disabled ? 'default' : 'pointer',
  });
  // stopPropagation: these arrows sit inside a clickable workspace header, so a
  // click here must move the row without also toggling the accordion.
  const guard = (fn: () => void) => (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    fn();
  };
  return (
    <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
      <button onClick={guard(onUp)} disabled={upDisabled} title={`Move ${label} up`} aria-label={`Move ${label} up`} style={btn(upDisabled)}>
        <Icon name="chevron-up" size={small ? 14 : 16} />
      </button>
      <button onClick={guard(onDown)} disabled={downDisabled} title={`Move ${label} down`} aria-label={`Move ${label} down`} style={btn(downDisabled)}>
        <Icon name="chevron-down" size={small ? 14 : 16} />
      </button>
    </div>
  );
}
