import type { Challenge, PublicAccount, PublicStore, RateLimitResult, Session, TrustedDevice } from './types.js';

export class MemoryPublicStore implements PublicStore {
  accounts=new Map<string,PublicAccount>(); challenges=new Map<string,Challenge>(); sessions=new Map<string,Session>(); trusted=new Map<string,TrustedDevice>();
  rates=new Map<string,{count:number;reset:number}>(); layouts=new Map<string,unknown>(); audits:Array<{event:string;accountId?:string;metadata:Record<string,unknown>}>=[];
  constructor(private now=()=>Date.now()){}
  addAccount(account:PublicAccount){this.accounts.set(account.id,account)}
  async findAccountByEmail(email:string){return [...this.accounts.values()].find((a)=>a.email===email)}
  async findAccountById(id:string){return this.accounts.get(id)}
  async updatePassword(id:string,passwordHash:string,force:boolean,temporaryPasswordExpiresAt?:number){const a=this.accounts.get(id);if(a)this.accounts.set(id,{...a,passwordHash,forcePasswordChange:force,temporaryPasswordExpiresAt})}
  async createChallenge(h:string,v:Challenge){this.challenges.set(h,{...v})} async getChallenge(h:string){const v=this.challenges.get(h);return v&&{...v}} async updateChallenge(h:string,v:Challenge){this.challenges.set(h,{...v})}
  async createSession(h:string,v:Session){this.sessions.set(h,{...v})} async getSession(h:string){const v=this.sessions.get(h);return v&&{...v}} async revokeSession(h:string){const v=this.sessions.get(h);if(v)this.sessions.set(h,{...v,revokedAt:this.now()})} async revokeAllSessions(id:string){for(const [h,v] of this.sessions)if(v.accountId===id)this.sessions.set(h,{...v,revokedAt:this.now()})}
  async createTrustedDevice(h:string,v:TrustedDevice){this.trusted.set(h,{...v})} async getTrustedDevice(h:string){const v=this.trusted.get(h);return v&&{...v}} async revokeTrustedDevice(h:string){const v=this.trusted.get(h);if(v)this.trusted.set(h,{...v,revokedAt:this.now()})} async revokeAllTrustedDevices(id:string){for(const [h,v] of this.trusted)if(v.accountId===id)this.trusted.set(h,{...v,revokedAt:this.now()})}
  async consumeRateLimit(bucket:string,key:string,limit:number,windowMs:number):Promise<RateLimitResult>{const id=`${bucket}:${key}`,now=this.now();let v=this.rates.get(id);if(!v||v.reset<=now)v={count:0,reset:now+windowMs};v.count++;this.rates.set(id,v);return {allowed:v.count<=limit,retryAfterSeconds:Math.ceil((v.reset-now)/1000)}}
  async getLayout(id:string){return this.layouts.get(id)} async saveLayout(id:string,v:unknown){this.layouts.set(id,v)}
  earlyAccess=new Map<string,{email:string;note:string|null}>();
  async recordEarlyAccessRequest(email:string,note:string|null){this.earlyAccess.set(email.toLowerCase(),{email,note})}
  async audit(event:string,accountId:string|undefined,metadata:Record<string,unknown>){this.audits.push({event,accountId,metadata})}
}
