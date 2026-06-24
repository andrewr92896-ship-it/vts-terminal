import { useState } from 'react';
import type { Theme, TabDef } from '../theme/themes';
import { useResponsive } from '../hooks/useMediaQuery';

interface TabBarProps {
  tabs: TabDef[];
  screen: string;
  theme: Theme;
  onSelect: (key: string) => void;
}

function Dot({ color }: { color: string }) {
  return (
    <span
      style={{ width: 6, height: 6, borderRadius: '50%', background: color, animation: 'livePulse 2s infinite' }}
    />
  );
}

export function TabBar({ tabs, screen, theme, onSelect }: TabBarProps) {
  const { isPhone, isTablet } = useResponsive();
  const narrow = isTablet;
  const [open, setOpen] = useState(false);
  const current = tabs.find((t) => t.key === screen) ?? tabs[0];

  // On phones the sub-tabs would scroll off the edge, so they collapse into a
  // single section picker dropdown that names the current screen.
  if (isPhone) {
    return (
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: theme.navBg,
          borderBottom: `1px solid ${theme.navBorder}`,
          padding: '0 14px',
          height: 48,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div style={{ position: 'relative', width: '100%' }}>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Choose section"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              height: 48,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: theme.accent,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.3px',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {current?.label}
              {current?.dot && <Dot color={current.dot} />}
            </span>
            <span style={{ fontSize: 11, color: '#8ea3cc' }}>▾</span>
          </button>

          {open && (
            <>
              <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 24 }} />
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 'calc(100% + 4px)',
                  background: '#0c1c3c',
                  border: `1px solid ${theme.navBorder}`,
                  borderRadius: 10,
                  boxShadow: '0 16px 40px rgba(0,0,0,.5)',
                  padding: 6,
                  zIndex: 25,
                  maxHeight: '60vh',
                  overflowY: 'auto',
                }}
              >
                {tabs.map((t) => {
                  const active = screen === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => {
                        onSelect(t.key);
                        setOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        textAlign: 'left',
                        background: active ? 'rgba(255,255,255,.06)' : 'transparent',
                        border: 'none',
                        color: active ? theme.accent : '#cfe0ff',
                        fontSize: 14,
                        fontWeight: 600,
                        padding: '11px 10px',
                        borderRadius: 7,
                        cursor: 'pointer',
                      }}
                    >
                      {t.label}
                      {t.dot && <Dot color={t.dot} />}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: narrow ? '0 18px' : '0 26px',
        height: 48,
        background: theme.navBg,
        borderBottom: `1px solid ${theme.navBorder}`,
        position: 'sticky',
        // On narrow screens the header scrolls away, so the tab row sticks to
        // the very top. On desktop it stays pinned just below the 62px header.
        top: narrow ? 0 : 62,
        zIndex: 20,
        // Let the tab row scroll horizontally instead of overflowing the page.
        overflowX: narrow ? 'auto' : undefined,
      }}
    >
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: narrow ? 18 : 24,
          height: '100%',
          flexWrap: 'nowrap',
        }}
      >
        {tabs.map((t) => {
          const active = screen === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onSelect(t.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                height: '100%',
                flex: 'none',
                whiteSpace: 'nowrap',
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '0.3px',
                color: active ? theme.accent : '#8ea3cc',
                borderBottom: active ? `2px solid ${theme.accent}` : '2px solid transparent',
              }}
            >
              {t.label}
              {t.dot && <Dot color={t.dot} />}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
