import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useResponsive } from '../hooks/useMediaQuery';
import { ALL_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from '../auth/access';
import type { AdminUser, RoleKey, Team } from '../api/types';
import type { Theme } from '../theme/themes';
import { accentGradient } from '../theme/themes';

// Generate a readable temporary password the admin can hand to the new user.
function genPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  const rnd = new Uint32Array(12);
  crypto.getRandomValues(rnd);
  for (let i = 0; i < 12; i++) out += chars[rnd[i] % chars.length];
  return out;
}

function toggle(roles: RoleKey[], r: RoleKey): RoleKey[] {
  return roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r];
}

export function AdminUsers({ theme }: { theme: Theme }) {
  const { user: me } = useAuth();
  const { isPhone } = useResponsive();
  const accentGrad = accentGradient(theme);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Create form
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<RoleKey[]>(['todo']);
  const [teamId, setTeamId] = useState<string>('');
  const [password, setPassword] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);

  // Inline reset-password state
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState('');

  // Two-step delete confirmation: holds the id of the user awaiting confirm.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.adminListUsers(), api.adminListTeams()])
      .then(([u, t]) => {
        if (!alive) return;
        setUsers(u.users);
        setTeams(t.teams);
      })
      .catch((e) => alive && setLoadError(e instanceof ApiError ? e.message : 'Failed to load users'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  async function refresh() {
    const r = await api.adminListUsers();
    setUsers(r.users);
  }

  async function create() {
    setCreateError(null);
    setCreated(null);
    if (!displayName.trim() || !username.trim() || !email.trim()) {
      setCreateError('Name, email, and username are required.');
      return;
    }
    if (password.length < 8) {
      setCreateError('Temporary password must be at least 8 characters.');
      return;
    }
    setCreateBusy(true);
    try {
      await api.adminCreateUser({
        displayName: displayName.trim(),
        username: username.trim(),
        email: email.trim(),
        roles,
        teamId: teamId || null,
        password,
      });
      setCreated({ username: username.trim().toLowerCase(), password });
      setDisplayName('');
      setUsername('');
      setEmail('');
      setRoles(['todo']);
      setPassword('');
      await refresh();
    } catch (e) {
      setCreateError(e instanceof ApiError ? e.message : 'Could not create user.');
    } finally {
      setCreateBusy(false);
    }
  }

  async function patch(id: string, body: Parameters<typeof api.adminUpdateUser>[1]) {
    setBusyId(id);
    setActionError(null);
    try {
      await api.adminUpdateUser(id, body);
      await refresh();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Action failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function applyReset(id: string) {
    if (resetPw.length < 8) {
      setActionError('Temporary password must be at least 8 characters.');
      return;
    }
    await patch(id, { password: resetPw });
    setResetFor(null);
    setResetPw('');
  }

  async function remove(id: string) {
    setBusyId(id);
    setActionError(null);
    try {
      await api.adminDeleteUser(id);
      setConfirmDeleteId(null);
      await refresh();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Could not delete user.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div style={{ color: '#8ea3cc', padding: 20, fontSize: 13 }}>Loading users...</div>;
  if (loadError) return <div style={{ color: '#ef5468', padding: 20, fontSize: 13 }}>{loadError}</div>;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', color: '#dfe7fa' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#eef3ff' }}>Users</h2>
        <p style={{ margin: '5px 0 0', fontSize: 12.5, color: '#8ea3cc' }}>
          Create accounts and assign roles. A user can hold several roles; only admins can change
          them. New users start empty and set their own password on first sign-in.
        </p>
      </div>

      {/* Trading teams */}
      <TeamsManager
        teams={teams}
        setTeams={setTeams}
        onMembersChanged={refresh}
        onError={setActionError}
        theme={theme}
        accentGrad={accentGrad}
      />

      {/* Create a user */}
      <div style={{ ...panel(theme), marginBottom: 18 }}>
        <div style={panelLabel}>Add a user</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr',
            gap: 10,
          }}
        >
          <div>
            <label style={fieldLabel}>Display name</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Jane Smith" style={inputStyle} />
          </div>
          <div>
            <label style={fieldLabel}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@vitalistradingsystems.com"
              autoCapitalize="none"
              autoCorrect="off"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={fieldLabel}>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="jsmith" autoCapitalize="none" autoCorrect="off" style={inputStyle} />
          </div>
          <div>
            <label style={fieldLabel}>Temporary password</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" style={{ ...inputStyle, flex: 1 }} />
              <button type="button" onClick={() => setPassword(genPassword())} style={ghostBtn} title="Generate a password">
                Generate
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={fieldLabel}>Roles</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
            {ALL_ROLES.map((r) => (
              <RoleToggle
                key={r}
                role={r}
                on={roles.includes(r)}
                theme={theme}
                onClick={() => setRoles((cur) => toggle(cur, r))}
              />
            ))}
          </div>
        </div>

        <div style={{ marginTop: 14, maxWidth: isPhone ? '100%' : 320 }}>
          <label style={fieldLabel}>Trading team</label>
          <TeamSelect value={teamId} onChange={setTeamId} teams={teams} />
        </div>

        {createError && <div style={msgStyle(false)}>{createError}</div>}
        {created && (
          <div style={msgStyle(true)}>
            Created <strong>{created.username}</strong>. Temporary password:{' '}
            <code style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{created.password}</code>{' '}
            — share it with them; they'll set their own on first sign-in.
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <button
            onClick={create}
            disabled={createBusy}
            style={{ ...primaryBtn(theme, accentGrad), opacity: createBusy ? 0.6 : 1 }}
          >
            {createBusy ? 'Creating...' : 'Create user'}
          </button>
        </div>
      </div>

      {actionError && (
        <div onClick={() => setActionError(null)} style={{ ...msgStyle(false), cursor: 'pointer' }}>
          {actionError} (click to dismiss)
        </div>
      )}

      {/* User list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {users.map((u) => {
          const isSelf = me?.id === u.id;
          const renamed = u.username !== u.createdUsername;
          return (
            <div key={u.id} style={{ ...panel(theme), opacity: u.active ? 1 : 0.6 }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: isPhone ? 'column' : 'row',
                  alignItems: isPhone ? 'stretch' : 'flex-start',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#eef3ff' }}>
                    {u.displayName}
                    {isSelf && <span style={{ color: theme.accent, fontWeight: 600 }}> · you</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#8ea3cc', fontFamily: "'IBM Plex Mono', monospace", marginTop: 3 }}>
                    @{u.username}
                    {renamed && <span style={{ color: '#6f84b2' }}> (created as @{u.createdUsername})</span>}
                  </div>
                  {u.email && (
                    <div style={{ fontSize: 11.5, color: '#6f84b2', fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>
                      {u.email}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
                    {!u.active && <Badge color="#ef5468">Inactive</Badge>}
                    {u.mustChangePassword && <Badge color="#e0a23a">Must set password</Badge>}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    onClick={() => {
                      setResetFor(resetFor === u.id ? null : u.id);
                      setResetPw('');
                    }}
                    disabled={busyId === u.id}
                    style={ghostBtn}
                  >
                    Reset password
                  </button>

                  {!isSelf && confirmDeleteId !== u.id && (
                    <button
                      onClick={() => patch(u.id, { active: !u.active })}
                      disabled={busyId === u.id}
                      style={u.active ? dangerBtn : ghostBtn}
                    >
                      {u.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  )}

                  {!isSelf &&
                    (confirmDeleteId === u.id ? (
                      <>
                        <button
                          onClick={() => remove(u.id)}
                          disabled={busyId === u.id}
                          style={dangerSolidBtn}
                        >
                          {busyId === u.id ? 'Deleting...' : 'Confirm delete'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={busyId === u.id}
                          style={ghostBtn}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          setConfirmDeleteId(u.id);
                          setActionError(null);
                        }}
                        disabled={busyId === u.id}
                        style={ghostDangerBtn}
                        title="Permanently delete this account and all of its data"
                      >
                        Delete
                      </button>
                    ))}
                </div>
              </div>

              {confirmDeleteId === u.id && (
                <div style={{ ...msgStyle(false), marginTop: 10 }}>
                  Permanently delete <strong>{u.displayName}</strong> (@{u.username}) and all of
                  their data? This cannot be undone — use Deactivate instead to suspend access
                  without erasing anything.
                </div>
              )}

              {/* Role assignment */}
              <div style={{ marginTop: 12 }}>
                <div style={{ ...fieldLabel, marginBottom: 8 }}>Roles</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {ALL_ROLES.map((r) => {
                    // An admin can't remove their own admin role (lockout guard).
                    const locked = isSelf && r === 'admin' && u.roles.includes('admin');
                    return (
                      <RoleToggle
                        key={r}
                        role={r}
                        on={u.roles.includes(r)}
                        theme={theme}
                        disabled={busyId === u.id || locked}
                        onClick={() => patch(u.id, { roles: toggle(u.roles, r) })}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Trading team assignment */}
              <div style={{ marginTop: 12, maxWidth: isPhone ? '100%' : 320 }}>
                <div style={{ ...fieldLabel, marginBottom: 8 }}>Trading team</div>
                <TeamSelect
                  value={u.teamId ?? ''}
                  onChange={(v) => patch(u.id, { teamId: v || null })}
                  teams={teams}
                  disabled={busyId === u.id}
                />
              </div>

              {resetFor === u.id && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <input
                    value={resetPw}
                    onChange={(e) => setResetPw(e.target.value)}
                    placeholder="New temporary password (min 8)"
                    style={{ ...inputStyle, flex: '1 1 200px' }}
                  />
                  <button type="button" onClick={() => setResetPw(genPassword())} style={ghostBtn}>
                    Generate
                  </button>
                  <button
                    onClick={() => applyReset(u.id)}
                    disabled={busyId === u.id}
                    style={primaryBtn(theme, accentGrad)}
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RoleToggle({
  role,
  on,
  theme,
  disabled,
  onClick,
}: {
  role: RoleKey;
  on: boolean;
  theme: Theme;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={ROLE_DESCRIPTIONS[role]}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        fontSize: 12,
        fontWeight: 600,
        padding: '8px 12px',
        borderRadius: 8,
        cursor: disabled ? 'default' : 'pointer',
        minHeight: 38,
        border: `1px solid ${on ? theme.accent : '#2a4170'}`,
        background: on ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.18)',
        color: on ? '#eef3ff' : '#8ea3cc',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 4,
          border: `1.5px solid ${on ? theme.accent : '#3a5670'}`,
          background: on ? theme.accent : 'transparent',
          color: theme.accentText,
          fontSize: 10,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
        }}
      >
        {on ? '✓' : ''}
      </span>
      {ROLE_LABELS[role]}
    </button>
  );
}

// A native dropdown for picking a user's trading team (or none). Kept simple so
// it inherits the dark theme via inline styles like everything else here.
function TeamSelect({
  value,
  onChange,
  teams,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  teams: Team[];
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{ ...inputStyle, opacity: disabled ? 0.6 : 1, cursor: disabled ? 'default' : 'pointer' }}
    >
      <option value="">No team</option>
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

// Admin panel to create, rename, and delete trading teams. Team membership is
// assigned per user (the TeamSelect above); this manages the team list itself.
// Deleting a team unassigns its members server-side, so we refresh the user
// list afterward via onMembersChanged.
function TeamsManager({
  teams,
  setTeams,
  onMembersChanged,
  onError,
  theme,
  accentGrad,
}: {
  teams: Team[];
  setTeams: (t: Team[]) => void;
  onMembersChanged: () => Promise<void> | void;
  onError: (msg: string | null) => void;
  theme: Theme;
  accentGrad: string;
}) {
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function add() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    onError(null);
    try {
      const r = await api.adminCreateTeam(name);
      setTeams(r.teams);
      setNewName('');
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Could not create the team.');
    } finally {
      setBusy(false);
    }
  }

  async function rename(id: string) {
    const name = renameVal.trim();
    if (!name) return;
    setBusy(true);
    onError(null);
    try {
      const r = await api.adminRenameTeam(id, name);
      setTeams(r.teams);
      setRenamingId(null);
      setRenameVal('');
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Could not rename the team.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    onError(null);
    try {
      const r = await api.adminDeleteTeam(id);
      setTeams(r.teams);
      setConfirmDeleteId(null);
      await onMembersChanged();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Could not delete the team.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...panel(theme), marginBottom: 18 }}>
      <div style={panelLabel}>Trading teams</div>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: '#8ea3cc', lineHeight: 1.5 }}>
        Teams group traders into their own desk. The Studies leaderboard ranks a learner only
        against their team; the Trading workspace (Live Wall presets, Trade Desk, alerts, sessions,
        funded) stays shared across every team. Assign a user to a team below.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {teams.length === 0 && (
          <div style={{ fontSize: 12.5, color: '#8ea3cc' }}>No teams yet — add one below.</div>
        )}
        {teams.map((t) => (
          <div
            key={t.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              padding: '8px 10px',
              borderRadius: 8,
              border: `1px solid ${theme.navBorder}`,
              background: 'rgba(0,0,0,.18)',
            }}
          >
            {renamingId === t.id ? (
              <>
                <input
                  value={renameVal}
                  onChange={(e) => setRenameVal(e.target.value)}
                  autoFocus
                  style={{ ...inputStyle, flex: '1 1 180px', minHeight: 36 }}
                />
                <button onClick={() => rename(t.id)} disabled={busy} style={primaryBtn(theme, accentGrad)}>
                  Save
                </button>
                <button onClick={() => setRenamingId(null)} disabled={busy} style={ghostBtn}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: '#eef3ff', flex: '1 1 auto' }}>
                  {t.name}
                </span>
                <Badge color="#8ea3cc">
                  {t.memberCount} {t.memberCount === 1 ? 'member' : 'members'}
                </Badge>
                <button
                  onClick={() => {
                    setRenamingId(t.id);
                    setRenameVal(t.name);
                    setConfirmDeleteId(null);
                  }}
                  disabled={busy}
                  style={ghostBtn}
                >
                  Rename
                </button>
                {confirmDeleteId === t.id ? (
                  <>
                    <button onClick={() => remove(t.id)} disabled={busy} style={dangerSolidBtn}>
                      {busy ? 'Deleting…' : 'Confirm'}
                    </button>
                    <button onClick={() => setConfirmDeleteId(null)} disabled={busy} style={ghostBtn}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(t.id)}
                    disabled={busy}
                    style={ghostDangerBtn}
                    title="Delete this team; its members become unassigned"
                  >
                    Delete
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {confirmDeleteId && (
        <div style={{ ...msgStyle(false), marginTop: 10 }}>
          Deleting a team unassigns everyone on it (their data is untouched). This can't be undone.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="New team name"
          style={{ ...inputStyle, flex: '1 1 200px' }}
        />
        <button onClick={add} disabled={busy || !newName.trim()} style={primaryBtn(theme, accentGrad)}>
          Add team
        </button>
      </div>
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: '0.4px',
        color,
        border: `1px solid ${color}`,
        borderRadius: 4,
        padding: '2px 7px',
      }}
    >
      {children}
    </span>
  );
}

function panel(theme: Theme): CSSProperties {
  return {
    background: 'rgba(11,26,58,.5)',
    border: `1px solid ${theme.navBorder}`,
    borderRadius: 10,
    padding: '15px 16px',
  };
}

const panelLabel: CSSProperties = {
  fontSize: 10.5,
  letterSpacing: '0.6px',
  textTransform: 'uppercase',
  color: '#7488b5',
  marginBottom: 12,
  fontWeight: 600,
};

const fieldLabel: CSSProperties = {
  display: 'block',
  fontSize: 10.5,
  letterSpacing: '0.4px',
  textTransform: 'uppercase',
  color: '#8ea3cc',
  marginBottom: 6,
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 13,
  color: '#eef3ff',
  background: 'rgba(6,15,36,.6)',
  border: '1px solid #1d3560',
  borderRadius: 8,
  outline: 'none',
  minHeight: 40,
};

function primaryBtn(theme: Theme, grad: string): CSSProperties {
  return {
    border: 'none',
    background: grad,
    color: theme.accentText,
    fontWeight: 600,
    fontSize: 13,
    padding: '10px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 40,
  };
}

const ghostBtn: CSSProperties = {
  border: '1px solid #2a4170',
  background: 'rgba(0,0,0,.18)',
  color: '#cfe0ff',
  fontSize: 12.5,
  fontWeight: 600,
  padding: '9px 13px',
  borderRadius: 8,
  cursor: 'pointer',
  minHeight: 40,
};

const dangerBtn: CSSProperties = {
  border: '1px solid rgba(239,84,104,.4)',
  background: 'rgba(239,84,104,.1)',
  color: '#ff8a80',
  fontSize: 12.5,
  fontWeight: 600,
  padding: '9px 13px',
  borderRadius: 8,
  cursor: 'pointer',
  minHeight: 40,
};

// A more muted danger outline for the first "Delete" click, so it reads as
// distinct from the (also red) Deactivate button next to it.
const ghostDangerBtn: CSSProperties = {
  border: '1px solid rgba(239,84,104,.3)',
  background: 'rgba(0,0,0,.18)',
  color: '#e69a96',
  fontSize: 12.5,
  fontWeight: 600,
  padding: '9px 13px',
  borderRadius: 8,
  cursor: 'pointer',
  minHeight: 40,
};

// Solid red for the irreversible "Confirm delete" action.
const dangerSolidBtn: CSSProperties = {
  border: '1px solid #ef5468',
  background: 'linear-gradient(180deg,#ef5468,#c8324a)',
  color: '#fff',
  fontSize: 12.5,
  fontWeight: 700,
  padding: '9px 13px',
  borderRadius: 8,
  cursor: 'pointer',
  minHeight: 40,
};

function msgStyle(ok: boolean): CSSProperties {
  return {
    marginTop: 12,
    fontSize: 12.5,
    color: ok ? '#7fe0c0' : '#ff8a80',
    background: ok ? 'rgba(53,196,123,.1)' : 'rgba(239,84,104,.1)',
    border: `1px solid ${ok ? 'rgba(53,196,123,.4)' : 'rgba(239,84,104,.4)'}`,
    borderRadius: 7,
    padding: '9px 12px',
    lineHeight: 1.5,
  };
}
