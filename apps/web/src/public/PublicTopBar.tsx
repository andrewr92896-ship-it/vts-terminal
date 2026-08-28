import type { CSSProperties } from 'react';
import { Clock } from '../components/Clock';
import { Icon } from '../components/Icon';
import { C, GOLD_GRADIENT, tint } from '../theme/tokens';
import { useAuth } from '../auth/AuthContext';

export function PublicTopBar({ workspaceLabel, sectionLabel, accent, onOpenNav }: { workspaceLabel:string; sectionLabel:string; accent:string; onOpenNav:()=>void }) {
  const { user, logout } = useAuth();
  const name = user?.displayName || 'Public account';
  const initial = name.trim().charAt(0).toUpperCase() || 'P';
  return <header style={{ height:64, flex:'none', display:'flex', alignItems:'center', gap:12, padding:'0 20px', background:'#071021', borderBottom:`1px solid ${C.line}`, position:'relative', zIndex:20 }}>
    <button className="vts-public-menu" onClick={onOpenNav} aria-label="Open navigation" style={{...iconBtn,display:'none'}}><Icon name="menu" size={18}/></button>
    <div style={{ display:'flex',alignItems:'center',gap:9,minWidth:0,fontSize:12.5 }}><span style={{color:C.faint}}>{workspaceLabel}</span><span style={{color:C.faint}}>›</span><strong style={{color:C.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{sectionLabel}</strong></div>
    <label style={{ marginLeft:'auto',width:'min(240px,22vw)',height:36,display:'flex',alignItems:'center',gap:8,padding:'0 10px',background:'#060d1c',border:`1px solid ${C.line}`,borderRadius:8,color:C.faint }}><Icon name="search" size={15}/><input aria-label="Search public terminal" placeholder="Search…" style={{minWidth:0,flex:1,background:'none',border:0,outline:0,color:C.text,fontSize:12}}/></label>
    <Clock />
    <button className="vts-public-ai" onClick={() => window.dispatchEvent(new CustomEvent('vts-public-ai'))} title="Help with using the terminal, bug reports and suggestions" style={{ height:36,display:'flex',alignItems:'center',gap:7,padding:'0 14px',border:0,borderRadius:7,background:GOLD_GRADIENT,color:C.goldText,fontWeight:700,cursor:'pointer' }}><Icon name="life-buoy" size={15}/><span>Help &amp; support</span></button>
    <button aria-label="Notifications" style={iconBtn}><Icon name="bell" size={17}/></button>
    {/* There was no way out at all: the account chip has never had a handler
        and the adapter's logout was a stub, so a signed-in public account
        stayed signed in — on a shared computer, for the twelve hours the
        session cookie lasts. */}
    <button aria-label="Sign out" title="Sign out" onClick={() => { void logout(); }} style={iconBtn}><Icon name="log-out" size={17}/></button>
    <button aria-label="Account settings" style={{display:'flex',alignItems:'center',gap:9,background:'none',border:0,color:C.text,cursor:'pointer',padding:0}}><span style={{width:34,height:34,display:'grid',placeItems:'center',borderRadius:'50%',border:`1px solid ${accent}`,boxShadow:`inset 0 0 0 3px ${tint(accent,.1)}`,fontFamily:C.mono,fontSize:12}}>{initial}</span><span className="vts-public-profile-copy" style={{textAlign:'left'}}><strong style={{display:'block',fontSize:12}}>{name}</strong><small style={{display:'block',color:accent,fontSize:8,letterSpacing:'1px'}}>{user?.isDemo?'DEMO':'PUBLIC'}</small></span></button>
  </header>;
}
const iconBtn:CSSProperties={ width:36,height:36,flex:'none',display:'grid',placeItems:'center',color:C.muted,background:'rgba(255,255,255,.02)',border:`1px solid ${C.line2}`,borderRadius:8,cursor:'pointer' };
