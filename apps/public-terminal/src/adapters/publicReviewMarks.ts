// Public replacement for the private terminal's `auth/reviewMarks` module.
//
// The portal's `risk` notes are the OWNER'S own compliance judgments — that a
// surface transmits real orders, that broker credentials can trade, that the
// legal documents describe them wrongly. On the portal they are gated at render
// on `isFounder`, which is enough there. It is NOT enough in a bundle served to
// the general public: the gate decides what is drawn, not what ships, and every
// one of those sentences is readable in the JavaScript by anybody who opens it.
// A product that publishes its own note saying its documents are false is worse
// than one that marks nothing.
//
// So this file carries NO `risk` entry at all — not hidden, absent — and keeps
// only the `wip` bubbles, which are a straight statement of fact a public
// customer is better off knowing.
export interface ReviewMark{wip?:string;risk?:string}
export type ReviewKey='finances'|'investments'|'generalNews';

export const REVIEW_MARKS:Record<ReviewKey,ReviewMark>={
 finances:{wip:'Finances is still being built ahead of launch.'},
 investments:{wip:'Investments is still being built ahead of launch.'},
 generalNews:{wip:'World and Politics news is still being built ahead of launch.'},
};

// Marked on the workspace row AND on every section inside it, for the reason the
// portal states: the workspace row is out of sight once its sections are open.
export const SECTION_REVIEW:Record<string,ReviewKey>={
 fin_networth:'finances',fin_budget:'finances',
 inv_overview:'investments',inv_accounts:'investments',inv_holdings:'investments',inv_allocation:'investments',
 inv_performance:'investments',inv_dividends:'investments',inv_contributions:'investments',inv_projections:'investments',
 news_world:'generalNews',news_politics:'generalNews',
};
export const WORKSPACE_REVIEW:Record<string,ReviewKey>={finances:'finances',investments:'investments'};
// Every tile kind the portal flags is a private capability the public terminal
// does not carry, so there is nothing left to mark.
export const TILE_REVIEW:Partial<Record<string,ReviewKey>>={};

export const RISK_COLOR='#FF9F45';
export const WIP_COLOR='#8FA0C9';
export function reviewMark(key:ReviewKey):ReviewMark{return REVIEW_MARKS[key]??{}}
export function allReviewMarks():Array<{key:ReviewKey;mark:ReviewMark}>{return (Object.keys(REVIEW_MARKS) as ReviewKey[]).map((key)=>({key,mark:REVIEW_MARKS[key]}))}
