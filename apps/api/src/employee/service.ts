import crypto from 'node:crypto';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  employeeAnnouncements,
  employeeDocuments,
  employeeProfiles,
  employeeTasks,
  users,
  type EmployeeDocCategory,
  type EmployeeTaskRow,
  type EmployeeProfileRow,
  type EmploymentType,
  type EmployeeStatus,
  type UserRow,
  type WorkingStatus,
} from '../db/schema.js';
import {
  COMPANY_EMAIL_DOMAIN,
  isCompanyEmail,
  isFounder,
  parseRoles,
  type RoleKey,
} from '../auth/rbac.js';
import { DEMO_USERNAME } from '../demo/identity.js';
import { destroyEmployeeSessionsForUser } from './sessions.js';

// Data access for the employee portal. Everything here assumes the caller has
// already been through the guard — this module is about shaping records, not
// about who may see them.

export class EmployeeError extends Error {}

// ---- Profiles ----

// The self-view: who you are, and the security state of your own account.
export interface EmployeeMe {
  userId: string;
  name: string;
  loginEmail: string | null;
  avatarUrl: string | null;
  title: string | null;
  department: string | null;
  workEmail: string | null;
  workPhone: string | null;
  location: string | null;
  employeeNo: string | null;
  employmentType: EmploymentType;
  startedOn: string | null;
  status: EmployeeStatus;
  workingStatus: WorkingStatus;
  managerName: string | null;
  isPortalAdmin: boolean;
  // Founder-level on the underlying account — gates the inline wording editor.
  // Narrower than isPortalAdmin on purpose; see EmployeeContext.
  isDeveloper: boolean;
  twoFactorEnrolled: boolean;
  recoveryCodesLeft: number;
  lastLoginAt: number | null;
  lastLoginIp: string | null;
}

function countRecoveryCodes(raw: string | null): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export async function buildMe(
  user: UserRow,
  profile: EmployeeProfileRow,
  isPortalAdmin: boolean,
  isDeveloper = false,
): Promise<EmployeeMe> {
  let managerName: string | null = null;
  if (profile.managerId) {
    const m = (
      await db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, profile.managerId))
        .limit(1)
    )[0];
    managerName = m?.displayName ?? null;
  }
  return {
    userId: user.id,
    name: user.displayName,
    loginEmail: user.email,
    avatarUrl: user.avatar ?? null,
    title: profile.title,
    department: profile.department,
    workEmail: profile.workEmail,
    workPhone: profile.workPhone,
    location: profile.location,
    employeeNo: profile.employeeNo,
    employmentType: profile.employmentType,
    startedOn: profile.startedOn,
    status: profile.status,
    workingStatus: profile.workingStatus,
    managerName,
    isPortalAdmin,
    isDeveloper,
    twoFactorEnrolled: !!profile.totpSecret,
    recoveryCodesLeft: countRecoveryCodes(profile.recoveryCodes),
    lastLoginAt: profile.lastLoginAt?.getTime() ?? null,
    lastLoginIp: profile.lastLoginIp,
  };
}

// Create the HR record on demand. A user can hold the `employee` role before
// anyone has filled in their details; the first sign-in materializes an empty
// active profile so there is always a row to attach security state to.
export async function ensureProfile(userId: string): Promise<EmployeeProfileRow> {
  const existing = (
    await db.select().from(employeeProfiles).where(eq(employeeProfiles.userId, userId)).limit(1)
  )[0];
  if (existing) return existing;
  const now = new Date();
  await db.insert(employeeProfiles).values({
    userId,
    employmentType: 'full_time',
    status: 'active',
    isAdmin: false,
    createdAt: now,
    updatedAt: now,
  });
  return (
    await db.select().from(employeeProfiles).where(eq(employeeProfiles.userId, userId)).limit(1)
  )[0];
}

// ---- Directory ----

export interface DirectoryEntry {
  userId: string;
  name: string;
  avatarUrl: string | null;
  title: string | null;
  department: string | null;
  workEmail: string | null;
  workPhone: string | null;
  location: string | null;
  employmentType: EmploymentType;
  startedOn: string | null;
  workingStatus: WorkingStatus;
  /** Whether they have uploaded a headshot — drives the "still needs a photo" roster. */
  hasPhoto: boolean;
  managerName: string | null;
  isPortalAdmin: boolean;
  isMe: boolean;
}

// Everyone with an active employee record. Suspended and offboarded people drop
// out of the directory (their records stay for HR in the admin screen).
export async function getDirectory(viewerId: string): Promise<DirectoryEntry[]> {
  const rows = await db
    .select({ profile: employeeProfiles, user: users })
    .from(employeeProfiles)
    .innerJoin(users, eq(users.id, employeeProfiles.userId))
    .where(and(eq(employeeProfiles.status, 'active'), eq(users.active, true)));

  const names = new Map(rows.map((r) => [r.user.id, r.user.displayName]));
  // A manager who is not themselves an employee still needs a name.
  const missing = rows
    .map((r) => r.profile.managerId)
    .filter((id): id is string => !!id && !names.has(id));
  if (missing.length) {
    const extra = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, [...new Set(missing)]));
    for (const u of extra) names.set(u.id, u.displayName);
  }

  return rows
    .filter((r) => r.user.username !== DEMO_USERNAME)
    .map((r) => ({
      userId: r.user.id,
      name: r.user.displayName,
      avatarUrl: r.user.avatar ?? null,
      title: r.profile.title,
      department: r.profile.department,
      workEmail: r.profile.workEmail,
      workPhone: r.profile.workPhone,
      location: r.profile.location,
      employmentType: r.profile.employmentType,
      startedOn: r.profile.startedOn,
      workingStatus: r.profile.workingStatus,
      hasPhoto: !!r.user.avatar,
      managerName: r.profile.managerId ? names.get(r.profile.managerId) ?? null : null,
      isPortalAdmin: r.profile.isAdmin || isFounder(parseRoles(r.user)),
      isMe: r.user.id === viewerId,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---- Announcements ----

export interface AnnouncementView {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  authorName: string | null;
  createdAt: number;
  updatedAt: number;
}

export async function listAnnouncements(limit = 50): Promise<AnnouncementView[]> {
  const rows = await db
    .select()
    .from(employeeAnnouncements)
    .orderBy(desc(employeeAnnouncements.createdAt))
    .limit(limit);
  return rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      pinned: r.pinned,
      authorName: r.authorName,
      createdAt: r.createdAt.getTime(),
      updatedAt: r.updatedAt.getTime(),
    }))
    // Pinned first, newest within each group.
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
}

export async function createAnnouncement(
  input: { title: string; body: string; pinned?: boolean },
  author: UserRow,
): Promise<AnnouncementView> {
  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(employeeAnnouncements).values({
    id,
    title: input.title.trim(),
    body: input.body.trim(),
    pinned: input.pinned ?? false,
    authorId: author.id,
    authorName: author.displayName,
    createdAt: now,
    updatedAt: now,
  });
  const created = (await listAnnouncements()).find((a) => a.id === id);
  if (!created) throw new EmployeeError('Could not create the announcement');
  return created;
}

export async function updateAnnouncement(
  id: string,
  patch: { title?: string; body?: string; pinned?: boolean },
): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title != null) set.title = patch.title.trim();
  if (patch.body != null) set.body = patch.body.trim();
  if (patch.pinned != null) set.pinned = patch.pinned;
  await db.update(employeeAnnouncements).set(set).where(eq(employeeAnnouncements.id, id));
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await db.delete(employeeAnnouncements).where(eq(employeeAnnouncements.id, id));
}

// ---- Documents ----

export interface DocumentView {
  id: string;
  title: string;
  category: EmployeeDocCategory;
  summary: string | null;
  body: string | null;
  linkUrl: string | null;
  authorName: string | null;
  createdAt: number;
  updatedAt: number;
}

export async function listDocuments(): Promise<DocumentView[]> {
  const rows = await db.select().from(employeeDocuments).orderBy(desc(employeeDocuments.updatedAt));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    summary: r.summary,
    body: r.body,
    linkUrl: r.linkUrl,
    authorName: r.authorName,
    createdAt: r.createdAt.getTime(),
    updatedAt: r.updatedAt.getTime(),
  }));
}

export async function createDocument(
  input: {
    title: string;
    category: EmployeeDocCategory;
    summary?: string | null;
    body?: string | null;
    linkUrl?: string | null;
  },
  author: UserRow,
): Promise<DocumentView> {
  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(employeeDocuments).values({
    id,
    title: input.title.trim(),
    category: input.category,
    summary: input.summary?.trim() || null,
    body: input.body?.trim() || null,
    linkUrl: input.linkUrl?.trim() || null,
    authorId: author.id,
    authorName: author.displayName,
    createdAt: now,
    updatedAt: now,
  });
  const created = (await listDocuments()).find((d) => d.id === id);
  if (!created) throw new EmployeeError('Could not create the document');
  return created;
}

export async function updateDocument(
  id: string,
  patch: {
    title?: string;
    category?: EmployeeDocCategory;
    summary?: string | null;
    body?: string | null;
    linkUrl?: string | null;
  },
): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title != null) set.title = patch.title.trim();
  if (patch.category != null) set.category = patch.category;
  if (patch.summary !== undefined) set.summary = patch.summary?.trim() || null;
  if (patch.body !== undefined) set.body = patch.body?.trim() || null;
  if (patch.linkUrl !== undefined) set.linkUrl = patch.linkUrl?.trim() || null;
  await db.update(employeeDocuments).set(set).where(eq(employeeDocuments.id, id));
}

export async function deleteDocument(id: string): Promise<void> {
  await db.delete(employeeDocuments).where(eq(employeeDocuments.id, id));
}

// ---- People management (portal admins) ----

export interface PersonView extends DirectoryEntry {
  status: EmployeeStatus;
  employeeNo: string | null;
  managerId: string | null;
  twoFactorEnrolled: boolean;
  lastLoginAt: number | null;
  accountActive: boolean;
  hasRole: boolean;
}

// Every employee record, including suspended and offboarded people — the HR view.
export async function listPeople(viewerId: string): Promise<PersonView[]> {
  const rows = await db
    .select({ profile: employeeProfiles, user: users })
    .from(employeeProfiles)
    .innerJoin(users, eq(users.id, employeeProfiles.userId));

  const names = new Map(rows.map((r) => [r.user.id, r.user.displayName]));
  const missing = rows
    .map((r) => r.profile.managerId)
    .filter((id): id is string => !!id && !names.has(id));
  if (missing.length) {
    const extra = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, [...new Set(missing)]));
    for (const u of extra) names.set(u.id, u.displayName);
  }

  return rows
    .map((r) => {
      const roles = parseRoles(r.user);
      return {
        userId: r.user.id,
        name: r.user.displayName,
        avatarUrl: r.user.avatar ?? null,
        title: r.profile.title,
        department: r.profile.department,
        workEmail: r.profile.workEmail,
        workPhone: r.profile.workPhone,
        location: r.profile.location,
        employmentType: r.profile.employmentType,
        startedOn: r.profile.startedOn,
        workingStatus: r.profile.workingStatus,
        hasPhoto: !!r.user.avatar,
        managerId: r.profile.managerId,
        managerName: r.profile.managerId ? names.get(r.profile.managerId) ?? null : null,
        isPortalAdmin: r.profile.isAdmin || isFounder(roles),
        isMe: r.user.id === viewerId,
        status: r.profile.status,
        employeeNo: r.profile.employeeNo,
        twoFactorEnrolled: !!r.profile.totpSecret,
        lastLoginAt: r.profile.lastLoginAt?.getTime() ?? null,
        accountActive: r.user.active,
        // The role is the actual access grant; a record without it cannot sign in.
        hasRole: roles.includes('employee'),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface CandidateView {
  userId: string;
  name: string;
  username: string;
  email: string | null;
}

// Portal accounts that could be given employee access — anyone active who does
// not already hold the role. The demo is never a candidate.
export async function listCandidates(): Promise<CandidateView[]> {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.active, true), ne(users.username, DEMO_USERNAME)));
  return rows
    .filter((u) => !parseRoles(u).includes('employee'))
    .map((u) => ({ userId: u.id, name: u.displayName, username: u.username, email: u.email }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function withRole(roles: RoleKey[], role: RoleKey, on: boolean): string {
  const next = new Set(roles);
  if (on) next.add(role);
  else next.delete(role);
  return JSON.stringify([...next]);
}

// Grant employee-portal access: add the role and create the HR record. Both are
// required for a sign-in, so this is the single place access begins.
export async function grantEmployeeAccess(
  userId: string,
  details: ProfilePatch,
): Promise<void> {
  const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user) throw new EmployeeError('That account no longer exists');
  if (user.username === DEMO_USERNAME) {
    throw new EmployeeError('The demo account can never be given employee access');
  }
  if (!user.active) throw new EmployeeError('That account is deactivated');
  // Refuse here rather than granting a role that would silently fail at the
  // door — the domain check runs at every employee sign-in regardless.
  if (!isCompanyEmail(user.email)) {
    throw new EmployeeError(
      `Employee access requires a @${COMPANY_EMAIL_DOMAIN} sign-in email. Change it in Admin ▸ Users first.`,
    );
  }

  const roles = parseRoles(user);
  await db
    .update(users)
    .set({ roles: withRole(roles, 'employee', true), updatedAt: new Date() })
    .where(eq(users.id, userId));
  await ensureProfile(userId);
  await updateProfile(userId, { ...details, status: details.status ?? 'active' });
}

// Revoke access: drop the role, mark the record offboarded, and cut every live
// employee session immediately (rather than letting one run to expiry).
export async function revokeEmployeeAccess(userId: string): Promise<void> {
  const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user) throw new EmployeeError('That account no longer exists');
  await db
    .update(users)
    .set({ roles: withRole(parseRoles(user), 'employee', false), updatedAt: new Date() })
    .where(eq(users.id, userId));
  await db
    .update(employeeProfiles)
    .set({ status: 'offboarded', isAdmin: false, updatedAt: new Date() })
    .where(eq(employeeProfiles.userId, userId));
  await destroyEmployeeSessionsForUser(userId);
}

export interface ProfilePatch {
  employeeNo?: string | null;
  title?: string | null;
  department?: string | null;
  workEmail?: string | null;
  workPhone?: string | null;
  location?: string | null;
  managerId?: string | null;
  employmentType?: EmploymentType;
  startedOn?: string | null;
  status?: EmployeeStatus;
  isAdmin?: boolean;
}

function clean(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = v.trim();
  return t ? t : null;
}

export async function updateProfile(userId: string, patch: ProfilePatch): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.employeeNo !== undefined) set.employeeNo = clean(patch.employeeNo);
  if (patch.title !== undefined) set.title = clean(patch.title);
  if (patch.department !== undefined) set.department = clean(patch.department);
  if (patch.workEmail !== undefined) set.workEmail = clean(patch.workEmail)?.toLowerCase() ?? null;
  if (patch.workPhone !== undefined) set.workPhone = clean(patch.workPhone);
  if (patch.location !== undefined) set.location = clean(patch.location);
  if (patch.employmentType !== undefined) set.employmentType = patch.employmentType;
  if (patch.startedOn !== undefined) set.startedOn = clean(patch.startedOn);
  if (patch.isAdmin !== undefined) set.isAdmin = patch.isAdmin;
  if (patch.managerId !== undefined) {
    // A manager must be a real account, and nobody manages themselves.
    if (!patch.managerId || patch.managerId === userId) {
      set.managerId = null;
    } else {
      const exists = (
        await db.select({ id: users.id }).from(users).where(eq(users.id, patch.managerId)).limit(1)
      )[0];
      set.managerId = exists ? patch.managerId : null;
    }
  }
  if (patch.status !== undefined) set.status = patch.status;

  await db.update(employeeProfiles).set(set).where(eq(employeeProfiles.userId, userId));

  // Anything short of "active" ends the person's access right now.
  if (patch.status !== undefined && patch.status !== 'active') {
    await destroyEmployeeSessionsForUser(userId);
  }
}

// Clear a lost second factor so the employee can enroll a fresh one. Every live
// session for them is dropped at the same time — an enrolled device that is
// being replaced must not keep an authenticated session alive.
export async function resetTwoFactor(userId: string): Promise<void> {
  await db
    .update(employeeProfiles)
    .set({
      totpSecret: null,
      totpEnrolledAt: null,
      totpLastStep: null,
      recoveryCodes: null,
      updatedAt: new Date(),
    })
    .where(eq(employeeProfiles.userId, userId));
  await destroyEmployeeSessionsForUser(userId);
}

// ---- Tasks ----
//
// The "My tasks" card. Every read and write below is scoped to one person by
// `userId`; there is no query here that returns another employee's tasks, which
// is what keeps the surface honest even before the route guards run.

export interface TaskView {
  id: string;
  title: string;
  detail: string | null;
  dueOn: string | null;
  doneAt: number | null;
  assignedByName: string | null;
  /** True when someone else set this, so the UI can say where it came from. */
  assigned: boolean;
  createdAt: number;
}

function toTaskView(r: EmployeeTaskRow, viewerId: string): TaskView {
  return {
    id: r.id,
    title: r.title,
    detail: r.detail,
    dueOn: r.dueOn,
    doneAt: r.doneAt?.getTime() ?? null,
    assignedByName: r.assignedByName,
    assigned: !!r.assignedBy && r.assignedBy !== viewerId,
    createdAt: r.createdAt.getTime(),
  };
}

// Open tasks first, then by due date (undated last), then oldest first. Done
// tasks sink to the bottom, most recently completed first, so ticking one off
// moves it out of the way without it vanishing.
function sortTasks(a: TaskView, b: TaskView): number {
  if (!a.doneAt !== !b.doneAt) return a.doneAt ? 1 : -1;
  if (a.doneAt && b.doneAt) return b.doneAt - a.doneAt;
  if (a.dueOn !== b.dueOn) {
    if (!a.dueOn) return 1;
    if (!b.dueOn) return -1;
    return a.dueOn.localeCompare(b.dueOn);
  }
  return a.createdAt - b.createdAt;
}

export async function listMyTasks(userId: string): Promise<TaskView[]> {
  const rows = await db.select().from(employeeTasks).where(eq(employeeTasks.userId, userId));
  return rows.map((r) => toTaskView(r, userId)).sort(sortTasks);
}

export interface TaskInput {
  title: string;
  detail?: string | null;
  dueOn?: string | null;
}

// Add a task for one person. `assignedBy` is the actor — the same as `userId`
// when someone is adding their own.
export async function createTask(
  userId: string,
  input: TaskInput,
  actor: UserRow,
): Promise<void> {
  const now = new Date();
  await db.insert(employeeTasks).values({
    id: crypto.randomUUID(),
    userId,
    title: input.title.trim(),
    detail: input.detail?.trim() || null,
    dueOn: input.dueOn?.trim() || null,
    doneAt: null,
    assignedBy: actor.id,
    assignedByName: actor.displayName,
    createdAt: now,
    updatedAt: now,
  });
}

// Assign the same task to every active employee — one row each, so completion
// is per person. Returns how many were written.
export async function assignTaskToAll(input: TaskInput, actor: UserRow): Promise<number> {
  const rows = await db
    .select({ userId: employeeProfiles.userId, username: users.username })
    .from(employeeProfiles)
    .innerJoin(users, eq(users.id, employeeProfiles.userId))
    .where(and(eq(employeeProfiles.status, 'active'), eq(users.active, true)));
  const targets = rows.filter((r) => r.username !== DEMO_USERNAME);
  for (const t of targets) await createTask(t.userId, input, actor);
  return targets.length;
}

// Tick a task off, or un-tick it. Scoped to the owner — passing someone else's
// task id simply matches nothing.
export async function setTaskDone(
  userId: string,
  taskId: string,
  done: boolean,
): Promise<boolean> {
  const existing = (
    await db
      .select()
      .from(employeeTasks)
      .where(and(eq(employeeTasks.id, taskId), eq(employeeTasks.userId, userId)))
      .limit(1)
  )[0];
  if (!existing) return false;
  await db
    .update(employeeTasks)
    .set({ doneAt: done ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(employeeTasks.id, taskId), eq(employeeTasks.userId, userId)));
  return true;
}

// Remove one of your own tasks. Same scoping as above.
export async function deleteTask(userId: string, taskId: string): Promise<boolean> {
  const existing = (
    await db
      .select({ id: employeeTasks.id })
      .from(employeeTasks)
      .where(and(eq(employeeTasks.id, taskId), eq(employeeTasks.userId, userId)))
      .limit(1)
  )[0];
  if (!existing) return false;
  await db
    .delete(employeeTasks)
    .where(and(eq(employeeTasks.id, taskId), eq(employeeTasks.userId, userId)));
  return true;
}


// ---- Your own photo and working status ----
//
// Both are things a person sets about themselves. Neither is an HR field: a
// portal admin can edit someone's title or department from the People screen,
// but not their face or where they are working from today.

// Store a headshot. The image arrives already center-cropped and downscaled by
// the browser (see employee/image.ts) — the server's job is to refuse anything
// that is not a plausible inline image, and to cap the size so one upload cannot
// bloat the users table.
// Used both for your own face and — via the developer route — for someone
// else's. The write is identical; who is allowed to ask for it is the difference,
// and that is settled by the route's guard.
export async function setUserPhoto(userId: string, dataUrl: string | null): Promise<void> {
  await db
    .update(users)
    .set({ avatar: dataUrl, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function setMyWorkingStatus(userId: string, status: WorkingStatus): Promise<void> {
  await db
    .update(employeeProfiles)
    .set({ workingStatus: status, updatedAt: new Date() })
    .where(eq(employeeProfiles.userId, userId));
}
