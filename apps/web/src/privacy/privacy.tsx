import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// "Demo / privacy mode" — a global toggle for showing the terminal to others
// without exposing real customer information. When on, components mask
// customer/client names, contact details, and dollar amounts. It only affects
// what's rendered (no data changes) and persists across reloads so a live demo
// stays masked.

interface PrivacyState {
  privacy: boolean;
  toggle: () => void;
}

const PrivacyCtx = createContext<PrivacyState>({ privacy: false, toggle: () => {} });

const STORAGE_KEY = 'vts_privacy_mode';

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [privacy, setPrivacy] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, privacy ? '1' : '0');
    } catch {
      /* ignore storage failures */
    }
  }, [privacy]);

  return (
    <PrivacyCtx.Provider value={{ privacy, toggle: () => setPrivacy((v) => !v) }}>
      {children}
    </PrivacyCtx.Provider>
  );
}

export function usePrivacy(): PrivacyState {
  return useContext(PrivacyCtx);
}

// Replacement shown in place of a redacted name/value.
export const REDACTED = '••••••';

// Mask a personal name when privacy mode is on.
export function maskName(name: string, privacy: boolean, fallback = 'Customer'): string {
  return privacy ? fallback : name;
}
