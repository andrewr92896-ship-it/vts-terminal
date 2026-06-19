import type { Role } from '../api/types';
import type { WorkspaceKey } from '../theme/themes';

// Mirror of the backend ACCESS matrix. The backend is the real enforcer;
// this drives UI gating and the Admin "view as role" preview.
interface AccessRule {
  ws: { trading: boolean; kia: boolean; todo: boolean };
  readOnly: boolean;
  label: string;
}

export const ACCESS: Record<Role, AccessRule> = {
  Admin: {
    ws: { trading: true, kia: true, todo: true },
    readOnly: false,
    label: 'Full access — every workspace and all to-do lists',
  },
  Trader: {
    ws: { trading: true, kia: false, todo: true },
    readOnly: false,
    label: 'Trading workspace + Trading and personal to-do lists',
  },
  Sales: {
    ws: { trading: false, kia: true, todo: true },
    readOnly: false,
    label: 'Kia workspace + Kia and personal to-do lists',
  },
  Viewer: {
    ws: { trading: true, kia: false, todo: false },
    readOnly: true,
    label: 'Read-only Trading; no personal to-do lists',
  },
};

export const ROLE_BADGE: Record<Role, string> = {
  Admin: 'Administrator',
  Trader: 'Trader',
  Sales: 'Sales',
  Viewer: 'Viewer',
};

// Ordered as the switcher shows them: To Do, Kia, Trading, Studies.
export function workspacesFor(role: Role): WorkspaceKey[] {
  const a = ACCESS[role] ?? ACCESS.Viewer;
  const out: WorkspaceKey[] = [];
  if (a.ws.todo) out.push('todo');
  if (a.ws.kia) out.push('kia');
  if (a.ws.trading) out.push('trading');
  out.push('studies');
  return out;
}
