import type { PublicAccount, PublicMailer, PublicStore } from './types.js';
import { hashPassword, keyedHash, maskEmail, randomCode, randomTemporaryPassword, randomToken, sha256, signToken, validateNewPassword, verifyPassword, verifySignedToken } from './security.js';

const TEN_MINUTES = 10 * 60_000;
const THIRTY_DAYS = 30 * 24 * 60 * 60_000;
const SESSION_LIFETIME = 12 * 60 * 60_000;
// An hour to open the deletion link. Long enough to walk away from the screen
// and come back; short enough that a forwarded or intercepted mailbox is not a
// standing offer to delete somebody's account.
const DELETION_WINDOW = 60 * 60_000;
const DUMMY_HASH = 'scrypt$AAAAAAAAAAAAAAAAAAAAAA$5gvM3xrTTFvQDeiqs8XEB5P5uJ5fwxNf2pNxcrZqaD54YCYeJkzVKI06vdqdI6OcTnxv1LX6xlvQEzkKyQl9fA';

export class AuthError extends Error { constructor(public status:number, message:string) { super(message); } }
export type LoginResult = { requiresTwoFactor:boolean; challengeId?:string; sentTo?:string; sessionToken?:string; trustedDeviceToken?:string; passwordChangeRequired?:boolean; privateGroupWarning?:boolean };

export class PublicAuthService {
  // `site` is not a key and sits here anyway, because this object is what the
  // service must be TOLD rather than what it can work out — and making it a
  // required field is what stops a deletion email going out with a broken link
  // because somebody added a constructor argument and forgot this one.
  constructor(private store:PublicStore, private mailer:PublicMailer, private keys:{session:string;challenge:string;trusted:string;site:string}, private now=()=>Date.now()) {}

  // The public terminal reads `?delete=` at load and posts it back. A query
  // parameter rather than a hash, because a hash never reaches the server and
  // this has to survive being pasted, forwarded and opened in another browser.
  private deletionUrl(token:string){return `${this.keys.site.replace(/\/$/,'')}/?delete=${encodeURIComponent(token)}`}

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

  // ---- account deletion -----------------------------------------------------
  //
  // Two steps, because one is not enough and three is theatre. The signed-in
  // session proves who is asking; the emailed link proves they still control the
  // address, which is what stops a walked-away-from laptop being enough. That is
  // the same bar getting IN clears — every sign-in already needs an emailed code
  // — so deletion is no harder than access, which is the test that matters.
  async requestDeletion(sessionToken:string|undefined) {
    const {account}=await this.accountForSession(sessionToken);
    const token=randomToken();
    await this.store.createDeletionRequest(sha256(token),{accountId:account.id,expiresAt:this.now()+DELETION_WINDOW});
    await this.mailer.sendDeletionLink(account.email,this.deletionUrl(token));
    await this.store.audit('public.account.deletion_requested',account.id,{});
    return {message:`Check ${maskEmail(account.email)} for a link to confirm. It is good for one hour.`};
  }

  // The link is opened by somebody who may not be signed in — a different
  // browser, a phone, an hour later — so this authenticates on the token alone.
  // That is safe because the token went to the address the account is reached
  // at, is stored only as a hash, expires, and is claimed before it is acted on.
  async confirmDeletion(token:string) {
    const hash=sha256(String(token||''));
    const request=await this.store.getDeletionRequest(hash);
    // One refusal for every way this can fail: unknown, expired, already used.
    // Distinguishing them tells whoever is holding a stale link nothing useful
    // and tells somebody holding a guessed one something worth knowing.
    if(!request||request.consumedAt||request.expiresAt<=this.now()) throw new AuthError(400,'That deletion link is no longer valid. Sign in and ask again if you still want to delete your account.');
    // CLAIMED BEFORE ANYTHING IS DELETED, so a double-open cannot run the
    // deletion twice — the second finds the row already spent.
    if(!await this.store.consumeDeletionRequest(hash,this.now())) throw new AuthError(400,'That deletion link is no longer valid. Sign in and ask again if you still want to delete your account.');
    const account=await this.store.findAccountById(request.accountId);
    if(!account) return {message:'That account has already been deleted.'};
    // Read the address BEFORE the row is gone: it is what the beta-access row is
    // keyed by, and what the confirmation is sent to.
    const email=account.email;
    await this.store.deleteAccount(account.id,email);
    // A NULL actor, because there is no longer an account for this to point at.
    await this.store.audit('public.account.deleted',undefined,{});
    // BEST EFFORT, AND DELIBERATELY LAST. The account is already gone; a mail
    // server having a bad minute must not resurrect it or report a failure for
    // work that succeeded. The cost of this failing is that somebody does not
    // get a receipt, which is smaller than the cost of the alternative.
    await this.mailer.sendDeletionComplete(email).catch(()=>{});
    return {message:'Your account and everything in it have been deleted.'};
  }

  async session(token:string|undefined) {
    const {account}=await this.accountForSession(token);
    // The display settings ride the session rather than needing a second
    // request: the shell has to know the time zone and the customized My
    // Terminal board BEFORE it draws anything, and a screen that renders on the
    // default and then jumps is worse than one that waits for one request.
    const preferences=await this.store.getPreferences(account.id);
    return {user:{id:account.id,email:account.email,displayName:account.displayName},preferences,passwordChangeRequired:account.forcePasswordChange,privateGroupWarning:account.privateGroupWarning};
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
