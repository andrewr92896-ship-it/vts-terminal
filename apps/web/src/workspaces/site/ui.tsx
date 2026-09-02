import type { CSSProperties, ReactNode } from 'react';
import { C } from '../../theme/tokens';

/** The heading every screen opens with. */
export function Screen({
  eyebrow,
  title,
  note,
  children,
}: {
  eyebrow: string;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ width: 'min(920px, 100%)', margin: '0 auto', padding: 'clamp(24px,4vw,44px) clamp(20px,4vw,40px) 64px' }}>
      <p
        style={{
          margin: 0,
          font: `500 .7rem/1.4 ${C.mono}`,
          letterSpacing: '.2em',
          textTransform: 'uppercase',
          color: C.gold,
        }}
      >
        {eyebrow}
      </p>
      <h1 style={{ margin: '10px 0 0', font: `700 1.6rem/1.2 ${C.sans}`, letterSpacing: '-.01em', color: C.text }}>
        {title}
      </h1>
      {note && (
        <p style={{ margin: '10px 0 0', font: `400 .95rem/1.65 ${C.sans}`, color: C.muted, maxWidth: '52rem' }}>
          {note}
        </p>
      )}
      <div
        style={{
          marginTop: 28,
          paddingTop: 28,
          borderTop: `1px solid ${C.line}`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.line}`,
        borderRadius: 12,
        padding: '22px 24px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
