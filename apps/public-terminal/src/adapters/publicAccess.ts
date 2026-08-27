export const ALL_ROLES=['member'] as const;
export const ROLE_LABELS={member:'Member'} as Record<string,string>;
export const ROLE_DESCRIPTIONS={member:'Public terminal account'} as Record<string,string>;
export const FEATURE_LABELS={marketData:'Market Data',advancedTrading:'Trade Tracking'} as Record<string,string>;
export const FEATURE_BLURBS={marketData:'Public market-data tools',advancedTrading:'Manual trade tracking only'} as Record<string,string>;
export const TIER_LABELS={free:'Free',premium:'Premium',max:'Max'} as Record<string,string>;
export const TIER_COLORS={free:'#9fb0d6',premium:'#b69cff',max:'#EBCB74'} as Record<string,string>;
export const TIER_GLYPHS={free:'circle',premium:'gem',max:'crown'} as Record<string,string>;
export const SECTION_FEATURE={} as Record<string,string>;export const WORKSPACE_FEATURE={} as Record<string,string>;export const ALL_WORKSPACES=['myportal','trading','finances','news','investments','studies','help'] as const;
export const isFounder=()=>false;export const isAdmin=()=>false;export const canAccessWorkspace=()=>true;export const canAccessFunded=()=>false;
export const isCompanyEmail=()=>false;export const canAccessEmployeePortal=()=>false;export const isWorkspaceReadOnly=()=>false;
export const workspacesForRoles=()=>[...ALL_WORKSPACES];export const canGrantRole=()=>false;export const rolesSummary=()=> 'Member';
export const tierForKey=(key:string)=>key;export const tierOfFeature=()=> 'premium';export function hasEntitlement(){return true;}
export const COMPANY_EMAIL_DOMAIN='';
