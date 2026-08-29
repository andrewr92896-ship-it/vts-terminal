import { useSyncExternalStore } from 'react';
import { isDemo, publicAuth, readPublicUser, setPublicUser, watchPublicUser, type PublicPreferences } from '../../../web/src/public/PublicRuntime';

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
// `isDemo` is DELIBERATELY NOT PASSED THROUGH to the screens.
//
// Shared screens read `user.isDemo` to mean "a write here will be refused", and
// on the PRIVATE terminal that is true — `demoGuard` rejects every non-GET, so
// the flag is what stops a button that could only ever error. The public demo
// is the opposite case: it reaches no service at all, answers every write out
// of module memory, and resets by virtue of that memory going away. A control
// hidden here is not protecting anything; it is a screen the showcase cannot
// demonstrate, which is most of what the demo exists for.
//
// The DEMO labelling does not come from here — the bar in PublicApp and the
// badge in PublicTopBar both read `isDemo()` from PublicRuntime — so a visitor
// is still told plainly that the data is sample data and nothing is saved.
const snapshot=()=>{const current=readPublicUser();if(current!==cachedFrom){cachedFrom=current;cached={...base,...current,isDemo:false,access:base.access}}return cached};

// Signing out was a no-op stub, and nothing in the public terminal called it
// anyway — so an account, once in, could not get out. On a shared or borrowed
// computer that is the whole of the problem: the session cookie lasts twelve
// hours. The route and the client method both existed the entire time; only
// this stub and a control were missing.
async function signOut(){
  // The demo reaches no service by design, so leaving it is dropping the flag —
  // which a load of the bare URL does, since the demo is entered from `?demo=1`
  // or the sign-in card. Everything it held was module state and goes with it.
  if(!isDemo())await publicAuth.logout().catch(()=>{});
  window.location.assign(window.location.pathname);
}

// SAVING A PREFERENCE HAD TO EXIST, because the shared screens already call it.
// `Preferences` reads `updateProfile` straight off useAuth() and the public
// adapter did not provide one — so picking a time zone, opting off the
// leaderboards or customizing My Terminal threw, silently, on the one screen
// whose entire job is changing those settings. A control that appears and does
// nothing is worse than one that is missing.
//
// The identity is updated FIRST and unconditionally, so the screen responds at
// once and the demo — which reaches no service at all — behaves exactly like a
// real account. The write follows for a signed-in visitor; a failed one leaves
// the setting on screen, which is the honest outcome of a save that did not
// land, and the next session read restores what is actually stored.
async function updateProfile(patch:PublicPreferences&{displayName?:string}){
  const next={...readPublicUser(),...patch};
  setPublicUser(next);
  if(!isDemo()){
    const {displayName:_ignored,...preferences}=patch;
    if(Object.keys(preferences).length)await publicAuth.savePreferences(preferences).catch(()=>{});
  }
  return {user:next};
}

export function useAuth(){
  const current=useSyncExternalStore(watchPublicUser,snapshot,snapshot);
  return {user:current,loading:false,refreshUser:async()=>current,logout:signOut,updateProfile};
}
