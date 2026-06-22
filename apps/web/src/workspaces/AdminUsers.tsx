import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useResponsive } from '../hooks/useMediaQuery';
import type { AdminUser, Role } from '../api/types';
import type { Theme } from '../theme/themes';
import { accentGradient } from '../theme/themes';

const ROLES: Role[] = ['Admin', 'Trader', 'Sales', 'Viewer'];

// Generate a readable temporary password the admin can hand to the new user.
function genPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  const rnd = new Uint32Array(12);
  crypto.getRandomValues(rnd);
  for (let i = 0; i < 12; i++) out += chars[rnd[i] % chars.length];
  return out;
}

export function AdminUsers({ theme }: { theme: Theme }) {
  const { user: me } = useAuth();
  const { isPhone } = useResponsive();
  const accentGrad = accentGradient(theme);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Create form
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<Role>('Sales');
  const [password, setPassword] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);

  // Inline reset-password state
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .adminListUsers()
      .then((r) => alive && setUsers(r.users))
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
    if (!displayName.trim() || !username.trim()) {
      setCreateError('Name and username are required.');
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
        role,
        password,
      });
      setCreated({ username: username.trim().toLowerCase(), password });
      setDisplayName('');
      setUsername('');
      setRole('Sales');
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

  if (loading) return <div style={{ color: '#8ea3cc', padding: 20, fontSize: 13 }}>Loading users...</div>;
  if (loadError) return <div style={{ color: '#ef5468', padding: 20, fontSize: 13 }}>{loadError}</div>;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', color: '#dfe7fa' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#eef3ff' }}>Users</h2>
        <p style={{ margin: '5px 0 0', fontSize: 12.5, color: '#8ea3cc' }}>
          Create and manage accounts. New users start with an empty To Do list and Kia tracker,
          and set their own password on first sign-in.
        </p>
      </div>

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
            <label style={fieldLabel}>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="jsmith" autoCapitalize="none" autoCorrect="off" style={inputStyle} />
          </div>
          <div>
            <label style={fieldLabel}>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} style={inputStyle}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
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
                  alignItems: isPhone ? 'stretch' : 'center',
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
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
                    {!u.active && <Badge color="#ef5468">Inactive</Badge>}
                    {u.mustChangePassword && <Badge color="#e0a23a">Must set password</Badge>}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    value={u.role}
                    disabled={busyId === u.id || (isSelf && u.role === 'Admin')}
                    onChange={(e) => patch(u.id, { role: e.target.value as Role })}
                    title={isSelf ? "You can't change your own role" : 'Change role'}
                    style={{ ...inputStyle, width: 'auto', padding: '8px 10px', minHeight: 40 }}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>

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

                  {!isSelf && (
                    <button
                      onClick={() => patch(u.id, { active: !u.active })}
                      disabled={busyId === u.id}
                      style={u.active ? dangerBtn : ghostBtn}
                    >
                      {u.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  )}
                </div>
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
