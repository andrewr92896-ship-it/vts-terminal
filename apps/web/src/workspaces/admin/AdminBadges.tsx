import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { BadgeType } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
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
} from './adminUi';

// The glyphs an admin can choose for a badge. All exist in components/Icon.
const BADGE_ICONS = [
  'star', 'shield', 'shield-check', 'crown', 'award', 'medal', 'trophy', 'gem',
  'diamond', 'rocket', 'flame', 'zap', 'heart', 'badge-check', 'sparkles', 'key',
  'anchor', 'leaf', 'sun', 'moon', 'hexagon', 'target', 'bell', 'graduation-cap',
];

// A small palette of accent colors for a badge.
const BADGE_COLORS = [
  '#EBCB74', '#E0708F', '#6C9EFF', '#46C2A8', '#B98CFF', '#FF9A62',
  '#2FC77E', '#FF6B6B', '#5AD1E0', '#C9A24B', '#9FB0D6', '#F2C14E',
];

// Admin panel: manage the recognition badges shown next to members' names.
// Built-in badges (Early Release star, Admin shield) can be re-styled but not
// deleted; admins can also create their own.
export function AdminBadges({ theme }: { theme: Theme }) {
  const accentGrad = accentGradient(theme);
  const [badges, setBadges] = useState<BadgeType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // New-badge form
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState('star');
  const [color, setColor] = useState(BADGE_COLORS[0]);
  const [description, setDescription] = useState('');

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editIcon, setEditIcon] = useState('star');
  const [editColor, setEditColor] = useState(BADGE_COLORS[0]);
  const [editLabel, setEditLabel] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .badges()
      .then((r) => alive && setBadges(r.badges))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : 'Failed to load badges'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  async function create() {
    if (!label.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.adminCreateBadge({
        label: label.trim(),
        icon,
        color,
        description: description.trim() || null,
      });
      setBadges(r.badges);
      setLabel('');
      setDescription('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the badge');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(b: BadgeType) {
    setEditId(b.id);
    setEditIcon(b.icon);
    setEditColor(b.color);
    setEditLabel(b.label);
    setEditDesc(b.description ?? '');
    setConfirmDeleteId(null);
  }

  async function saveEdit(id: string) {
    if (!editLabel.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.adminUpdateBadge(id, {
        label: editLabel.trim(),
        icon: editIcon,
        color: editColor,
        description: editDesc.trim() || null,
      });
      setBadges(r.badges);
      setEditId(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the badge');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await api.adminDeleteBadge(id);
      setBadges(r.badges);
      setConfirmDeleteId(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete the badge');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div style={{ color: '#8ea3cc', padding: 20, fontSize: 13 }}>Loading badges...</div>;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', color: '#dfe7fa' }}>
      <SectionHeader
        title="Badges"
        subtitle="Recognition icons shown next to a member's name. The Admin shield is granted automatically to admins; the Early Release star and any custom badges are assigned to members in the Users section."
      />

      {error && (
        <div onClick={() => setError(null)} style={{ ...msgStyle(false), marginBottom: 12, cursor: 'pointer' }}>
          {error} (dismiss)
        </div>
      )}

      {/* Existing badges */}
      <div style={{ ...panel(theme), marginBottom: 16 }}>
        <div style={panelLabel}>Badges</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {badges.map((b) =>
            editId === b.id ? (
              <div key={b.id} style={editRow(theme)}>
                <IconPicker value={editIcon} onChange={setEditIcon} color={editColor} theme={theme} />
                <ColorPicker value={editColor} onChange={setEditColor} />
                <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} placeholder="Label" style={{ ...inputStyle, flex: '1 1 120px', minHeight: 36 }} />
                <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Description (tooltip)" style={{ ...inputStyle, flex: '2 1 180px', minHeight: 36 }} />
                <button onClick={() => saveEdit(b.id)} disabled={busy} style={primaryBtn(theme, accentGrad)}>Save</button>
                <button onClick={() => setEditId(null)} disabled={busy} style={ghostBtn}>Cancel</button>
              </div>
            ) : (
              <div
                key={b.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                  padding: '9px 11px',
                  borderRadius: 8,
                  border: `1px solid ${theme.navBorder}`,
                  background: 'rgba(0,0,0,.18)',
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    border: `1px solid ${b.color}`,
                    flex: 'none',
                  }}
                >
                  <Icon name={b.icon} size={17} color={b.color} />
                </span>
                <div style={{ flex: '1 1 auto', minWidth: 120 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#eef3ff' }}>
                    {b.label}
                    {b.autoRole && (
                      <span style={{ marginLeft: 8, fontSize: 10, color: '#7fb3ff', fontWeight: 500 }}>
                        · auto for {b.autoRole}s
                      </span>
                    )}
                    {b.builtin && (
                      <span style={{ marginLeft: 8, fontSize: 10, color: '#7488b5', fontWeight: 500 }}>· built-in</span>
                    )}
                  </div>
                  {b.description && <div style={{ fontSize: 11.5, color: '#9fb0d6', marginTop: 2 }}>{b.description}</div>}
                </div>
                <button onClick={() => startEdit(b)} disabled={busy} style={ghostBtn}>Edit</button>
                {b.builtin ? null : confirmDeleteId === b.id ? (
                  <>
                    <button onClick={() => remove(b.id)} disabled={busy} style={dangerSolidBtn}>
                      {busy ? 'Deleting…' : 'Confirm'}
                    </button>
                    <button onClick={() => setConfirmDeleteId(null)} disabled={busy} style={ghostBtn}>Cancel</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmDeleteId(b.id)} disabled={busy} style={ghostDangerBtn}>Delete</button>
                )}
              </div>
            ),
          )}
        </div>
      </div>

      {/* Create a new badge */}
      <div style={panel(theme)}>
        <div style={panelLabel}>Create a badge</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={fieldLabel}>Icon</label>
            <IconPicker value={icon} onChange={setIcon} color={color} theme={theme} wrap />
          </div>
          <div>
            <label style={fieldLabel}>Color</label>
            <ColorPicker value={color} onChange={setColor} wrap />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 160px' }}>
              <label style={fieldLabel}>Name</label>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Founding Member" maxLength={40} style={inputStyle} />
            </div>
            <div style={{ flex: '2 1 220px' }}>
              <label style={fieldLabel}>Description (tooltip, optional)</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Shown on hover" maxLength={200} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={create} disabled={busy || !label.trim()} style={primaryBtn(theme, accentGrad)}>
              {busy ? 'Saving…' : 'Add badge'}
            </button>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9fb0d6' }}>
              Preview: <Icon name={icon} size={16} color={color} /> {label.trim() || 'Badge name'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function editRow(theme: Theme): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    padding: '9px 11px',
    borderRadius: 8,
    border: `1px solid ${theme.accent}`,
    background: 'rgba(0,0,0,.24)',
  };
}

function IconPicker({
  value,
  onChange,
  color,
  theme,
  wrap,
}: {
  value: string;
  onChange: (v: string) => void;
  color: string;
  theme: Theme;
  wrap?: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: wrap ? 'wrap' : 'nowrap', maxWidth: wrap ? undefined : 200, overflowX: wrap ? undefined : 'auto' }}>
      {BADGE_ICONS.map((name) => {
        const on = name === value;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            title={name}
            style={{
              width: 34,
              height: 34,
              flex: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              cursor: 'pointer',
              border: `1px solid ${on ? theme.accent : theme.navBorder}`,
              background: on ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.18)',
            }}
          >
            <Icon name={name} size={17} color={on ? color : '#aebcd8'} />
          </button>
        );
      })}
    </div>
  );
}

function ColorPicker({ value, onChange, wrap }: { value: string; onChange: (v: string) => void; wrap?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: wrap ? 'wrap' : 'nowrap' }}>
      {BADGE_COLORS.map((c) => {
        const on = c.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            title={c}
            style={{
              width: 26,
              height: 26,
              flex: 'none',
              borderRadius: '50%',
              cursor: 'pointer',
              background: c,
              border: on ? '2px solid #fff' : '2px solid transparent',
              boxShadow: on ? `0 0 0 1px ${c}` : 'none',
            }}
          />
        );
      })}
    </div>
  );
}
