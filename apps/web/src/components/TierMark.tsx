import type { MembershipTier } from '../api/types';
import { TIER_COLORS, TIER_GLYPHS, TIER_LABELS } from '../auth/access';
import { Icon } from './Icon';

// The star / diamond that says what something costs — the same mark the sidebar
// draws at the right of a paid row, so a Premium star means one thing everywhere
// it appears.
//
// Drawn for EVERYONE, including a member who already holds the tier: the mark's
// job is to say what a thing costs, not to act as a lock. That is the same rule
// the sidebar rows and the Studies tiles follow.
//
// Free resolves to no mark at all (TIER_GLYPHS.free is null), so an included
// feature is marked with nothing rather than decorated with a "free" badge.
export function TierMark({
  tier,
  size = 13,
  dim,
}: {
  tier: MembershipTier | null | undefined;
  size?: number;
  /** Muted, for a row the reader cannot reach yet — the mark still shows. */
  dim?: boolean;
}) {
  const glyph = tier ? TIER_GLYPHS[tier] : null;
  const color = tier ? TIER_COLORS[tier] : null;
  if (!tier || !glyph || !color) return null;
  return (
    <span
      title={`${TIER_LABELS[tier]} membership`}
      aria-label={`${TIER_LABELS[tier]} membership`}
      style={{ display: 'inline-flex', flex: 'none', opacity: dim ? 0.6 : 1 }}
    >
      <Icon name={glyph} size={size} color={color} />
    </span>
  );
}
