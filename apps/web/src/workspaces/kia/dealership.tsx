import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// The Kia workspace can show either the specific dealership name or a generic
// label, for users who don't work at Kia of Streetsboro. Persisted so the
// choice sticks across reloads, and shared via context so the top bar and the
// dashboard stay in sync.
export const KIA_DEALERSHIP = 'Kia of Streetsboro';
export const GENERIC_DEALERSHIP = 'Vitalis Car Sales Tracker';

const STORAGE_KEY = 'vts_generic_dealership';

interface DealershipState {
  generic: boolean;
  name: string;
  toggle: () => void;
}

const DealershipCtx = createContext<DealershipState>({
  generic: false,
  name: KIA_DEALERSHIP,
  toggle: () => {},
});

export function DealershipProvider({ children }: { children: ReactNode }) {
  const [generic, setGeneric] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, generic ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [generic]);

  return (
    <DealershipCtx.Provider
      value={{ generic, name: generic ? GENERIC_DEALERSHIP : KIA_DEALERSHIP, toggle: () => setGeneric((v) => !v) }}
    >
      {children}
    </DealershipCtx.Provider>
  );
}

export function useDealership(): DealershipState {
  return useContext(DealershipCtx);
}
