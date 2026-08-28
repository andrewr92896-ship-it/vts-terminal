import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { loadPublicConfig } from './config.js';
import { PublicAuthService, AuthError } from './auth.js';
import { PostgresPublicStore } from './postgresStore.js';
import { HttpPublicMarketProvider, SmtpPublicMailer } from './adapters.js';
import type { BudgetKind, FlashcardSetDetail, FlashcardSetRow, NetWorthCategory, NetWorthKind, PublicMarketProvider, PublicStore, StudyDeckDetail, StudyDeckRow, StudyGuideDetail, StudyGuideRow, TodoItemRow } from './types.js';
import { NET_WORTH_CATEGORIES } from './types.js';
import { buildSections, dailyDone, etTodayMs, nextEtMidnight } from './todo.js';
import { MAX_DECKS, MAX_DESCRIPTION, MAX_NAME, StudyError, normalizeState, readCards, readCategories,
  readCategoryWeights, readQuestions, readSlides, slidesForRead, statsFromState,
  type DeckQuestion } from './studies.js';
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
// The month a write should report back on: the one the caller is looking at,
// which is what keeps a screen's totals in step with the row it just changed.
const monthParam=(req:IncomingMessage)=>{
  const asked=new URL(req.url||'/','http://public.invalid').searchParams.get('month');
  return asked&&isMonthKey(asked)?asked:etToday().slice(0,7);
};
// Money from a client, in DOLLARS. Null stays null — for a monthly target that
// means NO TARGET, which is a real state and not the same as zero.
const readMoney=(v:unknown,what:string):number|null=>{
  if(v==null)return null;
  const n=Number(v);
  if(!Number.isFinite(n)||n<0||n>1_000_000_000)throw new AuthError(400,`${what} is a number.`);
  return n;
};
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
// 16 KB is plenty for every record family EXCEPT two, and both of them carry
// something the learner authored rather than a form somebody filled in: a study
// game's questions, and the per-deck game state. A deck with many categories
// keeps a rolling answer window for each, so a real state blob genuinely runs to
// tens of kilobytes — and the client saves progress fire-and-forget, so a cap it
// silently exceeded would stop recording somebody's progress with nothing on
// screen to say so.
const BODY_LIMIT=16_384;
// Comfortably above MAX_STATE_BYTES so the state cap is the thing that refuses a
// state, with a message that says so, rather than a body limit refusing it as
// "too large" — and roomy enough for a thousand-question import.
// A bug report is prose. Long enough for somebody to paste what they saw.
const MAX_REPORT=8_000;
const STUDY_BODY_LIMIT=2_000_000;
// A presentation carries its screenshots inline as base64 data URLs, so it is in
// a different size class again — the private side allows 25 MB for exactly this.
const GUIDE_BODY_LIMIT=25*1024*1024;
const readBody=async(req:IncomingMessage,limit=BODY_LIMIT)=>{let body='';for await(const chunk of req){body+=chunk;if(body.length>limit)throw new AuthError(413,'Request too large.')}try{return body?JSON.parse(body):{}}catch{throw new AuthError(400,'Invalid JSON.')}};
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

// Money arrives from the client as DOLLARS (what the user typed) and is stored
// as CENTS. The conversion happens exactly here, at the edge, so nothing behind
// it has to wonder which unit it is holding — the same rule the private side
// settled on, and the same reason: a budget adds the same figures up repeatedly,
// and binary floats accumulate visible error doing that.
//
// `Math.round` rather than truncation: 12.345 typed into a money field means
// 12.35 to the person typing it, and truncating would quietly lose a cent per
// entry in a feature whose whole job is adding money up.
const dollarsToCents=(v:number)=>Math.round(v*100);

// One month, with its totals ALREADY ADDED UP.
//
// The totals are computed here rather than in the client adapter, because they
// are money arithmetic and there must be exactly one definition of them. An
// adapter that summed the same rows a second way is how two screens come to
// disagree about what a month cost.
async function readBudgetMonth(store:PublicStore,accountId:string,month:string){
  const [rawCategories,entries]=await Promise.all([
    store.listBudgetCategories(accountId),
    store.listBudgetEntries(accountId,month),
  ]);
  const byCategory=new Map<string,{total:number;count:number}>();
  for(const entry of entries){
    const seen=byCategory.get(entry.categoryId)??{total:0,count:0};
    seen.total+=entry.amountCents; seen.count+=1;
    byCategory.set(entry.categoryId,seen);
  }
  // An ARCHIVED category with activity in the month being viewed is still
  // listed. Dropping it would silently change a past month's total, which is the
  // one thing a record of what you spent must never do.
  const categories=rawCategories
    .filter((c)=>!c.archived||(byCategory.get(c.id)?.count??0)>0)
    .map((c)=>({...c,actualCents:byCategory.get(c.id)?.total??0,entryCount:byCategory.get(c.id)?.count??0}));
  const names=new Map(rawCategories.map((c)=>[c.id,c]));
  let incomeCents=0,spentCents=0,plannedIncomeCents=0,plannedSpendCents=0,hasTargets=false;
  for(const c of categories){
    if(c.kind==='income'){incomeCents+=c.actualCents;plannedIncomeCents+=c.monthlyLimit??0}
    else{
      spentCents+=c.actualCents;plannedSpendCents+=c.monthlyLimit??0;
      // Null is "no target" and is NOT zero. A budget with no targets is a
      // spending log, and pretending otherwise draws every bar at 0%.
      if(c.monthlyLimit!=null)hasTargets=true;
    }
  }
  return {
    month,categories,
    entries:entries.map((e)=>{
      const c=names.get(e.categoryId);
      return {...e,categoryName:c?.name??'(removed)',kind:c?.kind??'expense'};
    }),
    incomeCents,spentCents,netCents:incomeCents-spentCents,
    plannedIncomeCents,plannedSpendCents,plannedNetCents:plannedIncomeCents-plannedSpendCents,
    hasTargets,
  };
}

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
    // `totalDays` and `asOf` are the names the portal's own Net Worth screen
    // reads. A near-miss here renders as an undefined figure rather than an
    // error, which is the kind of mismatch that reaches production intact.
    totalDays:history.length,
    asOf:Date.now(),
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

// A flashcard set and a presentation as the portal's own screens read them.
// `createdBy` is null for the same reason a deck's is: every one is the reader's
// own, so there is nobody else it could have been. Slides go out through
// `slidesForRead`, which MINTS NOTHING.
const setView=(set:FlashcardSetRow)=>({...set,createdBy:null,createdByName:null});
const setDetailView=(set:FlashcardSetDetail)=>({...setView(set),cards:set.cards});
const guideView=(guide:StudyGuideRow)=>({...guide,createdBy:null,createdByName:null});
const guideDetailView=(guide:StudyGuideDetail)=>({...guideView(guide),slides:slidesForRead(guide.slides)});

// A deck as the portal's own launcher reads it.
//
// `isSample` is FALSE and `hasLeaderboard` is FALSE on every public deck, and
// both are stated rather than omitted. `isSample` marks the terminal's built-in
// example games, and nothing is seeded here — a game nobody created must not be
// presented as one somebody did. `hasLeaderboard` is what the client keys the
// board tab on, so a false here is what hides it cleanly instead of opening an
// empty board that reads as broken.
const deckView=(deck:StudyDeckRow)=>({
  ...deck,isSample:false,hasLeaderboard:false,
  // The portal shows who made a game on a shared library. Here every game is the
  // reader's own, so there is nobody else it could have been.
  createdBy:null,createdByName:null,
});
const deckDetailView=(deck:StudyDeckDetail)=>({...deckView(deck),questions:deck.questions});

// The category list and its weights, derived together.
//
// A category list that is not supplied is READ OFF THE QUESTIONS' OWN TOPICS,
// which is what keeps the two from disagreeing: a category nothing is filed
// under is a heading with no paper behind it, and a topic with no category is a
// question that can never be drawn by a weighted test.
function deckShape(body:{categories?:unknown;categoryWeights?:unknown},questions:DeckQuestion[]){
  const asked=readCategories(body.categories);
  const fromQuestions=readCategories(questions.map((q)=>q.topic));
  const categories=asked.length>0?asked:fromQuestions;
  return {categories,categoryWeights:readCategoryWeights(body.categoryWeights,categories)};
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
      return json(res,200,await readBudgetMonth(dependencies.store,id,asked));
    }
    if(path==='/public/v1/budget/categories'&&method==='POST'){
      const id=await authenticatedAccount(req,authService); const body=await readBody(req);
      const name=String(body.name||'').trim();
      const kind=String(body.kind||'') as BudgetKind;
      if(!name||name.length>60)throw new AuthError(400,'Give the category a name of 60 characters or fewer.');
      if(kind!=='income'&&kind!=='expense')throw new AuthError(400,'A category is either income or expense.');
      // Null is "no target" and is NOT zero: a budget with no targets is a
      // spending log, and a stored 0 would draw every bar at 0% instead.
      const limit=readMoney(body.monthlyLimit,'A monthly target');
      const icon=typeof body.icon==='string'&&body.icon.trim()?body.icon.trim().slice(0,24):null;
      try{
        await dependencies.store.addBudgetCategory(id,{name,kind,monthlyLimit:limit==null?null:dollarsToCents(limit),icon});
        return json(res,201,await readBudgetMonth(dependencies.store,id,monthParam(req)));
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
        return json(res,200,await readBudgetMonth(dependencies.store,id,monthParam(req)));
      }
      const body=await readBody(req);
      if(typeof body.archived!=='boolean')throw new AuthError(400,'Say whether the category is archived.');
      const changed=await dependencies.store.archiveBudgetCategory(id,categoryId,body.archived);
      if(!changed)throw new AuthError(404,'No such category.');
      return json(res,200,await readBudgetMonth(dependencies.store,id,monthParam(req)));
    }
    if(path==='/public/v1/budget/entries'&&method==='POST'){
      const id=await authenticatedAccount(req,authService); const body=await readBody(req);
      // DOLLARS in, cents stored. One input contract, converted once at the
      // edge — the same shape the portal's own component sends.
      const amount=readMoney(body.amount,'An amount');
      if(amount==null||amount<=0)throw new AuthError(400,'An amount is a number above zero.');
      const amountCents=dollarsToCents(amount);
      if(!isCents(amountCents))throw new AuthError(400,'An amount is a number above zero.');
      const occurredOn=String(body.occurredOn||'')||etToday();
      if(!isDayKey(occurredOn))throw new AuthError(400,'A date looks like 2026-08-27.');
      const note=typeof body.note==='string'&&body.note.trim()?body.note.trim().slice(0,200):null;
      // `source` is deliberately not read from the body. It is the aggregator
      // seam, and a hand-entered row must never be able to claim it came from a
      // connected provider.
      const entry=await dependencies.store.addBudgetEntry(id,{categoryId:String(body.categoryId||''),amountCents,note,occurredOn});
      if(!entry)throw new AuthError(404,'No such category.');
      // The month the entry LANDED IN, not the one the caller happens to be
      // looking at: an entry dated last month must not report itself into this
      // month's totals. The private route resolves it the same way.
      return json(res,201,await readBudgetMonth(dependencies.store,id,occurredOn.slice(0,7)));
    }
    if(path.startsWith('/public/v1/budget/entries/')&&method==='DELETE'){
      const id=await authenticatedAccount(req,authService);
      const entryId=decodeURIComponent(path.slice('/public/v1/budget/entries/'.length));
      const gone=await dependencies.store.deleteBudgetEntry(id,entryId);
      if(!gone)throw new AuthError(404,'No such entry.');
      return json(res,200,await readBudgetMonth(dependencies.store,id,monthParam(req)));
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
      // The portal's screen reads the WHOLE net worth back from a write, so the
      // headline figure and the row it just added cannot be a request apart.
      const created=await dependencies.store.createNetWorthItem(id,readNetWorthItem(body));
      return json(res,201,{...await readNetWorth(dependencies.store,id),id:created.id});
    }
    if(path.startsWith('/public/v1/net-worth/items/')&&(method==='PATCH'||method==='DELETE')){
      const id=await authenticatedAccount(req,authService);
      const target=decodeURIComponent(path.slice('/public/v1/net-worth/items/'.length));
      if(method==='DELETE'){
        if(!await dependencies.store.deleteNetWorthItem(id,target))throw new AuthError(404,'No such item.');
        return json(res,200,await readNetWorth(dependencies.store,id));
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
      return json(res,200,await readNetWorth(dependencies.store,id));
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
    // ---- study games -----------------------------------------------------------
    //
    // THERE IS NO LEADERBOARD ROUTE, and its absence is deliberate. On the
    // private side a built-in game is ranked across every copy of itself on the
    // whole install; here that would put one visitor's display name and accuracy
    // on a stranger's screen. Every deck reports `hasLeaderboard: false`, so the
    // client hides the tab rather than opening an empty board.
    //
    // A deck belongs to ONE account and no route takes a "whose" parameter.
    if(path==='/public/v1/studies/decks'&&method==='GET'){
      const id=await authenticatedAccount(req,authService);
      const decks=await dependencies.store.listStudyDecks(id);
      return json(res,200,{decks:decks.map((deck)=>deckView(deck))});
    }
    if(path==='/public/v1/studies/decks'&&method==='POST'){
      const id=await authenticatedAccount(req,authService); const body=await readBody(req,STUDY_BODY_LIMIT);
      const name=text(body.name,MAX_NAME);
      if(!name)throw new AuthError(400,'Give the study game a name.');
      // A runaway-input guard, not a product limit.
      if((await dependencies.store.listStudyDecks(id)).length>=MAX_DECKS){
        throw new AuthError(400,`That is ${MAX_DECKS} study games already.`);
      }
      const questions=readQuestions(body.questions);
      const created=await dependencies.store.createStudyDeck(id,{
        name,description:text(body.description,MAX_DESCRIPTION),
        // 'upload' is the reviewed-questions path. `source` is server-owned:
        // nothing a client sends may claim a game was generated when the AI
        // paths are switched off.
        source:'upload',
        ...deckShape(body,questions),
        questions,
      });
      return json(res,201,{deck:deckDetailView(created),decks:(await dependencies.store.listStudyDecks(id)).map((deck)=>deckView(deck))});
    }
    if(path==='/public/v1/studies/decks/merge'&&method==='POST'){
      const id=await authenticatedAccount(req,authService); const body=await readBody(req);
      const name=text(body.name,MAX_NAME);
      if(!name)throw new AuthError(400,'Give the combined game a name.');
      const ids=Array.isArray(body.deckIds)?body.deckIds.map((v:unknown)=>String(v)):[];
      if(ids.length<2)throw new AuthError(400,'Pick at least two games to combine.');
      const sources=[];
      for(const deckId of ids){
        const deck=await dependencies.store.getStudyDeck(id,deckId);
        // Refused rather than combining what it could reach: a game silently
        // missing one of its sources is one nobody can tell is incomplete.
        if(!deck)throw new AuthError(404,'No such study game.');
        sources.push(deck);
      }
      // Renumbered from 1 across the whole set, because `seq` is identity within
      // ONE deck — carrying the originals across would collide on the way in and
      // silently drop questions.
      const questions=readQuestions(sources.flatMap((deck)=>deck.questions.map((q)=>({
        ...q,sourceName:body.tagSource===true?deck.name:null,
      }))));
      const created=await dependencies.store.createStudyDeck(id,{
        name,description:text(body.description,MAX_DESCRIPTION),source:'merge',
        // Combined DELIBERATELY UNWEIGHTED, whatever the sources carried: two
        // exam blueprints do not add up to a third, and a weight carried over
        // would score the combined game against a paper that does not exist.
        categories:readCategories(sources.flatMap((deck)=>deck.categories)),
        categoryWeights:null,
        questions,
      });
      return json(res,201,{deck:deckDetailView(created),decks:(await dependencies.store.listStudyDecks(id)).map((deck)=>deckView(deck))});
    }
    if(path.startsWith('/public/v1/studies/decks/')){
      const id=await authenticatedAccount(req,authService);
      const rest=decodeURIComponent(path.slice('/public/v1/studies/decks/'.length));
      const slash=rest.indexOf('/');
      const deckId=slash>0?rest.slice(0,slash):rest;
      const action=slash>0?rest.slice(slash+1):'';
      // 404 rather than 403 throughout: an id the caller does not own must not
      // be distinguishable from one that does not exist.
      const deck=await dependencies.store.getStudyDeck(id,deckId);
      if(!deck)throw new AuthError(404,'No such study game.');

      if(action===''&&method==='GET')return json(res,200,{deck:deckDetailView(deck)});
      if(action===''&&method==='DELETE'){
        await dependencies.store.deleteStudyDeck(id,deckId);
        return json(res,200,{decks:(await dependencies.store.listStudyDecks(id)).map((d)=>deckView(d))});
      }
      if(action===''&&method==='PATCH'){
        const body=await readBody(req,STUDY_BODY_LIMIT);
        const patch:Record<string,unknown>={};
        if('name' in body){const name=text(body.name,MAX_NAME); if(!name)throw new AuthError(400,'Give the study game a name.'); patch.name=name}
        if('description' in body)patch.description=text(body.description,MAX_DESCRIPTION);
        const questions='questions' in body?readQuestions(body.questions):undefined;
        if(questions)patch.questions=questions;
        // The categories and their weights move TOGETHER, always. A weight whose
        // category has gone would otherwise keep counting toward a denominator
        // nothing on screen can see, which is a score nobody could reconcile.
        if('categories' in body||'categoryWeights' in body){
          const shape=deckShape({categories:'categories' in body?body.categories:deck.categories,
            categoryWeights:'categoryWeights' in body?body.categoryWeights:deck.categoryWeights},
            questions??deck.questions);
          patch.categories=shape.categories; patch.categoryWeights=shape.categoryWeights;
        }else if(questions){
          // Questions replaced without a category list: re-derive it from the
          // topics that ACTUALLY ARRIVED — passing the old list here would let a
          // category survive as a heading no question is filed under, keeping its
          // weight in the denominator of a score nothing on screen explains.
          const shape=deckShape({categoryWeights:deck.categoryWeights},questions);
          patch.categories=shape.categories; patch.categoryWeights=shape.categoryWeights;
        }
        const updated=await dependencies.store.updateStudyDeck(id,deckId,patch);
        if(!updated)throw new AuthError(404,'No such study game.');
        return json(res,200,{deck:deckDetailView(updated),decks:(await dependencies.store.listStudyDecks(id)).map((d)=>deckView(d))});
      }
      if(action==='game'&&method==='GET'){
        return json(res,200,{state:await dependencies.store.getStudyDeckGame(id,deckId)});
      }
      if(action==='game'&&method==='PUT'){
        // The state is stored WHOLE and OPAQUE, exactly as the private side
        // stores it: the level ladder and streak scoring live in the client's
        // shared engine, and a second reading of them here would be a second
        // answer to what level somebody is on.
        const state=normalizeState((await readBody(req,STUDY_BODY_LIMIT)).state);
        if(state==null)throw new AuthError(400,'That is not a game state.');
        await dependencies.store.saveStudyDeckGame(id,deckId,state);
        return json(res,200,{ok:true});
      }
      if(action==='game/archive'&&method==='POST'){
        const state=normalizeState((await readBody(req,STUDY_BODY_LIMIT)).state);
        if(state==null)throw new AuthError(400,'That is not a game state.');
        // Resetting clears the live state, and this row is the only trace the run
        // happened — without it "reset progress" would quietly mean "delete my
        // history". A run with nothing answered in it is not a run and is not
        // recorded, rather than being banked as a row of zeroes.
        const stats=statsFromState(state);
        if(stats)await dependencies.store.recordStudyDeckRun(id,deckId,stats.attempted,stats.correct,stats.bestStep);
        return json(res,200,{ok:true});
      }
      throw new AuthError(404,'Public route not found.');
    }
    // ---- flashcard sets --------------------------------------------------------
    if(path==='/public/v1/studies/flashcards'&&method==='GET'){
      const id=await authenticatedAccount(req,authService);
      return json(res,200,{sets:(await dependencies.store.listFlashcardSets(id)).map(setView)});
    }
    if(path==='/public/v1/studies/flashcards'&&method==='POST'){
      const id=await authenticatedAccount(req,authService); const body=await readBody(req,STUDY_BODY_LIMIT);
      const name=text(body.name,MAX_NAME);
      if(!name)throw new AuthError(400,'Give the set a name.');
      if((await dependencies.store.listFlashcardSets(id)).length>=MAX_DECKS){
        throw new AuthError(400,`That is ${MAX_DECKS} flashcard sets already.`);
      }
      const created=await dependencies.store.createFlashcardSet(id,{
        name,description:text(body.description,MAX_DESCRIPTION),
        // Server-owned, like a study game's: the AI paths are switched off here,
        // so a set claiming to have been generated would describe something that
        // did not happen.
        source:'manual',
        cards:readCards(body.cards),
      });
      return json(res,201,{set:setDetailView(created),sets:(await dependencies.store.listFlashcardSets(id)).map(setView)});
    }
    if(path.startsWith('/public/v1/studies/flashcards/')){
      const id=await authenticatedAccount(req,authService);
      const setId=decodeURIComponent(path.slice('/public/v1/studies/flashcards/'.length));
      const set=await dependencies.store.getFlashcardSet(id,setId);
      if(!set)throw new AuthError(404,'No such flashcard set.');
      if(method==='GET')return json(res,200,{set:setDetailView(set)});
      if(method==='DELETE'){
        await dependencies.store.deleteFlashcardSet(id,setId);
        return json(res,200,{sets:(await dependencies.store.listFlashcardSets(id)).map(setView)});
      }
      if(method==='PATCH'){
        const body=await readBody(req,STUDY_BODY_LIMIT);
        const patch:Record<string,unknown>={};
        if('name' in body){const name=text(body.name,MAX_NAME); if(!name)throw new AuthError(400,'Give the set a name.'); patch.name=name}
        if('description' in body)patch.description=text(body.description,MAX_DESCRIPTION);
        if('cards' in body)patch.cards=readCards(body.cards);
        const updated=await dependencies.store.updateFlashcardSet(id,setId,patch);
        if(!updated)throw new AuthError(404,'No such flashcard set.');
        return json(res,200,{set:setDetailView(updated),sets:(await dependencies.store.listFlashcardSets(id)).map(setView)});
      }
      throw new AuthError(404,'Public route not found.');
    }
    // ---- study presentations ---------------------------------------------------
    //
    // A SLIDE'S ID IS MINTED HERE, ON WRITE ONLY, and has to round-trip through
    // the editor. Minting on read would hand out a different id every time and
    // nothing pointing at a slide could rely on it; not minting at all would make
    // every save look like a deck of brand new slides.
    if(path==='/public/v1/studies/guides'&&method==='GET'){
      const id=await authenticatedAccount(req,authService);
      return json(res,200,{guides:(await dependencies.store.listStudyGuides(id)).map(guideView)});
    }
    if(path==='/public/v1/studies/guides'&&method==='POST'){
      const id=await authenticatedAccount(req,authService); const body=await readBody(req,GUIDE_BODY_LIMIT);
      const name=text(body.name,MAX_NAME);
      if(!name)throw new AuthError(400,'Give the presentation a name.');
      if((await dependencies.store.listStudyGuides(id)).length>=MAX_DECKS){
        throw new AuthError(400,`That is ${MAX_DECKS} presentations already.`);
      }
      const created=await dependencies.store.createStudyGuide(id,{
        name,description:text(body.description,MAX_DESCRIPTION),
        slides:readSlides(body.slides,()=>randomUUID()),
      });
      return json(res,201,{guide:guideDetailView(created),guides:(await dependencies.store.listStudyGuides(id)).map(guideView)});
    }
    if(path.startsWith('/public/v1/studies/guides/')){
      const id=await authenticatedAccount(req,authService);
      const guideId=decodeURIComponent(path.slice('/public/v1/studies/guides/'.length));
      const guide=await dependencies.store.getStudyGuide(id,guideId);
      if(!guide)throw new AuthError(404,'No such presentation.');
      if(method==='GET')return json(res,200,{guide:guideDetailView(guide)});
      if(method==='DELETE'){
        await dependencies.store.deleteStudyGuide(id,guideId);
        return json(res,200,{guides:(await dependencies.store.listStudyGuides(id)).map(guideView)});
      }
      if(method==='PUT'||method==='PATCH'){
        const body=await readBody(req,GUIDE_BODY_LIMIT);
        const patch:Record<string,unknown>={};
        if('name' in body){const name=text(body.name,MAX_NAME); if(!name)throw new AuthError(400,'Give the presentation a name.'); patch.name=name}
        if('description' in body)patch.description=text(body.description,MAX_DESCRIPTION);
        if('slides' in body)patch.slides=readSlides(body.slides,()=>randomUUID());
        const updated=await dependencies.store.updateStudyGuide(id,guideId,patch);
        if(!updated)throw new AuthError(404,'No such presentation.');
        return json(res,200,{guide:guideDetailView(updated),guides:(await dependencies.store.listStudyGuides(id)).map(guideView)});
      }
      throw new AuthError(404,'Public route not found.');
    }
    // ---- support -----------------------------------------------------------------
    //
    // REPORTING A BUG IS FREE ON EVERY ACCOUNT, and these routes sit on nothing
    // but a session for that reason. A user who cannot reach help is a user who
    // cannot tell you their payment failed, so the complaints channel must never
    // sit behind the paid path or behind the AI path that is currently switched
    // off. The private side runs an AI intake conversation to draw a usable
    // description out of a person; here the report is simply what was written.
    if(path==='/public/v1/support/bugs'&&method==='GET'){
      const id=await authenticatedAccount(req,authService);
      return json(res,200,{reports:await dependencies.store.listBugReports(id)});
    }
    if(path==='/public/v1/support/bugs'&&method==='POST'){
      const id=await authenticatedAccount(req,authService);
      const body=text((await readBody(req)).body,MAX_REPORT);
      if(!body)throw new AuthError(400,'Say what went wrong.');
      // The summary is the first line, capped. Derived rather than typed: a
      // reporter should not have to title their own bug report.
      const summary=(body.split('\n')[0]||'Bug report').slice(0,140);
      return json(res,201,{report:await dependencies.store.createBugReport(id,summary,body)});
    }
    if(/^\/public\/v1\/support\/bugs\/[^/]+\/reply$/.test(path)&&method==='POST'){
      const id=await authenticatedAccount(req,authService);
      const reportId=decodeURIComponent(path.split('/')[5]!);
      const body=text((await readBody(req)).body,MAX_REPORT);
      if(!body)throw new AuthError(400,'Write something to add.');
      // Always 'user': there is no admin surface on the public side, so a client
      // must not be able to post a message that renders as staff having replied.
      const report=await dependencies.store.appendBugMessage(id,reportId,'user',body);
      if(!report)throw new AuthError(404,'No such report.');
      return json(res,200,{report});
    }
    if(path==='/public/v1/support/suggestions'&&method==='POST'){
      const id=await authenticatedAccount(req,authService);
      const body=text((await readBody(req)).body,MAX_REPORT);
      if(!body)throw new AuthError(400,'Write the suggestion.');
      return json(res,201,{suggestion:await dependencies.store.createSuggestion(id,body)});
    }
    if(path.startsWith('/public/v1/ai/'))return json(res,501,{message:'Public AI is not available.'});
    return json(res,404,{message:'Public route not found.'});
  } catch(error){
    // A study problem NAMES the thing — "Question 47 is missing option D" — and
    // is the caller's to fix, so it is a 400 rather than a fault.
    if(error instanceof StudyError)return json(res,400,{message:error.message});
    const status=error instanceof AuthError?error.status:Number((error as {status?:number}).status)||500;const message=status>=500?'Public service unavailable.':error instanceof Error?error.message:'Request failed.';return json(res,status,{message});}
}

const startedDirectly=process.argv[1]?import.meta.url===pathToFileURL(process.argv[1]).href:false;
if(startedDirectly){
  const server=createServer(handleRequest);
  server.listen(config.port,'0.0.0.0',()=>console.log(JSON.stringify({event:'public_api.started',port:config.port})));
}
