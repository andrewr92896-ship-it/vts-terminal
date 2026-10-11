import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { api, ApiError, type TerminalLoginResponse } from '../api/client';
import type { User } from '../api/types';
import { DEFAULT_ZONE, setAccountZone, takeLegacyDeviceZone } from '../lib/timezone';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<TerminalLoginResponse>;
  verifyTwoFactor: (code: string, remember: boolean) => Promise<void>;
  demoLogin: () => Promise<void>;
  logout: () => Promise<void>;
  // Record acceptance of the current Terms of Service / Privacy Policy, clearing
  // the acceptance gate for this user.
  acceptTerms: () => Promise<void>;
  // Self-service account actions; each updates the cached user on success.
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateProfile: (patch: {
    username?: string;
    displayName?: string;
    email?: string;
    avatar?: string;
    displayTimezone?: string;
    hideFromLeaderboards?: boolean;
    twoFactorEnabled?: boolean;
  }) => Promise<void>;
  // Re-read the signed-in user from the server. Used after a change that alters
  // what the account can reach — turning a feature on or off — so the sidebar
  // and routing pick it up without a reload.
  refreshUser: () => Promise<void>;
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

  // The clock every timestamp in the terminal is formatted on lives on the
  // account, so the module that does the formatting is fed from the signed-in
  // user. One effect covers every path that sets a user — sign-in, the session
  // check, a profile save — and signing out returns it to the default.
  useEffect(() => {
    setAccountZone(user?.displayTimezone ?? null);
  }, [user?.displayTimezone]);

  // One-time carry-over from when this setting was per device: if a browser
  // still holds the old localStorage value and the account has never chosen,
  // push it up so an existing choice does not silently revert to Eastern. The
  // key is read and cleared in one go, so this runs at most once per browser.
  // Best-effort — the demo cannot write, and a failure just means re-picking.
  useEffect(() => {
    if (!user || user.isDemo) return;
    const legacy = takeLegacyDeviceZone();
    if (!legacy || user.displayTimezone !== DEFAULT_ZONE) return;
    api
      .updateProfile({ displayTimezone: legacy })
      .then((r) => setUser(r.user))
      .catch(() => {
        /* leave the account on its default; the picker still works */
      });
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.login(email, password);
    if (!r.requiresTwoFactor) setUser(r.user);
    return r;
  }, []);

  const verifyTwoFactor = useCallback(async (code: string, remember: boolean) => {
    const r = await api.verifyTwoFactor(code, remember);
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

  const acceptTerms = useCallback(async () => {
    const r = await api.acceptTerms();
    setUser(r.user);
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const r = await api.changePassword(currentPassword, newPassword);
      setUser(r.user);
    },
    [],
  );

  const updateProfile = useCallback(
    async (patch: {
      username?: string;
      displayName?: string;
      email?: string;
      avatar?: string;
      displayTimezone?: string;
      hideFromLeaderboards?: boolean;
    }) => {
      const r = await api.updateProfile(patch);
      setUser(r.user);
    },
    [],
  );

  const refreshUser = useCallback(async () => {
    const r = await api.me();
    setUser(r.user);
  }, []);

  return (
    <AuthCtx.Provider
      value={{ user, loading, login, verifyTwoFactor, demoLogin, logout, acceptTerms, changePassword, updateProfile, refreshUser }}
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
