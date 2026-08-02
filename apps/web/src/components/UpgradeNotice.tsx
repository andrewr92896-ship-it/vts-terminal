import type { CSSProperties } from 'react';
import { useAuth } from '../auth/AuthContext';
import { FEATURE_LABELS, TIER_LABELS } from '../auth/access';
import type { PremiumFeature } from '../api/types';
import { C } from '../theme/tokens';
import { Icon } from './Icon';

// The one upgrade prompt, used everywhere a paid feature is reached without the
// tier for it.
//
// Deliberately plain: it names the feature, names the tier that carries it, and
// offers the one place to go. It does not explain how the feature works, list
// what else the tier includes, or sell — the person already tried to use the
// thing, so they know what it is, and a wall of copy at the moment of refusal
// reads as an obstacle rather than an offer.
export function UpgradeNotice({
  feature,
  onOpenMembership,
  compact,
}: {
  feature: PremiumFeature;
  /** Sends the reader to My Terminal ▸ Premium Features. Omitted where the screen cannot navigate. */
  onOpenMembership?: () => void;
  compact?: boolean;
}) {
  const { user } = useAuth();
  // Which tier carries it, from the server's own answer rather than a guess
  // here: entitlements are computed server-side, so this stays right when a
  // feature is moved between tiers.
  const tier = user?.access.membership.tier ?? 'free';

  return (
    <div style={compact ? boxCompact : box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
        <Icon name="lock" size={15} color={C.gold} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>
          {FEATURE_LABELS[feature]} is a paid feature
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
        Your membership is {TIER_LABELS[tier]}.
      </div>
      {onOpenMembership && (
        <button onClick={onOpenMembership} style={btn}>
          {"See memberships"}
        </button>
      )}
    </div>
  );
}

const box: CSSProperties = {
  background: 'rgba(235,203,116,.06)',
  border: `1px solid ${C.gold}44`,
  borderRadius: 10,
  padding: '14px 16px',
};

const boxCompact: CSSProperties = { ...box, padding: '11px 13px', borderRadius: 8 };

const btn: CSSProperties = {
  marginTop: 12,
  border: 'none',
  background: `linear-gradient(180deg,${C.gold},#C9A24B)`,
  color: '#0c2768',
  fontWeight: 700,
  fontSize: 12.5,
  padding: '9px 15px',
  borderRadius: 8,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
