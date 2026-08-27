import { useSyncExternalStore } from 'react';
import { readPublicUser, watchPublicUser } from '../../../web/src/public/PublicRuntime';

// Public replacement for the private terminal's auth context.
//
// `entitlements` and `featureTiers` are read DIRECTLY by shared components
// (ActionTile reads membership.entitlements.studyCreation), so they have to be
// present records rather than something hasEntitlement() covers.
//
// Only the PUBLIC-reachable paid features are listed. The excluded ones are
// deliberately absent rather than set false: naming them here would put the
// private capability vocabulary back into public source, which is what the
// boundary check refuses. A component reading a key that is not here gets
// undefined, draws its lock, and carries on.
const FEATURES=['studyCreation','studyExplain','studyAsk','customBoards','premiumBadges','marketData','presetStreams','alertSettings','tradingNotes','suggestions','supportChat'] as const;
const entitlements=Object.fromEntries(FEATURES.map((f)=>[f,true])) as Record<string,boolean>;
const featureTiers=Object.fromEntries(FEATURES.map((f)=>[f,'free'])) as Record<string,string>;

const base={id:'public-user',username:'public',displayName:'Public account',email:'',displayTimezone:null,isDemo:false,roles:['member'],
  access:{readOnlyWorkspaces:[],membership:{tier:'premium',source:'public',grantedAt:null,expiresAt:null,active:true,entitlements,featureTiers},features:{advancedTrading:true,fundedAccount:false},reviews:[]}};

// Identity is held in PublicRuntime — the one module both the shell and the
// adapters may import across the boundary — and merged onto the fixed access
// record here, so shared components see it through the same useAuth() they
// always used.
let cached:any={...base,...readPublicUser()};
let cachedFrom=readPublicUser();
const snapshot=()=>{const current=readPublicUser();if(current!==cachedFrom){cachedFrom=current;cached={...base,...current,access:base.access}}return cached};

export function useAuth(){
  const current=useSyncExternalStore(watchPublicUser,snapshot,snapshot);
  return {user:current,loading:false,refreshUser:async()=>current,logout:async()=>{}};
}
