import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { C } from '../../theme/tokens';
import type { InvestmentDividends, InvestmentPortfolio, InvestmentTxKind } from '../../api/types';
import { usePortfolio } from './usePortfolio';
import {
  Card,
  Disclaimer,
  Empty,
  Money,
  ScreenHeader,
  StatTile,
  TEAL,
  TileGrid,
  dangerBtn,
  ghostBtn,
  inputStyle,
  labelStyle,
  panel,
  pct,
  primaryBtn,
} from './ui';

// Investments ▸ Dividends & Income — the income the portfolio has actually paid.
//
// The yield here is TRAILING, not forward. A forward yield needs each holding's
// declared dividend rate, and no data source available to this terminal
// publishes that for mutual funds — the bulk of a retirement account. Reporting
// what was really received is a fact; projecting it forward from nothing would
// not be, and a yield figure is exactly the kind of number someone would act on.
//
// Entries are recorded by hand for the same reason everything else here is: no
// aggregator is connected. When one is, it fills this table and nothing on the
// screen has to change.

export function InvestmentDividendsScreen() {
  const { user } = useAuth();
  const readOnly = !!user?.isDemo;
  const { portfolio } = usePortfolio();
  const [data, setData] = useState<InvestmentDividends | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    api
      .investmentDividends()
      .then((d) => alive && setData(d))
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : 'Could not load'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => load(), [load]);

  const hasAccounts = (portfolio?.accounts.length ?? 0) > 0;
  const maxMonth = Math.max(1, ...(data?.monthly ?? []).map((m) => m.amount));

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', color: C.text, animation: 'fadeIn .25s ease' }}>
      <ScreenHeader
        title="Dividends & Income"
        blurb="What your portfolio has paid you — dividends and interest, by month and by holding."
        right={
          hasAccounts &&
          !readOnly && (
            <button onClick={() => setAdding((v) => !v)} style={adding ? ghostBtn : primaryBtn}>
              {adding ? 'Cancel' : 'Record income'}
            </button>
          )
        }
      />

      {error && <div style={{ ...panel, padding: 14, marginBottom: 14, color: C.red, fontSize: 12.5 }}>{error}</div>}

      {!hasAccounts ? (
        <Empty icon="banknote" title="Add an account first">
          Dividends are recorded against an account, so add one and then log what it has paid you.
        </Empty>
      ) : (
        <>
          {adding && !readOnly && portfolio && (
            <IncomeForm
              portfolio={portfolio}
              onDone={() => {
                setAdding(false);
                load();
              }}
            />
          )}

          {loading && !data ? (
            <div style={{ padding: 24, color: C.muted, fontSize: 13 }}>Loading…</div>
          ) : !data || data.entries.length === 0 ? (
            <Empty icon="banknote" title="No income recorded yet">
              Record a dividend or interest payment and this builds a monthly history, a per-holding breakdown, and
              your trailing yield.
            </Empty>
          ) : (
            <>
              <TileGrid min={200}>
                <StatTile label="Last 12 months" sub={`${data.entries.length} payments recorded`}>
                  <Money value={data.totalLast12} />
                </StatTile>
                <StatTile label="All time">
                  <Money value={data.totalAllTime} />
                </StatTile>
                <StatTile
                  label="Trailing yield"
                  sub="last 12 months over current value"
                >
                  {data.trailingYieldPct != null ? pct(data.trailingYieldPct, 2) : <span style={{ color: C.faint }}>—</span>}
                </StatTile>
              </TileGrid>

              <Card title="By month" style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 110 }}>
                  {data.monthly.map((m) => (
                    <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 0 }}>
                      <div
                        title={`${m.month}: ${m.amount.toFixed(2)}`}
                        style={{
                          width: '100%',
                          height: `${Math.max(2, (m.amount / maxMonth) * 78)}px`,
                          background: m.amount > 0 ? TEAL : 'rgba(255,255,255,.07)',
                          borderRadius: '3px 3px 0 0',
                          transition: 'height .3s ease',
                        }}
                      />
                      <span style={{ fontSize: 9, color: C.faint, fontFamily: C.mono }}>{m.month.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {data.bySymbol.length > 0 && (
                <Card title="By holding" style={{ marginTop: 12 }}>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {data.bySymbol.slice(0, 12).map((s) => (
                      <div key={s.symbol} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <span style={{ fontSize: 12.5, color: C.muted, fontFamily: C.mono }}>{s.symbol}</span>
                        <span style={{ fontSize: 12.5, color: C.text, fontFamily: C.mono }}>
                          <Money value={s.amount} cents />
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              <Card title="Recent payments" style={{ marginTop: 12 }}>
                <div style={{ display: 'grid', gap: 8 }}>
                  {data.entries.slice(0, 25).map((e) => (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: C.faint, fontFamily: C.mono, minWidth: 82 }}>
                        {new Date(e.occurredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <span style={{ fontSize: 12.5, color: C.text, flex: 1, minWidth: 0 }}>
                        {e.symbol ?? e.accountLabel}
                        <span style={{ color: C.faint, fontSize: 11 }}> · {e.kind === 'interest' ? 'interest' : 'dividend'}</span>
                      </span>
                      <span style={{ fontSize: 12.5, color: C.green, fontFamily: C.mono }}>
                        <Money value={e.amount} cents />
                      </span>
                      {!readOnly && (
                        <button
                          onClick={async () => {
                            await api.deleteInvestmentTransaction(e.id);
                            load();
                          }}
                          style={{ ...dangerBtn, padding: '2px 7px', fontSize: 11 }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </Card>

              <div
                style={{
                  ...panel,
                  padding: '13px 15px',
                  marginTop: 12,
                  fontSize: 12,
                  color: C.muted,
                  lineHeight: 1.65,
                }}
              >
                <strong style={{ color: C.text }}>This yield looks backwards, not forwards.</strong> It is the income
                you actually received over the last twelve months, divided by what the portfolio is worth now. It is
                not a forecast of what you will be paid next year — that would need each fund's declared rate, which
                no data source here publishes.
              </div>
            </>
          )}
        </>
      )}

      <Disclaimer />
    </div>
  );
}

function IncomeForm({ portfolio, onDone }: { portfolio: InvestmentPortfolio; onDone: () => void }) {
  const [accountId, setAccountId] = useState(portfolio.accounts[0]?.id ?? '');
  const [kind, setKind] = useState<InvestmentTxKind>('dividend');
  const [symbol, setSymbol] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const holdingsInAccount = portfolio.holdings.filter((h) => h.accountId === accountId);

  async function save() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return setError('Enter an amount');
    setBusy(true);
    setError(null);
    try {
      await api.createInvestmentTransaction({
        accountId,
        kind,
        amount: amt,
        symbol: symbol.trim() || null,
        occurredAt: Date.parse(`${date}T12:00:00Z`),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Record income" style={{ marginBottom: 14 }}>
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
            <option value="dividend">Dividend</option>
            <option value="interest">Interest</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>From (optional)</label>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="VTI"
            list="inv-income-symbols"
            style={inputStyle}
          />
          <datalist id="inv-income-symbols">
            {holdingsInAccount.filter((h) => h.symbol).map((h) => (
              <option key={h.id} value={h.symbol!}>
                {h.name}
              </option>
            ))}
          </datalist>
        </div>
        <div>
          <label style={labelStyle}>Amount</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="42.50" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Paid on</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: C.faint, marginTop: 10, lineHeight: 1.55 }}>
        The ticker is kept with the payment rather than linked to the holding, so your income history still says what
        paid it after you sell the position.
      </div>
      {error && <div style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={save} disabled={busy} style={primaryBtn}>
          {busy ? 'Saving…' : 'Record it'}
        </button>
        <button onClick={onDone} style={ghostBtn}>
          Cancel
        </button>
      </div>
    </Card>
  );
}
