import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { Team } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import {
  Badge,
  SectionHeader,
  dangerSolidBtn,
  ghostBtn,
  ghostDangerBtn,
  inputStyle,
  msgStyle,
  panel,
  primaryBtn,
} from './adminUi';

// Admin panel to create, rename, and delete trading teams. Team membership is
// assigned per user (in the Users section). Deleting a team unassigns its
// members server-side.
export function AdminTeams({ theme }: { theme: Theme }) {
  const accentGrad = accentGradient(theme);

  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .adminListTeams()
      .then((r) => alive && setTeams(r.teams))
      .catch((e) => alive && setLoadError(e instanceof ApiError ? e.message : 'Failed to load teams'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  async function add() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.adminCreateTeam(name);
      setTeams(r.teams);
      setNewName('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the team.');
    } finally {
      setBusy(false);
    }
  }

  async function rename(id: string) {
    const name = renameVal.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.adminRenameTeam(id, name);
      setTeams(r.teams);
      setRenamingId(null);
      setRenameVal('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not rename the team.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await api.adminDeleteTeam(id);
      setTeams(r.teams);
      setConfirmDeleteId(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete the team.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div style={{ color: '#8ea3cc', padding: 20, fontSize: 13 }}>Loading teams...</div>;
  if (loadError) return <div style={{ color: '#ef5468', padding: 20, fontSize: 13 }}>{loadError}</div>;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', color: '#dfe7fa' }}>
      <SectionHeader
        title="Teams"
        subtitle="Teams group traders into their own desk. The Studies leaderboard ranks a learner only against their team; the Trading workspace stays shared across every team. Assign members in the Users section."
      />

      <div style={panel(theme)}>
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

        {error && (
          <div onClick={() => setError(null)} style={{ ...msgStyle(false), cursor: 'pointer' }}>
            {error} (click to dismiss)
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
    </div>
  );
}
