import type { CSSProperties, ReactNode } from 'react';
import { C, tint } from '../../theme/tokens';
import { Icon } from '../../components/Icon';

/**
 * The editor's form controls.
 *
 * Deliberately plain: labelled inputs, a list with move/remove, a tag box. The
 * portfolio's own look is in the preview beside them — dressing the form up to
 * match it would make the two hard to tell apart, which is the last thing an
 * editor wants.
 */

export const labelStyle: CSSProperties = {
  display: 'block',
  font: `600 10.5px/1.4 ${C.mono}`,
  letterSpacing: '.13em',
  textTransform: 'uppercase',
  color: C.faint,
  marginBottom: 7,
};

const control: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: `1px solid ${C.line2}`,
  background: C.panel2,
  color: C.text,
  font: `400 14px/1.5 ${C.sans}`,
  fontFamily: C.sans,
};

export function Text({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <span style={labelStyle}>{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...control, fontFamily: mono ? C.mono : C.sans }}
      />
    </div>
  );
}

export function Area({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <span style={labelStyle}>{label}</span>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...control, resize: 'vertical', lineHeight: 1.6 }}
      />
    </div>
  );
}

/**
 * Tags, edited as one comma-separated line.
 *
 * A chip editor with its own add and remove is a lot of interface for a list of
 * three short words, and a comma is how anybody would type them anyway. Empty
 * entries are dropped on the way in, so a trailing comma mid-typing never
 * becomes a blank chip on the page.
 */
export function Tags({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <span style={labelStyle}>{label} — separated by commas</span>
      <input
        value={value.join(', ')}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean),
          )
        }
        style={control}
      />
    </div>
  );
}

export function Check({
  label,
  checked,
  onChange,
  note,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  note?: string;
}) {
  return (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 16, height: 16, accentColor: C.gold, marginTop: 2, flex: 'none' }}
      />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', font: `500 13.5px/1.4 ${C.sans}`, color: C.text }}>{label}</span>
        {note && (
          <span style={{ display: 'block', font: `400 12.5px/1.6 ${C.sans}`, color: C.faint, marginTop: 3 }}>
            {note}
          </span>
        )}
      </span>
    </label>
  );
}

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 26 }}>
      <h3
        style={{
          margin: '0 0 14px',
          font: `600 11px/1.4 ${C.mono}`,
          letterSpacing: '.16em',
          textTransform: 'uppercase',
          color: C.gold,
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

/** A card with move-up / move-down / remove, used for items, buttons and nav. */
export function Row({
  title,
  index,
  count,
  onMove,
  onRemove,
  children,
}: {
  title: string;
  index: number;
  count: number;
  onMove: (to: number) => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        border: `1px solid ${C.line}`,
        borderRadius: 10,
        padding: '14px 16px',
        marginBottom: 12,
        background: 'rgba(255,255,255,.015)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            font: `600 12.5px/1.4 ${C.sans}`,
            color: C.muted,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
        <Tiny label="Move up" icon="chevron-up" disabled={index === 0} onClick={() => onMove(index - 1)} />
        <Tiny
          label="Move down"
          icon="chevron-down"
          disabled={index === count - 1}
          onClick={() => onMove(index + 1)}
        />
        <Tiny label="Remove" icon="trash" danger onClick={onRemove} />
      </div>
      {children}
    </div>
  );
}

export function Tiny({
  label,
  icon,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        padding: 6,
        borderRadius: 6,
        border: `1px solid ${danger ? tint('#d99aa8', 0.28) : C.line}`,
        background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        flex: 'none',
      }}
    >
      <Icon name={icon} size={13} color={danger ? '#d99aa8' : C.muted} />
    </button>
  );
}

export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '9px 14px',
        borderRadius: 8,
        border: `1px dashed ${C.line2}`,
        background: 'transparent',
        color: C.muted,
        font: `500 13px/1 ${C.sans}`,
        fontFamily: C.sans,
        cursor: 'pointer',
      }}
    >
      <Icon name="plus" size={13} color={C.muted} />
      {label}
    </button>
  );
}

/** Move an entry within a list, returning a new array. */
export function moved<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = list.slice();
  const [entry] = next.splice(from, 1);
  next.splice(to, 0, entry);
  return next;
}
