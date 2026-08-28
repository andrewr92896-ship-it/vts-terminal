// The hand-kept trade log — the pure half: what a trade is, and how a set of
// them is scored.
//
// WHAT A WIN MEANS HERE, AND WHY IT IS SIMPLER THAN THE PRIVATE SIDE.
//
// The private terminal scores a trade against a BREAK-EVEN BAND the desk sets:
// a percentage, a dollar amount or a pip distance, with per-instrument
// overrides. That band exists because a desk wants a trade that moved two pips
// to read as flat rather than as a win. Setting it is a desk-settings surface,
// and the public terminal has none — so there is no band to honour and nothing
// to diverge from.
//
// So the public log fixes the band at EXACTLY FLAT: a closed trade above its
// entry is a win, below is a loss, and exactly flat is break-even. The payload
// says so in the same fields the private one uses (`percent`, 0, no overrides),
// which matters because the SCREEN recomputes the summary itself whenever a
// filter is on — given the same config it computes the same answer, so the two
// halves cannot disagree about a win rate.
//
// Do not quietly widen the band here. If the public terminal ever gains a
// settings surface, the band becomes stored state and this becomes the private
// classifier; until then a fixed, stated rule is the honest one.

export type TradeSide='long'|'short';
export type TradeStatus='open'|'closed';

export type TradeRow={
  id:string;instrument:string;side:TradeSide;status:TradeStatus;
  plannedEntry:number|null;entryPrice:number;exitPrice:number|null;
  takeProfit:number|null;stopLoss:number|null;units:number;
  realizedPl:number|null;strategy:string|null;timeframe:string|null;notes:string|null;
  openedAt:number;closedAt:number|null;deletedAt:number|null;
  createdAt:number;updatedAt:number;
};

export const MAX_TRADES=5000;
export const MAX_INSTRUMENT_NAME=40;
export const MAX_STRATEGY=60;
export const MAX_NOTES=2000;

export class TradeError extends Error{}

const clean=(value:unknown,max:number):string|null=>{
  const text=typeof value==='string'?value.trim():'';
  return text?text.slice(0,max):null;
};
const finite=(value:unknown,what:string):number|null=>{
  if(value==null||value==='')return null;
  const n=Number(value);
  if(!Number.isFinite(n))throw new TradeError(`${what} has to be a number.`);
  return n;
};

// What a trade is, rebuilt field by field from whatever arrived.
//
// A CLOSED TRADE NEEDS AN EXIT, and an open one must not carry one — those two
// are the same fact stated twice, and letting them disagree puts a trade in the
// closed count with nothing to score it by, or an open one in the realized P/L.
export function readTrade(body:Record<string,unknown>,existing?:TradeRow):TradeRow{
  const instrument=clean(body.instrument,MAX_INSTRUMENT_NAME)??existing?.instrument??null;
  if(!instrument)throw new TradeError('Say which instrument it was.');
  const side=body.side===undefined?(existing?.side??'long'):(body.side==='short'?'short':'long');
  const entryPrice=body.entryPrice===undefined?existing?.entryPrice:finite(body.entryPrice,'The entry price');
  if(entryPrice==null)throw new TradeError('An entry price is needed.');
  const exitPrice=body.exitPrice===undefined?(existing?.exitPrice??null):finite(body.exitPrice,'The exit price');
  const status:TradeStatus=body.status===undefined
    ? (exitPrice!=null?'closed':(existing?.status??'open'))
    : (body.status==='closed'?'closed':'open');
  if(status==='closed'&&exitPrice==null)throw new TradeError('A closed trade needs an exit price.');

  const openedAt=body.openedAt===undefined?(existing?.openedAt??Date.now()):(finite(body.openedAt,'The open time')??Date.now());
  const closedAt=status==='closed'
    ? (body.closedAt===undefined?(existing?.closedAt??Date.now()):(finite(body.closedAt,'The close time')??Date.now()))
    // An OPEN trade has no close time, whatever arrived with it: a trade cannot
    // have finished at a moment it is still running.
    : null;
  if(closedAt!=null&&closedAt<openedAt)throw new TradeError('A trade cannot close before it opened.');

  const units=body.units===undefined?(existing?.units??0):(finite(body.units,'The size')??0);
  if(units<0)throw new TradeError('A size is not negative — the side is what says long or short.');

  return {
    id:existing?.id??'',
    instrument,side,status,
    plannedEntry:body.plannedEntry===undefined?(existing?.plannedEntry??null):finite(body.plannedEntry,'The planned entry'),
    entryPrice,exitPrice,
    takeProfit:body.takeProfit===undefined?(existing?.takeProfit??null):finite(body.takeProfit,'The take profit'),
    stopLoss:body.stopLoss===undefined?(existing?.stopLoss??null):finite(body.stopLoss,'The stop loss'),
    units,
    // NULL UNTIL IT IS KNOWN, never zero. A zero scores as a break-even in the
    // win rate, the profit factor and the totals alike, so an unknown result
    // would quietly count as a flat trade rather than as one not yet scored.
    realizedPl:status==='open'?null:(body.realizedPl===undefined?(existing?.realizedPl??null):finite(body.realizedPl,'The result')),
    strategy:body.strategy===undefined?(existing?.strategy??null):clean(body.strategy,MAX_STRATEGY),
    timeframe:body.timeframe===undefined?(existing?.timeframe??null):clean(body.timeframe,MAX_STRATEGY),
    notes:body.notes===undefined?(existing?.notes??null):clean(body.notes,MAX_NOTES),
    openedAt,closedAt,deletedAt:existing?.deletedAt??null,
    createdAt:existing?.createdAt??Date.now(),updatedAt:Date.now(),
  };
}

// Entry to exit as a share of the entry, signed by the side. The one price
// reading the summary needs — see the note at the top about the band.
export function tradeReturnPct(side:TradeSide,entryPrice:number|null,exitPrice:number|null):number|null{
  if(entryPrice==null||exitPrice==null||entryPrice===0)return null;
  const move=(exitPrice-entryPrice)/entryPrice;
  return (side==='short'?-move:move)*100;
}

export type Outcome='win'|'loss'|'breakeven';

// Scored on the PRICE where there is one, falling back to the money.
//
// The fallback is what covers a trade whose prices were not written down but
// whose result was — and a result of exactly zero is a break-even, not a loss.
export function classifyOutcome(trade:Pick<TradeRow,'side'|'entryPrice'|'exitPrice'|'realizedPl'>):Outcome{
  const pct=tradeReturnPct(trade.side,trade.entryPrice,trade.exitPrice);
  if(pct!=null){
    if(pct===0)return 'breakeven';
    return pct>0?'win':'loss';
  }
  const pl=trade.realizedPl??0;
  if(pl===0)return 'breakeven';
  return pl>0?'win':'loss';
}

export type TradeSummary={
  total:number;open:number;closed:number;wins:number;losses:number;breakeven:number;
  winRate:number;totalRealizedPl:number|null;totalUnrealizedPl:number|null;avgSlippage:number|null;
};

// The KPI row, computed the way the screen computes it.
//
// `totalUnrealizedPl` is NULL rather than 0: an open hand-kept trade has no
// live price behind it, so what it is currently worth is not something anybody
// here can know — and a zero would read as "every open trade is flat".
// `avgSlippage` is null when no trade stated a plan, for the same reason.
export function summarize(trades:TradeRow[]):TradeSummary{
  let open=0,closed=0,wins=0,losses=0,breakeven=0,totalPl=0,scored=0,slipSum=0,slipCount=0;
  for(const trade of trades){
    if(trade.status==='open')open+=1;else closed+=1;
    if(trade.realizedPl!=null){totalPl+=trade.realizedPl;scored+=1}
    if(trade.status==='closed'){
      const outcome=classifyOutcome(trade);
      if(outcome==='win')wins+=1;else if(outcome==='loss')losses+=1;else breakeven+=1;
    }
    if(trade.plannedEntry!=null){
      // Entry minus plan, signed so that a worse fill is positive slippage on
      // both sides: a long filled above its plan and a short filled below it
      // have both paid something away.
      const slip=trade.side==='short'?trade.plannedEntry-trade.entryPrice:trade.entryPrice-trade.plannedEntry;
      slipSum+=slip; slipCount+=1;
    }
  }
  const decided=wins+losses;
  return {
    total:trades.length,open,closed,wins,losses,breakeven,
    winRate:decided>0?wins/decided:0,
    // Null when nothing has been scored — never 0, which reads as "flat" rather
    // than "nothing has been recorded yet".
    totalRealizedPl:scored>0?Number(totalPl.toFixed(2)):null,
    totalUnrealizedPl:null,
    avgSlippage:slipCount>0?Number((slipSum/slipCount).toFixed(8)):null,
  };
}
