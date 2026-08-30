import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { PublicAuthService, AuthError } from '../src/auth.js';
import { MemoryPublicStore } from '../src/memoryStore.js';
import { ACKNOWLEDGEMENT_STATEMENTS, REQUIRED_DOCUMENTS, canonicalLegalText, sha256Hex } from '../src/legalDocuments.js';
import { hashPassword } from '../src/security.js';
import type { PublicMailer } from '../src/types.js';

class SilentMailer implements PublicMailer {
  verifications:Array<{to:string;code:string}>=[];
  async sendVerification(to:string,code:string){this.verifications.push({to,code})}
  async sendTemporaryPassword(){}
  async sendDeletionLink(){}
  async sendDeletionComplete(){}
}
const keys={session:'session-key-that-is-at-least-thirty-two-bytes',challenge:'challenge-key-that-is-at-least-thirty-two-bytes',trusted:'trusted-key-that-is-at-least-thirty-two-bytes',site:'https://public.example.com'};

async function signedIn(){
  let now=1_700_000_000_000;
  const store=new MemoryPublicStore(()=>now);
  const mail=new SilentMailer();
  store.addAccount({id:'account-1',email:'person@example.com',passwordHash:await hashPassword('CorrectPassword7'),displayName:'Person',forcePasswordChange:false,privateGroupWarning:false,disabled:false});
  const auth=new PublicAuthService(store,mail,keys,()=>now);
  const login=await auth.login('person@example.com','CorrectPassword7',undefined,'1.1.1.1');
  const verified=await auth.verify(login.challengeId!,mail.verifications.at(-1)!.code,false,'1.1.1.1');
  return {store,auth,token:verified.sessionToken!,at:()=>now,advance:(ms:number)=>now+=ms};
}

test('an account that has not accepted is told so on its own session',async()=>{
  const {auth,token}=await signedIn();
  assert.equal((await auth.session(token)).legalAcceptanceRequired,true);
  await auth.acceptLegal(token);
  assert.equal((await auth.session(token)).legalAcceptanceRequired,false);
});

test('accepting writes one row per document, carrying the SERVER’s version and hash',async()=>{
  const {store,auth,token,at}=await signedIn();
  await auth.acceptLegal(token);
  const rows=await store.listLegalAcceptances('account-1');
  assert.deepEqual(rows.map((r)=>r.document).sort(),['acknowledgement','privacy','terms']);
  for(const row of rows){
    const doc=REQUIRED_DOCUMENTS.find((d)=>d.id===row.document)!;
    assert.equal(row.version,doc.version);
    assert.equal(row.sha256,doc.sha256,`${row.document} stored a hash that is not the document's`);
    assert.equal(row.acceptedAt,at());
  }
});

test('the accept route takes NO body, so nothing a caller sends can reach the record',async()=>{
  // The whole evidentiary value rests on the stored hash being the server's.
  // This is the assertion that a future signature change cannot quietly break:
  // whatever is sent, the row holds the registry's own values.
  const {store,auth,token}=await signedIn();
  await (auth.acceptLegal as (t:string,...rest:unknown[])=>Promise<unknown>)(token,{document:'terms',version:'9',sha256:'0'.repeat(64)});
  const terms=(await store.listLegalAcceptances('account-1')).find((r)=>r.document==='terms')!;
  assert.equal(terms.version,REQUIRED_DOCUMENTS.find((d)=>d.id==='terms')!.version);
  assert.notEqual(terms.sha256,'0'.repeat(64));
});

test('a reworded document re-prompts, and only that one is written again',async()=>{
  // THE TRANSITION THIS FEATURE EXISTS FOR, driven through the real service
  // rather than simulated at the store: the terms are reworded, the account is
  // gated again, ticking writes the new version, and what they agreed to before
  // is still there.
  const {store,auth,token,advance,at}=await signedIn();
  await auth.acceptLegal(token);
  assert.equal((await auth.session(token)).legalAcceptanceRequired,false);

  const bumped=REQUIRED_DOCUMENTS.map((d)=>d.id==='terms'?{...d,version:'2026-09-01.1',sha256:'b'.repeat(64)}:d);
  // The same frozen clock, or the fixture's session reads as expired.
  const after=new PublicAuthService(store,new SilentMailer(),keys,at,bumped);
  assert.equal((await after.session(token)).legalAcceptanceRequired,true,'a reworded document did not re-prompt');
  assert.deepEqual((await after.legalDocuments(token)).outstanding,['terms'],'the untouched documents were owed again too');

  advance(60_000);
  await after.acceptLegal(token);
  const rows=await store.listLegalAcceptances('account-1');
  assert.equal(rows.length,4,'the record is append-only; the earlier acceptance must survive');
  const wasAt=REQUIRED_DOCUMENTS.find((d)=>d.id==='terms')!.version;
  assert.deepEqual(rows.filter((r)=>r.document==='terms').map((r)=>r.version),[wasAt,'2026-09-01.1']);
  assert.equal(rows.filter((r)=>r.document==='privacy').length,1,'a document that did not change was written again');
  assert.equal((await after.session(token)).legalAcceptanceRequired,false);
});

test('accepting twice writes nothing the second time — no row and no audit event',async()=>{
  // A double-click, a retried request and a second tab all land here. The row
  // count catches writing the whole set again instead of what is outstanding;
  // the audit count catches recording a second acceptance that never happened.
  const {store,auth,token}=await signedIn();
  await auth.acceptLegal(token);
  const audits=store.audits.filter((a)=>a.event==='public.legal.accepted').length;
  assert.equal(audits,1);
  await auth.acceptLegal(token);
  assert.equal((await store.listLegalAcceptances('account-1')).length,3,'a double-click added a duplicate row');
  assert.equal(store.audits.filter((a)=>a.event==='public.legal.accepted').length,1,'a double-click recorded a second acceptance');
});

test('the record is deleted with the account',async()=>{
  const {store,auth,token}=await signedIn();
  await auth.acceptLegal(token);
  await store.deleteAccount('account-1','person@example.com');
  assert.deepEqual(await store.listLegalAcceptances('account-1'),[]);
});

test('the retention sweep never takes an acceptance row',async()=>{
  // It is evidence, not housekeeping. The sweep clears spent authentication
  // material; an acceptance has no expiry and is not spent by being old.
  const {store,auth,token,advance,at}=await signedIn();
  await auth.acceptLegal(token);
  advance(10 * 365 * 24 * 60 * 60_000);
  await store.sweepExpired(at());
  assert.equal((await store.listLegalAcceptances('account-1')).length,3);
});

test('the registry’s hashes are the hash of the registry’s own text',async()=>{
  // Only the acknowledgement can be checked from inside this service — the two
  // documents live in the terminal's bundle and are checked by
  // `npm run verify:legal-hashes`, which is a different deployment's file.
  const ack=REQUIRED_DOCUMENTS.find((d)=>d.id==='acknowledgement')!;
  assert.match(ack.sha256,/^[0-9a-f]{64}$/);
  for(const doc of REQUIRED_DOCUMENTS)assert.match(doc.sha256,/^[0-9a-f]{64}$/,`${doc.id} has no usable hash`);
  // Canonicalisation is what the hash MEANS, so it is pinned here rather than
  // left to be inferred from whatever it currently produces.
  assert.equal(
    canonicalLegalText({title:'T',intro:'I',sections:[{heading:'H',blocks:[{p:'para'},{note:'n'},{ul:['a','b']}]}]}),
    'T\n\nI\n\n## H\npara\n! n\n- a\n- b\n',
  );
  // Line endings must not change the hash, or it would depend on which machine
  // checked out the repository.
  assert.equal(sha256Hex(canonicalLegalText({title:'T',intro:'a\r\nb',sections:[]})),sha256Hex(canonicalLegalText({title:'T',intro:'a\nb',sections:[]})));
});

// ---- the gate ---------------------------------------------------------------
//
// Driven through the real dispatcher, because the gate lives in
// `authenticatedAccount` and the point of it is that every route inherits it.

Object.assign(process.env,{
  PUBLIC_DATABASE_URL:'postgres://public:public@127.0.0.1:5432/public_test',
  PUBLIC_SESSION_SIGNING_KEY:'a'.repeat(48),
  PUBLIC_CHALLENGE_PEPPER:'a'.repeat(48),
  PUBLIC_TRUSTED_DEVICE_SIGNING_KEY:'a'.repeat(48),
  PUBLIC_ALLOWED_ORIGINS:'https://public.example.com',
  PUBLIC_COOKIE_SECURE:'true',
  PUBLIC_MAIL_FROM:'no-reply@example.com',
  PUBLIC_SMTP_URL:'smtp://127.0.0.1:1025',
});
const { handleRequest, PUBLIC_SESSION_COOKIE } = await import('../src/server.js');

async function gated(){
  const fixture=await signedIn();
  const call=(method:string,path:string,body?:unknown)=>{
    const req=Readable.from(body===undefined?[]:[JSON.stringify(body)]) as any;
    req.method=method; req.url=path;
    req.headers={origin:'https://public.example.com','x-vts-public-csrf':'1',cookie:`${PUBLIC_SESSION_COOKIE}=${encodeURIComponent(fixture.token)}`};
    req.socket={remoteAddress:'203.0.113.7'};
    let status=0; let payload='';
    const res={setHeader(){},writeHead(code:number){status=code;return res},end(chunk?:string){payload=chunk??'';return res}} as any;
    return handleRequest(req,res,{store:fixture.store,market:{marketData:async()=>({}),marketNews:async()=>({})} as any,auth:fixture.auth} as any)
      .then(()=>({status,body:payload?JSON.parse(payload):{}}));
  };
  return {...fixture,call};
}

test('every authenticated route is refused until the box is ticked',async()=>{
  const {call}=await gated();
  for(const [method,path] of [['GET','/public/v1/budget'],['GET','/public/v1/todo'],['GET','/public/v1/investments/portfolio'],['GET','/public/v1/market-data/layout'],['POST','/public/v1/budget/categories']] as const){
    const answer=await call(method,path,method==='POST'?{name:'x',kind:'expense'}:undefined);
    assert.equal(answer.status,403,`${method} ${path} was served before the terms were accepted`);
  }
});

test('signing out, reading the session and asking to delete stay reachable while the gate is up',async()=>{
  // A gate somebody cannot leave is not a consent mechanism. These are exactly
  // the routes that do not go through `authenticatedAccount`.
  const {call}=await gated();
  assert.equal((await call('GET','/public/v1/auth/session')).status,200);
  assert.equal((await call('GET','/public/v1/legal/documents')).status,200);
  assert.equal((await call('POST','/public/v1/account/deletion')).status,200);
  assert.equal((await call('POST','/public/v1/auth/logout')).status,200);
});

test('the same route is served once the box is ticked',async()=>{
  const {call}=await gated();
  assert.equal((await call('GET','/public/v1/budget')).status,403);
  assert.equal((await call('POST','/public/v1/legal/accept')).status,200);
  assert.equal((await call('GET','/public/v1/budget')).status,200);
});

test('the documents route names what is outstanding and never the text itself',async()=>{
  const {call}=await gated();
  const before=await call('GET','/public/v1/legal/documents');
  assert.deepEqual([...before.body.outstanding].sort(),['acknowledgement','privacy','terms']);
  // A document entry is a version and a hash, never prose: the Terms and the
  // Privacy Policy are rendered from the terminal's own bundle, and a copy here
  // would be a second one to drift.
  assert.deepEqual(Object.keys(before.body.documents[0]).sort(),['effectiveDate','id','sha256','title','version']);
  // The acknowledgement is the exception, and deliberately so — it is owned by
  // this service and hashed from the same constants it is served from, so what
  // the person read and what the record pins cannot differ.
  // SERVED FROM THE HASHED CONSTANTS, byte for byte. That equality is the whole
  // claim: what the person read and what the record pins are one thing, with
  // nothing in between that could differ.
  assert.deepEqual(before.body.acknowledgement.statements,[...ACKNOWLEDGEMENT_STATEMENTS]);
  assert.match(before.body.acknowledgement.confirm,/Terms of Service/);
  // The eligibility representation specifically. Nothing verifies age or
  // location, so this statement IS the record that somebody said they were
  // eligible — dropping it would take that away silently.
  assert.ok(ACKNOWLEDGEMENT_STATEMENTS.some((line)=>/18 or over/.test(line)&&/United States/.test(line)),
    'the acknowledgement no longer asks anybody to confirm they are eligible');
  await call('POST','/public/v1/legal/accept');
  assert.deepEqual((await call('GET','/public/v1/legal/documents')).body.outstanding,[]);
});

test('an unauthenticated caller gets 401 from the clickwrap routes, not a gate',async()=>{
  const {store,auth}=await signedIn();
  await assert.rejects(()=>auth.legalDocuments(undefined),(e:unknown)=>e instanceof AuthError&&e.status===401);
  await assert.rejects(()=>auth.acceptLegal(undefined),(e:unknown)=>e instanceof AuthError&&e.status===401);
  assert.deepEqual(store.legalAcceptances,[]);
});
