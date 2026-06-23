import { useAuth } from './auth/AuthContext';
import { Login } from './pages/Login';
import { ChangePassword } from './pages/ChangePassword';
import { Portal } from './components/Portal';

export function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
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
  }

  if (!user) return <Login />;
  // Accounts created or reset by an admin must set a new password first.
  if (user.mustChangePassword) return <ChangePassword />;
  return <Portal />;
}
