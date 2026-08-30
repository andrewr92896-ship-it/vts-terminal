import { useEffect, useState } from 'react';
import { publicAuth } from './PublicRuntime';
import { LegalDocBody } from '../workspaces/help/LegalScreens';
import { TERMS, PRIVACY } from '../legal/content';
import { THEMES } from '../theme/themes';

// THE CLICKWRAP.
//
// It stands between a signed-in account and the terminal, and it is a GATE
// rather than a banner or a modal: the server refuses every authenticated route
// until the box is ticked, so drawing the terminal behind this would be drawing
// a screen whose every request comes back 403.
//
// What separates this from a "Terms" link in the footer — a browsewrap, which
// courts throw out routinely — is that there is a moment, an act, and a row
// saying so. The row is written by the SERVER from its own registry; nothing on
// this screen is sent to it. Pressing the button says only that the box was
// ticked.
//
// THE DOCUMENTS ARE HERE TO READ, not linked away to. Somebody gated out of the
// terminal cannot navigate to Site Help, and "agree to a document you cannot
// open" is the failure this whole mechanism exists to avoid. They are rendered
// by `LegalDocBody` — the same component the Site Help screens use — so what is
// read here is what is read there, and what the stored hash covers.
const C={bg:'#050b18',panel:'#0a1426',line:'#1e2e52',text:'#eef3ff',muted:'#9fb0d6',accent:'#5AC8FA',red:'#f0596e'};

type Loaded={
  documents:Array<{id:string;title:string;version:string;effectiveDate:string}>;
  outstanding:string[];
  acknowledgement:{title:string;confirm:string;statements:string[]};
};

export function PublicLegalGate({onAccepted}:{onAccepted:()=>void}){
  const [loaded,setLoaded]=useState<Loaded|null>(null);
  const [reading,setReading]=useState<'terms'|'privacy'|null>(null);
  const [ticked,setTicked]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{publicAuth.legalDocuments().then(setLoaded).catch((reason)=>setError(reason instanceof Error?reason.message:'Could not load the terms.'))},[]);

  async function accept(){
    setBusy(true); setError('');
    try{ await publicAuth.acceptLegal(); onAccepted(); }
    catch(reason){ setError(reason instanceof Error?reason.message:'That could not be saved.'); setBusy(false); }
  }

  const version=loaded?.documents.find((d)=>d.id==='terms');

  return <main style={{minHeight:'100vh',background:C.bg,padding:'32px 24px 56px',color:C.text}}>
    <section style={{width:'min(760px,100%)',margin:'0 auto'}}>
      <img src="/brand/vitalis-wordmark.png" alt="Vitalis Trading Systems" style={{width:150,marginBottom:24}}/>
      <h1 style={{margin:'0 0 8px',fontSize:22}}>{loaded?.acknowledgement.title??'Before you start'}</h1>
      <p style={{margin:'0 0 22px',color:C.muted,fontSize:13,lineHeight:1.6}}>
        Please read this before using the terminal. It takes a minute and you will only be asked again if the documents change.
      </p>

      {error&&<div style={{marginBottom:18,padding:'10px 13px',borderRadius:8,border:`1px solid ${C.red}`,color:C.red,fontSize:12.5}}>{error}</div>}
      {!loaded&&!error&&<p style={{color:C.muted,fontSize:13}}>Loading…</p>}

      {loaded&&<>
        <ol style={{margin:'0 0 24px',padding:0,listStyle:'none',display:'flex',flexDirection:'column',gap:12}}>
          {loaded.acknowledgement.statements.map((statement,i)=>
            <li key={i} style={{display:'flex',gap:12,background:C.panel,border:`1px solid ${C.line}`,borderRadius:10,padding:'14px 16px'}}>
              <span style={{color:C.accent,fontFamily:"'IBM Plex Mono', monospace",fontSize:12,paddingTop:1}}>{String(i+1).padStart(2,'0')}</span>
              <span style={{fontSize:13,lineHeight:1.65,color:'#ccd7ef'}}>{statement}</span>
            </li>)}
        </ol>

        {/* Reading a document REPLACES this panel rather than opening beside it:
            these are long, and a tick box floating under thirty paragraphs is a
            tick box people press without reaching the end of anything. */}
        <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:22}}>
          <button type="button" onClick={()=>setReading('terms')} style={docButton}>Read the Terms of Service</button>
          <button type="button" onClick={()=>setReading('privacy')} style={docButton}>Read the Privacy Policy</button>
        </div>

        <label style={{display:'flex',gap:11,alignItems:'flex-start',background:C.panel,border:`1px solid ${ticked?C.accent:C.line}`,borderRadius:10,padding:'15px 17px',cursor:'pointer'}}>
          <input type="checkbox" checked={ticked} onChange={(e)=>setTicked(e.target.checked)} style={{marginTop:2,width:16,height:16,accentColor:C.accent}}/>
          <span style={{fontSize:13,lineHeight:1.6}}>{loaded.acknowledgement.confirm}</span>
        </label>

        <div style={{marginTop:20,display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
          {/* Disabled until it is ticked, which is the difference the name
              points at: there has to be an affirmative act, not a page view. */}
          <button type="button" disabled={!ticked||busy} onClick={()=>{void accept()}}
            style={{background:ticked?C.accent:'#16233f',color:ticked?'#04101f':'#5b6d94',border:0,borderRadius:9,padding:'12px 26px',fontSize:13.5,fontWeight:700,cursor:ticked&&!busy?'pointer':'not-allowed'}}>
            {busy?'Saving…':'Continue to the terminal'}
          </button>
          <button type="button" onClick={()=>{void publicAuth.logout().finally(()=>location.reload())}}
            style={{background:'transparent',color:C.muted,border:0,fontSize:12.5,cursor:'pointer',textDecoration:'underline'}}>
            Sign out instead
          </button>
        </div>

        {version&&<p style={{margin:'22px 0 0',color:'#6f81ab',fontSize:11,fontFamily:"'IBM Plex Mono', monospace"}}>
          v{version.version} · effective {version.effectiveDate}
        </p>}
      </>}

      {reading&&<div style={{position:'fixed',inset:0,background:C.bg,overflowY:'auto',zIndex:80,padding:'24px 20px 48px'}}>
        <div style={{width:'min(860px,100%)',margin:'0 auto'}}>
          <button type="button" onClick={()=>setReading(null)} style={{...docButton,marginBottom:18}}>← Back</button>
          <LegalDocBody doc={reading==='terms'?TERMS:PRIVACY} theme={THEMES.myportal}/>
          <button type="button" onClick={()=>setReading(null)} style={{...docButton,marginTop:8}}>← Back</button>
        </div>
      </div>}
    </section>
  </main>;
}

const docButton:React.CSSProperties={background:C.panel,color:C.text,border:`1px solid ${C.line}`,borderRadius:9,padding:'10px 16px',fontSize:12.5,cursor:'pointer'};
