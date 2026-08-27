import type { CSSProperties } from 'react';
import { useNowTick } from '../hooks/useNowTick';
import { zoneAbbr, zoneFmt } from '../lib/timezone';
import { clockLabel, etClock, sessionOpen } from '../workspaces/trading/etClock';
import { TileFrame } from '../workspaces/trading/tiles/TileFrame';
import { FAINT, GREEN, MONO, MUTED, TEXT } from '../workspaces/trading/tvChart';

// Exact public-safe adaptation of the portal Market Clock tile. Its market
// session windows remain Eastern; only the board-management props are removed.
const SESSIONS:{label:string;window:[number,number]}[]=[
  {label:'Sydney',window:[17*60,2*60]},
  {label:'Tokyo',window:[19*60,4*60]},
  {label:'London',window:[3*60,11*60+30]},
  {label:'New York',window:[8*60,17*60]},
  {label:'NYSE / Nasdaq',window:[9*60+30,16*60]},
];
export function PublicClockTile(){
  const now=useNowTick(1000);const readerZone=zoneAbbr(now);const readerTime=zoneFmt({hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(now);const openCount=SESSIONS.filter((item)=>sessionOpen(now,item.window)).length;
  return <TileFrame title="Market Clock" icon="clock" count={`${openCount} open`} editing={false} onRemove={()=>{}} status={<span style={{fontSize:10,color:FAINT,fontFamily:MONO}}>{etClock(now)} ET</span>}>{SESSIONS.map((item)=>{const open=sessionOpen(now,item.window);return <div key={item.label} style={seriesRow}><div style={{display:'flex',alignItems:'center',gap:8,minWidth:0,flex:1}}><span style={{...dot,background:open?GREEN:'#3b4a70'}}/><span style={{fontSize:12,color:TEXT}}>{item.label}</span></div><span style={{fontSize:10,color:open?GREEN:MUTED,fontFamily:MONO,flex:'none'}}>{open?`closes ${clockLabel(item.window[1])}`:`opens ${clockLabel(item.window[0])}`}</span></div>})}<div style={zoneLine}>Sessions in ET · your clock {readerTime} {readerZone}</div></TileFrame>;
}
const seriesRow:CSSProperties={display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,padding:'8px 12px',borderBottom:'1px solid rgba(22,41,79,.5)'};
const dot:CSSProperties={width:7,height:7,borderRadius:'50%',flex:'none'};
const zoneLine:CSSProperties={padding:'9px 12px',fontSize:10,color:FAINT,fontFamily:MONO,lineHeight:1.5};
