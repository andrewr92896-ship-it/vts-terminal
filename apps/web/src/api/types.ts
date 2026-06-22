import type { WorkspaceKey } from '../theme/themes';

// Granular, admin-assigned roles (mirror of backend auth/rbac.ts ROLE_KEYS).
// A user can hold any combination.
export type RoleKey =
  | 'admin'
  | 'trading'
  | 'trading_viewer'
  | 'sales'
  | 'studies'
  | 'todo';

// Matches the backend's PublicUser shape (auth/rbac.ts).
export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  roles: RoleKey[];
  viewBrokerage: boolean;
  mustChangePassword: boolean;
  access: {
    label: string;
    workspaces: WorkspaceKey[];
    readOnlyWorkspaces: WorkspaceKey[];
  };
}

// Admin user-management view (matches the backend AdminUserView). Includes
// the original created username, which never changes when a user renames.
export interface AdminUser {
  id: string;
  username: string;
  createdUsername: string;
  displayName: string;
  email: string | null;
  roles: RoleKey[];
  active: boolean;
  viewBrokerage: boolean;
  mustChangePassword: boolean;
  createdAt: number;
}

export type TodoMarker = 'check' | 'dash' | 'dot';

export interface TodoItem {
  id: string;
  code: string;
  text: string;
  marker: TodoMarker;
  checkable: boolean;
  done: boolean;
  recurring: boolean;
  timer: string | null;
  overdue: boolean;
  dueToday: boolean;
}

export interface TodoSection {
  id: string;
  n: number;
  icon: string;
  title: string;
  type: 'one' | 'note' | 'daily' | 'routine' | 'deals';
  tag: string | null;
  life: boolean;
  count: number;
  empty: boolean;
  items: TodoItem[];
}

export interface KiaDeal {
  id: string;
  customer: string;
  model: string;
  type: 'New' | 'Used';
  profit: number;
  dateLabel: string;
  soldAt: number;
}

export interface KiaMetrics {
  units: number;
  goalUnits: number;
  toGoal: number;
  unitPct: number;
  totalProfit: number;
  commission: number;
  commissionRate: number;
  reviewCount: number;
  reviewPct: number;
  reviewReq: number;
  reviewOk: boolean;
  bonusTiers: { units: number; amount: number }[];
  bonusEarned: number;
  tierHitUnits: number | null;
  nextBonus: { units: number; amount: number; toGo: number } | null;
  daysInMonth: number;
  dayOfMonth: number;
  daysLeft: number;
  paceUnits: number;
  paceProfit: number;
  paceComm: number;
  onPace: boolean;
}

export interface KiaDashboard {
  deals: KiaDeal[];
  metrics: KiaMetrics;
  settings: { goalUnits: number; reviewCount: number };
}

export interface BrokerStatus {
  key: string;
  name: string;
  short: string;
  platform: string;
  kind: string;
  status: 'live' | 'pending' | 'unconfigured' | 'error';
  balance: string | null;
  lastSyncAt: string | null;
}
