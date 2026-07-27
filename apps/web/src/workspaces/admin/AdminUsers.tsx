import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useResponsive } from '../../hooks/useMediaQuery';
import { ALL_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, canGrantRole } from '../../auth/access';
import type { AdminUser, RoleKey, Team } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { Icon } from '../../components/Icon';
import { UserBadges, useBadgeRegistry } from '../../components/UserBadges';
import {
  Badge,
  SectionHeader,
  dangerBtn,
  dangerSolidBtn,
  fieldLabel,
  ghostBtn,
  ghostDangerBtn,
  inputStyle,
  msgStyle,
  panel,
  panelLabel,
  primaryBtn,
} from './adminUi';

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

function toggleKey(list: string[], k: string): string[] {
  return list.includes(k) ? list.filter((x) => x !== k) : [...list, k];
}

export function AdminUsers({ theme }: { theme: Theme }) {
  const { user: me } = useAuth();
  const { isPhone } = useResponsive();
  const accentGrad = accentGradient(theme);
  // Only show role options the acting user is allowed to grant (mirror of the
  // backend authority check). The owner sees all; a founder sees admin/funded/
  // member; a plain admin sees only member. A target's existing roles that the
  // actor can't grant are preserved on save (the edit toggle keeps them).
  const grantableRoles = ALL_ROLES.filter((r) =>
    me ? canGrantRole({ owner: me.access.owner, founder: me.access.founder }, r) : false,
  );
  const badgeRegistry = useBadgeRegistry();
  // Only non-auto badges are hand-assigned; auto badges (e.g. Admin) come from roles.
  const assignableBadges = badgeRegistry.filter((b) => !b.autoRole);

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
  const [roles, setRoles] = useState<RoleKey[]>(['member']);
  const [teamId, setTeamId] = useState<string>('');
  const [password, setPassword] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);

  // Inline reset-password state
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState('');

  // Inline display-name edit state: holds the id of the user being renamed.
  const [editNameFor, setEditNameFor] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');

  // Inline email edit state: holds the id of the user whose sign-in email is
  // being changed.
  const [editEmailFor, setEditEmailFor] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState('');

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
      setRoles(['member']);
      setPassword('');
      await refresh();
    } catch (e) {
      setCreateError(e instanceof ApiError ? e.message : 'Could not create user.');
    } finally {
      setCreateBusy(false);
    }
  }

  // Returns true when the update succeeded, so inline editors can stay open on
  // failure (e.g. a duplicate/invalid email) instead of discarding the draft.
  async function patch(id: string, body: Parameters<typeof api.adminUpdateUser>[1]): Promise<boolean> {
    setBusyId(id);
    setActionError(null);
    try {
      await api.adminUpdateUser(id, body);
      await refresh();
      return true;
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Action failed.');
      return false;
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

  // Save an edited display name for a user, then close the inline editor.
  async function saveName(id: string) {
    const name = nameDraft.trim();
    if (!name) return;
    await patch(id, { displayName: name });
    setEditNameFor(null);
    setNameDraft('');
  }

  // Save an edited sign-in email for a user. The server does the authoritative
  // validation (format + uniqueness); this is a light guard so an obviously bad
  // address never hits the API. On success the inline editor closes; on failure
  // it stays open with the action error shown so the admin can correct it.
  async function saveEmail(id: string) {
    const email = emailDraft.trim();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setActionError('Enter a valid email address.');
      return;
    }
    const ok = await patch(id, { email });
    if (ok) {
      setEditEmailFor(null);
      setEmailDraft('');
    }
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

  if (loading) return <div style={{ color: '#8ea3cc', padding: 20, fontSize: 13 }}>{"Loading users..."}</div>;
  if (loadError) return <div style={{ color: '#ef5468', padding: 20, fontSize: 13 }}>{loadError}</div>;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', color: '#dfe7fa' }}>
      <SectionHeader
        title="Users"
        subtitle="Create accounts and assign roles. A user can hold several roles; only admins can change them. New users set their own password on first sign-in."
      />

      {/* Create a user */}
      <div style={{ ...panel(theme), marginBottom: 18 }}>
        <div style={panelLabel}>{"Add a user"}</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr',
            gap: 10,
          }}
        >
          <div>
            <label style={fieldLabel}>{"Display name"}</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Jane Smith" style={inputStyle} />
          </div>
          <div>
            <label style={fieldLabel}>{"Email"}</label>
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
            <label style={fieldLabel}>{"Username"}</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="jsmith" autoCapitalize="none" autoCorrect="off" style={inputStyle} />
          </div>
          <div>
            <label style={fieldLabel}>{"Temporary password"}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" style={{ ...inputStyle, flex: 1 }} />
              <button type="button" onClick={() => setPassword(genPassword())} style={ghostBtn} title="Generate a password">
                {"Generate"}
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={fieldLabel}>{"Roles"}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
            {grantableRoles.map((r) => (
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
          <label style={fieldLabel}>{"Trading team"}</label>
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
            {createBusy ? 'Creating...' : "Create user"}
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
                  {editNameFor === u.id ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        autoFocus
                        maxLength={120}
                        onKeyDown={(e) => e.key === 'Enter' && nameDraft.trim() && saveName(u.id)}
                        style={{ ...inputStyle, maxWidth: 220 }}
                      />
                      <button
                        onClick={() => saveName(u.id)}
                        disabled={busyId === u.id || !nameDraft.trim()}
                        style={primaryBtn(theme, accentGrad)}
                      >
                        Save
                      </button>
                      <button onClick={() => setEditNameFor(null)} disabled={busyId === u.id} style={ghostBtn}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#eef3ff', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>{u.displayName}</span>
                      <UserBadges roles={u.roles} badges={u.badges} size={14} />
                      {isSelf && <span style={{ color: theme.accent, fontWeight: 600 }}>· you</span>}
                      <button
                        onClick={() => {
                          setEditNameFor(u.id);
                          setNameDraft(u.displayName);
                        }}
                        disabled={busyId === u.id}
                        title="Edit display name"
                        style={{ ...ghostBtn, minHeight: 0, padding: '3px 8px' }}
                      >
                        <Icon name="pencil" size={12} />
                      </button>
                    </div>
                  )}
                  {editEmailFor === u.id ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                      <input
                        type="email"
                        value={emailDraft}
                        onChange={(e) => setEmailDraft(e.target.value)}
                        autoFocus
                        autoCapitalize="none"
                        autoCorrect="off"
                        maxLength={255}
                        placeholder="name@vitalistradingsystems.com"
                        onKeyDown={(e) => e.key === 'Enter' && emailDraft.trim() && saveEmail(u.id)}
                        style={{ ...inputStyle, maxWidth: 300, fontFamily: "'IBM Plex Mono', monospace" }}
                      />
                      <button
                        onClick={() => saveEmail(u.id)}
                        disabled={busyId === u.id || !emailDraft.trim()}
                        style={primaryBtn(theme, accentGrad)}
                      >
                        Save
                      </button>
                      <button onClick={() => setEditEmailFor(null)} disabled={busyId === u.id} style={ghostBtn}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    u.email && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <span style={{ fontSize: 11.5, color: '#6f84b2', fontFamily: "'IBM Plex Mono', monospace", wordBreak: 'break-all' }}>
                          {u.email}
                        </span>
                        <button
                          onClick={() => {
                            setEditEmailFor(u.id);
                            setEmailDraft(u.email ?? '');
                          }}
                          disabled={busyId === u.id}
                          title="Edit email"
                          style={{ ...ghostBtn, minHeight: 0, padding: '3px 8px' }}
                        >
                          <Icon name="pencil" size={11} />
                        </button>
                      </div>
                    )
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
                  Permanently delete <strong>{u.displayName}</strong> and all of
                  their data? This cannot be undone — use Deactivate instead to suspend access
                  without erasing anything.
                </div>
              )}

              {/* Role assignment */}
              <div style={{ marginTop: 12 }}>
                <div style={{ ...fieldLabel, marginBottom: 8 }}>Roles</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {grantableRoles.map((r) => {
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

              {/* Badge assignment (auto badges like Admin are granted by role) */}
              {assignableBadges.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ ...fieldLabel, marginBottom: 8 }}>Badges</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {assignableBadges.map((b) => {
                      const on = u.badges.includes(b.key);
                      return (
                        <button
                          key={b.key}
                          onClick={() => patch(u.id, { badges: toggleKey(u.badges, b.key) })}
                          disabled={busyId === u.id}
                          title={b.description || b.label}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            padding: '6px 11px',
                            borderRadius: 999,
                            cursor: busyId === u.id ? 'default' : 'pointer',
                            color: on ? '#0a1226' : '#aebcd8',
                            background: on ? b.color : 'transparent',
                            border: `1px solid ${on ? b.color : theme.navBorder}`,
                          }}
                        >
                          <Icon name={b.icon} size={13} color={on ? '#0a1226' : b.color} />
                          {b.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

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

// A native dropdown for picking a user's trading team (or none).
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
  const selectStyle: CSSProperties = {
    ...inputStyle,
    opacity: disabled ? 0.6 : 1,
    cursor: disabled ? 'default' : 'pointer',
  };
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} style={selectStyle}>
      <option value="">No team</option>
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
