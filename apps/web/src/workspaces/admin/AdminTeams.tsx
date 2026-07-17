import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { Team } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { rolesSummary } from '../../auth/access';
import {
  Badge,
  SectionHeader,
  dangerSolidBtn,
  fieldLabel,
  ghostBtn,
  ghostDangerBtn,
  inputStyle,
  msgStyle,
  panel,
  primaryBtn,
} from './adminUi';

// Admin panel to create, rename, and delete trading teams, and to see and adjust
// who is on each team. Membership can also be set per user in the Users section;
// changes here go through the same user endpoint. Deleting a team unassigns its
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
  // Which team's roster is expanded, and which member is being moved.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [movingUserId, setMovingUserId] = useState<string | null>(null);

  // The default first team-chat (welcome) message new teams start with.
  const [welcome, setWelcome] = useState('');
  const [welcomeDraft, setWelcomeDraft] = useState('');
  const [welcomeOverridden, setWelcomeOverridden] = useState(false);
  const [welcomeBusy, setWelcomeBusy] = useState(false);
  const [welcomeMsg, setWelcomeMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function reload() {
    const r = await api.adminListTeams();
    setTeams(r.teams);
  }

  useEffect(() => {
    let alive = true;
    api
      .adminListTeams()
      .then((r) => alive && setTeams(r.teams))
      .catch((e) => alive && setLoadError(e instanceof ApiError ? e.message : 'Failed to load teams'))
      .finally(() => alive && setLoading(false));
    api
      .adminTeamChatWelcome()
      .then((r) => {
        if (!alive) return;
        setWelcome(r.value);
        setWelcomeDraft(r.value);
        setWelcomeOverridden(r.overridden);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function saveWelcome() {
    if (welcomeBusy) return;
    setWelcomeBusy(true);
    setWelcomeMsg(null);
    try {
      const r = await api.adminSaveTeamChatWelcome(welcomeDraft);
      setWelcome(r.value);
      setWelcomeDraft(r.value);
      setWelcomeOverridden(r.overridden);
      setWelcomeMsg({
        ok: true,
        text: r.overridden ? 'Saved. New teams will start with this message.' : 'Matches the default — override cleared.',
      });
    } catch (e) {
      setWelcomeMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not save' });
    } finally {
      setWelcomeBusy(false);
    }
  }

  async function resetWelcome() {
    if (welcomeBusy) return;
    setWelcomeBusy(true);
    setWelcomeMsg(null);
    try {
      const r = await api.adminResetTeamChatWelcome();
      setWelcome(r.value);
      setWelcomeDraft(r.value);
      setWelcomeOverridden(r.overridden);
      setWelcomeMsg({ ok: true, text: 'Reset to the built-in default.' });
    } catch (e) {
      setWelcomeMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not reset' });
    } finally {
      setWelcomeBusy(false);
    }
  }

  // Move a member to another team (or clear their team). Goes through the same
  // user-update endpoint the Users section uses, then reloads the rosters.
  async function moveMember(userId: string, teamId: string | null) {
    setMovingUserId(userId);
    setError(null);
    try {
      await api.adminUpdateUser(userId, { teamId });
      await reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not move the member.');
    } finally {
      setMovingUserId(null);
    }
  }

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
        subtitle="Teams group traders into their own desk. The Studies leaderboard ranks a learner only against their team; the Trading workspace stays shared across every team. Expand a team to see its members and move anyone between teams."
      />

      {/* Default first team-chat message: seeded as the first message when a new
          team is created, so its channel greets the desk instead of sitting empty. */}
      <div style={{ ...panel(theme), marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#eef3ff' }}>Default first team chat</span>
          {welcomeOverridden ? <Badge color={theme.accent}>Customized</Badge> : <Badge color="#7488b5">Default</Badge>}
        </div>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: '#9fb0d6', lineHeight: 1.5 }}>
          The welcome message seeded as the first message in a team’s chat when it’s created. Existing
          teams keep the messages they already have.
        </p>
        <label style={fieldLabel}>Welcome message</label>
        <textarea
          value={welcomeDraft}
          onChange={(e) => setWelcomeDraft(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Welcome to the team chat…"
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
        />
        {welcomeMsg && <div style={msgStyle(welcomeMsg.ok)}>{welcomeMsg.text}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button
            onClick={saveWelcome}
            disabled={welcomeBusy || welcomeDraft === welcome}
            style={{ ...primaryBtn(theme, accentGrad), opacity: welcomeBusy || welcomeDraft === welcome ? 0.55 : 1 }}
          >
            {welcomeBusy ? 'Saving…' : 'Save'}
          </button>
          {welcomeDraft !== welcome && (
            <button onClick={() => setWelcomeDraft(welcome)} disabled={welcomeBusy} style={ghostBtn}>
              Undo changes
            </button>
          )}
          {welcomeOverridden && (
            <button onClick={resetWelcome} disabled={welcomeBusy} style={ghostBtn}>
              Reset to default
            </button>
          )}
        </div>
      </div>

      <div style={panel(theme)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {teams.length === 0 && (
            <div style={{ fontSize: 12.5, color: '#8ea3cc' }}>No teams yet — add one below.</div>
          )}
          {teams.map((t) => {
            const expanded = expandedId === t.id;
            return (
              <div
                key={t.id}
                style={{
                  borderRadius: 8,
                  border: `1px solid ${theme.navBorder}`,
                  background: 'rgba(0,0,0,.18)',
                  overflow: 'hidden',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 10px' }}>
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
                      <button
                        onClick={() => setExpandedId(expanded ? null : t.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#eef3ff', display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 auto', textAlign: 'left', padding: 0 }}
                      >
                        <span style={{ fontSize: 11, color: '#7488b5', width: 10 }}>{expanded ? '▾' : '▸'}</span>
                        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{t.name}</span>
                      </button>
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

                {expanded && (
                  <div style={{ borderTop: `1px solid ${theme.navBorder}`, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {t.members.length === 0 ? (
                      <div style={{ fontSize: 12, color: '#8ea3cc', padding: '4px 2px' }}>No members on this team yet.</div>
                    ) : (
                      t.members.map((m) => (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '5px 4px' }}>
                          <div style={{ flex: '1 1 auto', minWidth: 140 }}>
                            <div style={{ fontSize: 12.5, color: '#eef3ff', fontWeight: 600 }}>
                              {m.displayName}
                              {!m.active && <span style={{ marginLeft: 6, fontSize: 10, color: '#ff8a80' }}>· inactive</span>}
                            </div>
                            <div style={{ fontSize: 10.5, color: '#8ea3cc' }}>@{m.username} · {rolesSummary(m.roles)}</div>
                          </div>
                          <select
                            value={t.id}
                            disabled={movingUserId === m.id}
                            onChange={(e) => moveMember(m.id, e.target.value || null)}
                            style={{ ...inputStyle, width: 'auto', minHeight: 34, flex: '0 0 auto', maxWidth: 200 }}
                          >
                            {teams.map((opt) => (
                              <option key={opt.id} value={opt.id}>{opt.name}</option>
                            ))}
                            <option value="">— No team —</option>
                          </select>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
