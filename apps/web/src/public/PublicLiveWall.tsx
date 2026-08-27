import type { CSSProperties } from 'react';
import type { BoardTile } from '../api/types';
import { C } from '../theme/tokens';
import { CalendarTile } from '../workspaces/trading/CalendarTile';
import { NewsTile } from '../workspaces/trading/NewsTile';
import { WatchlistTile } from '../workspaces/trading/WatchlistTile';
import { TvWidget } from '../workspaces/trading/TvWidget';
import { PublicClockTile } from './PublicClockTile';

const noop=()=>{};
const watchlist={ id:'public-watchlist',type:'watchlist',title:'Watchlist',symbols:['OANDA:EURUSD','OANDA:GBPUSD','OANDA:XAUUSD','NASDAQ:NDX'],watchlistMode:'scroll' } as unknown as BoardTile;
const news={ id:'public-news',type:'news',title:'Market News',newsFeedKeys:['all'] } as unknown as BoardTile;
const calendar={ id:'public-calendar',type:'calendar',title:'Economic Calendar',calendarImpact:'medhigh' } as unknown as BoardTile;

export function PublicLiveWall(){
  return <div><div className="vts-public-wall-head"><div><h1>Live Wall</h1><p>Public market chart, watchlist, factual news, calendar, and market clock.</p></div><div style={tabs}><button style={activeTab}>Board</button></div></div><div className="vts-public-board-label">Layout <span>Markets ▾</span><span>☆ Edit layout</span></div><div className="vts-public-boundary-note">Market information only. Your own records live on the sections in the sidebar.</div><div className="vts-public-wall-grid"><section className="watchlist"><WatchlistTile tile={watchlist} editing={false} onChange={noop} onRemove={noop}/></section><section className="chart"><div style={panelTitle}>EUR/USD <small>DEMO DATA</small></div><div className="vts-public-chart-wrap"><TvWidget src="fixture:advanced-chart" config={{symbol:'OANDA:EURUSD',interval:'60',theme:'dark'}} configKey="public-eurusd-1h"/></div></section><section className="news"><NewsTile tile={news} editing={false} onChange={noop} onRemove={noop}/></section><section className="calendar"><CalendarTile tile={calendar} editing={false} onChange={noop} onRemove={noop}/></section><section className="clock"><PublicClockTile/></section></div></div>;
}
const tabs:CSSProperties={display:'flex',border:`1px solid ${C.line2}`,borderRadius:8,padding:3};
const activeTab:CSSProperties={border:0,borderRadius:6,background:`linear-gradient(180deg,${C.gold},#C9A24B)`,color:C.goldText,padding:'7px 14px',fontWeight:700};
const panelTitle:CSSProperties={height:38,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 12px',borderBottom:`1px solid ${C.line2}`,color:'#fff',fontSize:12.5,fontWeight:700};
