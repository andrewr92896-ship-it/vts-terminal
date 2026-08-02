import { MEMBERSHIP_TIERS, type MembershipTier } from '../db/schema.js';

// The paid tiers, and what each one buys — pure data and pure functions, with no
// database and no role model behind it.
//
// It is a separate module from service.ts for a concrete reason: service.ts asks
// rbac.ts who is an admin, and rbac.ts needs the membership TYPE to put on the
// public user. Keeping the definitions here means neither has to import the
// other, so there is no cycle to unpick later.

export { MEMBERSHIP_TIERS };
export type { MembershipTier };

// Ranked, low to high. Every comparison goes through tierRank, so adding a tier
// later (a Lifetime above Max, say) does not mean hunting down inequalities.
const TIER_RANK: Record<MembershipTier, number> = { free: 0, premium: 1, max: 2 };

export function tierRank(tier: MembershipTier): number {
  return TIER_RANK[tier] ?? 0;
}

export const TIER_LABELS: Record<MembershipTier, string> = {
  free: 'Free',
  premium: 'Premium',
  max: 'Max',
};

// ---- What each feature costs ----
//
// The whole paywall, in one object. Everything absent from this map is included
// with every account — Markets, Investments, reviewing your own trades, Site
// Help — and that is deliberate: a free account has to be worth signing into or
// nobody ever upgrades.
//
// Owner decision (2026-08): the eight below are the launch paywall. The tier on
// the right is meant to be edited — moving Strategy Sessions to 'max' is a
// one-word change here, and every guard, lock icon and upgrade prompt follows.
export const PREMIUM_FEATURES = [
  'ai',
  'brokerConnections',
  'funded',
  'studyCreation',
  'customBoards',
  'teams',
  'premiumBadges',
  'strategySessions',
] as const;
export type PremiumFeature = (typeof PREMIUM_FEATURES)[number];

export const FEATURE_TIER: Record<PremiumFeature, MembershipTier> = {
  // Every AI surface EXCEPT customer support. Support stays free deliberately: a
  // user who cannot reach help is a user who cannot tell you their payment
  // failed, and locking the complaints channel behind the thing being complained
  // about is how a paid product loses an account permanently.
  ai: 'premium',
  // Connecting a broker, or any other API, with the user's own credentials.
  brokerConnections: 'premium',
  // The prop-firm challenge tracker.
  funded: 'premium',
  // Building your own study games, flashcard sets and guides. Playing the
  // built-in ones stays free.
  studyCreation: 'premium',
  // Saving your own Live Wall arrangement. A free account gets the preset
  // boards, which is a working screen rather than a teaser.
  customBoards: 'premium',
  // Trading teams — sharing a desk with other people.
  teams: 'premium',
  // The cosmetic recognition badges.
  premiumBadges: 'premium',
  // Strategy Sessions and their open / close / pre-open notifications.
  strategySessions: 'premium',
};

// What the upgrade prompt calls each one. Plain statements of what the feature
// is — not a sales pitch, and not instructions for using it.
export const FEATURE_LABELS: Record<PremiumFeature, string> = {
  ai: 'VTS AI',
  brokerConnections: 'Broker connections',
  funded: 'Funded Account tracking',
  studyCreation: 'Study creation',
  customBoards: 'Custom Live Wall boards',
  teams: 'Trading teams',
  premiumBadges: 'Badges',
  strategySessions: 'Strategy Sessions',
};

export interface Membership {
  tier: MembershipTier;
  /** Null = never expires. */
  expiresAt: number | null;
  /**
   * Why this account holds the tier. 'role' means it comes from being an admin
   * or a developer, with no stored grant involved at all.
   */
  source: 'role' | 'demo' | 'manual' | 'grandfather' | 'billing' | 'none';
  note: string | null;
  grantedByName: string | null;
  grantedAt: number | null;
}

export interface MembershipView extends Membership {
  entitlements: Record<PremiumFeature, boolean>;
  /**
   * Which tier each paid feature needs. Sent alongside the entitlements because
   * the two answer different questions: entitlements say what THIS account can
   * reach, while this says what the feature COSTS — which is what the sidebar
   * needs to colour a section by its tier for everyone, including a Max member
   * who is not locked out of anything.
   *
   * Sent rather than mirrored client-side so moving a feature between tiers in
   * FEATURE_TIER above recolours the sidebar with no second list to update.
   */
  featureTiers: Record<PremiumFeature, MembershipTier>;
}

export const FREE_MEMBERSHIP: Membership = {
  tier: 'free',
  expiresAt: null,
  source: 'none',
  note: null,
  grantedByName: null,
  grantedAt: null,
};

// Whether a tier reaches a given paid feature.
export function tierAllows(tier: MembershipTier, feature: PremiumFeature): boolean {
  return tierRank(tier) >= tierRank(FEATURE_TIER[feature]);
}

export function entitlementsFor(tier: MembershipTier): Record<PremiumFeature, boolean> {
  const out = {} as Record<PremiumFeature, boolean>;
  for (const f of PREMIUM_FEATURES) out[f] = tierAllows(tier, f);
  return out;
}

export function viewOf(membership: Membership): MembershipView {
  return {
    ...membership,
    entitlements: entitlementsFor(membership.tier),
    featureTiers: FEATURE_TIER,
  };
}

// The default put on a public user when no membership was resolved. Free rather
// than Max on purpose: a bug that loses the membership lookup should lock things
// visibly, not hand out the paid product silently.
export const FREE_MEMBERSHIP_VIEW: MembershipView = viewOf(FREE_MEMBERSHIP);
