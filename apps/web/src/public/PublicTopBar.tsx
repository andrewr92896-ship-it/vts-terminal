import type { CSSProperties } from 'react';
import { Clock } from '../components/Clock';
import { Icon } from '../components/Icon';
import { C, GOLD_GRADIENT, tint } from '../theme/tokens';
import { useAuth } from '../auth/AuthContext';
import { useResponsive } from '../hooks/useMediaQuery';
import { isDemo } from './PublicRuntime';

// The public terminal's top bar.
//
// IT SIZES ITSELF IN THE COMPONENT RATHER THAN IN public.css, and that is not a
// preference — the shell is styled inline, so a plain CSS rule loses to the
// inline value every time. The first attempt at the phone layout put the padding
// and the icon-only Help button in a media query; neither applied, the row
// overflowed 390px, and flex compressed the Help button to the width of its icon
// (15px) while the account chip hung off the right edge. `useResponsive` reads
// the same 768 the stylesheet uses for the drawer, so there is one breakpoint.
//
// What the phone drops, and why: the workspace half of the breadcrumb (it is the
// highlighted row in the drawer one tap away, and it wrapped and squeezed the
// SECTION name into an ellipsis), the search box, the clock's date line and its
// seconds, and the profile name beside the avatar. What stays is where you are,
// the time, help, sign out, and the account.
export function PublicTopBar({ workspaceLabel, sectionLabel, accent, onOpenNav }: { workspaceLabel:string; sectionLabel:string; accent:string; onOpenNav:()=>void }) {
  const { user, logout } = useAuth();
  const { isTablet } = useResponsive();
  const name = user?.displayName || 'Public account';
  const initial = name.trim().charAt(0).toUpperCase() || 'P';
  return <header style={{ height:64, flex:'none', display:'flex', alignItems:'center', gap:isTablet?8:12, padding:isTablet?'0 12px':'0 20px', background:'#071021', borderBottom:`1px solid ${C.line}`, position:'relative', zIndex:20 }}>
    <button className="vts-public-menu" onClick={onOpenNav} aria-label="Open navigation" style={{...iconBtn,display:'none'}}><Icon name="menu" size={18}/></button>

    {/* The one element allowed to shrink. Everything to its right is `flex:none`,
        so the squeeze lands on the breadcrumb — which has an ellipsis for it —
        instead of on the buttons, which do not. */}
    <div style={{ display:'flex',alignItems:'center',gap:9,minWidth:0,flex:'1 1 auto',fontSize:12.5 }}>
      {!isTablet && <><span style={{color:C.faint,whiteSpace:'nowrap'}}>{workspaceLabel}</span><span style={{color:C.faint}}>›</span></>}
      <strong style={{color:C.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{sectionLabel}</strong>
    </div>

    {!isTablet && (
      <label style={{ width:'min(240px,22vw)',flex:'none',height:36,display:'flex',alignItems:'center',gap:8,padding:'0 10px',background:'#060d1c',border:`1px solid ${C.line}`,borderRadius:8,color:C.faint }}>
        <Icon name="search" size={15}/>
        <input aria-label="Search public terminal" placeholder="Search…" style={{minWidth:0,flex:1,background:'none',border:0,outline:0,color:C.text,fontSize:12}}/>
      </label>
    )}

    <div style={{ display:'flex',alignItems:'center',gap:isTablet?8:12,flex:'0 0 auto' }}>
      <Clock seconds={!isTablet} />
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('vts-public-ai'))}
        aria-label="Help and support"
        title="Help with using the terminal, bug reports and suggestions"
        style={{ height:36,flex:'none',display:'flex',alignItems:'center',justifyContent:'center',gap:7,padding:isTablet?0:'0 14px',width:isTablet?36:undefined,border:0,borderRadius:7,background:GOLD_GRADIENT,color:C.goldText,fontWeight:700,cursor:'pointer' }}
      >
        <Icon name="life-buoy" size={15}/>{!isTablet && <span>Help &amp; support</span>}
      </button>

      {/* THE NOTIFICATIONS BELL IS GONE, not hidden at small widths. It had no
          handler anywhere and never has — pressing it did nothing at every
          width — and the public terminal sends no notifications at all: nothing
          is delivered to a phone or a browser on this side, so there was nothing
          for it to open. A control that appears and does nothing is worse than
          one that is missing. */}

      {/* There was no way out at all: the adapter's logout was a stub and nothing
          called it, so a signed-in public account stayed signed in — on a shared
          computer, for the twelve hours the session cookie lasts. */}
      <button aria-label="Sign out" title="Sign out" onClick={() => { void logout(); }} style={iconBtn}><Icon name="log-out" size={17}/></button>

      {/* Same story as the bell, with the opposite fix: this chip was already
          labelled "Account settings" and had no handler either. There IS a
          settings screen to send it to, so it goes there. An event because this
          component sits above the router and holds no navigator — the same way
          the Help button reaches the shell. */}
      <button aria-label="Account settings" title="Account settings" onClick={() => window.dispatchEvent(new CustomEvent('vts-public-account'))} style={{display:'flex',alignItems:'center',gap:9,flex:'none',background:'none',border:0,color:C.text,cursor:'pointer',padding:0}}>
        <span style={{width:34,height:34,flex:'none',display:'grid',placeItems:'center',borderRadius:'50%',border:`1px solid ${accent}`,boxShadow:`inset 0 0 0 3px ${tint(accent,.1)}`,fontFamily:C.mono,fontSize:12}}>{initial}</span>
        {!isTablet && <span style={{textAlign:'left'}}><strong style={{display:'block',fontSize:12}}>{name}</strong><small style={{display:'block',color:accent,fontSize:8,letterSpacing:'1px'}}>{isDemo()?'DEMO':'PUBLIC'}</small></span>}
      </button>
    </div>
  </header>;
}
const iconBtn:CSSProperties={ width:36,height:36,flex:'none',display:'grid',placeItems:'center',color:C.muted,background:'rgba(255,255,255,.02)',border:`1px solid ${C.line2}`,borderRadius:8,cursor:'pointer' };
