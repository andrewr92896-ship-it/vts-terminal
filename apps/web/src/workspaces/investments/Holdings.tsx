import { useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { C } from '../../theme/tokens';
import { useResponsive } from '../../hooks/useMediaQuery';
import type { InvestmentAssetClass, InvestmentHolding } from '../../api/types';
import { usePortfolio, publishPortfolio } from './usePortfolio';
import {
  ASSET_CLASS_LABEL,
  Card,
  Delta,
  Disclaimer,
  Empty,
  Money,
  PriceSourceTag,
  ScreenHeader,
  UnpricedNote,
  dangerBtn,
  ghostBtn,
  inputStyle,
  labelStyle,
  panel,
  primaryBtn,
  units,
  usd,
} from './ui';

// Investments ▸ Holdings — every security you own across all accounts, with what
// it cost, what it is worth, and where that price came from.
//
// The price provenance is the part that matters. A 401(k) full of collective
// trusts has no live quotes available anywhere, so most rows will be priced off
// a figure the owner typed. That is fine — but it must be visible, which is why
// every row carries a source tag and unpriced holdings are called out rather
// than being quietly worth zero.

const CLASS_ORDER: InvestmentAssetClass[] = [
  'us_stock',
  'intl_stock',
  'bond',
  'target_date',
  'real_estate',
  'commodity',
  'crypto',
  'cash',
  'other',
];

type SortKey = 'value' | 'name' | 'gain' | 'weight';

export function InvestmentHoldings() {
  const { user } = useAuth();
  const readOnly = !!user?.isDemo;
  const { portfolio, loading, error } = usePortfolio();
  const { isPhone } = useResponsive();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<InvestmentHolding | null>(null);
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('value');
  const [onlyUnpriced, setOnlyUnpriced] = useState(false);

  const accounts = portfolio?.accounts ?? [];
  const total = portfolio?.totals.value ?? 0;

  const rows = useMemo(() => {
    let list = portfolio?.holdings ?? [];
    if (accountFilter !== 'all') list = list.filter((h) => h.accountId === accountFilter);
    if (onlyUnpriced) list = list.filter((h) => h.value == null);
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'gain') return (b.gain ?? -Infinity) - (a.gain ?? -Infinity);
      return (b.value ?? -Infinity) - (a.value ?? -Infinity);
    });
  }, [portfolio, accountFilter, sort, onlyUnpriced]);

  const canAdd = accounts.length > 0 && !readOnly;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', color: C.text, animation: 'fadeIn .25s ease' }}>
      <ScreenHeader
        title="Holdings"
        blurb="Everything you own across every account, with cost basis, gain or loss, and each position's weight in the portfolio."
        right={
          canAdd && (
            <button onClick={() => { setEditing(null); setAdding((v) => !v); }} style={adding ? ghostBtn : primaryBtn}>
              {adding ? 'Cancel' : 'Add a holding'}
            </button>
          )
        }
      />

      {error && <div style={{ ...panel, padding: 14, marginBottom: 14, color: C.red, fontSize: 12.5 }}>{error}</div>}

      {(adding || editing) && !readOnly && (
        <HoldingForm
          existing={editing}
          accounts={accounts.map((a) => ({ id: a.id, label: a.label }))}
          onDone={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}

      {portfolio && <UnpricedNote count={portfolio.totals.unpricedCount} onFix={() => setOnlyUnpriced(true)} />}

      {accounts.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
            <option value="all">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} style={{ ...inputStyle, width: 'auto' }}>
            <option value="value">Sort by value</option>
            <option value="gain">Sort by gain</option>
            <option value="name">Sort by name</option>
          </select>
          {onlyUnpriced && (
            <button onClick={() => setOnlyUnpriced(false)} style={{ ...ghostBtn, padding: '6px 10px', fontSize: 11.5 }}>
              Showing unpriced only — clear
            </button>
          )}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div style={{ padding: 24, color: C.muted, fontSize: 13 }}>Loading…</div>
      ) : accounts.length === 0 ? (
        <Empty icon="building-2" title="Add an account first">
          Holdings live inside an account. Add a 401(k), IRA or brokerage account on the Accounts screen, then
          come back and add what it holds.
        </Empty>
      ) : rows.length === 0 ? (
        <Empty icon="layers" title={onlyUnpriced ? 'Everything has a price' : 'No holdings yet'}>
          {onlyUnpriced
            ? 'Every holding in this view has either a live quote or a price you entered.'
            : 'Add a fund, ETF or share and it will show up here with its value and weight.'}
        </Empty>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((h) => (
            <HoldingRow
              key={h.id}
              holding={h}
              total={total}
              compact={isPhone}
              readOnly={readOnly}
              onEdit={() => {
                setAdding(false);
                setEditing(h);
              }}
            />
          ))}
        </div>
      )}

      <Disclaimer />
    </div>
  );
}

function HoldingRow({
  holding: h,
  total,
  compact,
  readOnly,
  onEdit,
}: {
  holding: InvestmentHolding;
  total: number;
  compact: boolean;
  readOnly: boolean;
  onEdit: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const weight = h.value != null && total > 0 ? (h.value / total) * 100 : null;

  async function remove() {
    setBusy(true);
    try {
      const { portfolio } = await api.deleteInvestmentHolding(h.id);
      publishPortfolio(portfolio);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div style={{ ...panel, padding: 13 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? '1fr' : 'minmax(180px,2fr) repeat(3, minmax(90px,1fr)) auto',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            {h.symbol && (
              <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: C.mono, color: C.text }}>{h.symbol}</span>
            )}
            <span style={{ fontSize: 13, color: h.symbol ? C.muted : C.text, fontWeight: h.symbol ? 400 : 600 }}>
              {h.name}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, color: C.faint, fontFamily: C.mono }}>
              {ASSET_CLASS_LABEL[h.assetClass]} · {h.accountLabel}
            </span>
            <PriceSourceTag source={h.priceSource} at={h.manualPriceAt} />
          </div>
        </div>

        <div style={{ textAlign: compact ? 'left' : 'right' }}>
          <div style={{ fontSize: 12.5, fontFamily: C.mono, color: C.text }}>{units(h.quantity)}</div>
          <div style={{ fontSize: 10, color: C.faint, fontFamily: C.mono, marginTop: 3 }}>
            {h.price != null ? `at ${usd(h.price, { cents: true })}` : 'no price'}
          </div>
        </div>

        <div style={{ textAlign: compact ? 'left' : 'right' }}>
          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: C.mono, color: h.value == null ? C.faint : C.text }}>
            <Money value={h.value} />
          </div>
          <div style={{ fontSize: 10, color: C.faint, fontFamily: C.mono, marginTop: 3 }}>
            {weight != null ? `${weight.toFixed(1)}% of portfolio` : '—'}
          </div>
        </div>

        <div style={{ textAlign: compact ? 'left' : 'right' }}>
          <Delta value={h.gain} percent={h.gainPct} />
          <div style={{ fontSize: 10, color: C.faint, fontFamily: C.mono, marginTop: 3 }}>
            {h.costBasis != null ? `cost ${usd(h.costBasis)}` : 'no cost basis'}
          </div>
        </div>

        {!readOnly && (
          <div style={{ display: 'flex', gap: 6, justifyContent: compact ? 'flex-start' : 'flex-end' }}>
            {confirming ? (
              <>
                <button onClick={remove} disabled={busy} style={{ ...dangerBtn, padding: '4px 9px', fontSize: 11 }}>
                  {busy ? '…' : 'Remove'}
                </button>
                <button onClick={() => setConfirming(false)} style={{ ...ghostBtn, padding: '4px 9px', fontSize: 11 }}>
                  Keep
                </button>
              </>
            ) : (
              <>
                <button onClick={onEdit} style={{ ...ghostBtn, padding: '4px 9px', fontSize: 11 }}>
                  Edit
                </button>
                <button onClick={() => setConfirming(true)} style={{ ...ghostBtn, padding: '4px 9px', fontSize: 11 }}>
                  ×
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function HoldingForm({
  existing,
  accounts,
  onDone,
}: {
  existing: InvestmentHolding | null;
  accounts: { id: string; label: string }[];
  onDone: () => void;
}) {
  const [accountId, setAccountId] = useState(existing?.accountId ?? accounts[0]?.id ?? '');
  const [symbol, setSymbol] = useState(existing?.symbol ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [assetClass, setAssetClass] = useState<InvestmentAssetClass>(existing?.assetClass ?? 'us_stock');
  const [quantity, setQuantity] = useState(existing ? String(existing.quantity) : '');
  const [costBasis, setCostBasis] = useState(existing?.costBasis != null ? String(existing.costBasis) : '');
  const [manualPrice, setManualPrice] = useState(existing?.manualPrice != null ? String(existing.manualPrice) : '');
  const [sector, setSector] = useState(existing?.sector ?? '');
  const [region, setRegion] = useState(existing?.region ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = (s: string): number | null => {
    const t = s.trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  async function save() {
    if (!name.trim()) return setError('Give the holding a name');
    const q = num(quantity);
    if (q == null || q < 0) return setError('Enter how many shares or units you hold');
    if (!accountId) return setError('Pick an account');

    setBusy(true);
    setError(null);
    try {
      const body = {
        accountId,
        symbol: symbol.trim() || null,
        name: name.trim(),
        assetClass,
        quantity: q,
        costBasis: num(costBasis),
        manualPrice: num(manualPrice),
        sector: sector.trim() || null,
        region: region.trim() || null,
      };
      const res = existing
        ? await api.updateInvestmentHolding(existing.id, body)
        : await api.createInvestmentHolding(body);
      publishPortfolio(res.portfolio);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that holding');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={existing ? 'Edit holding' : 'New holding'} style={{ marginBottom: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(165px,1fr))', gap: 12 }}>
        <div>
          <label style={labelStyle}>Account</label>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={inputStyle}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vanguard Target 2055" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Ticker (optional)</label>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="VTI"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Type</label>
          <select value={assetClass} onChange={(e) => setAssetClass(e.target.value as InvestmentAssetClass)} style={inputStyle}>
            {CLASS_ORDER.map((c) => (
              <option key={c} value={c}>
                {ASSET_CLASS_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Shares / units</label>
          <input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" placeholder="12.345" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Total cost basis</label>
          <input value={costBasis} onChange={(e) => setCostBasis(e.target.value)} inputMode="decimal" placeholder="What you paid in total" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Price per share</label>
          <input value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} inputMode="decimal" placeholder="Used when no live quote" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Sector (optional)</label>
          <input value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Technology" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Region (optional)</label>
          <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="US" style={inputStyle} />
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: C.faint, marginTop: 11, lineHeight: 1.6 }}>
        A ticker gets a live price where one is available — crypto always, shares and ETFs when a market-data key
        is configured. Mutual funds and 401(k) collective trusts have no free price source, so enter the price per
        share yourself and it will be stamped with today's date.
      </div>

      {error && <div style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={save} disabled={busy} style={primaryBtn}>
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Add holding'}
        </button>
        <button onClick={onDone} style={ghostBtn}>
          Cancel
        </button>
      </div>
    </Card>
  );
}
