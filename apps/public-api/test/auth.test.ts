import test from 'node:test';
import assert from 'node:assert/strict';
import { PublicAuthService, AuthError } from '../src/auth.js';
import { MemoryPublicStore } from '../src/memoryStore.js';
import { hashPassword } from '../src/security.js';
import type { PublicMailer } from '../src/types.js';

class CaptureMailer implements PublicMailer {
  verifications:Array<{to:string;code:string}>=[]; recoveries:Array<{to:string;password:string}>=[];
  async sendVerification(to:string,code:string){this.verifications.push({to,code})}
  async sendTemporaryPassword(to:string,password:string){this.recoveries.push({to,password})}
}
const keys={session:'session-key-that-is-at-least-thirty-two-bytes',challenge:'challenge-key-that-is-at-least-thirty-two-bytes',trusted:'trusted-key-that-is-at-least-thirty-two-bytes'};

async function fixture(){let now=1_700_000_000_000;const store=new MemoryPublicStore(()=>now);const mail=new CaptureMailer();store.addAccount({id:'account-1',email:'person@example.com',passwordHash:await hashPassword('CorrectPassword7'),displayName:'Person',forcePasswordChange:false,privateGroupWarning:true,disabled:false});const auth=new PublicAuthService(store,mail,keys,()=>now);return {store,mail,auth,advance:(ms:number)=>now+=ms}}

test('password then email challenge; challenge is single-use and private warning contains no redirect',async()=>{const {auth,mail}=await fixture();const login=await auth.login('person@example.com','CorrectPassword7',undefined,'1.1.1.1');assert.equal(login.requiresTwoFactor,true);assert.match(login.challengeId!,/^[A-Za-z0-9_-]+$/);assert.equal(login.privateGroupWarning,true);assert.equal(JSON.stringify(login).includes('portal'),false);const verified=await auth.verify(login.challengeId!,mail.verifications[0]!.code,false,'1.1.1.1');assert.ok(verified.sessionToken);assert.equal(verified.passwordChangeRequired,false);await assert.rejects(()=>auth.verify(login.challengeId!,mail.verifications[0]!.code,false,'1.1.1.1'),(e:unknown)=>e instanceof AuthError&&e.status===400)});

test('expired and guessed challenges fail generically',async()=>{const {auth,mail,advance}=await fixture();const login=await auth.login('person@example.com','CorrectPassword7',undefined,'2.2.2.2');await assert.rejects(()=>auth.verify(login.challengeId!,'000000',false,'2.2.2.2'),/invalid or expired/);advance(10*60_000+1);await assert.rejects(()=>auth.verify(login.challengeId!,mail.verifications[0]!.code,false,'2.2.2.2'),/invalid or expired/)});

test('remembered devices rotate, bypass step two, and are revoked by logout',async()=>{const {auth,mail}=await fixture();const login=await auth.login('person@example.com','CorrectPassword7',undefined,'3.3.3.3');const verified=await auth.verify(login.challengeId!,mail.verifications[0]!.code,true,'3.3.3.3');assert.ok(verified.trustedDeviceToken);const remembered=await auth.login('person@example.com','CorrectPassword7',verified.trustedDeviceToken,'3.3.3.3');assert.equal(remembered.requiresTwoFactor,false);assert.notEqual(remembered.trustedDeviceToken,verified.trustedDeviceToken);await auth.logout(remembered.sessionToken,remembered.trustedDeviceToken);const after=await auth.login('person@example.com','CorrectPassword7',remembered.trustedDeviceToken,'3.3.3.3');assert.equal(after.requiresTwoFactor,true)});

test('recovery is non-enumerating, forces change, revokes trust, and completes only with current temporary password',async()=>{const {auth,mail}=await fixture();const known=await auth.recover('person@example.com','4.4.4.4');const unknown=await auth.recover('missing@example.com','5.5.5.5');assert.deepEqual(known,unknown);assert.equal(mail.recoveries.length,1);const login=await auth.login('person@example.com',mail.recoveries[0]!.password,undefined,'4.4.4.4');const verified=await auth.verify(login.challengeId!,mail.verifications.at(-1)!.code,true,'4.4.4.4');assert.equal(verified.passwordChangeRequired,true);assert.equal(verified.trustedDeviceToken,undefined);const changed=await auth.changePassword(verified.sessionToken,mail.recoveries[0]!.password,'FreshPassword77');assert.equal(changed.passwordChangeRequired,false);await assert.rejects(()=>auth.login('person@example.com',mail.recoveries[0]!.password,undefined,'6.6.6.6'),/incorrect/)});

test('temporary recovery passwords expire after fifteen minutes',async()=>{const {auth,mail,advance}=await fixture();await auth.recover('person@example.com','9.9.9.9');advance(15*60_000+1);await assert.rejects(()=>auth.login('person@example.com',mail.recoveries[0]!.password,undefined,'9.9.9.9'),/incorrect/)});

test('bad passwords and unknown accounts use the same response',async()=>{const {auth}=await fixture();const messages:string[]=[];for(const [email,password,ip] of [['person@example.com','wrong','7.7.7.7'],['missing@example.com','wrong','8.8.8.8']]){try{await auth.login(email!,password!,undefined,ip!)}catch(e){messages.push((e as Error).message)}}assert.deepEqual(messages,['Email or password is incorrect.','Email or password is incorrect.'])});
