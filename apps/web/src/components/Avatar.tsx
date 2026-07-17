import type { CSSProperties } from 'react';
import { C } from '../theme/tokens';

// A small round avatar: the user's profile picture when set, otherwise their
// initial on a navy chip. Used in the top bar, the account menu, and next to
// each team-chat message.
export function Avatar({
  name,
  src,
  size = 32,
  accent = C.gold,
  style,
}: {
  name: string;
  src?: string | null;
  size?: number;
  accent?: string;
  style?: CSSProperties;
}) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  const base: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    flex: 'none',
    border: `1px solid ${accent}`,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...style,
  };
  if (src) {
    return (
      <div style={base}>
        <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    );
  }
  return (
    <div
      style={{
        ...base,
        background: 'linear-gradient(135deg,#143FA0,#0A2A6B)',
        fontFamily: C.mono,
        fontWeight: 600,
        fontSize: size * 0.42,
        color: accent,
      }}
    >
      {initial}
    </div>
  );
}
