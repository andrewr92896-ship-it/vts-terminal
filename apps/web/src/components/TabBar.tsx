import type { Theme, TabDef } from '../theme/themes';
import { useResponsive } from '../hooks/useMediaQuery';

interface TabBarProps {
  tabs: TabDef[];
  screen: string;
  theme: Theme;
  onSelect: (key: string) => void;
}

export function TabBar({ tabs, screen, theme, onSelect }: TabBarProps) {
  const { isPhone, isTablet } = useResponsive();
  const narrow = isTablet;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: narrow ? (isPhone ? '0 14px' : '0 18px') : '0 26px',
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
                borderBottom: active
                  ? `2px solid ${theme.accent}`
                  : '2px solid transparent',
              }}
            >
              {t.label}
              {t.dot && (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: t.dot,
                    animation: 'livePulse 2s infinite',
                  }}
                />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
