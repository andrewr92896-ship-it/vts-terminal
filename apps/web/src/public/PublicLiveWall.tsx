import type { BoardTile } from '../api/types';
import { CalendarTile } from '../workspaces/trading/CalendarTile';
import { ChartTile } from '../workspaces/trading/ChartTile';
import { NewsTile } from '../workspaces/trading/NewsTile';
import { WatchlistTile } from '../workspaces/trading/WatchlistTile';
import { PublicClockTile } from './PublicClockTile';

const noop=()=>{};
const watchlist={ id:'public-watchlist',type:'watchlist',title:'Watchlist',symbols:['OANDA:EURUSD','OANDA:GBPUSD','OANDA:XAUUSD','NASDAQ:NDX'],watchlistMode:'scroll' } as unknown as BoardTile;
const news={ id:'public-news',type:'news',title:'Market News',newsFeedKeys:['all'] } as unknown as BoardTile;
const calendar={ id:'public-calendar',type:'calendar',title:'Economic Calendar',calendarImpact:'medhigh' } as unknown as BoardTile;
// The portal's OWN chart tile, with the portal's own defaults. It was a
// hand-drawn SVG on a `fixture:` src, which is the one thing this arrangement
// is not allowed to do: the demo has to be the same site, and a chart nobody
// can interact with reads as a different product.
const chart={ id:'public-chart',type:'chart',title:'EUR/USD',symbol:'OANDA:EURUSD',interval:'60' } as unknown as BoardTile;

export function PublicLiveWall(){
  return <div><div className="vts-public-wall-head"><div><h1>Live Wall</h1><p>Public market chart, watchlist, factual news, calendar, and market clock.</p></div></div><div className="vts-public-boundary-note">Market information only. Your own records live on the sections in the sidebar.</div><div className="vts-public-wall-grid"><section className="watchlist"><WatchlistTile tile={watchlist} editing={false} onChange={noop} onRemove={noop}/></section><section className="chart"><ChartTile tile={chart} editing={false} onChange={noop} onRemove={noop}/></section><section className="news"><NewsTile tile={news} editing={false} onChange={noop} onRemove={noop}/></section><section className="calendar"><CalendarTile tile={calendar} editing={false} onChange={noop} onRemove={noop}/></section><section className="clock"><PublicClockTile/></section></div></div>;
}
