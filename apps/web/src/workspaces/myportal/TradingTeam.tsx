import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import type { MyPortalData, MyTeam, TeamMemberPermissions, UserTeamMember, User } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { useAuth } from '../../auth/AuthContext';
import { useResponsive } from '../../hooks/useMediaQuery';
import { Icon } from '../../components/Icon';
import {
  SectionHeader,
  dangerSolidBtn,
  fieldLabel,
  ghostBtn,
  ghostDangerBtn,
  inputStyle,
  msgStyle,
  panel,
  panelLabel,
  primaryBtn,
} from '../admin/adminUi';

// The leader-granted permissions, in display order.
const PERMS: { key: keyof TeamMemberPermissions; label: string; help: string }[] = [
  { key: 'canCreateStudyGuides', label: 'Create study guides', help: 'Build study guides in the Studies workspace' },
  { key: 'canInvite', label: 'Invite members', help: 'Send invitations (up to the team cap)' },
  { key: 'canManageBadges', label: 'Manage badges', help: 'Assign cosmetic titles to teammates' },
  { key: 'canRemoveMembers', label: 'Remove members', help: 'Remove teammates from the team' },
  { key: 'canEditTeam', label: 'Edit team info', help: 'Rename the team' },
  { key: 'canDeleteTrades', label: 'Delete trades', help: "Remove and restore any teammate's trade on the desk" },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

// My Terminal ▸ Trading Team. A user creates and leads at most one small (≤5)
// Trading Team, invites teammates by username, hands off leadership, assigns
// cosmetic badges, and sets each member's permissions. The server is the
// enforcer; this screen mirrors those rules for the UI.
export function TradingTeam({ theme, user }: { theme: Theme; user: User }) {
  const grad = accentGradient(theme);
  const accent = theme.accent;

  const [data, setData] = useState<MyPortalData | null>(null);
  const [maxMembers, setMaxMembers] = useState(5);
  const [presets, setPresets] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [teamName, setTeamName] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [badgeDraft, setBadgeDraft] = useState<Record<string, string>>({});
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.myPortal(), api.myPortalConfig()])
      .then(([d, cfg]) => {
        if (!alive) return;
        setData(d);
        setMaxMembers(cfg.maxMembers);
        setPresets(cfg.badgePresets);
      })
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : 'Failed to load your team'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const team = data?.team ?? null;
  const incoming = data?.incomingInvites ?? [];
  const perms = team?.myPermissions;

  const setTeam = (t: MyTeam) => setData((d) => ({ team: t, incomingInvites: d?.incomingInvites ?? [] }));

  async function run(fn: () => Promise<void>, okText?: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (okText) setNotice(okText);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const create = () =>
    run(async () => {
      const r = await api.createMyTeam(teamName);
      setTeam(r.team);
      setTeamName('');
    });
  const invite = () =>
    run(async () => {
      const r = await api.inviteToMyTeam(inviteName);
      setTeam(r.team);
      setInviteName('');
    }, 'Invitation sent.');
  const respond = (id: string, accept: boolean) =>
    run(async () => {
      const r = await api.respondMyTeamInvite(id, accept);
      setData(r);
    });
  const cancelInvite = (id: string) =>
    run(async () => {
      const r = await api.cancelMyTeamInvite(id);
      setTeam(r.team);
    });
  const leave = () =>
    run(async () => {
      await api.leaveMyTeam();
      const r = await api.myPortal();
      setData(r);
      setConfirmLeave(false);
    });
  const removeMember = (userId: string) =>
    run(async () => {
      const r = await api.removeMyTeamMember(userId);
      setTeam(r.team);
      setConfirmRemove(null);
    });
  const transfer = (userId: string) =>
    run(async () => {
      const r = await api.transferMyTeamLeadership(userId);
      setTeam(r.team);
    });
  const saveBadge = (userId: string, badge: string | null) =>
    run(async () => {
      const r = await api.setMyTeamMemberBadge(userId, badge);
      setTeam(r.team);
    });
  const togglePerm = (userId: string, key: keyof TeamMemberPermissions, value: boolean) =>
    run(async () => {
      const r = await api.setMyTeamMemberPermissions(userId, { [key]: value });
      setTeam(r.team);
    });
  const rename = () =>
    run(async () => {
      const r = await api.renameMyTeam(renameValue);
      setTeam(r.team);
      setRenaming(false);
    });

  const full = useMemo(() => (team ? team.members.length >= maxMembers : false), [team, maxMembers]);

  if (loading) {
    return <div style={{ padding: 24, color: '#8ea3cc', fontSize: 13 }}>Loading your team…</div>;
  }

  const wrap: React.CSSProperties = { maxWidth: 860, margin: '0 auto', padding: '20px 22px 60px' };

  // ---- No team yet: create form + any pending invitations ----
  if (!team) {
    return (
      <div style={wrap}>
        <SectionHeader
          title="Trading Team"
          subtitle="Create your own trading team, invite up to five teammates, and lead it."
        />

        {incoming.length > 0 && (
          <div style={{ ...panel(theme), marginBottom: 16 }}>
            <div style={panelLabel}>
              {"Invitations"}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {incoming.map((inv) => (
                <div
                  key={inv.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                    padding: '10px 12px',
                    background: 'rgba(6,15,36,.5)',
                    border: '1px solid #1d3560',
                    borderRadius: 8,
                  }}
                >
                  <div style={{ fontSize: 13, color: '#eef3ff' }}>
                    <strong>{inv.teamName}</strong>
                    {inv.invitedByName ? <span style={{ color: '#8ea3cc' }}> · invited by {inv.invitedByName}</span> : null}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={primaryBtn(theme, grad)} disabled={busy} onClick={() => respond(inv.id, true)}>
                      {"Accept"}
                    </button>
                    <button style={ghostBtn} disabled={busy} onClick={() => respond(inv.id, false)}>
                      {"Decline"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={panel(theme)}>
          <div style={panelLabel}>
            {"Create a team"}
          </div>
          <label style={fieldLabel}>
            {"Team name"}
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              style={{ ...inputStyle, maxWidth: 340 }}
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g. Alpha Desk"
              maxLength={80}
              onKeyDown={(e) => e.key === 'Enter' && teamName.trim() && create()}
            />
            <button style={primaryBtn(theme, grad)} disabled={busy || !teamName.trim()} onClick={create}>
              {"Create team"}
            </button>
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 12, color: '#8ea3cc', lineHeight: 1.5 }}>
            {"You become the team leader. You can invite up to four others, assign badges, and set each member’s permissions."}
          </p>
          {error && <div style={msgStyle(false)}>{error}</div>}
          {notice && <div style={msgStyle(true)}>{notice}</div>}
        </div>
      </div>
    );
  }

  // ---- Has a team: dashboard ----
  const isLeader = team.isLeader;
  const canInvite = !!perms?.canInvite;
  const canManageBadges = !!perms?.canManageBadges;
  const canRemove = !!perms?.canRemoveMembers;
  const canEditTeam = !!perms?.canEditTeam;

  return (
    <div style={wrap}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          {renaming ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                style={{ ...inputStyle, maxWidth: 280 }}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                maxLength={80}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && renameValue.trim() && rename()}
              />
              <button style={primaryBtn(theme, grad)} disabled={busy || !renameValue.trim()} onClick={rename}>
                Save
              </button>
              <button style={ghostBtn} disabled={busy} onClick={() => setRenaming(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <h2 style={{ margin: 0, fontSize: 21, fontWeight: 700, color: '#eef3ff', display: 'flex', alignItems: 'center', gap: 10 }}>
              {team.name}
              {canEditTeam && (
                <button
                  title="Rename team"
                  style={{ ...ghostBtn, minHeight: 0, padding: '4px 8px' }}
                  onClick={() => {
                    setRenameValue(team.name);
                    setRenaming(true);
                  }}
                >
                  <Icon name="pencil" size={13} />
                </button>
              )}
            </h2>
          )}
          <p style={{ margin: '5px 0 0', fontSize: 12.5, color: '#8ea3cc' }}>
            {team.members.length}/{maxMembers} members · {isLeader ? 'You lead this team' : 'You are a member'}
          </p>
        </div>
        <button style={ghostDangerBtn} disabled={busy} onClick={() => setConfirmLeave(true)}>
          {"Leave team"}
        </button>
      </div>

      {confirmLeave && (
        <div style={{ ...panel(theme), marginBottom: 16, borderColor: 'rgba(239,84,104,.4)' }}>
          <p style={{ margin: '0 0 10px', fontSize: 13, color: '#ffd7d2' }}>
            {isLeader && team.members.length > 1 ? (
              "You lead this team. Hand leadership to another member before you can leave."
            ) : isLeader ? (
              "You are the only member — leaving will disband the team."
            ) : (
              "Leave this team? You can be re-invited later."
            )}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            {!(isLeader && team.members.length > 1) && (
              <button style={dangerSolidBtn} disabled={busy} onClick={leave}>
                {"Yes, leave"}
              </button>
            )}
            <button style={ghostBtn} disabled={busy} onClick={() => setConfirmLeave(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <BookVisibility theme={theme} grad={grad} />

      {/* Roster */}
      <div style={{ ...panel(theme), marginBottom: 16 }}>
        <div style={panelLabel}>
          {"Members"}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {team.members.map((m) => (
            <MemberRow
              key={m.userId}
              m={m}
              accent={accent}
              isMe={m.userId === user.id}
              viewerIsLeader={isLeader}
              canManageBadges={canManageBadges}
              canRemove={canRemove}
              presets={presets}
              busy={busy}
              draft={badgeDraft[m.userId] ?? ''}
              onDraft={(v) => setBadgeDraft((d) => ({ ...d, [m.userId]: v }))}
              onSaveBadge={(b) => saveBadge(m.userId, b)}
              onTogglePerm={(k, v) => togglePerm(m.userId, k, v)}
              onTransfer={() => transfer(m.userId)}
              confirmRemove={confirmRemove === m.userId}
              onAskRemove={() => setConfirmRemove(m.userId)}
              onCancelRemove={() => setConfirmRemove(null)}
              onRemove={() => removeMember(m.userId)}
              theme={theme}
              grad={grad}
            />
          ))}
        </div>
      </div>

      {/* Invite */}
      {canInvite && (
        <div style={{ ...panel(theme), marginBottom: 16 }}>
          <div style={panelLabel}>
            {"Invite a teammate"}
          </div>
          {full ? (
            <p style={{ margin: 0, fontSize: 12.5, color: '#8ea3cc' }}>
              {"Your team is full. Remove a member to invite someone new."}
            </p>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                style={{ ...inputStyle, maxWidth: 300 }}
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Username"
                maxLength={64}
                onKeyDown={(e) => e.key === 'Enter' && inviteName.trim() && invite()}
              />
              <button style={primaryBtn(theme, grad)} disabled={busy || !inviteName.trim()} onClick={invite}>
                {"Send invite"}
              </button>
            </div>
          )}

          {team.invites.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ ...fieldLabel, marginBottom: 8 }}>
                {"Pending invites"}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {team.invites.map((inv) => (
                  <div
                    key={inv.id}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12.5, color: '#cfe0ff' }}
                  >
                    <span>{inv.displayName}</span>
                    <button style={{ ...ghostBtn, minHeight: 0, padding: '5px 10px' }} disabled={busy} onClick={() => cancelInvite(inv.id)}>
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {error && <div style={msgStyle(false)}>{error}</div>}
      {notice && <div style={msgStyle(true)}>{notice}</div>}
    </div>
  );
}

// Private mode — whether this trader's open book is on their teammates' screens.
//
// The switch is stored with the feature opt-ins (user_features.share_book) but
// belongs here, where the team is: it is a question about these people, not
// about which parts of the terminal you have turned on.
//
// New members start private, so the consent is a real decision rather than a
// notice to scroll past. The server does the filtering (trading/scope.ts —
// visibleTraderIds); this is the control over it, not the mechanism.
function BookVisibility({ theme, grad }: { theme: Theme; grad: string }) {
  const { user, refreshUser } = useAuth();
  const sharing = !!user?.access.features.shareBook;
  const acknowledged = !!user?.access.features.bookAckAt;
  const isDemo = !!user?.isDemo;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function save(patch: Parameters<typeof api.saveFeatures>[0]) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.saveFeatures(patch);
      // Re-read the user so this screen and every gate see the change now
      // rather than on the next reload.
      await refreshUser();
      setConfirming(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save that change');
    } finally {
      setBusy(false);
    }
  }

  function toggle() {
    if (sharing) {
      void save({ shareBook: false });
      return;
    }
    // First time sharing: say what a teammate would see before it happens. The
    // stamp is kept server-side, so somebody coming back is not asked twice.
    if (!acknowledged) {
      setConfirming(true);
      return;
    }
    void save({ shareBook: true });
  }

  return (
    <div
      style={{
        ...panel(theme),
        marginBottom: 16,
        borderLeft: `2px solid ${sharing ? '#5AC8FA' : '#EBCB74'}`,
      }}
    >
      <div style={panelLabel}>{"Your trading book"}</div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ flex: 'none', marginTop: 1 }}>
          <Icon name={sharing ? 'eye' : 'eye-off'} size={17} color={sharing ? '#5AC8FA' : '#EBCB74'} />
        </span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#eef3ff' }}>
            {sharing ? 'Visible to your team' : 'Private'}
          </div>
          <p style={{ margin: '5px 0 0', fontSize: 12.5, color: '#8ea3cc', lineHeight: 1.6 }}>
            {sharing
              ? 'Your open and closed trades appear on your teammates’ Live Wall, Trade Log and History, tagged with your name.'
              : 'Your trades are yours alone. Nobody on your team — the leader included — sees them on the Live Wall, Trade Log or History. You still see everything of theirs that they share, and you still get every team alert.'}
          </p>
        </div>
        <button
          style={sharing ? ghostBtn : primaryBtn(theme, grad)}
          disabled={busy || isDemo}
          onClick={toggle}
        >
          {busy ? 'Saving…' : sharing ? 'Go private' : 'Share with my team'}
        </button>
      </div>

      {isDemo && (
        <p style={{ margin: '10px 0 0', fontSize: 12, color: '#8ea3cc' }}>
          {"This is the read-only demo account, so this can’t be changed."}
        </p>
      )}
      {error && <div style={msgStyle(false)}>{error}</div>}

      {confirming && (
        <BookSharingAcknowledgement
          theme={theme}
          grad={grad}
          busy={busy}
          onCancel={() => setConfirming(false)}
          onAccept={() => void save({ shareBook: true, acknowledgeBook: true })}
        />
      )}
    </div>
  );
}

// The consent step. Named in full rather than softened to "your trades", because
// the point is that somebody can only agree to what they have actually been
// told. Mirrors the acknowledgement shown before Advanced Trading is switched on.
function BookSharingAcknowledgement({
  theme,
  grad,
  busy,
  onCancel,
  onAccept,
}: {
  theme: Theme;
  grad: string;
  busy: boolean;
  onCancel: () => void;
  onAccept: () => void;
}) {
  return (
    <div style={modalWrap} onClick={onCancel}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0, fontSize: 16.5, fontWeight: 700, color: '#eef3ff' }}>
          {"Before you share your book"}
        </h3>
        <p style={{ margin: '12px 0 0', fontSize: 13, color: '#cfe0ff', lineHeight: 1.6 }}>
          {"Every member of your team will be able to see, for each of your trades:"}
        </p>
        <ul style={{ margin: '10px 0 0', padding: '0 0 0 18px', color: '#8ea3cc', fontSize: 13, lineHeight: 1.7 }}>
          <li>The instrument, and whether you are long or short</li>
          <li>Your exact entry price and position size</li>
          <li>Your stop loss and take profit</li>
          <li>Your live profit and loss, updating as the market moves</li>
          <li>When you opened the position, and when you closed it</li>
        </ul>
        <ul style={{ margin: '12px 0 0', padding: '0 0 0 18px', color: '#8ea3cc', fontSize: 13, lineHeight: 1.7 }}>
          <li>
            This is your <b style={{ color: '#eef3ff' }}>teammates only</b> — the
            people on your trading team. Nothing here is ever public, and no other
            team on the terminal can see it.
          </li>
          <li>
            You can go private again at any time, and nothing is lost — your
            trades, history and settings all stay exactly as they are. They simply
            stop appearing on other people's screens.
          </li>
          <li>
            If your account is with a prop firm, check your agreement first. Most
            of them prohibit sharing account information with anyone else.
          </li>
        </ul>
        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <button onClick={onAccept} disabled={busy} style={{ ...primaryBtn(theme, grad), opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Saving…' : 'I understand — share my book'}
          </button>
          <button onClick={onCancel} style={ghostBtn}>{"Cancel"}</button>
        </div>
      </div>
    </div>
  );
}

const modalWrap: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(3,8,20,.72)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  zIndex: 120,
};
const modalCard: CSSProperties = {
  width: 'min(560px, 100%)',
  maxHeight: 'calc(86 * var(--vh))',
  overflowY: 'auto',
  background: '#0C1C3C',
  border: '1px solid #1d3560',
  borderRadius: 12,
  padding: '20px 22px 22px',
  boxShadow: '0 24px 60px rgba(0,0,0,.55)',
};

// One member row: avatar, name, badge, and (for the leader / permitted members)
// the badge editor, permission toggles, transfer, and remove controls.
function MemberRow({
  m,
  accent,
  isMe,
  viewerIsLeader,
  canManageBadges,
  canRemove,
  presets,
  busy,
  draft,
  onDraft,
  onSaveBadge,
  onTogglePerm,
  onTransfer,
  confirmRemove,
  onAskRemove,
  onCancelRemove,
  onRemove,
  theme,
  grad,
}: {
  m: UserTeamMember;
  accent: string;
  isMe: boolean;
  viewerIsLeader: boolean;
  canManageBadges: boolean;
  canRemove: boolean;
  presets: string[];
  busy: boolean;
  draft: string;
  onDraft: (v: string) => void;
  onSaveBadge: (b: string | null) => void;
  onTogglePerm: (k: keyof TeamMemberPermissions, v: boolean) => void;
  onTransfer: () => void;
  confirmRemove: boolean;
  onAskRemove: () => void;
  onCancelRemove: () => void;
  onRemove: () => void;
  theme: Theme;
  grad: string;
}) {
  const { isPhone } = useResponsive();
  const [editingBadge, setEditingBadge] = useState(false);
  const canEditBadge = canManageBadges && !m.isLeader;
  const showPerms = viewerIsLeader && !m.isLeader;
  const showTransfer = viewerIsLeader && !m.isLeader;
  const showRemove = canRemove && !m.isLeader && !isMe;
  const hasActions = canEditBadge || showTransfer || showRemove;

  // The member's action buttons. Rendered inline (right of the name) on wider
  // screens, or on their own row below the name on a phone so they never crowd
  // the name — the mobile fix that keeps this roster from looking cramped.
  const actionButtons = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {canEditBadge && (
        <button style={{ ...ghostBtn, minHeight: 0, padding: '5px 10px' }} disabled={busy} onClick={() => { onDraft(m.badge ?? ''); setEditingBadge((v) => !v); }}>
          Badge
        </button>
      )}
      {showTransfer && (
        <button style={{ ...ghostBtn, minHeight: 0, padding: '5px 10px' }} disabled={busy} onClick={onTransfer} title="Make this member the leader">
          Make leader
        </button>
      )}
      {showRemove && !confirmRemove && (
        <button style={{ ...ghostDangerBtn, minHeight: 0, padding: '5px 10px' }} disabled={busy} onClick={onAskRemove}>
          Remove
        </button>
      )}
      {showRemove && confirmRemove && (
        <>
          <button style={{ ...dangerSolidBtn, minHeight: 0, padding: '5px 10px' }} disabled={busy} onClick={onRemove}>
            Confirm
          </button>
          <button style={{ ...ghostBtn, minHeight: 0, padding: '5px 10px' }} disabled={busy} onClick={onCancelRemove}>
            Cancel
          </button>
        </>
      )}
    </div>
  );

  return (
    <div
      style={{
        padding: '12px 13px',
        background: 'rgba(6,15,36,.5)',
        border: '1px solid #1d3560',
        borderRadius: 9,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            flexShrink: 0,
            background: m.avatarUrl ? `center/cover url(${m.avatarUrl})` : 'rgba(255,255,255,.06)',
            border: `1px solid ${accent}55`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
            color: accent,
          }}
        >
          {!m.avatarUrl && initials(m.displayName)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13.5, color: '#eef3ff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {m.displayName}
            {m.isLeader && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, color: accent, border: `1px solid ${accent}`, borderRadius: 4, padding: '1px 7px' }}>
                <Icon name="crown" size={11} /> Leader
              </span>
            )}
            {m.badge && (
              <span style={{ fontSize: 10.5, fontWeight: 600, color: '#cfe0ff', border: '1px solid #2a4170', borderRadius: 4, padding: '1px 7px' }}>
                {m.badge}
              </span>
            )}
          </div>
        </div>
        {!isPhone && hasActions && actionButtons}
      </div>

      {isPhone && hasActions && <div style={{ marginTop: 10 }}>{actionButtons}</div>}

      {/* Badge editor */}
      {canEditBadge && editingBadge && (
        <div style={{ marginTop: 11, paddingTop: 11, borderTop: '1px solid #16294f' }}>
          <div style={{ ...fieldLabel, marginBottom: 6 }}>Badge title</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {presets.map((p) => (
              <button
                key={p}
                style={{ ...ghostBtn, minHeight: 0, padding: '5px 10px', borderColor: draft === p ? theme.accent : '#2a4170' }}
                onClick={() => onDraft(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              style={{ ...inputStyle, maxWidth: 240 }}
              value={draft}
              onChange={(e) => onDraft(e.target.value)}
              placeholder="Custom title…"
              maxLength={40}
            />
            <button style={primaryBtn(theme, grad)} disabled={busy} onClick={() => { onSaveBadge(draft.trim() || null); setEditingBadge(false); }}>
              Save
            </button>
            {m.badge && (
              <button style={ghostDangerBtn} disabled={busy} onClick={() => { onSaveBadge(null); setEditingBadge(false); }}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Permission toggles (leader editing a member) */}
      {showPerms && (
        <div style={{ marginTop: 11, paddingTop: 11, borderTop: '1px solid #16294f' }}>
          <div style={{ ...fieldLabel, marginBottom: 8 }}>Permissions</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8 }}>
            {PERMS.map((perm) => {
              const on = m.permissions[perm.key];
              return (
                <label
                  key={perm.key}
                  title={perm.help}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#cfe0ff', cursor: busy ? 'default' : 'pointer' }}
                >
                  <input type="checkbox" checked={on} disabled={busy} onChange={(e) => onTogglePerm(perm.key, e.target.checked)} />
                  {perm.label}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
