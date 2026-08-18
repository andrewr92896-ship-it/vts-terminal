import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../api/client';
import type { FounderAccountView, FounderInvite, FounderTradePrefs } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { isFounder } from '../auth/access';
import { C } from '../theme/tokens';
import { fileToScaledDataUrl } from '../lib/image';
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

export interface FounderTradeModalProps {
  /** Take the recipient to the Funded section once a primary decision is made. */
  onGoFunded: () => void;
}

export function FounderTradeModal({ onGoFunded }: FounderTradeModalProps) {
  const { user } = useAuth();
  const { isPhone } = useResponsive();
  const [invites, setInvites] = useState<FounderInvite[]>([]);
  const [prefs, setPrefs] = useState<FounderTradePrefs | null>(null);
  const [accounts, setAccounts] = useState<FounderAccountView[]>([]);
  const [canTrade, setCanTrade] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which invitation the recipient has already been routed to Funded for, so the
  // navigation happens once per workflow rather than on every poll.
  const routed = useRef(new Set<string>());
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

  // Once a primary decision is made, take the recipient to Funded. The modal
  // does not depend on the navigation working — it stays up wherever they are —
  // so a failed route costs nothing.
  useEffect(() => {
    if (!current) return;
    if (current.status !== 'funded_pending') return;
    if (routed.current.has(current.id)) return;
    routed.current.add(current.id);
    onGoFunded();
  }, [current, onGoFunded]);

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
            {behind + 1} TRADE INVITATIONS WAITING · THIS IS THE OLDEST
          </div>
        )}

        {current.status === 'primary_pending' && (
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

        {current.status === 'funded_pending' && (
          <FundedStep
            invite={current}
            busy={busy}
            error={error}
            onYes={() => act(() => api.founderFundedDecision(current.id, 'yes'))}
            onNo={() => act(() => api.founderFundedDecision(current.id, 'no'))}
          />
        )}

        {current.status === 'proof_pending' && (
          <ProofStep
            invite={current}
            busy={busy}
            error={error}
            onUpload={(image) => act(() => api.uploadFounderProof(current.id, image))}
            onError={(m) => setError(m)}
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
  const size = fmtUnits(prefs?.defaultUnits ?? invite.recipientUnits);
  const account = accounts.find((a) => a.connectionId === prefs?.defaultConnectionId) ?? null;
  const ready = !!size && !!account && canTrade;

  return (
    <>
      <Heading>{invite.inviter.displayName} invited you to a trade</Heading>
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
        Either answer moves on to your funded account, which is a separate decision.
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
  const [units, setUnits] = useState(prefs?.defaultUnits == null ? '' : String(prefs.defaultUnits));
  const [connectionId, setConnectionId] = useState(
    prefs?.defaultConnectionId ?? accounts[0]?.connectionId ?? '',
  );
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    const n = Number(units);
    if (!Number.isFinite(n) || n <= 0) return setProblem('Enter a position size greater than zero');
    if (!connectionId) return setProblem('Choose the account a joined trade goes to');
    setSaving(true);
    setProblem(null);
    try {
      const { prefs: next } = await api.saveFounderPrefs({ defaultUnits: n, defaultConnectionId: connectionId });
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
      <div style={{ display: 'grid', gap: 10 }}>
        <input
          value={units}
          onChange={(e) => setUnits(e.target.value)}
          inputMode="decimal"
          placeholder="e.g. 1000"
          aria-label="Your position size in units"
          style={inputStyle}
        />
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

// ---- step 2: the funded account ----

function FundedStep({
  invite,
  busy,
  error,
  onYes,
  onNo,
}: {
  invite: FounderInvite;
  busy: boolean;
  error: string | null;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <>
      <Heading>Are you placing this on your funded account?</Heading>
      <TradeFacts invite={invite} />
      {error && <ErrorBox message={error} />}
      <div style={{ display: 'grid', gap: 12 }}>
        <BigButton
          label="YES — I AM PLACING IT"
          sub="You place it at the firm; the terminal will ask for a screenshot"
          tone="go"
          onClick={onYes}
          disabled={busy}
        />
        <BigButton label="NO — DO NOT JOIN FUNDED" tone="stop" onClick={onNo} disabled={busy} />
      </div>
      <p style={{ fontSize: 12, color: C.faint, margin: '14px 0 0', lineHeight: 1.5 }}>
        {invite.primaryDecision === 'joined'
          ? 'You joined the terminal trade. This is a separate decision.'
          : 'You did not join the terminal trade. This is a separate decision.'}{' '}
        The terminal never places a funded trade for you.
      </p>
    </>
  );
}

// ---- step 3: the screenshot ----

function ProofStep({
  invite,
  busy,
  error,
  onUpload,
  onError,
}: {
  invite: FounderInvite;
  busy: boolean;
  error: string | null;
  onUpload: (image: string) => void;
  onError: (message: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setPreparing(true);
    try {
      // Scaled in the browser before it is sent, the same way study-guide
      // screenshots are — a phone photo is several megabytes untouched.
      const dataUrl = await fileToScaledDataUrl(file, 1400, 0.82);
      setPreview(dataUrl);
      onUpload(dataUrl);
    } catch {
      onError('That image could not be read — try another screenshot');
    } finally {
      setPreparing(false);
    }
  };

  const working = busy || preparing;
  return (
    <>
      <Heading>Funded trade verification required</Heading>
      <TradeFacts invite={invite} />
      {error && <ErrorBox message={error} />}
      <p style={{ fontSize: 14, color: C.muted, margin: '0 0 14px', lineHeight: 1.5 }}>
        Upload a screenshot of your funded trade. This is what finishes the workflow — the alerts
        keep going until it is saved.
      </p>
      {preview && (
        <img
          src={preview}
          alt="The screenshot about to be saved"
          style={{ width: '100%', borderRadius: 10, border: `1px solid ${C.line2}`, marginBottom: 14 }}
        />
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={(e) => void pick(e.target.files?.[0])}
        style={{ display: 'none' }}
      />
      <BigButton
        label={working ? 'UPLOADING…' : 'UPLOAD SCREENSHOT'}
        tone="go"
        onClick={() => fileRef.current?.click()}
        disabled={working}
      />
    </>
  );
}
