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
// Owner decisions (2026-08). The tier on the right is meant to be edited —
// moving a feature is a one-word change here, and every guard, badge, lock icon
// and upgrade prompt follows.
//
// The list is ordered Max first, then Premium, matching how the sidebar stacks
// its sections: free at the top, Premium beneath, Max last.
export const PREMIUM_FEATURES = [
  // Max
  'ai',
  'tradeDesk',
  'teams',
  'teamChat',
  'customStreams',
  // Premium
  'brokerConnections',
  'funded',
  'studyCreation',
  'customBoards',
  'premiumBadges',
  'strategySessions',
  'marketData',
  'presetStreams',
  'suggestions',
  'supportChat',
] as const;
export type PremiumFeature = (typeof PREMIUM_FEATURES)[number];

export const FEATURE_TIER: Record<PremiumFeature, MembershipTier> = {
  // ---- Max ----
  // Every AI surface EXCEPT customer support. Support stays free deliberately: a
  // user who cannot reach help is a user who cannot tell you their payment
  // failed, and locking the complaints channel behind the thing being complained
  // about is how a paid product loses an account permanently. AI is at Max
  // because it is the one feature here with a real per-use cost to run.
  ai: 'max',
  // Placing an order. The ladder the owner chose is Premium TRACKS and Max
  // EXECUTES: a Premium member connects a broker and reviews their trading,
  // while actually sending an order is the top tier. It also puts the
  // highest-liability surface in the terminal behind the highest tier.
  tradeDesk: 'max',
  // Sharing a desk with other people, and the chat that goes with it. These two
  // move together on purpose — a tier that let you build a team but not message
  // it would be a feature that half-works.
  teams: 'max',
  teamChat: 'max',
  // Adding your own YouTube channel to the Market News wall.
  customStreams: 'max',

  // ---- Premium ----
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
  // The cosmetic recognition badges.
  premiumBadges: 'premium',
  // Strategy Sessions and their open / close / pre-open notifications.
  strategySessions: 'premium',
  // The Market Data series board. The economic calendar and the FOMC countdown
  // on that screen stay FREE (owner decision, 2026-08) — a free account needs a
  // real reason to open the terminal daily, and that is what feeds upgrades.
  marketData: 'premium',
  // The seeded Market News live streams beyond Yahoo Finance. Yahoo itself is
  // free, so a free account still has a working wall rather than an empty one.
  presetStreams: 'premium',
  // Sending a suggestion, and the general-support conversation. Reporting a BUG
  // is deliberately absent from this map and free on every account: a bug report
  // is the user doing you a favour, and charging for it means never hearing
  // about the bug.
  suggestions: 'premium',
  supportChat: 'premium',
};

// What the upgrade prompt calls each one. Plain statements of what the feature
// is — not a sales pitch, and not instructions for using it.
export const FEATURE_LABELS: Record<PremiumFeature, string> = {
  ai: 'VTS AI',
  tradeDesk: 'Trade Desk',
  teams: 'Trading teams',
  teamChat: 'Team chat',
  customStreams: 'Your own live streams',
  brokerConnections: 'Broker connections',
  funded: 'Funded Account tracking',
  studyCreation: 'Study creation',
  customBoards: 'Custom Live Wall boards',
  premiumBadges: 'Badges',
  strategySessions: 'Strategy Sessions',
  marketData: 'Market Data board',
  presetStreams: 'Live stream wall',
  suggestions: 'Suggestions',
  supportChat: 'General support',
};

// A one-line description of what each buys, for the tier boxes on the Premium
// Features screen. States what the feature IS — never how to use it.
export const FEATURE_BLURBS: Record<PremiumFeature, string> = {
  ai: 'Ask VTS AI anywhere in the terminal, and the study tutor.',
  tradeDesk: 'Place, close and amend real orders through your own broker.',
  teams: 'Share a desk: one book, one leaderboard, one set of study content.',
  teamChat: 'The private conversation with your desk.',
  customStreams: 'Add any YouTube channel to the live-stream wall.',
  brokerConnections: 'Connect OANDA and Kraken to stream your positions and balances.',
  funded: 'Track a prop-firm challenge: equity, target, and drawdown left.',
  studyCreation: 'Build your own study games, flashcard sets and guides.',
  customBoards: 'Save your own Live Wall arrangements instead of the presets.',
  premiumBadges: 'Recognition badges beside your name.',
  strategySessions: 'Session windows with a bias, and open/close notifications.',
  marketData: '75 rates, prints and prices with five change columns each.',
  presetStreams: 'Bloomberg, Reuters and the Fed alongside Yahoo Finance.',
  suggestions: 'Send ideas straight to the developers.',
  supportChat: 'Talk to a person about anything that is not a bug.',
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
