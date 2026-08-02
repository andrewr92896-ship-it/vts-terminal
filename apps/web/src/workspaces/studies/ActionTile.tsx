import type { CSSProperties } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { FEATURE_LABELS, TIER_COLORS, TIER_GLYPHS, TIER_LABELS, tierOfFeature } from '../../auth/access';
import type { PremiumFeature } from '../../api/types';
import { Icon } from '../../components/Icon';
import type { Theme } from '../../theme/themes';

// A tile that performs an action, sitting in the same grid as the content tiles
// rather than as a button in the corner (owner decision, 2026-08). "Browse" and
// "Create" are the last two tiles in every study launcher.
//
// When the action needs a membership the tile is still SHOWN, carrying its tier
// badge and a lock — the point is that somebody on a free account can see what
// upgrading would let them do. Hiding it would make the feature invisible and
// the upgrade unmotivated.
export function ActionTile({
  theme,
  icon,
  title,
  subtitle,
  feature,
  onClick,
  onLockedClick,
}: {
  theme: Theme;
  icon: string;
  title: string;
  subtitle: string;
  /** The paid feature this action needs, if any. */
  feature?: PremiumFeature;
  onClick: () => void;
  /** Where to send someone who lacks the tier. Usually My Terminal ▸ Premium Features. */
  onLockedClick?: () => void;
}) {
  const { user } = useAuth();
  const membership = user?.access.membership;
  const tier = feature ? tierOfFeature(feature, membership) : null;
  const locked = !!feature && !membership?.entitlements[feature];
  const tierColor = tier ? TIER_COLORS[tier] : null;
  const tierGlyph = tier ? TIER_GLYPHS[tier] : null;

  return (
    <button
      onClick={locked ? onLockedClick : onClick}
      title={
        locked && tier
          ? `${FEATURE_LABELS[feature!]} needs a ${TIER_LABELS[tier]} membership`
          : undefined
      }
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 6,
        textAlign: 'left',
        width: '100%',
        minHeight: 128,
        padding: '16px 18px',
        borderRadius: 12,
        cursor: 'pointer',
        fontFamily: 'inherit',
        background: 'rgba(255,255,255,.025)',
        // Dashed, so an action tile reads as "add something here" rather than as
        // another piece of content sitting beside the real ones.
        border: `1px dashed ${tierColor ?? theme.navBorder}`,
        color: '#dfe7fa',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%' }}>
        <Icon name={icon} size={17} color={tierColor ?? theme.accent} />
        <span style={{ fontSize: 14.5, fontWeight: 700, color: '#fff', flex: 1, minWidth: 0 }}>
          {title}
        </span>
        {tierGlyph && tierColor && (
          <span style={badgePill(tierColor)}>
            <Icon name={tierGlyph} size={11} color={tierColor} />
            {TIER_LABELS[tier!]}
          </span>
        )}
      </div>
      <span style={{ fontSize: 12.5, color: '#8ea3cc', lineHeight: 1.55 }}>{subtitle}</span>
      {locked && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 'auto', fontSize: 12, color: '#8ea3cc' }}>
          <Icon name="lock" size={12} color="#8ea3cc" />
          {"See memberships"}
        </span>
      )}
    </button>
  );
}

function badgePill(color: string): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    flex: 'none',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.3px',
    color,
    border: `1px solid ${color}55`,
    background: `${color}14`,
    borderRadius: 999,
    padding: '2px 8px',
  };
}

// The same pill on its own, for marking a content tile that is itself paid.
export function TierPill({ feature }: { feature: PremiumFeature }) {
  const { user } = useAuth();
  const tier = tierOfFeature(feature, user?.access.membership);
  const color = tier ? TIER_COLORS[tier] : null;
  const glyph = tier ? TIER_GLYPHS[tier] : null;
  if (!tier || !color || !glyph) return null;
  return (
    <span style={badgePill(color)}>
      <Icon name={glyph} size={11} color={color} />
      {TIER_LABELS[tier]}
    </span>
  );
}
