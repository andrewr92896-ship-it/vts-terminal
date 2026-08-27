export const publicEvidence=import.meta.env.VITE_PUBLIC_EVIDENCE==='1';

export async function publicRequest<T>(path:string,init:RequestInit={}):Promise<T>{
  const response=await fetch(`/public/v1${path}`,{...init,credentials:'include',headers:{'Content-Type':'application/json',...(init.headers??{})}});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(typeof body.message==='string'?body.message:`Public service request failed (${response.status})`)}
  return response.json() as Promise<T>;
}

export const publicAuth={
  login(email:string){return publicRequest<{requiresTwoFactor:boolean;sentTo?:string}>('/auth/login',{method:'POST',body:JSON.stringify({email})})},
  verify(code:string,remember:boolean){return publicRequest<{ok:true}>('/auth/two-factor/verify',{method:'POST',body:JSON.stringify({code,remember})})},
};