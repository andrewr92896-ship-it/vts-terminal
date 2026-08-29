import type { CSSProperties } from 'react';
import { Icon } from '../components/Icon';
import { C, tint } from '../theme/tokens';
import { PUBLIC_NAV, publicNavFor, type PublicScreenKey, type PublicWorkspaceKey } from './publicNav';
import { isDemo } from './PublicRuntime';

interface PublicSidebarProps {
  workspace: PublicWorkspaceKey;
  screen: PublicScreenKey;
  collapsed: boolean;
  onToggle: () => void;
  onSelectWorkspace: (workspace: PublicWorkspaceKey) => void;
  onSelectScreen: (screen: PublicScreenKey) => void;
  // My Terminal's customized section list, when that is the open workspace.
  // Absent means "the workspace's own rows", which is every other workspace.
  sections?: readonly PublicScreenKey[];
  // Opens the customizer. Drawn as the last row of the list it edits.
  onCustomize?: () => void;
}

const label: CSSProperties = { fontSize: 10.5, letterSpacing: '1.4px', textTransform: 'uppercase', color: C.faint, fontWeight: 600, padding: '0 10px', marginBottom: 8 };

export function PublicSidebar(props: PublicSidebarProps) {
  const current = publicNavFor(props.workspace);
  // A pinned row belongs to another workspace, so its label and icon are looked
  // up across the whole nav rather than in the workspace being drawn.
  const everySection = PUBLIC_NAV.flatMap((w) => w.sections);
  const rows = props.sections
    ? props.sections.map((key) => everySection.find((s) => s.key === key)).filter((s): s is (typeof everySection)[number] => !!s)
    : current.sections;
  return (
    <aside style={{ background: C.side, borderRight: `1px solid ${C.line}`, padding: props.collapsed ? '18px 12px' : '22px 16px 18px', display: 'flex', flexDirection: 'column', gap: props.collapsed ? 18 : 22, overflowY: 'auto', overflowX: 'hidden', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: props.collapsed ? 'center' : 'space-between', gap: 8, padding: props.collapsed ? 0 : '2px 4px 0', minHeight: 30 }}>
        {props.collapsed ? <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: C.gold }}>VTS</span> : <img src="/brand/vitalis-wordmark.png" alt="Vitalis Trading Systems" style={{ width: 148, display: 'block' }} />}
        {!props.collapsed && <button onClick={props.onToggle} title="Collapse sidebar" aria-label="Collapse sidebar" style={toggle}><Icon name="panel-left-close" size={16} /></button>}
      </div>
      {props.collapsed && <button onClick={props.onToggle} title="Expand sidebar" aria-label="Expand sidebar" style={{ ...toggle, alignSelf: 'center' }}><Icon name="panel-left-open" size={16} /></button>}
      <nav aria-label="Public terminal workspaces">
        {props.collapsed ? <div style={divider} /> : <div style={label}>Workspaces</div>}
        {PUBLIC_NAV.map((item) => <NavRow key={item.key} collapsed={props.collapsed} active={item.key === props.workspace} icon={item.icon} label={item.label} accent={item.accent} onClick={() => props.onSelectWorkspace(item.key)} />)}
      </nav>
      <nav>
        {props.collapsed ? <div style={divider} /> : <div style={label}>{current.group}</div>}
        {rows.map((section) => <NavRow key={section.key} collapsed={props.collapsed} active={section.key === props.screen} icon={section.icon} label={section.label} accent={current.accent} onClick={() => props.onSelectScreen(section.key)} />)}
        {props.onCustomize && <NavRow collapsed={props.collapsed} active={false} icon="list-tree" label="Customize" accent={current.accent} onClick={props.onCustomize} />}
      </nav>
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: props.collapsed ? 'center' : 'space-between', gap: 8, padding: '12px 8px 0', borderTop: `1px solid ${C.line}`, color: C.faint, fontFamily: C.mono, fontSize: 9.5 }}>
        {!props.collapsed && <span>VTS Public</span>}<span style={{ border: `1px solid ${tint(C.gold,.35)}`, borderRadius: 4, padding: '2px 5px', color: C.gold }}>{isDemo() ? 'Demo' : 'Candidate'}</span>
      </div>
    </aside>
  );
}

function NavRow({ collapsed, active, icon, label: text, accent, onClick }: { collapsed:boolean; active:boolean; icon:string; label:string; accent:string; onClick:()=>void }) {
  return <button onClick={onClick} title={collapsed ? text : undefined} style={{ width:'100%', minHeight:36, display:'flex', alignItems:'center', justifyContent:collapsed?'center':'flex-start', gap:10, padding:collapsed?'8px':'8px 10px', marginBottom:3, border:`1px solid ${active?tint(accent,.36):'transparent'}`, borderRadius:8, background:active?`linear-gradient(90deg,${tint(accent,.14)},${tint(accent,.05)})`:'transparent', color:active?C.text:C.muted, cursor:'pointer', textAlign:'left', fontSize:12.5, fontWeight:active?600:400 }}>
    <span style={{ color:active?accent:C.faint, display:'flex' }}><Icon name={icon} size={16}/></span>{!collapsed && <span>{text}</span>}
  </button>;
}
const toggle:CSSProperties={ width:30,height:30,display:'grid',placeItems:'center',color:C.muted,background:'rgba(255,255,255,.025)',border:`1px solid ${C.line2}`,borderRadius:7,cursor:'pointer' };
const divider:CSSProperties={ height:1,background:C.line,margin:'0 6px 8px' };
