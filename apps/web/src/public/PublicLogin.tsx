import { useState, type FormEvent } from 'react';
import { C } from '../theme/tokens';
import { publicAuth, isDemo, startDemo } from './PublicRuntime';
import { COMPANY } from '../legal/content';

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
  const title=step==='login'?'Sign in to your terminal':step==='two-factor'?'Check your email':step==='recovery'?'Recover your account':step==='early-access'?'Request beta access':'Change your temporary password';
  const description=step==='login'?'Use your public VTS account email and password.':step==='two-factor'?`Enter the six-digit code sent to ${sentTo}.`:step==='recovery'?'Enter your public account email. The response is the same whether or not an account exists.':step==='early-access'?'Tell us where to reach you. Invitations go out in batches.':'Choose a new password before continuing.';
  return <main className="vts-public-auth"><section className="vts-public-auth-brand"><img className="vts-public-wordmark" src="/brand/vitalis-wordmark.png" alt="Vitalis Trading Systems"/><div><p style={{fontFamily:C.mono,color:C.gold,fontSize:10,letterSpacing:'1.7px'}}>VTS PUBLIC TERMINAL</p><h1>Your market workbench.<br/><em>Focused and personal.</em></h1><p>Market information, personal tracking, and study tools in a reduced public terminal with its own account boundary.</p></div><p style={{fontFamily:C.mono,fontSize:10}}>Password · email two-step verification · optional 30-day remembered device</p></section><section className="vts-public-auth-card-wrap"><form className="vts-public-auth-card" onSubmit={submit}><p style={{fontFamily:C.mono,color:C.gold,fontSize:10,letterSpacing:'1.4px'}}>{step==='two-factor'?'STEP 2 OF 2':step==='change-password'?'PASSWORD CHANGE REQUIRED':step==='early-access'?'PRE-RELEASE':'WELCOME'}</p><h2>{title}</h2><p>{description}</p>
  {step==='login'&&<><label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required/></label><label>Password<input name="password" type="password" autoComplete="current-password" required/></label></>}
  {step==='two-factor'&&<><label>Verification code<input name="code" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" maxLength={6} defaultValue={isDemo()?'246810':''} required/></label><label className="remember"><input name="remember" type="checkbox"/>Remember this device for 30 days</label></>}
  {step==='recovery'&&<label>Email address<input name="email" type="email" autoComplete="email" required/></label>}
  {/* IT IS "BETA ACCESS", NOT "EARLY ACCESS" (owner decision, 2026-08). The two
      read the same and are not: games and SaaS sell early access, so the phrase
      carries a commercial ring — you pay to get in first — and this site is
      deliberately free of anything that reads as an inducement. "Beta" is a
      statement about how finished the software is and promises nothing, which is
      what somebody deciding whether to put their trading records in here needs
      to know. It matters more than a word choice usually would: the owner is
      registering as an investment adviser, and an adviser's public pages are
      held to what they claim. "Pre-release" stays where it is — that describes
      the SOFTWARE, which is a different statement from the programme's name.
      The keys are untouched: `early-access` is still the step and the
      `?screen=` value, because renaming a label is not renaming a key.

      NOTHING IS OFFERED HERE (owner instruction, 2026-08). This step used to open
      with what a pre-release place "includes" — a free Max membership, three months
      free after launch — which is an inducement to hand over an email address, and it
      named tiers the terminal does not sell. It asks for an address and says what
      happens to it, and nothing else. Do not put an offer back on this form. */}
  {step==='early-access'&&<>
    <label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required/></label>
    <label>Anything you want us to know <span>optional</span><textarea name="note" rows={3} placeholder="What you trade or study, and what you are hoping the terminal does for you."/></label>
    {/* THE ONE BINDING STATEMENT ON THIS PAGE, and it is here rather than in the
        Privacy Policy on purpose.
        
        That document is a pre-release SUMMARY and says so in its own banner —
        it disclaims itself, which is honest about a document that has not been
        written yet and useless to somebody deciding whether to type their
        address in. This form takes real personal data from a real person and
        keeps it, so what happens to it has to be said at the point of
        collection, in terms that stand on their own whatever the summary says.
        
        Everything below is a commitment. Keep it short, keep it true, and if
        what the form does ever changes, change this first. */}
    <div className="vts-public-collect">
      <strong>What happens to this</strong>
      <p>
        We keep the email address you type here, and the note if you write one. It is used for one thing:
        telling you when beta access opens. It is not sold, not shared with anyone else, and not added
        to a marketing list.
      </p>
      <p>
        Ask us to delete it at any time — write to <em>{COMPANY.contactEmail}</em> and it is removed.
        This paragraph is what we do with it, and applies whatever the pre-release Privacy Policy says
        about itself.
      </p>
    </div>
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
    <strong>Request beta access</strong>
    <p>The public terminal is in pre-release and admission is by invitation. Ask to be told when a place opens.</p>
    <button type="button" onClick={()=>{setStep('early-access');setError('');setNotice('')}}>Request an invitation</button>
  </div></>}
  <div className="vts-public-warning" role="note">
    <strong>You are entering the Public Terminal.</strong>
    <p>This is not the group terminal. Group operations are not available here and your features will be significantly reduced. Continue only if you meant to use the public version.</p>
  </div><footer><a href="#terms">Terms</a><a href="#privacy">Privacy</a><span>Public candidate</span></footer></form></section></main>;
}
