import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '../../components/Icon';
import { DEFAULT_LADDER, MAX_PRESETS, ladderPatch, warnPatch, type PresetKind } from './ticketPresets';
import type { MarginBasis, TicketPresetMode, TicketPresets } from '../../api/types';

// The cog at the end of the order ticket's quick-size row: what the buttons are,
// what they mean, and when one reads red.
//
// It opens OVER the ticket rather than in a modal, deliberately — every edit
// changes the chips two lines below it, and a dialog that covered them would
// leave the trader saving blind. Nothing here places or validates an order; it
// only decides what the shortcuts fill the size box with.

const GOLD = '#EBCB74';
const RED = '#ef5468';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const INPUT_BG = 'rgba(3,12,32,.6)';
const BORDER = '#16294f';
const BORDER2 = '#1c3a7a';
const MONO = "'IBM Plex Mono', monospace";

// A preset typed into the editor. Kept as text while it is being typed — a field
// cleared to retype it must not remove its own row from under the cursor.
function toText(n: number): string {
  return String(n);
}

interface Props {
  presets: TicketPresets;
  /** The mode in force on this account (a stored 'cost' does not apply off spot). */
  mode: TicketPresetMode;
  /** Which ladder the chips are drawn from — the mode, except units splits by instrument. */
  kind: PresetKind;
  /** The ladder in force, built-in or the trader's own. */
  values: number[];
  /** Whether that ladder is the trader's own (a built-in one offers no Reset). */
  custom: boolean;
  /** Spot accounts size in money spent; margin accounts have no such mode. */
  spot: boolean;
  /** 'pip' on a currency pair, 'point' on everything else. */
  stepName: string;
  /** The base asset on a spot account, for the units label ("BTC"). */
  baseAsset: string;
  /** Which reading colours a preset, and its own threshold. */
  basis: MarginBasis;
  warnPct: number;
  /** Whether the account is reporting a value to measure the second basis against. */
  hasAccountValue: boolean;
  /** What a preset would tie up on the basis in force. Null when unknown. */
  pctFor: (value: number) => number | null;
  onChange: (patch: Partial<TicketPresets>) => void;
  saveError: string | null;
}

export function TicketPresetMenu({
  presets,
  mode,
  kind,
  values,
  custom,
  spot,
  stepName,
  baseAsset,
  basis,
  warnPct,
  hasAccountValue,
  pctFor,
  onChange,
  saveError,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  // The rows being edited, kept as text and re-seeded whenever the ladder being
  // edited changes underneath (a different mode, or an instrument that sizes
  // differently).
  const [draft, setDraft] = useState<{ kind: PresetKind; rows: string[] }>({
    kind,
    rows: values.map(toText),
  });
  if (draft.kind !== kind) setDraft({ kind, rows: values.map(toText) });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    // Capture, so closing the menu does not also drop the screen out of whatever
    // Escape means to the surface underneath it.
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  // Commit whatever parses. A half-typed field simply has no chip yet rather
  // than removing its own row, and an emptied list falls back to the built-in
  // ladder — which is what "I do not want any of these" should mean.
  const commit = (rows: string[]) => {
    setDraft({ kind, rows });
    const parsed: number[] = [];
    for (const r of rows) {
      const n = Number(r.replace(/[, $]/g, ''));
      if (Number.isFinite(n) && n > 0 && !parsed.includes(n)) parsed.push(n);
    }
    onChange(ladderPatch(kind, parsed.length > 0 ? parsed : null));
  };

  const money = kind === 'step' || kind === 'cost';
  const rowUnit =
    kind === 'step'
      ? `per ${stepName}`
      : kind === 'cost'
        ? 'spent'
        : spot
          ? baseAsset || 'units'
          : 'units';

  const modes: { key: TicketPresetMode; label: string }[] = [
    { key: 'units', label: 'Units' },
    { key: 'per_step', label: `$ per ${stepName}` },
    ...(spot ? [{ key: 'cost' as TicketPresetMode, label: 'Money spent' }] : []),
  ];

  return (
    <div ref={wrap} style={{ position: 'relative', marginLeft: 'auto' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Preset size settings"
        title="Preset sizes"
        style={{ ...cogBtn, color: open ? GOLD : MUTED, borderColor: open ? GOLD : BORDER2 }}
      >
        <Icon name="settings" size={15} />
      </button>

      {open && (
        <div style={pop} role="dialog" aria-label="Preset sizes">
          <div style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>{"Preset sizes"}</div>

          <div style={{ marginTop: 11 }}>
            <MiniLabel>{"Presets are"}</MiniLabel>
            <div style={seg}>
              {modes.map((m) => (
                <button
                  key={m.key}
                  onClick={() => onChange({ mode: m.key })}
                  aria-pressed={mode === m.key}
                  style={{ ...segBtn, ...(mode === m.key ? segOn : null) }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 13 }}>
            <MiniLabel>{presets.showMargin ? 'Buttons — margin each would use' : 'Buttons'}</MiniLabel>
            {draft.rows.map((row, i) => {
              const n = Number(row.replace(/[, $]/g, ''));
              const pct = Number.isFinite(n) && n > 0 ? pctFor(n) : null;
              const over = pct != null && pct >= warnPct;
              return (
                <div key={i} style={presetRow}>
                  {money && <span style={{ color: FAINT, fontFamily: MONO, fontSize: 12 }}>{"$"}</span>}
                  <input
                    value={row}
                    inputMode="decimal"
                    aria-label={`Preset ${i + 1}`}
                    onChange={(e) => {
                      const rows = draft.rows.slice();
                      rows[i] = e.target.value;
                      commit(rows);
                    }}
                    style={rowInput}
                  />
                  <span style={{ fontSize: 10, color: FAINT, width: 58 }}>{rowUnit}</span>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: MONO,
                      width: 40,
                      textAlign: 'right',
                      color: over ? RED : FAINT,
                    }}
                  >
                    {presets.showMargin ? (pct == null ? '—' : fmtPct(pct)) : ''}
                  </span>
                  <button
                    onClick={() => commit(draft.rows.filter((_, j) => j !== i))}
                    aria-label={`Remove preset ${i + 1}`}
                    title="Remove"
                    style={xBtn}
                  >
                    {"×"}
                  </button>
                </div>
              );
            })}
            {draft.rows.length < MAX_PRESETS && (
              <button onClick={() => commit([...draft.rows, ''])} style={{ ...ghost, marginTop: 2 }}>
                {"＋ Add a button"}
              </button>
            )}
          </div>

          <label style={{ ...switchRow, marginTop: 13 }}>
            <input
              type="checkbox"
              checked={presets.showMargin}
              onChange={(e) => onChange({ showMargin: e.target.checked })}
              style={{ accentColor: GOLD, width: 15, height: 15 }}
            />
            <span>{spot ? 'Show cash used on each button' : 'Show margin used on each button'}</span>
          </label>

          {presets.showMargin && (
            <>
              {/* Both readings are always on the chip; this picks the one that
                  carries the colour and is measured against the threshold. On an
                  account already holding positions the free-margin reading runs
                  into the hundreds of percent for every size, so a trader sizing
                  against the account as a whole wants the other one leading. */}
              <div style={{ marginTop: 13 }}>
                <MiniLabel>{"Colour by"}</MiniLabel>
                <div style={seg}>
                  {([
                    ['free', spot ? 'Free cash' : 'Free margin'],
                    ['value', 'Account value'],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => onChange({ marginBasis: key })}
                      aria-pressed={basis === key}
                      disabled={key === 'value' && !hasAccountValue}
                      title={
                        key === 'value' && !hasAccountValue
                          ? 'This account is not reporting a value right now'
                          : key === 'value'
                            ? 'The whole account, whatever is already open'
                            : 'What is left to commit right now'
                      }
                      style={{
                        ...segBtn,
                        ...(basis === key ? segOn : null),
                        opacity: key === 'value' && !hasAccountValue ? 0.4 : 1,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ ...switchRow, marginTop: 10, color: MUTED }}>
                <span>{"Turn red at"}</span>
                <input
                  value={String(warnPct)}
                  inputMode="numeric"
                  aria-label="Turn red at this percentage"
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/[^0-9]/g, ''));
                    if (!Number.isFinite(n)) return;
                    // Per basis: 100% of free margin is the point of refusal,
                    // 100% of the account is a different statement, so switching
                    // must not re-interpret a figure somebody set deliberately.
                    onChange(warnPatch(basis, Math.max(1, Math.min(100, n || 1))));
                  }}
                  style={{ ...rowInput, width: 52, flex: '0 0 auto', textAlign: 'right' }}
                />
                <span>{basis === 'value' ? '% of account value' : spot ? '% of cash' : '% of free margin'}</span>
              </div>
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 13 }}>
            {custom && (
              <button
                onClick={() => {
                  setDraft({ kind, rows: DEFAULT_LADDER[kind].map(toText) });
                  onChange(ladderPatch(kind, null));
                }}
                style={ghost}
              >
                {"Reset these"}
              </button>
            )}
            <span style={{ flex: 1 }} />
            <button onClick={() => setOpen(false)} style={doneBtn}>{"Done"}</button>
          </div>

          {saveError && <div style={{ fontSize: 10.5, color: RED, marginTop: 9 }}>{saveError}</div>}
        </div>
      )}
    </div>
  );
}

function MiniLabel({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: MUTED, marginBottom: 5 }}>
      {children}
    </div>
  );
}

// A share of what is available to commit. One decimal below 10% so a small size
// does not read as free, whole numbers above it.
export function fmtPct(p: number): string {
  return `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;
}

const cogBtn: CSSProperties = {
  background: 'rgba(255,255,255,.05)',
  border: `1px solid ${BORDER2}`,
  borderRadius: 6,
  width: 32,
  height: 30,
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  padding: 0,
};
const pop: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  right: 0,
  zIndex: 40,
  width: 300,
  maxWidth: '82vw',
  background: '#08152f',
  border: `1px solid ${BORDER2}`,
  borderRadius: 10,
  padding: 13,
  boxShadow: '0 18px 40px rgba(0,0,0,.55)',
};
const seg: CSSProperties = { display: 'flex', background: INPUT_BG, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' };
const segBtn: CSSProperties = { flex: 1, background: 'none', border: 'none', color: MUTED, fontSize: 11, fontWeight: 600, padding: '7px 4px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' };
const segOn: CSSProperties = { background: 'rgba(235,203,116,.16)', color: GOLD };
const presetRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 };
const rowInput: CSSProperties = {
  background: 'rgba(3,12,32,.8)',
  border: `1px solid ${BORDER2}`,
  borderRadius: 6,
  color: TEXT,
  fontSize: 12.5,
  padding: '5px 8px',
  fontFamily: MONO,
  flex: 1,
  minWidth: 0,
  outline: 'none',
};
const xBtn: CSSProperties = { background: 'none', border: 'none', color: FAINT, fontSize: 15, lineHeight: 1, cursor: 'pointer', padding: '2px 3px' };
const ghost: CSSProperties = { background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, color: '#dfe7fa', fontSize: 11, fontWeight: 600, padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' };
const doneBtn: CSSProperties = { ...ghost, background: GOLD, borderColor: GOLD, color: '#0c2768', fontWeight: 700 };
const switchRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: MUTED, cursor: 'default' };
