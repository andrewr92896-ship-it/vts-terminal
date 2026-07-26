import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { employeeApi } from './api';

// Admin-editable wording for the employee portal.
//
// The portal-wide rule (CLAUDE.md) is that every coded string is editable
// through the `copy.<id>` overrides in app_settings. The employee bundle honours
// that store but only *reads* it: this surface is a separate, hardened page with
// its own session, so it does not carry the main portal's inline edit mode or
// its founder auth. Wording is written from the main portal's Site Wording
// tooling and rendered here. Employee-portal ids are namespaced `emp.*`.

// Same sentinel the main portal uses for "this coded text is hidden".
const HIDDEN = '[[vts:hidden]]';

const Ctx = createContext<Record<string, string>>({});

export function EmployeeCopyProvider({ children }: { children: ReactNode }) {
  const [copy, setCopy] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    // Best-effort: wording overrides are a nicety, never a reason for the portal
    // to fail to render.
    employeeApi
      .copy()
      .then((r) => {
        if (alive) setCopy(r.copy ?? {});
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return <Ctx.Provider value={copy}>{children}</Ctx.Provider>;
}

// Wrap any coded string: <T id="emp.overview.title">Overview</T>. Use the
// `text` form when the string comes from a variable.
export function T({
  id,
  children,
  text,
}: {
  id: string;
  children?: ReactNode;
  text?: string;
}) {
  const copy = useContext(Ctx);
  const def = text ?? (typeof children === 'string' ? children : '');
  const override = copy[id];
  if (override === HIDDEN) return null;
  return <>{override || def}</>;
}

// The string form, for places that need a plain value (a placeholder, a title
// attribute, an aria-label) rather than a node.
export function useCopy(id: string, def: string): string {
  const copy = useContext(Ctx);
  const override = copy[id];
  if (override === HIDDEN) return '';
  return override || def;
}
