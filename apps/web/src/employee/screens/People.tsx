import { useEffect, useState } from 'react';
import {
  employeeApi,
  type CandidateView,
  type EmployeeStatus,
  type EmploymentType,
  type PeopleData,
  type PersonView,
  type ProfilePatch,
} from '../api';
import { EMP, EMPLOYMENT_LABELS, STATUS_LABELS, fmtDate, fmtDateTime } from '../theme';
import { T } from '../copy';
import {
  Banner,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Input,
  Pill,
  ScreenHeader,
  Select,
  label,
} from '../ui';
import { Avatar } from './Overview';
import { Icon } from '../../components/Icon';

// The HR screen — portal administrators only. Granting access here does two
// things at once: it adds the `employee` role to the portal account and creates
// the employee record. Both are required to sign in, so revoking either one
// closes the door immediately.

const TYPE_OPTIONS: { value: EmploymentType; label: string }[] = (
  ['full_time', 'part_time', 'contractor', 'intern'] as EmploymentType[]
).map((value) => ({ value, label: EMPLOYMENT_LABELS[value] }));

const STATUS_OPTIONS: { value: EmployeeStatus; label: string }[] = (
  ['active', 'suspended', 'offboarded'] as EmployeeStatus[]
).map((value) => ({ value, label: STATUS_LABELS[value] }));

export function People({ myUserId }: { myUserId: string }) {
  const [data, setData] = useState<PeopleData | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [granting, setGranting] = useState(false);

  function load() {
    employeeApi
      .people()
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }

  useEffect(load, []);

  if (error) return <Empty icon="x-circle">{error}</Empty>;
  if (!data) {
    return (
      <Empty icon="refresh-cw">
        <T id="emp.people.loading">Loading…</T>
      </Empty>
    );
  }

  return (
    <div>
      <ScreenHeader
        icon="user-plus"
        title={<T id="emp.people.title">People</T>}
        subtitle={
          <T id="emp.people.subtitle">
            Who has employee-portal access, and their record. Granting access adds the Employee role to
            their portal account; revoking it ends every session they have open.
          </T>
        }
        actions={
          <Button variant="primary" onClick={() => setGranting((v) => !v)}>
            <Icon name="user-plus" size={14} />
            {granting ? <T id="emp.people.cancel">Cancel</T> : <T id="emp.people.grant">Grant access</T>}
          </Button>
        }
      />

      {granting && (
        <GrantForm
          candidates={data.candidates}
          onDone={(next) => {
            setData(next);
            setGranting(false);
          }}
        />
      )}

      {data.people.length === 0 ? (
        <Empty icon="users">
          <T id="emp.people.empty">No employee records yet. Grant access to get started.</T>
        </Empty>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {data.people.map((p) => (
            <PersonRow
              key={p.userId}
              person={p}
              isMe={p.userId === myUserId}
              expanded={editing === p.userId}
              onToggle={() => setEditing(editing === p.userId ? null : p.userId)}
              onChanged={setData}
              onError={setError}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GrantForm({
  candidates,
  onDone,
}: {
  candidates: CandidateView[];
  onDone: (data: PeopleData) => void;
}) {
  const [userId, setUserId] = useState(candidates[0]?.userId ?? '');
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('full_time');
  const [startedOn, setStartedOn] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function grant() {
    if (busy) return;
    if (!userId) {
      setError('Pick an account');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const next = await employeeApi.grantAccess(userId, {
        title: title.trim() || null,
        department: department.trim() || null,
        workEmail: workEmail.trim() || null,
        employmentType,
        startedOn: startedOn.trim() || null,
        isAdmin,
      });
      onDone(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (candidates.length === 0) {
    return (
      <Card style={{ marginBottom: 18 }}>
        <Banner tone="warn">
          <T id="emp.people.no_candidates">
            Every active portal account already has employee access. Create the account in the main
            portal's Admin ▸ Users first.
          </T>
        </Banner>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: 18 }}>
      <div style={{ display: 'grid', gap: 13 }}>
        <Field
          label={<T id="emp.people.account">Portal account</T>}
          hint={<T id="emp.people.account_hint">Only active accounts without employee access are listed.</T>}
        >
          <Select
            value={userId}
            onChange={setUserId}
            options={candidates.map((c) => ({
              value: c.userId,
              label: `${c.name} (${c.email || c.username})`,
            }))}
          />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 13 }}>
          <Field label={<T id="emp.people.job_title">Title</T>}>
            <Input value={title} onChange={setTitle} maxLength={120} />
          </Field>
          <Field label={<T id="emp.people.department">Department</T>}>
            <Input value={department} onChange={setDepartment} maxLength={120} />
          </Field>
          <Field label={<T id="emp.people.work_email">Work email</T>}>
            <Input value={workEmail} onChange={setWorkEmail} maxLength={255} />
          </Field>
          <Field label={<T id="emp.people.employment">Employment</T>}>
            <Select value={employmentType} onChange={setEmploymentType} options={TYPE_OPTIONS} />
          </Field>
          <Field label={<T id="emp.people.start">Start date</T>} hint="YYYY-MM-DD">
            <Input value={startedOn} onChange={setStartedOn} placeholder="2026-01-15" maxLength={10} />
          </Field>
        </div>
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: EMP.muted, cursor: 'pointer' }}
        >
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
          <T id="emp.people.make_admin">Portal administrator (can manage people, announcements and documents)</T>
        </label>
        <ErrorNote>{error}</ErrorNote>
        <div>
          <Button variant="primary" onClick={grant} disabled={busy}>
            {busy ? <T id="emp.people.granting">Granting…</T> : <T id="emp.people.grant_confirm">Grant access</T>}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function PersonRow({
  person,
  isMe,
  expanded,
  onToggle,
  onChanged,
  onError,
}: {
  person: PersonView;
  isMe: boolean;
  expanded: boolean;
  onToggle: () => void;
  onChanged: (data: PeopleData) => void;
  onError: (msg: string) => void;
}) {
  const [patch, setPatch] = useState<ProfilePatch>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  function field<K extends keyof ProfilePatch>(key: K, fallback: ProfilePatch[K]): ProfilePatch[K] {
    return patch[key] !== undefined ? patch[key] : fallback;
  }

  async function save() {
    if (busy || Object.keys(patch).length === 0) return;
    setBusy(true);
    setFormError('');
    try {
      onChanged(await employeeApi.updatePerson(person.userId, patch));
      setPatch({});
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reset2fa() {
    if (!window.confirm(`Reset ${person.name}'s authenticator? They will set up a new one at next sign-in.`))
      return;
    try {
      onChanged(await employeeApi.resetTwoFactor(person.userId));
    } catch (e) {
      onError((e as Error).message);
    }
  }

  async function revoke() {
    if (!window.confirm(`Revoke ${person.name}'s employee access? Every session they have open ends now.`))
      return;
    try {
      onChanged(await employeeApi.revokeAccess(person.userId));
    } catch (e) {
      onError((e as Error).message);
    }
  }

  const statusTone =
    person.status === 'active' ? 'good' : person.status === 'suspended' ? 'warn' : 'bad';

  return (
    <Card pad={15}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Avatar name={person.name} url={person.avatarUrl} size={36} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, fontWeight: 650, color: EMP.text }}>{person.name}</span>
            <Pill tone={statusTone}>{STATUS_LABELS[person.status] ?? person.status}</Pill>
            {person.isPortalAdmin && (
              <Pill tone="accent">
                <T id="emp.people.admin_pill">Admin</T>
              </Pill>
            )}
            {!person.hasRole && (
              <Pill tone="bad">
                <T id="emp.people.no_role">No access</T>
              </Pill>
            )}
            {!person.twoFactorEnrolled && (
              <Pill tone="warn">
                <T id="emp.people.no_2fa">No 2FA</T>
              </Pill>
            )}
            {!person.accountActive && (
              <Pill tone="bad">
                <T id="emp.people.deactivated">Account off</T>
              </Pill>
            )}
          </div>
          <div style={{ fontSize: 12, color: EMP.muted, marginTop: 3 }}>
            {[person.title, person.department].filter(Boolean).join(' · ') || '—'}
          </div>
          <div style={{ fontSize: 11, color: EMP.faint, marginTop: 3, fontFamily: EMP.mono }}>
            last sign-in {fmtDateTime(person.lastLoginAt)} · started {fmtDate(person.startedOn)}
          </div>
        </div>
        <Button onClick={onToggle}>
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={13} />
          {expanded ? <T id="emp.people.close">Close</T> : <T id="emp.people.edit">Edit</T>}
        </Button>
      </div>

      {expanded && (
        <div style={{ marginTop: 15, paddingTop: 15, borderTop: `1px solid ${EMP.line}`, display: 'grid', gap: 13 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 13 }}>
            <Field label={<T id="emp.people.f_no">Employee no.</T>}>
              <Input
                value={field('employeeNo', person.employeeNo) ?? ''}
                onChange={(v) => setPatch((p) => ({ ...p, employeeNo: v }))}
                maxLength={40}
              />
            </Field>
            <Field label={<T id="emp.people.f_title">Title</T>}>
              <Input
                value={field('title', person.title) ?? ''}
                onChange={(v) => setPatch((p) => ({ ...p, title: v }))}
                maxLength={120}
              />
            </Field>
            <Field label={<T id="emp.people.f_dept">Department</T>}>
              <Input
                value={field('department', person.department) ?? ''}
                onChange={(v) => setPatch((p) => ({ ...p, department: v }))}
                maxLength={120}
              />
            </Field>
            <Field label={<T id="emp.people.f_email">Work email</T>}>
              <Input
                value={field('workEmail', person.workEmail) ?? ''}
                onChange={(v) => setPatch((p) => ({ ...p, workEmail: v }))}
                maxLength={255}
              />
            </Field>
            <Field label={<T id="emp.people.f_phone">Work phone</T>}>
              <Input
                value={field('workPhone', person.workPhone) ?? ''}
                onChange={(v) => setPatch((p) => ({ ...p, workPhone: v }))}
                maxLength={40}
              />
            </Field>
            <Field label={<T id="emp.people.f_location">Location</T>}>
              <Input
                value={field('location', person.location) ?? ''}
                onChange={(v) => setPatch((p) => ({ ...p, location: v }))}
                maxLength={120}
              />
            </Field>
            <Field label={<T id="emp.people.f_type">Employment</T>}>
              <Select
                value={(field('employmentType', person.employmentType) ?? 'full_time') as EmploymentType}
                onChange={(v) => setPatch((p) => ({ ...p, employmentType: v }))}
                options={TYPE_OPTIONS}
              />
            </Field>
            <Field label={<T id="emp.people.f_start">Start date</T>} hint="YYYY-MM-DD">
              <Input
                value={field('startedOn', person.startedOn) ?? ''}
                onChange={(v) => setPatch((p) => ({ ...p, startedOn: v }))}
                maxLength={10}
                placeholder="2026-01-15"
              />
            </Field>
            <Field label={<T id="emp.people.f_status">Status</T>}>
              <Select
                value={(field('status', person.status) ?? 'active') as EmployeeStatus}
                onChange={(v) => setPatch((p) => ({ ...p, status: v }))}
                options={STATUS_OPTIONS}
              />
            </Field>
          </div>

          <label
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: EMP.muted, cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={field('isAdmin', person.isPortalAdmin) ?? false}
              disabled={isMe}
              onChange={(e) => setPatch((p) => ({ ...p, isAdmin: e.target.checked }))}
            />
            <T id="emp.people.f_admin">Portal administrator</T>
            {isMe && (
              <span style={{ ...label, color: EMP.faint }}>
                <T id="emp.people.self_lock">— you cannot remove your own</T>
              </span>
            )}
          </label>

          <ErrorNote>{formError}</ErrorNote>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={save} disabled={busy || Object.keys(patch).length === 0}>
              {busy ? <T id="emp.people.saving">Saving…</T> : <T id="emp.people.save">Save changes</T>}
            </Button>
            <Button onClick={reset2fa} disabled={!person.twoFactorEnrolled}>
              <Icon name="refresh-cw" size={13} />
              <T id="emp.people.reset_2fa">Reset 2FA</T>
            </Button>
            {!isMe && (
              <Button variant="danger" onClick={revoke}>
                <Icon name="x-circle" size={13} />
                <T id="emp.people.revoke">Revoke access</T>
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
