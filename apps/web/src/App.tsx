import { useState, type ReactNode } from 'react';
import { useAuth } from './auth/AuthContext';
import { Login } from './pages/Login';
import { ChangePassword } from './pages/ChangePassword';
import { AcceptTerms } from './pages/AcceptTerms';
import { UpdateEmail } from './pages/UpdateEmail';
import { Maintenance, useMaintenance } from './pages/Maintenance';
import { Portal } from './components/Portal';
import { UpdatePrompt } from './components/UpdatePrompt';

export function App() {
  const { user, loading } = useAuth();
  // Ahead of every other branch, including `loading`: the session check is what
  // discovers the terminal is closed, and while it is, no other screen here can
  // do anything useful. A cached PWA never fetches the server's own notice
  // page, so this is the only way that notice reaches a device that already has
  // the app — see `lib/maintenance.ts`.
  const closed = useMaintenance();
  // "Not now" on the sign-in email prompt, for this page load only. The flag it
  // is skipping is server state, so the prompt returns at the next sign-in —
  // there is deliberately nothing stored here to remember a dismissal.
  const [emailPromptSkipped, setEmailPromptSkipped] = useState(false);

  let content: ReactNode;
  if (closed) {
    content = <Maintenance notice={closed} />;
  } else if (loading) {
    content = (
      <div
        style={{
          minHeight: 'var(--app-h)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#060f24',
          color: '#7488b5',
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 13,
          letterSpacing: '0.5px',
        }}
      >
        Loading terminal...
      </div>
    );
  } else if (!user) {
    content = <Login />;
  } else if (user.mustChangePassword) {
    // Accounts created or reset by an admin must set a new password first.
    content = <ChangePassword />;
  } else if (user.mustAcceptTerms) {
    // Everyone must review and accept the current Terms of Service and Privacy
    // Policy before operating the terminal (re-prompted when the docs are updated).
    content = <AcceptTerms />;
  } else if (user.mustUpdateEmail && !emailPromptSkipped) {
    // The account's sign-in address is being retired. LAST in the chain, and
    // skippable, because the two gates above are mandatory and this one is not —
    // a dismissible card must not sit in front of a legal gate, and a hard block
    // on somebody whose mailbox is already closing is the lockout this exists to
    // avoid.
    content = <UpdateEmail onSkip={() => setEmailPromptSkipped(true)} />;
  } else {
    content = <Portal />;
  }

  // The "Update available" popup lives outside the auth branches so it can show
  // on every screen — the loading splash, the login page, and any workspace.
  return (
    <>
      {content}
      <UpdatePrompt />
    </>
  );
}
