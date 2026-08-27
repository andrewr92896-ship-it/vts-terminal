import type { PublicAccount, PublicMailer, PublicStore } from './types.js';
import { hashPassword, keyedHash, maskEmail, randomCode, randomTemporaryPassword, randomToken, sha256, signToken, validateNewPassword, verifyPassword, verifySignedToken } from './security.js';

const TEN_MINUTES = 10 * 60_000;
const THIRTY_DAYS = 30 * 24 * 60 * 60_000;
const SESSION_LIFETIME = 12 * 60 * 60_000;
const DUMMY_HASH = 'scrypt$AAAAAAAAAAAAAAAAAAAAAA$5gvM3xrTTFvQDeiqs8XEB5P5uJ5fwxNf2pNxcrZqaD54YCYeJkzVKI06vdqdI6OcTnxv1LX6xlvQEzkKyQl9fA';

export class AuthError extends Error { constructor(public status:number, message:string) { super(message); } }
export type LoginResult = { requiresTwoFactor:boolean; challengeId?:string; sentTo?:string; sessionToken?:string; trustedDeviceToken?:string; passwordChangeRequired?:boolean; privateGroupWarning?:boolean };

export class PublicAuthService {
  constructor(private store:PublicStore, private mailer:PublicMailer, private keys:{session:string;challenge:string;trusted:string}, private now=()=>Date.now()) {}

  private async rate(bucket:string,key:string,limit:number,windowMs:number) {
    const result = await this.store.consumeRateLimit(bucket, keyedHash(this.keys.challenge,key), limit, windowMs);
    if (!result.allowed) throw new AuthError(429, 'Unable to continue right now. Please try again later.');
  }

  private async issueSession(account:PublicAccount) {
    const id=randomToken();
    await this.store.createSession(sha256(id),{accountId:account.id,expiresAt:this.now()+SESSION_LIFETIME,forcePasswordChange:account.forcePasswordChange});
    return signToken(id,this.keys.session);
  }

  private async accountForSession(token:string|undefined) {
    const id=verifySignedToken(token,this.keys.session);
    if(!id) throw new AuthError(401,'Authentication required.');
    const session=await this.store.getSession(sha256(id));
    if(!session||session.revokedAt||session.expiresAt<=this.now()) throw new AuthError(401,'Authentication required.');
    const account=await this.store.findAccountById(session.accountId);
    if(!account||account.disabled) throw new AuthError(401,'Authentication required.');
    return {id,session,account};
  }

  async login(emailInput:string,password:string,trustedToken:string|undefined,ip:string):Promise<LoginResult> {
    const email=emailInput.trim().toLowerCase();
    await this.rate('login-ip',ip,20,15*60_000);
    await this.rate('login-account',email,8,15*60_000);
    const account=await this.store.findAccountByEmail(email);
    const valid=await verifyPassword(password,account?.passwordHash||DUMMY_HASH);
    if(!account||account.disabled||!valid||(account.forcePasswordChange&&(!account.temporaryPasswordExpiresAt||account.temporaryPasswordExpiresAt<=this.now()))){await this.store.audit('public.auth.login_failed',undefined,{});throw new AuthError(401,'Email or password is incorrect.');}

    const trustedId=verifySignedToken(trustedToken,this.keys.trusted);
    if(trustedId&&!account.forcePasswordChange){
      const trusted=await this.store.getTrustedDevice(sha256(trustedId));
      if(trusted&&trusted.accountId===account.id&&!trusted.revokedAt&&trusted.expiresAt>this.now()){
        await this.store.revokeTrustedDevice(sha256(trustedId));
        const rotatedId=randomToken();
        await this.store.createTrustedDevice(sha256(rotatedId),{accountId:account.id,expiresAt:this.now()+THIRTY_DAYS});
        await this.store.audit('public.auth.trusted_device_used',account.id,{});
        return {requiresTwoFactor:false,sessionToken:await this.issueSession(account),trustedDeviceToken:signToken(rotatedId,this.keys.trusted),passwordChangeRequired:false,privateGroupWarning:account.privateGroupWarning};
      }
    }

    const challengeId=randomToken(); const code=randomCode();
    await this.store.createChallenge(keyedHash(this.keys.challenge,challengeId),{accountId:account.id,codeHash:keyedHash(this.keys.challenge,`${challengeId}:${code}`),expiresAt:this.now()+TEN_MINUTES,attempts:0});
    await this.mailer.sendVerification(account.email,code);
    await this.store.audit('public.auth.challenge_created',account.id,{});
    return {requiresTwoFactor:true,challengeId,sentTo:maskEmail(account.email),privateGroupWarning:account.privateGroupWarning};
  }

  async verify(challengeId:string,code:string,remember:boolean,ip:string):Promise<LoginResult> {
    await this.rate('verify-ip',ip,30,15*60_000);
    if(!/^\d{6}$/.test(code)) throw new AuthError(400,'The verification code is invalid or expired.');
    const challengeHash=keyedHash(this.keys.challenge,challengeId);
    const challenge=await this.store.getChallenge(challengeHash);
    if(!challenge||challenge.consumedAt||challenge.expiresAt<=this.now()||challenge.attempts>=5) throw new AuthError(400,'The verification code is invalid or expired.');
    challenge.attempts+=1;
    if(challenge.codeHash!==keyedHash(this.keys.challenge,`${challengeId}:${code}`)){await this.store.updateChallenge(challengeHash,challenge);throw new AuthError(400,'The verification code is invalid or expired.');}
    challenge.consumedAt=this.now(); await this.store.updateChallenge(challengeHash,challenge);
    const account=await this.store.findAccountById(challenge.accountId);
    if(!account||account.disabled) throw new AuthError(400,'The verification code is invalid or expired.');
    let trustedDeviceToken:string|undefined;
    if(remember&&!account.forcePasswordChange){const id=randomToken();await this.store.createTrustedDevice(sha256(id),{accountId:account.id,expiresAt:this.now()+THIRTY_DAYS});trustedDeviceToken=signToken(id,this.keys.trusted);}
    await this.store.audit('public.auth.challenge_verified',account.id,{remembered:Boolean(trustedDeviceToken)});
    return {requiresTwoFactor:false,sessionToken:await this.issueSession(account),trustedDeviceToken,passwordChangeRequired:account.forcePasswordChange,privateGroupWarning:account.privateGroupWarning};
  }

  async recover(emailInput:string,ip:string) {
    const email=emailInput.trim().toLowerCase();
    const generic={message:'If a public account matches that email, recovery instructions will be sent shortly.'};
    try { await this.rate('recovery-ip',ip,6,60*60_000); await this.rate('recovery-account',email,3,60*60_000); } catch { return generic; }
    const account=await this.store.findAccountByEmail(email);
    if(account&&!account.disabled){
      const temporaryPassword=randomTemporaryPassword();
      await this.store.updatePassword(account.id,await hashPassword(temporaryPassword),true,this.now()+15*60_000);
      await this.store.revokeAllSessions(account.id); await this.store.revokeAllTrustedDevices(account.id);
      await this.mailer.sendTemporaryPassword(account.email,temporaryPassword);
      await this.store.audit('public.auth.recovery_issued',account.id,{});
    } else await this.store.audit('public.auth.recovery_requested',undefined,{});
    return generic;
  }

  async session(token:string|undefined) {
    const {account}=await this.accountForSession(token);
    return {user:{id:account.id,email:account.email,displayName:account.displayName},passwordChangeRequired:account.forcePasswordChange,privateGroupWarning:account.privateGroupWarning};
  }

  async changePassword(token:string|undefined,currentPassword:string,newPassword:string) {
    const {id,account}=await this.accountForSession(token);
    if(!validateNewPassword(newPassword)) throw new AuthError(400,'Use at least 12 characters with upper, lower, and numeric characters.');
    if(!await verifyPassword(currentPassword,account.passwordHash)) throw new AuthError(400,'Current password is incorrect.');
    await this.store.updatePassword(account.id,await hashPassword(newPassword),false,undefined);
    await this.store.revokeAllSessions(account.id); await this.store.revokeAllTrustedDevices(account.id);
    await this.store.audit('public.auth.password_changed',account.id,{});
    const updated={...account,passwordHash:'',forcePasswordChange:false,temporaryPasswordExpiresAt:undefined};
    return {sessionToken:await this.issueSession(updated),passwordChangeRequired:false};
  }

  async logout(token:string|undefined,trustedToken:string|undefined) {
    const sessionId=verifySignedToken(token,this.keys.session); if(sessionId) await this.store.revokeSession(sha256(sessionId));
    const trustedId=verifySignedToken(trustedToken,this.keys.trusted); if(trustedId) await this.store.revokeTrustedDevice(sha256(trustedId));
  }
}
