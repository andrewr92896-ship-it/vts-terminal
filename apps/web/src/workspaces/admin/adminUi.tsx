import type { CSSProperties, ReactNode } from 'react';
import type { Theme } from '../../theme/themes';

// Shared styles and small pieces for the Admin workspace sections (Users,
// Teams, Early Access). Kept in one place so the three sections look identical.

export function panel(theme: Theme): CSSProperties {
  return {
    background: 'rgba(11,26,58,.5)',
    border: `1px solid ${theme.navBorder}`,
    borderRadius: 10,
    padding: '15px 16px',
  };
}

export const panelLabel: CSSProperties = {
  fontSize: 10.5,
  letterSpacing: '0.6px',
  textTransform: 'uppercase',
  color: '#7488b5',
  marginBottom: 12,
  fontWeight: 600,
};

export const fieldLabel: CSSProperties = {
  display: 'block',
  fontSize: 10.5,
  letterSpacing: '0.4px',
  textTransform: 'uppercase',
  color: '#8ea3cc',
  marginBottom: 6,
};

export const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 13,
  color: '#eef3ff',
  background: 'rgba(6,15,36,.6)',
  border: '1px solid #1d3560',
  borderRadius: 8,
  outline: 'none',
  minHeight: 40,
};

export function primaryBtn(theme: Theme, grad: string): CSSProperties {
  return {
    border: 'none',
    background: grad,
    color: theme.accentText,
    fontWeight: 600,
    fontSize: 13,
    padding: '10px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 40,
  };
}

export const ghostBtn: CSSProperties = {
  border: '1px solid #2a4170',
  background: 'rgba(0,0,0,.18)',
  color: '#cfe0ff',
  fontSize: 12.5,
  fontWeight: 600,
  padding: '9px 13px',
  borderRadius: 8,
  cursor: 'pointer',
  minHeight: 40,
};

export const dangerBtn: CSSProperties = {
  border: '1px solid rgba(239,84,104,.4)',
  background: 'rgba(239,84,104,.1)',
  color: '#ff8a80',
  fontSize: 12.5,
  fontWeight: 600,
  padding: '9px 13px',
  borderRadius: 8,
  cursor: 'pointer',
  minHeight: 40,
};

// A more muted danger outline for a first "Delete" click, so it reads as
// distinct from an adjacent (also red) action.
export const ghostDangerBtn: CSSProperties = {
  border: '1px solid rgba(239,84,104,.3)',
  background: 'rgba(0,0,0,.18)',
  color: '#e69a96',
  fontSize: 12.5,
  fontWeight: 600,
  padding: '9px 13px',
  borderRadius: 8,
  cursor: 'pointer',
  minHeight: 40,
};

// Solid red for the irreversible "Confirm delete" action.
export const dangerSolidBtn: CSSProperties = {
  border: '1px solid #ef5468',
  background: 'linear-gradient(180deg,#ef5468,#c8324a)',
  color: '#fff',
  fontSize: 12.5,
  fontWeight: 700,
  padding: '9px 13px',
  borderRadius: 8,
  cursor: 'pointer',
  minHeight: 40,
};

export function msgStyle(ok: boolean): CSSProperties {
  return {
    marginTop: 12,
    fontSize: 12.5,
    color: ok ? '#7fe0c0' : '#ff8a80',
    background: ok ? 'rgba(53,196,123,.1)' : 'rgba(239,84,104,.1)',
    border: `1px solid ${ok ? 'rgba(53,196,123,.4)' : 'rgba(239,84,104,.4)'}`,
    borderRadius: 7,
    padding: '9px 12px',
    lineHeight: 1.5,
  };
}

export function Badge({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: '0.4px',
        color,
        border: `1px solid ${color}`,
        borderRadius: 4,
        padding: '2px 7px',
      }}
    >
      {children}
    </span>
  );
}

// A simple page header used at the top of each Admin section.
export function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#eef3ff' }}>{title}</h2>
      <p style={{ margin: '5px 0 0', fontSize: 12.5, color: '#8ea3cc', lineHeight: 1.5 }}>{subtitle}</p>
    </div>
  );
}
