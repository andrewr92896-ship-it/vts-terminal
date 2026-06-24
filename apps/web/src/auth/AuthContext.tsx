import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { api, ApiError } from '../api/client';
import type { User } from '../api/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  demoLogin: () => Promise<void>;
  logout: () => Promise<void>;
  // Self-service account actions; each updates the cached user on success.
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateProfile: (patch: { username?: string; displayName?: string }) => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On load, ask the backend who we are. A 401 just means logged out.
  useEffect(() => {
    let alive = true;
    api
      .me()
      .then((r) => alive && setUser(r.user))
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) {
          console.error('Session check failed:', err);
        }
        if (alive) setUser(null);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const r = await api.login(username, password);
    setUser(r.user);
  }, []);

  const demoLogin = useCallback(async () => {
    const r = await api.demoLogin();
    setUser(r.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const r = await api.changePassword(currentPassword, newPassword);
      setUser(r.user);
    },
    [],
  );

  const updateProfile = useCallback(
    async (patch: { username?: string; displayName?: string }) => {
      const r = await api.updateProfile(patch);
      setUser(r.user);
    },
    [],
  );

  return (
    <AuthCtx.Provider
      value={{ user, loading, login, demoLogin, logout, changePassword, updateProfile }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
