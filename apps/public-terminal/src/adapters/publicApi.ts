type MarketDataLayout={pinned:string[];hidden:string[];custom:Array<Record<string,unknown>>};
type MarketDataPayload={groups:Array<{key:string;label:string}>;series:Array<Record<string,unknown>>;periods:string[];defaultPins:string[];meetings:string[];meetingYear:number;sampleValues:boolean};
type MarketNewsData={aiTagging:boolean;headlines:Array<Record<string,unknown>>;calendar:Array<Record<string,unknown>>};
import { isDemo, publicRequest } from '../../../web/src/public/PublicRuntime';
import { demoCall } from '../demo/demoStore';

export class ApiError extends Error { constructor(public status:number,message:string){super(message)} }

const changes=(day:string,week:string,month:string,ytd:string,year:string):[string,string,string,string,string]=>[day,week,month,ytd,year];
const review=(body:string,last='continuous',next='')=>({body,last,next});
const series:MarketDataPayload['series']=[
  {id:'fed-target',group:'policy',label:'Fed funds target',value:'3.50–3.75',unit:'%',asOf:'Aug 26',source:'live',money:false,session:null,changes:changes('0.00','0.00','0.00','−0.75','−0.75'),review:review('FOMC','fomc-prev','fomc'),sample:false},
  {id:'cut-odds',group:'policy',label:'Next meeting cut odds',value:'78',unit:'%',asOf:'implied · 1-week change',source:'manual',money:false,session:null,changes:changes('+2','+6','+18','+41','+63'),review:review('CME FedWatch'),sample:true},
  {id:'cpi-yoy',group:'inflation',label:'CPI Y/Y · 1-YR inflation',value:'3.3',unit:'%',asOf:'Jul',source:'live',money:false,session:null,changes:changes('0.0','0.0','−0.2','+0.7','+0.6'),review:review('BLS','2026-07-14','2026-09-11'),sample:false},
  {id:'cpi-ytd',group:'inflation',label:'CPI year to date',value:'2.1',unit:'%',asOf:'Jul',source:'live',money:false,session:null,changes:changes('0.0','0.0','+0.1','+0.6','+0.6'),review:review('BLS','2026-07-14','2026-09-11'),sample:false},
  {id:'claims',group:'labor',label:'Initial jobless claims',value:'231',unit:'k',asOf:'Aug 20',source:'live',money:false,session:null,changes:changes('+3','+3','−8','+12','+7'),review:review('DOL','2026-08-20','2026-08-27'),sample:false},
  {id:'ten-year',group:'yields',label:'10Y Treasury',value:'4.18',unit:'%',asOf:'Aug 26',source:'live',money:false,session:null,changes:changes('+0.03','−0.05','−0.16','−0.27','+0.05'),review:review('U.S. Treasury','daily',''),sample:false},
  {id:'eurusd',group:'fx',label:'EUR/USD',value:'1.16580',unit:'',asOf:'10:00 PM ET',source:'live',money:false,session:null,changes:changes('+0.04%','+0.22%','+0.86%','+3.42%','+4.10%'),review:review('Public quote feed'),sample:false},
  {id:'gbpusd',group:'fx',label:'GBP/USD',value:'1.35934',unit:'',asOf:'10:00 PM ET',source:'live',money:false,session:null,changes:changes('−0.03%','+0.14%','+0.78%','+2.61%','+3.22%'),review:review('Public quote feed'),sample:false},
  {id:'gold',group:'commod',label:'Gold spot',value:'4,640.82',unit:'USD',asOf:'10:00 PM ET',source:'live',money:true,session:null,changes:changes('+1.00%','+1.82%','+4.30%','+14.2%','+18.6%'),review:review('Public quote feed'),sample:false},
  {id:'btc',group:'crypto',label:'Bitcoin',value:'112,420',unit:'USD',asOf:'10:00 PM ET',source:'live',money:true,session:null,changes:changes('+0.62%','−1.20%','+5.80%','+22.4%','+41.1%'),review:review('Public quote feed'),sample:false},
  {id:'spx',group:'equity',label:'S&P 500',value:'6,482.9',unit:'',asOf:'close',source:'live',money:false,session:null,changes:changes('+0.31%','+0.74%','+2.18%','+9.4%','+13.2%'),review:review('Public quote feed'),sample:false},
  {id:'vix',group:'macro',label:'VIX',value:'14.82',unit:'',asOf:'close',source:'live',money:false,session:null,changes:changes('−0.48','−1.10','−2.36','−3.20','−1.08'),review:review('Cboe','daily',''),sample:false},
  {id:'new-york',group:'session',label:'New York session',value:'',unit:'',asOf:'Eastern',source:'live',money:false,session:[480,1020],changes:changes('—','—','—','—','—'),review:review('Market hours'),sample:false},
];
const marketDataPayload:MarketDataPayload={groups:[{key:'policy',label:'Policy & rates'},{key:'inflation',label:'Inflation'},{key:'labor',label:'Labor & growth'},{key:'yields',label:'Yields & curve'},{key:'fx',label:'FX & dollar'},{key:'commod',label:'Commodities'},{key:'crypto',label:'Crypto'},{key:'equity',label:'Indices & volatility'},{key:'macro',label:'Macro & liquidity'},{key:'session',label:'Sessions'}],series,periods:['1D','1W','1M','YTD','1Y'],defaultPins:['fed-target','cut-odds','cpi-yoy','cpi-ytd'],meetings:['09-16','10-28','12-09'],meetingYear:2026,sampleValues:true};
const now=Date.now();
const marketNewsData:MarketNewsData={aiTagging:false,headlines:[
  {id:'n1',title:'Treasury yields ease as investors review inflation data',body:'The moves were modest in early trading as participants assessed the path for rates.',tradeNote:null,source:'Fictional Wire',url:null,category:'markets',impact:'medium',bias:'neutral',publishedAt:now-12*60_000},
  {id:'n2',title:'New orders and activity readings arrive ahead of the opening bell',body:'A compact look at the releases and figures markets are watching.',tradeNote:null,source:'Fictional Wire',url:null,category:'economic',impact:'medium',bias:'neutral',publishedAt:now-31*60_000},
  {id:'n3',title:'Chipmakers lead index futures after a stronger outlook',body:'Semiconductor shares moved higher while broader futures held near flat.',tradeNote:null,source:'Fictional Wire',url:null,category:'markets',impact:'low',bias:'neutral',publishedAt:now-52*60_000},
],calendar:[
  {id:'e1',title:'Initial jobless claims',country:'USD',impact:'high',eventTime:now+28*60_000,forecast:'229K',previous:'228K',actual:null,explainer:'Weekly labor-market reading.',source:'Fictional calendar'},
  {id:'e2',title:'Pending home sales',country:'USD',impact:'medium',eventTime:now+118*60_000,forecast:'0.4%',previous:'0.1%',actual:null,explainer:'Monthly housing activity.',source:'Fictional calendar'},
  {id:'e3',title:'Consumer confidence',country:'USD',impact:'medium',eventTime:now+24*3600_000,forecast:'98.2',previous:'97.6',actual:null,explainer:'Survey-based confidence index.',source:'Fictional calendar'},
]};
let layout:MarketDataLayout={pinned:[...marketDataPayload.defaultPins],hidden:[],custom:[]};

const baseApi={
  async marketData(){return isDemo()?structuredClone(marketDataPayload):publicRequest<MarketDataPayload>('/market-data')},
  async marketNews(){return isDemo()?structuredClone(marketNewsData):publicRequest<MarketNewsData>('/market-news')},
  async marketDataLayout(){return isDemo()?{layout:structuredClone(layout)}:publicRequest<{layout:MarketDataLayout}>('/market-data/layout')},
  async saveMarketDataLayout(next:MarketDataLayout){if(isDemo()){layout=structuredClone(next);return {layout:structuredClone(layout)}}return publicRequest<{layout:MarketDataLayout}>('/market-data/layout',{method:'PUT',body:JSON.stringify(next)})},
  // The whole MarketNewsStreams shape, not just the catalog: the screen reads
  // `watching`, `notify` and `cols` straight off it and a missing array is a
  // render crash rather than an empty wall.
  async marketNewsStreams(){return {streams:{channels:[],watching:[],docked:null,cols:2,notify:{},maxWatching:1},liveConfigured:false}},

};

// ---- The record families that have real storage ----------------------------
//
// WITHOUT THESE, EVERY ONE OF THEM 404s ON A REAL ACCOUNT. The proxy below
// sends any name it does not recognise to `/records/<name>`, which the public
// API has never served — so a signed-in visitor's budget, to-do list,
// portfolio, net worth and predictions would all fail while the storage behind
// them sat there working. It is invisible today only because nothing but the
// demo has ever run, and the demo answers out of module memory.
//
// THE DEMO IS CHECKED FIRST, in the proxy below, and that ordering is the whole
// reason these live in their own map rather than beside `marketData`. Anything
// on `baseApi` is returned before the demo branch is reached, so a record
// method there would try to reach a service the demo deliberately cannot talk
// to — and the showcase would break on the one path that is actually running.
//
// Each entry maps ONE portal call to the route that already exists. Nothing
// here computes a total or reshapes a payload: the server sends the shape the
// portal component reads, so an adapter doing arithmetic would be a second
// definition of a figure that must have exactly one.
const monthQuery=(month?:string)=>month?`?month=${encodeURIComponent(month)}`:'';
const liveRecords:Record<string,(...args:any[])=>Promise<unknown>>={
  budgetMonth:(month?:string)=>publicRequest(`/budget${monthQuery(month)}`),
  addBudgetCategory:(input:unknown)=>publicRequest('/budget/categories',{method:'POST',body:JSON.stringify(input)}),
  updateBudgetCategory:(id:string,patch:unknown,month?:string)=>publicRequest(`/budget/categories/${encodeURIComponent(id)}${monthQuery(month)}`,{method:'PATCH',body:JSON.stringify(patch)}),
  removeBudgetCategory:(id:string,month?:string)=>publicRequest(`/budget/categories/${encodeURIComponent(id)}${monthQuery(month)}`,{method:'DELETE'}),
  addBudgetEntry:(input:unknown)=>publicRequest('/budget/entries',{method:'POST',body:JSON.stringify(input)}),
  removeBudgetEntry:(id:string,month?:string)=>publicRequest(`/budget/entries/${encodeURIComponent(id)}${monthQuery(month)}`,{method:'DELETE'}),

  getTodo:()=>publicRequest('/todo'),
  addTodoItem:(sectionId:string,text:string)=>publicRequest('/todo/items',{method:'POST',body:JSON.stringify({sectionId,text})}),
  toggleTodoItem:(id:string)=>publicRequest(`/todo/items/${encodeURIComponent(id)}/toggle`,{method:'PATCH'}),
  removeTodoItem:(id:string)=>publicRequest(`/todo/items/${encodeURIComponent(id)}`,{method:'DELETE'}),
  restoreTodoItem:(item:unknown)=>publicRequest('/todo/items/restore',{method:'POST',body:JSON.stringify(item)}),

  // An investments write answers with the row it touched; the portal's screens
  // read the WHOLE portfolio back. So a write is followed by a fresh read
  // rather than by a locally patched copy — the totals, the allocation and the
  // unpriced count are all derived, and re-deriving them here would be a second
  // answer to "what is this portfolio worth".
  investmentPortfolio:()=>publicRequest('/investments/portfolio'),
  createInvestmentAccount:async(input:unknown)=>({id:(await publicRequest<{id:string}>('/investments/accounts',{method:'POST',body:JSON.stringify(input)})).id,portfolio:await publicRequest('/investments/portfolio')}),
  updateInvestmentAccount:async(id:string,patch:unknown)=>{await publicRequest(`/investments/accounts/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(patch)});return {portfolio:await publicRequest('/investments/portfolio')}},
  deleteInvestmentAccount:async(id:string)=>{await publicRequest(`/investments/accounts/${encodeURIComponent(id)}`,{method:'DELETE'});return {portfolio:await publicRequest('/investments/portfolio')}},
  createInvestmentHolding:async(input:unknown)=>({id:(await publicRequest<{id:string}>('/investments/holdings',{method:'POST',body:JSON.stringify(input)})).id,portfolio:await publicRequest('/investments/portfolio')}),
  updateInvestmentHolding:async(id:string,patch:unknown)=>{await publicRequest(`/investments/holdings/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(patch)});return {portfolio:await publicRequest('/investments/portfolio')}},
  deleteInvestmentHolding:async(id:string)=>{await publicRequest(`/investments/holdings/${encodeURIComponent(id)}`,{method:'DELETE'});return {portfolio:await publicRequest('/investments/portfolio')}},
  createInvestmentTransaction:(input:unknown)=>publicRequest('/investments/transactions',{method:'POST',body:JSON.stringify(input)}),
  deleteInvestmentTransaction:(id:string)=>publicRequest(`/investments/transactions/${encodeURIComponent(id)}`,{method:'DELETE'}),
  createInvestmentGoal:(input:unknown)=>publicRequest('/investments/goals',{method:'POST',body:JSON.stringify(input)}),
  deleteInvestmentGoal:(id:string)=>publicRequest(`/investments/goals/${encodeURIComponent(id)}`,{method:'DELETE'}),

  netWorth:()=>publicRequest('/net-worth'),
  createNetWorthItem:(input:unknown)=>publicRequest('/net-worth/items',{method:'POST',body:JSON.stringify(input)}),
  updateNetWorthItem:(id:string,patch:unknown)=>publicRequest(`/net-worth/items/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(patch)}),
  deleteNetWorthItem:(id:string)=>publicRequest(`/net-worth/items/${encodeURIComponent(id)}`,{method:'DELETE'}),

  tradingNotes:(week?:string)=>publicRequest(week?`/notes?week=${encodeURIComponent(week)}`:'/notes'),
  createNote:(input:unknown)=>publicRequest('/notes',{method:'POST',body:JSON.stringify(input)}),
  updateNote:(id:string,patch:unknown)=>publicRequest(`/notes/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(patch)}),
  settleNote:(id:string,outcome:string,reflection?:string|null)=>publicRequest(`/notes/${encodeURIComponent(id)}/settle`,{method:'POST',body:JSON.stringify({outcome,reflection})}),
  reflectOnNote:(id:string,reflection:string)=>publicRequest(`/notes/${encodeURIComponent(id)}/reflect`,{method:'POST',body:JSON.stringify({reflection})}),
  removeNote:(id:string)=>publicRequest(`/notes/${encodeURIComponent(id)}`,{method:'DELETE'}),

  // Study games. `confirmStudyDeck` is the REVIEWED-QUESTIONS path and is the
  // only way a game is created here — every AI route (generate, preview,
  // categorize, audit) is refused by name in the proxy below until the provider
  // migration, so nothing on this path implies a capability that is not wired.
  studyDecks:()=>publicRequest('/studies/decks'),
  studyDeck:(id:string)=>publicRequest(`/studies/decks/${encodeURIComponent(id)}`),
  confirmStudyDeck:(input:unknown)=>publicRequest('/studies/decks',{method:'POST',body:JSON.stringify(input)}),
  updateStudyDeck:(id:string,patch:unknown)=>publicRequest(`/studies/decks/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(patch)}),
  deleteStudyDeck:(id:string)=>publicRequest(`/studies/decks/${encodeURIComponent(id)}`,{method:'DELETE'}),
  mergeStudyDecks:(input:unknown)=>publicRequest('/studies/decks/merge',{method:'POST',body:JSON.stringify(input)}),
  studyDeckGame:(id:string)=>publicRequest(`/studies/decks/${encodeURIComponent(id)}/game`),
  saveStudyDeckGame:(id:string,state:string)=>publicRequest(`/studies/decks/${encodeURIComponent(id)}/game`,{method:'PUT',body:JSON.stringify({state})}),
  archiveStudyDeckGame:(id:string,state:string)=>publicRequest(`/studies/decks/${encodeURIComponent(id)}/game/archive`,{method:'POST',body:JSON.stringify({state})}),
};



const emptyTradeSummary=()=>({total:0,open:0,closed:0,wins:0,losses:0,breakeven:0,winRate:0,totalRealizedPl:0,totalUnrealizedPl:0,avgSlippage:null});
const emptyExcluded=()=>({beforeCutoff:0,belowFloor:0,cutoffFrom:null});
const emptyCapitalTotal=()=>({value:null,mode:'none',stated:0,unstated:0,mixedCurrency:false});

const evidenceEmpty=(name:string):any=>{
 const table:Record<string,any>={
  // Each entry is the REAL payload shape for that call, not an approximation.
  // The evidence build renders these through the portal's own components, so a
  // missing array or a renamed field is a thrown TypeError and a blank page —
  // and a blank page still passes a screenshot test that only asserts the root
  // is visible. Every fixture below is written against the shared payload types.
  tradeLog:{trades:[],summary:emptyTradeSummary(),breakEvenPct:0,breakEvenMode:'percent',breakEvenAmount:0,breakEvenOverrides:[],minTradeUnits:0,excluded:emptyExcluded(),canDeleteAny:false},
  tradeHistory:{trades:[],summary:{...emptyTradeSummary(),byStrategy:[],byInstrument:[]},breakEvenPct:0,breakEvenMode:'percent',breakEvenAmount:0,breakEvenOverrides:[],minTradeUnits:0,excluded:emptyExcluded(),canDeleteAny:false},
  deskSettings:{breakEvenMode:'percent',breakEvenPct:0,breakEvenAmount:0,breakEvenOverrides:[],minTradeUnits:0,instruments:[],editableMembers:[]},
  traderCapital:{userId:null,traders:1,deposited:emptyCapitalTotal(),withdrawn:emptyCapitalTotal(),breakdown:[],total:null,accounts:0,unreadable:0,currency:null,canSync:false,syncedAt:null,otherTransfers:0,note:null,canEdit:false},
  deletedTrades:{trades:[],canDeleteAny:false},restoreDeletedTrade:{trades:[],canDeleteAny:false},
  funded:{accounts:[],fundedTileColor:null},
  investmentPortfolio:{accounts:[],holdings:[],allocation:[],performance:[],dividends:[],contributions:[],goals:[],projections:[],totals:{},unpricedCount:0},
  investmentProjection:{points:[],startValue:0,monthlyContribution:0,annualRatePct:0,years:0},
  generalNews:{headlines:[],source:null},getTodo:{sections:[{id:'public-todo',title:'To Do',tag:'trading',items:[]}]},
  netWorth:{tracked:{investments:0,trading:0,tradingEnabled:false,available:true,note:null},assets:[],liabilities:[],totals:{assets:0,liabilities:0,netWorth:0,manualAssets:0},history:[],totalDays:0,asOf:Date.now()},
  budgetMonth:{month:new Date().toISOString().slice(0,7),categories:[],entries:[],incomeCents:0,spentCents:0,netCents:0,plannedIncomeCents:0,plannedSpendCents:0,plannedNetCents:0,hasTargets:false},
  listStudyPackages:{packages:[]},sharedStudyPackages:{pending:[],accepted:[]},browseStudyLibrary:{entries:[]},
  studyFlashcardSets:{sets:[]},teamFlashcardSets:{sets:[]},studyGuides:{guides:[]},
  studyDecks:{decks:[]},studyGames:{decks:[]},siteContent:{howto:{}},patchNotes:{notes:[]},
  announcements:{announcements:[],canManage:false},myBugReports:{reports:[]},bugReports:{reports:[]}
 };return structuredClone(table[name]??{ok:true,items:[],records:[]});
};
export const api:any=new Proxy(baseApi as any,{get(target,key:string){if(key in target)return target[key];return async(...args:any[])=>{
 // AI fails closed EVERYWHERE until the separate provider migration, demo
 // included: a showcase must never imply a capability that is not wired.
 if(/(import|extract|chat|generate|analyze|audit|categorize|preview|fixture|tutor)/i.test(key)||/^ai/i.test(key))throw new ApiError(501,'AI features are moving to a new provider and are switched off in the public terminal.');
 // The DEMO comes first, always. It is the showcase, it answers out of module
 // memory, and `publicRequest` refuses to reach the service from inside it.
 if(isDemo()){const answered=demoCall(key,args);return answered.handled?answered.value:evidenceEmpty(key)}
 // Then the families that have real storage behind them.
 const live=liveRecords[key];
 if(live)return live(...args);
 // Everything else is still demo-only. `/records/<name>` is not a route the
 // public API serves, so this is a 404 that SAYS the feature has no public
 // storage yet, rather than a screen that silently renders nothing.
 const write=/^(add|create|update|save|remove|delete|restore|toggle|send|reply|archive|unarchive|withdraw|submit|respond|share|revoke)/.test(key);
 return publicRequest('/records/'+encodeURIComponent(key),{method:write?'POST':'GET',body:write?JSON.stringify({args}):undefined});
}}});
