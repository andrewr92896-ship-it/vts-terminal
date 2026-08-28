import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { loadPublicConfig } from './config.js';
import { PublicAuthService, AuthError } from './auth.js';
import { PostgresPublicStore } from './postgresStore.js';
import { HttpPublicMarketProvider, SmtpPublicMailer } from './adapters.js';
import type { BudgetKind, PublicMarketProvider, PublicStore, TodoItemRow } from './types.js';
import { buildSections, dailyDone, etTodayMs, nextEtMidnight } from './todo.js';
import { INVESTMENT_ASSET_CLASSES, allocateBy, concentrationFlags, totalPortfolio, valueHolding,
  type HoldingValue, type InvestmentAssetClass, type PricedHolding } from './investmentsMath.js';

// A month is YYYY-MM and a day is YYYY-MM-DD, both EASTERN — the same rule the
// private portal's budget follows, and for the same reason: a month boundary
// has to be one fact rather than a per-reader one, or December's spending moves
// into November when somebody travels.
const ET='America/New_York';
const etToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:ET,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const isMonthKey=(v:string)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
// Round-tripping is what catches 2026-02-31, which the pattern alone accepts.
const isDayKey=(v:string)=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  // Round-tripping catches 2026-02-31, which the pattern alone happily accepts.
  // The NaN guard is not optional: toISOString THROWS on an invalid date, so
  // without it a malformed day is a 500 rather than a refusal.
  const d=new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;
};
// Money arrives as cents and must be a whole positive number. A float here is
// the one thing the integer-cents rule exists to keep out.
// Optional text, trimmed and bounded; empty becomes null rather than ''.
const text=(v:unknown,max:number)=>typeof v==='string'&&v.trim()?v.trim().slice(0,max):null;
// Optional number. Null stays null — for a price that means UNPRICED, which is
// a real state and not the same as zero — but a value that is present must be a
// real number rather than silently becoming one.
const optionalNumber=(v:unknown,what:string)=>{
  if(v==null)return null;
  const n=Number(v);
  if(!Number.isFinite(n))throw new AuthError(400,`${what} must be a number.`);
  return n;
};
// Today's Eastern day as YYYY-MM-DD, for the one-per-day snapshot key.
const etTodayMs2Date=()=>new Intl.DateTimeFormat('en-CA',{timeZone:ET,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const isCents=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>0&&v<=2_147_483_647;

export const PUBLIC_SESSION_COOKIE='vts_public_session_v1';
export const PUBLIC_TRUSTED_DEVICE_COOKIE='vts_public_trusted_device_v1';
export const PUBLIC_COOKIE_PATH='/public';

const config=loadPublicConfig();
const store=new PostgresPublicStore(config.databaseUrl);
const auth=new PublicAuthService(store,new SmtpPublicMailer(config.smtpUrl,config.mailFrom),{session:config.sessionKey,challenge:config.challengePepper,trusted:config.trustedDeviceKey});
const market=new HttpPublicMarketProvider(config.marketProviderUrl,config.marketProviderToken);

const cookies=(req:IncomingMessage)=>Object.fromEntries((req.headers.cookie||'').split(';').map((part)=>part.trim().split(/=(.*)/s)).filter((v)=>v[0]).map(([k,v])=>[k,decodeURIComponent(v||'')]));
const cookie=(name:string,value:string,maxAge:number)=>`${name}=${encodeURIComponent(value)}; Path=${PUBLIC_COOKIE_PATH}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict${config.cookieDomain?`; Domain=${config.cookieDomain}`:''}`;
const clearCookie=(name:string)=>cookie(name,'',0);
const json=(res:ServerResponse,status:number,body:unknown,headers:Record<string,string|string[]>={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(body))};
const readBody=async(req:IncomingMessage)=>{let body='';for await(const chunk of req){body+=chunk;if(body.length>16_384)throw new AuthError(413,'Request too large.')}try{return body?JSON.parse(body):{}}catch{throw new AuthError(400,'Invalid JSON.')}};
const ip=(req:IncomingMessage)=>String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0]!.trim();
const unsafe=(req:IncomingMessage)=>!['GET','HEAD','OPTIONS'].includes(req.method||'GET');
const guardOrigin=(req:IncomingMessage)=>{if(!unsafe(req))return;const origin=req.headers.origin;if(!origin||!config.allowedOrigins.has(origin)||req.headers['x-vts-public-csrf']!=='1')throw new AuthError(403,'Request origin rejected.');};
const route=(req:IncomingMessage)=>new URL(req.url||'/', 'http://public.invalid').pathname;
const sessionCookie=(req:IncomingMessage)=>cookies(req)[PUBLIC_SESSION_COOKIE];

// The auth service is injectable for the same reason the store is: it was not,
// and it held the module-level Postgres store, so every authenticated route
// resolved its session against a real database no test can reach. That made the
// authenticated half of this API untestable — the routes that most need a check
// are exactly the ones that could not have one.
export type PublicDependencies={store:PublicStore;market:PublicMarketProvider;auth?:PublicAuthService};

// The whole decorated list, built from the two reads. Sections are ensured on
// every read rather than at sign-up: an account created before this shipped
// would otherwise have no list at all, and the insert is a no-op once they do.
async function readTodo(store:PublicStore,accountId:string){
  await store.ensureTodoSections(accountId);
  const [sections,items]=await Promise.all([store.listTodoSections(accountId),store.listTodoItems(accountId)]);
  return buildSections(sections,items,etTodayMs());
}

// A restore payload is rebuilt field by field rather than trusted as sent: it
// arrives from a client and names a row id, so anything not stated here — an
// account id above all — cannot be smuggled in through it.
function readRestorable(body:Record<string,unknown>):TodoItemRow|undefined{
  const id=String(body.id||''); const sectionId=String(body.sectionId||''); const text=String(body.text||'');
  if(!id||!sectionId||!text||text.length>500)return undefined;
  const position=Number(body.position);
  if(!Number.isInteger(position)||position<0)return undefined;
  const dueAt=body.dueAt==null?null:Number(body.dueAt);
  if(dueAt!==null&&!Number.isFinite(dueAt))return undefined;
  const intervalDays=body.intervalDays==null?null:Number(body.intervalDays);
  if(intervalDays!==null&&(!Number.isInteger(intervalDays)||intervalDays<=0))return undefined;
  return {id,sectionId,text,position,hyphen:body.hyphen===true,done:body.done===true,dueAt,intervalDays};
}

// The portfolio, valued.
//
// THERE ARE NO LIVE QUOTES ON THE PUBLIC SIDE YET, and that is stated rather
// than papered over. A holding is priced from the figure its owner typed, or it
// is not priced at all — and an unpriced holding is worth an UNKNOWN amount,
// never zero. `unpricedCount` on the totals is how the screen says how much of
// the portfolio it could not see; treating unpriced as zero would silently
// understate a portfolio, which is the most misleading thing a tracker can do.
//
// When a provider is wired, it lands here as the `live` branch and everything
// downstream — the totals, the allocation, the day-move coverage — already
// distinguishes the three sources.
async function readPortfolio(store:PublicStore,accountId:string){
  const [accounts,holdings]=await Promise.all([store.listInvestmentAccounts(accountId),store.listInvestmentHoldings(accountId)]);
  const labels=new Map(accounts.map((a)=>[a.id,a.label]));
  const valued:HoldingValue[]=holdings.map((h)=>{
    const priced:PricedHolding={
      id:h.id,accountId:h.investmentAccountId,symbol:h.symbol,name:h.name,
      assetClass:h.assetClass as InvestmentAssetClass,quantity:h.quantity,costBasis:h.costBasis,
      price:h.manualPrice,
      priceSource:h.manualPrice!=null?'manual':'none',
      // No quote means no previous close, so no day move is claimed for it.
      previousClose:null,
      sector:h.sector,region:h.region,
    };
    return valueHolding(priced);
  });
  // Only ACTIVE accounts' cash counts toward the total, matching how the
  // private side treats a closed account.
  const cash=accounts.filter((a)=>a.active).reduce((sum,a)=>sum+a.cashBalance,0);
  const totals=totalPortfolio(valued,cash);
  const byClass=allocateBy(valued,'assetClass',cash);
  return {
    accounts:accounts.map((a)=>{
      const mine=valued.filter((h)=>h.accountId===a.id);
      return {...a,
        // Its own priced holdings plus its cash — an unpriced holding inside it
        // is counted separately rather than folded in as nothing.
        value:mine.reduce((sum,h)=>sum+(h.value??0),0)+a.cashBalance,
        holdingsCount:mine.length,
        unpricedCount:mine.filter((h)=>h.value==null).length};
    }),
    holdings:valued.map((h)=>({...h,accountLabel:labels.get(h.accountId)??'',
      manualPrice:holdings.find((r)=>r.id===h.id)?.manualPrice??null,
      manualPriceAt:holdings.find((r)=>r.id===h.id)?.manualPriceAt??null})),
    totals,
    allocation:{byClass,bySector:allocateBy(valued,'sector',0),byRegion:allocateBy(valued,'region',0)},
    flags:concentrationFlags(valued,byClass,totals.value),
  };
}

async function authenticatedAccount(req:IncomingMessage,service:PublicAuthService){
  const current=await service.session(sessionCookie(req));
  return current.user.id;
}

export async function handleRequest(req:IncomingMessage,res:ServerResponse,dependencies:PublicDependencies={store,market}) {
  // An injected store without an injected auth service would silently keep using
  // the module-level one, so a test would appear wired up and quietly not be.
  const authService=dependencies.auth??(dependencies.store===store?auth:new PublicAuthService(dependencies.store,{sendVerification:async()=>{},sendTemporaryPassword:async()=>{}},{session:config.sessionKey,challenge:config.challengePepper,trusted:config.trustedDeviceKey}));
  try {
    guardOrigin(req); const path=route(req); const method=req.method||'GET'; const jar=cookies(req);
    if(method==='GET'&&path==='/public/v1/health')return json(res,200,{ok:true,service:'vts-public-api'});
    if(method==='POST'&&path==='/public/v1/auth/login'){
      const body=await readBody(req);const result=await authService.login(String(body.email||''),String(body.password||''),jar[PUBLIC_TRUSTED_DEVICE_COOKIE],ip(req));
      const set:string[]=[];if(result.sessionToken)set.push(cookie(PUBLIC_SESSION_COOKIE,result.sessionToken,12*60*60));if(result.trustedDeviceToken)set.push(cookie(PUBLIC_TRUSTED_DEVICE_COOKIE,result.trustedDeviceToken,30*24*60*60));
      const {sessionToken:_,trustedDeviceToken:__,...safe}=result;return json(res,200,safe,set.length?{'Set-Cookie':set}:{});
    }
    if(method==='POST'&&path==='/public/v1/auth/two-factor/verify'){
      const body=await readBody(req);const result=await authService.verify(String(body.challengeId||''),String(body.code||''),body.remember===true,ip(req));
      const set=[cookie(PUBLIC_SESSION_COOKIE,result.sessionToken!,12*60*60)];if(result.trustedDeviceToken)set.push(cookie(PUBLIC_TRUSTED_DEVICE_COOKIE,result.trustedDeviceToken,30*24*60*60));
      const {sessionToken:_,trustedDeviceToken:__,...safe}=result;return json(res,200,{ok:true,...safe},{'Set-Cookie':set});
    }
    if(method==='POST'&&path==='/public/v1/auth/recovery'){
      const body=await readBody(req);return json(res,202,await authService.recover(String(body.email||''),ip(req)));
    }
    if(method==='POST'&&path==='/public/v1/early-access'){
      const body=await readBody(req);
      const email=String(body.email||'').trim().toLowerCase();
      const note=typeof body.note==='string'&&body.note.trim()?body.note.trim().slice(0,1000):null;
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||email.length>320)throw new AuthError(400,'Enter a valid email address.');
      const limit=await dependencies.store.consumeRateLimit('early_access',ip(req),5,60*60*1000);
      if(!limit.allowed)throw new AuthError(429,'Too many requests. Try again later.');
      await dependencies.store.recordEarlyAccessRequest(email,note);
      await dependencies.store.audit('early_access.requested',undefined,{});
      // The same answer either way, so this cannot be used to learn whether an
      // address is already on the list.
      return json(res,202,{message:'Request received. If a place opens up you will hear from us at that address.'});
    }
    if(method==='GET'&&path==='/public/v1/auth/session')return json(res,200,await authService.session(sessionCookie(req)));
    if(method==='POST'&&path==='/public/v1/auth/change-password'){
      const body=await readBody(req);const result=await authService.changePassword(sessionCookie(req),String(body.currentPassword||''),String(body.newPassword||''));
      return json(res,200,{ok:true,passwordChangeRequired:false},{'Set-Cookie':cookie(PUBLIC_SESSION_COOKIE,result.sessionToken,12*60*60)});
    }
    if(method==='POST'&&path==='/public/v1/auth/logout'){await authService.logout(sessionCookie(req),jar[PUBLIC_TRUSTED_DEVICE_COOKIE]);return json(res,200,{ok:true},{'Set-Cookie':[clearCookie(PUBLIC_SESSION_COOKIE),clearCookie(PUBLIC_TRUSTED_DEVICE_COOKIE)]});}
    if(method==='GET'&&path==='/public/v1/market-data'){await authenticatedAccount(req,authService);return json(res,200,await dependencies.market.marketData())}
    if(method==='GET'&&path==='/public/v1/market-news'){await authenticatedAccount(req,authService);return json(res,200,await dependencies.market.marketNews())}
    if(method==='GET'&&path==='/public/v1/market-data/layout'){const id=await authenticatedAccount(req,authService);return json(res,200,{layout:await dependencies.store.getLayout(id)??{pinned:[],hidden:[],custom:[]}})}
    if(method==='PUT'&&path==='/public/v1/market-data/layout'){const id=await authenticatedAccount(req,authService);const body=await readBody(req);await dependencies.store.saveLayout(id,body);return json(res,200,{layout:body})}
    // ---- budget -------------------------------------------------------------
    //
    // Every route resolves the account from the SESSION and passes that id to
    // the store. No route accepts a "whose" parameter, so there is no request
    // that can be made for somebody else's budget.
    if(path==='/public/v1/budget'&&method==='GET'){
      const id=await authenticatedAccount(req,authService);
      const asked=new URL(req.url||'/','http://public.invalid').searchParams.get('month')||etToday().slice(0,7);
      if(!isMonthKey(asked))throw new AuthError(400,'Month must look like 2026-08.');
      const [categories,entries]=await Promise.all([
        dependencies.store.listBudgetCategories(id),
        dependencies.store.listBudgetEntries(id,asked),
      ]);
      return json(res,200,{month:asked,categories,entries});
    }
    if(path==='/public/v1/budget/categories'&&method==='POST'){
      const id=await authenticatedAccount(req,authService); const body=await readBody(req);
      const name=String(body.name||'').trim();
      const kind=String(body.kind||'') as BudgetKind;
      if(!name||name.length>60)throw new AuthError(400,'Give the category a name of 60 characters or fewer.');
      if(kind!=='income'&&kind!=='expense')throw new AuthError(400,'A category is either income or expense.');
      // Null is "no target" and is NOT zero: a budget with no targets is a
      // spending log, and a stored 0 would draw every bar at 0% instead.
      const limit=body.monthlyLimit===null||body.monthlyLimit===undefined?null:body.monthlyLimit;
      if(limit!==null&&(!Number.isInteger(limit)||(limit as number)<0))throw new AuthError(400,'A monthly target is a whole number of cents.');
      const icon=typeof body.icon==='string'&&body.icon.trim()?body.icon.trim().slice(0,24):null;
      try{
        return json(res,201,await dependencies.store.addBudgetCategory(id,{name,kind,monthlyLimit:limit as number|null,icon}));
      }catch(error){
        // A duplicate name is the caller's to fix, not a server fault.
        if((error as {code?:string}).code==='23505')throw new AuthError(409,'You already have a category with that name.');
        throw error;
      }
    }
    if(path.startsWith('/public/v1/budget/categories/')&&(method==='PATCH'||method==='DELETE')){
      const id=await authenticatedAccount(req,authService);
      const categoryId=decodeURIComponent(path.slice('/public/v1/budget/categories/'.length));
      if(method==='DELETE'){
        // Deleting removes the history with it. Archiving is the reversible
        // one, which is why it is the separate, easier call.
        const gone=await dependencies.store.deleteBudgetCategory(id,categoryId);
        if(!gone)throw new AuthError(404,'No such category.');
        return json(res,200,{ok:true});
      }
      const body=await readBody(req);
      if(typeof body.archived!=='boolean')throw new AuthError(400,'Say whether the category is archived.');
      const changed=await dependencies.store.archiveBudgetCategory(id,categoryId,body.archived);
      if(!changed)throw new AuthError(404,'No such category.');
      return json(res,200,{ok:true});
    }
    if(path==='/public/v1/budget/entries'&&method==='POST'){
      const id=await authenticatedAccount(req,authService); const body=await readBody(req);
      if(!isCents(body.amountCents))throw new AuthError(400,'An amount is a whole number of cents above zero.');
      const occurredOn=String(body.occurredOn||'')||etToday();
      if(!isDayKey(occurredOn))throw new AuthError(400,'A date looks like 2026-08-27.');
      const note=typeof body.note==='string'&&body.note.trim()?body.note.trim().slice(0,200):null;
      // `source` is deliberately not read from the body. It is the aggregator
      // seam, and a hand-entered row must never be able to claim it came from a
      // connected provider.
      const entry=await dependencies.store.addBudgetEntry(id,{categoryId:String(body.categoryId||''),amountCents:body.amountCents,note,occurredOn});
      if(!entry)throw new AuthError(404,'No such category.');
      return json(res,201,entry);
    }
    if(path.startsWith('/public/v1/budget/entries/')&&method==='DELETE'){
      const id=await authenticatedAccount(req,authService);
      const entryId=decodeURIComponent(path.slice('/public/v1/budget/entries/'.length));
      const gone=await dependencies.store.deleteBudgetEntry(id,entryId);
      if(!gone)throw new AuthError(404,'No such entry.');
      return json(res,200,{ok:true});
    }
    // ---- to do ---------------------------------------------------------------
    //
    // Every route resolves the account from the SESSION. The whole list is
    // returned after each write, which is what the component expects and what
    // keeps an optimistic client from having to guess how a toggle rippled.
    if(path==='/public/v1/todo'&&method==='GET'){
      const id=await authenticatedAccount(req,authService);
      return json(res,200,{sections:await readTodo(dependencies.store,id)});
    }
    if(path==='/public/v1/todo/items'&&method==='POST'){
      const id=await authenticatedAccount(req,authService); const body=await readBody(req);
      const text=String(body.text||'').trim();
      if(!text||text.length>500)throw new AuthError(400,'Give the task some text, up to 500 characters.');
      const added=await dependencies.store.addTodoItem(id,String(body.sectionId||''),text);
      if(!added)throw new AuthError(404,'No such section.');
      return json(res,201,{sections:await readTodo(dependencies.store,id)});
    }
    if(/^\/public\/v1\/todo\/items\/[^/]+\/toggle$/.test(path)&&method==='PATCH'){
      const id=await authenticatedAccount(req,authService);
      const itemId=decodeURIComponent(path.split('/')[5]!);
      const item=await dependencies.store.getTodoItem(id,itemId);
      if(!item)throw new AuthError(404,'No such task.');
      const sections=await dependencies.store.listTodoSections(id);
      const section=sections.find((s)=>s.id===item.sectionId);
      const today=etTodayMs();
      // The PRIOR state goes back with the answer so the client can offer an
      // undo. A daily item's stored `done` is not what was on screen — it is
      // only true for the day it was checked — so the state reported is the one
      // the reader actually saw.
      const wasDone=section?.type==='daily'?dailyDone(item,today):item.done;
      const previous={id:item.id,done:wasDone,dueAt:item.dueAt};
      // Checking a daily item makes it done until the next ET midnight; that is
      // the same column, because "when is this next due" and "how long does this
      // check last" are one question for a repeating task.
      const nextDone=!wasDone;
      const nextDue=section?.type==='daily'?(nextDone?nextEtMidnight(today):null):item.dueAt;
      await dependencies.store.setTodoItemState(id,itemId,nextDone,nextDue);
      return json(res,200,{sections:await readTodo(dependencies.store,id),previous});
    }
    if(path.startsWith('/public/v1/todo/items/')&&method==='DELETE'){
      const id=await authenticatedAccount(req,authService);
      const itemId=decodeURIComponent(path.slice('/public/v1/todo/items/'.length));
      // Read it BEFORE deleting: what comes back is what an undo needs, and
      // after the delete there is nothing left to describe.
      const removed=await dependencies.store.getTodoItem(id,itemId);
      if(!removed)throw new AuthError(404,'No such task.');
      await dependencies.store.deleteTodoItem(id,itemId);
      return json(res,200,{sections:await readTodo(dependencies.store,id),removed});
    }
    if(path==='/public/v1/todo/items/restore'&&method==='POST'){
      const id=await authenticatedAccount(req,authService); const body=await readBody(req);
      const item=readRestorable(body);
      if(!item)throw new AuthError(400,'That is not a task this can put back.');
      // A restore that finds the id already present changes nothing, so pressing
      // undo twice cannot overwrite the item it just put back.
      const restored=await dependencies.store.restoreTodoItem(id,item);
      if(!restored)throw new AuthError(404,'That task could not be put back.');
      return json(res,200,{sections:await readTodo(dependencies.store,id)});
    }
    // ---- investments ----------------------------------------------------------
    if(path==='/public/v1/investments/portfolio'&&method==='GET'){
      const id=await authenticatedAccount(req,authService);
      const payload=await readPortfolio(dependencies.store,id);
      // One reading per Eastern day, written forward. Never back-filled: nothing
      // can price a fund as of last March, so an earlier curve would be one that
      // never happened. Best effort — a portfolio must still render if the
      // history write fails.
      await dependencies.store.recordInvestmentSnapshot(id,etTodayMs2Date(),payload.totals.value,0).catch(()=>{});
      return json(res,200,payload);
    }
    if(path==='/public/v1/investments/accounts'&&method==='POST'){
      const id=await authenticatedAccount(req,authService); const body=await readBody(req);
      const label=String(body.label||'').trim();
      if(!label||label.length>80)throw new AuthError(400,'Give the account a name of 80 characters or fewer.');
      const kind=String(body.kind||'').trim()||'brokerage';
      const cashBalance=Number(body.cashBalance??0);
      if(!Number.isFinite(cashBalance))throw new AuthError(400,'Cash must be a number.');
      return json(res,201,await dependencies.store.createInvestmentAccount(id,{
        label,kind,institution:text(body.institution,120),cashBalance,note:text(body.note,500),
        active:body.active!==false,sortOrder:Number.isInteger(body.sortOrder)?Number(body.sortOrder):0}));
    }
    if(path.startsWith('/public/v1/investments/accounts/')&&(method==='PATCH'||method==='DELETE')){
      const id=await authenticatedAccount(req,authService);
      const target=decodeURIComponent(path.slice('/public/v1/investments/accounts/'.length));
      if(method==='DELETE'){
        if(!await dependencies.store.deleteInvestmentAccount(id,target))throw new AuthError(404,'No such account.');
        return json(res,200,{ok:true});
      }
      const body=await readBody(req);
      const patch:Record<string,unknown>={};
      if('label' in body){const label=String(body.label||'').trim(); if(!label||label.length>80)throw new AuthError(400,'Give the account a name of 80 characters or fewer.'); patch.label=label}
      if('kind' in body)patch.kind=String(body.kind||'').trim()||'brokerage';
      if('institution' in body)patch.institution=text(body.institution,120);
      if('note' in body)patch.note=text(body.note,500);
      if('active' in body)patch.active=body.active===true;
      if('cashBalance' in body){const cash=Number(body.cashBalance); if(!Number.isFinite(cash))throw new AuthError(400,'Cash must be a number.'); patch.cashBalance=cash}
      if('sortOrder' in body&&Number.isInteger(body.sortOrder))patch.sortOrder=Number(body.sortOrder);
      if(!await dependencies.store.updateInvestmentAccount(id,target,patch))throw new AuthError(404,'No such account.');
      return json(res,200,{ok:true});
    }
    if(path==='/public/v1/investments/holdings'&&method==='POST'){
      const id=await authenticatedAccount(req,authService); const body=await readBody(req);
      const name=String(body.name||'').trim();
      if(!name||name.length>120)throw new AuthError(400,'Give the holding a name of 120 characters or fewer.');
      const assetClass=String(body.assetClass||'');
      if(!(INVESTMENT_ASSET_CLASSES as readonly string[]).includes(assetClass))throw new AuthError(400,'That is not an asset class.');
      const quantity=Number(body.quantity??0);
      if(!Number.isFinite(quantity))throw new AuthError(400,'Quantity must be a number.');
      const manualPrice=optionalNumber(body.manualPrice,'A price');
      const holding=await dependencies.store.createInvestmentHolding(id,{
        investmentAccountId:String(body.investmentAccountId||''),
        // Nullable ON PURPOSE: a 401(k) menu is full of funds with a name and no
        // ticker, and a tracker that cannot hold one cannot hold most
        // retirement accounts.
        symbol:text(body.symbol,20),name,assetClass,quantity,
        costBasis:optionalNumber(body.costBasis,'A cost basis'),
        manualPrice,manualPriceAt:manualPrice==null?null:Date.now(),
        sector:text(body.sector,60),region:text(body.region,60),note:text(body.note,500)});
      if(!holding)throw new AuthError(404,'No such account.');
      return json(res,201,holding);
    }
    if(path.startsWith('/public/v1/investments/holdings/')&&(method==='PATCH'||method==='DELETE')){
      const id=await authenticatedAccount(req,authService);
      const target=decodeURIComponent(path.slice('/public/v1/investments/holdings/'.length));
      if(method==='DELETE'){
        if(!await dependencies.store.deleteInvestmentHolding(id,target))throw new AuthError(404,'No such holding.');
        return json(res,200,{ok:true});
      }
      const body=await readBody(req);
      const patch:Record<string,unknown>={};
      if('name' in body){const name=String(body.name||'').trim(); if(!name||name.length>120)throw new AuthError(400,'Give the holding a name of 120 characters or fewer.'); patch.name=name}
      if('assetClass' in body){const c=String(body.assetClass||''); if(!(INVESTMENT_ASSET_CLASSES as readonly string[]).includes(c))throw new AuthError(400,'That is not an asset class.'); patch.assetClass=c}
      if('quantity' in body){const q=Number(body.quantity); if(!Number.isFinite(q))throw new AuthError(400,'Quantity must be a number.'); patch.quantity=q}
      // Setting it to null CLEARS the price and makes the holding unpriced
      // again, which is a real state and not the same as pricing it at zero.
      if('manualPrice' in body)patch.manualPrice=optionalNumber(body.manualPrice,'A price');
      if('costBasis' in body)patch.costBasis=optionalNumber(body.costBasis,'A cost basis');
      for(const key of ['symbol','sector','region','note'] as const)if(key in body)patch[key]=text(body[key],key==='note'?500:60);
      if(!await dependencies.store.updateInvestmentHolding(id,target,patch))throw new AuthError(404,'No such holding.');
      return json(res,200,{ok:true});
    }
    if(path==='/public/v1/investments/transactions'&&method==='POST'){
      const id=await authenticatedAccount(req,authService); const body=await readBody(req);
      const amount=Number(body.amount);
      if(!Number.isFinite(amount))throw new AuthError(400,'An amount is a number.');
      const occurredAt=Number(body.occurredAt??Date.now());
      if(!Number.isFinite(occurredAt))throw new AuthError(400,'That is not a date.');
      const taxYear=body.taxYear==null?null:Number(body.taxYear);
      if(taxYear!==null&&(!Number.isInteger(taxYear)||taxYear<1900||taxYear>2200))throw new AuthError(400,'That is not a tax year.');
      const created=await dependencies.store.createInvestmentTransaction(id,{
        investmentAccountId:String(body.investmentAccountId||''),holdingId:text(body.holdingId,64),
        kind:String(body.kind||'').trim()||'contribution',amount,
        quantity:optionalNumber(body.quantity,'A quantity'),occurredAt,taxYear,note:text(body.note,500)});
      if(!created)throw new AuthError(404,'No such account.');
      return json(res,201,created);
    }
    if(path.startsWith('/public/v1/investments/transactions/')&&method==='DELETE'){
      const id=await authenticatedAccount(req,authService);
      const target=decodeURIComponent(path.slice('/public/v1/investments/transactions/'.length));
      if(!await dependencies.store.deleteInvestmentTransaction(id,target))throw new AuthError(404,'No such transaction.');
      return json(res,200,{ok:true});
    }
    if(path==='/public/v1/investments/goals'&&method==='POST'){
      const id=await authenticatedAccount(req,authService); const body=await readBody(req);
      const label=String(body.label||'').trim();
      if(!label||label.length>80)throw new AuthError(400,'Give the goal a name of 80 characters or fewer.');
      const targetYear=body.targetYear==null?null:Number(body.targetYear);
      if(targetYear!==null&&(!Number.isInteger(targetYear)||targetYear<1900||targetYear>2200))throw new AuthError(400,'That is not a year.');
      return json(res,201,await dependencies.store.createInvestmentGoal(id,{
        label,targetAmount:optionalNumber(body.targetAmount,'A target'),targetYear,note:text(body.note,500)}));
    }
    if(path.startsWith('/public/v1/investments/goals/')&&method==='DELETE'){
      const id=await authenticatedAccount(req,authService);
      const target=decodeURIComponent(path.slice('/public/v1/investments/goals/'.length));
      if(!await dependencies.store.deleteInvestmentGoal(id,target))throw new AuthError(404,'No such goal.');
      return json(res,200,{ok:true});
    }
    if(path.startsWith('/public/v1/ai/'))return json(res,501,{message:'Public AI is not available.'});
    return json(res,404,{message:'Public route not found.'});
  } catch(error){const status=error instanceof AuthError?error.status:Number((error as {status?:number}).status)||500;const message=status>=500?'Public service unavailable.':error instanceof Error?error.message:'Request failed.';return json(res,status,{message});}
}

const startedDirectly=process.argv[1]?import.meta.url===pathToFileURL(process.argv[1]).href:false;
if(startedDirectly){
  const server=createServer(handleRequest);
  server.listen(config.port,'0.0.0.0',()=>console.log(JSON.stringify({event:'public_api.started',port:config.port})));
}
