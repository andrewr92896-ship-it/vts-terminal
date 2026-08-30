import test from 'node:test';
import assert from 'node:assert/strict';
import { PublicAuthService } from '../src/auth.js';
import { admitAccount } from '../src/admit.js';
import { MemoryPublicStore } from '../src/memoryStore.js';
import { RETENTION, startRetentionSweep } from '../src/retention.js';
import { hashPassword } from '../src/security.js';
import type { PublicMailer } from '../src/types.js';

class SilentMailer implements PublicMailer {
  verifications:Array<{to:string;code:string}>=[];
  async sendVerification(to:string,code:string){this.verifications.push({to,code})}
  async sendTemporaryPassword(){}
  deletionLinks:Array<{to:string;url:string}>=[];
  async sendDeletionLink(to:string,url:string){this.deletionLinks.push({to,url})}
  async sendDeletionComplete(){}
}
const keys={session:'session-key-that-is-at-least-thirty-two-bytes',challenge:'challenge-key-that-is-at-least-thirty-two-bytes',trusted:'trusted-key-that-is-at-least-thirty-two-bytes',site:'https://public.example.com'};

async function fixture(){
  let now=1_700_000_000_000;
  const store=new MemoryPublicStore(()=>now);
  const mail=new SilentMailer();
  store.addAccount({id:'account-1',email:'person@example.com',passwordHash:await hashPassword('CorrectPassword7'),displayName:'Person',forcePasswordChange:false,privateGroupWarning:false,disabled:false});
  const auth=new PublicAuthService(store,mail,keys,()=>now);
  return {store,mail,auth,at:()=>now,advance:(ms:number)=>now+=ms};
}

// EVERY CUTOFF IS TESTED ON BOTH SIDES. A sweep that deletes everything passes
// "the old row is gone" perfectly, and it is the worse failure of the two: the
// beta-access clause is a promise to somebody, the authentication clauses are
// housekeeping, and a sweep that took a live session with it signs the whole
// terminal out every six hours.

// THE PERIOD IS WRITTEN OUT AS A LITERAL HERE, not read from RETENTION. Six
// months is a sentence in a published Privacy Policy, so shortening the
// constant has to fail a test rather than silently move the goalposts along
// with everything measured against it.
const DAY=24*60*60_000;
test('a beta-access request is kept for six months exactly',async()=>{
  assert.equal(RETENTION.betaAccessMs,180*DAY,'the Privacy Policy says six months');
  const {store,advance,at}=await fixture();
  await store.recordEarlyAccessRequest('waiting@example.com',null);
  advance(179*DAY);
  assert.equal((await store.sweepExpired(at())).betaAccessRequests,0,'swept before its six months were up');
  assert.equal(store.earlyAccess.size,1);
  advance(2*DAY);
  assert.equal((await store.sweepExpired(at())).betaAccessRequests,1);
  assert.equal(store.earlyAccess.size,0);
});

test('asking again restarts the six months rather than running out mid-way',async()=>{
  const {store,advance,at}=await fixture();
  await store.recordEarlyAccessRequest('waiting@example.com',null);
  advance(RETENTION.betaAccessMs-1000);
  await store.recordEarlyAccessRequest('waiting@example.com',null);
  advance(2000);
  assert.equal((await store.sweepExpired(at())).betaAccessRequests,0);
  assert.equal(store.earlyAccess.size,1);
});

test('admitting somebody removes their beta-access request',async()=>{
  const {store}=await fixture();
  await store.recordEarlyAccessRequest('Waiting@Example.com',null);
  assert.equal(store.earlyAccess.size,1);
  await admitAccount(store,{email:'waiting@example.com',displayName:'Waiting',password:'AdmittedPassword9'});
  assert.equal(store.earlyAccess.size,0,'the lead is still held after the account exists');
});

test('a failed admission leaves the request in place for the next attempt',async()=>{
  const {store}=await fixture();
  await store.recordEarlyAccessRequest('person@example.com',null);
  // That address already has an account, so the admit is refused.
  await assert.rejects(()=>admitAccount(store,{email:'person@example.com',displayName:'Person',password:'AdmittedPassword9'}));
  assert.equal(store.earlyAccess.size,1);
});

test('the sweep takes spent authentication rows and leaves live ones alone',async()=>{
  const {store,auth,mail,advance,at}=await fixture();

  // A signed-in session on a remembered browser, still live.
  const first=await auth.login('person@example.com','CorrectPassword7',undefined,'1.1.1.1');
  const live=await auth.verify(first.challengeId!,mail.verifications.at(-1)!.code,true,'1.1.1.1');

  // A second sign-in, then signed out — a revoked session and, because a
  // remembered browser rotates its token, a revoked trusted device too.
  const second=await auth.login('person@example.com','CorrectPassword7',undefined,'1.1.1.1');
  const spent=await auth.verify(second.challengeId!,mail.verifications.at(-1)!.code,true,'1.1.1.1');
  await auth.logout(spent.sessionToken,spent.trustedDeviceToken);

  // A deletion link that was never opened, left to expire.
  await auth.requestDeletion(live.sessionToken);

  advance(2*60*60_000); // past the ten-minute codes and the one-hour deletion link, inside the twelve-hour session
  const swept=await store.sweepExpired(at());

  assert.equal(swept.challenges,2,'both used sign-in codes should be gone');
  assert.equal(swept.sessions,1,'only the signed-out session');
  assert.equal(swept.trustedDevices,1,'only the revoked one');
  assert.equal(swept.deletionRequests,1);

  assert.equal(store.sessions.size,1,'the live session was swept');
  assert.equal(store.trusted.size,1,'the live trusted device was swept');

  // And the live session still works afterwards, which is the assertion that
  // actually matters — a count can be right while the wrong row went.
  const me=await auth.session(live.sessionToken);
  assert.equal(me.user.email,'person@example.com');
});

test('a rate-limit window somebody is inside survives; a day-old one does not',async()=>{
  const {store,advance,at}=await fixture();
  await store.consumeRateLimit('login-ip','old-hash',20,15*60_000);
  advance(RETENTION.rateLimitMs+1);
  await store.consumeRateLimit('login-ip','fresh-hash',20,15*60_000);
  const swept=await store.sweepExpired(at());
  assert.equal(swept.rateLimits,1);
  assert.equal(store.rates.size,1);
});

test('the scheduler runs a pass immediately and survives a store that throws',async()=>{
  const lines:string[]=[];
  const ok={sweepExpired:async()=>({betaAccessRequests:1,sessions:0,challenges:0,trustedDevices:0,recoveryEvents:0,deletionRequests:0,rateLimits:0})};
  const sweep=startRetentionSweep(ok,{log:(l)=>lines.push(l)});
  sweep.stop();
  await new Promise((r)=>setImmediate(r));
  assert.match(lines[0]!,/public_api\.retention_swept/);
  assert.match(lines[0]!,/"betaAccessRequests":1/);

  const broken={sweepExpired:async()=>{throw new Error('database is down')}};
  const failing=startRetentionSweep(broken,{log:(l)=>lines.push(l)});
  failing.stop();
  await new Promise((r)=>setImmediate(r));
  // Logged rather than thrown: a failed sweep must not be able to take the
  // service down, and a sweep that has silently been failing for a month is
  // exactly what this line exists to make findable.
  assert.match(lines[1]!,/public_api\.retention_failed/);
  assert.match(lines[1]!,/database is down/);
});
