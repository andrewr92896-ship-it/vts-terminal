import { useEffect,useMemo,useState } from 'react';
import { PublicLogin } from './PublicLogin';
import { PublicSidebar } from './PublicSidebar';
import { PublicTopBar } from './PublicTopBar';
import { PublicScreen } from './PublicScreens';
import { publicAuth, isDemo, startDemo, setPublicUser } from './PublicRuntime';

import { PUBLIC_NAV,publicWorkspaceFor,type PublicScreenKey } from './publicNav';
const query=new URLSearchParams(location.search);const evidence=isDemo();const first=(location.hash.slice(1)||'live') as PublicScreenKey;
const allowed=new Set(PUBLIC_NAV.flatMap((workspace)=>workspace.sections.map((section)=>section.key)));
export function PublicApp(){
 const initial=allowed.has(first)?first:'live';const [verified,setVerified]=useState(evidence);const [checking,setChecking]=useState(!evidence);const [passwordChangeRequired,setPasswordChangeRequired]=useState(false);const [authStep,setAuthStep]=useState<'login'|'early-access'|null>(null);const [screen,setScreen]=useState<PublicScreenKey>(initial);
 const [collapsed,setCollapsed]=useState(query.get('sidebar')==='collapsed'||(!query.has('sidebar')&&innerWidth<=1024));const [mobileOpen,setMobileOpen]=useState(query.get('sidebar')==='expanded'&&innerWidth<=768);
 const workspaceNav=useMemo(()=>publicWorkspaceFor(screen),[screen]);
 useEffect(()=>{if(evidence){setPublicUser({id:'demo-user',username:'demo',displayName:'Demo',isDemo:true});return}publicAuth.session().then((value)=>{setPublicUser({id:value.user.id,username:value.user.email.split('@')[0]??'public',displayName:value.user.displayName,email:value.user.email});setPasswordChangeRequired(value.passwordChangeRequired);setVerified(!value.passwordChangeRequired)}).catch(()=>setVerified(false)).finally(()=>setChecking(false))},[]);
 useEffect(()=>{const onHash=()=>{const next=location.hash.slice(1) as PublicScreenKey;if(allowed.has(next))setScreen(next)};addEventListener('hashchange',onHash);return()=>removeEventListener('hashchange',onHash)},[]);
 useEffect(()=>{const onAi=()=>{location.hash='hp_howto'};addEventListener('vts-public-ai',onAi);return()=>removeEventListener('vts-public-ai',onAi)},[]);
 if(checking)return null;if(!verified||authStep)return <PublicLogin initialStep={authStep==='early-access'||query.get('screen')==='early-access'?'early-access':passwordChangeRequired?'change-password':query.get('screen')==='two-factor'?'two-factor':'login'} onVerified={()=>{setAuthStep(null);setPasswordChangeRequired(false);setVerified(true)}} onDemo={()=>{setAuthStep(null);startDemo();setPublicUser({id:'demo-user',username:'demo',displayName:'Demo',isDemo:true});setVerified(true)}} onClose={authStep&&verified?()=>setAuthStep(null):undefined}/>;
 const select=(next:PublicScreenKey)=>{if(!allowed.has(next))return;location.hash=next;setScreen(next);setMobileOpen(false)};
 const selected=workspaceNav.sections.find((section)=>section.key===screen)??workspaceNav.sections[0];
 return <div className="vts-public-shell" data-collapsed={collapsed} data-mobile-open={mobileOpen}><PublicSidebar workspace={workspaceNav.key} screen={screen} collapsed={collapsed} onToggle={()=>setCollapsed((value)=>!value)} onSelectWorkspace={(next)=>select(PUBLIC_NAV.find((item)=>item.key===next)!.sections[0]!.key)} onSelectScreen={select}/><section className="vts-public-column"><PublicTopBar workspaceLabel={workspaceNav.label} sectionLabel={selected?.label??workspaceNav.label} accent={workspaceNav.accent} onOpenNav={()=>setMobileOpen(true)}/><main className="vts-public-main">{isDemo()&&<div className="vts-public-demo-bar"><strong>DEMO</strong><span>Sample data. Nothing is saved, and everything resets when you leave. Informational only.</span><button onClick={()=>setAuthStep('early-access')}>Request early access</button></div>}<PublicScreen screen={screen} workspace={workspaceNav.key} onNavigate={select}/></main><footer className="vts-public-footer"><span>VTS Public Terminal · Informational use only</span><span><a href="#hp_terms">Terms</a> · <a href="#hp_privacy">Privacy</a> · <a href="#hp_howto">Help</a></span></footer></section>{mobileOpen&&<button aria-label="Close navigation" onClick={()=>setMobileOpen(false)} style={{position:'fixed',inset:0,zIndex:70,background:'rgba(0,0,0,.55)',border:0}}/>}</div>;
}
declare global{interface Window{__VTS_PUBLIC_BOUNDARY__?:{routes:readonly string[];sessionCookie:string;evidence:boolean}}}
window.__VTS_PUBLIC_BOUNDARY__={routes:[...allowed],sessionCookie:'vts_public_session_v1',evidence};
