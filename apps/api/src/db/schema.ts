import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

// The four roles match the prototype's access matrix exactly.
export const ROLES = ['Admin', 'Trader', 'Sales', 'Viewer'] as const;
export type Role = (typeof ROLES)[number];

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  // The username the account was created with. Never changes when the user
  // renames themselves, so admins can always identify the account. Nullable
  // for rows created before this column existed (backfilled in migration).
  createdUsername: text('created_username'),
  displayName: text('display_name').notNull(),
  email: text('email'),
  passwordHash: text('password_hash').notNull(),
  // Legacy single-role column. Superseded by `roles` (JSON array) below and no
  // longer read by the app; kept with its default so old rows stay valid.
  role: text('role', { enum: ROLES }).notNull().default('Viewer'),
  // Granular, admin-assigned roles as a JSON array of role keys
  // (see auth/rbac.ts ROLE_KEYS), e.g. ["admin"] or ["sales","studies"].
  roles: text('roles'),
  // Brokerage balances are hidden by default. This flag is the dedicated
  // grant required to view balances and account detail (Stage 2 onward).
  viewBrokerage: integer('view_brokerage', { mode: 'boolean' })
    .notNull()
    .default(false),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  mustChangePassword: integer('must_change_password', { mode: 'boolean' })
    .notNull()
    .default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

// Server-side sessions. The cookie holds a random token; we store only the
// SHA-256 hash of it here, so a database leak does not expose live sessions.
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), // sha256(token)
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
  userAgent: text('user_agent'),
});

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;

// ---- To Do List ----
// Section render/behavior types, mirroring the prototype:
//   one     - one-time checkbox tasks
//   note    - reflective notes shown as bullet dots (Life Changes), not checkable
//   daily   - daily reference list shown as dashes, not checkable
//   routine - recurring checkbox tasks with a reset interval and due date
//   deals   - working deals (Kia), placeholder section
export const SECTION_TYPES = ['one', 'note', 'daily', 'routine', 'deals'] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const todoSections = sqliteTable('todo_sections', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  n: integer('n').notNull(), // section number shown to the user
  icon: text('icon').notNull(),
  title: text('title').notNull(),
  type: text('type', { enum: SECTION_TYPES }).notNull(),
  tag: text('tag'), // 'kia' | 'trading' | null — for cross-listing in those workspaces
  life: integer('life', { mode: 'boolean' }).notNull().default(false),
  position: integer('position').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const todoItems = sqliteTable('todo_items', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  sectionId: text('section_id')
    .notNull()
    .references(() => todoSections.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  position: integer('position').notNull(),
  hyphen: integer('hyphen', { mode: 'boolean' }).notNull().default(false),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  // Recurring tasks only: dueAt is the next due date (stored as UTC midnight
  // of the Eastern-Time calendar day); intervalDays is the reset interval.
  dueAt: integer('due_at', { mode: 'timestamp_ms' }),
  intervalDays: integer('interval_days'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export type TodoSectionRow = typeof todoSections.$inferSelect;
export type TodoItemRow = typeof todoItems.$inferSelect;

// ---- Kia Sales ----
// Per-user Kia settings: the legacy goal/review fallback plus the editable pay
// plan (commission rate, bonus tiers, and the review requirement).
export const kiaSettings = sqliteTable('kia_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  goalUnits: integer('goal_units').notNull().default(12),
  reviewCount: integer('review_count').notNull().default(5),
  // Pay plan ----------------------------------------------------------------
  // Commission stored in basis points (1350 = 13.5%) to avoid float drift.
  commissionBp: integer('commission_bp').notNull().default(1350),
  // Whether the unit bonus requires a minimum review percentage at all.
  reviewRequired: integer('review_required', { mode: 'boolean' }).notNull().default(true),
  reviewReqPct: integer('review_req_pct').notNull().default(50),
  // JSON array of { units, amount } bonus tiers; null falls back to defaults.
  bonusTiers: text('bonus_tiers'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

// Per-month goal and review count, so each month's dashboard stands on its own.
export const kiaMonthSettings = sqliteTable(
  'kia_month_settings',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    month: text('month').notNull(), // 'YYYY-MM' (Eastern Time)
    goalUnits: integer('goal_units').notNull().default(12),
    reviewCount: integer('review_count').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.month] }) }),
);

export const kiaDeals = sqliteTable('kia_deals', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  customer: text('customer').notNull(),
  model: text('model').notNull(),
  type: text('type', { enum: ['New', 'Used'] }).notNull(),
  profit: integer('profit').notNull(), // whole US dollars
  soldAt: integer('sold_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export type KiaSettingsRow = typeof kiaSettings.$inferSelect;
export type KiaMonthSettingsRow = typeof kiaMonthSettings.$inferSelect;
export type KiaDealRow = typeof kiaDeals.$inferSelect;
