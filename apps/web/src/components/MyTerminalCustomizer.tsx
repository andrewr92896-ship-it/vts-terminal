import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { C } from '../theme/tokens';
import {
  canApplyMyTerminal,
  isDefaultMyTerminal,
  myTerminalOwnRows,
  myTerminalPinRows,
  myTerminalSections,
  toggleOwnRow,
  togglePinnedRow,
  MY_TERMINAL_DEFAULT,
  type MyTerminalLayout,
  type MyTerminalReach,
  type NavLike,
} from '../theme/myTerminal';
import { Icon } from './Icon';

// The editor behind My Terminal ▸ Customize. It edits a DIFF against the code
// nav (see theme/myTerminal.ts for why that shape rather than a list) and hands
// the whole thing back on Save — nothing is written per keystroke, because a
// half-built board reaching the sidebar is worse than a Save button.

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 90,
  background: 'rgba(2,6,16,.72)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

const panel: CSSProperties = {
  width: 'min(720px,100%)',
  maxHeight: 'min(760px,92vh)',
  display: 'flex',
  flexDirection: 'column',
  background: C.panel,
  border: `1px solid ${C.line}`,
  borderRadius: 14,
  overflow: 'hidden',
};

function Row({
  label,
  icon,
  on,
  hint,
  disabled,
  onToggle,
}: {
  label: string;
  icon: string;
  on: boolean;
  hint?: string;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        textAlign: 'left',
        padding: '9px 11px',
        borderRadius: 9,
        border: `1px solid ${on ? 'rgba(52,211,153,.45)' : C.line}`,
        background: on ? 'rgba(52,211,153,.10)' : 'transparent',
        color: disabled ? C.faint : '#dfe7fa',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 13,
      }}
    >
      <Icon name={icon} size={15} color={on ? '#34D399' : C.faint} />
      <span style={{ flex: 1 }}>{label}</span>
      {hint && <span style={{ fontSize: 11, color: C.faint }}>{hint}</span>}
      <Icon name={on ? 'check' : 'plus'} size={14} color={on ? '#34D399' : C.faint} />
    </button>
  );
}

export function MyTerminalCustomizer({
  layout,
  reach,
  // The nav being customized. REQUIRED, with no default: a default would be the
  // private terminal's array, and this component is shared with the public
  // shell — which must not carry it. The public shell passes its own allowlist.
  nav,
  busy,
  onClose,
  onSave,
}: {
  layout: MyTerminalLayout;
  reach: MyTerminalReach;
  nav: NavLike;
  busy?: boolean;
  onClose: () => void;
  onSave: (next: MyTerminalLayout) => void;
}) {
  const [draft, setDraft] = useState<MyTerminalLayout>(layout);
  const own = useMemo(() => myTerminalOwnRows(nav, draft, reach), [nav, draft, reach]);
  const pins = useMemo(() => myTerminalPinRows(nav, draft, reach), [nav, draft, reach]);
  const resulting = useMemo(() => myTerminalSections(nav, draft, reach), [nav, draft, reach]);

  // A toggle that would empty the workspace is refused rather than saved and
  // regretted: a workspace with no rows draws a heading over nothing, and the
  // control that emptied it lives under that list.
  const apply = (next: MyTerminalLayout) => {
    if (!canApplyMyTerminal(nav, next, reach)) return;
    setDraft(next);
  };
  const lastOne = resulting.length === 1;

  return (
    <div style={overlay} onClick={onClose}>
      <div
        style={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Customize My Terminal"
        onClick={(e) => e.stopPropagation()}
      >
        <header
          style={{
            padding: '16px 18px',
            borderBottom: `1px solid ${C.line}`,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Icon name="briefcase" size={18} color="#34D399" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#eef3ff' }}>Customize My Terminal</div>
            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 3 }}>
              Put any section of the terminal on this workspace, and take off the ones you do not use.
              Nothing moves — a section you add here still lives in its own workspace too.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'transparent', border: 0, color: C.faint, cursor: 'pointer' }}
          >
            <Icon name="x-circle" size={18} />
          </button>
        </header>

        <div style={{ overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section>
            <div style={{ fontSize: 11, letterSpacing: '1px', textTransform: 'uppercase', color: C.faint, marginBottom: 8 }}>
              My Terminal's own sections
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {own.map(({ section, on }) => (
                <Row
                  key={section.key}
                  label={section.label}
                  icon={section.icon}
                  on={on}
                  disabled={on && lastOne}
                  hint={on && lastOne ? 'the last one' : undefined}
                  onToggle={() => apply(toggleOwnRow(draft, section.key, !on))}
                />
              ))}
            </div>
          </section>

          {pins.map(({ workspace, sections }) => (
            <section key={workspace.key}>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  color: workspace.accent,
                  marginBottom: 8,
                }}
              >
                {workspace.label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sections.map(({ section, on }) => (
                  <Row
                    key={section.key}
                    label={section.label}
                    icon={section.icon}
                    on={on}
                    disabled={on && lastOne}
                    hint={on && lastOne ? 'the last one' : undefined}
                    onToggle={() => apply(togglePinnedRow(draft, section.key, !on))}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer
          style={{
            padding: '12px 18px',
            borderTop: `1px solid ${C.line}`,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 11.5, color: C.faint, flex: 1 }}>
            {resulting.length} section{resulting.length === 1 ? '' : 's'} on My Terminal
          </span>
          {!isDefaultMyTerminal(draft) && (
            <button
              type="button"
              onClick={() => setDraft(MY_TERMINAL_DEFAULT)}
              style={{
                background: 'transparent',
                border: `1px solid ${C.line}`,
                borderRadius: 8,
                color: '#9fb0d6',
                padding: '7px 12px',
                fontSize: 12.5,
                cursor: 'pointer',
              }}
            >
              Reset to default
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => onSave(draft)}
            style={{
              background: '#34D399',
              border: 0,
              borderRadius: 8,
              color: '#052018',
              padding: '8px 16px',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: busy ? 'progress' : 'pointer',
            }}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  );
}
