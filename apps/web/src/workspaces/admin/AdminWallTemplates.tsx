import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import type { BoardTileKind, TemplateTile, WallTemplate } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { Icon } from '../../components/Icon';
import { TILE_GROUPS, tileDef, TILE_CATALOG } from '../trading/tileCatalog';
import { fieldLabel, ghostBtn, inputStyle, panel, panelLabel, primaryBtn } from './adminUi';

// Developer Terminal ▸ Live Wall Templates — the default boards a free account
// gets, editable without a deploy.
//
// DRAFT THEN PUBLISH, and the screen is built around making that visible. A
// template with unpublished changes says so, in a colour, next to its name; the
// Publish button is the only thing that changes what a member sees, and it is
// the only control here that is styled as the primary action. Everything else is
// safe to press.
//
// The editor is deliberately a LIST rather than a drag-and-drop canvas. A
// template is a handful of tiles with a column and a row, and a canvas here
// would mean a second implementation of the Live Wall's grid — one that would
// drift from the real one and be wrong about what a layout looks like, which is
// the only thing this screen exists to get right. A number field says exactly
// what will be stored.

const COLS = 12;

export function AdminWallTemplates({ theme }: { theme: Theme }) {
  const accentGrad = accentGradient(theme);
  const [rows, setRows] = useState<WallTemplate[] | null>(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .adminWallTemplates()
      .then((r) => alive && setRows(r.templates))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : 'Could not load templates'));
    return () => {
      alive = false;
    };
  }, []);

  async function run(fn: () => Promise<{ templates: WallTemplate[] }>) {
    setError('');
    try {
      setRows((await fn()).templates);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not save');
    }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 19, color: '#eef3ff' }}>Live Wall templates</h2>
        <p style={{ margin: 0, fontSize: 12.5, color: '#8298c4', lineHeight: 1.6, maxWidth: 720 }}>
          The built-in layouts every account can choose between — and the only boards
          a free account gets, since saving your own arrangement is paid. Changes are
          saved as a draft and reach members when you press Publish.
        </p>
      </div>

      {error && <div style={errBox}>{error}</div>}

      {rows == null ? (
        <div style={{ color: '#8298c4', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((t) => (
            <TemplateCard
              key={t.id}
              t={t}
              theme={theme}
              accentGrad={accentGrad}
              open={openId === t.id}
              onToggle={() => setOpenId(openId === t.id ? null : t.id)}
              onRun={run}
            />
          ))}
        </div>
      )}

      <button type="button" onClick={() => setCreating(true)} style={{ ...ghostBtn, marginTop: 14 }}>
        + New template
      </button>

      {creating && (
        <CreateTemplate
          theme={theme}
          accentGrad={accentGrad}
          onClose={() => setCreating(false)}
          onCreated={(list) => {
            setRows(list);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function TemplateCard({
  t,
  theme,
  accentGrad,
  open,
  onToggle,
  onRun,
}: {
  t: WallTemplate;
  theme: Theme;
  accentGrad: string;
  open: boolean;
  onToggle: () => void;
  onRun: (fn: () => Promise<{ templates: WallTemplate[] }>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<TemplateTile[]>(t.draft);
  const [label, setLabel] = useState(t.label);
  const [blurb, setBlurb] = useState(t.blurb);

  // Adopt the server's view whenever the row changes underneath (a publish, a
  // discard). Local edits are pushed up immediately on each change, so there is
  // never a local edit this could clobber.
  useEffect(() => {
    setDraft(t.draft);
    setLabel(t.label);
    setBlurb(t.blurb);
  }, [t.draft, t.label, t.blurb]);

  const save = (tiles: TemplateTile[]) => {
    setDraft(tiles);
    void onRun(() => api.saveWallTemplateDraft(t.id, { tiles }));
  };

  function patchTile(i: number, p: Partial<TemplateTile>) {
    save(draft.map((tile, idx) => (idx === i ? { ...tile, ...p } : tile)));
  }

  return (
    <div style={{ ...panel(theme), borderColor: t.hasDraft ? '#5a4d2a' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#eef3ff' }}>{t.label}</span>
        <span style={keyTag}>{t.key}</span>
        {t.hasDraft && <span style={{ ...chip, color: '#EBCB74', borderColor: '#5a4d2a' }}>Unpublished changes</span>}
        {t.hidden && <span style={{ ...chip, color: '#8298c4', borderColor: '#1d3560' }}>Hidden</span>}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#7488b5' }}>
          {t.published.length} live {t.published.length === 1 ? 'tile' : 'tiles'}
        </span>
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 12, color: '#8298c4' }}>{t.blurb || '—'}</p>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={onToggle} style={ghostBtn}>
          {open ? 'Close' : 'Edit layout'}
        </button>
        {t.hasDraft && (
          <>
            <button
              type="button"
              onClick={() => void onRun(() => api.publishWallTemplate(t.id))}
              style={primaryBtn(theme, accentGrad)}
            >
              Publish to everyone
            </button>
            <button
              type="button"
              onClick={() => void onRun(() => api.discardWallTemplateDraft(t.id))}
              style={ghostBtn}
            >
              Discard changes
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => void onRun(() => api.saveWallTemplateDraft(t.id, { hidden: !t.hidden }))}
          style={ghostBtn}
        >
          {t.hidden ? 'Show to members' : 'Hide from members'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={fieldLabel}>Name</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value.slice(0, 60))}
                onBlur={() => label !== t.label && void onRun(() => api.saveWallTemplateDraft(t.id, { label }))}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: '2 1 300px' }}>
              <label style={fieldLabel}>One line about it</label>
              <input
                value={blurb}
                onChange={(e) => setBlurb(e.target.value.slice(0, 140))}
                onBlur={() => blurb !== t.blurb && void onRun(() => api.saveWallTemplateDraft(t.id, { blurb }))}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={panelLabel}>Tiles</div>
          {draft.length === 0 ? (
            <div style={{ fontSize: 12.5, color: '#8298c4', marginBottom: 10 }}>
              No tiles yet. A template with none stays hidden from members.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 10 }}>
              <div style={{ ...tileRow, color: '#7488b5', fontSize: 10, fontWeight: 700 }}>
                <span style={{ flex: '1 1 150px' }}>TILE</span>
                <span style={numHead}>COL</span>
                <span style={numHead}>ROW</span>
                <span style={numHead}>WIDTH</span>
                <span style={numHead}>HEIGHT</span>
                <span style={{ width: 26 }} />
              </div>
              {draft.map((tile, i) => (
                <div key={i} style={tileRow}>
                  <span style={{ flex: '1 1 150px', fontSize: 12.5, color: '#eef3ff' }}>
                    {tileDef(tile.kind)?.label ?? tile.kind}
                  </span>
                  <NumField value={tile.x} max={COLS - tile.w} onChange={(v) => patchTile(i, { x: v })} />
                  <NumField value={tile.y} max={400} onChange={(v) => patchTile(i, { y: v })} />
                  <NumField
                    value={tile.w}
                    min={1}
                    max={COLS}
                    onChange={(v) => patchTile(i, { w: v, x: Math.min(tile.x, COLS - v) })}
                  />
                  <NumField value={tile.h} min={1} max={60} onChange={(v) => patchTile(i, { h: v })} />
                  <button
                    type="button"
                    onClick={() => save(draft.filter((_, idx) => idx !== i))}
                    style={{ ...ghostBtn, padding: '4px 7px' }}
                    aria-label="Remove tile"
                  >
                    <Icon name="trash-2" size={11} color="#ffb4ab" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <AddTile
            onAdd={(kind) => {
              const def = tileDef(kind);
              // Dropped on a fresh row below everything, at its catalog size —
              // the same defaults a member gets when they add one to a board.
              const y = draft.reduce((m, t2) => Math.max(m, t2.y + t2.h), 0);
              save([...draft, { kind, x: 0, y, w: def?.w ?? 4, h: def?.h ?? 10 }]);
            }}
          />

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #1d3560' }}>
            <button
              type="button"
              onClick={() => {
                if (confirm(`Delete the "${t.label}" template?`)) {
                  void onRun(() => api.removeWallTemplate(t.id));
                }
              }}
              style={{ ...ghostBtn, color: '#ffb4ab' }}
            >
              Delete template
            </button>
            <span style={{ fontSize: 11, color: '#7488b5', marginLeft: 10 }}>
              One of the three original templates comes back on the next deploy. Hide
              it instead to keep it away for good.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function NumField({
  value,
  min = 0,
  max,
  onChange,
}: {
  value: number;
  min?: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (!Number.isFinite(v)) return;
        onChange(Math.max(min, Math.min(max, Math.round(v))));
      }}
      style={{ ...inputStyle, width: 62, padding: '5px 7px', fontSize: 12 }}
    />
  );
}

function AddTile({ onAdd }: { onAdd: (kind: BoardTileKind) => void }) {
  const [kind, setKind] = useState<BoardTileKind | ''>('');
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as BoardTileKind | '')}
        style={{ ...inputStyle, flex: '1 1 200px' }}
      >
        <option value="">Add a tile…</option>
        {TILE_GROUPS.map((g) => (
          <optgroup key={g.key} label={g.label}>
            {TILE_CATALOG.filter((t) => t.group === g.key).map((t) => (
              <option key={t.kind} value={t.kind}>
                {t.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <button
        type="button"
        disabled={!kind}
        onClick={() => {
          if (kind) onAdd(kind);
          setKind('');
        }}
        style={{ ...ghostBtn, opacity: kind ? 1 : 0.5 }}
      >
        Add
      </button>
    </div>
  );
}

function CreateTemplate({
  theme,
  accentGrad,
  onClose,
  onCreated,
}: {
  theme: Theme;
  accentGrad: string;
  onClose: () => void;
  onCreated: (list: WallTemplate[]) => void;
}) {
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [blurb, setBlurb] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError('');
    try {
      onCreated((await api.createWallTemplate({ key: key.trim().toLowerCase(), label, blurb })).templates);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create that');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={modalWrap} onClick={onClose}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#eef3ff', marginBottom: 12 }}>
          New template
        </div>
        <label style={fieldLabel}>Key</label>
        <input
          value={key}
          onChange={(e) => setKey(e.target.value.slice(0, 40))}
          placeholder="swing-desk"
          autoFocus
          style={{ ...inputStyle, marginBottom: 4 }}
        />
        <div style={{ fontSize: 11, color: '#7488b5', marginBottom: 12 }}>
          Lowercase letters, numbers and dashes. It cannot be changed later — a
          member’s remembered layout choice is stored against it.
        </div>
        <label style={fieldLabel}>Name</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value.slice(0, 60))}
          placeholder="Swing Desk"
          style={{ ...inputStyle, marginBottom: 12 }}
        />
        <label style={fieldLabel}>One line about it</label>
        <input
          value={blurb}
          onChange={(e) => setBlurb(e.target.value.slice(0, 140))}
          placeholder="Charts and the trade record, nothing else."
          style={inputStyle}
        />
        {error && <div style={{ fontSize: 12, color: '#ffb4ab', marginTop: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={busy || !key.trim() || !label.trim()}
            onClick={() => void save()}
            style={primaryBtn(theme, accentGrad)}
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
          <button type="button" onClick={onClose} style={ghostBtn}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

const tileRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
};
const numHead: CSSProperties = { width: 62, textAlign: 'center' };
const chip: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  border: '1px solid',
  borderRadius: 999,
  padding: '2px 8px',
};
const keyTag: CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 10.5,
  color: '#7488b5',
  border: '1px solid #1d3560',
  borderRadius: 5,
  padding: '1px 6px',
};
const errBox: CSSProperties = {
  color: '#ffb4ab',
  fontSize: 12.5,
  background: 'rgba(239,84,104,.1)',
  border: '1px solid rgba(239,84,104,.4)',
  borderRadius: 8,
  padding: '9px 11px',
  marginBottom: 14,
};
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
  width: 'min(460px, 100%)',
  background: '#0C1C3C',
  border: '1px solid #1d3560',
  borderRadius: 12,
  padding: '20px 22px',
  boxShadow: '0 24px 60px rgba(0,0,0,.55)',
};
