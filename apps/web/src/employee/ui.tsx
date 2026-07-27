import type { CSSProperties, ReactNode } from 'react';
import { EMP, EMP_GRADIENT, tint } from './theme';
import { Icon } from '../components/Icon';

// The small set of shared presentational pieces the employee screens are built
// from. Kept local to the employee bundle so this surface never depends on the
// main portal's component tree.

export const label: CSSProperties = {
  fontSize: 10.5,
  letterSpacing: '1.3px',
  textTransform: 'uppercase',
  color: EMP.faint,
  fontWeight: 600,
};

export function Card({
  children,
  style,
  pad = 18,
}: {
  children: ReactNode;
  style?: CSSProperties;
  pad?: number;
}) {
  return (
    <div
      style={{
        background: EMP.panel,
        border: `1px solid ${EMP.line}`,
        borderRadius: 12,
        padding: pad,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function ScreenHeader({
  icon,
  title,
  subtitle,
  actions,
}: {
  icon: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        flexWrap: 'wrap',
        marginBottom: 20,
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: tint(EMP.accent, 0.12),
          border: `1px solid ${tint(EMP.accent, 0.3)}`,
          color: EMP.accent,
        }}
      >
        <Icon name={icon} size={19} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <h1
          style={{
            margin: 0,
            fontFamily: EMP.serif,
            fontSize: 21,
            fontWeight: 700,
            color: EMP.text,
            letterSpacing: '0.1px',
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p style={{ margin: '5px 0 0', fontSize: 12.5, color: EMP.muted, lineHeight: 1.55, maxWidth: 720 }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'ghost',
  disabled,
  type = 'button',
  style,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
  style?: CSSProperties;
  title?: string;
}) {
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    padding: '9px 15px',
    borderRadius: 9,
    fontSize: 12.5,
    fontWeight: 600,
    fontFamily: EMP.sans,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    border: `1px solid ${EMP.line2}`,
    background: 'rgba(255,255,255,.03)',
    color: EMP.text,
    transition: 'background .15s ease, border-color .15s ease',
  };
  const variants: Record<string, CSSProperties> = {
    primary: { background: EMP_GRADIENT, color: EMP.accentText, border: 'none' },
    ghost: {},
    danger: { color: EMP.red, borderColor: tint(EMP.red, 0.35), background: tint(EMP.red, 0.08) },
  };
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{ ...base, ...variants[variant], ...style }}
    >
      {children}
    </button>
  );
}

const controlBase: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: EMP.bg,
  border: `1px solid ${EMP.line2}`,
  borderRadius: 9,
  padding: '10px 12px',
  color: EMP.text,
  fontSize: 13,
  fontFamily: EMP.sans,
  outline: 'none',
};

export function Field({
  label: text,
  children,
  hint,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ ...label, display: 'block', marginBottom: 6 }}>{text}</span>
      {children}
      {hint && (
        <span style={{ display: 'block', marginTop: 5, fontSize: 11.5, color: EMP.faint, lineHeight: 1.5 }}>
          {hint}
        </span>
      )}
    </label>
  );
}

export function Input(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  inputMode?: 'text' | 'numeric' | 'email';
  maxLength?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  const { value, onChange, style, ...rest } = props;
  return (
    <input
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...controlBase, ...style }}
    />
  );
}

export function TextArea(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}) {
  const { value, onChange, rows = 5, ...rest } = props;
  return (
    <textarea
      {...rest}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...controlBase, resize: 'vertical', lineHeight: 1.6 }}
    />
  );
}

export function Select<V extends string>({
  value,
  onChange,
  options,
}: {
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as V)}
      style={{ ...controlBase, cursor: 'pointer' }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} style={{ background: EMP.panel }}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent';
}) {
  const colors: Record<string, string> = {
    neutral: EMP.faint,
    good: EMP.green,
    warn: EMP.amber,
    bad: EMP.red,
    accent: EMP.accent,
  };
  const c = colors[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontFamily: EMP.mono,
        fontSize: 10,
        letterSpacing: '0.6px',
        textTransform: 'uppercase',
        color: c,
        border: `1px solid ${tint(c, 0.35)}`,
        background: tint(c, 0.08),
        borderRadius: 999,
        padding: '3px 8px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

export function Banner({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'bad' | 'good';
  children: ReactNode;
}) {
  const colors: Record<string, string> = {
    info: EMP.accent,
    warn: EMP.amber,
    bad: EMP.red,
    good: EMP.green,
  };
  const c = colors[tone];
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        border: `1px solid ${tint(c, 0.35)}`,
        background: tint(c, 0.07),
        borderRadius: 10,
        padding: '11px 13px',
        color: EMP.text,
        fontSize: 12.5,
        lineHeight: 1.6,
      }}
    >
      <span style={{ color: c, flex: 'none', marginTop: 1 }}>
        <Icon name={tone === 'good' ? 'check-check' : 'shield'} size={15} />
      </span>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

export function Empty({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        padding: '44px 20px',
        color: EMP.faint,
        fontSize: 13,
        textAlign: 'center',
      }}
    >
      <Icon name={icon} size={26} />
      <div style={{ maxWidth: 420, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div
      style={{
        color: EMP.red,
        fontSize: 12.5,
        lineHeight: 1.55,
        border: `1px solid ${tint(EMP.red, 0.3)}`,
        background: tint(EMP.red, 0.07),
        borderRadius: 9,
        padding: '9px 12px',
      }}
    >
      {children}
    </div>
  );
}

// A labelled read-only value — the directory and profile cards are built of these.
export function Detail({ term, children }: { term: ReactNode; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...label, marginBottom: 4 }}>{term}</div>
      <div style={{ fontSize: 13, color: EMP.text, wordBreak: 'break-word' }}>{children}</div>
    </div>
  );
}

export function DetailGrid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: 16,
      }}
    >
      {children}
    </div>
  );
}
