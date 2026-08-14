import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useResponsive } from '../../hooks/useMediaQuery';
import type { CapitalAccount, CapitalFigure, CapitalTotal, TraderCapital } from '../../api/types';

// The trader's own money, as three KPI cards on Closed Trades & Metrics:
// Deposited Capital, Withdrawn Capital, and Total Capital (what their connected
// accounts hold right now).
//
// **THE FIGURES ARE PER ACCOUNT AND THE CARD IS THE TOTAL** (owner instruction,
// 2026-08). One deposited figure per trader could not describe a desk where more
// than one broker account sits under one login: the sync summed every account's
// funding into a single number, so a trader's own deposit and a partner's were
// added together with no way to tell them apart or to sync one without the
// other. Each account now carries its own figures and its own sync switches;
// the card states the total and says how it was arrived at, and Manage opens the
// breakdown.
//
// **THE CARDS ARE ALWAYS THE VIEWER'S OWN.** Unlike the rest of the KPI row they
// do not follow the trader filter, and a desk lead reading a member's capital in
// the Manage panel does not change them — the return beside the Deposited figure
// is measured over the viewer's own closed trades, so showing somebody else's
// deposit here would be a return nobody earned.

const GOLD = '#EBCB74';
const GREEN = '#35c47b';
const RED = '#ef5468';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const CARD = 'rgba(13,31,68,.5)';
const PANEL = 'rgba(11,26,58,.5)';
const PAGE = '#07152f';
const INPUT_BG = '#091633';
const BORDER = '#16294f';
const BORDER2 = '#1c3a7a';

const usd = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CapitalCards({
  realizedPl,
  showMoney,
  readOnly,
}: {
  realizedPl: number;
  showMoney: boolean;
  readOnly: boolean;
}) {
  const [cap, setCap] = useState<TraderCapital | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [manage, setManage] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .traderCapital()
      .then((c) => alive && setCap(c))
      .catch((e) => alive && setLoadError(e instanceof ApiError ? e.message : 'Could not load capital'));
    return () => {
      alive = false;
    };
  }, []);

  // One card errored the whole block: these three share a payload, so a load
  // failure is reported once, on the first card, rather than three times.
  if (loadError) {
    return (
      <div style={card}>
        <div style={cardLabel}>{"Deposited Capital"}</div>
        <div style={{ fontSize: 11.5, color: '#ffb4ab', marginTop: 8 }}>{loadError}</div>
      </div>
    );
  }

  const pct =
    cap?.deposited.value != null && cap.deposited.value > 0 ? (realizedPl / cap.deposited.value) * 100 : null;
  const canManage = !readOnly && cap != null && cap.canEdit;

  return (
    <>
      <CapitalFlowCard
        label="Deposited Capital"
        total={cap?.deposited ?? null}
        loaded={cap != null}
        showMoney={showMoney}
        canManage={canManage}
        onManage={() => setManage(true)}
        note={cap?.note ?? null}
        extra={
          pct != null ? (
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, color: pct >= 0 ? GREEN : RED, marginTop: 3 }}>
              {pct >= 0 ? '+' : ''}{pct.toFixed(1)}% return
            </div>
          ) : null
        }
        emptySub="not set"
        setSub="your own closed trades"
      />
      <CapitalFlowCard
        label="Withdrawn Capital"
        total={cap?.withdrawn ?? null}
        loaded={cap != null}
        showMoney={showMoney}
        canManage={canManage}
        onManage={() => setManage(true)}
        note={cap?.note ?? null}
        extra={null}
        emptySub="not set"
        setSub="taken out of your accounts"
      />
      <div style={card}>
        <div style={cardLabel}>{"Total Capital"}</div>
        <div style={figureStyle}>
          {cap == null ? '…' : cap.total == null ? '—' : showMoney ? usd(cap.total) : '•••••'}
        </div>
        <div style={{ fontSize: 10.5, color: FAINT, marginTop: 4 }}>
          {cap == null
            ? 'reading your accounts'
            : cap.total == null
              ? cap.accounts > 1
                ? 'accounts use different currencies'
                : cap.unreadable > 0
                  ? 'your broker did not answer'
                  : 'no broker account connected'
              : `held now · ${cap.accounts} account${cap.accounts === 1 ? '' : 's'}`}
        </div>
        {/* An account left out makes the total an understatement — say so
            rather than letting it read as complete. */}
        {cap != null && cap.total != null && cap.unreadable > 0 && (
          <div style={{ fontSize: 10, color: '#e0a23a', marginTop: 4 }}>
            {`${cap.unreadable} connected account${cap.unreadable === 1 ? '' : 's'} could not be read and ${cap.unreadable === 1 ? 'is' : 'are'} not in this total.`}
          </div>
        )}
      </div>

      {manage && cap && (
        <CapitalManager
          own={cap}
          showMoney={showMoney}
          onOwnChange={setCap}
          onClose={() => setManage(false)}
        />
      )}
    </>
  );
}

// How a total was arrived at, in one line. A figure that leaves an account out
// says so — the same rule the live total follows for an account that would not
// answer. Exported because the Live Wall's Desk Metrics tile restates these
// figures, and one phrasing is what keeps the two from describing the same
// total differently.
export function capitalSub(total: CapitalTotal, setSub: string, emptySub: string): string {
  if (total.mixedCurrency) return 'accounts use different currencies';
  if (total.value == null) return emptySub;
  const accounts = `${total.stated} account${total.stated === 1 ? '' : 's'}`;
  const made =
    total.mode === 'synced'
      ? `auto · ${accounts}`
      : total.mode === 'mixed'
        ? `${accounts}, some auto`
        : accounts;
  const left = total.unstated > 0 ? ` · ${total.unstated} not set` : '';
  return total.stated === 1 && total.unstated === 0 ? setSub : `${made}${left}`;
}

// One of the two flow cards (deposited / withdrawn): the total across the
// trader's accounts, and the way in to the per-account breakdown.
function CapitalFlowCard({
  label,
  total,
  loaded,
  showMoney,
  canManage,
  onManage,
  note,
  extra,
  emptySub,
  setSub,
}: {
  label: string;
  total: CapitalTotal | null;
  loaded: boolean;
  showMoney: boolean;
  canManage: boolean;
  onManage: () => void;
  note: string | null;
  extra: ReactNode;
  emptySub: string;
  setSub: string;
}) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={cardLabel}>{label}</span>
        {canManage && (
          <button onClick={onManage} style={miniGhost}>
            {total?.value == null ? 'Set' : 'Manage'}
          </button>
        )}
      </div>
      <div style={figureStyle}>
        {!loaded ? '…' : total?.value == null ? '—' : showMoney ? usd(total.value) : '•••••'}
      </div>
      {extra}
      <div style={{ fontSize: 10.5, color: FAINT, marginTop: 4 }}>
        {!loaded || !total ? 'reading' : capitalSub(total, setSub, emptySub)}
      </div>
      {loaded && total && total.mode !== 'manual' && total.mode !== 'none' && (
        <div style={{ marginTop: 8 }}>
          <span style={syncedPill}>{total.mode === 'synced' ? 'Auto · synced' : 'Part auto'}</span>
        </div>
      )}
      {note && <div style={{ fontSize: 10, color: '#e0a23a', marginTop: 6 }}>{note}</div>}
    </div>
  );
}

// ---- The breakdown: one block per account, each set on its own -------------
//
// Also where a DESK LEAD sets a member's capital. Their accounts are their own —
// this reads and writes that member's rows, and the cards behind the panel stay
// the viewer's. It is the same reach that already governs whose desk settings
// somebody may change, and the server checks it on every request.
function CapitalManager({
  own,
  showMoney,
  onOwnChange,
  onClose,
}: {
  own: TraderCapital;
  showMoney: boolean;
  onOwnChange: (cap: TraderCapital) => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { isPhone } = useResponsive();
  const [target, setTarget] = useState(own.userId);
  const [cap, setCap] = useState<TraderCapital>(own);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const members = cap.editableMembers ?? own.editableMembers ?? [];
  const editingSelf = target === own.userId;

  // Whatever comes back is the whole truth about that person's capital, so it
  // replaces the panel's copy — and the cards behind it too when it is the
  // viewer's own, which is what keeps the two from disagreeing.
  function apply(next: TraderCapital) {
    setCap(next);
    if (next.userId === own.userId) onOwnChange(next);
  }

  async function switchTarget(id: string) {
    setTarget(id);
    setLoading(true);
    setError(null);
    try {
      apply(await api.traderCapital(id === own.userId ? undefined : id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load that person’s capital');
    } finally {
      setLoading(false);
    }
  }

  async function run(action: () => Promise<TraderCapital>) {
    setError(null);
    try {
      apply(await action());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save');
      throw e;
    }
  }

  const whose = editingSelf ? undefined : target;

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 60, animation: 'fadeIn .2s ease' }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Capital"
        style={{
          position: 'fixed',
          top: isPhone ? 0 : 'calc(8 * var(--vh))',
          left: '50%',
          transform: 'translateX(-50%)',
          width: isPhone ? '100%' : 'min(560px, calc(94 * var(--vw)))',
          height: isPhone ? '100%' : 'auto',
          maxHeight: isPhone ? '100%' : 'calc(86 * var(--vh))',
          overflowY: 'auto',
          background: PAGE,
          border: isPhone ? 'none' : `1px solid ${BORDER2}`,
          borderRadius: isPhone ? 0 : 14,
          boxShadow: '0 24px 60px rgba(0,0,0,.55)',
          zIndex: 61,
          animation: 'popIn .25s ease',
          color: TEXT,
        }}
      >
        <div
          style={{
            position: 'sticky',
            top: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            background: 'linear-gradient(90deg,#0a1f4d,#0c2768)',
            borderBottom: `1px solid ${BORDER2}`,
            zIndex: 1,
          }}
        >
          <strong style={{ fontSize: 15, color: '#fff' }}>Deposited &amp; withdrawn capital</strong>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: MUTED, fontSize: 22, lineHeight: 1, cursor: 'pointer' }}>
            ×
          </button>
        </div>

        <div style={{ padding: 18 }}>
          {/* Whose capital — a desk lead (group leader / admin) can pick a
              person in the group and set theirs. Hidden for everyone else, who
              only ever see their own. */}
          {members.length > 1 && (
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="capital-whose" style={{ ...cardLabel, display: 'block', marginBottom: 6 }}>
                {"Whose capital"}
              </label>
              <select
                id="capital-whose"
                value={target}
                onChange={(e) => void switchTarget(e.target.value)}
                disabled={loading}
                style={{ ...inputBase, fontSize: 13, width: '100%', cursor: loading ? 'default' : 'pointer' }}
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id === user?.id ? `${m.name} (you)` : m.name}
                  </option>
                ))}
              </select>
              {!editingSelf && (
                <div style={{ fontSize: 11.5, color: GOLD, marginTop: 6 }}>
                  Setting {members.find((m) => m.id === target)?.name ?? 'somebody else'}’s capital. Their
                  accounts sync from their own broker.
                </div>
              )}
            </div>
          )}

          {error && <div style={{ fontSize: 12, color: '#ffb4ab', marginBottom: 12 }}>{error}</div>}

          {loading ? (
            <div style={{ color: MUTED, fontSize: 13 }}>{"Loading…"}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {cap.breakdown.map((a) => (
                <AccountBlock
                  key={a.key}
                  account={a}
                  showMoney={showMoney}
                  onSave={(which, value) =>
                    run(() =>
                      api.updateTraderCapital({
                        userId: whose,
                        account: a.key,
                        ...(which === 'deposited' ? { deposited: value } : { withdrawn: value }),
                      }),
                    )
                  }
                  onSync={(which) => run(() => api.syncTraderCapital(a.key, which, whose))}
                  onUnsync={(which) =>
                    run(() =>
                      api.updateTraderCapital({
                        userId: whose,
                        account: a.key,
                        ...(which === 'deposited' ? { depositedSync: false } : { withdrawnSync: false }),
                      }),
                    )
                  }
                />
              ))}
            </div>
          )}

          {/* Not a tip: which broker the terminal can actually read a funding
              history from is not discoverable from the screen. */}
          <div style={{ fontSize: 11, color: FAINT, marginTop: 14, lineHeight: 1.55 }}>
            Auto-sync reads the deposit and withdrawal history of one OANDA account. A Kraken account records
            what arrived in coins, which cannot be turned into dollars without the price on the day, so those
            figures are typed in.
          </div>
        </div>
      </div>
    </>
  );
}

function AccountBlock({
  account,
  showMoney,
  onSave,
  onSync,
  onUnsync,
}: {
  account: CapitalAccount;
  showMoney: boolean;
  onSave: (which: 'deposited' | 'withdrawn', value: number | null) => Promise<void>;
  onSync: (which: 'deposited' | 'withdrawn') => Promise<void>;
  onUnsync: (which: 'deposited' | 'withdrawn') => Promise<void>;
}) {
  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13, color: '#fff' }}>{account.label}</strong>
        {account.broker && <span style={brokerChip}>{account.broker.toUpperCase()}</span>}
        {!account.active && account.broker && <span style={{ fontSize: 10.5, color: '#e0a23a' }}>paused</span>}
      </div>
      {account.summary && <div style={{ fontSize: 10.5, color: FAINT, marginTop: 2 }}>{account.summary}</div>}

      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <FigureRow
          label="Deposited"
          figure={account.deposited}
          canSync={account.canSync}
          showMoney={showMoney}
          onSave={(v) => onSave('deposited', v)}
          onSync={() => onSync('deposited')}
          onUnsync={() => onUnsync('deposited')}
        />
        <FigureRow
          label="Withdrawn"
          figure={account.withdrawn}
          canSync={account.canSync}
          showMoney={showMoney}
          onSave={(v) => onSave('withdrawn', v)}
          onSync={() => onSync('withdrawn')}
          onUnsync={() => onUnsync('withdrawn')}
        />
      </div>

      {account.note && <div style={{ fontSize: 10.5, color: '#e0a23a', marginTop: 8 }}>{account.note}</div>}
    </div>
  );
}

// One figure on one account: what it says, and the two ways to change it.
function FigureRow({
  label,
  figure,
  canSync,
  showMoney,
  onSave,
  onSync,
  onUnsync,
}: {
  label: string;
  figure: CapitalFigure;
  canSync: boolean;
  showMoney: boolean;
  onSave: (value: number | null) => Promise<void>;
  onSync: () => Promise<void>;
  onUnsync: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const synced = figure.mode === 'synced';

  function open() {
    setText(figure.value == null ? '' : String(figure.value));
    setError(null);
    setEditing(true);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const raw = text.trim();
    // An emptied box clears the figure back to "not stated" rather than storing
    // a zero, which would be a claim the trader did not make.
    const value = raw === '' ? null : Number(raw);
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      setError('Enter an amount');
      return;
    }
    await run(() => onSave(value));
  }

  function confirmSync() {
    // The plain question, because the answer changes where the number comes
    // from: the broker's funding history takes over until sync is turned off.
    if (
      !window.confirm(
        `Are you sure you want to sync? ${label} for this account will update automatically from the broker's history, and the figure typed in will be set aside until you switch back.`,
      )
    )
      return;
    void run(onSync);
  }

  if (editing) {
    return (
      <div>
        <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>{label}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
              if (e.key === 'Escape') setEditing(false);
            }}
            type="number"
            step="any"
            min="0"
            autoFocus
            placeholder="0.00"
            style={{ ...inputBase, flex: '1 1 120px', fontFamily: "'IBM Plex Mono', monospace" }}
          />
          <button onClick={() => void save()} disabled={busy} style={{ ...miniGold, opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => setEditing(false)} style={miniGhost}>{"Cancel"}</button>
        </div>
        {synced && (
          <div style={{ fontSize: 10, color: FAINT, marginTop: 6 }}>{"Saving a figure switches this back to manual."}</div>
        )}
        {error && <div style={{ fontSize: 10.5, color: '#ffb4ab', marginTop: 6 }}>{error}</div>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: MUTED, flex: '0 0 66px' }}>{label}</span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 600, color: '#fff', flex: '0 0 auto' }}>
          {figure.value == null ? '—' : showMoney ? usd(figure.value) : '•••••'}
        </span>
        {synced && <span style={syncedPill}>{"Auto"}</span>}
        <div style={{ flex: 1 }} />
        <button onClick={open} disabled={busy} style={miniGhost}>
          {figure.value == null && !synced ? 'Set' : 'Edit'}
        </button>
        {synced ? (
          <button onClick={() => void run(onUnsync)} disabled={busy} style={miniGhost}>{"Turn off"}</button>
        ) : canSync ? (
          <button onClick={confirmSync} disabled={busy} style={miniGhost} title="Keep this figure in step with this account's deposit history">
            {busy ? 'Syncing…' : 'Sync'}
          </button>
        ) : null}
      </div>
      {error && <div style={{ fontSize: 10.5, color: '#ffb4ab', marginTop: 4 }}>{error}</div>}
    </div>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 };
const cardLabel: CSSProperties = { fontSize: 10, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED };
const figureStyle: CSSProperties = { fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 600, color: '#fff', marginTop: 6 };
const panel: CSSProperties = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px' };
const inputBase: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 7, color: TEXT, fontSize: 12.5, padding: '9px 11px', outline: 'none' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '8px 12px', borderRadius: 7, cursor: 'pointer' };
const goldBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', fontWeight: 700, fontSize: 12, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
// Small enough to sit inside a KPI card without crowding the figure.
const miniGhost: CSSProperties = { ...ghostBtn, padding: '3px 8px', fontSize: 10.5 };
const miniGold: CSSProperties = { ...goldBtn, padding: '5px 11px', fontSize: 11 };
// The "this number moves on its own" tag on a synced figure.
const syncedPill: CSSProperties = { fontSize: 9, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#8fe3b0', background: 'rgba(53,196,123,.12)', border: '1px solid rgba(53,196,123,.4)', borderRadius: 5, padding: '2px 7px' };
const brokerChip: CSSProperties = { fontSize: 9.5, fontWeight: 700, color: '#bcd0ff', background: 'rgba(120,150,220,.12)', border: `1px solid ${BORDER2}`, borderRadius: 5, padding: '2px 6px', fontFamily: "'IBM Plex Mono', monospace" };
