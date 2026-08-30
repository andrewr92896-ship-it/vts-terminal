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
  deletionLinks:Array<{to:string;url:string}>=[]; deletionsDone:string[]=[];
  async sendDeletionLink(to:string,url:string){this.deletionLinks.push({to,url})}
  async sendDeletionComplete(to:string){this.deletionsDone.push(to)}
}
const keys={session:'session-key-that-is-at-least-thirty-two-bytes',challenge:'challenge-key-that-is-at-least-thirty-two-bytes',trusted:'trusted-key-that-is-at-least-thirty-two-bytes',site:'https://public.example.com'};

async function fixture(){let now=1_700_000_000_000;const store=new MemoryPublicStore(()=>now);const mail=new CaptureMailer();store.addAccount({id:'account-1',email:'person@example.com',passwordHash:await hashPassword('CorrectPassword7'),displayName:'Person',forcePasswordChange:false,privateGroupWarning:true,disabled:false});const auth=new PublicAuthService(store,mail,keys,()=>now);return {store,mail,auth,advance:(ms:number)=>now+=ms}}

test('password then email challenge; challenge is single-use and private warning contains no redirect',async()=>{const {auth,mail}=await fixture();const login=await auth.login('person@example.com','CorrectPassword7',undefined,'1.1.1.1');assert.equal(login.requiresTwoFactor,true);assert.match(login.challengeId!,/^[A-Za-z0-9_-]+$/);assert.equal(login.privateGroupWarning,true);assert.equal(JSON.stringify(login).includes('portal'),false);const verified=await auth.verify(login.challengeId!,mail.verifications[0]!.code,false,'1.1.1.1');assert.ok(verified.sessionToken);assert.equal(verified.passwordChangeRequired,false);await assert.rejects(()=>auth.verify(login.challengeId!,mail.verifications[0]!.code,false,'1.1.1.1'),(e:unknown)=>e instanceof AuthError&&e.status===400)});

test('expired and guessed challenges fail generically',async()=>{const {auth,mail,advance}=await fixture();const login=await auth.login('person@example.com','CorrectPassword7',undefined,'2.2.2.2');await assert.rejects(()=>auth.verify(login.challengeId!,'000000',false,'2.2.2.2'),/invalid or expired/);advance(10*60_000+1);await assert.rejects(()=>auth.verify(login.challengeId!,mail.verifications[0]!.code,false,'2.2.2.2'),/invalid or expired/)});

test('remembered devices rotate, bypass step two, and are revoked by logout',async()=>{const {auth,mail}=await fixture();const login=await auth.login('person@example.com','CorrectPassword7',undefined,'3.3.3.3');const verified=await auth.verify(login.challengeId!,mail.verifications[0]!.code,true,'3.3.3.3');assert.ok(verified.trustedDeviceToken);const remembered=await auth.login('person@example.com','CorrectPassword7',verified.trustedDeviceToken,'3.3.3.3');assert.equal(remembered.requiresTwoFactor,false);assert.notEqual(remembered.trustedDeviceToken,verified.trustedDeviceToken);await auth.logout(remembered.sessionToken,remembered.trustedDeviceToken);const after=await auth.login('person@example.com','CorrectPassword7',remembered.trustedDeviceToken,'3.3.3.3');assert.equal(after.requiresTwoFactor,true)});

test('recovery is non-enumerating, forces change, revokes trust, and completes only with current temporary password',async()=>{const {auth,mail}=await fixture();const known=await auth.recover('person@example.com','4.4.4.4');const unknown=await auth.recover('missing@example.com','5.5.5.5');assert.deepEqual(known,unknown);assert.equal(mail.recoveries.length,1);const login=await auth.login('person@example.com',mail.recoveries[0]!.password,undefined,'4.4.4.4');const verified=await auth.verify(login.challengeId!,mail.verifications.at(-1)!.code,true,'4.4.4.4');assert.equal(verified.passwordChangeRequired,true);assert.equal(verified.trustedDeviceToken,undefined);const changed=await auth.changePassword(verified.sessionToken,mail.recoveries[0]!.password,'FreshPassword77');assert.equal(changed.passwordChangeRequired,false);await assert.rejects(()=>auth.login('person@example.com',mail.recoveries[0]!.password,undefined,'6.6.6.6'),/incorrect/)});

test('temporary recovery passwords expire after fifteen minutes',async()=>{const {auth,mail,advance}=await fixture();await auth.recover('person@example.com','9.9.9.9');advance(15*60_000+1);await assert.rejects(()=>auth.login('person@example.com',mail.recoveries[0]!.password,undefined,'9.9.9.9'),/incorrect/)});

test('bad passwords and unknown accounts use the same response',async()=>{const {auth}=await fixture();const messages:string[]=[];for(const [email,password,ip] of [['person@example.com','wrong','7.7.7.7'],['missing@example.com','wrong','8.8.8.8']]){try{await auth.login(email!,password!,undefined,ip!)}catch(e){messages.push((e as Error).message)}}assert.deepEqual(messages,['Email or password is incorrect.','Email or password is incorrect.'])});

// ---- account deletion --------------------------------------------------------
//
// The rules being pinned are the ones that make deletion trustworthy rather
// than merely present: it takes proof of the address as well as the session,
// the link works exactly once, it expires, and when it runs it takes the
// beta-access row with it — the one record about a person that the account's
// own database cascades cannot reach, because it is keyed by email address and
// carries no account id at all.

async function signedIn() {
  const store = new MemoryPublicStore();
  const mailer = new CaptureMailer();
  const service = new PublicAuthService(store, mailer, keys);
  const id = await store.createAccount({ email: 'gone@example.com', displayName: 'Gone', passwordHash: await hashPassword('CorrectHorse9Battery') });
  const login = await service.login('gone@example.com', 'CorrectHorse9Battery', undefined, '203.0.113.9');
  const verified = await service.verify(login.challengeId!, mailer.verifications.at(-1)!.code, false, '203.0.113.9');
  return { store, mailer, service, id, session: verified.sessionToken! };
}

test('deleting an account needs the emailed link as well as the session', async () => {
  const { store, mailer, service, session } = await signedIn();
  await service.requestDeletion(session);
  // Asking does NOT delete. Until the link is opened the account is untouched.
  assert.equal(mailer.deletionLinks.length, 1);
  assert.equal(mailer.deletionLinks[0]!.to, 'gone@example.com');
  assert.equal(store.accounts.size, 1);
  const token = new URL(mailer.deletionLinks[0]!.url).searchParams.get('delete')!;
  assert.ok(token, 'the emailed link carries a token');

  await service.confirmDeletion(token);
  assert.equal(store.accounts.size, 0);
  assert.deepEqual(mailer.deletionsDone, ['gone@example.com']);
});

// SINGLE USE IS TESTED ON THE RACE, NOT ON A SECOND CALL AFTERWARDS. Confirming
// twice in sequence fails whatever the code does, because deleting the account
// takes the pending request row with it and the second attempt is refused as an
// unknown token — so that version of this test passed with the one-use guard
// removed entirely, which is how it was caught. What has to be proved is that
// two callers holding the SAME live token cannot both proceed: a mail scanner
// opening the link while the person does, a double tap, a refresh. Both read the
// row before either has finished with it, and only the claim separates them.
test('two callers holding the same deletion link produce one deletion', async () => {
  const { store, mailer, service, session } = await signedIn();
  await service.requestDeletion(session);
  const token = new URL(mailer.deletionLinks[0]!.url).searchParams.get('delete')!;

  const results = await Promise.allSettled([service.confirmDeletion(token), service.confirmDeletion(token)]);
  const done = results.filter((r) => r.status === 'fulfilled');
  assert.equal(done.length, 1, `exactly one confirm may win, got ${done.length}`);
  assert.equal(store.accounts.size, 0);
  // And the account was deleted once, so one receipt was sent rather than two.
  assert.deepEqual(mailer.deletionsDone, ['gone@example.com']);
});

// The claim itself, at the store, with no deletion in the way to muddy it.
test('a deletion request can be claimed only once', async () => {
  const store = new MemoryPublicStore();
  await store.createDeletionRequest('hash-a', { accountId: 'acc-1', expiresAt: Date.now() + 60_000 });
  assert.equal(await store.consumeDeletionRequest('hash-a', Date.now()), true);
  assert.equal(await store.consumeDeletionRequest('hash-a', Date.now()), false);
  assert.equal(await store.consumeDeletionRequest('hash-unknown', Date.now()), false);
});

test('an expired deletion link is refused', async () => {
  const store = new MemoryPublicStore();
  const mailer = new CaptureMailer();
  let now = Date.now();
  const service = new PublicAuthService(store, mailer, keys, () => now);
  await store.createAccount({ email: 'gone@example.com', displayName: 'Gone', passwordHash: await hashPassword('CorrectHorse9Battery') });
  const login = await service.login('gone@example.com', 'CorrectHorse9Battery', undefined, '203.0.113.9');
  const verified = await service.verify(login.challengeId!, mailer.verifications.at(-1)!.code, false, '203.0.113.9');
  await service.requestDeletion(verified.sessionToken!);
  const token = new URL(mailer.deletionLinks[0]!.url).searchParams.get('delete')!;
  now += 61 * 60_000;
  await assert.rejects(() => service.confirmDeletion(token), /no longer valid/);
  assert.equal(store.accounts.size, 1, 'an expired link must not delete the account');
});

test('deletion takes the beta-access row, which no cascade can reach', async () => {
  const { store, mailer, service, session } = await signedIn();
  // The address asked for a place before it had an account, which is how every
  // account here comes to exist.
  await store.recordEarlyAccessRequest('GONE@example.com', null);
  await store.recordEarlyAccessRequest('someone-else@example.com', null);
  assert.equal(store.earlyAccess.size, 2);

  await service.requestDeletion(session);
  const token = new URL(mailer.deletionLinks[0]!.url).searchParams.get('delete')!;
  await service.confirmDeletion(token);

  assert.equal(store.earlyAccess.has('gone@example.com'), false, 'the beta-access row survived the account');
  assert.equal(store.earlyAccess.has('someone-else@example.com'), true, 'somebody else was deleted too');
});

test('deleting an account revokes its sessions and trusted devices', async () => {
  const { store, mailer, service, session } = await signedIn();
  assert.ok(store.sessions.size > 0);
  await service.requestDeletion(session);
  const token = new URL(mailer.deletionLinks[0]!.url).searchParams.get('delete')!;
  await service.confirmDeletion(token);
  assert.equal(store.sessions.size, 0);
  assert.equal(store.trusted.size, 0);
});
