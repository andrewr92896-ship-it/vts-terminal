import { useState } from 'react';
import { publicAuth } from './PublicRuntime';

// THE PAGE THE EMAILED DELETION LINK OPENS.
//
// It stands on its own, before the session check, because whoever opens it may
// not be signed in: the link is read wherever the person reads their mail, which
// is frequently a different browser or a phone. The token in the URL is the
// authentication, which is why the server treats it the way it does — hashed at
// rest, expiring after an hour, and claimed before anything is deleted.
//
// IT DOES NOT DELETE ON LOAD. A link that acted the moment it was fetched would
// be fired by any mail client that pre-fetches, any scanner, any preview. So
// opening the link presents the decision and a person presses the button.
const C={bg:'#050b18',panel:'#0a1426',line:'#1e2e52',text:'#eef3ff',muted:'#9fb0d6',red:'#f0596e',green:'#2fc77e'};

export function PublicDeleteAccount({token}:{token:string}){
  const [state,setState]=useState<'ask'|'busy'|'done'|'error'>('ask');
  const [message,setMessage]=useState('');

  async function confirm(){
    setState('busy');
    try{ setMessage((await publicAuth.confirmDeletion(token)).message); setState('done'); }
    catch(reason){ setMessage(reason instanceof Error?reason.message:'That link could not be used.'); setState('error'); }
  }

  return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',background:C.bg,padding:24}}>
    <section style={{width:'min(480px,100%)',background:C.panel,border:`1px solid ${C.line}`,borderRadius:14,padding:28,color:C.text}}>
      <img src="/brand/vitalis-wordmark.png" alt="Vitalis Trading Systems" style={{width:150,marginBottom:20}}/>
      {state==='done'
        ? <>
            <h1 style={{margin:'0 0 10px',fontSize:20}}>Your account is deleted</h1>
            <p style={{margin:0,color:C.green,fontSize:13,lineHeight:1.6}}>{message}</p>
            <p style={{margin:'14px 0 0',color:C.muted,fontSize:12.5,lineHeight:1.6}}>
              We have sent a confirmation to your email address, and then removed that address too. You are welcome to ask for a place again in future.
            </p>
            <a href="/" style={{display:'inline-block',marginTop:20,color:C.muted,fontSize:12.5}}>Back to the terminal</a>
          </>
        : <>
            <h1 style={{margin:'0 0 10px',fontSize:20}}>Delete your account?</h1>
            <p style={{margin:'0 0 14px',color:C.muted,fontSize:13,lineHeight:1.6}}>
              This removes your account and everything in it — your records, your notes, your study material and your settings. It cannot be undone, and there is no grace period.
            </p>
            <p style={{margin:'0 0 18px',color:C.muted,fontSize:12.5,lineHeight:1.6}}>
              If you did not ask for this, close this page. Nothing happens unless you press the button, and this link stops working an hour after it was sent.
            </p>
            <button type="button" disabled={state==='busy'} onClick={()=>{void confirm()}}
              style={{width:'100%',padding:'11px 14px',border:0,borderRadius:8,background:C.red,color:'#2a0008',fontWeight:700,fontSize:13.5,cursor:'pointer'}}>
              {state==='busy'?'Deleting…':'Delete my account permanently'}
            </button>
            <a href="/" style={{display:'block',textAlign:'center',marginTop:14,color:C.muted,fontSize:12.5}}>Keep my account</a>
            {state==='error'&&<p style={{margin:'14px 0 0',color:C.red,fontSize:12.5,lineHeight:1.6}}>{message}</p>}
          </>}
    </section>
  </main>;
}
