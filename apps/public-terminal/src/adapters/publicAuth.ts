// The evidence user. `entitlements` and `featureTiers` are read DIRECTLY by
// shared components (ActionTile reads membership.entitlements.studyCreation), so
// they have to be present records rather than something hasEntitlement() covers.
// Only the PUBLIC-reachable paid features. The excluded ones are deliberately
// absent rather than set false: naming them here would put the private
// capability vocabulary back into public source, which is what the boundary
// check refuses. A component reading a key that is not here gets undefined,
// draws its lock, and carries on.
const FEATURES=['studyCreation','studyExplain','studyAsk','customBoards','premiumBadges','marketData','presetStreams','alertSettings','tradingNotes','suggestions','supportChat'] as const;
const entitlements=Object.fromEntries(FEATURES.map((f)=>[f,true])) as Record<string,boolean>;
const featureTiers=Object.fromEntries(FEATURES.map((f)=>[f,'free'])) as Record<string,string>;
const user:any={id:'public-evidence-user',username:'public-user',displayName:'Andrew',email:'public-user@example.com',displayTimezone:null,isDemo:false,roles:['member'],access:{readOnlyWorkspaces:[],membership:{tier:'premium',source:'public',grantedAt:null,expiresAt:null,active:true,entitlements,featureTiers},features:{advancedTrading:true,fundedAccount:false},reviews:[]}};
export function useAuth(){return {user,loading:false,refreshUser:async()=>user,logout:async()=>{}};}
