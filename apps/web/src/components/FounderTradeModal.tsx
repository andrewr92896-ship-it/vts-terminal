import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../api/client';
import type {
  FounderAccountView,
  FounderInvite,
  FounderSizeMode,
  FounderTradePrefs,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { isFounder } from '../auth/access';
import { C } from '../theme/tokens';
import { useResponsive } from '../hooks/useMediaQuery';

// The Founder trade coordination modal — the terminal's one BLOCKING alert.
//
// It is mounted in `Portal.tsx` at the top of the authenticated shell rather
// than on any screen, which is the whole point: an invitation has to be
// answerable from wherever the recipient happens to be, and the funded question
// outlives the walk to the Funded section. Nothing about it is local to Trading.
//
// **WHAT MAKES IT UNDISMISSABLE.** There is no close button, no backdrop click
// handler and no Escape handler, and the state it renders lives on the server —
// so a refresh, a new tab, a logout and back in, or a redeploy all resolve to
// the same required action. The only things that clear it are the decisions
// themselves.
//
// **WHAT MAKES IT SAFE TO OPERATE HALF ASLEEP.** One question per screen, the
// direction and instrument set larger than anything else, the size the trade
// will actually go out at stated before the button rather than after it, and
// two full-width buttons whose labels say what they do rather than yes/no.
// There is deliberately no confirmation step: the JOIN press IS the
// confirmation, and a second dialog at 3am is how somebody taps through both.

// The modal polls rather than subscribing — the terminal has no realtime
// channel, and this cadence is what makes a second tab converge within seconds
// of the tab that acted.
const POLL_MS = 12_000;
// A cross-tab poke, so the OTHER tabs do not have to wait out a poll after this
// one resolves a step. Purely an optimisation: the server is still the
// authority, and a browser without BroadcastChannel simply polls.
const CHANNEL = 'vts-founder-trades';

export function FounderTradeModal() {
  const { user } = useAuth();
  const { isPhone } = useResponsive();
  const [invites, setInvites] = useState<FounderInvite[]>([]);
  const [prefs, setPrefs] = useState<FounderTradePrefs | null>(null);
  const [accounts, setAccounts] = useState<FounderAccountView[]>([]);
  const [canTrade, setCanTrade] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loading = useRef(false);

  // Founder-only on the client as well, so an ordinary account never polls an
  // endpoint that would refuse it. The server is the authority either way.
  const enabled = !!user && !user.isDemo && isFounder(user.roles);

  const load = useCallback(async () => {
    if (!enabled || loading.current) return;
    loading.current = true;
    try {
      const res = await api.founderPending();
      setInvites(res.invites);
      setPrefs(res.prefs);
      setAccounts(res.accounts);
      setCanTrade(res.canTrade);
    } catch {
      /* keep whatever is on screen — a failed poll must never clear a pending
         decision, which would look like the workflow had resolved itself */
    } finally {
      loading.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = () => void load();
    } catch {
      /* older browsers just poll */
    }
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      channel?.close();
    };
  }, [enabled, load]);

  const poke = useCallback(() => {
    try {
      const ch = new BroadcastChannel(CHANNEL);
      ch.postMessage('changed');
      ch.close();
    } catch {
      /* optional */
    }
  }, []);

  // The queue: oldest first, and the one on screen is always the head of it. An
  // invitation is never dropped to make room for a newer one — the count says
  // how many are behind it so nothing arrives unannounced.
  const current = invites[0] ?? null;
  const behind = Math.max(0, invites.length - 1);

  // Fold a mutation's answer straight back in, so the acting tab updates without
  // waiting for its own poll, and tell the other tabs to re-read.
  const apply = useCallback(
    (invite: FounderInvite) => {
      setInvites((prev) => {
        const next = prev.map((i) => (i.id === invite.id ? invite : i));
        return next.filter((i) => i.status !== 'complete');
      });
      setError(null);
      poke();
      void load();
    },
    [load, poke],
  );

  const act = useCallback(
    async (run: () => Promise<{ invite: FounderInvite }>) => {
      setBusy(true);
      setError(null);
      try {
        const { invite } = await run();
        apply(invite);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'That did not go through — try again');
        // Re-read either way: the refusal may be that another tab already
        // answered, in which case the screen should move on rather than sit on
        // an error about a decision that has been made.
        void load();
      } finally {
        setBusy(false);
      }
    },
    [apply, load],
  );

  if (!enabled || !current) return null;

  const pad = isPhone ? 16 : 28;
  return (
    <div
      // No onClick, and no Escape handler anywhere in this file. Both are
      // deliberate: this is the terminal's one alert that must not be dismissed
      // by a stray tap or a habitual keypress.
      role="alertdialog"
      aria-modal="true"
      aria-label="Founder trade decision required"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 4000,
        background: 'rgba(3,7,16,.92)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isPhone ? 12 : 24,
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          background: C.panel,
          border: `1px solid ${C.line2}`,
          borderRadius: 16,
          padding: pad,
          boxShadow: '0 30px 80px rgba(0,0,0,.6)',
          color: C.text,
          fontFamily: C.sans,
        }}
      >
        {behind > 0 && (
          <div style={{ fontSize: 12, color: C.faint, marginBottom: 10, letterSpacing: '.04em' }}>
            {behind + 1} DECISIONS WAITING · THIS IS THE OLDEST
          </div>
        )}

        {/* ONE QUESTION, TWO KINDS. A trade invitation asks somebody to take a
            position; a level move asks them to change one they are already in.
            They are drawn as separate steps rather than one with conditionals
            because a half-awake reader has to know which decision they are
            making from the heading alone — the same reason the direction and
            instrument are set larger than anything else on both. */}
        {current.kind === 'amend' ? (
          <AmendStep
            invite={current}
            canTrade={canTrade}
            busy={busy}
            error={error}
            onApply={() => act(() => api.joinFounderTrade(current.id))}
            onDismiss={() => act(() => api.declineFounderTrade(current.id))}
          />
        ) : (
          <PrimaryStep
            invite={current}
            prefs={prefs}
            accounts={accounts}
            canTrade={canTrade}
            busy={busy}
            error={error}
            onPrefs={(p) => setPrefs(p)}
            onJoin={() => act(() => api.joinFounderTrade(current.id))}
            onDecline={() => act(() => api.declineFounderTrade(current.id))}
          />
        )}
      </div>
    </div>
  );
}

// ---- shared pieces ----

// The trade, stated the same way on every screen of the workflow. It is repeated
// rather than carried in the reader's head on purpose: somebody woken by a phone
// should never have to remember what the previous screen said.
function TradeFacts({ invite, size }: { invite: FounderInvite; size?: string | null }) {
  const long = invite.side === 'long';
  const dirColor = long ? C.green : C.red;
  return (
    <div
      style={{
        border: `1px solid ${C.line2}`,
        borderRadius: 12,
        padding: 16,
        background: C.panel2,
        margin: '16px 0',
      }}
    >
      {/* A DRILL SAYS SO, FIRST AND LARGEST. Somebody woken by a phone reads the
          top of the screen and little more, so a test that looked like a real
          fill would get acted on exactly like one. */}
      {invite.isTest && (
        <div
          style={{
            display: 'inline-block',
            marginBottom: 12,
            padding: '5px 10px',
            borderRadius: 6,
            background: 'rgba(235,203,116,.16)',
            border: `1px solid ${C.gold}`,
            color: C.gold,
            fontSize: 12,
            fontWeight: 900,
            letterSpacing: '.1em',
          }}
        >
          TEST — A DRILL, NOT A REAL CALL
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.01em' }}>{invite.instrument}</span>
        <span
          style={{
            fontSize: 26,
            fontWeight: 900,
            color: dirColor,
            letterSpacing: '.06em',
          }}
        >
          {long ? 'BUY' : 'SELL'}
        </span>
      </div>
      <dl style={{ margin: '14px 0 0', display: 'grid', gap: 8 }}>
        <Fact label="Their entry" value={fmtPrice(invite.entryPrice)} />
        <Fact
          label="Stop loss"
          value={invite.stopLoss == null ? 'None set' : fmtPrice(invite.stopLoss)}
          // A trade with no stop on it is the most important thing this card can
          // say, so it is called out rather than left reading as a blank field.
          tone={invite.stopLoss == null ? 'warn' : undefined}
        />
        {/* Only stated when there is one — an absent target is an ordinary way
            to run a trade, unlike an absent stop. */}
        {invite.takeProfit != null && <Fact label="Take profit" value={fmtPrice(invite.takeProfit)} />}
        {size !== undefined && <Fact label="Your size" value={size ?? 'Not set'} tone={size ? 'good' : 'warn'} />}
      </dl>
    </div>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'good' }) {
  const color = tone === 'warn' ? C.amber : tone === 'good' ? C.text : C.text;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
      <dt style={{ fontSize: 13, color: C.muted }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: 17, fontWeight: 700, fontFamily: C.mono, color }}>{value}</dd>
    </div>
  );
}

function fmtPrice(v: number | null): string {
  if (v == null) return '—';
  return v.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function fmtUnits(v: number | null): string | null {
  if (v == null) return null;
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 6 })} units`;
}

// Big, unambiguous, full width, and labelled with what it does rather than
// yes/no — the half-asleep rule, in one component.
function BigButton({
  label,
  sub,
  tone,
  onClick,
  disabled,
}: {
  label: string;
  sub?: string;
  tone: 'go' | 'stop' | 'neutral';
  onClick: () => void;
  disabled?: boolean;
}) {
  const bg = tone === 'go' ? C.green : tone === 'stop' ? 'transparent' : C.panel2;
  const fg = tone === 'go' ? '#04210F' : tone === 'stop' ? C.text : C.text;
  const border = tone === 'stop' ? `1px solid ${C.line2}` : '1px solid transparent';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '18px 16px',
        borderRadius: 12,
        border,
        background: bg,
        color: fg,
        fontSize: 18,
        fontWeight: 800,
        letterSpacing: '.03em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        fontFamily: C.sans,
      }}
    >
      {label}
      {sub && (
        <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.8, marginTop: 4, letterSpacing: 0 }}>{sub}</div>
      )}
    </button>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        border: `1px solid ${C.red}`,
        background: 'rgba(240,89,110,.12)',
        borderRadius: 10,
        padding: '12px 14px',
        margin: '0 0 14px',
        fontSize: 14,
        fontWeight: 600,
        color: C.text,
      }}
    >
      {message}
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, lineHeight: 1.25 }}>{children}</h2>;
}

// ---- step 1: the primary trade ----

function PrimaryStep({
  invite,
  prefs,
  accounts,
  canTrade,
  busy,
  error,
  onPrefs,
  onJoin,
  onDecline,
}: {
  invite: FounderInvite;
  prefs: FounderTradePrefs | null;
  accounts: FounderAccountView[];
  canTrade: boolean;
  busy: boolean;
  error: string | null;
  onPrefs: (p: FounderTradePrefs) => void;
  onJoin: () => void;
  onDecline: () => void;
}) {
  // What is about to be sent, said in whichever terms the recipient sizes in.
  // A PERCENTAGE HAS NO UNIT COUNT UNTIL THE ORDER GOES OUT — the server works
  // it out from the account value and quote at that moment — so the modal states
  // the share rather than a number that could already be wrong by the time JOIN
  // is pressed.
  const pctMode = prefs?.sizeMode === 'account_pct';
  const fixedUnits = prefs?.defaultUnits ?? invite.recipientUnits;
  const size = pctMode
    ? prefs?.sizePct == null
      ? ''
      : `${prefs.sizePct}% of your account value`
    : fixedUnits == null
      ? ''
      : fmtUnits(fixedUnits);
  const account = accounts.find((a) => a.connectionId === prefs?.defaultConnectionId) ?? null;
  const ready = !!size && !!account && canTrade;

  return (
    <>
      <Heading>
        {invite.inviter.displayName} invited you to a {invite.isTest ? 'test trade' : 'trade'}
      </Heading>
      <TradeFacts invite={invite} size={size} />

      {/* The previous attempt's failure, kept on the server row so it is still
          here after a refresh. Shown above the buttons, because it changes what
          the next press means. */}
      {invite.primaryError && !error && (
        <ErrorBox message={`Your last attempt did not go through: ${invite.primaryError}`} />
      )}
      {error && <ErrorBox message={error} />}

      {!canTrade && (
        <ErrorBox message="Turn Advanced Trading on in My Terminal ▸ Premium Features to join a trade. You can still decline." />
      )}

      {/* Size and account are asked for HERE rather than sending the recipient
          off to a settings screen mid-decision. Nothing is copied from the
          inviter — this is the number the order actually goes out at. */}
      {canTrade && !ready && <SizeSetup accounts={accounts} prefs={prefs} onSaved={onPrefs} />}

      <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
        <BigButton
          label={busy || invite.sending ? 'SENDING…' : 'JOIN TRADE'}
          sub={ready ? `${size} on ${account?.label ?? 'your account'}` : 'Set your size first'}
          tone="go"
          onClick={onJoin}
          disabled={busy || invite.sending || !ready}
        />
        <BigButton label="DO NOT JOIN" tone="stop" onClick={onDecline} disabled={busy || invite.sending} />
      </div>
      <p style={{ fontSize: 12, color: C.faint, margin: '14px 0 0', lineHeight: 1.5 }}>
        Either answer finishes this. Nothing is sent to your funded account.
      </p>
    </>
  );
}

// The one place the recipient's own size is set from the modal. It is a
// preference, not part of the invitation, so saving it here also settles every
// invitation that follows.
function SizeSetup({
  accounts,
  prefs,
  onSaved,
}: {
  accounts: FounderAccountView[];
  prefs: FounderTradePrefs | null;
  onSaved: (p: FounderTradePrefs) => void;
}) {
  const [mode, setMode] = useState<FounderSizeMode>(prefs?.sizeMode ?? 'units');
  const [units, setUnits] = useState(prefs?.defaultUnits == null ? '' : String(prefs.defaultUnits));
  const [pct, setPct] = useState(prefs?.sizePct == null ? '' : String(prefs.sizePct));
  const [connectionId, setConnectionId] = useState(
    prefs?.defaultConnectionId ?? accounts[0]?.connectionId ?? '',
  );
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    const n = Number(units);
    const p = Number(pct);
    if (mode === 'units' && (!Number.isFinite(n) || n <= 0)) {
      return setProblem('Enter a position size greater than zero');
    }
    if (mode === 'account_pct' && (!Number.isFinite(p) || p <= 0 || p > 100)) {
      return setProblem('Enter a share of your account between 0 and 100');
    }
    if (!connectionId) return setProblem('Choose the account a joined trade goes to');
    setSaving(true);
    setProblem(null);
    try {
      const { prefs: next } = await api.saveFounderPrefs({
        sizeMode: mode,
        defaultUnits: Number.isFinite(n) && n > 0 ? n : null,
        sizePct: Number.isFinite(p) && p > 0 && p <= 100 ? p : null,
        defaultConnectionId: connectionId,
      });
      onSaved(next);
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : 'That could not be saved');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        border: `1px solid ${C.line2}`,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        background: 'rgba(235,203,116,.06)',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Your position size</div>
      {problem && <ErrorBox message={problem} />}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {([
          ['units', 'Fixed units'],
          ['account_pct', 'Account %'],
        ] as const).map(([key, text]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            aria-pressed={mode === key}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 10,
              border: `1px solid ${mode === key ? C.gold : C.line2}`,
              background: mode === key ? 'rgba(235,203,116,.14)' : 'transparent',
              color: mode === key ? C.gold : C.muted,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {text}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {mode === 'units' ? (
          <input
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            inputMode="decimal"
            placeholder="e.g. 1000"
            aria-label="Your position size in units"
            style={inputStyle}
          />
        ) : (
          <input
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            inputMode="decimal"
            placeholder="e.g. 25 (% of your account value)"
            aria-label="Share of your account value, as a percentage"
            style={inputStyle}
          />
        )}
        {accounts.length === 0 ? (
          <div style={{ fontSize: 13, color: C.amber }}>
            No live broker account is connected — add one under Live Brokers before joining.
          </div>
        ) : (
          <select
            value={connectionId}
            onChange={(e) => setConnectionId(e.target.value)}
            aria-label="Which account a joined trade goes to"
            style={inputStyle}
          >
            {accounts.map((a) => (
              <option key={a.connectionId} value={a.connectionId}>
                {a.label} · {a.broker.toUpperCase()}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || accounts.length === 0}
          style={{
            padding: '12px 16px',
            borderRadius: 10,
            border: 'none',
            background: C.gold,
            color: C.goldText,
            fontWeight: 800,
            fontSize: 15,
            cursor: saving ? 'wait' : 'pointer',
            fontFamily: C.sans,
          }}
        >
          {saving ? 'Saving…' : 'Save my size'}
        </button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: `1px solid ${C.line2}`,
  background: C.bg,
  color: C.text,
  fontSize: 16,
  fontFamily: C.mono,
};

// ---- the other kind of invitation: a level move ----

// The sender moved or added a stop or a target on a position they are already
// in, and this is the recipient's one press to match it.
//
// **IT SHOWS THE MOVE, NOT THE DESTINATION.** "1.0820 → 1.0840" is the decision;
// a bare new number is not, because the reader cannot tell from it whether the
// stop tightened or loosened. Where the level came from is stated in the same
// row it moved to, at the same size, so the two are read together.
//
// **AND IT ONLY OFFERS THE BUTTON WHEN THERE IS SOMETHING TO PRESS IT ON.** The
// server resolves the recipient's own position when the invitation is raised —
// from an explicit pairing, or from their single open position in the same
// instrument and direction — and an ambiguous book resolves to NONE. The
// invitation is still shown, because knowing what a partner did is worth knowing
// either way; what is withheld is a button that would move a stop on a position
// nobody chose.
function AmendStep({
  invite,
  canTrade,
  busy,
  error,
  onApply,
  onDismiss,
}: {
  invite: FounderInvite;
  canTrade: boolean;
  busy: boolean;
  error: string | null;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const ready = invite.hasTarget && canTrade;
  const moves = [
    invite.stopLoss == null
      ? null
      : { label: 'Stop loss', from: invite.prevStopLoss, to: invite.stopLoss },
    invite.takeProfit == null
      ? null
      : { label: 'Take profit', from: invite.prevTakeProfit, to: invite.takeProfit },
  ].filter(Boolean) as { label: string; from: number | null; to: number }[];

  return (
    <>
      <Heading>
        {invite.inviter.displayName} moved {moves.length > 1 ? 'their levels' : `their ${moves[0]?.label.toLowerCase() ?? 'levels'}`}
      </Heading>

      <div
        style={{
          border: `1px solid ${C.line2}`,
          borderRadius: 12,
          padding: 16,
          background: C.panel2,
          margin: '16px 0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.01em' }}>{invite.instrument}</span>
          <span
            style={{
              fontSize: 26,
              fontWeight: 900,
              color: invite.side === 'long' ? C.green : C.red,
              letterSpacing: '.06em',
            }}
          >
            {invite.side === 'long' ? 'BUY' : 'SELL'}
          </span>
        </div>
        <dl style={{ margin: '14px 0 0', display: 'grid', gap: 10 }}>
          {moves.map((m) => (
            <div
              key={m.label}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}
            >
              <dt style={{ fontSize: 13, color: C.muted }}>{m.label}</dt>
              <dd style={{ margin: 0, fontSize: 17, fontWeight: 700, fontFamily: C.mono }}>
                {/* Where it was, struck through, beside where it is now. The
                    move is the decision; the destination alone is not. */}
                <span style={{ color: C.faint, textDecoration: m.from == null ? 'none' : 'line-through' }}>
                  {m.from == null ? 'None' : fmtPrice(m.from)}
                </span>
                <span style={{ color: C.faint, margin: '0 8px' }}>→</span>
                <span>{fmtPrice(m.to)}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {invite.primaryError && !error && (
        <ErrorBox message={`Your last attempt did not go through: ${invite.primaryError}`} />
      )}
      {error && <ErrorBox message={error} />}

      {!invite.hasTarget && (
        <ErrorBox message="You have no open position this can be applied to. Link your position to theirs from the trade card, then ask them to send it again." />
      )}
      {invite.hasTarget && !canTrade && (
        <ErrorBox message="Turn Advanced Trading on in My Terminal ▸ Premium Features to change a live position. You can still dismiss this." />
      )}

      <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
        <BigButton
          label={busy || invite.sending ? 'SENDING…' : 'MOVE MINE TO MATCH'}
          sub={
            invite.hasTarget
              ? `On your ${invite.targetAccount ?? 'own'} position`
              : 'No position of yours to apply it to'
          }
          tone="go"
          onClick={onApply}
          disabled={busy || invite.sending || !ready}
        />
        <BigButton label="LEAVE MINE AS THEY ARE" tone="stop" onClick={onDismiss} disabled={busy || invite.sending} />
      </div>

      <p style={{ fontSize: 12, color: C.faint, margin: '14px 0 0', lineHeight: 1.5 }}>
        {/* HOW the position was found, said plainly. "We are provably in the same
            trade" and "you have one position that looks like it" are different
            degrees of confidence, and the reader should see which one this is
            before they press. */}
        {invite.hasTarget && invite.targetMatch === 'chain'
          ? 'This applies to the position of yours that is linked to theirs.'
          : invite.hasTarget
            ? `Matched your only open ${invite.instrument} ${invite.side === 'long' ? 'buy' : 'sell'} — not a linked position. Check it is the one you mean.`
            : 'Nothing on your account will change.'}{' '}
        Only the level they moved is sent; your other level is left exactly as it is.
      </p>
    </>
  );
}
