import { useEffect, useMemo, useState } from 'react';
import { MarketData } from '../workspaces/trading/MarketData';
import { PublicLiveWall } from './PublicLiveWall';
import { PublicLogin } from './PublicLogin';
import { PublicSidebar } from './PublicSidebar';
import { PublicTopBar } from './PublicTopBar';
import { PUBLIC_NAV, type PublicScreenKey, type PublicWorkspaceKey } from './publicNav';

const query=new URLSearchParams(location.search);
const evidence=query.get('evidence')==='1';
const initial=(location.hash.slice(1)||'live') as PublicScreenKey;

export function PublicApp(){
  const [verified,setVerified]=useState(evidence);
  const [screen,setScreen]=useState<PublicScreenKey>(initial==='data'?'data':'live');
  const [collapsed,setCollapsed]=useState(query.get('sidebar')==='collapsed'||innerWidth<=1024);
  const [mobileOpen,setMobileOpen]=useState(false);
  const workspace=useMemo<PublicWorkspaceKey>(()=>screen==='data'?'myportal':'trading',[screen]);
  const workspaceNav=PUBLIC_NAV.find((item)=>item.key===workspace)!;
  useEffect(()=>{ const onHash=()=>{const next=location.hash.slice(1);if(next==='live'||next==='data')setScreen(next)};addEventListener('hashchange',onHash);return()=>removeEventListener('hashchange',onHash)},[]);
  useEffect(()=>{ const onAi=()=>alert('VTS AI is limited to terminal help, troubleshooting, tickets, study assistance, and trade-image extraction.');addEventListener('vts-public-ai',onAi);return()=>removeEventListener('vts-public-ai',onAi)},[]);
  if(!verified)return <PublicLogin initialStep={query.get('screen')==='two-factor'?'two-factor':'email'} onVerified={()=>setVerified(true)}/>;
  const select=(next:PublicScreenKey)=>{if(next!=='live'&&next!=='data')return;location.hash=next;setScreen(next);setMobileOpen(false)};
  return <div className="vts-public-shell" data-collapsed={collapsed} data-mobile-open={mobileOpen}><PublicSidebar workspace={workspace} screen={screen} collapsed={collapsed} onToggle={()=>setCollapsed((value)=>!value)} onSelectWorkspace={(next)=>select(next==='myportal'?'data':'live')} onSelectScreen={select}/><section className="vts-public-column"><PublicTopBar workspaceLabel={workspaceNav.label} sectionLabel={screen==='data'?'Market Data':'Live Wall'} accent={workspaceNav.accent} onOpenNav={()=>setMobileOpen(true)}/><main className="vts-public-main">{screen==='data'?<MarketData/>:<PublicLiveWall/>}</main><footer className="vts-public-footer"><span>VTS Public Terminal · Informational use only</span><span><a href="#terms">Terms</a> · <a href="#privacy">Privacy</a> · <a href="#help">Help</a></span></footer></section>{mobileOpen&&<button aria-label="Close navigation" onClick={()=>setMobileOpen(false)} style={{position:'fixed',inset:0,zIndex:70,background:'rgba(0,0,0,.55)',border:0}}/>}</div>;
}

declare global { interface Window { __VTS_PUBLIC_BOUNDARY__?: { routes:readonly string[]; sessionCookie:string; evidence:boolean } } }
window.__VTS_PUBLIC_BOUNDARY__={routes:['login','two-factor','live','data'],sessionCookie:'vts_public_session',evidence};
