// Public replacement for the private terminal's `help/tutorials` module.
//
// The portal's How-to guides describe the trading desk, broker connections,
// strategy sessions, private groups and the admin surfaces — none of which the
// public terminal has. Aliasing the module at the build boundary keeps that
// copy out of the public bundle entirely rather than filtering a list while the
// bodies still ship. Same seam publicLegal.ts uses, for the same reason.
export interface TutorialStep{title:string;body:string;image?:string}
export interface Tutorial{title:string;intro?:string;steps:TutorialStep[]}

export const TUTORIALS:Record<string,Tutorial>={
 my_access:{title:'Plans & Features',intro:'What each public plan includes.',steps:[
  {title:'Free',body:'The core public terminal: the Live Wall, Market Data, News, your manual trade records, To Do, Studies, Net Worth, Budget and Investments.'},
  {title:'Premium and Max',body:'Subscription plans that widen the study and market-data allowance. They are product tiers only — no plan grants execution, broker connections, or any group capability.'},
  {title:'Changing plan',body:'Nothing you have entered is deleted when a plan changes. Records stay exactly where they are.'}]},
 live:{title:'Live Wall',intro:'The board the public terminal opens on.',steps:[
  {title:'What is on it',body:'A market chart, a watchlist, the factual news feed, the economic calendar and a market clock.'},
  {title:'Reading it',body:'Everything here is public market information. It is informational only and is not advice.'}]},
 data:{title:'Market Data',intro:'The board of rates, prints and prices the terminal watches.',steps:[
  {title:'The series board',body:'Each row carries its latest reading, five change columns, who publishes it and when it was last and is next revised.'},
  {title:'Sample rows',body:'A row marked Sample has no live provider behind it. It is a placeholder figure and is labelled as one rather than presented as a reading.'},
  {title:'The calendar',body:'The economic calendar and the Fed countdown sit on the same screen and are included with every account.'}]},
 desk:{title:'Closed Trades & Metrics',intro:'Your record of trades that are finished.',steps:[
  {title:'Logging a trade',body:'Enter the instrument, side, entry and exit, size and realized P/L. Every record is entered by you — nothing is imported from a broker.'},
  {title:'The metrics',body:'Trades, win rate, realized P/L, gross profit and loss and profit factor, scored over whatever the filters have narrowed to.'},
  {title:'Narrowed figures',body:'When a filter is excluding trades the screen says so, so a narrowed number is never read as a complete one.'}]},
 funded:{title:'Manual Trades',intro:'A hand-kept book for positions the terminal cannot read.',steps:[
  {title:'Adding a position',body:'Type the instrument, side, size and fill. The stop and target here are a record of what you are holding — nothing is sent anywhere.'},
  {title:'Closing one',body:'Enter the exit and it moves into your closed trades and counts toward the metrics.'}]},
 deleted:{title:'Deleted Trades',intro:'Where a removed record goes.',steps:[
  {title:'Restoring',body:'A deleted trade is kept rather than destroyed, so it can be put back. It does not count toward any figure while it sits here.'}]},
 notes:{title:'Trading Notes & Predictions',intro:'Write the call before the market makes it.',steps:[
  {title:'Making a call',body:'Say what you expect, in which instrument, and how sure you are. Put it down before the window opens — that is what makes it a record rather than a memory.'},
  {title:'It is yours alone',body:'A public prediction is private to your account. There is no control that publishes, shares, copies, routes or distributes one.'},
  {title:'Afterwards',body:'Come back and write what actually happened. The point is the comparison, not the score.'}]},
 td_trading:{title:'To Do',intro:'A personal list.',steps:[
  {title:'Adding an item',body:'Type it and press add. Items are yours and are not visible to anyone else.'}]},
 news:{title:'Market News',intro:'The headline feed.',steps:[
  {title:'Reading it',body:'Stories newest first, bucketed by recency, each tagging the instruments it mentions. Filter by topic or by source.'},
  {title:'What it is not',body:'The feed reports. It carries no recommendation and is informational only.'}]},
 st_game:{title:'Study Game',intro:'Work through a study game and keep your progress.',steps:[
  {title:'Picking a game',body:'Your own games are listed first; Browse Study Games opens the built-in ones and adds the ones you want to your list.'},
  {title:'Progress',body:'Your streak, level and per-category standing are kept per game and are your own.'}]},
};

const DEFAULT_TUTORIAL:Tutorial={title:'How to use this screen',intro:'A walkthrough for this screen has not been written yet.',steps:[]};
export function tutorialFor(screen:string):Tutorial{return TUTORIALS[screen]??DEFAULT_TUTORIAL;}

// Mirrors the public nav labels, in the order the sidebar lists them.
export const HOWTO_TOPICS:{key:string;label:string}[]=[
 {key:'live',label:'Live Wall'},
 {key:'data',label:'Market Data'},
 {key:'desk',label:'Closed Trades & Metrics'},
 {key:'funded',label:'Manual Trades'},
 {key:'deleted',label:'Deleted Trades'},
 {key:'notes',label:'Trading Notes & Predictions'},
 {key:'news',label:'Market News'},
 {key:'td_trading',label:'To Do'},
 {key:'st_game',label:'Study Game'},
 {key:'my_access',label:'Plans & Features'},
];

export function parseHowtoOverride(json:string|undefined|null):Tutorial|null{
 if(!json)return null;
 try{
  const raw=JSON.parse(json) as Partial<Tutorial>;
  if(!raw||typeof raw.title!=='string')return null;
  const steps=Array.isArray(raw.steps)?raw.steps.filter((s):s is TutorialStep=>!!s&&typeof s.title==='string'&&typeof s.body==='string').map((s)=>({title:s.title,body:s.body})):[];
  return {title:raw.title,intro:typeof raw.intro==='string'?raw.intro:undefined,steps};
 }catch{return null}
}
export function serializeTutorial(t:Tutorial):string{return JSON.stringify({title:t.title,intro:t.intro??'',steps:t.steps.map((s)=>({title:s.title,body:s.body}))});}
export function mergedTutorial(screen:string,overrides:Record<string,string>):Tutorial{return parseHowtoOverride(overrides[screen])??tutorialFor(screen);}
