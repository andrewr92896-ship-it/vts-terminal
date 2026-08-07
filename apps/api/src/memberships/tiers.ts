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
//
// **One rule is not up for negotiation when adding a feature: anything that
// requires the user's own API key or credential is Max** (owner decision,
// 2026-08). Holding somebody else's key is a responsibility rather than a
// convenience — the worst case is their money or their account, not their
// screen — so the terminal only takes one from the top tier. Today that is
// `brokerConnections` (OANDA, Kraken) and `pushover`; the check when adding a
// feature is simply "does the user paste something of theirs into it".
export const PREMIUM_FEATURES = [
  // Max
  'ai',
  'studyAsk',
  'tradeDesk',
  'teams',
  'teamChat',
  'customStreams',
  'brokerConnections',
  'pushover',
  // Premium
  'funded',
  'studyExplain',
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
  // Every AI surface EXCEPT customer support and the study tutor's one-tap
  // explanation. Support stays free deliberately: a user who cannot reach help is
  // a user who cannot tell you their payment failed, and locking the complaints
  // channel behind the thing being complained about is how a paid product loses
  // an account permanently. AI is at Max because it is the one feature here with
  // a real per-use cost to run.
  ai: 'max',
  // Typing your own question to the study tutor — the back-and-forth, and every
  // follow-up. Open-ended, so it is the half of the tutor with no ceiling on what
  // one learner can spend, which is what puts it at the top tier while the canned
  // breakdown below sits at Premium.
  studyAsk: 'max',
  // Placing an order. The ladder the owner chose is Premium TRACKS and Max
  // EXECUTES: a Premium member connects a broker and reviews their trading,
  // while actually sending an order is the top tier. It also puts the
  // highest-liability surface in the terminal behind the highest tier.
  tradeDesk: 'max',
  // A private group with other people, and the chat that goes with it. These
  // two move together on purpose — a tier that let you build a group but not
  // message it would be a feature that half-works.
  teams: 'max',
  teamChat: 'max',
  // Adding your own YouTube channel to the Market News wall.
  customStreams: 'max',

  // ---- Max because they hold a credential of the USER'S ----
  // See the rule on PREMIUM_FEATURES above. These two are the only places in the
  // terminal where somebody types in a key of their own, and both sit at the top
  // tier for that reason alone rather than for what they cost to run.
  //
  // Connecting a broker, and the live account capital that comes with it
  // (Trade History ▸ Live Brokers). The key can trade; it sits beside the Trade
  // Desk that spends it.
  brokerConnections: 'max',
  // Pushover, which the user connects by pasting their own user key. Lower
  // powered than a broker key — it delivers notifications and cannot read or
  // spend anything — but it is still their credential in this database, which is
  // the line the rule draws. **Web push is deliberately NOT in this map**, so a
  // free account still gets told when its price alert fires; what Max buys is
  // the Pushover channel and its custom sounds, not being notified at all.
  pushover: 'max',

  // ---- Premium ----
  // The prop-firm challenge tracker.
  funded: 'premium',
  // "Break this down" / "More Details" — the one-tap explanation of the question
  // or term already on screen. One canned opener with a bounded cost, and the
  // thing a learner who got an answer wrong actually needs, so it is reachable a
  // tier below the open-ended conversation it starts.
  studyExplain: 'premium',
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
  // The seeded live-stream wall beyond Yahoo Finance — and watching more than
  // one channel at once, which is meaningless on free anyway (a free account has
  // exactly one channel it may play).
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
  studyAsk: 'Study tutor chat',
  tradeDesk: 'Live Trades',
  teams: 'Private groups',
  teamChat: 'Group chat',
  customStreams: 'Your own live streams',
  brokerConnections: 'Broker connections',
  pushover: 'Pushover notifications',
  funded: 'Funded Trades tracking',
  studyExplain: 'Study explanations',
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
  ai: 'Ask VTS AI anywhere in the terminal.',
  studyAsk: 'Ask the study tutor your own questions about a question or term, and keep going.',
  tradeDesk: 'Place, close and amend real orders through your own broker.',
  teams: 'A private group of a few people, with shared study content and chat.',
  teamChat: 'The private conversation with your group.',
  customStreams: 'Add any YouTube channel to the live-stream wall.',
  brokerConnections: 'Connect OANDA and Kraken to stream your positions and balances.',
  pushover: 'Trade and alert notifications through Pushover, with your own sound.',
  funded: 'Track a prop-firm challenge: equity, target, and drawdown left.',
  studyExplain: 'A plain-language breakdown of the study question or term in front of you.',
  studyCreation: 'Build your own study games, flashcard sets and guides.',
  customBoards: 'Save your own Live Wall arrangements instead of the presets.',
  premiumBadges: 'Recognition badges beside your name.',
  strategySessions: 'Session windows with a bias, and open/close notifications.',
  marketData: '75 rates, prints and prices with five change columns each.',
  presetStreams: 'Bloomberg, Reuters and the Fed alongside Yahoo Finance, and up to four playing at once.',
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
