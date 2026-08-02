import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { C, tint } from '../../theme/tokens';
import type { NetWorth, NetWorthCategory, NetWorthItem, NetWorthKind } from '../../api/types';
import {
  Card,
  Delta,
  Disclaimer,
  Empty,
  Money,
  ScreenHeader,
  TEAL,
  dangerBtn,
  ghostBtn,
  inputStyle,
  labelStyle,
  panel,
  primaryBtn,
} from '../investments/ui';

// My Terminal ▸ Net Worth — everything you own minus everything you owe.
//
// The investment portfolio and the trading account are pulled in live rather
// than typed in, which is why there is no category here for "brokerage" or
// "investments": offering one would invite someone to enter the biggest number
// on the screen a second time, and nothing could detect that afterwards. The
// screen says outright which parts are counted automatically.
//
// When the tracked side cannot be totalled — a broker that would not answer, an
// account in another currency — the server sends `netWorth: null` and this shows
// no headline figure at all. A net worth missing a chunk is worse than none,
// because it looks complete.

const EMERALD = '#34D399';

const ASSET_CATEGORIES: { key: NetWorthCategory; label: string }[] = [
  { key: 'cash', label: 'Cash & savings' },
  { key: 'real_estate', label: 'Real estate' },
  { key: 'vehicle', label: 'Vehicle' },
  { key: 'crypto', label: 'Crypto held elsewhere' },
  { key: 'business', label: 'Business' },
  { key: 'valuables', label: 'Valuables' },
  { key: 'retirement_other', label: 'Retirement account not tracked here' },
  { key: 'other_asset', label: 'Other' },
];

const LIABILITY_CATEGORIES: { key: NetWorthCategory; label: string }[] = [
  { key: 'mortgage', label: 'Mortgage' },
  { key: 'auto_loan', label: 'Auto loan' },
  { key: 'student_loan', label: 'Student loan' },
  { key: 'credit_card', label: 'Credit card' },
  { key: 'personal_loan', label: 'Personal loan' },
  { key: 'other_debt', label: 'Other debt' },
];

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  [...ASSET_CATEGORIES, ...LIABILITY_CATEGORIES].map((c) => [c.key, c.label]),
);

export function NetWorthScreen({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  const { user } = useAuth();
  const readOnly = !!user?.isDemo;
  const [data, setData] = useState<NetWorth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<NetWorthKind | null>(null);
  const [editing, setEditing] = useState<NetWorthItem | null>(null);

  const load = useCallback(() => {
    let alive = true;
    api
      .netWorth()
      .then((d) => alive && setData(d))
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : 'Could not load'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => load(), [load]);

  if (error) {
    return (
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <ScreenHeader title="Net Worth" blurb="" />
        <div style={{ ...panel, padding: 16, color: C.red, fontSize: 12.5 }}>{error}</div>
      </div>
    );
  }
  if (loading && !data) return <div style={{ padding: 24, color: C.muted, fontSize: 13 }}>Loading…</div>;
  if (!data) return null;

  const { tracked, totals } = data;
  const trackedValue = tracked.investments + (tracked.tradingEnabled ? tracked.trading : 0);
  const nothingYet =
    trackedValue === 0 && data.assets.length === 0 && data.liabilities.length === 0;

  const first = data.history[0];
  const last = data.history[data.history.length - 1];
  const change = first && last && data.history.length > 1 ? last.netWorth - first.netWorth : null;

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', color: C.text, animation: 'fadeIn .25s ease' }}>
      <ScreenHeader
        title="Net Worth"
        blurb="Everything you own minus everything you owe, in one number. Your investments and trading account are counted automatically; add anything else by hand."
      />

      {nothingYet ? (
        <Empty icon="scale" title="Let's build the picture">
          Your investment portfolio and trading account are counted automatically. Add the rest — a house, a car,
          savings, a mortgage — and this becomes your whole financial picture in one number, tracked over time.
          {!readOnly && (
            <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setAdding('asset')} style={{ ...ghostBtn, color: EMERALD, borderColor: `${EMERALD}55` }}>
                Add something you own
              </button>
              <button onClick={() => setAdding('liability')} style={ghostBtn}>
                Add something you owe
              </button>
            </div>
          )}
        </Empty>
      ) : (
        <>
          {/* The headline, or an honest refusal to state one. */}
          {totals.netWorth != null ? (
            <div style={{ ...panel, padding: '20px 22px', marginBottom: 12, borderLeft: `3px solid ${EMERALD}` }}>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: '0.6px',
                  textTransform: 'uppercase',
                  color: C.faint,
                  fontFamily: C.mono,
                  marginBottom: 8,
                }}
              >
                Net worth
              </div>
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 700,
                  fontFamily: C.mono,
                  lineHeight: 1.05,
                  color: totals.netWorth >= 0 ? C.text : C.red,
                }}
              >
                <Money value={totals.netWorth} />
              </div>
              <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap', fontSize: 12.5, color: C.muted }}>
                <span>
                  Own <Money value={totals.assets} />
                </span>
                <span>
                  Owe <Money value={totals.liabilities} />
                </span>
                {change != null && (
                  <span>
                    Since {first!.onDate} <Delta value={change} size={12.5} />
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div
              style={{
                ...panel,
                padding: '14px 16px',
                marginBottom: 12,
                fontSize: 12.5,
                color: C.amber,
                lineHeight: 1.65,
                borderLeft: `3px solid ${C.amber}`,
              }}
            >
              <strong style={{ color: C.text }}>No total right now.</strong>{' '}
              {tracked.note ?? 'Part of what you own could not be read just now.'} A net worth with a piece missing
              looks complete when it is not, so nothing is shown rather than a figure that is quietly short. The
              parts that could be read are below.
            </div>
          )}

          {data.history.length > 1 && (
            <Card title="Over time" style={{ marginBottom: 12 }}>
              <NetWorthChart history={data.history} />
            </Card>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 12 }}>
            <Card
              title="What you own"
              right={
                !readOnly && (
                  <button
                    onClick={() => { setEditing(null); setAdding(adding === 'asset' ? null : 'asset'); }}
                    style={{ ...ghostBtn, padding: '4px 9px', fontSize: 11 }}
                  >
                    {adding === 'asset' ? 'Cancel' : 'Add'}
                  </button>
                )
              }
            >
              {/* Counted automatically — named so nobody enters them twice. */}
              <TrackedRow
                label="Investment portfolio"
                value={tracked.investments}
                onOpen={() => onNavigate?.('inv_overview')}
              />
              {tracked.tradingEnabled && (
                <TrackedRow
                  label="Trading account"
                  value={tracked.trading}
                  onOpen={() => onNavigate?.('desk')}
                />
              )}

              {data.assets.length > 0 && (
                <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
                  {data.assets.map((it) => (
                    <ItemRow key={it.id} item={it} readOnly={readOnly} onEdit={() => { setAdding(null); setEditing(it); }} onChanged={setData} />
                  ))}
                </div>
              )}

              <div
                style={{
                  fontSize: 11,
                  color: C.faint,
                  marginTop: 13,
                  paddingTop: 11,
                  borderTop: `1px solid ${C.line}`,
                  lineHeight: 1.6,
                }}
              >
                Your investments and trading account are pulled in automatically — do not add them by hand as well,
                or they will be counted twice.
              </div>
            </Card>

            <Card
              title="What you owe"
              right={
                !readOnly && (
                  <button
                    onClick={() => { setEditing(null); setAdding(adding === 'liability' ? null : 'liability'); }}
                    style={{ ...ghostBtn, padding: '4px 9px', fontSize: 11 }}
                  >
                    {adding === 'liability' ? 'Cancel' : 'Add'}
                  </button>
                )
              }
            >
              {data.liabilities.length === 0 ? (
                <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
                  Nothing recorded. Add a mortgage, a loan or a card balance and it comes off the total.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 9 }}>
                  {data.liabilities.map((it) => (
                    <ItemRow key={it.id} item={it} readOnly={readOnly} onEdit={() => { setAdding(null); setEditing(it); }} onChanged={setData} />
                  ))}
                </div>
              )}
              {data.liabilities.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: 13,
                    paddingTop: 11,
                    borderTop: `1px solid ${C.line}`,
                    fontSize: 12.5,
                  }}
                >
                  <span style={{ color: C.faint }}>Total owed</span>
                  <span style={{ fontFamily: C.mono, color: C.red }}>
                    <Money value={totals.liabilities} />
                  </span>
                </div>
              )}
            </Card>
          </div>

          {data.history.length === 1 && (
            <div style={{ ...panel, padding: '11px 14px', marginTop: 12, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
              Today is the first reading. Your net worth is recorded once a day from here on, and a trend line
              appears once there is more than one point. History is not filled in backwards — there is no way to
              know what your house or your portfolio was worth last year.
            </div>
          )}
        </>
      )}

      {(adding || editing) && !readOnly && (
        <ItemForm
          kind={editing ? editing.kind : adding!}
          existing={editing}
          onDone={(next) => {
            setAdding(null);
            setEditing(null);
            if (next) setData(next);
          }}
        />
      )}

      <Disclaimer>
        Informational only. These figures are the ones you entered plus what the terminal already tracks — nothing
        here is investment, tax, or financial advice, and it is not a valuation of anything.
      </Disclaimer>
    </div>
  );
}

function TrackedRow({ label, value, onOpen }: { label: string; value: number; onOpen: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
      <span
        style={{
          fontSize: 9.5,
          fontFamily: C.mono,
          color: TEAL,
          border: `1px solid ${tint(TEAL, 0.35)}`,
          background: tint(TEAL, 0.08),
          borderRadius: 4,
          padding: '1px 5px',
          flex: 'none',
        }}
      >
        auto
      </span>
      <button
        onClick={onOpen}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontSize: 12.5,
          color: C.text,
          flex: 1,
          minWidth: 0,
          textAlign: 'left',
        }}
      >
        {label}
      </button>
      <span style={{ fontSize: 12.5, fontFamily: C.mono, color: C.muted, flex: 'none' }}>
        <Money value={value} />
      </span>
    </div>
  );
}

function ItemRow({
  item,
  readOnly,
  onEdit,
  onChanged,
}: {
  item: NetWorthItem;
  readOnly: boolean;
  onEdit: () => void;
  onChanged: (next: NetWorth) => void;
}) {
  const [busy, setBusy] = useState(false);
  const isDebt = item.kind === 'liability';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, color: C.text }}>{item.label}</span>
        <span style={{ fontSize: 10.5, color: C.faint, marginLeft: 8, fontFamily: C.mono }}>
          {CATEGORY_LABEL[item.category] ?? item.category}
        </span>
      </span>
      <span style={{ fontSize: 12.5, fontFamily: C.mono, color: isDebt ? C.red : C.muted, flex: 'none' }}>
        {isDebt ? '−' : ''}
        <Money value={item.value} />
      </span>
      {!readOnly && (
        <span style={{ display: 'flex', gap: 5, flex: 'none' }}>
          <button onClick={onEdit} style={{ ...ghostBtn, padding: '2px 7px', fontSize: 10.5 }}>
            Edit
          </button>
          <button
            onClick={async () => {
              setBusy(true);
              try {
                onChanged(await api.deleteNetWorthItem(item.id));
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
            style={{ ...dangerBtn, padding: '2px 7px', fontSize: 10.5 }}
          >
            ×
          </button>
        </span>
      )}
    </div>
  );
}

function ItemForm({
  kind,
  existing,
  onDone,
}: {
  kind: NetWorthKind;
  existing: NetWorthItem | null;
  onDone: (next: NetWorth | null) => void;
}) {
  const categories = kind === 'asset' ? ASSET_CATEGORIES : LIABILITY_CATEGORIES;
  const [category, setCategory] = useState<NetWorthCategory>(existing?.category ?? categories[0]!.key);
  const [label, setLabel] = useState(existing?.label ?? '');
  const [value, setValue] = useState(existing ? String(existing.value) : '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const amount = Number(value);
    if (!label.trim()) return setError('Give it a name');
    if (!Number.isFinite(amount) || amount < 0) return setError('Enter an amount');
    setBusy(true);
    setError(null);
    try {
      const body = { kind, category, label: label.trim(), value: amount, note: note.trim() || null };
      const next = existing
        ? await api.updateNetWorthItem(existing.id, body)
        : await api.createNetWorthItem(body);
      onDone(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that');
    } finally {
      setBusy(false);
    }
  }

  const heading = existing
    ? 'Edit entry'
    : kind === 'asset'
      ? 'Add something you own'
      : 'Add something you owe';

  return (
    <Card title={heading} style={{ marginTop: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
        <div>
          <label style={labelStyle}>Kind</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as NetWorthCategory)} style={inputStyle}>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Name</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={kind === 'asset' ? 'The house' : 'Mortgage'}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>{kind === 'asset' ? 'What it is worth' : 'Amount still owed'}</label>
          <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Note</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" style={inputStyle} />
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: C.faint, marginTop: 11, lineHeight: 1.55 }}>
        {kind === 'asset'
          ? 'Enter your own estimate of what it is worth today. Nothing here looks up a value, so it stays as you typed it until you change it.'
          : 'Enter the balance still outstanding, as a positive number — it is subtracted for you.'}
      </div>
      {error && <div style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={save} disabled={busy} style={primaryBtn}>
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Add it'}
        </button>
        <button onClick={() => onDone(null)} style={ghostBtn}>
          Cancel
        </button>
      </div>
    </Card>
  );
}

// A plain SVG line — the app carries no charting library, and a single series
// does not justify adding one.
function NetWorthChart({ history }: { history: NetWorth['history'] }) {
  const W = 640;
  const H = 170;
  const PAD = { l: 8, r: 8, t: 12, b: 22 };

  const values = history.map((p) => p.netWorth);
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const x = (i: number) => PAD.l + (i / (history.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - min) / span) * (H - PAD.t - PAD.b);

  const line = history.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.netWorth).toFixed(1)}`).join(' ');
  const area = `${line} L${x(history.length - 1).toFixed(1)},${(H - PAD.b).toFixed(1)} L${x(0).toFixed(1)},${(H - PAD.b).toFixed(1)} Z`;
  const up = (history[history.length - 1]?.netWorth ?? 0) >= (history[0]?.netWorth ?? 0);
  const stroke = up ? EMERALD : C.red;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 320, display: 'block' }} role="img" aria-label="Net worth over time">
        <defs>
          <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.26" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* Zero line, drawn only when the series actually crosses it — a net
            worth can legitimately be negative and the chart should show that. */}
        {min < 0 && (
          <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke={C.line2} strokeDasharray="3 3" />
        )}
        <path d={area} fill="url(#nwFill)" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
        <text x={PAD.l} y={H - 6} fill={C.faint} fontSize="10" fontFamily="monospace" textAnchor="start">
          {history[0]!.onDate}
        </text>
        <text x={W - PAD.r} y={H - 6} fill={C.faint} fontSize="10" fontFamily="monospace" textAnchor="end">
          {history[history.length - 1]!.onDate}
        </text>
      </svg>
    </div>
  );
}
