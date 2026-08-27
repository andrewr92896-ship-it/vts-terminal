const publicBuildEnv=(import.meta as unknown as {env:Record<string,string|undefined>}).env;
const params=new URLSearchParams(typeof location==='undefined'?'':location.search);

/**
 * The deterministic build CI screenshots. It is demo mode with a fixed seed —
 * NOT a second data path, so the evidence artifact is a picture of the demo a
 * visitor actually gets rather than of something only CI ever sees.
 */
export const publicEvidence=publicBuildEnv.VITE_PUBLIC_EVIDENCE==='1';

// Demo mode is a RUNTIME state, not a build flag: a visitor turns it on by
// pressing "Explore the demo", so one deployed bundle serves both the demo and
// real accounts. Nothing about it is written to storage — the demo's data lives
// in module memory, so leaving or reloading the page IS the reset.
let demo=publicEvidence||params.get('demo')==='1'||params.get('evidence')==='1';
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
  session(){return publicRequest<{user:{id:string;email:string;displayName:string};passwordChangeRequired:boolean;privateGroupWarning:boolean}>('/auth/session')},
  changePassword(currentPassword:string,newPassword:string){return publicRequest<{ok:true;passwordChangeRequired:false}>('/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})})},
  logout(){return publicRequest<{ok:true}>('/auth/logout',{method:'POST'})},
};
