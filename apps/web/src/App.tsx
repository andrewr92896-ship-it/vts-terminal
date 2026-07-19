import type { ReactNode } from 'react';
import { useAuth } from './auth/AuthContext';
import { Login } from './pages/Login';
import { ChangePassword } from './pages/ChangePassword';
import { Portal } from './components/Portal';
import { UpdatePrompt } from './components/UpdatePrompt';
import { SiteCopyProvider } from './copy/SiteCopy';

export function App() {
  const { user, loading } = useAuth();

  let content: ReactNode;
  if (loading) {
    content = (
      <div
        style={{
          minHeight: '100vh',
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
  } else {
    // The SiteCopyProvider makes every <EditableText> in the portal resolve its
    // admin override and, for admins, drives the live "edit site wording" mode.
    content = (
      <SiteCopyProvider user={user}>
        <Portal />
      </SiteCopyProvider>
    );
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
