import type { ReactNode } from 'react';
import { useAuth } from './auth/AuthContext';
import { Login } from './pages/Login';
import { ChangePassword } from './pages/ChangePassword';
import { AcceptTerms } from './pages/AcceptTerms';
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
