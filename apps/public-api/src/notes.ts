// Trading Notes — the pure half: Eastern week bucketing, the default window,
// what a note still owes, and the calibration record.
//
// The public terminal has NO GROUPS, so the private module's sharing half is
// absent rather than disabled: there is no visibility column, no publish route,
// and nothing here that takes a "whose" parameter. What survives is the part
// that makes this a record rather than a diary, and each rule below is the
// difference between the two.
//
//   1. A CALL IS FROZEN ONCE ITS WINDOW HAS OPENED. `isLocked` is the whole
//      test, and after it the reflection is the only thing that may be written.
//      On the private side sharing also freezes a call; here nothing can be
//      shared, so the window is the only thing that freezes one — the rule is
//      unchanged, one of its two triggers simply cannot occur.
//   2. A CALL THAT COULD NOT BE SETTLED IS NEVER SCORED AS WRONG.
//      `unsettleable` is counted on its own and excluded from the hit rate. Do
//      not fold it into the misses.
//   3. THE RECORD IS CALIBRATION, NOT A LEADERBOARD. Confidence maps to a
//      STATED probability so what somebody said can sit beside how often they
//      were right at that level. Nothing here ranks anybody, and there is
//      nobody else to rank against.

export type NoteKind='prediction'|'observation';
export type NoteDirection='up'|'down';
// `partial` only ever comes from a person. `unsettleable` is a real answer.
export type NoteOutcome='hit'|'miss'|'partial'|'unsettleable';
export type NoteSettler='auto'|'self';
export type NoteAwaiting='settle'|'reflect';

// A runaway-input guard, not a product limit.
export const MAX_PER_WEEK=50;
export const MAX_TITLE=200;
export const MAX_BODY=4000;
export const MAX_REFLECTION=4000;
export const MAX_INSTRUMENT=40;

// ---- Eastern-Time week bucketing -------------------------------------------
//
// A trading week is an Eastern concept, like every other day bucket in the
// terminal. The key is computed here and STORED: derived per reader, a call
// would move between weeks when somebody changed their display zone, and the
// board would rearrange itself with nothing entered or edited.

function etCivil(at:Date):{y:number;m:number;d:number}{
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(at).split('-');
  return {y:Number(parts[0]),m:Number(parts[1]),d:Number(parts[2])};
}

// How far Eastern sits from UTC at a given instant, in ms. Read from Intl rather
// than hardcoded, so it is DST-correct by construction.
function etOffsetMs(at:Date):number{
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(at);
  const get=(type:string):number=>Number(parts.find((p)=>p.type===type)?.value??'0');
  return Date.UTC(get('year'),get('month')-1,get('day'),get('hour')%24,get('minute'),get('second'))-at.getTime();
}

// An absolute instant from an Eastern wall-clock date and time. COMPOSED rather
// than offset from "now": `now + 4h` drifts across a DST boundary, which is the
// trap this exists to close. Two passes because the offset itself depends on the
// instant being resolved.
export function etInstant(y:number,mo:number,d:number,hh:number,mi:number):number{
  const guess=Date.UTC(y,mo-1,d,hh,mi);
  let ms=guess-etOffsetMs(new Date(guess));
  ms=guess-etOffsetMs(new Date(ms));
  return ms;
}

// ISO-8601 week stamp ('2026-W34'), Monday-based, in Eastern Time.
export function etWeekKey(at:Date=new Date()):string{
  const {y,m,d}=etCivil(at);
  const dt=new Date(Date.UTC(y,m-1,d));
  // ISO weeks belong to the year containing their Thursday.
  const dow=dt.getUTCDay()||7; // Mon=1 … Sun=7
  dt.setUTCDate(dt.getUTCDate()+4-dow);
  const isoYear=dt.getUTCFullYear();
  const week=Math.ceil(((dt.getTime()-Date.UTC(isoYear,0,1))/86_400_000+1)/7);
  return `${isoYear}-W${String(week).padStart(2,'0')}`;
}

export function isWeekKey(value:string):boolean{return /^\d{4}-W\d{2}$/.test(value)}

// The Monday of a week key, as a UTC civil date. It carries no zone meaning of
// its own — it is only ever read back through etInstant or formatted as a date.
function mondayOf(weekKey:string):Date{
  const match=/^(\d{4})-W(\d{2})$/.exec(weekKey);
  if(!match)return mondayOf(etWeekKey());
  // Jan 4 is always in ISO week 1.
  const jan4=new Date(Date.UTC(Number(match[1]),0,4));
  const dow=jan4.getUTCDay()||7;
  const week1Monday=jan4.getTime()-(dow-1)*86_400_000;
  return new Date(week1Monday+(Number(match[2])-1)*7*86_400_000);
}

// Move a week key by whole weeks, so the client never has to know how a week is
// numbered. Midday keeps the arithmetic clear of any DST edge.
export function shiftWeekKey(weekKey:string,delta:number):string{
  return etWeekKey(new Date(mondayOf(weekKey).getTime()+delta*7*86_400_000+12*3_600_000));
}

function ymd(d:Date):string{
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

export function weekRange(weekKey:string):{startsOn:string;endsOn:string}{
  const mon=mondayOf(weekKey);
  return {startsOn:ymd(mon),endsOn:ymd(new Date(mon.getTime()+4*86_400_000))};
}

// The default window for a weekly call: it opens at the Monday cash open and
// settles at the Friday close, both Eastern. A call written after the open gets
// no blind period, which is correct — the reveal is derived from the window
// rather than from when the note happened to be written.
export function defaultWindow(weekKey:string):{opensAt:number;deadlineAt:number}{
  const mon=mondayOf(weekKey);
  const fri=new Date(mon.getTime()+4*86_400_000);
  return {
    opensAt:etInstant(mon.getUTCFullYear(),mon.getUTCMonth()+1,mon.getUTCDate(),9,30),
    deadlineAt:etInstant(fri.getUTCFullYear(),fri.getUTCMonth()+1,fri.getUTCDate(),16,0),
  };
}

// ---- The stored row and the view -------------------------------------------

export type NoteRow={
  id:string;kind:NoteKind;title:string;body:string|null;instrument:string|null;
  direction:NoteDirection|null;targetPrice:number|null;confidence:number|null;
  weekKey:string;windowOpensAt:number|null;deadlineAt:number|null;openPrice:number|null;
  lockedAt:number|null;outcome:NoteOutcome|null;settledAt:number|null;settledBy:NoteSettler|null;
  settlePrice:number|null;settleNote:string|null;reflection:string|null;reflectedAt:number|null;
  createdAt:number;updatedAt:number;
};

export type TradingNote={
  id:string;ownerId:string;owner:string;isMine:boolean;
  kind:NoteKind;
  /** Always 'private' here. There are no groups and no route that could change it. */
  visibility:'private';
  title:string;body:string|null;instrument:string|null;direction:NoteDirection|null;
  targetPrice:number|null;confidence:number|null;weekKey:string;
  windowOpensAt:number|null;deadlineAt:number|null;openPrice:number|null;
  locked:boolean;revealed:boolean;autoSettles:boolean;
  outcome:NoteOutcome|null;settledAt:number|null;settledBy:NoteSettler|null;
  settlePrice:number|null;settleNote:string|null;
  reflection:string|null;reflectedAt:number|null;
  awaiting:NoteAwaiting|null;createdAt:number;updatedAt:number;
};

// THERE IS NO PRICE FEED ON THE PUBLIC SIDE, so nothing settles itself and this
// is hard false. It is not a stub: `autoSettles: true` tells the trader the
// terminal will grade the call for them, and a call that then silently never
// settles is exactly the failure the repo's "never imply a capability that is
// not wired" rule exists to prevent. When a feed is wired, this becomes the
// private module's test — an instrument, a direction, and something to measure
// against (a level the trader named, or the mark the call was made at).
export function autoSettles(_row:Pick<NoteRow,'kind'|'instrument'|'direction'|'targetPrice'|'openPrice'>):boolean{
  return false;
}

// Whether the call is frozen. A window that has OPENED freezes it: the trade
// week has started, and a call rewritten mid-week is not the call that was made.
export function isLocked(row:Pick<NoteRow,'lockedAt'|'windowOpensAt'>,now:number):boolean{
  if(row.lockedAt!=null)return true;
  return row.windowOpensAt!=null&&row.windowOpensAt<=now;
}

// What the trader is still owed. One field with three states rather than a pair
// of booleans, so the screen can group them: open, done, or asks nothing.
export function awaitingFor(row:Pick<NoteRow,'kind'|'outcome'|'reflection'|'deadlineAt'>,now:number):NoteAwaiting|null{
  if(row.outcome!=null)return row.reflection?null:'reflect';
  if(row.kind!=='prediction')return null;
  if(row.deadlineAt!=null&&row.deadlineAt<=now)return 'settle';
  return null;
}

export function toView(row:NoteRow,ownerId:string,owner:string,now:number):TradingNote{
  return {
    id:row.id,ownerId,owner,isMine:true,
    kind:row.kind,visibility:'private',
    title:row.title,body:row.body,instrument:row.instrument,direction:row.direction,
    targetPrice:row.targetPrice,confidence:row.confidence,weekKey:row.weekKey,
    windowOpensAt:row.windowOpensAt,deadlineAt:row.deadlineAt,openPrice:row.openPrice,
    locked:isLocked(row,now),
    revealed:row.windowOpensAt==null||row.windowOpensAt<=now,
    autoSettles:autoSettles(row),
    outcome:row.outcome,settledAt:row.settledAt,settledBy:row.settledBy,
    settlePrice:row.settlePrice,settleNote:row.settleNote,
    reflection:row.reflection,reflectedAt:row.reflectedAt,
    awaiting:awaitingFor(row,now),
    createdAt:row.createdAt,updatedAt:row.updatedAt,
  };
}

// ---- Calibration ------------------------------------------------------------
//
// What a confidence level ASSERTS, so the table can put it beside what actually
// happened. Coarse on purpose: the whole value of the table is having enough
// calls in each bucket for the comparison to mean anything.
export const CONFIDENCE_STATED:Record<number,number>={1:55,2:65,3:75,4:85,5:95};

export type CalibrationRow={level:number;stated:number;calls:number;hits:number};
export type NoteStats={
  /** Hits plus misses — the calls that count, and nothing else. */
  scored:number;hits:number;misses:number;
  /** Reported on their own and NEVER folded into the hit rate. */
  partial:number;unsettleable:number;
  open:number;
  /** Null when nothing has been scored. Never 0, which would read as "all wrong". */
  hitRate:number|null;
  calibration:CalibrationRow[];
};

export function computeStats(rows:Array<Pick<NoteRow,'kind'|'outcome'|'confidence'>>):NoteStats{
  const stats:NoteStats={scored:0,hits:0,misses:0,partial:0,unsettleable:0,open:0,hitRate:null,calibration:[]};
  const buckets=new Map<number,{calls:number;hits:number}>();
  for(const row of rows){
    if(row.kind!=='prediction')continue;
    if(row.outcome==null){stats.open+=1;continue}
    if(row.outcome==='partial'){stats.partial+=1;continue}
    // Rule 2. Counted, named, and kept out of the denominator.
    if(row.outcome==='unsettleable'){stats.unsettleable+=1;continue}
    const hit=row.outcome==='hit';
    stats.scored+=1;
    if(hit)stats.hits+=1;else stats.misses+=1;
    if(row.confidence!=null&&CONFIDENCE_STATED[row.confidence]!=null){
      const bucket=buckets.get(row.confidence)??{calls:0,hits:0};
      bucket.calls+=1;
      if(hit)bucket.hits+=1;
      buckets.set(row.confidence,bucket);
    }
  }
  if(stats.scored>0)stats.hitRate=(stats.hits/stats.scored)*100;
  stats.calibration=[...buckets.entries()]
    .map(([level,bucket])=>({level,stated:CONFIDENCE_STATED[level]??0,calls:bucket.calls,hits:bucket.hits}))
    .sort((a,b)=>a.level-b.level);
  return stats;
}

// Grade a call against a price. Unreachable today — nothing on the public side
// supplies a price — and kept because it states the rule a feed would have to
// follow, above all that AN UNCHANGED PRICE IS A MISS on an "up" call: the
// market did not do what was called, and rounding that to a hit would flatter
// every call that went nowhere.
export function gradeCall(row:Pick<NoteRow,'direction'|'targetPrice'|'openPrice'>,price:number):{outcome:NoteOutcome;note:string}{
  if(row.direction==null)return {outcome:'unsettleable',note:'No direction was set on this call.'};
  if(row.targetPrice!=null){
    const hit=row.direction==='up'?price>=row.targetPrice:price<=row.targetPrice;
    return {outcome:hit?'hit':'miss',note:`Settled at ${fmtPrice(price)} against a target of ${fmtPrice(row.targetPrice)}.`};
  }
  if(row.openPrice==null){
    return {outcome:'unsettleable',note:'The price when this call was made was never readable, so there is nothing to measure it against.'};
  }
  const hit=row.direction==='up'?price>row.openPrice:price<row.openPrice;
  return {outcome:hit?'hit':'miss',note:`Settled at ${fmtPrice(price)}, against ${fmtPrice(row.openPrice)} when the window opened.`};
}

function fmtPrice(n:number):string{
  if(Math.abs(n)>=1000)return n.toLocaleString('en-US',{maximumFractionDigits:2});
  return String(Number(n.toFixed(5)));
}
