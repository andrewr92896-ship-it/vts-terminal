const params=new URLSearchParams(typeof location==='undefined'?'':location.search);

// Demo mode is a RUNTIME state, not a build flag: a visitor turns it on by
// pressing "Explore the demo", so one deployed bundle serves both the demo and
// real accounts. Nothing about it is written to storage — the demo's data lives
// in module memory, so leaving or reloading the page IS the reset.
let demo=params.get('demo')==='1'||params.get('evidence')==='1';
export const isDemo=()=>demo;
export function startDemo(){demo=true}

export async function publicRequest<T>(path:string,init:RequestInit={}):Promise<T>{
  if(demo)throw new Error('The demo does not reach the public service.');
  const response=await fetch(`/public/v1${path}`,{...init,credentials:'include',headers:{'Content-Type':'application/json','X-VTS-Public-CSRF':'1',...(init.headers??{})}});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(typeof body.message==='string'?body.message:`Public service request failed (${response.status})`)}
  return response.json() as Promise<T>;
}

export type PublicAuthResult={requiresTwoFactor:boolean;challengeId?:string;sentTo?:string;passwordChangeRequired?:boolean;privateGroupWarning?:boolean};
export const publicAuth={
  login(email:string,password:string){return publicRequest<PublicAuthResult>('/auth/login',{method:'POST',body:JSON.stringify({email,password})})},
  verify(challengeId:string,code:string,remember:boolean){return publicRequest<PublicAuthResult&{ok:true}>('/auth/two-factor/verify',{method:'POST',body:JSON.stringify({challengeId,code,remember})})},
  recover(email:string){return publicRequest<{message:string}>('/auth/recovery',{method:'POST',body:JSON.stringify({email})})},
  session(){return publicRequest<{user:{id:string;email:string;displayName:string};preferences?:PublicPreferences;passwordChangeRequired:boolean;privateGroupWarning:boolean;legalAcceptanceRequired:boolean}>('/auth/session')},
  // The clickwrap. Neither call sends anything: what is written to the record is
  // the server's own version and hash, because a client-supplied one would be a
  // record of whatever the client felt like claiming.
  legalDocuments(){return publicRequest<{documents:Array<{id:string;title:string;version:string;effectiveDate:string}>;outstanding:string[];acknowledgement:{title:string;confirm:string;statements:string[]}}>('/legal/documents')},
  acceptLegal(){return publicRequest<{ok:true;legalAcceptanceRequired:false}>('/legal/accept',{method:'POST'})},
  // A PATCH, and the server merges: this bundle is cached, so an older one saves
  // the subset of settings it knows about and must never blank the rest.
  savePreferences(patch:PublicPreferences){return publicRequest<{preferences:PublicPreferences}>('/preferences',{method:'PATCH',body:JSON.stringify(patch)})},
  changePassword(currentPassword:string,newPassword:string){return publicRequest<{ok:true;passwordChangeRequired:false}>('/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})})},
  logout(){return publicRequest<{ok:true}>('/auth/logout',{method:'POST'})},
  // Deletion is two calls because it is two acts: asking, which needs the
  // session, and confirming, which needs the emailed link and nothing else —
  // the link is opened wherever the person reads their mail.
  requestDeletion(){return publicRequest<{message:string}>('/account/deletion',{method:'POST'})},
  confirmDeletion(token:string){return publicRequest<{message:string}>('/account/deletion/confirm',{method:'POST',body:JSON.stringify({token})})},
  earlyAccess(email:string,note:string){
    if(demo)return Promise.resolve({message:'Request received. In the demo nothing is stored — on the live terminal this reaches the early-access list.'});
    return publicRequest<{message:string}>('/early-access',{method:'POST',body:JSON.stringify({email,note:note||undefined})});
  },
};

// The account's own display settings, as the public API stores them. Kept loose
// on purpose — the server treats this as an opaque blob and the CLIENT resolves
// every value at render, exactly as the private terminal resolves its home
// screen, because what an account can reach moves after a setting is written.
export type PublicPreferences={displayTimezone?:string;hideFromLeaderboards?:boolean;homeWorkspace?:string|null;homeScreen?:string|null;myTerminalSections?:string|null;wallLayout?:string|null};
// WHO IS SIGNED IN IS A RUNTIME FACT, not a constant. The top bar carried the
// literal "Andrew" — the owner's name — which every public visitor and every
// demo visitor saw. The shell sets this once the session or the demo resolves;
// the auth adapter reads it, so shared components see it through the same
// useAuth() they always used. The preferences above ride on it for the same
// reason: one identity object, one place the screens read it from.
export type PublicIdentity={id:string;username:string;displayName:string;email?:string;isDemo?:boolean;displayTimezone?:string;hideFromLeaderboards?:boolean;homeWorkspace?:string|null;homeScreen?:string|null;myTerminalSections?:string|null;wallLayout?:string|null};
let identity:PublicIdentity={id:'public-user',username:'public',displayName:'Public account'};
const identityListeners=new Set<()=>void>();
export function setPublicUser(next:PublicIdentity){identity=next;for(const listener of identityListeners)listener()}

// WHICH DEVICE THE DEMO WAS OPENED ON, as answered by the visitor rather than
// sniffed from the viewport. It decides two things at the door: which of the two
// default Live Wall layouts is loaded, and whether the sidebar starts open.
//
// Module state, deliberately — same as everything else the demo holds. Leaving
// the page is the reset, so a returning visitor is asked again rather than being
// held to an answer they gave on a different device. There is nothing here worth
// a cookie, and the demo's whole contract is that it stores nothing.
//
// A REAL ACCOUNT IS NEVER ASKED. It has a saved board and a saved sidebar state
// of its own, and a question at sign-in that overwrites them would be worse than
// unhelpful.
export type DemoDevice='desktop'|'mobile';
let demoDevice:DemoDevice|null=null;
export const readDemoDevice=()=>demoDevice;
export function setDemoDevice(next:DemoDevice){demoDevice=next}
export function readPublicUser(){return identity}
export function watchPublicUser(listener:()=>void){identityListeners.add(listener);return()=>{identityListeners.delete(listener)}}
