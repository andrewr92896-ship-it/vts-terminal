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
  session(){return publicRequest<{user:{id:string;email:string;displayName:string};passwordChangeRequired:boolean;privateGroupWarning:boolean}>('/auth/session')},
  changePassword(currentPassword:string,newPassword:string){return publicRequest<{ok:true;passwordChangeRequired:false}>('/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})})},
  logout(){return publicRequest<{ok:true}>('/auth/logout',{method:'POST'})},
  earlyAccess(email:string,note:string){
    if(demo)return Promise.resolve({message:'Request received. In the demo nothing is stored — on the live terminal this reaches the early-access list.'});
    return publicRequest<{message:string}>('/early-access',{method:'POST',body:JSON.stringify({email,note:note||undefined})});
  },
};
