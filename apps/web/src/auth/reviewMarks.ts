// Review markers — the two small glyphs the terminal draws beside a feature to
// say something about the feature's STATUS rather than its price.
//
// They are deliberately a separate axis from the tier marks (Premium star, Max
// gem) and never replace one: a row can say what it costs AND that it is not
// finished. `components/ReviewMark.tsx` draws them; this file is the only place
// that decides which features carry one.
//
// TWO KINDS, and they have OPPOSITE audiences. Getting that wrong is the one
// expensive mistake available here:
//
//  - `wip` — a dashed speech bubble. Shown to EVERYONE. It means "this part of
//    the terminal is still being built ahead of launch", which is a straight
//    statement of fact a customer is better off knowing.
//
//  - `risk` — an amber exclamation. Shown to FOUNDER-LEVEL ONLY, and that is
//    not negotiable. It is the owner's own note that a feature has compliance
//    questions still waiting on attorney review, and it exists so those
//    features can be found again. A product that publicly labels its own
//    features as legally risky is worse than one that marks nothing: it tells
//    customers to worry, and it writes a record pointing at itself. An ordinary
//    user, a paying member and a plain admin all see nothing.
//
// Nothing here gates, hides, disables or degrades anything. A mark marks; it
// does nothing else. Adding a key to this map can never change what an account
// is allowed to do.
//
// The flagged list is the OWNER'S compliance judgment, not a guess to be
// extended. Do not add or remove `risk` entries without being asked — if
// something looks like it belongs, say so rather than adding it.

export interface ReviewMark {
  /** Everyone sees this. Why the feature is not finished yet. */
  wip?: string;
  /** Founder-level only. Why the feature is flagged for review. */
  risk?: string;
}

export type ReviewKey =
  | 'tradeDesk'
  | 'brokerConnections'
  | 'teams'
  | 'teamChat'
  | 'tradingAlerts'
  | 'strategySessions'
  | 'newsBias'
  | 'ai'
  | 'metricsCoach'
  | 'funded'
  | 'leadTraderBadge'
  | 'legalCredentials'
  | 'finances'
  | 'investments'
  | 'generalNews';

// Everything the terminal marks, in one screen.
export const REVIEW_MARKS: Record<ReviewKey, ReviewMark> = {
  // ---- Order placement and the keys behind it ----
  tradeDesk: {
    risk: 'The platform transmits real orders. Awaiting attorney sign-off, and the Apple 3.2.1(viii) line.',
  },
  brokerConnections: {
    risk: 'Credentials are order-capable rather than read-only. Custody and discretion questions for the advisory firm.',
  },

  // ---- The group features ----
  // Both halves apply: a customer should know the group side is unfinished, and
  // the owner needs to find it again before launch.
  teams: {
    wip: 'Private groups are still being built ahead of launch.',
    risk: 'One customer seeing another live book is functionally a signal feed, whatever it is called.',
  },
  teamChat: {
    wip: 'Private groups are still being built ahead of launch.',
    risk: 'User-generated content about trades — where advice between users would actually occur.',
  },

  // ---- Advice-flavoured surfaces ----
  tradingAlerts: {
    risk: 'An inbound TradingView signal reaching more than the person who created it is distribution.',
  },
  strategySessions: { risk: 'A directional bias label is advice-flavoured.' },
  newsBias: { risk: 'A directional cue on a headline is advice-flavoured.' },
  ai: {
    risk: 'The largest advice surface in the terminal. Guardrails exist; it stays under permanent review.',
  },
  metricsCoach: { risk: 'Coaching on trading performance.' },

  // ---- Contractual rather than regulatory ----
  funded: {
    risk: 'Prop-firm contracts commonly prohibit third-party tools. Contractual risk rather than regulatory.',
  },
  leadTraderBadge: { risk: 'Implies a person whose trades others follow.' },

  // ---- Documents ----
  // No control of its own — it is carried here so the review list is complete.
  legalCredentials: {
    risk: 'Terms and Privacy both describe broker credentials as read-only. That is false: the keys can trade.',
  },

  // ---- Still being built ahead of launch ----
  // `wip` only. Nothing here is a compliance question — these are whole
  // workspaces the owner is still filling in, and a customer meeting a thin
  // screen is better off knowing it is unfinished than concluding it is broken.
  finances: { wip: 'Finances is still being built ahead of launch.' },
  investments: { wip: 'Investments is still being built ahead of launch.' },
  generalNews: { wip: 'World and Politics news is still being built ahead of launch.' },
};

// Which sidebar SECTION carries a mark, by screen key. The same shape as
// `SECTION_FEATURE` in access.ts and read in the same place, so a nav row states
// what it costs and what its status is from one row of markup.
//
// Only sections whose WHOLE point is the flagged thing appear here. Several
// flagged features have no nav row of their own — the AI panel, broker
// connections, the news bias glyph, the badge preset, the legal documents — and
// each is marked at its own control instead.
export const SECTION_REVIEW: Record<string, ReviewKey> = {
  tradedesk: 'tradeDesk',
  my_team: 'teams',
  sessions: 'strategySessions',
  prop: 'funded',

  // Finances and Investments are marked on the WORKSPACE row and on every
  // section inside them (owner instruction, 2026-08). Marking only the
  // workspace would leave a reader who is already inside it with nothing to
  // say the screen in front of them is unfinished — and the workspace row is
  // out of sight the moment its sections are on screen.
  fin_networth: 'finances',
  fin_budget: 'finances',
  inv_overview: 'investments',
  inv_accounts: 'investments',
  inv_holdings: 'investments',
  inv_allocation: 'investments',
  inv_performance: 'investments',
  inv_dividends: 'investments',
  inv_contributions: 'investments',
  inv_projections: 'investments',

  // News is NOT marked as a workspace — Market News is finished and sits in
  // it. Only the two general-news sections carry the bubble.
  news_world: 'generalNews',
  news_politics: 'generalNews',
};

// The same, for a WORKSPACE row. Separate from `SECTION_REVIEW` because the two
// are different rows in different lists, and a workspace being unfinished is a
// statement about everything inside it rather than about one screen.
//
// The tier equivalent (`WORKSPACE_FEATURE`) is deliberately empty — no workspace
// is entirely paid — but a workspace genuinely can be entirely unfinished, which
// is why this one has entries.
export const WORKSPACE_REVIEW: Record<string, ReviewKey> = {
  finances: 'finances',
  investments: 'investments',
};

// The same, for a Live Wall tile kind. The Trading Alerts SCREEN was removed,
// so the alerts tile is the surviving surface where a TradingView signal reaches
// somebody — which makes it where that flag belongs.
export const TILE_REVIEW: Partial<Record<string, ReviewKey>> = {
  teamchat: 'teamChat',
  alerts: 'tradingAlerts',
  // The order ticket on the wall is the same order path as the Live Trades
  // screen, so it carries the same flag. A surface that can place a real trade
  // must not be reachable without the note that says so.
  ticket: 'tradeDesk',
};

// Amber. Deliberately none of the three colours already carrying meaning in the
// terminal — the Premium gold #EBCB74, the Max gem #B9F2FF, or the sky blue
// #5AC8FA the terminal signals market-watching with.
export const RISK_COLOR = '#FF9F45';

// Quiet slate for the in-progress bubble. It sits BESIDE a tier mark, so it is
// deliberately the calmer of the two — the tier is the thing being stated, and
// this is a footnote on it.
export const WIP_COLOR = '#8FA0C9';

export function reviewMark(key: ReviewKey): ReviewMark {
  return REVIEW_MARKS[key];
}

/** Every flagged entry, for the Developer Terminal's review list. */
export function allReviewMarks(): Array<{ key: ReviewKey; mark: ReviewMark }> {
  return (Object.keys(REVIEW_MARKS) as ReviewKey[]).map((key) => ({ key, mark: REVIEW_MARKS[key] }));
}
