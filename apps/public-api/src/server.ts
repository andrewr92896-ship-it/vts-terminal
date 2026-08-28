import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { loadPublicConfig } from './config.js';
import { PublicAuthService, AuthError } from './auth.js';
import { PostgresPublicStore } from './postgresStore.js';
import { HttpPublicMarketProvider, SmtpPublicMailer } from './adapters.js';
import type { BudgetKind, NetWorthCategory, NetWorthKind, PublicMarketProvider, PublicStore, TodoItemRow } from './types.js';
import { NET_WORTH_CATEGORIES } from './types.js';
import { buildSections, dailyDone, etTodayMs, nextEtMidnight } from './todo.js';
import { CONFIDENCE_STATED, MAX_BODY, MAX_INSTRUMENT, MAX_PER_WEEK, MAX_REFLECTION, MAX_TITLE,
  computeStats, defaultWindow, etWeekKey, isLocked, isWeekKey, shiftWeekKey, toView, weekRange,
  type NoteDirection, type NoteKind, type NoteOutcome, type NoteRow } from './notes.js';
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
const ASSET_CATEGORIES=new Set<NetWorthCategory>(['cash','real_estate','vehicle','crypto','business','valuables','retirement_other','other_asset']);
const readNetWorthKind=(v:unknown):NetWorthKind=>{
  if(v!=='asset'&&v!=='liability')throw new AuthError(400,'An item is either an asset or a liability.');
  return v;
};
// A category has to belong to its own side. A mortgage filed as an asset would
// be added to what you own rather than subtracted, and nothing downstream could
// notice — the sign comes from `kind`, so the two must agree.
const readNetWorthCategory=(v:unknown,kind:NetWorthKind|undefined):NetWorthCategory=>{
  const category=String(v||'') as NetWorthCategory;
  if(!(NET_WORTH_CATEGORIES as readonly string[]).includes(category))throw new AuthError(400,'That is not a category.');
  if(kind&&ASSET_CATEGORIES.has(category)!==(kind==='asset'))throw new AuthError(400,`${category} is not a ${kind} category.`);
  return category;
};
const readNetWorthItem=(body:Record<string,unknown>)=>{
  const label=String(body.label||'').trim();
  if(!label||label.length>80)throw new AuthError(400,'Give it a name of 80 characters or fewer.');
  const kind=readNetWorthKind(body.kind);
  const value=Number(body.value);
  if(!Number.isFinite(value))throw new AuthError(400,'A value is a number.');
  return {
    kind,category:readNetWorthCategory(body.category,kind),label,
    // Stored positive; `kind` carries the sign.
    value:Math.abs(value),note:text(body.note,500),
    active:body.active!==false,sortOrder:Number.isInteger(body.sortOrder)?Number(body.sortOrder):0,
  };
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

// Everything you own minus everything you owe.
//
// THE TRACKED HALF IS READ, NEVER STORED. It comes from the same portfolio code
// the Investments screens use, so there is one definition of what a portfolio is
// worth rather than two that can drift and show different totals on two screens.
//
// AND AN INCOMPLETE TOTAL IS REFUSED, NOT APPROXIMATED. When the tracked side
// cannot be totalled, `netWorth` is null and the screen shows no headline figure
// — a net worth quietly missing a chunk is worse than none, because it looks
// complete. No snapshot is written in that state either, or the history gets a
// permanent dip that never happened.
//
// What makes it unavailable HERE is narrower than on the private side, which
// also has brokers that can refuse and accounts in other currencies. The public
// terminal has neither, so today the tracked half is always available — the
// branch is kept because it is the rule, not because it currently fires.
// Unpriced holdings do NOT make it unavailable: they are excluded and COUNTED,
// which is the Investments rule, and `note` is where that count is said out
// loud. Refusing the whole figure over one unpriceable 401(k) fund would make
// this screen behave differently from the same screen on the private side.
async function readNetWorth(store:PublicStore,accountId:string){
  const portfolio=await readPortfolio(store,accountId);
  const unpriced=portfolio.totals.unpricedCount;
  const tracked={
    investments:portfolio.totals.value,
    // The public terminal has no broker connections at all, so there is no
    // trading side to add. Stated rather than omitted so the screen can say so.
    trading:0,
    tradingEnabled:false,
    available:true,
    note:unpriced>0
      ? `${unpriced} ${unpriced===1?'holding is':'holdings are'} not priced, so ${unpriced===1?'it is':'they are'} not counted here.`
      : null,
  };

  const items=await store.listNetWorthItems(accountId);
  const active=items.filter((i)=>i.active);
  const assetRows=active.filter((i)=>i.kind==='asset');
  const liabilityRows=active.filter((i)=>i.kind==='liability');
  const manualAssets=assetRows.reduce((sum,i)=>sum+i.value,0);
  const liabilities=liabilityRows.reduce((sum,i)=>sum+i.value,0);
  const assets=tracked.investments+manualAssets;
  const netWorth=tracked.available?assets-liabilities:null;

  const history=await store.listNetWorthSnapshots(accountId);
  return {
    tracked,
    assets:assetRows,
    liabilities:liabilityRows,
    totals:{assets,liabilities,netWorth,manualAssets},
    history,
    daysRecorded:history.length,
  };
}

// The whole Trading Notes screen from ONE read.
//
// The board, the queue, the record and the observations are all views of the
// same set of rows, so they are derived from a single list rather than fetched
// separately: four reads of a moving table can disagree with each other, and a
// screen whose record says 12 calls above a board showing 13 is worse than a
// slower one.
//
// `tradeLinks` is ALWAYS EMPTY and that is not a stub. On the private side it
// answers "did you trade your own call" from the trader's own positions; the
// public terminal has no broker connections and no positions at all, so there is
// nothing to match against. Returning [] says "no matches" honestly; inventing
// one would be the exact failure the rest of this file is written against.
async function readNotes(store:PublicStore,accountId:string,owner:string,weekKeyParam:string|null){
  const now=Date.now();
  const key=weekKeyParam&&isWeekKey(weekKeyParam)?weekKeyParam:etWeekKey(new Date(now));
  const rows=await store.listTradingNotes(accountId);
  const view=(row:NoteRow)=>toView(row,accountId,owner,now);
  const range=weekRange(key);
  const predictions=rows.filter((r)=>r.kind==='prediction');
  return {
    week:{
      weekKey:key,startsOn:range.startsOn,endsOn:range.endsOn,
      prevWeek:shiftWeekKey(key,-1),nextWeek:shiftWeekKey(key,1),
      isCurrent:key===etWeekKey(new Date(now)),
      notes:rows.filter((r)=>r.weekKey===key).map(view),
    },
    // Everything still owed an answer: past its deadline with no outcome, or
    // settled with no reflection. Soonest deadline first.
    queue:predictions
      .filter((r)=>(r.outcome==null&&r.deadlineAt!=null&&r.deadlineAt<=now)||(r.outcome!=null&&!r.reflection))
      .sort((a,b)=>(a.deadlineAt??0)-(b.deadlineAt??0))
      .map(view),
    stats:computeStats(rows),
    observations:rows.filter((r)=>r.kind==='observation').slice(0,60).map(view),
    tradeLinks:[],
  };
}

// A confidence is 1-5 or nothing. Anything outside that is read as UNSTATED
// rather than clamped into the nearest level: clamping would put a call in a
// calibration bucket its author never chose, and the whole point of the table is
// comparing what somebody SAID with what happened.
const readConfidence=(v:unknown):number|null=>{
  if(v==null)return null;
  const n=Math.round(Number(v));
  return Number.isFinite(n)&&CONFIDENCE_STATED[n]!=null?n:null;
};
// Only up/down, deliberately: those are the two a price feed can settle without
// being told what "flat" means for this instrument. A rangebound call is written
// freeform and settled by its author, which is honest.
const readDirection=(v:unknown):NoteDirection|null=>v==='up'||v==='down'?v:null;
const readOutcome=(v:unknown):NoteOutcome=>{
  if(v==='hit'||v==='miss'||v==='partial'||v==='unsettleable')return v;
  throw new AuthError(400,'An outcome is hit, miss, partial, or unsettleable.');
};

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
    // ---- net worth -------------------------------------------------------------
    if(path==='/public/v1/net-worth'&&method==='GET'){
      const id=await authenticatedAccount(req,authService);
      const payload=await readNetWorth(dependencies.store,id);
      // Only when the figure is actually complete, and only when there is
      // something to record. A snapshot taken while the tracked side was
      // incomplete would put a permanent dip in the history that never happened.
      if(payload.totals.netWorth!=null&&(payload.totals.assets>0||payload.totals.liabilities>0)){
        await dependencies.store.recordNetWorthSnapshot(id,etTodayMs2Date(),
          payload.totals.assets,payload.totals.liabilities,payload.totals.netWorth).catch(()=>{});
      }
      return json(res,200,payload);
    }
    if(path==='/public/v1/net-worth/items'&&method==='POST'){
      const id=await authenticatedAccount(req,authService); const body=await readBody(req);
      return json(res,201,await dependencies.store.createNetWorthItem(id,readNetWorthItem(body)));
    }
    if(path.startsWith('/public/v1/net-worth/items/')&&(method==='PATCH'||method==='DELETE')){
      const id=await authenticatedAccount(req,authService);
      const target=decodeURIComponent(path.slice('/public/v1/net-worth/items/'.length));
      if(method==='DELETE'){
        if(!await dependencies.store.deleteNetWorthItem(id,target))throw new AuthError(404,'No such item.');
        return json(res,200,{ok:true});
      }
      const body=await readBody(req);
      const patch:Record<string,unknown>={};
      if('label' in body){const label=String(body.label||'').trim(); if(!label||label.length>80)throw new AuthError(400,'Give it a name of 80 characters or fewer.'); patch.label=label}
      if('kind' in body)patch.kind=readNetWorthKind(body.kind);
      if('category' in body)patch.category=readNetWorthCategory(body.category,('kind' in body?patch.kind:undefined) as NetWorthKind|undefined);
      if('value' in body){const value=Number(body.value); if(!Number.isFinite(value))throw new AuthError(400,'A value is a number.'); patch.value=Math.abs(value)}
      if('note' in body)patch.note=text(body.note,500);
      if('active' in body)patch.active=body.active===true;
      if('sortOrder' in body&&Number.isInteger(body.sortOrder))patch.sortOrder=Number(body.sortOrder);
      if(!await dependencies.store.updateNetWorthItem(id,target,patch))throw new AuthError(404,'No such item.');
      return json(res,200,{ok:true});
    }
    // ---- trading notes ---------------------------------------------------------
    //
    // THERE IS NO VISIBILITY ROUTE HERE, and its absence is the feature. The
    // public terminal has no groups, so a call is the author's own and nothing
    // in this API can publish, share, copy, route or distribute one — absent
    // from the routes rather than hidden behind a guard somebody has to
    // remember.
    //
    // Everything else about the record survives: a call freezes once its window
    // opens and only its reflection may be written afterwards, a verdict is
    // given once, and `unsettleable` is a real answer that is never scored.
    if(path==='/public/v1/notes'&&method==='GET'){
      const id=await authenticatedAccount(req,authService);
      const account=await dependencies.store.findAccountById(id);
      const week=new URL(req.url||'/','http://public.invalid').searchParams.get('week');
      return json(res,200,await readNotes(dependencies.store,id,account?.displayName??'You',week));
    }
    if(path==='/public/v1/notes'&&method==='POST'){
      const id=await authenticatedAccount(req,authService); const body=await readBody(req);
      const account=await dependencies.store.findAccountById(id);
      const title=text(body.title,MAX_TITLE);
      if(!title)throw new AuthError(400,'A note needs a title.');
      const kind:NoteKind=body.kind==='observation'?'observation':'prediction';
      const weekKey=typeof body.weekKey==='string'&&isWeekKey(body.weekKey)?body.weekKey:etWeekKey();
      // A runaway-input guard, not a product limit.
      if(await dependencies.store.countTradingNotesInWeek(id,weekKey)>=MAX_PER_WEEK){
        throw new AuthError(400,`That is ${MAX_PER_WEEK} notes in one week already.`);
      }
      const prediction=kind==='prediction';
      const window=defaultWindow(weekKey);
      const windowOpensAt=prediction?(optionalNumber(body.windowOpensAt,'A window')??window.opensAt):null;
      const deadlineAt=prediction?(optionalNumber(body.deadlineAt,'A deadline')??window.deadlineAt):null;
      if(prediction&&windowOpensAt!=null&&deadlineAt!=null&&deadlineAt<=windowOpensAt){
        throw new AuthError(400,'A prediction has to settle after its window opens.');
      }
      const created=await dependencies.store.createTradingNote(id,{
        kind,title,body:text(body.body,MAX_BODY),instrument:text(body.instrument,MAX_INSTRUMENT),
        direction:prediction?readDirection(body.direction):null,
        targetPrice:prediction?optionalNumber(body.targetPrice,'A target price'):null,
        confidence:prediction?readConfidence(body.confidence):null,
        weekKey,windowOpensAt,deadlineAt,
        // Nothing here can share a call, so nothing here stamps a lock. A call
        // still freezes on its own when its window opens — see isLocked.
        lockedAt:null,
      });
      return json(res,201,{note:toView(created,id,account?.displayName??'You',Date.now())});
    }
    if(path.startsWith('/public/v1/notes/')&&(method==='PATCH'||method==='DELETE'||method==='POST')){
      const id=await authenticatedAccount(req,authService);
      const account=await dependencies.store.findAccountById(id);
      const owner=account?.displayName??'You';
      const rest=decodeURIComponent(path.slice('/public/v1/notes/'.length));
      const slash=rest.lastIndexOf('/');
      const action=slash>0?rest.slice(slash+1):'';
      const noteId=action==='settle'||action==='reflect'?rest.slice(0,slash):rest;
      // 404 rather than 403 throughout: an id the caller does not own must not
      // be distinguishable from one that does not exist, or it can be probed for.
      const row=await dependencies.store.getTradingNote(id,noteId);
      if(!row)throw new AuthError(404,'Note not found.');
      const now=Date.now();

      if(method==='DELETE'){
        await dependencies.store.deleteTradingNote(id,noteId);
        return json(res,200,{ok:true});
      }

      if(method==='POST'&&action==='settle'){
        if(row.kind!=='prediction')throw new AuthError(400,'Only a prediction is settled.');
        // Settling twice would let a verdict be revised after the fact, which is
        // the same hole the lock closes on the call itself.
        if(row.outcome!=null)throw new AuthError(400,'That call is already settled.');
        const settleBody=await readBody(req);
        const outcome=readOutcome(settleBody.outcome);
        // A reflection may arrive with the verdict, which is how the screen
        // settles and reflects in one press. Absent, the note stays in the queue
        // owing one, which is correct rather than a gap.
        const reflection=text(settleBody.reflection,MAX_REFLECTION);
        const patch={outcome,settledAt:now,settledBy:'self' as const,
          ...(reflection?{reflection,reflectedAt:now}:{})};
        await dependencies.store.updateTradingNote(id,noteId,patch);
        return json(res,200,{note:toView({...row,...patch,updatedAt:now},id,owner,now)});
      }

      if(method==='POST'&&action==='reflect'){
        // Deliberately the ONE thing that stays editable on a locked call:
        // looking back at a call is something you do more than once, and nothing
        // about the record depends on the reflection being fixed.
        const reflection=text((await readBody(req)).reflection,MAX_REFLECTION);
        const patch={reflection,reflectedAt:reflection?now:null};
        await dependencies.store.updateTradingNote(id,noteId,patch);
        return json(res,200,{note:toView({...row,...patch,updatedAt:now},id,owner,now)});
      }

      if(method==='PATCH'){
        // RULE 1. Everything below this line is the call itself, and the call is
        // what must not change once the week has started. A call rewritten
        // mid-week is not the call that was made.
        if(row.kind==='prediction'&&isLocked(row,now)){
          throw new AuthError(409,'This call is locked. You can still add a reflection to it.');
        }
        const body=await readBody(req);
        const patch:Record<string,unknown>={};
        if('title' in body){const t=text(body.title,MAX_TITLE); if(!t)throw new AuthError(400,'A note needs a title.'); patch.title=t}
        if('body' in body)patch.body=text(body.body,MAX_BODY);
        if('instrument' in body)patch.instrument=text(body.instrument,MAX_INSTRUMENT);
        if(row.kind==='prediction'){
          if('direction' in body)patch.direction=readDirection(body.direction);
          if('targetPrice' in body)patch.targetPrice=optionalNumber(body.targetPrice,'A target price');
          if('confidence' in body)patch.confidence=readConfidence(body.confidence);
          if('windowOpensAt' in body)patch.windowOpensAt=optionalNumber(body.windowOpensAt,'A window');
          if('deadlineAt' in body)patch.deadlineAt=optionalNumber(body.deadlineAt,'A deadline');
        }
        await dependencies.store.updateTradingNote(id,noteId,patch);
        return json(res,200,{note:toView({...row,...patch,updatedAt:now} as NoteRow,id,owner,now)});
      }
      throw new AuthError(404,'Public route not found.');
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
