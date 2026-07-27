import type { Theme } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';
import { Icon } from '../../components/Icon';

// The Investments workspace foundation. Every section here is a themed
// "Coming Soon" placeholder describing what the section will do once its data is
// wired. The workspace is a read-only, layman-friendly long-term portfolio
// tracker (401k / IRA / ESA / general holdings): it displays and educates, it
// never executes trades or moves money, and it carries no personalized
// buy/sell/rebalance advice — hence the "informational only" note on every card.
//
// The same component also backs the My Portal ▸ Investment Holdings summary,
// which will combine active Advanced Trading positions with the long-term
// Investments portfolio.

interface SectionInfo {
  /** EditableText id stem — `<stem>.title` / `<stem>.blurb`. */
  id: string;
  icon: string;
  title: string;
  blurb: string;
}

const SECTIONS: Record<string, SectionInfo> = {
  // My Portal — the combined views across trading, long-term investing, and your
  // whole financial life.
  my_holdings: {
    id: 'myportal.holdings',
    icon: 'gem',
    title: 'Investment Holdings',
    blurb:
      'Your whole picture in one place — active Advanced Trading positions merged with your long-term Investments portfolio, plus the combined value, day change, and all-time performance across both.',
  },
  my_networth: {
    id: 'myportal.networth',
    icon: 'scale',
    title: 'Net Worth',
    blurb:
      'Your complete financial picture in one number, tracked over time — everything you own (cash, investments, real estate, crypto, vehicles) minus everything you owe (loans, cards, mortgage). Add assets and liabilities by hand or pull them in read-only.',
  },
  // Investments workspace sections.
  inv_overview: {
    id: 'inv.overview',
    icon: 'layout-dashboard',
    title: 'Portfolio Overview',
    blurb:
      "A single dashboard for every connected account: total value, today's move, all-time gain, and your top movers at a glance.",
  },
  inv_accounts: {
    id: 'inv.accounts',
    icon: 'building-2',
    title: 'Accounts',
    blurb:
      'Connect your 401(k), IRA, ESA, and brokerage accounts read-only through a secure aggregator (Plaid / SnapTrade), or add holdings by hand. Balances and positions only — never trade access.',
  },
  inv_holdings: {
    id: 'inv.holdings',
    icon: 'layers',
    title: 'Holdings',
    blurb:
      "Every security you own across all accounts, with cost basis, unrealized gain/loss, and each position's weight in your portfolio.",
  },
  inv_allocation: {
    id: 'inv.allocation',
    icon: 'gauge',
    title: 'Allocation',
    blurb:
      "See how you're diversified — by asset class, sector, and region — with plain-English flags when any one holding gets too concentrated.",
  },
  inv_performance: {
    id: 'inv.performance',
    icon: 'trending-up',
    title: 'Performance',
    blurb:
      'Your returns over time next to a benchmark like the S&P 500, split into what you contributed versus what the market did.',
  },
  inv_dividends: {
    id: 'inv.dividends',
    icon: 'banknote',
    title: 'Dividends & Income',
    blurb:
      'Track the income your portfolio pays — dividend history, forward yield, and an ex-dividend / payout calendar.',
  },
  inv_contributions: {
    id: 'inv.contributions',
    icon: 'piggy-bank',
    title: 'Contributions & Goals',
    blurb:
      'Follow your 401(k) and IRA contributions against the annual limits and watch progress toward your savings goals for retirement or education.',
  },
  inv_projections: {
    id: 'inv.projections',
    icon: 'sparkles',
    title: 'Projections',
    blurb:
      'Estimate where your portfolio could land over the years with simple compound-growth projections. Estimates only — informational, not investment advice.',
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
