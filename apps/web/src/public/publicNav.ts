import type { WorkspaceKey } from '../theme/themes';
import { C } from '../theme/tokens';

export type PublicWorkspaceKey = Extract<WorkspaceKey, 'myportal' | 'trading' | 'help'>;
export type PublicScreenKey = 'live' | 'data' | 'login' | 'two-factor';

export interface PublicNavWorkspace {
  key: PublicWorkspaceKey;
  label: string;
  icon: string;
  accent: string;
  group: string;
  sections: ReadonlyArray<{ key: PublicScreenKey; label: string; icon: string }>;
}

// Compile-time public route allowlist. It follows the portal's two-tier NAV
// model and retains the original safe screen keys, while omitted rows cannot be
// reached or bundled. Additions require the public dependency verifier.
export const PUBLIC_NAV: readonly PublicNavWorkspace[] = [
  {
    key: 'myportal', label: 'My Terminal', icon: 'briefcase', accent: '#34D399', group: 'My Terminal',
    sections: [{ key: 'data', label: 'Market Data', icon: 'line-chart' }],
  },
  {
    key: 'trading', label: 'Trade Tracking', icon: 'candlestick-chart', accent: C.gold, group: 'Trade Tracking',
    sections: [{ key: 'live', label: 'Live Wall', icon: 'layout-dashboard' }],
  },
  {
    key: 'help', label: 'Site Help', icon: 'life-buoy', accent: C.info, group: 'Site Help', sections: [],
  },
] as const;

export function publicNavFor(key: PublicWorkspaceKey): PublicNavWorkspace {
  return PUBLIC_NAV.find((workspace) => workspace.key === key) ?? PUBLIC_NAV[0];
}
