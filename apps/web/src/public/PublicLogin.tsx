import { useState, type FormEvent } from 'react';
import { C } from '../theme/tokens';
import { publicAuth, isDemo, startDemo } from './PublicRuntime';

type Step='login'|'two-factor'|'recovery'|'change-password'|'early-access';
export function PublicLogin({ initialStep = 'login', onVerified, onDemo, onClose }: { initialStep?:Step; onVerified:()=>void; onDemo:()=>void; onClose?:()=>void }) {
  const [step,setStep]=useState<Step>(initialStep);const [challengeId,setChallengeId]=useState(isDemo()?'evidence-challenge':'');const [sentTo,setSentTo]=useState('your public account email');
  const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');const form=new FormData(event.currentTarget);
    try{
      if(step==='login'){
        if(isDemo()){setStep('two-factor');return}
        const result=await publicAuth.login(String(form.get('email')??''),String(form.get('password')??''));
        if(result.requiresTwoFactor){setChallengeId(result.challengeId||'');setSentTo(result.sentTo||'your public account email');setStep('two-factor')}
        else if(result.passwordChangeRequired)setStep('change-password');else onVerified();
      } else if(step==='two-factor'){
        if(isDemo()){onVerified();return}
        const result=await publicAuth.verify(challengeId,String(form.get('code')??''),form.get('remember')==='on');
        if(result.passwordChangeRequired)setStep('change-password');else onVerified();
      } else if(step==='early-access'){
        setNotice((await publicAuth.earlyAccess(String(form.get('email')??''),String(form.get('note')??''))).message);
      } else if(step==='recovery'){
        const message=isDemo()?'If a public account matches that email, recovery instructions will be sent shortly.':(await publicAuth.recover(String(form.get('email')??''))).message;
        setNotice(message);
      } else {
        const current=String(form.get('currentPassword')??''),next=String(form.get('newPassword')??''),confirm=String(form.get('confirmPassword')??'');
        if(next!==confirm)throw new Error('New passwords do not match.');
        if(!isDemo())await publicAuth.changePassword(current,next);onVerified();
      }
    }catch(reason){setError(reason instanceof Error?reason.message:'Unable to continue.')}finally{setBusy(false)}
  }
  const title=step==='login'?'Sign in to your terminal':step==='two-factor'?'Check your email':step==='recovery'?'Recover your account':step==='early-access'?'Request early access':'Change your temporary password';
  const description=step==='login'?'Use your public VTS account email and password.':step==='two-factor'?`Enter the six-digit code sent to ${sentTo}.`:step==='recovery'?'Enter your public account email. The response is the same whether or not an account exists.':step==='early-access'?'Tell us where to reach you. Invitations go out in batches.':'Choose a new password before continuing.';
  return <main className="vts-public-auth"><section className="vts-public-auth-brand"><img className="vts-public-wordmark" src="/brand/vitalis-wordmark.png" alt="Vitalis Trading Systems"/><div><p style={{fontFamily:C.mono,color:C.gold,fontSize:10,letterSpacing:'1.7px'}}>VTS PUBLIC TERMINAL</p><h1>Your market workbench.<br/><em>Focused and personal.</em></h1><p>Market information, personal tracking, and study tools in a reduced public terminal with its own account boundary.</p></div><p style={{fontFamily:C.mono,fontSize:10}}>Password · email two-step verification · optional 30-day remembered device</p></section><section className="vts-public-auth-card-wrap"><form className="vts-public-auth-card" onSubmit={submit}><p style={{fontFamily:C.mono,color:C.gold,fontSize:10,letterSpacing:'1.4px'}}>{step==='two-factor'?'STEP 2 OF 2':step==='change-password'?'PASSWORD CHANGE REQUIRED':step==='early-access'?'PRE-RELEASE':'WELCOME'}</p><h2>{title}</h2><p>{description}</p>
  {step==='login'&&<><label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required/></label><label>Password<input name="password" type="password" autoComplete="current-password" required/></label></>}
  {step==='two-factor'&&<><label>Verification code<input name="code" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" maxLength={6} defaultValue={isDemo()?'246810':''} required/></label><label className="remember"><input name="remember" type="checkbox"/>Remember this device for 30 days</label></>}
  {step==='recovery'&&<label>Email address<input name="email" type="email" autoComplete="email" required/></label>}
  {step==='early-access'&&<>
    <div className="vts-public-early-terms">
      <strong>What a pre-release place includes</strong>
      <ul>
        <li>A <em>free Max membership</em> for as long as the terminal is in pre-release.</li>
        <li>At least <em>three months of free Max</em> after the official launch.</li>
        <li>Early sight of features, and a direct line for reporting what does not work.</li>
      </ul>
    </div>
    <label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required/></label>
    <label>Anything you want us to know <span>optional</span><textarea name="note" rows={3} placeholder="What you trade or study, and what you are hoping the terminal does for you."/></label>
  </>}
  {step==='change-password'&&<><label>Temporary password<input name="currentPassword" type="password" autoComplete="current-password" required/></label><label>New password<input name="newPassword" type="password" autoComplete="new-password" minLength={12} required/></label><label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required/></label></>}
  <button disabled={busy} type="submit">{busy?'Please wait…':step==='login'?'Continue':step==='two-factor'?'Verify & continue':step==='recovery'?'Send recovery email':step==='early-access'?'Send request':'Change password & continue'}</button>
  {notice&&<div style={{marginTop:10,color:C.green,fontSize:12}}>{notice}</div>}{error&&<div style={{marginTop:10,color:C.red,fontSize:12}}>{error}</div>}
  {step==='login'&&<button type="button" onClick={()=>{setStep('recovery');setError('')}} style={{marginTop:8,background:'transparent',border:`1px solid ${C.line2}`,color:C.muted}}>Forgot password?</button>}
  {(step==='recovery'||step==='two-factor'||step==='early-access')&&<button type="button" onClick={()=>{if(onClose&&step===initialStep){onClose();return}setStep('login');setError('');setNotice('')}} style={{marginTop:8,background:'transparent',border:`1px solid ${C.line2}`,color:C.muted}}>{onClose&&step===initialStep?'Back to the terminal':'Back to sign in'}</button>}
  {step==='login'&&<><div className="vts-public-demo-door">
    <strong>Just looking?</strong>
    <p>Open the demo terminal with sample data. Nothing you do is saved, and it resets when you leave.</p>
    <button type="button" onClick={()=>{startDemo();onDemo()}}>Explore the demo</button>
  </div>
  <div className="vts-public-early-access">
    <strong>Request early access</strong>
    <p>Pre-release invitations include a <em>free Max membership</em> for the whole pre-release, and at least <em>three months of free Max</em> after launch.</p>
    <button type="button" onClick={()=>{setStep('early-access');setError('');setNotice('')}}>Request an invitation</button>
  </div></>}
  <div className="vts-public-warning" role="note">
    <strong>You are entering the Public Terminal.</strong>
    <p>This is not the group terminal. Group operations are not available here and your features will be significantly reduced. Continue only if you meant to use the public version.</p>
  </div><footer><a href="#terms">Terms</a><a href="#privacy">Privacy</a><span>Public candidate</span></footer></form></section></main>;
}
