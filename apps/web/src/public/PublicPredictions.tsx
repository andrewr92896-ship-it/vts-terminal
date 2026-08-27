import { useCallback,useEffect,useState,type CSSProperties } from 'react';
import { api,ApiError } from '../api/client';
import { Icon } from '../components/Icon';
import { CONFIDENCE_STATED } from '../workspaces/trading/notesFormat';
import type { NoteDirection,TradingNote } from '../api/types';
import type { Theme } from '../theme/themes';
// Minimal public adaptation of workspaces/trading/TradingNotes.tsx at
// 4cca8b189f867800aa9b62938b18664a63860e7f. The portal's group board,
// visibility switch and publication paths are intentionally removed: a public
// prediction is written private and there is no control that can share one.
const LEVELS=[1,2,3,4,5] as const;
export function PublicPredictions({theme}:{theme:Theme}){
 const [notes,setNotes]=useState<TradingNote[]>([]);const [weekKey,setWeekKey]=useState('');
 const [instrument,setInstrument]=useState('');const [direction,setDirection]=useState<NoteDirection>('up');
 const [title,setTitle]=useState('');const [thesis,setThesis]=useState('');const [confidence,setConfidence]=useState(3);
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const load=useCallback(()=>api.tradingNotes().then((data)=>{setWeekKey(data.week.weekKey);setNotes(data.week.notes)}).catch(()=>{setNotes([])}),[]);
 useEffect(()=>{void load()},[load]);
 async function add(){
  if(!title.trim()||busy)return;setBusy(true);setError('');
  try{
   await api.createNote({kind:'prediction',title:title.trim(),body:thesis.trim()||null,instrument:instrument.trim()||null,direction,confidence,targetPrice:null,visibility:'private',...(weekKey?{weekKey}:{})});
   setTitle('');setThesis('');setInstrument('');await load();
  }catch(e){setError(e instanceof ApiError?e.message:'Could not save the prediction')}
  finally{setBusy(false)}
 }
 return <div style={{maxWidth:980,margin:'0 auto',color:'#eef3ff'}}>
  <header style={{marginBottom:18}}><h2 style={{margin:0,fontSize:20}}>Trading Notes & Predictions</h2><p style={{color:'#9fb0d6',fontSize:12.5,lineHeight:1.55}}>Write the call before the window opens, then compare it with what happened. A public prediction is private to your account: it cannot be published, shared, copied, routed, or distributed.</p></header>
  <section style={panel(theme)}>
   <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="The call, in one line" style={input}/>
   <div style={{display:'grid',gridTemplateColumns:'1.1fr .7fr',gap:10,marginTop:10}}>
    <input value={instrument} onChange={e=>setInstrument(e.target.value)} placeholder="Instrument or market" style={input}/>
    <select value={direction} onChange={e=>setDirection(e.target.value as NoteDirection)} style={input}><option value="up">Up</option><option value="down">Down</option></select>
   </div>
   <div style={{display:'flex',alignItems:'center',gap:8,marginTop:10,flexWrap:'wrap'}}>
    <span style={{fontSize:11.5,color:'#9fb0d6'}}>Confidence</span>
    {LEVELS.map(level=><button key={level} onClick={()=>setConfidence(level)} style={{...chip,borderColor:confidence===level?theme.accent:'#1c3a7a',color:confidence===level?theme.accent:'#dfe7fa'}}>{level}</button>)}
    <span style={{fontSize:11.5,color:'#9fb0d6'}}>About {CONFIDENCE_STATED[confidence]}% sure</span>
   </div>
   <textarea value={thesis} onChange={e=>setThesis(e.target.value)} placeholder="What do you expect, and why?" rows={4} style={{...input,marginTop:10,resize:'vertical'}}/>
   <button onClick={()=>void add()} disabled={busy||!title.trim()} style={{marginTop:10,padding:'10px 14px',border:0,borderRadius:8,background:theme.accent,color:theme.accentText,fontWeight:700,opacity:busy||!title.trim()?.6:1}}>Save private prediction</button>
   {error&&<div style={{color:'#ffb4ab',marginTop:10,fontSize:12}}>{error}</div>}
  </section>
  <div style={{display:'grid',gap:10,marginTop:14}}>{notes.length===0
   ?<section style={panel(theme)}><Icon name="notebook-pen" size={18} color={theme.accent}/><p style={{color:'#9fb0d6',fontSize:12.5}}>No predictions yet. Your private calls will appear here.</p></section>
   :notes.map(note=><section key={note.id} style={panel(theme)}>
     <div style={{display:'flex',justifyContent:'space-between',gap:12}}><strong>{note.title}</strong><span style={{color:theme.accent,textTransform:'uppercase',fontSize:11}}>{note.instrument??'—'}{note.direction?` · ${note.direction}`:''}{note.confidence!=null?` · ~${CONFIDENCE_STATED[note.confidence]}%`:''}</span></div>
     {note.body&&<p style={{color:'#ccd7ef',fontSize:12.5,lineHeight:1.55}}>{note.body}</p>}
    </section>)}</div>
 </div>;
}
const input:CSSProperties={width:'100%',background:'#091633',border:'1px solid #1c3a7a',borderRadius:8,color:'#eef3ff',padding:'10px 12px'};
const chip:CSSProperties={background:'transparent',border:'1px solid #1c3a7a',borderRadius:7,padding:'5px 11px',fontWeight:700,fontSize:12};
const panel=(theme:Theme):CSSProperties=>({background:'rgba(11,26,58,.5)',border:`1px solid ${theme.navBorder}`,borderRadius:12,padding:'16px 18px'});
