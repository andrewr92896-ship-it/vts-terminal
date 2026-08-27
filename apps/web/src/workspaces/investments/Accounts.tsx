import { useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { C } from '../../theme/tokens';
import { Icon } from '../../components/Icon';
import type { InvestmentAccount, InvestmentAccountKind } from '../../api/types';
import { usePortfolio, publishPortfolio } from './usePortfolio';
import {
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
  primaryBtn,
  panel,
} from './ui';

// Investments ▸ Accounts — where the tracker gets its data.
//
// Today every account is entered by hand. The designed path is a READ-ONLY
// aggregator (Plaid / SnapTrade), and the reason it is not here yet is not
// oversight: it needs a paid provider account and, for Plaid, a production
// access request. The card at the bottom says so plainly rather than showing a
// dead "Connect" button that would imply the feature exists.
//
// Nothing on this screen can ever hold a credential — see the migration notes.

const KIND_LABELS: Record<InvestmentAccountKind, string> = {
  '401k': '401(k)',
  roth_401k: 'Roth 401(k)',
  '403b': '403(b)',
  ira: 'Traditional IRA',
  roth_ira: 'Roth IRA',
  sep_ira: 'SEP IRA',
  simple_ira: 'SIMPLE IRA',
  hsa: 'HSA',
  esa: 'Coverdell ESA',
  '529': '529 plan',
  brokerage: 'Taxable brokerage',
  other: 'Other',
};

const KIND_ORDER: InvestmentAccountKind[] = [
  '401k',
  'roth_401k',
  '403b',
  'ira',
  'roth_ira',
  'sep_ira',
  'simple_ira',
  'hsa',
  'esa',
  '529',
  'brokerage',
  'other',
];

export function InvestmentAccounts({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  const { user } = useAuth();
  const readOnly = !!user?.isDemo;
  const { portfolio, loading, error } = usePortfolio();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<InvestmentAccount | null>(null);

  const accounts = portfolio?.accounts ?? [];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', color: C.text, animation: 'fadeIn .25s ease' }}>
      <ScreenHeader
        title="Accounts"
        blurb="Every account you track — 401(k), IRA, ESA, HSA, brokerage. Add each one with the cash sitting in it, then add its holdings. Balances and positions only; this never has trade access to anything."
        right={
          !readOnly && (
            <button onClick={() => { setEditing(null); setAdding((v) => !v); }} style={adding ? ghostBtn : primaryBtn}>
              {adding ? 'Cancel' : 'Add an account'}
            </button>
          )
        }
      />

      {error && (
        <div style={{ ...panel, padding: 14, marginBottom: 14, color: C.red, fontSize: 12.5 }}>{error}</div>
      )}

      {(adding || editing) && !readOnly && (
        <AccountForm
          existing={editing}
          onDone={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}

      {loading && accounts.length === 0 ? (
        <div style={{ padding: 24, color: C.muted, fontSize: 13 }}>Loading…</div>
      ) : accounts.length === 0 ? (
        <Empty icon="building-2" title="No accounts yet">
          Add your first account — a 401(k), an IRA, a brokerage — and then add what it holds. Everything
          else in Investments is built from what you enter here.
        </Empty>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {accounts.map((a) => (
            <AccountRow
              key={a.id}
              account={a}
              readOnly={readOnly}
              onEdit={() => {
                setAdding(false);
                setEditing(a);
              }}
              onOpenHoldings={() => onNavigate?.('inv_holdings')}
            />
          ))}
        </div>
      )}

      <ConnectionNote />
      <Disclaimer />
    </div>
  );
}

function AccountRow({
  account,
  readOnly,
  onEdit,
  onOpenHoldings,
}: {
  account: InvestmentAccount;
  readOnly: boolean;
  onEdit: () => void;
  onOpenHoldings: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      const { portfolio } = await api.deleteInvestmentAccount(account.id);
      publishPortfolio(portfolio);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div style={{ ...panel, padding: 14, opacity: account.active ? 1 : 0.55 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{account.label}</span>
            <span
              style={{
                fontSize: 10,
                fontFamily: C.mono,
                color: TEAL,
                border: `1px solid ${TEAL}55`,
                borderRadius: 5,
                padding: '2px 6px',
              }}
            >
              {KIND_LABELS[account.kind]}
            </span>
            {!account.active && (
              <span style={{ fontSize: 10.5, color: C.faint, fontFamily: C.mono }}>hidden from totals</span>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>
            {account.institution ? `${account.institution} · ` : ''}
            {account.holdingsCount === 1 ? '1 holding' : `${account.holdingsCount} holdings`}
            {account.cashBalance > 0 && (
              <>
                {' · '}
                <Money value={account.cashBalance} /> cash
              </>
            )}
            {account.unpricedCount > 0 && (
              <span style={{ color: C.amber }}>
                {' · '}
                {account.unpricedCount} unpriced
              </span>
            )}
          </div>
          {account.note && (
            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>{account.note}</div>
          )}
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: C.mono, color: C.text }}>
            <Money value={account.value} />
          </div>
          <div style={{ fontSize: 10.5, color: C.faint, fontFamily: C.mono, marginTop: 3 }}>
            {account.active ? 'current value' : 'excluded'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button onClick={onOpenHoldings} style={{ ...ghostBtn, padding: '5px 10px', fontSize: 11.5 }}>
          Holdings
        </button>
        {!readOnly && (
          <>
            <button onClick={onEdit} style={{ ...ghostBtn, padding: '5px 10px', fontSize: 11.5 }}>
              Edit
            </button>
            {confirming ? (
              <>
                <button onClick={remove} disabled={busy} style={{ ...dangerBtn, padding: '5px 10px', fontSize: 11.5 }}>
                  {busy ? 'Removing…' : 'Remove it and everything in it'}
                </button>
                <button onClick={() => setConfirming(false)} style={{ ...ghostBtn, padding: '5px 10px', fontSize: 11.5 }}>
                  Keep
                </button>
              </>
            ) : (
              <button onClick={() => setConfirming(true)} style={{ ...dangerBtn, padding: '5px 10px', fontSize: 11.5 }}>
                Remove
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AccountForm({ existing, onDone }: { existing: InvestmentAccount | null; onDone: () => void }) {
  const [kind, setKind] = useState<InvestmentAccountKind>(existing?.kind ?? '401k');
  const [label, setLabel] = useState(existing?.label ?? '');
  const [institution, setInstitution] = useState(existing?.institution ?? '');
  const [cash, setCash] = useState(existing ? String(existing.cashBalance) : '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [active, setActive] = useState(existing?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!label.trim()) {
      setError('Give the account a name');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = {
        kind,
        label: label.trim(),
        institution: institution.trim() || null,
        cashBalance: cash.trim() === '' ? 0 : Number(cash),
        note: note.trim() || null,
        active,
      };
      const res = existing
        ? await api.updateInvestmentAccount(existing.id, body)
        : await api.createInvestmentAccount(body);
      publishPortfolio(res.portfolio);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that account');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={existing ? 'Edit account' : 'New account'} style={{ marginBottom: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        <div>
          <label style={labelStyle}>Type</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as InvestmentAccountKind)} style={inputStyle}>
            {KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Name</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Fidelity 401(k)"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Institution</label>
          <input
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            placeholder="Fidelity"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Uninvested cash</label>
          <input
            value={cash}
            onChange={(e) => setCash(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={labelStyle}>Note</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" style={inputStyle} />
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12.5, color: C.muted }}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Include this account in portfolio totals
      </label>

      {error && <div style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={save} disabled={busy} style={primaryBtn}>
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Add account'}
        </button>
        <button onClick={onDone} style={ghostBtn}>
          Cancel
        </button>
      </div>
    </Card>
  );
}

// Says where automatic connection stands. An honest "not built, here is what it
// needs" reads better than a Connect button that does nothing — and it is the
// difference between a roadmap and a broken feature.
function ConnectionNote() {
  return (
    <div
      style={{
        ...panel,
        padding: 16,
        marginTop: 16,
        borderLeft: `3px solid ${TEAL}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
        <Icon name="link" size={15} color={TEAL} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>Connecting accounts automatically</span>
      </div>
      <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.65 }}>
        Accounts are entered by hand for now. Connecting them automatically is planned, and a connected
        account will sit beside a hand-entered one without anything here changing.
      </div>
      <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.6, marginTop: 10 }}>
        Whichever way an account arrives, the connection stays <strong style={{ color: C.muted }}>read-only</strong> —
        balances and positions, never trade access.
      </div>
    </div>
  );
}
