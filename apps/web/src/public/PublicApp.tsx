import { useEffect,useMemo,useState } from 'react';
import { PublicLogin } from './PublicLogin';
import { PublicSidebar } from './PublicSidebar';
import { PublicTopBar } from './PublicTopBar';
import { PublicScreen } from './PublicScreens';
import { publicAuth, isDemo, startDemo, setPublicUser, readPublicUser } from './PublicRuntime';
import { useResponsive } from '../hooks/useMediaQuery';
import { MyTerminalCustomizer } from '../components/MyTerminalCustomizer';
import { MY_TERMINAL_WORKSPACE, myTerminalSections, parseMyTerminal, type MyTerminalLayout, type NavLike } from '../theme/myTerminal';

import { PUBLIC_NAV,publicNavFor,publicWorkspaceFor,type PublicScreenKey,type PublicWorkspaceKey } from './publicNav';

// Every public workspace is reachable by every public account — there are no
// roles, no opt-ins and no grants on this side — so the customizer's reach is a
// constant rather than something computed per visitor.
const PUBLIC_REACH={workspaces:PUBLIC_NAV.map((w)=>w.key),canFunded:false,canTeams:false};
const query=new URLSearchParams(location.search);const evidence=isDemo();const first=(location.hash.slice(1)||'live') as PublicScreenKey;
const allowed=new Set(PUBLIC_NAV.flatMap((workspace)=>workspace.sections.map((section)=>section.key)));
export function PublicApp(){
 const initial=allowed.has(first)?first:'live';const [verified,setVerified]=useState(evidence);const [checking,setChecking]=useState(!evidence);const [passwordChangeRequired,setPasswordChangeRequired]=useState(false);const [authStep,setAuthStep]=useState<'login'|'early-access'|null>(null);const [screen,setScreen]=useState<PublicScreenKey>(initial);
 const [collapsed,setCollapsed]=useState(query.get('sidebar')==='collapsed'||(!query.has('sidebar')&&innerWidth<=1024));const [mobileOpen,setMobileOpen]=useState(query.get('sidebar')==='expanded'&&innerWidth<=768);
 // BELOW 768 THE SIDEBAR IS A DRAWER, AND A DRAWER MUST NEVER BE COLLAPSED.
 // `collapsed` initialises true on anything narrower than 1024, which is right
 // for a laptop and wrong for the one place the sidebar is not a rail: the CSS
 // turns it into a 310px slide-over at 768, and it was rendering 76px of
 // unlabelled icons inside it — every row an icon with no word beside it, and
 // the only way out a toggle nobody would think to press. The breakpoint here is
 // `isTablet` because that is the same 768 the stylesheet switches at; two
 // different numbers would leave a band where the drawer is a rail again.
 const { isTablet }=useResponsive();
 const drawer=isTablet;
 // My Terminal is customizable here exactly as it is on the private terminal, and
 // the SAME module decides what is on it (theme/myTerminal.ts) — over this nav
 // rather than the private one. Two copies of those rules is how the two shells
 // come to disagree about what "customized" means.
 const [customizing,setCustomizing]=useState(false);
 const [saving,setSaving]=useState(false);
 const [sections,setSections]=useState<string|null>(()=>readPublicUser().myTerminalSections??null);
 const myTerminalKeys=useMemo(()=>new Set(myTerminalSections(PUBLIC_NAV as unknown as NavLike,parseMyTerminal(sections),PUBLIC_REACH).map((s)=>s.key)),[sections]);
 // A pinned row is drawn on My Terminal while still belonging to its own
 // workspace, so resolving the workspace from the key alone would jump the
 // reader away from the board they deliberately put it on.
 const [workspace,setWorkspace]=useState<PublicWorkspaceKey>(()=>publicWorkspaceFor(initial).key);
 const workspaceNav=useMemo(()=>publicNavFor(workspace),[workspace]);
 useEffect(()=>{if(evidence){setPublicUser({id:'demo-user',username:'demo',displayName:'Demo',isDemo:true});return}publicAuth.session().then((value)=>{const prefs=value.preferences??{};setPublicUser({id:value.user.id,username:value.user.email.split('@')[0]??'public',displayName:value.user.displayName,email:value.user.email,...prefs});setSections(prefs.myTerminalSections??null);setPasswordChangeRequired(value.passwordChangeRequired);setVerified(!value.passwordChangeRequired)}).catch(()=>setVerified(false)).finally(()=>setChecking(false))},[]);
 useEffect(()=>{const onHash=()=>{const next=location.hash.slice(1) as PublicScreenKey;if(allowed.has(next))setScreen(next)};addEventListener('hashchange',onHash);return()=>removeEventListener('hashchange',onHash)},[]);
 useEffect(()=>{const onAi=()=>{location.hash='hp_howto'};addEventListener('vts-public-ai',onAi);return()=>removeEventListener('vts-public-ai',onAi)},[]);
 if(checking)return null;if(!verified||authStep)return <PublicLogin initialStep={authStep==='early-access'||query.get('screen')==='early-access'?'early-access':passwordChangeRequired?'change-password':query.get('screen')==='two-factor'?'two-factor':'login'} onVerified={()=>{setAuthStep(null);setPasswordChangeRequired(false);setVerified(true)}} onDemo={()=>{setAuthStep(null);startDemo();setPublicUser({id:'demo-user',username:'demo',displayName:'Demo',isDemo:true});setVerified(true)}} onClose={authStep&&verified?()=>setAuthStep(null):undefined}/>;
 const select=(next:PublicScreenKey)=>{
  if(!allowed.has(next))return;
  // Standing on My Terminal, a key that is ON My Terminal stays there.
  const stay=workspace===MY_TERMINAL_WORKSPACE&&myTerminalKeys.has(next);
  if(!stay)setWorkspace(publicWorkspaceFor(next).key);
  location.hash=next;setScreen(next);setMobileOpen(false);
 };
 const selectWorkspace=(next:PublicWorkspaceKey)=>{
  const nav=publicNavFor(next);
  const first=next===MY_TERMINAL_WORKSPACE?[...myTerminalKeys][0] as PublicScreenKey|undefined:nav.sections[0]?.key;
  setWorkspace(next);
  if(first){location.hash=first;setScreen(first)}
  setMobileOpen(false);
 };
 async function saveSections(next:MyTerminalLayout){
  setSaving(true);
  const value=next.add.length||next.hide.length?JSON.stringify(next):null;
  // Straight to the runtime rather than through the auth adapter: the shell is
  // on the public side of the seam and the adapter is on the other, so it
  // updates the identity and writes for a signed-in visitor here instead.
  setPublicUser({...readPublicUser(),myTerminalSections:value});
  try{if(!isDemo())await publicAuth.savePreferences({myTerminalSections:value}).catch(()=>{});setSections(value);setCustomizing(false)}finally{setSaving(false)}
 }
 // A section pinned from another workspace keeps its own label, so the top bar
 // has to look it up across the whole nav rather than only in this workspace.
 const selected=PUBLIC_NAV.flatMap((w)=>w.sections).find((section)=>section.key===screen)??workspaceNav.sections[0];
 return <div className="vts-public-shell" data-collapsed={collapsed} data-mobile-open={mobileOpen}><PublicSidebar workspace={workspaceNav.key} screen={screen} collapsed={drawer?false:collapsed} onToggle={drawer?()=>setMobileOpen(false):()=>setCollapsed((value)=>!value)} onSelectWorkspace={selectWorkspace} onSelectScreen={select} sections={workspace===MY_TERMINAL_WORKSPACE?[...myTerminalKeys] as PublicScreenKey[]:undefined} onCustomize={workspace===MY_TERMINAL_WORKSPACE?()=>setCustomizing(true):undefined}/><section className="vts-public-column"><PublicTopBar workspaceLabel={workspaceNav.label} sectionLabel={selected?.label??workspaceNav.label} accent={workspaceNav.accent} onOpenNav={()=>setMobileOpen(true)}/><main className="vts-public-main">{isDemo()&&<div className="vts-public-demo-bar"><strong>DEMO</strong><span>Sample data. Nothing is saved, and everything resets when you leave. Informational only — not investment advice. Features become available on the release of Early Access.</span><button onClick={()=>setAuthStep('early-access')}>Request early access</button></div>}<PublicScreen screen={screen} workspace={workspaceNav.key} onNavigate={select}/></main><footer className="vts-public-footer"><span>VTS Public Terminal · Informational use only</span><span><a href="#hp_terms">Terms</a> · <a href="#hp_privacy">Privacy</a> · <a href="#hp_howto">Help</a></span></footer></section>{mobileOpen&&<button aria-label="Close navigation" onClick={()=>setMobileOpen(false)} style={{position:'fixed',inset:0,zIndex:70,background:'rgba(0,0,0,.55)',border:0}}/>}{customizing&&<MyTerminalCustomizer nav={PUBLIC_NAV as unknown as NavLike} layout={parseMyTerminal(sections)} reach={PUBLIC_REACH} busy={saving} onClose={()=>setCustomizing(false)} onSave={(next)=>{void saveSections(next)}}/>}</div>;
}
declare global{interface Window{__VTS_PUBLIC_BOUNDARY__?:{routes:readonly string[];sessionCookie:string;evidence:boolean}}}
window.__VTS_PUBLIC_BOUNDARY__={routes:[...allowed],sessionCookie:'vts_public_session_v1',evidence};
