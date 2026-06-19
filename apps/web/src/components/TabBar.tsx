import type { Theme, TabDef } from '../theme/themes';

interface TabBarProps {
  tabs: TabDef[];
  screen: string;
  theme: Theme;
  onSelect: (key: string) => void;
}

export function TabBar({ tabs, screen, theme, onSelect }: TabBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 26px',
        height: 48,
        background: theme.navBg,
        borderBottom: `1px solid ${theme.navBorder}`,
        position: 'sticky',
        top: 62,
        zIndex: 20,
      }}
    >
      <nav style={{ display: 'flex', alignItems: 'center', gap: 24, height: '100%' }}>
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
