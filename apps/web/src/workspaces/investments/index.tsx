import { InvestmentOverview } from './Overview';
import { InvestmentAccounts } from './Accounts';
import { InvestmentHoldings } from './Holdings';
import { InvestmentAllocation } from './Allocation';
import { InvestmentPerformanceScreen } from './Performance';
import { InvestmentDividendsScreen } from './Dividends';
import { InvestmentContributionsScreen } from './Contributions';
import { InvestmentProjections } from './Projections';

// One entry point for the whole Investments workspace, so Portal lazy-loads it
// as a single chunk rather than eight — the same treatment Studies gets. Nobody
// who never opens Investments pays for its code.
//
// The screen-key set lives in ./screens so Portal can read it without importing
// this file (which would drag the whole workspace into the main bundle).

export function InvestmentsWorkspace({
  screen,
  onNavigate,
}: {
  screen: string;
  onNavigate: (screen: string) => void;
}) {
  switch (screen) {
    case 'inv_overview':
      return <InvestmentOverview onNavigate={onNavigate} />;
    case 'inv_accounts':
      return <InvestmentAccounts onNavigate={onNavigate} />;
    case 'inv_holdings':
      return <InvestmentHoldings />;
    case 'inv_allocation':
      return <InvestmentAllocation onNavigate={onNavigate} />;
    case 'inv_performance':
      return <InvestmentPerformanceScreen onNavigate={onNavigate} />;
    case 'inv_dividends':
      return <InvestmentDividendsScreen />;
    case 'inv_contributions':
      return <InvestmentContributionsScreen />;
    case 'inv_projections':
      return <InvestmentProjections />;
    default:
      return null;
  }
}
