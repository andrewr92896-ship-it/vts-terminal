// Study games — the pure half: what a question must be, what a category list
// and its weights mean, and how a stored game state is read.
//
// The level ladder itself is NOT modelled here, deliberately. It lives in the
// web client's shared engine, and the state blob is stored whole and opaque
// exactly as the private side stores it — a second, server-side interpretation
// of what level somebody is on would be a second answer to a question that must
// have one. What is read out of the blob is only the three headline numbers a
// banked run records, and `stepForCorrect` is here for the one case the stored
// blob predates the field.
//
// WHAT IS ABSENT, AND WHY IT IS ABSENT RATHER THAN DISABLED
//
// There is NO leaderboard. On the private side a built-in game is ranked across
// every copy of itself on the whole install; doing that here would put one
// public visitor's display name and accuracy on a stranger's screen. That is a
// product and privacy decision with a moderation dimension — display names are
// typed by the person — and not something to arrive at as a side effect of
// porting a table. So every deck reports `hasLeaderboard: false`, there is no
// board route, and the client hides the tab rather than opening an empty one.

export type OptionLabel='A'|'B'|'C'|'D';
export const OPTION_LABELS:OptionLabel[]=['A','B','C','D'];

export type DeckQuestion={
  seq:number;topic:string;stem:string;
  options:Array<{label:OptionLabel;text:string}>;
  answer:OptionLabel;explanation:string|null;sourceName:string|null;
};

// Runaway-input guards, not product limits. The 1,000 ceiling is the same
// figure the private deck-confirm route and the package blueprint use, so a
// game can never be built at a size that could not be saved.
export const MAX_QUESTIONS=1000;
export const MAX_DECKS=200;
export const MAX_NAME=120;
export const MAX_DESCRIPTION=500;
export const MAX_STEM=2000;
export const MAX_OPTION=600;
export const MAX_EXPLANATION=2000;
export const MAX_TOPIC=80;
export const MAX_CATEGORIES=60;
// The state blob is written by the client and stored whole. The cap is the
// private side's, so a state that saves on one terminal saves on the other — and
// the study routes read their body with an allowance at least this large, or the
// cap would be unreachable and every large save would fail as "too big" instead.
export const MAX_STATE_BYTES=200_000;

export class StudyError extends Error{}

const clean=(value:unknown,max:number):string=>typeof value==='string'?value.trim().slice(0,max):'';

// One question, rebuilt field by field from whatever arrived.
//
// EVERY QUESTION NEEDS FOUR LABELLED OPTIONS AND AN ANSWER AMONG THEM. A deck
// missing one option renders a button that cannot be pressed, and an answer key
// naming an option that is not there makes the question unanswerable — both of
// which look like a broken game rather than a bad import, which is why they are
// refused here with the question NAMED rather than accepted and rendered.
export function readQuestion(raw:unknown,index:number):DeckQuestion{
  const at=`Question ${index+1}`;
  if(!raw||typeof raw!=='object')throw new StudyError(`${at} is not a question.`);
  const value=raw as Record<string,unknown>;
  const stem=clean(value.stem,MAX_STEM);
  if(!stem)throw new StudyError(`${at} has no question text.`);
  const options=Array.isArray(value.options)?value.options:[];
  const byLabel=new Map<OptionLabel,string>();
  for(const option of options){
    if(!option||typeof option!=='object')continue;
    const entry=option as Record<string,unknown>;
    const label=String(entry.label??'').toUpperCase() as OptionLabel;
    if(!OPTION_LABELS.includes(label))continue;
    const text=clean(entry.text,MAX_OPTION);
    if(text)byLabel.set(label,text);
  }
  for(const label of OPTION_LABELS){
    if(!byLabel.has(label))throw new StudyError(`${at} is missing option ${label}.`);
  }
  const answer=String(value.answer??'').toUpperCase() as OptionLabel;
  if(!OPTION_LABELS.includes(answer))throw new StudyError(`${at} does not say which option is correct.`);
  return {
    seq:index+1,
    topic:clean(value.topic,MAX_TOPIC),
    stem,
    options:OPTION_LABELS.map((label)=>({label,text:byLabel.get(label)!})),
    answer,
    explanation:clean(value.explanation,MAX_EXPLANATION)||null,
    sourceName:clean(value.sourceName,MAX_NAME)||null,
  };
}

export function readQuestions(raw:unknown):DeckQuestion[]{
  if(!Array.isArray(raw)||raw.length===0)throw new StudyError('A study game needs at least one question.');
  if(raw.length>MAX_QUESTIONS)throw new StudyError(`That is more than ${MAX_QUESTIONS} questions.`);
  // Numbered from 1 HERE, by position in the list that arrived, so the seq is
  // the server's to assign. A client-supplied seq could collide with itself and
  // silently overwrite a question on the way in.
  return raw.map((question,index)=>readQuestion(question,index));
}

// The category list, deduplicated case-insensitively but KEPT AS TYPED. The
// name is what every question's `topic`, the stored weights and each learner's
// per-category history are all keyed on, so the author's own capitalisation is
// what has to survive.
export function readCategories(raw:unknown):string[]{
  if(!Array.isArray(raw))return [];
  const seen=new Set<string>(); const out:string[]=[];
  for(const value of raw){
    const name=clean(value,MAX_TOPIC);
    if(!name)continue;
    const key=name.toLowerCase();
    if(seen.has(key))continue;
    seen.add(key); out.push(name);
    if(out.length>=MAX_CATEGORIES)break;
  }
  return out;
}

// The exam blueprint: what each category is worth.
//
// NULL IS "UNWEIGHTED" AND IS NOT THE SAME AS EVERY WEIGHT BEING ZERO. Null is
// what every game that predates weighting is, and it means "score this plainly";
// all-zero is a paper with nothing on it. Weights are stored RAW and normalized
// when they are read, so a list half-typed does not block a save — and a weight
// whose category has since been renamed or removed is dropped rather than left
// counting toward a denominator nothing can see.
export function readCategoryWeights(raw:unknown,categories:string[]):Record<string,number>|null{
  if(raw==null)return null;
  if(typeof raw!=='object'||Array.isArray(raw))throw new StudyError('Weights are a list of categories and numbers.');
  const known=new Map(categories.map((name)=>[name.toLowerCase(),name]));
  const out:Record<string,number>={};
  for(const [name,value] of Object.entries(raw as Record<string,unknown>)){
    const category=known.get(String(name).trim().toLowerCase());
    if(!category)continue;
    const weight=Number(value);
    if(!Number.isFinite(weight)||weight<0||weight>100)throw new StudyError(`The weight for ${category} is a number from 0 to 100.`);
    out[category]=weight;
  }
  return Object.keys(out).length>0?out:null;
}

// A game state is stored WHOLE and OPAQUE, so all that is checked is that it is
// JSON of a sensible size. Interpreting it here would be a second reading of the
// learner's level.
export function normalizeState(raw:unknown):string|null{
  if(typeof raw!=='string')return null;
  if(raw.length===0||raw.length>MAX_STATE_BYTES)return null;
  try{
    const parsed=JSON.parse(raw);
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return null;
    return raw;
  }catch{
    return null;
  }
}

// ---- The one thing read OUT of a state blob ---------------------------------
//
// The level ladder, mirrored from the web client's engine: 12 levels x 5
// sub-levels, each sub-level costing one more correct answer than the last
// (10, 11, 12, …). It is needed only to derive a banked run's "best level
// reached" when the stored blob predates that field.
const BASE_SUBLEVEL_COST=10;
const MAX_LEVEL_STEP=12*5-1; // 59

function correctToReachStep(step:number):number{
  const s=Math.max(0,Math.min(MAX_LEVEL_STEP+1,Math.floor(step)));
  return BASE_SUBLEVEL_COST*s+(s*(s-1))/2;
}

export function stepForCorrect(correct:number):number{
  const target=Math.max(0,Math.floor(correct)||0);
  let step=0;
  while(step<MAX_LEVEL_STEP&&correctToReachStep(step+1)<=target)step++;
  return step;
}

export type RunStats={attempted:number;correct:number;bestStep:number};

// A run with nothing answered in it is not a run, so it returns null and is not
// banked — the same reason an empty state never reaches the private board.
export function statsFromState(raw:string):RunStats|null{
  let parsed:unknown;
  try{parsed=JSON.parse(raw)}catch{return null}
  if(!parsed||typeof parsed!=='object')return null;
  const state=parsed as Record<string,unknown>;
  const attempted=Number(state.totalAttempted)||0;
  const correct=Number(state.totalCorrect)||0;
  if(attempted<=0)return null;
  // Honour the stored high-water mark, but never below what the level count
  // already implies: the ladder advances on the streak-scaled `levelCorrect`,
  // and an older save carries no `bestStep` at all.
  const levelCorrect=Number(state.levelCorrect)||correct;
  return {attempted,correct,bestStep:Math.max(Number(state.bestStep)||0,stepForCorrect(levelCorrect))};
}

// ---- Flashcards -------------------------------------------------------------

export type Flashcard={seq:number;term:string;def:string;topic:string|null};

export const MAX_CARDS=2000;
export const MAX_TERM=600;
export const MAX_DEF=4000;

// A card needs BOTH sides. One without a definition renders as a card that
// cannot be turned over, which reads as a broken set rather than a bad import,
// so it is refused here with the card named.
export function readCards(raw:unknown):Flashcard[]{
  if(!Array.isArray(raw)||raw.length===0)throw new StudyError('A flashcard set needs at least one card.');
  if(raw.length>MAX_CARDS)throw new StudyError(`That is more than ${MAX_CARDS} cards.`);
  return raw.map((value,index)=>{
    const at=`Card ${index+1}`;
    if(!value||typeof value!=='object')throw new StudyError(`${at} is not a card.`);
    const card=value as Record<string,unknown>;
    const term=clean(card.term,MAX_TERM);
    if(!term)throw new StudyError(`${at} has no term.`);
    const def=clean(card.def,MAX_DEF);
    if(!def)throw new StudyError(`${at} has nothing on the back.`);
    // Numbered from 1 HERE, by position. A client-supplied seq could collide
    // with itself and silently drop a card on the way in.
    return {seq:index+1,term,def,topic:clean(card.topic,MAX_TOPIC)||null};
  });
}

// ---- Study presentations ----------------------------------------------------

export type GuideSlide={id:string|null;title:string;body:string;image:string|null};

export const MAX_SLIDES=40;
export const MAX_SLIDE_TITLE=200;
export const MAX_SLIDE_BODY=4000;
// A screenshot arrives as a base64 data URL, which is why the routes that write
// a presentation carry a far larger body allowance than anything else here.
export const MAX_SLIDE_IMAGE=4_000_000;

// WHAT MAKES A SLIDE THE SAME SLIDE TOMORROW.
//
// A presentation is stored as one blob, so an array position identifies nothing
// — it changes the moment somebody drags a slide up the deck. Each slide
// therefore carries its own id, and these two functions are the whole mechanism:
//
//   * `keepSlideId` NEVER MINTS, because it runs on READ as well as write. A
//     read that invented identity would hand out a different id every time.
//   * `withSlideIds` mints only for a slide that has none — new, or from a
//     presentation that predates ids.
//
// The consequence to remember: the id has to ROUND-TRIP through the editor, or
// every save looks like a deck of brand new slides.
export function keepSlideId(raw:unknown):string|null{
  const value=(raw??{}) as {id?:unknown};
  return typeof value.id==='string'&&value.id.trim()?value.id.trim().slice(0,80):null;
}

// One slide, read. `mint` supplies an id for a slide that has none — passed in
// rather than called here so this same function serves reads and writes.
function readSlide(raw:unknown,mint:(()=>string)|null,index=0):GuideSlide|null{
  if(!raw||typeof raw!=='object')return null;
  const value=raw as Record<string,unknown>;
  const title=clean(value.title,MAX_SLIDE_TITLE);
  const body=clean(value.body,MAX_SLIDE_BODY);
  let image:string|null=null;
  if(typeof value.image==='string'&&value.image.startsWith('data:image/')){
    // AN OVERSIZED SCREENSHOT IS REFUSED, NOT DROPPED. Dropping it saves the
    // presentation with a slide the author believes has a picture on it, and
    // they find out when they present. Same family of rule as a preset chip the
    // trader typed: something somebody put there must not vanish unexplained.
    if(value.image.length>MAX_SLIDE_IMAGE){
      throw new StudyError(`The image on slide ${index+1} is too large. Scale it down and try again.`);
    }
    image=value.image;
  }
  // A slide with neither text nor a picture is nothing at all, and presenting it
  // is a blank screen the author cannot see the cause of.
  if(!title&&!body&&!image)return null;
  const id=keepSlideId(value);
  return {id:id??(mint?mint():null),title,body,image};
}

export function readSlides(raw:unknown,mint:()=>string):GuideSlide[]{
  if(!Array.isArray(raw))throw new StudyError('A presentation needs slides.');
  const out:GuideSlide[]=[];
  raw.forEach((value,index)=>{
    if(out.length>=MAX_SLIDES)return;
    const slide=readSlide(value,mint,index);
    if(slide)out.push(slide);
  });
  if(out.length===0)throw new StudyError('A presentation needs at least one slide with something on it.');
  return out;
}

// Slides on the way OUT. Mints nothing — see keepSlideId.
export function slidesForRead(raw:unknown):GuideSlide[]{
  if(!Array.isArray(raw))return [];
  const out:GuideSlide[]=[];
  for(const value of raw){
    const slide=readSlide(value,null);
    if(slide)out.push(slide);
  }
  return out;
}
