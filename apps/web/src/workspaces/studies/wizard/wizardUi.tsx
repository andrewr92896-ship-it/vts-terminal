import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../../components/Icon';
import type { Theme } from '../../../theme/themes';

// The small set of controls every wizard card is built from. One question per
// card, so a card is a prompt plus one control — keeping them here is what stops
// twenty cards drifting into twenty layouts.

export const TEXT = '#eef3ff';
export const MUTED = '#9fb0d6';
export const FAINT = '#6f84b0';
export const PAGE = '#0a1124';
export const BORDER = '#25305a';
export const INPUT_BG = '#0d1630';

/** The question itself. Short, and the only heading on the card. */
export function Prompt({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff', lineHeight: 1.35 }}>{children}</h3>
      {sub && <p style={{ margin: '7px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.55 }}>{sub}</p>}
    </div>
  );
}

export interface Option<T> {
  value: T;
  label: string;
  /** One short line, only where the label alone genuinely cannot say it. */
  note?: string;
}

/** A stack of large choice buttons — the wizard's default control. */
export function ChoiceGroup<T extends string | boolean>({
  theme,
  options,
  value,
  onChange,
}: {
  theme: Theme;
  options: Option<T>[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              textAlign: 'left',
              padding: '13px 14px',
              borderRadius: 10,
              cursor: 'pointer',
              fontFamily: 'inherit',
              background: on ? `${theme.accent}1a` : 'rgba(255,255,255,.03)',
              border: `1px solid ${on ? theme.accent : BORDER}`,
              color: TEXT,
            }}
          >
            <span
              style={{
                flex: 'none',
                width: 16,
                height: 16,
                borderRadius: 999,
                border: `2px solid ${on ? theme.accent : '#3d4a78'}`,
                background: on ? theme.accent : 'transparent',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {on && <Icon name="check" size={10} color={theme.accentText} />}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{o.label}</span>
              {o.note && (
                <span style={{ display: 'block', marginTop: 3, fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
                  {o.note}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  autoFocus,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onEnter) {
          e.preventDefault();
          onEnter();
        }
      }}
      placeholder={placeholder}
      autoFocus={autoFocus}
      style={fieldStyle}
    />
  );
}

export function NumberField({
  value,
  onChange,
  min,
  max,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value)}
      autoFocus={autoFocus}
      style={{ ...fieldStyle, maxWidth: 160 }}
    />
  );
}

export const fieldStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '11px 12px',
  borderRadius: 9,
  border: `1px solid ${BORDER}`,
  background: INPUT_BG,
  color: TEXT,
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
};

/** A local, plain-language problem with the answer on this card. */
export function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        marginTop: 12,
        fontSize: 12.5,
        color: '#ffb4a8',
      }}
    >
      <Icon name="alert-triangle" size={13} color="#ffb4a8" />
      {children}
    </div>
  );
}

/** The thin bar at the top of the modal. */
export function Progress({ theme, fraction }: { theme: Theme; fraction: number }) {
  return (
    <div style={{ height: 3, background: 'rgba(255,255,255,.07)', borderRadius: 999, overflow: 'hidden' }}>
      <div
        style={{
          width: `${Math.max(4, Math.min(100, fraction * 100))}%`,
          height: '100%',
          background: theme.accent,
          transition: 'width .2s ease',
        }}
      />
    </div>
  );
}

export function secondaryBtn(theme: Theme): CSSProperties {
  return {
    fontSize: 13,
    fontWeight: 600,
    color: '#dfe7fa',
    background: 'rgba(255,255,255,.05)',
    border: `1px solid ${BORDER}`,
    padding: '10px 15px',
    borderRadius: 9,
    cursor: 'pointer',
    fontFamily: 'inherit',
    // Referenced so the signature matches primaryBtn and callers need not care.
    outlineColor: theme.accent,
  };
}

export function primaryBtn(theme: Theme, disabled = false): CSSProperties {
  return {
    fontSize: 13,
    fontWeight: 700,
    color: disabled ? '#7d8ab0' : theme.accentText,
    background: disabled ? 'rgba(255,255,255,.06)' : theme.accent,
    border: `1px solid ${disabled ? BORDER : theme.accent}`,
    padding: '10px 18px',
    borderRadius: 9,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
  };
}
