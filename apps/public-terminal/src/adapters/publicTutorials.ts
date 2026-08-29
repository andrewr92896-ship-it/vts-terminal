// Public replacement for the private terminal's `help/tutorials` module.
//
// The portal's How-to guides describe the trading desk, broker connections,
// strategy sessions, private groups and the admin surfaces — none of which the
// public terminal has. Aliasing the module at the build boundary keeps that
// copy out of the public bundle entirely rather than filtering a list while the
// bodies still ship. Same seam publicLegal.ts uses, for the same reason.
export interface TutorialStep{title:string;body:string;image?:string}
export interface Tutorial{title:string;intro?:string;steps:TutorialStep[]}

// EVERY STEP SAYS WHAT TO DO, NOT WHAT A SCREEN IS (owner instruction,
// 2026-08 — the first version of these was generic and unhelpful). A guide that
// restates the heading is a guide people stop opening. The test for a step is
// whether somebody who has never seen the screen could follow it with the screen
// in front of them: name the control, say what happens, and say what does not.
export const TUTORIALS:Record<string,Tutorial>={
 // ---- Advanced Trading ---------------------------------------------------
 live:{title:'Live Wall',intro:'One board, arranged by you. It is the screen the terminal opens on.',steps:[
  {title:'Rearrange it',body:'Press "Edit layout". Tiles get a dashed outline and a drag handle in their header. Drag a header to move a tile; drag any of its four corners to resize it. Press "Done" when the board looks right.'},
  {title:'Add a tile',body:'While editing, press "Add a tile". Each entry says what it shows before you add it. The new tile lands at the bottom of the board — drag it where you want it.'},
  {title:'Take one off',body:'While editing, press the ✕ in a tile\'s header. Nothing behind the tile is deleted; you are removing it from this board, and you can add it back.'},
  {title:'Start over',body:'"Reset layout", while editing, puts the board back to the one everybody starts with.'},
  {title:'What the tiles show',body:'Market tiles read the same feeds the Market Data and Market News screens do. Personal tiles — Net Worth, Portfolio, To Do, Notes — read your own records, so they show what those screens show.'},
  {title:'Live streams',body:'The stream tile shows the slot a channel plays in. In this preview nothing streams, and the tile says so rather than claiming a channel is live.'},
  {title:'What is not here',body:'No order ticket, no broker positions, no account balances. The public terminal connects to no broker and sends nothing to one.'}]},
 data:{title:'Market Data',intro:'The board of rates, prints and prices the terminal watches.',steps:[
  {title:'Find a series',body:'Type into the search box, or use the group filter — policy, inflation, labor, yields, FX, commodities, crypto, indices, macro, sessions.'},
  {title:'Read a row',body:'Left to right: the latest reading, then five change columns — one day, one week, one month, year to date, one year. A yield changes by SUBTRACTION, so 4.05 → 4.02 reads −0.03 rather than a percentage.'},
  {title:'Pin what you watch',body:'Pin a row and it moves to the strip at the top of the screen, which stays as you left it between visits. Remove a row you never read and it stops taking up space.'},
  {title:'A row marked Sample',body:'A "Sample" dot means no live provider is behind that row. It is a placeholder, labelled as one, and is never presented as a measurement.'},
  {title:'The calendar',body:'The second view is the economic calendar — what is due, when, and what was forecast. The Fed countdown at the top reads its target range from the Fed funds row rather than from a figure typed in beside it.'}]},
 desk:{title:'Closed Trades & Metrics',intro:'What your finished trades did, scored the way a desk scores them.',steps:[
  {title:'Read the KPI row',body:'Trades, win rate, realized P/L, gross profit and loss, and profit factor. Every one is computed over what the filters have narrowed to, not over everything.'},
  {title:'Narrow it',body:'Filter by day of week, month, strategy or instrument. The summary recomputes, so a filtered selection scores exactly as an unfiltered one would.'},
  {title:'Break it down',body:'The By Strategy and By Instrument panels score each group on its own. Movement is reported in BOTH pips and points where a selection holds both — never one standing for the whole.'},
  {title:'When a figure is narrowed',body:'If anything is being excluded, the screen says so above the numbers. A narrowed figure is never left to look like a complete one.'},
  {title:'Fix a mistake',body:'The pencil on a row edits that trade. Nothing here is imported from a broker, so every figure is one you entered and can correct.'}]},
 funded:{title:'Manual Trades',intro:'A hand-kept book for positions nothing can read for you.',steps:[
  {title:'Make an account',body:'Add an account first — a name and a platform label. Trades belong to an account, and you can keep more than one.'},
  {title:'Add a position',body:'Type the instrument, side, size and fill price. The stop and target here are a RECORD of what you are holding: nothing is sent anywhere and no order is placed.'},
  {title:'Close it',body:'Enter the exit. It moves into your closed trades and starts counting toward the metrics on Closed Trades & Metrics.'},
  {title:'Reading a screenshot',body:'"Import from screenshot" is where AI reads a photo of your trade history and logs the trades on the account you pick. It is switched off in this preview — press "See an example" to see exactly what it produces before you ever paste anything of your own.'}]},
 deleted:{title:'Deleted Trades',intro:'Where a removed record goes, and how to get it back.',steps:[
  {title:'Restoring one',body:'Press Restore on the row. A deleted trade is kept rather than destroyed, which is what makes deleting one safe.'},
  {title:'While it sits here',body:'It counts toward nothing — not the trade count, the win rate, or the P/L. Restoring it puts it back into every figure at once.'}]},
 notes:{title:'Trading Notes',intro:'Write the call before the market makes it, and settle it afterwards.',steps:[
  {title:'Make a call',body:'Say what you expect, in which instrument, over which window, and how sure you are. Write it BEFORE the window opens — that is what makes it a record rather than a memory.'},
  {title:'Or just write something down',body:'An observation carries no window and no deadline, and is never scored. Use it for what you noticed rather than what you predict.'},
  {title:'Settle it',body:'Come back after the window and say what happened. A call that could not be settled is recorded as exactly that and is never counted as a miss — the point is calibration, not a score.'},
  {title:'It is yours alone',body:'Nothing here publishes, shares, copies or routes a prediction to anybody. There is no control that does.'}]},
 // ---- My Terminal --------------------------------------------------------
 td_trading:{title:'To Do',intro:'A personal list, kept on your account.',steps:[
  {title:'Add an item',body:'Type it into the box and press add. It appears at the top of the list.'},
  {title:'Finish one',body:'Tick it. A finished item stays visible so the list is a record of what you did, not only of what is left.'},
  {title:'Remove one',body:'Delete removes it from the list. It is yours and nobody else can see it.'}]},
 my_terminal:{title:'Customizing My Terminal',intro:'My Terminal is the one workspace you build yourself.',steps:[
  {title:'Open the editor',body:'With My Terminal open, press "Customize" — the last row of its section list.'},
  {title:'Take a row off',body:'Press a row under "My Terminal\'s own sections" to switch it off. It leaves this workspace and nothing else changes.'},
  {title:'Pin a section on',body:'Press any section from another workspace to add it here. It is a SECOND way in, not a move — the section stays in its own workspace too.'},
  {title:'What it cannot do',body:'It will not let you empty the workspace: the last remaining row cannot be taken off, because a workspace with no rows has no way back to this editor.'},
  {title:'Starting over',body:'"Reset to default" puts My Terminal back to the sections it starts with.'}]},
 // ---- Finances and Investments -------------------------------------------
 fin_budget:{title:'Budget',intro:'What you earn and what you spend, by month.',steps:[
  {title:'Make a category',body:'Add a category and say whether it is income or spending. The category carries the sign — every amount you type is positive.'},
  {title:'Record something',body:'Add an entry against a category with a date. Entries are bucketed by month, so a month\'s total is everything dated inside it.'},
  {title:'Tidy up',body:'Archive a category you have stopped using: past months keep it, so no total you have already read changes. Delete is for one made by mistake.'},
  {title:'What it will not do',body:'It states what is true and stops. There is no "you are overspending on dining" and no suggested budget.'}]},
 fin_networth:{title:'Net Worth',intro:'Everything you own minus everything you owe, tracked over time.',steps:[
  {title:'Add what you own',body:'Cash, property, vehicles, anything else. Enter the value as a positive number and pick the category — the category carries the sign.'},
  {title:'Add what you owe',body:'Same form, marked as a liability. It subtracts.'},
  {title:'What is already counted',body:'Your investment portfolio is read in automatically and there is deliberately NO category for "brokerage" or "investments" — typing it in a second time would double it, and nothing could detect that afterwards.'},
  {title:'When there is no total',body:'If a tracked part cannot be read, the headline figure is withheld rather than shown missing a chunk. A net worth quietly missing something looks complete when it is not.'}]},
 inv_overview:{title:'Investments',intro:'A long-term portfolio tracker — accounts, holdings, allocation and income.',steps:[
  {title:'Add an account',body:'Start on Accounts: a name and a type (401(k), IRA, ESA, taxable). Holdings belong to an account.'},
  {title:'Add a holding',body:'A name, a quantity, and a price if nothing can price it for you. A ticker is optional — plenty of 401(k) funds have a name and no ticker.'},
  {title:'What "unpriced" means',body:'A holding nothing can price is EXCLUDED from every total and counted, and the screen says how many. It is never valued at zero, which would understate the portfolio while looking right.'},
  {title:'Allocation',body:'It states what is true — "68% is in one holding" — and never what to do about it. There is no target to measure against, deliberately.'},
  {title:'Contributions',body:'Contribution limits come from a catalog kept by tax year. A year not in it reports NO limit rather than borrowing a neighbouring year\'s figure.'}]},
 // ---- Studies -------------------------------------------------------------
 st_game:{title:'Study Game',intro:'Work through a study game and keep your progress.',steps:[
  {title:'Pick a game',body:'Your own games are listed first. "Browse Study Games" opens the built-in ones; add the ones you want and they join your list.'},
  {title:'Play',body:'Answer, and the level bar moves. A sub-level costs one more correct answer than the one before it, which is why the ticks along the bar are not evenly spaced.'},
  {title:'Where you are up to',body:'The game works through every question once before repeating any, and it remembers where it got to between visits.'},
  {title:'Categories',body:'If the game carries exam weights, the breakdown says what share of the exam each area carries, what share of your answers came from it, and how you did — including areas you have not practised at all.'}]},
 st_decks:{title:'Study Creation',intro:'Building your own study material.',steps:[
  {title:'Pick what to build',body:'Three tiles: a study game, a flashcard set, or a presentation. Each opens one maker with a way back.'},
  {title:'Building a game',body:'The wizard asks one thing per card — how to build it, the name, the topic, how many questions — and ends on a review that restates your answers before anything is made.'},
  {title:'Bringing your own questions',body:'One route composes a prompt for your OWN AI and reads the file it produces. You can leave that screen and come back: the plan and its ID are kept.'},
  {title:'Checking before creating',body:'Reading and checking a file is repeatable and creates nothing. Only "Create study game" writes.'}]},
 // ---- Site Help and Settings ---------------------------------------------
 hp_bug:{title:'Reporting a bug',intro:'Telling us something is broken is free on every account, always.',steps:[
  {title:'Describe it',body:'Say what you did and what happened. You do not need to know which screen or which version — that is attached for you.'},
  {title:'What happens next',body:'The report opens a thread you can reply on, so it is a conversation rather than a form that vanishes.'}]},
 hp_suggest:{title:'Suggestions',intro:'Ideas for what the terminal should do next.',steps:[
  {title:'Send one',body:'Type it and press send. There is no form to fill in beyond that.'},
  {title:'In this preview',body:'A suggestion sent here reaches nobody and resets when you leave.'}]},
 my_settings:{title:'Settings',intro:'The account itself.',steps:[
  {title:'Your details',body:'Change your display name, and your password. Your display name is unique across the terminal — it is the name on a leaderboard or a roster.'},
  {title:'Signing out',body:'The sign-out control is in the top bar. It ends the session on the server, not just on this device — worth knowing on a shared computer.'}]},
 my_prefs:{title:'Preferences',intro:'How the terminal is displayed to you.',steps:[
  {title:'Your clock',body:'Pick the zone you read times in. It is stored on your account, so it follows you between devices. Market hours, the Fed schedule and anything bucketed by trading day stay on Eastern wherever you are — those are facts about the market, not about you.'},
  {title:'Leaderboards',body:'Switch off "show me on leaderboards" and other people stop seeing your row. You still see your own — it is about being findable, not about losing your standing.'},
  {title:'Where the terminal opens',body:'Pick the screen a sign-in lands on. If it later becomes unreachable, the terminal falls back rather than stranding you on it.'}]},
 my_access:{title:"What's Included",intro:'What this terminal does, and what it does not do.',steps:[
  {title:'What is here',body:'Market data and news, your trade records and metrics, trading notes, the Live Wall, Finances, Investments and Studies.'},
  {title:'What is not here',body:'Order placement, broker connections, live balances and group features. They are not part of the public terminal.'},
  {title:'Pre-release',body:'The terminal is in pre-release and nothing is sold here. There are no plans, tiers or payments anywhere in it.'}]},
 // Says what is coming without implying it is here. Deliberately TRACKING
 // only — nothing here suggests the terminal will place an order.
 connections:{title:'Broker connections',intro:'Not available, and not what you might expect when it is.',steps:[
  {title:'Today',body:'Every trade in the public terminal is entered by you — typed in, or read off a screenshot you paste.'},
  {title:'What is planned',body:'Connecting a broker so closed trades import themselves, for TRACKING only. It is not built and is not enabled here.'},
  {title:'What it will not do',body:'It will not place, change or close an order, and it will not move money.'}]},
};

const DEFAULT_TUTORIAL:Tutorial={title:'How to use this screen',intro:'A walkthrough for this screen has not been written yet.',steps:[]};
export function tutorialFor(screen:string):Tutorial{return TUTORIALS[screen]??DEFAULT_TUTORIAL;}

// The topic pills, in the order the sidebar lists the screens they cover, with
// the two that have no screen of their own — customizing My Terminal, and what
// broker connections will and will not be — at the points somebody looks for them.
export const HOWTO_TOPICS:{key:string;label:string}[]=[
 {key:'live',label:'Live Wall'},
 {key:'data',label:'Market Data'},
 {key:'desk',label:'Closed Trades & Metrics'},
 {key:'funded',label:'Manual Trades'},
 {key:'deleted',label:'Deleted Trades'},
 {key:'notes',label:'Trading Notes'},
 {key:'td_trading',label:'To Do'},
 {key:'my_terminal',label:'Customizing My Terminal'},
 {key:'fin_budget',label:'Budget'},
 {key:'fin_networth',label:'Net Worth'},
 {key:'inv_overview',label:'Investments'},
 {key:'st_game',label:'Study Game'},
 {key:'st_decks',label:'Study Creation'},
 {key:'hp_bug',label:'Reporting a bug'},
 {key:'hp_suggest',label:'Suggestions'},
 {key:'my_settings',label:'Settings'},
 {key:'my_prefs',label:'Preferences'},
 {key:'my_access',label:"What's Included"},
 {key:'connections',label:'Broker connections'},
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
