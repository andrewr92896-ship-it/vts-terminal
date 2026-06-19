import type { Theme } from '../theme/themes';
import { accentGradient } from '../theme/themes';

interface AskClaudePanelProps {
  open: boolean;
  theme: Theme;
  onClose: () => void;
}

// Stage 1 placeholder. The live Claude Opus layer (global Ask Claude,
// per-workspace command bars, proactive insights) arrives in Stage 4.
export function AskClaudePanel({ open, theme, onClose }: AskClaudePanelProps) {
  if (!open) return null;
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,.45)',
          zIndex: 50,
          animation: 'fadeIn .2s ease',
        }}
      />
      <aside
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100vh',
          width: 'min(420px, 92vw)',
          background: 'linear-gradient(180deg,#0b1a3a,#081226)',
          borderLeft: `1px solid ${theme.navBorder}`,
          boxShadow: '-16px 0 50px rgba(0,0,0,.5)',
          zIndex: 51,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideIn .25s ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 20px',
            borderBottom: `1px solid ${theme.navBorder}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: accentGradient(theme),
              }}
            />
            <strong style={{ fontSize: 14, color: '#eef3ff' }}>Ask Claude</strong>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#7488b5',
              fontSize: 20,
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 20, color: '#aebcd8', fontSize: 13, lineHeight: 1.6 }}>
          <p style={{ marginTop: 0 }}>
            The Claude Opus assistant connects in <strong>Stage 4</strong>.
          </p>
          <p>It will power:</p>
          <ul style={{ paddingLeft: 18, margin: '0 0 16px' }}>
            <li>Global Ask Claude across every workspace</li>
            <li>Per-workspace command bars (Trading act, Kia deals, To Do parser)</li>
            <li>Proactive insights on trades, slippage, and session patterns</li>
          </ul>
          <textarea
            disabled
            placeholder="Available in Stage 4..."
            style={{
              width: '100%',
              height: 90,
              resize: 'none',
              background: 'rgba(6,15,36,.6)',
              border: '1px solid #1d3560',
              borderRadius: 8,
              color: '#6f84b2',
              padding: 12,
              fontSize: 13,
            }}
          />
        </div>
      </aside>
    </>
  );
}
