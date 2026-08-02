import type { Theme } from '../../theme/themes';
import type { RoleKey } from '../../api/types';
import { ALL_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS } from '../../auth/access';
import { panel, SectionHeader } from './adminUi';
import { Icon } from '../../components/Icon';

// The admin-only "View as role" preview, moved out of the account menu into its
// own Admin section. Emulate someone who holds only the one selected role, so
// you can see exactly what a member with that access sees. Pure UI gating — the
// server still enforces your real (admin) roles on every request.
export function AdminViewAs({
  theme,
  actingRole,
  onSetActingRole,
}: {
  theme: Theme;
  actingRole: RoleKey | null;
  onSetActingRole: (r: RoleKey | null) => void;
}) {
  const row = (active: boolean, label: React.ReactNode, desc: React.ReactNode, onClick: () => void) => (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        background: active ? 'rgba(224,112,143,.12)' : 'rgba(0,0,0,.18)',
        border: `1px solid ${active ? theme.accent : theme.navBorder}`,
        borderRadius: 10,
        padding: '13px 15px',
        marginBottom: 8,
        fontFamily: 'inherit',
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          flex: 'none',
          border: `2px solid ${active ? theme.accent : '#5e7098'}`,
          background: active ? theme.accent : 'transparent',
        }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: active ? theme.accent : '#eef3ff' }}>{label}</span>
        <span style={{ display: 'block', fontSize: 11.5, color: '#8ea3cc', marginTop: 2 }}>{desc}</span>
      </span>
    </button>
  );

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <SectionHeader
        title="View as role"
        subtitle="Preview the terminal as a member with only the selected role. This changes what you see in the app; your real admin access is unchanged."
      />

      {actingRole && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(229,164,59,.1)',
            border: '1px solid rgba(229,164,59,.35)',
            borderRadius: 10,
            padding: '11px 14px',
            marginBottom: 16,
            fontSize: 12.5,
            color: '#f0c98a',
          }}
        >
          <Icon name="eye" size={16} />
          Previewing as <b style={{ color: '#fff' }}>{ROLE_LABELS[actingRole]}</b>. Select “My access” to return to your own view.
        </div>
      )}

      <div style={panel(theme)}>
        {row(
          !actingRole,
          "My access (all my roles)",
          "Your normal admin view with every workspace.",
          () => onSetActingRole(null),
        )}
        {ALL_ROLES.map((r: RoleKey) => row(actingRole === r, ROLE_LABELS[r], ROLE_DESCRIPTIONS[r], () => onSetActingRole(actingRole === r ? null : r)))}
      </div>

      <p style={{ marginTop: 14, fontSize: 11.5, color: '#7488b5', lineHeight: 1.5, background: 'transparent' }}>
        {"Tip: while previewing, the workspaces and sections in the sidebar update to match that role. Come back to this section (Admin → View as role) to switch back — it stays available to you."}
      </p>
    </div>
  );
}
