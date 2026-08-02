import type { Theme } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';
import { Icon } from '../../components/Icon';

// Themed "Coming Soon" placeholders for the sections that are not built yet.
//
// The Investments workspace itself IS built — see workspaces/investments/. What
// is left here are the two My Terminal roll-ups, and they are last for a reason:
// each one summarises across workspaces (Advanced Trading positions plus the
// long-term Investments portfolio; then every asset and liability on top of
// that), so neither can be right until the thing it summarises exists.

interface SectionInfo {
  icon: string;
  title: string;
  blurb: string;
}

const SECTIONS: Record<string, SectionInfo> = {
  // My Terminal — the combined views across trading, long-term investing, and your
  // whole financial life.
  my_holdings: {
    icon: 'gem',
    title: 'Investment Holdings',
    blurb:
      'Your whole picture in one place — active Advanced Trading positions merged with your long-term Investments portfolio, plus the combined value, day change, and all-time performance across both.',
  },
  my_networth: {
    icon: 'scale',
    title: 'Net Worth',
    blurb:
      'Your complete financial picture in one number, tracked over time — everything you own (cash, investments, real estate, crypto, vehicles) minus everything you owe (loans, cards, mortgage). Add assets and liabilities by hand or pull them in read-only.',
  },
};

// Section keys this placeholder knows how to render. Portal routes these through
// ComingSoon; anything else falls through to the generic screen.
export const COMING_SOON_SCREENS = new Set(Object.keys(SECTIONS));

export function ComingSoon({ screen, theme }: { screen: string; theme: Theme }) {
  const { isPhone } = useResponsive();
  const info = SECTIONS[screen];
  if (!info) return null;

  const accent = theme.accent;
  const accentSoft = accent + '1f'; // ~12% alpha tint over the navy panel

  return (
    <div style={{ maxWidth: 760, margin: isPhone ? '16px auto' : '40px auto', animation: 'cardIn .35s ease' }}>
      <div
        style={{
          background: 'linear-gradient(180deg,rgba(9,26,42,.5),rgba(6,18,30,.6))',
          border: `1px solid ${theme.navBorder}`,
          borderLeft: `3px solid ${accent}`,
          borderRadius: 14,
          padding: isPhone ? '20px 18px' : '28px 30px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 38,
              height: 38,
              borderRadius: 10,
              background: accentSoft,
              border: `1px solid ${accent}`,
              color: accent,
              flex: 'none',
            }}
          >
            <Icon name={info.icon} size={19} color={accent} />
          </span>
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.6px',
              textTransform: 'uppercase',
              color: accent,
              border: `1px solid ${accent}`,
              borderRadius: 5,
              padding: '3px 9px',
              opacity: 0.9,
            }}
          >
            {"Coming Soon"}
          </span>
        </div>

        <h2 style={{ margin: '0 0 10px', fontSize: 24, fontWeight: 700, color: '#eef3ff' }}>
          {info.title}
        </h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: '#aebcd8' }}>
          {info.blurb}
        </p>

        <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${theme.navBorder}` }}>
          <p
            style={{
              margin: 0,
              fontSize: 11.5,
              lineHeight: 1.6,
              color: '#5d72a0',
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            {"We’re building this now. Investments is an informational, read-only tracker — it never places trades or moves money, and nothing here is investment, tax, or financial advice."}
          </p>
        </div>
      </div>
    </div>
  );
}
