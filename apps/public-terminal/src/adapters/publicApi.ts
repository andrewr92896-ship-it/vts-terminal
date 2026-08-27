type MarketDataLayout={pinned:string[];hidden:string[];custom:Array<Record<string,unknown>>};
type MarketDataPayload={groups:Array<{key:string;label:string}>;series:Array<Record<string,unknown>>;periods:string[];defaultPins:string[];meetings:string[];meetingYear:number;sampleValues:boolean};
type MarketNewsData={aiTagging:boolean;headlines:Array<Record<string,unknown>>;calendar:Array<Record<string,unknown>>};

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

export const api={
  async marketData(){return structuredClone(marketDataPayload)},
  async marketNews(){return structuredClone(marketNewsData)},
  async marketDataLayout(){return {layout:structuredClone(layout)}},
  async saveMarketDataLayout(next:MarketDataLayout){layout=structuredClone(next);return {layout:structuredClone(layout)}},
  async marketNewsStreams(){return {streams:{channels:[]},liveConfigured:false}},
};
