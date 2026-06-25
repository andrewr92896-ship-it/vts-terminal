import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// The Kia workspace can show either the specific dealership name or a generic
// label, for users who don't work at Kia of Streetsboro. When generic, the user
// can set their own custom name (e.g. their actual dealership); if they leave it
// blank we fall back to a neutral default. Both the toggle and the custom name
// are persisted so the choice sticks across reloads, and shared via context so
// the top bar and the dashboard stay in sync.
export const KIA_DEALERSHIP = 'Kia of Streetsboro';
export const GENERIC_DEALERSHIP = 'Vitalis Car Sales Tracker';

const STORAGE_KEY = 'vts_generic_dealership';
const NAME_KEY = 'vts_dealership_name';

interface DealershipState {
  generic: boolean;
  name: string; // the resolved label currently shown
  customName: string; // the user's custom generic name ('' = use the default)
  toggle: () => void;
  setCustomName: (name: string) => void;
}

const DealershipCtx = createContext<DealershipState>({
  generic: false,
  name: KIA_DEALERSHIP,
  customName: '',
  toggle: () => {},
  setCustomName: () => {},
});

export function DealershipProvider({ children }: { children: ReactNode }) {
  const [generic, setGeneric] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [customName, setCustomName] = useState<string>(() => {
    try {
      return localStorage.getItem(NAME_KEY) ?? '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, generic ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [generic]);

  useEffect(() => {
    try {
      localStorage.setItem(NAME_KEY, customName);
    } catch {
      /* ignore */
    }
  }, [customName]);

  // In generic mode, prefer the user's custom name; fall back to the neutral
  // default when they haven't set one.
  const name = generic ? customName.trim() || GENERIC_DEALERSHIP : KIA_DEALERSHIP;

  return (
    <DealershipCtx.Provider
      value={{ generic, name, customName, toggle: () => setGeneric((v) => !v), setCustomName }}
    >
      {children}
    </DealershipCtx.Provider>
  );
}

export function useDealership(): DealershipState {
  return useContext(DealershipCtx);
}
