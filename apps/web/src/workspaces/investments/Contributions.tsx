import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { C } from '../../theme/tokens';
import type {
  InvestmentContributions,
  InvestmentGoalKind,
  InvestmentPortfolio,
  InvestmentTxKind,
} from '../../api/types';
import { usePortfolio } from './usePortfolio';
import {
  Bar,
  Card,
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
  usd,
} from './ui';

// Investments ▸ Contributions & Goals — what you have put in this year against
// the annual limits, and how your savings targets are coming along.
//
// Two things here are deliberately conservative:
//
//   • A tax year with no stored IRS figures shows NO limit rather than the
//     nearest year's. A stale cap presented as this year's is the one number on
//     this screen where being wrong has a real cost — somebody could
//     over-contribute on the strength of it.
//   • Catch-up contributions are shown as a separate line, never folded into the
//     headline number. The terminal has no birthdate, so applying an age-based
//     limit automatically would be inventing a fact about the user.

const YEAR_NOW = new Date().getFullYear();

export function InvestmentContributionsScreen() {
  const { user } = useAuth();
  const readOnly = !!user?.isDemo;
  const { portfolio } = usePortfolio();
  const [taxYear, setTaxYear] = useState(YEAR_NOW);
  const [data, setData] = useState<InvestmentContributions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addingGoal, setAddingGoal] = useState(false);

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    api
      .investmentContributions(taxYear)
      .then((d) => alive && setData(d))
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : 'Could not load'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [taxYear]);

  useEffect(() => load(), [load]);

  const years = [YEAR_NOW + 1, YEAR_NOW, YEAR_NOW - 1, YEAR_NOW - 2];
  const hasAccounts = (portfolio?.accounts.length ?? 0) > 0;

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', color: C.text, animation: 'fadeIn .25s ease' }}>
      <ScreenHeader
        title="Contributions & Goals"
        blurb="What you have paid into your retirement and education accounts this tax year, how much room is left, and how your savings targets are tracking."
        right={
          <select value={taxYear} onChange={(e) => setTaxYear(Number(e.target.value))} style={{ ...inputStyle, width: 'auto' }}>
            {years.map((y) => (
              <option key={y} value={y}>
                Tax year {y}
              </option>
            ))}
          </select>
        }
      />

      {error && <div style={{ ...panel, padding: 14, marginBottom: 14, color: C.red, fontSize: 12.5 }}>{error}</div>}

      {!hasAccounts ? (
        <Empty icon="piggy-bank" title="Add an account first">
          Contributions are recorded against an account, so add a 401(k), IRA or ESA and then log what you have paid
          in.
        </Empty>
      ) : loading && !data ? (
        <div style={{ padding: 24, color: C.muted, fontSize: 13 }}>Loading…</div>
      ) : (
        data && (
          <>
            {!data.limitsKnown && (
              <div
                style={{
                  ...panel,
                  padding: '11px 14px',
                  marginBottom: 14,
                  fontSize: 12,
                  color: C.amber,
                  lineHeight: 1.6,
                  borderLeft: `3px solid ${C.amber}`,
                }}
              >
                No IRS limits are stored for {data.taxYear} yet — the latest year this terminal knows is{' '}
                {data.latestLimitYear}. Your contributions are still totalled below, just without a cap to measure
                them against. A limit from another year is deliberately not substituted.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              {!readOnly && (
                <button onClick={() => setAdding((v) => !v)} style={adding ? ghostBtn : primaryBtn}>
                  {adding ? 'Cancel' : 'Log a contribution'}
                </button>
              )}
            </div>

            {adding && !readOnly && portfolio && (
              <ContributionForm
                portfolio={portfolio}
                taxYear={taxYear}
                onDone={() => {
                  setAdding(false);
                  load();
                }}
              />
            )}

            {data.groups.length === 0 ? (
              <Empty icon="piggy-bank" title={`Nothing logged for ${data.taxYear}`}>
                Log a contribution and it will be scored against that account type's annual limit.
              </Empty>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {data.groups.map((g) => (
                  <Card key={g.group}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{g.label}</div>
                        {g.limitNote && (
                          <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>{g.limitNote}</div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 16, fontWeight: 700, fontFamily: C.mono, color: C.text }}>
                          <Money value={g.contributed} />
                          {g.limit != null && (
                            <span style={{ color: C.faint, fontWeight: 400, fontSize: 13 }}> / {usd(g.limit)}</span>
                          )}
                        </div>
                        {g.remaining != null && (
                          <div style={{ fontSize: 11, color: g.remaining > 0 ? C.muted : C.amber, marginTop: 3, fontFamily: C.mono }}>
                            {g.remaining > 0 ? `${usd(g.remaining)} of room left` : 'at the limit'}
                          </div>
                        )}
                      </div>
                    </div>

                    {g.pct != null && <Bar pct={g.pct} color={g.pct >= 100 ? C.amber : TEAL} />}

                    <div style={{ display: 'flex', gap: 16, marginTop: 11, flexWrap: 'wrap' }}>
                      {g.employerMatch > 0 && (
                        <span style={{ fontSize: 11.5, color: C.muted }}>
                          Employer match <Money value={g.employerMatch} /> — does not count against your own limit
                        </span>
                      )}
                      {g.catchUp != null && g.catchUpFromAge != null && (
                        <span style={{ fontSize: 11.5, color: C.faint }}>
                          {/* The age is NOT always 50 — an HSA's extra $1,000
                              starts at 55, and saying "50+" beside it hands a
                              52-year-old room they do not have. */}
                          Age {g.catchUpFromAge}+ may add a further {usd(g.catchUp)}
                          {g.catchUp60to63 != null && (
                            <>
                              {' · '}
                              {usd(g.catchUp60to63)} instead at ages 60–63
                            </>
                          )}
                        </span>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {data.uncappedContributed > 0 && (
              <div style={{ ...panel, padding: '11px 14px', marginTop: 12, fontSize: 12, color: C.muted }}>
                A further <Money value={data.uncappedContributed} /> went into accounts with no federal annual cap
                (a taxable brokerage, a 529).
              </div>
            )}

            <div style={{ marginTop: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#fff' }}>Goals</h3>
                {!readOnly && (
                  <button onClick={() => setAddingGoal((v) => !v)} style={addingGoal ? ghostBtn : { ...ghostBtn, color: TEAL, borderColor: `${TEAL}55` }}>
                    {addingGoal ? 'Cancel' : 'Add a goal'}
                  </button>
                )}
              </div>

              {addingGoal && !readOnly && portfolio && (
                <GoalForm
                  portfolio={portfolio}
                  onDone={() => {
                    setAddingGoal(false);
                    load();
                  }}
                />
              )}

              {data.goals.length === 0 ? (
                <div style={{ ...panel, padding: 16, fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
                  No goals set. A goal is a target amount — for retirement, a child's education, or anything else —
                  tracked against one account or the whole portfolio.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {data.goals.map((g) => (
                    <GoalRow key={g.id} goal={g} readOnly={readOnly} onChanged={load} />
                  ))}
                </div>
              )}
            </div>

            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 18, lineHeight: 1.65, fontFamily: C.mono }}>
              Annual limits are the published IRS figures for the tax year shown, stored in this terminal and
              checked by hand each year. Check them against irs.gov before you rely on one — your own cap can
              differ from the published figure: income phase-outs on a Roth IRA, a plan that sets a lower ceiling,
              a SIMPLE plan at a small employer that allows a higher one, and whether you are eligible for a
              catch-up at all. The ages 60–63 amount replaces the ordinary catch-up rather than adding to it, and
              your plan does not have to offer it.
            </div>
          </>
        )
      )}

      <Disclaimer />
    </div>
  );
}

function GoalRow({
  goal,
  readOnly,
  onChanged,
}: {
  goal: InvestmentContributions['goals'][number];
  readOnly: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ ...panel, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 9 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{goal.label}</div>
          <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>
            {goal.accountLabel ?? 'Whole portfolio'}
            {goal.targetDate ? ` · by ${goal.targetDate}` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: C.mono }}>
            <Money value={goal.current} />
            <span style={{ color: C.faint, fontWeight: 400, fontSize: 12 }}> / {usd(goal.targetAmount)}</span>
          </div>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: C.mono, marginTop: 3 }}>
            {goal.pct.toFixed(0)}% there
          </div>
        </div>
      </div>
      <Bar pct={goal.pct} />
      {!readOnly && (
        <button
          onClick={async () => {
            setBusy(true);
            try {
              await api.deleteInvestmentGoal(goal.id);
              onChanged();
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          style={{ ...dangerBtn, padding: '4px 9px', fontSize: 11, marginTop: 11 }}
        >
          {busy ? '…' : 'Remove goal'}
        </button>
      )}
    </div>
  );
}

function ContributionForm({
  portfolio,
  taxYear,
  onDone,
}: {
  portfolio: InvestmentPortfolio;
  taxYear: number;
  onDone: () => void;
}) {
  const [accountId, setAccountId] = useState(portfolio.accounts[0]?.id ?? '');
  const [kind, setKind] = useState<InvestmentTxKind>('contribution');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [year, setYear] = useState(String(taxYear));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return setError('Enter an amount');
    if (!accountId) return setError('Pick an account');
    setBusy(true);
    setError(null);
    try {
      await api.createInvestmentTransaction({
        accountId,
        kind,
        amount: amt,
        occurredAt: Date.parse(`${date}T12:00:00Z`),
        taxYear: Number(year),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Log a contribution" style={{ marginBottom: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        <div>
          <label style={labelStyle}>Account</label>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={inputStyle}>
            {portfolio.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Kind</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as InvestmentTxKind)} style={inputStyle}>
            <option value="contribution">Your contribution</option>
            <option value="employer_match">Employer match</option>
            <option value="withdrawal">Withdrawal</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Amount</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="500" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Counts toward</label>
          <select value={year} onChange={(e) => setYear(e.target.value)} style={inputStyle}>
            {[YEAR_NOW, YEAR_NOW - 1].map((y) => (
              <option key={y} value={y}>
                Tax year {y}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: C.faint, marginTop: 10, lineHeight: 1.55 }}>
        A contribution made early in the year can be designated to the previous tax year — that is why the year is
        set separately from the date.
      </div>
      {error && <div style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={save} disabled={busy} style={primaryBtn}>
          {busy ? 'Saving…' : 'Log it'}
        </button>
        <button onClick={onDone} style={ghostBtn}>
          Cancel
        </button>
      </div>
    </Card>
  );
}

function GoalForm({ portfolio, onDone }: { portfolio: InvestmentPortfolio; onDone: () => void }) {
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<InvestmentGoalKind>('retirement');
  const [target, setTarget] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [accountId, setAccountId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const amt = Number(target);
    if (!label.trim()) return setError('Give the goal a name');
    if (!Number.isFinite(amt) || amt <= 0) return setError('Enter a target amount');
    setBusy(true);
    setError(null);
    try {
      await api.createInvestmentGoal({
        label: label.trim(),
        kind,
        targetAmount: amt,
        targetDate: targetDate || null,
        accountId: accountId || null,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that goal');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="New goal" style={{ marginBottom: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        <div>
          <label style={labelStyle}>Name</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Retirement at 60" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Kind</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as InvestmentGoalKind)} style={inputStyle}>
            <option value="retirement">Retirement</option>
            <option value="education">Education</option>
            <option value="general">General</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Target amount</label>
          <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" placeholder="1000000" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>By (optional)</label>
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Tracks</label>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={inputStyle}>
            <option value="">The whole portfolio</option>
            {portfolio.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <div style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={save} disabled={busy} style={primaryBtn}>
          {busy ? 'Saving…' : 'Add goal'}
        </button>
        <button onClick={onDone} style={ghostBtn}>
          Cancel
        </button>
      </div>
    </Card>
  );
}
