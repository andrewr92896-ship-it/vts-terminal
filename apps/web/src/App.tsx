import type { ReactNode } from 'react';
import { useAuth } from './auth/AuthContext';
import { Login } from './pages/Login';
import { ChangePassword } from './pages/ChangePassword';
import { AcceptTerms } from './pages/AcceptTerms';
import { Portal } from './components/Portal';
import { UpdatePrompt } from './components/UpdatePrompt';

export function App() {
  const { user, loading } = useAuth();

  let content: ReactNode;
  if (loading) {
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
        Loading portal...
      </div>
    );
  } else if (!user) {
    content = <Login />;
  } else if (user.mustChangePassword) {
    // Accounts created or reset by an admin must set a new password first.
    content = <ChangePassword />;
  } else if (user.mustAcceptTerms) {
    // Everyone must review and accept the current Terms of Service and Privacy
    // Policy before operating the portal (re-prompted when the docs are updated).
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
