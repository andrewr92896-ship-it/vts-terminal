import { inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { badgeTypes, users } from '../db/schema.js';
import { parseBadges } from '../auth/rbac.js';

// "Position designations" are the two leadership badges — Chief Strategist and
// Chief Analyst — that colour a trader's open positions across the desk. Holding
// one badges that trader's Live Wall cards, Trade Log / History rows, and the
// "trade opened/closed" notifications in the badge's colour, so the desk can see
// at a glance whose call a position is. Any other badge (star, shield, …) is
// recognition-only and never colours a position.
//
// These are seeded as builtin badges (see seedBadges), so their keys are stable
// and their colour/icon stay admin-editable from Admin ▸ Badges — this module
// reads whatever the registry currently holds, so an edit flows straight through.
export const DESIGNATION_BADGE_KEYS = ['chief-strategist', 'chief-analyst'] as const;
export type DesignationKey = (typeof DESIGNATION_BADGE_KEYS)[number];

// Sort rank for a designation key: lower sorts first. Chief Strategist (0) leads,
// then Chief Analyst (1), then everything undesignated (2) — so the Live Wall can
// always float the strategist's positions to the top.
export function designationRank(key: string | null | undefined): number {
  const i = key ? DESIGNATION_BADGE_KEYS.indexOf(key as DesignationKey) : -1;
  return i === -1 ? DESIGNATION_BADGE_KEYS.length : i;
}

// A colored circle stand-in for each designation, used in push/Pushover
// notifications where an SVG icon and a hex colour can't render — the emoji
// carries the "colour designation" into the notification text instead.
const DESIGNATION_EMOJI: Record<string, string> = {
  'chief-strategist': '🟢',
  'chief-analyst': '🔴',
};

// The designation attached to a trade/position: the badge key, its label, and
// its current colour/icon from the registry (plus an emoji for text surfaces).
export interface TradeDesignation {
  key: string;
  label: string;
  color: string;
  icon: string;
  emoji: string;
}

// Resolve each of `userIds` to the position-colouring designation they hold, if
// any. A trader holding both badges takes the higher-priority one (the earlier
// entry in DESIGNATION_BADGE_KEYS — Chief Strategist wins). Users with no
// designation badge are simply absent from the map.
export async function designationsFor(
  userIds: Iterable<string>,
): Promise<Map<string, TradeDesignation>> {
  const ids = [...new Set(userIds)];
  const out = new Map<string, TradeDesignation>();
  if (ids.length === 0) return out;

  // Current colour/icon/label for the two designation badges, in priority order.
  const rows = await db.select().from(badgeTypes).where(inArray(badgeTypes.key, [...DESIGNATION_BADGE_KEYS]));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const ordered = DESIGNATION_BADGE_KEYS.map((k) => byKey.get(k)).filter((b): b is NonNullable<typeof b> => !!b);
  if (ordered.length === 0) return out;

  const holders = await db
    .select({ id: users.id, badges: users.badges })
    .from(users)
    .where(inArray(users.id, ids));
  for (const u of holders) {
    const held = new Set(parseBadges({ badges: u.badges }));
    const badge = ordered.find((b) => held.has(b.key));
    if (badge) {
      out.set(u.id, {
        key: badge.key,
        label: badge.label,
        color: badge.color,
        icon: badge.icon,
        emoji: DESIGNATION_EMOJI[badge.key] ?? '',
      });
    }
  }
  return out;
}
