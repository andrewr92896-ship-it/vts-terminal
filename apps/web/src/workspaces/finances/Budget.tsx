import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import type { BudgetCategory, BudgetMonth } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Icon } from '../../components/Icon';

// Finances ▸ Budget — what you earn, what you spend, by month.
//
// Written for somebody who is not a trader. That drives most of what is here:
// plain words over jargon, one number at the top that answers "am I ahead or
// behind this month", and a form that takes an amount and a category and nothing
// else. Everything optional stays out of the way until it is asked for.
//
// TWO THINGS IT DELIBERATELY DOES NOT DO:
//
//   • It never tells anyone what to do with their money. No "you are
//     overspending on dining", no suggested budgets, no advice of any kind —
//     that is the same line the rest of the terminal holds, and a budgeting
//     screen is the easiest place in a finance app to cross it by accident.
//     It states what is true and stops.
//   • It never guesses a number. A month with no targets set shows what was
//     spent rather than progress bars against a plan that does not exist, which
//     is what `hasTargets` on the payload is for.
//
// Amounts are CENTS on the wire and dollars in the form. `money()` is the only
// place cents become a string.

function money(cents: number, opts: { sign?: boolean } = {}): string {
  const v = Math.abs(cents) / 100;
  const s = v.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
  if (!opts.sign) return s;
  return cents < 0 ? `−${s}` : s;
}

function monthLabel(month: string): string {
  // Parsed as UTC and formatted in UTC — a month key is a label, not an instant,
  // and letting it drift through a local zone can render "2026-01" as December.
  const d = new Date(`${month}-01T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function shiftMonth(month: string, by: number): string {
  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7)) - 1 + by;
  const y = year + Math.floor(mon / 12);
  const m = ((mon % 12) + 12) % 12;
  return `${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}`;
}

export function BudgetScreen(_props: { onNavigate?: (screen: string) => void }) {
  const { user } = useAuth();
  const readOnly = !!user?.isDemo;
  const [month, setMonth] = useState<string>(() =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
    }).format(new Date()),
  );
  const [data, setData] = useState<BudgetMonth | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);

  const load = useCallback(
    (m: string) => {
      setError('');
      return api
        .budgetMonth(m)
        .then(setData)
        .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load your budget'));
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    setData(null);
    api
      .budgetMonth(month)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e instanceof ApiError ? e.message : 'Could not load your budget');
      });
    return () => {
      alive = false;
    };
  }, [month]);

  // Every write answers with the whole month, so the screen adopts the server's
  // view wholesale rather than merging a partial response into local state.
  // There is then no way for the two to disagree.
  async function run(fn: () => Promise<BudgetMonth>) {
    setBusy(true);
    setError('');
    try {
      setData(await fn());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not save');
    } finally {
      setBusy(false);
    }
  }

  const income = useMemo(() => (data?.categories ?? []).filter((c) => c.kind === 'income'), [data]);
  const expenses = useMemo(
    () => (data?.categories ?? []).filter((c) => c.kind === 'expense'),
    [data],
  );

  const empty = data != null && data.categories.length === 0;

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 20px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 19, color: '#eef3ff' }}>Budget</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} style={navBtn} aria-label="Previous month">
            <Icon name="chevron-right" size={13} color="#8298c4" />
          </button>
          <span style={{ fontSize: 13, color: '#cfe0ff', minWidth: 130, textAlign: 'center' }}>
            {monthLabel(month)}
          </span>
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} style={navBtn} aria-label="Next month">
            <Icon name="chevron-right" size={13} color="#8298c4" />
          </button>
        </div>
      </div>
      <p style={{ margin: '0 0 18px', fontSize: 12.5, color: '#8298c4' }}>
        What came in and what went out, entered by you.
      </p>

      {error && <div style={errBox}>{error}</div>}

      {data == null && !error ? (
        <div style={{ color: '#8298c4', fontSize: 13 }}>Loading…</div>
      ) : empty ? (
        <EmptyState onAdd={() => setShowAddCategory(true)} readOnly={readOnly} />
      ) : data ? (
        <>
          <Summary data={data} />

          <Group
            title="Money in"
            categories={income}
            data={data}
            readOnly={readOnly}
            busy={busy}
            onRun={run}
          />
          <Group
            title="Money out"
            categories={expenses}
            data={data}
            readOnly={readOnly}
            busy={busy}
            onRun={run}
          />

          {!readOnly && (
            <button type="button" onClick={() => setShowAddCategory(true)} style={{ ...ghost, marginTop: 4 }}>
              + Add a category
            </button>
          )}

          {data.entries.length > 0 && <RecentEntries data={data} month={month} readOnly={readOnly} onRun={run} />}
        </>
      ) : null}

      {showAddCategory && (
        <AddCategory
          onClose={() => setShowAddCategory(false)}
          onSaved={(d) => {
            setData(d);
            setShowAddCategory(false);
            void load(month);
          }}
        />
      )}

      <p style={footNote}>
        Figures are what you entered — nothing here is connected to a bank or
        verified. Informational only, not financial advice.
      </p>
    </div>
  );
}

// The one number the screen exists to show, plus what makes it up.
function Summary({ data }: { data: BudgetMonth }) {
  const ahead = data.netCents >= 0;
  return (
    <div style={{ ...panel, marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: '#7488b5', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {ahead ? 'Left over this month' : 'Over this month'}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: ahead ? '#8fe3c0' : '#FFB4A2', marginTop: 4 }}>
        {money(data.netCents, { sign: true })}
      </div>
      <div style={{ display: 'flex', gap: 22, marginTop: 12, flexWrap: 'wrap' }}>
        <Stat label="In" value={money(data.incomeCents)} />
        <Stat label="Out" value={money(data.spentCents)} />
        {data.hasTargets && <Stat label="Planned to spend" value={money(data.plannedSpendCents)} />}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: '#7488b5', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 15, color: '#eef3ff', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Group({
  title,
  categories,
  data,
  readOnly,
  busy,
  onRun,
}: {
  title: string;
  categories: BudgetCategory[];
  data: BudgetMonth;
  readOnly: boolean;
  busy: boolean;
  onRun: (fn: () => Promise<BudgetMonth>) => Promise<void>;
}) {
  if (categories.length === 0) return null;
  return (
    <div style={{ ...panel, marginBottom: 16 }}>
      <div style={panelLabel}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {categories.map((c) => (
          <CategoryRow
            key={c.id}
            c={c}
            hasTargets={data.hasTargets}
            readOnly={readOnly}
            busy={busy}
            onRun={onRun}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryRow({
  c,
  hasTargets,
  readOnly,
  busy,
  onRun,
}: {
  c: BudgetCategory;
  hasTargets: boolean;
  readOnly: boolean;
  busy: boolean;
  onRun: (fn: () => Promise<BudgetMonth>) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  // A bar is drawn only when there is a target to draw it against. Without one
  // it would sit permanently at 0% or 100%, which says nothing and looks broken.
  const showBar = c.kind === 'expense' && c.monthlyLimit != null && c.monthlyLimit > 0;
  const pct = showBar ? Math.min(100, (c.actualCents / c.monthlyLimit!) * 100) : 0;
  const over = showBar && c.actualCents > c.monthlyLimit!;

  async function submit() {
    const v = Number(amount);
    if (!Number.isFinite(v) || v <= 0) return;
    await onRun(() =>
      api.addBudgetEntry({ categoryId: c.id, amount: v, note: note.trim() || null }),
    );
    setAmount('');
    setNote('');
    setAdding(false);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, color: '#eef3ff', fontWeight: 600 }}>{c.name}</span>
        {c.archived && <span style={tag}>archived</span>}
        <span style={{ marginLeft: 'auto', fontSize: 13.5, color: over ? '#FFB4A2' : '#cfe0ff' }}>
          {money(c.actualCents)}
          {c.monthlyLimit != null && (
            <span style={{ color: '#7488b5', fontSize: 11.5 }}> of {money(c.monthlyLimit)}</span>
          )}
        </span>
      </div>

      {showBar && (
        <div style={barTrack}>
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              borderRadius: 999,
              background: over ? '#E0708F' : '#4ADE80',
            }}
          />
        </div>
      )}

      {!showBar && hasTargets && c.kind === 'expense' && (
        <div style={{ fontSize: 11, color: '#7488b5', marginTop: 3 }}>No monthly target set</div>
      )}

      {!readOnly && (
        <div style={{ marginTop: 6 }}>
          {adding ? (
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit();
                  if (e.key === 'Escape') setAdding(false);
                }}
                placeholder="0.00"
                inputMode="decimal"
                autoFocus
                style={{ ...input, width: 100 }}
              />
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit();
                  if (e.key === 'Escape') setAdding(false);
                }}
                placeholder="Note (optional)"
                style={{ ...input, flex: '1 1 160px' }}
              />
              <button type="button" onClick={() => void submit()} disabled={busy} style={primary}>
                Add
              </button>
              <button type="button" onClick={() => setAdding(false)} style={ghost}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setAdding(true)} style={miniBtn}>
              + Record {c.kind === 'income' ? 'income' : 'a spend'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RecentEntries({
  data,
  month,
  readOnly,
  onRun,
}: {
  data: BudgetMonth;
  month: string;
  readOnly: boolean;
  onRun: (fn: () => Promise<BudgetMonth>) => Promise<void>;
}) {
  const rows = useMemo(
    () => [...data.entries].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn)).slice(0, 40),
    [data.entries],
  );
  return (
    <div style={{ ...panel, marginTop: 16 }}>
      <div style={panelLabel}>This month’s entries</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((e) => (
          <div key={e.id} style={entryRow}>
            <span style={{ fontSize: 11.5, color: '#7488b5', minWidth: 84 }}>{e.occurredOn}</span>
            <span style={{ fontSize: 12.5, color: '#eef3ff' }}>{e.categoryName}</span>
            {e.note && <span style={{ fontSize: 11.5, color: '#8298c4' }}>{e.note}</span>}
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 12.5,
                color: e.kind === 'income' ? '#8fe3c0' : '#cfe0ff',
              }}
            >
              {e.kind === 'income' ? '+' : '−'}
              {money(e.amountCents)}
            </span>
            {!readOnly && (
              <button
                type="button"
                onClick={() => void onRun(() => api.removeBudgetEntry(e.id, month))}
                style={{ ...miniBtn, color: '#ffb4ab' }}
                aria-label="Remove entry"
              >
                <Icon name="trash-2" size={11} color="#ffb4ab" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ onAdd, readOnly }: { onAdd: () => void; readOnly: boolean }) {
  return (
    <div style={{ ...panel, textAlign: 'center', padding: '30px 22px' }}>
      <Icon name="piggy-bank" size={26} color="#4ADE80" />
      <div style={{ fontSize: 15, color: '#eef3ff', marginTop: 10, fontWeight: 600 }}>
        Start with a category
      </div>
      <p style={{ margin: '8px auto 16px', fontSize: 12.5, color: '#8298c4', maxWidth: 400, lineHeight: 1.6 }}>
        Add what money comes in from and what it goes out on — pay, rent, food.
        Record amounts against them as the month goes.
      </p>
      {!readOnly && (
        <button type="button" onClick={onAdd} style={primary}>
          Add a category
        </button>
      )}
    </div>
  );
}

function AddCategory({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (d: BudgetMonth) => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'income' | 'expense'>('expense');
  const [limit, setLimit] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const parsedLimit = limit.trim() === '' ? null : Number(limit);
      if (parsedLimit != null && (!Number.isFinite(parsedLimit) || parsedLimit < 0)) {
        setError('That monthly amount is not a number');
        return;
      }
      onSaved(
        await api.addBudgetCategory({ name: name.trim(), kind, monthlyLimit: parsedLimit }),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add that');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={modalWrap} onClick={onClose}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#eef3ff', marginBottom: 12 }}>
          New category
        </div>

        <div style={{ display: 'flex', gap: 7, marginBottom: 12 }}>
          {(['expense', 'income'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              style={{
                ...ghost,
                borderColor: kind === k ? '#4ADE80' : '#2c4b7d',
                color: kind === k ? '#8fe3c0' : '#cfe0ff',
              }}
            >
              {k === 'expense' ? 'Money out' : 'Money in'}
            </button>
          ))}
        </div>

        <label style={label}>Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 60))}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
          placeholder={kind === 'expense' ? 'Groceries' : 'Pay'}
          autoFocus
          style={{ ...input, width: '100%', marginBottom: 12 }}
        />

        <label style={label}>
          {kind === 'expense' ? 'Monthly target (optional)' : 'Expected each month (optional)'}
        </label>
        <input
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
          placeholder="0.00"
          inputMode="decimal"
          style={{ ...input, width: '100%' }}
        />

        {error && <div style={{ fontSize: 12, color: '#ffb4ab', marginTop: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => void save()} disabled={busy} style={primary}>
            {busy ? 'Saving…' : 'Add category'}
          </button>
          <button type="button" onClick={onClose} style={ghost}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

const panel: CSSProperties = {
  border: '1px solid #1d3560',
  background: 'rgba(11,26,58,.5)',
  borderRadius: 12,
  padding: '15px 18px',
};
const panelLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  color: '#7488b5',
  marginBottom: 12,
};
const barTrack: CSSProperties = {
  height: 6,
  borderRadius: 999,
  background: 'rgba(255,255,255,.07)',
  marginTop: 7,
  overflow: 'hidden',
};
const entryRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '7px 0',
  borderBottom: '1px solid rgba(29,53,96,.6)',
  flexWrap: 'wrap',
};
const input: CSSProperties = {
  background: 'rgba(3,8,20,.5)',
  border: '1px solid #2c4b7d',
  borderRadius: 8,
  color: '#eef3ff',
  fontSize: 13,
  padding: '7px 10px',
};
const label: CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  color: '#7488b5',
  marginBottom: 5,
};
const primary: CSSProperties = {
  background: 'linear-gradient(180deg,#4ADE80,#22C55E)',
  border: 'none',
  borderRadius: 8,
  color: '#04210f',
  fontSize: 12.5,
  fontWeight: 700,
  padding: '8px 14px',
  cursor: 'pointer',
};
const ghost: CSSProperties = {
  background: 'transparent',
  border: '1px solid #2c4b7d',
  borderRadius: 8,
  color: '#cfe0ff',
  fontSize: 12.5,
  padding: '8px 14px',
  cursor: 'pointer',
};
const miniBtn: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#8298c4',
  fontSize: 11.5,
  padding: '2px 0',
  cursor: 'pointer',
};
const navBtn: CSSProperties = {
  background: 'transparent',
  border: '1px solid #1d3560',
  borderRadius: 7,
  padding: '4px 7px',
  cursor: 'pointer',
  display: 'inline-flex',
};
const tag: CSSProperties = {
  fontSize: 10,
  color: '#7488b5',
  border: '1px solid #1d3560',
  borderRadius: 999,
  padding: '1px 7px',
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
const footNote: CSSProperties = {
  marginTop: 26,
  paddingTop: 14,
  borderTop: '1px solid #1d3560',
  fontSize: 10.5,
  lineHeight: 1.6,
  color: '#7488b5',
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
  width: 'min(440px, 100%)',
  background: '#0C1C3C',
  border: '1px solid #1d3560',
  borderRadius: 12,
  padding: '20px 22px',
  boxShadow: '0 24px 60px rgba(0,0,0,.55)',
};
