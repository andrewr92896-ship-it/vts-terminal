type MarketDataLayout={pinned:string[];hidden:string[];custom:Array<Record<string,unknown>>};
type MarketDataPayload={groups:Array<{key:string;label:string}>;series:Array<Record<string,unknown>>;periods:string[];defaultPins:string[];meetings:string[];meetingYear:number;meetingDates:string[];sampleValues:boolean};
type MarketNewsData={aiTagging:boolean;headlines:Array<Record<string,unknown>>;calendar:Array<Record<string,unknown>>};
import { isDemo, publicRequest } from '../../../web/src/public/PublicRuntime';
import { DEMO_SCREENSHOT_METHODS, demoCall } from '../demo/demoStore';

export class ApiError extends Error { constructor(public status:number,message:string){super(message)} }

const changes=(day:string,week:string,month:string,ytd:string,year:string):[string,string,string,string,string]=>[day,week,month,ytd,year];
const review=(body:string,last='',next='')=>({body,last,next});

// THE FALLBACK BOARD, AND EVERY ROW ON IT SAYS SAMPLE.
//
// The live board is read by the public terminal's own server and fetched below.
// This is what is drawn while that request is in flight, and what stays if it
// fails — so it must never be mistaken for a reading.
//
// It used to be the whole board, and it was marked `source:'live'` with
// `sample:false` on frozen literals: during a demonstration it showed a Fed
// target policy had moved past and review dates a month gone, wearing the live
// styling. That is the one thing this repository forbids outright — a figure
// nobody measured reported as a measured one — and it was on the first screen a
// prospective customer sees. Every row here is `sample:true` now, which is what
// draws the grey Sample dot and what makes `sampleValues` true.
//
// KEEP THE IDS IN STEP WITH `server/marketFeed.mjs`. The live payload replaces
// this wholesale, so an id here that is not in the catalog is a row that appears
// only when the feed is down — which is the one moment nobody is checking.
const fallbackSeries:MarketDataPayload['series']=[
  {id:'ffr',group:'policy',label:'Fed funds target',value:'3.75–4.00',unit:'%',asOf:'sample',source:'manual',money:false,session:null,changes:changes('0.00','0.00','0.00','−0.25','−0.25'),review:review('FOMC','fomc-prev','fomc'),sample:true},
  {id:'effr',group:'policy',label:'Effective fed funds',value:'3.87',unit:'%',asOf:'sample',source:'manual',money:false,session:null,changes:changes('0.00','0.00','−0.01','−0.25','−0.25'),review:review('New York Fed','daily'),sample:true},
  {id:'cpi',group:'inflation',label:'CPI Y/Y',value:'3.0',unit:'%',asOf:'sample',source:'manual',money:false,session:null,changes:changes('0.0','0.0','−0.1','+0.1','−0.2'),review:review('BLS','monthly'),sample:true},
  {id:'cpiytd',group:'inflation',label:'CPI year to date',value:'2.4',unit:'%',asOf:'sample',source:'manual',money:false,session:null,changes:changes('0.0','0.0','+0.2','+2.4','—'),review:review('BLS','monthly'),sample:true},
  {id:'cpce',group:'inflation',label:'Core PCE Y/Y',value:'2.9',unit:'%',asOf:'sample',source:'manual',money:false,session:null,changes:changes('0.0','0.0','−0.1','+0.1','−0.1'),review:review('BEA','monthly'),sample:true},
  {id:'claims',group:'labor',label:'Initial jobless claims',value:'223',unit:'k',asOf:'sample',source:'manual',money:false,session:null,changes:changes('0','+4','−6','+5','−2'),review:review('DOL','weekly · Thursday'),sample:true},
  {id:'unrate',group:'labor',label:'Unemployment rate',value:'4.4',unit:'%',asOf:'sample',source:'manual',money:false,session:null,changes:changes('0.0','0.0','+0.1','+0.3','+0.3'),review:review('BLS','monthly'),sample:true},
  {id:'y2',group:'yields',label:'2Y Treasury',value:'3.58',unit:'%',asOf:'sample',source:'manual',money:false,session:null,changes:changes('+0.01','−0.03','−0.09','−0.66','−0.52'),review:review('U.S. Treasury','daily'),sample:true},
  {id:'y10',group:'yields',label:'10Y Treasury',value:'4.14',unit:'%',asOf:'sample',source:'manual',money:false,session:null,changes:changes('+0.02','−0.04','−0.11','−0.43','+0.02'),review:review('U.S. Treasury','daily'),sample:true},
  {id:'s2s10',group:'macro',label:'10Y − 2Y spread',value:'+56',unit:'bp',asOf:'sample',source:'manual',money:false,session:null,changes:changes('+1','−1','−2','+23','+54'),review:review('Derived from the two Treasury rows','daily'),sample:true},
  {id:'eurusd',group:'fx',label:'EUR/USD · noon rate',value:'1.1658',unit:'',asOf:'sample',source:'manual',money:false,session:null,changes:changes('+0.04%','+0.22%','+0.86%','+3.42%','+4.10%'),review:review('Federal Reserve H.10','daily'),sample:true},
  {id:'gbpusd',group:'fx',label:'GBP/USD · noon rate',value:'1.3593',unit:'',asOf:'sample',source:'manual',money:false,session:null,changes:changes('−0.03%','+0.14%','+0.78%','+2.61%','+3.22%'),review:review('Federal Reserve H.10','daily'),sample:true},
  {id:'broad-usd',group:'fx',label:'Broad dollar index',value:'121.4',unit:'',asOf:'sample',source:'manual',money:false,session:null,changes:changes('−0.05%','−0.18%','−0.62%','−2.80%','−1.90%'),review:review('Federal Reserve H.10','daily'),sample:true},
  {id:'btc',group:'crypto',label:'Bitcoin',value:'112,420',unit:'USD',asOf:'sample',source:'manual',money:true,session:null,changes:changes('+0.62%','−1.20%','+5.80%','+22.4%','+41.1%'),review:review('Kraken','continuous'),sample:true},
  {id:'eth',group:'crypto',label:'Ethereum',value:'4,120',unit:'USD',asOf:'sample',source:'manual',money:true,session:null,changes:changes('+0.41%','−0.90%','+4.10%','+18.2%','+29.4%'),review:review('Kraken','continuous'),sample:true},
  {id:'us500',group:'equity',label:'S&P 500',value:'6,482.90',unit:'',asOf:'sample',source:'manual',money:false,session:null,changes:changes('+0.31%','+0.74%','+2.18%','+9.4%','+13.2%'),review:review('S&P Dow Jones Indices','daily close'),sample:true},
  {id:'vix',group:'equity',label:'VIX',value:'14.82',unit:'',asOf:'sample',source:'manual',money:false,session:null,changes:changes('−0.48','−1.10','−2.36','−3.20','−1.08'),review:review('Cboe','daily close'),sample:true},
  // The one row that is genuinely live in the fallback: a session window is the
  // clock, not a reading, so there is nothing to be stale about.
  {id:'ny',group:'session',label:'New York session',value:'',unit:'',asOf:'09:30\u201316:00 ET',source:'live',money:false,session:[570,960],changes:changes('—','—','—','—','—'),review:review('Market hours','continuous'),sample:false},
];
// Mirrors `PUBLIC_FOMC_MEETING_DATES` in `server/fomcDates.mjs`, for the case
// where the feed is unreachable. `verify:market-calendar` checks all three
// copies against each other and fails while only three meetings remain ahead.
const FALLBACK_MEETING_DATES=['2026-01-28','2026-03-18','2026-04-29','2026-06-17','2026-07-29','2026-09-16','2026-10-28','2026-12-09','2027-01-27','2027-03-17','2027-04-28','2027-06-09','2027-07-28','2027-09-15','2027-10-27','2027-12-08'];
const marketDataPayload:MarketDataPayload={groups:[{key:'policy',label:'Policy & rates'},{key:'inflation',label:'Inflation'},{key:'labor',label:'Labor & growth'},{key:'yields',label:'Yields & curve'},{key:'fx',label:'FX & dollar'},{key:'crypto',label:'Crypto'},{key:'equity',label:'Indices & volatility'},{key:'macro',label:'Macro & liquidity'},{key:'session',label:'Sessions'}],series:fallbackSeries,periods:['1D','1W','1M','YTD','1Y'],defaultPins:['ffr','cpi','y10','us500'],meetings:FALLBACK_MEETING_DATES.map((iso)=>iso.slice(5)),meetingYear:2026,meetingDates:FALLBACK_MEETING_DATES,sampleValues:true};

// THE DEMO BOARD IS READ LIVE, FROM THE PUBLIC TERMINAL'S OWN SERVER.
//
// `publicRequest` refuses to reach the account service from inside the demo and
// that is unchanged — this is a different thing: a same-origin, read-only route
// on the static server that fetches public data (the St. Louis Fed, Kraken's
// keyless candles) on the demo's behalf. No session, no account, no credential,
// nothing stored. The demo's "leaving is the reset" property is untouched,
// because there is still nothing to reset.
//
// It is a FETCH WITH A FALLBACK and never throws: the board is what a
// demonstration opens on, so a provider having a bad minute must leave the
// sample board up rather than an error. A good answer is held for the visit.
let liveMarketData:MarketDataPayload|null=null;
let liveMarketAt=0;
const LIVE_MARKET_TTL=60_000;
async function readMarketData():Promise<MarketDataPayload>{
  const now=Date.now();
  if(liveMarketData&&now-liveMarketAt<LIVE_MARKET_TTL) return structuredClone(liveMarketData);
  try{
    const res=await fetch('/demo/market-data',{headers:{Accept:'application/json'}});
    if(res.ok){
      const payload=await res.json() as MarketDataPayload;
      // A payload with no rows is not an answer. Taking it would blank the
      // board, which is strictly worse than the sample one already on screen.
      if(Array.isArray(payload?.series)&&payload.series.length>0){
        liveMarketData=payload;
        liveMarketAt=now;
        return structuredClone(payload);
      }
    }
  }catch{/* the fallback below is the answer */}
  return structuredClone(liveMarketData??marketDataPayload);
}
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
// THE CALENDAR IS READ LIVE; THE HEADLINES ARE NOT, AND THAT IS DELIBERATE.
//
// A calendar is a schedule of public statistical releases and the demo board
// puts it on the same screen as the market rows, so an invented one would be
// the only panel there with made-up dates on it. Headlines are somebody's copy,
// and republishing them on a public marketing demo is a licensing question
// rather than a build — so the bundled set stays, each item naming "Fictional
// Wire" so nobody can mistake one for a report.
let liveCalendar:MarketNewsData['calendar']|null=null;
let liveCalendarAt=0;
const LIVE_CALENDAR_TTL=5*60_000;
async function readMarketNews():Promise<MarketNewsData>{
  const base=structuredClone(marketNewsData);
  const now=Date.now();
  if(!liveCalendar||now-liveCalendarAt>=LIVE_CALENDAR_TTL){
    try{
      const res=await fetch('/demo/market-news',{headers:{Accept:'application/json'}});
      if(res.ok){
        const payload=await res.json() as {calendar?:MarketNewsData['calendar']};
        // An empty calendar is not an answer — it would read as "nothing is
        // coming", which is a claim rather than an absence. The bundled one
        // stands instead, and it says outright that it is fictional.
        if(Array.isArray(payload?.calendar)&&payload.calendar.length>0){
          liveCalendar=payload.calendar;
          liveCalendarAt=now;
        }
      }
    }catch{/* the bundled calendar below is the answer */}
  }
  if(liveCalendar) base.calendar=structuredClone(liveCalendar);
  return base;
}

let layout:MarketDataLayout={pinned:[...marketDataPayload.defaultPins],hidden:[],custom:[]};

const PUBLIC_STREAM_CHANNELS=[
  {key:'yahoo-finance',name:'Yahoo Finance',handle:'@YahooFinance',channelId:'',alwaysOn:true,free:true,live:false,placeholder:true,liveChecked:false},
  {key:'bloomberg',name:'Bloomberg Television',handle:'@markets',channelId:'',alwaysOn:true,free:false,live:false,placeholder:true,liveChecked:false},
  {key:'reuters',name:'Reuters',handle:'@Reuters',channelId:'',alwaysOn:true,free:false,live:false,placeholder:true,liveChecked:false},
  {key:'federal-reserve',name:'Federal Reserve',handle:'@federalreserve',channelId:'',alwaysOn:false,free:false,live:false,placeholder:true,liveChecked:false},
];

const baseApi={
  async marketData(){return isDemo()?readMarketData():publicRequest<MarketDataPayload>('/market-data')},
  async marketNews(){return isDemo()?readMarketNews():publicRequest<MarketNewsData>('/market-news')},
  async marketDataLayout(){return isDemo()?{layout:structuredClone(layout)}:publicRequest<{layout:MarketDataLayout}>('/market-data/layout')},
  async saveMarketDataLayout(next:MarketDataLayout){if(isDemo()){layout=structuredClone(next);return {layout:structuredClone(layout)}}return publicRequest<{layout:MarketDataLayout}>('/market-data/layout',{method:'PUT',body:JSON.stringify(next)})},
  // The whole MarketNewsStreams shape, not just the catalog: the screen reads
  // `watching`, `notify` and `cols` straight off it and a missing array is a
  // render crash rather than an empty wall.
  //
  // EVERY CHANNEL IS A PLACEHOLDER, and that is the honest shape rather than a
  // limitation dressed up. The public terminal embeds nobody's video: there is
  // no YouTube key here, and putting a third party's live broadcast inside a
  // showcase is a decision nobody has made. So the wall draws the SLOT — "Live
  // stream plays here" — which shows what the screen is for without playing
  // anything or claiming a channel is live. `placeholder` is read by
  // streamEmbed.ts, so the Market News wall and the Live Wall's stream tile
  // reach the same answer from the same field.
  //
  // The channels are real ones, named, because a slot labelled "Channel 1" says
  // nothing about what the finished screen does. Nothing here is marked `live`:
  // a fabricated live reading is exactly the thing the terminal's own rules
  // forbid.
  async marketNewsStreams(){return {streams:{channels:PUBLIC_STREAM_CHANNELS.map((c)=>({...c})),watching:[PUBLIC_STREAM_CHANNELS[0]!.key],docked:null,cols:2,notify:{},maxWatching:4},liveConfigured:false}},

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
  // The three reads the Contributions, Dividends and Performance screens were
  // built against. Each rendered permanently empty on a real account and full
  // in the demo, which is the worst way round: the showcase proved a screen the
  // first customer would find blank.
  investmentPerformance:(days:number)=>publicRequest(`/investments/performance?days=${encodeURIComponent(String(days))}`),
  investmentDividends:()=>publicRequest('/investments/dividends'),
  investmentContributions:(taxYear:number)=>publicRequest(`/investments/contributions?taxYear=${encodeURIComponent(String(taxYear))}`),

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

  studyFlashcardSets:()=>publicRequest('/studies/flashcards'),
  studyFlashcardSet:(id:string)=>publicRequest(`/studies/flashcards/${encodeURIComponent(id)}`),
  createFlashcardSet:(input:unknown)=>publicRequest('/studies/flashcards',{method:'POST',body:JSON.stringify(input)}),
  updateFlashcardSet:(id:string,patch:unknown)=>publicRequest(`/studies/flashcards/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(patch)}),
  deleteFlashcardSet:(id:string)=>publicRequest(`/studies/flashcards/${encodeURIComponent(id)}`,{method:'DELETE'}),

  studyGuides:()=>publicRequest('/studies/guides'),
  studyGuide:(id:string)=>publicRequest(`/studies/guides/${encodeURIComponent(id)}`),
  saveStudyGuide:(input:unknown)=>publicRequest('/studies/guides',{method:'POST',body:JSON.stringify(input)}),
  updateStudyGuide:(id:string,patch:unknown)=>publicRequest(`/studies/guides/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(patch)}),
  deleteStudyGuide:(id:string)=>publicRequest(`/studies/guides/${encodeURIComponent(id)}`,{method:'DELETE'}),

  // Reporting a bug is free on every account and is the channel through which
  // everything else gets reported, so it is wired for real accounts rather than
  // left as a demo-only screen.
  myBugReports:()=>publicRequest('/support/bugs'),
  createBugReport:(body:string)=>publicRequest('/support/bugs',{method:'POST',body:JSON.stringify({body})}),
  replyBugReport:(id:string,body:string)=>publicRequest(`/support/bugs/${encodeURIComponent(id)}/reply`,{method:'POST',body:JSON.stringify({body})}),
  sendSuggestion:(body:string)=>publicRequest('/support/suggestions',{method:'POST',body:JSON.stringify({body})}),

  // The hand-kept trade log. No broker behind any of it, which is what makes it
  // safe here — every row exists because somebody wrote it down.
  tradeLog:()=>publicRequest('/trades'),
  addTrade:(trade:unknown)=>publicRequest('/trades',{method:'POST',body:JSON.stringify(trade)}),
  updateTrade:(id:string,patch:unknown)=>publicRequest(`/trades/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(patch)}),
  removeTrade:(id:string)=>publicRequest(`/trades/${encodeURIComponent(id)}`,{method:'DELETE'}),
  deletedTrades:()=>publicRequest('/trades/deleted'),
  restoreDeletedTrade:(id:string)=>publicRequest(`/trades/${encodeURIComponent(id)}/restore`,{method:'POST'}),
  // Undo, straight after a delete. The row is put back by its own id rather
  // than rebuilt from what the delete handed over, so an undo restores the
  // trade that was removed and not a copy of it.
  restoreTrade:(trade:{id:string})=>publicRequest(`/trades/${encodeURIComponent(trade.id)}/restore`,{method:'POST'})
    .then(()=>publicRequest('/trades')),

  // The funded book. VTS never places a funded trade — the trader places it at
  // the firm and writes it down here.
  funded:()=>publicRequest('/funded'),
  addFundedAccount:(input:unknown)=>publicRequest('/funded',{method:'POST',body:JSON.stringify(input)}),
  updateFundedAccount:(id:string,patch:unknown)=>publicRequest(`/funded/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(patch)}),
  removeFundedAccount:(id:string)=>publicRequest(`/funded/${encodeURIComponent(id)}`,{method:'DELETE'}),
  addFundedTrade:(accountId:string,input:unknown)=>publicRequest(`/funded/${encodeURIComponent(accountId)}/trades`,{method:'POST',body:JSON.stringify(input)}),
  removeFundedTrade:(id:string)=>publicRequest(`/funded/trades/${encodeURIComponent(id)}`,{method:'DELETE'}),
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
  studyDecks:{decks:[]},studyGames:{decks:[]},siteContent:{howto:{}},patchNotes:{notes:[],canManage:false},
  // `canManage` is FALSE for a live public account and true only in the demo:
  // there is no public administrator, and a composer a real visitor could post
  // through would be one anybody could post through.
  announcements:{announcements:[],canManage:false},myBugReports:{reports:[]},bugReports:{reports:[]}
 };return structuredClone(table[name]??{ok:true,items:[],records:[]});
};
export const api:any=new Proxy(baseApi as any,{get(target,key:string){if(key in target)return target[key];return async(...args:any[])=>{
 // AI fails closed EVERYWHERE until the separate provider migration, demo
 // included: a showcase must never imply a capability that is not wired.
 // Two names are spelled out because none of the words below appear in them,
 // and both are AI routes: `flashcardsFromGame` has a model pull the terms out
 // of a study game, and `closeFundedTrade` reads the result off a screenshot.
 // Without them the calls fell through to a "route not found", which reads as a
 // broken button rather than a feature that is deliberately switched off.
 // READING A TRADE OFF A SCREENSHOT IS THE ONE AI-SHAPED THING THE DEMO ANSWERS,
 // and it is a NAMED list rather than a pattern so nothing else can slip through
 // it. Pasting a screenshot and having the trade logged is the feature people
 // ask about first; a showcase that answers it with "switched off" is showing
 // the wrong product. No model runs — the demo returns a stored reading and says
 // so in `model`, which is the field the screens print as provenance.
 //
 // ORDER MATTERS: this sits ABOVE the refusal, and the refusal still covers
 // every other AI method including these same three OUTSIDE the demo, where a
 // real account would otherwise get a fabricated read of their own screenshot.
 if(isDemo()&&DEMO_SCREENSHOT_METHODS.includes(key)){const answered=demoCall(key,args);if(answered.handled)return answered.value}
 if(/(import|extract|chat|generate|analyze|audit|categorize|preview|fixture|tutor)/i.test(key)||/^ai/i.test(key)||key==='flashcardsFromGame'||key==='closeFundedTrade')throw new ApiError(501,'AI features are moving to a new provider and are switched off in the public terminal.');
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
