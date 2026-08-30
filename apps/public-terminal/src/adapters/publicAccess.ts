export const ALL_ROLES=['member'] as const;
export const ROLE_LABELS={member:'Member'} as Record<string,string>;
export const ROLE_DESCRIPTIONS={member:'Public terminal account'} as Record<string,string>;
export const FEATURE_LABELS={marketData:'Market Data',advancedTrading:'Advanced Trading'} as Record<string,string>;
export const FEATURE_BLURBS={marketData:'Public market-data tools',advancedTrading:'Your own trade records'} as Record<string,string>;
export const TIER_LABELS={free:'Free',premium:'Premium',max:'Max'} as Record<string,string>;
// The SAME values as auth/access.ts. These are what the tier marks are drawn
// from, and inventing a second set made Premium a purple gem and Max a gold
// crown — neither of which appears anywhere in the real terminal, where
// Premium is a gold star and Max an icy gem.
export const TIER_COLORS={free:null,premium:'#EBCB74',max:'#B9F2FF'} as Record<string,string|null>;
export const TIER_GLYPHS={free:null,premium:'star',max:'gem'} as Record<string,string|null>;
// No leaderboard exists in the public terminal, so Preferences must not offer
// to hide you from one. See auth/access.ts for what this governs.
export const HAS_LEADERBOARDS=false;
export const SECTION_FEATURE={} as Record<string,string>;export const WORKSPACE_FEATURE={} as Record<string,string>;export const ALL_WORKSPACES=['myportal','trading','finances','news','investments','studies','help'] as const;
export const isFounder=()=>false;export const isAdmin=()=>false;export const canAccessWorkspace=()=>true;export const canAccessFunded=()=>false;
export const isCompanyEmail=()=>false;export const canAccessEmployeePortal=()=>false;export const isWorkspaceReadOnly=()=>false;
export const workspacesForRoles=()=>[...ALL_WORKSPACES];export const canGrantRole=()=>false;export const rolesSummary=()=> 'Member';
export const tierForKey=(key:string)=>key;export const tierOfFeature=()=> 'premium';export function hasEntitlement(){return true;}
export const COMPANY_EMAIL_DOMAIN='';
