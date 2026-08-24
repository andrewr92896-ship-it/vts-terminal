import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../../api/client';
import type {
  FounderAccountView,
  FounderInvite,
  FounderLinks,
  FounderPerson,
  FounderShareConfig,
  FounderSizeMode,
  FounderSizePreview,
  FounderTestPlan,
  FounderTradeEvent,
  FounderTradePrefs,
} from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { isFounder } from '../../auth/access';
import { C } from '../../theme/tokens';
import { etStamp } from './tradeTime';

// Founder trade coordination, on the desk: the settings that decide what a
// joined trade goes out at, and the record of every invitation this Founder has
// sent or received.
//
// The blocking modal is where a decision is MADE; this is where it is reviewed
// afterwards — including the audit timeline and the funded screenshot, which is
// the point of asking for one. Founder-only, and rendered as nothing for
// anybody else: the server refuses these routes regardless, so this is the
// discoverability half rather than the protection.

const STATUS_LABEL: Record<FounderInvite['status'], string> = {
  primary_pending: 'Waiting on their trade decision',
  funded_pending: 'Waiting on their funded decision',
  proof_pending: 'Waiting on their funded screenshot',
  complete: 'Complete',
};

export function FounderTradePanel() {
  const { user } = useAuth();
  const eligible = !!user && !user.isDemo && isFounder(user.roles);
  const [invites, setInvites] = useState<FounderInvite[]>([]);
  const [prefs, setPrefs] = useState<FounderTradePrefs | null>(null);
  const [accounts, setAccounts] = useState<FounderAccountView[]>([]);
  const [recipients, setRecipients] = useState<FounderPerson[]>([]);
  const [config, setConfig] = useState<FounderShareConfig | null>(null);
  const [links, setLinks] = useState<FounderLinks>({ sending: [], receiving: [] });
  const [canTrade, setCanTrade] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!eligible) return;
    try {
      const res = await api.founderTrades();
      setInvites(res.invites);
      setPrefs(res.prefs);
      setAccounts(res.accounts);
      setRecipients(res.recipients);
      setConfig(res.config);
      setLinks(res.links);
      setCanTrade(res.canTrade);
    } catch {
      /* leave whatever is on screen */
    }
  }, [eligible]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!eligible || !prefs) return null;

  return (
    <section
      style={{
        border: `1px solid ${C.line}`,
        borderRadius: 12,
        background: C.panel,
        padding: 18,
        marginTop: 18,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Founder trades</h3>
      <p style={{ fontSize: 12.5, color: C.muted, margin: '6px 0 16px', lineHeight: 1.5 }}>
        Invite another Founder onto a trade after you place it. They decide for themselves, at their
        own size, and place any funded trade at the firm by hand.
      </p>

      <Links me={user!.id} links={links} recipients={recipients} onSaved={setLinks} />

      {config && <ShareSettings config={config} onSaved={setConfig} />}

      <SizeSettings
        prefs={prefs}
        accounts={accounts}
        canTrade={canTrade}
        onSaved={(p) => setPrefs(p)}
      />

      <Notifications prefs={prefs} onSaved={(p) => setPrefs(p)} />

      <TestDrill canTrade={canTrade} onSent={() => void load()} />

      {invites.length === 0 ? (
        <div style={{ fontSize: 13, color: C.faint, marginTop: 16 }}>No invitations yet.</div>
      ) : (
        <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
          {invites.map((inv) => (
            <InviteRow
              key={inv.id}
              invite={inv}
              expanded={open === inv.id}
              onToggle={() => setOpen(open === inv.id ? null : inv.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// WHOSE TRADES REACH WHOM — both directions, on one card.
//
// A link is a row between two Founders, and **EITHER END CAN SWITCH IT ON**.
// Wanting somebody's trades sent to you should not mean walking them through
// their own settings on their own device — and because a link shows on both
// parties' screens, nobody can be sending or receiving through something they
// cannot see.
//
// The two directions are independent: ticking "my trades go to Dale" says
// nothing about whether Dale's come to you.
function Links({
  me,
  links,
  recipients,
  onSaved,
}: {
  me: string;
  links: FounderLinks;
  recipients: FounderPerson[];
  onSaved: (l: FounderLinks) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const toggle = async (senderUserId: string, recipientUserId: string, on: boolean) => {
    setSaving(true);
    setProblem(null);
    try {
      onSaved((await api.setFounderLink(senderUserId, recipientUserId, on)).links);
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : 'That could not be saved');
    } finally {
      setSaving(false);
    }
  };

  if (recipients.length === 0) {
    return (
      <div style={{ ...cardStyle, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Whose trades go where</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
          There is nobody else with Founder access yet.
        </div>
      </div>
    );
  }

  const sending = new Set(links.sending.map((f) => f.userId));
  const receiving = new Set(links.receiving.map((f) => f.userId));

  return (
    <div style={{ ...cardStyle, marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Whose trades go where</div>
      <div style={{ fontSize: 12, color: C.muted, margin: '6px 0 14px', lineHeight: 1.5 }}>
        Each direction is its own switch, and either person can set it. Only trades that fill are
        sent — a limit or stop order that has not triggered is not.
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        <div>
          <div style={groupLabel}>My trades go to</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {recipients.map((r) => (
              <Tick
                key={`out-${r.userId}`}
                label={r.displayName}
                hint={`Every trade you place is put in front of ${r.displayName} to join or decline.`}
                checked={sending.has(r.userId)}
                disabled={saving}
                onChange={(v) => void toggle(me, r.userId, v)}
              />
            ))}
          </div>
        </div>

        <div>
          <div style={groupLabel}>I receive trades from</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {recipients.map((r) => (
              <Tick
                key={`in-${r.userId}`}
                label={r.displayName}
                hint={`Their trades come to you to join or decline. You can switch this on yourself.`}
                checked={receiving.has(r.userId)}
                disabled={saving}
                onChange={(v) => void toggle(r.userId, me, v)}
              />
            ))}
          </div>
        </div>
      </div>
      {problem && <div style={{ fontSize: 12, color: C.red, marginTop: 10, fontWeight: 600 }}>{problem}</div>}
    </div>
  );
}

// NOTIFICATIONS, BOTH DIRECTIONS.
//
// Two genuinely different questions, so they are two blocks rather than one
// setting: what reaches me when somebody sends ME a trade, and what I hear back
// about a trade I sent THEM.
//
// The defaults differ for a reason. Receiving defaults to repeating, because it
// is asking somebody to act and the workflow is not resolved until they do.
// Hearing back defaults to normal — it is a note about a decision that has
// already been made, so there is nothing outstanding to nag about.
function Notifications({
  prefs,
  onSaved,
}: {
  prefs: FounderTradePrefs;
  onSaved: (p: FounderTradePrefs) => void;
}) {
  const [every, setEvery] = useState(String(prefs.reminderEverySeconds));
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async (patch: Parameters<typeof api.saveFounderPrefs>[0]) => {
    setSaving(true);
    setProblem(null);
    try {
      onSaved((await api.saveFounderPrefs(patch)).prefs);
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : 'That could not be saved');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ ...cardStyle, marginTop: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Notifications</div>
      <div style={{ fontSize: 12, color: C.muted, margin: '6px 0 14px', lineHeight: 1.5 }}>
        Opening the terminal is what answers a trade — acknowledging the alert on your phone never
        resolves it.
      </div>

      <div style={groupLabel}>WHEN A TRADE IS SENT TO ME</div>
      <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
        <label style={label}>
          How loud
          <select
            value={prefs.reminderLevel}
            disabled={saving}
            onChange={(e) => void save({ reminderLevel: e.target.value as FounderTradePrefs['reminderLevel'] })}
            style={field}
          >
            <option value="silent">Silent — waiting for me when I look</option>
            <option value="normal">Normal</option>
            <option value="alert">Alert — through quiet hours</option>
            <option value="repeating">Repeating — until I answer it</option>
          </select>
        </label>
        <label style={label}>
          Remind me every (seconds)
          <input
            value={every}
            onChange={(e) => setEvery(e.target.value)}
            onBlur={() => void save({ reminderEverySeconds: Math.max(60, Math.min(3600, Number(every) || 300)) })}
            inputMode="numeric"
            style={field}
          />
        </label>
      </div>

      <div style={groupLabel}>WHEN I SEND A TRADE TO SOMEBODY</div>
      <div style={{ display: 'grid', gap: 10 }}>
        <Tick
          label="Tell me what they decided"
          hint="Whether they joined, what they chose for their funded account, and when their screenshot arrives."
          checked={prefs.notifyOnResponse}
          disabled={saving}
          onChange={(v) => void save({ notifyOnResponse: v })}
        />
        {prefs.notifyOnResponse && (
          <label style={label}>
            How loud
            <select
              value={prefs.responseLevel}
              disabled={saving}
              onChange={(e) => void save({ responseLevel: e.target.value as FounderTradePrefs['responseLevel'] })}
              style={field}
            >
              <option value="silent">Silent — waiting for me when I look</option>
              <option value="normal">Normal</option>
              <option value="alert">Alert — through quiet hours</option>
            </select>
          </label>
        )}
      </div>
      {problem && <div style={{ fontSize: 12, color: C.red, marginTop: 10, fontWeight: 600 }}>{problem}</div>}
    </div>
  );
}

// WHAT TRAVELS WITH AN INVITATION — set once, for everybody.
//
// This is the group's rule rather than one trader's: two Founders disagreeing
// about whether a target is copied would make one invitation mean two different
// things depending on who sent it. Any Founder can change it and it applies to
// every invitation from then on.
//
// The SIZE is deliberately absent and must stay absent — it is always the
// joiner's own, and a switch that made it follow the inviter's is the one thing
// this feature must never have.
function ShareSettings({
  config,
  onSaved,
}: {
  config: FounderShareConfig;
  onSaved: (c: FounderShareConfig) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async (patch: Partial<FounderShareConfig>) => {
    setSaving(true);
    setProblem(null);
    try {
      onSaved((await api.saveFounderConfig(patch)).config);
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : 'That could not be saved');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ ...cardStyle, marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>What is sent with an invitation</div>
      <div style={{ fontSize: 12, color: C.muted, margin: '6px 0 12px', lineHeight: 1.5 }}>
        Applies to everyone, whoever sends the trade. The instrument and direction always travel; the
        size is always the joiner's own.
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        <Tick
          label="Stop loss"
          hint="The sender's initial stop, as the same price level."
          checked={config.copyStopLoss}
          disabled={saving}
          onChange={(v) => void save({ copyStopLoss: v })}
        />
        <Tick
          label="Take profit"
          hint="The sender's target, as the same price level."
          checked={config.copyTakeProfit}
          disabled={saving}
          onChange={(v) => void save({ copyTakeProfit: v })}
        />
      </div>
      {problem && <div style={{ fontSize: 12, color: C.red, marginTop: 8, fontWeight: 600 }}>{problem}</div>}
    </div>
  );
}

function Tick({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 17, height: 17, marginTop: 1, accentColor: C.gold, flex: 'none' }}
      />
      <span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{label}</span>
        <span style={{ display: 'block', fontSize: 11.5, color: C.faint, marginTop: 2 }}>{hint}</span>
      </span>
    </label>
  );
}

// THE TEST DRILL — a real order, at the venue's minimum size, on a liquid pair
// that is never EUR/USD.
//
// It says exactly what it is about to place before it places it. A button that
// puts a real order on somebody's account without stating the pair, the size and
// the levels first is not one anybody should press.
function TestDrill({ canTrade, onSent }: { canTrade: boolean; onSent: () => void }) {
  const [plan, setPlan] = useState<FounderTestPlan | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'confirm' | 'sending' | 'sent'>('idle');
  const [problem, setProblem] = useState<string | null>(null);

  const preview = async () => {
    setState('loading');
    setProblem(null);
    try {
      const { plan: p } = await api.founderTestPlan();
      setPlan(p);
      setState('confirm');
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : 'The test could not be prepared');
      setState('idle');
    }
  };

  const run = async () => {
    setState('sending');
    setProblem(null);
    try {
      await api.runFounderTest();
      setState('sent');
      onSent();
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : 'The test could not be sent');
      setState('confirm');
    }
  };

  return (
    <div style={{ ...cardStyle, marginTop: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Test the whole thing</div>
      <div style={{ fontSize: 12, color: C.muted, margin: '6px 0 12px', lineHeight: 1.5 }}>
        Places a <b>real</b> trade at the smallest size the broker allows, on a major pair other than
        EUR/USD, and sends the invitation <b>to you</b> — so you get the alert and can walk through
        joining it, the funded question and the screenshot yourself. Everything is marked as a test.
        Joining places a second trade of the same size. Close them both when you are done.
      </div>

      {problem && <div style={{ fontSize: 12, color: C.red, marginBottom: 10, fontWeight: 600 }}>{problem}</div>}

      {state === 'sent' ? (
        <div style={{ fontSize: 12.5, color: C.green, fontWeight: 700 }}>
          Test sent — the invitation should reach you in a moment. The position is open on your
          account; close it when you are done.
        </div>
      ) : state === 'confirm' && plan ? (
        <div style={{ border: `1px solid ${C.line2}`, borderRadius: 9, padding: 12, background: C.bg }}>
          <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.7, fontFamily: C.mono }}>
            Buy <b>{plan.units}</b> units of <b>{plan.instrument}</b> at market
            {plan.ask == null ? '' : ` (~${plan.ask})`}
            <br />
            Stop {plan.stopLoss ?? '—'} · target {plan.takeProfit ?? '—'}
            <br />
            On {plan.accountLabel}, sent to you
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" onClick={() => void run()} disabled={state !== 'confirm'} style={goldBtn}>
              Place it and send the test
            </button>
            <button type="button" onClick={() => setState('idle')} style={ghostBtn}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void preview()}
          disabled={state === 'loading' || !canTrade}
          style={{ ...ghostBtn, opacity: canTrade ? 1 : 0.5 }}
        >
          {state === 'loading' ? 'Checking…' : 'Send a test'}
        </button>
      )}
    </div>
  );
}

// The recipient's own size. Set here as well as in the modal, since the useful
// moment to set it is before an invitation arrives at 3am rather than during
// one.
function SizeSettings({
  prefs,
  accounts,
  canTrade,
  onSaved,
}: {
  prefs: FounderTradePrefs;
  accounts: FounderAccountView[];
  canTrade: boolean;
  onSaved: (p: FounderTradePrefs) => void;
}) {
  const [mode, setMode] = useState<FounderSizeMode>(prefs.sizeMode);
  const [units, setUnits] = useState(prefs.defaultUnits == null ? '' : String(prefs.defaultUnits));
  const [pct, setPct] = useState(prefs.sizePct == null ? '' : String(prefs.sizePct));
  const [round, setRound] = useState(prefs.pctRound);
  const [increment, setIncrement] = useState(String(prefs.pctRoundIncrement));
  const [connectionId, setConnectionId] = useState(prefs.defaultConnectionId ?? '');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<FounderSizePreview | null>(null);

  // THE PREVIEW IS READ FROM THE SERVER, from the same code that will size the
  // join — not worked out here. A second calculation on this screen is exactly
  // how a preview comes to promise a size the join does not place.
  const loadPreview = useCallback(async () => {
    if (prefs.sizeMode !== 'account_pct') {
      setPreview(null);
      return;
    }
    try {
      setPreview((await api.founderSizePreview()).preview);
    } catch {
      /* a preview is informational; leave whatever was last read */
    }
  }, [prefs.sizeMode, prefs.sizePct, prefs.pctRound, prefs.pctRoundIncrement, prefs.defaultConnectionId]);
  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const save = async () => {
    setSaving(true);
    setNote(null);
    try {
      const n = Number(units);
      const p = Number(pct);
      const inc = Number(increment);
      const { prefs: next } = await api.saveFounderPrefs({
        sizeMode: mode,
        // Both are sent whichever mode is chosen, so switching back and forth
        // does not lose the other one — only the mode decides which is read.
        defaultUnits: Number.isFinite(n) && n > 0 ? n : null,
        sizePct: Number.isFinite(p) && p > 0 && p <= 100 ? p : null,
        pctRound: round,
        ...(Number.isFinite(inc) && inc > 0 ? { pctRoundIncrement: inc } : {}),
        defaultConnectionId: connectionId || null,
      });
      onSaved(next);
      setNote('Saved');
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : 'That could not be saved');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: C.text }}>
        When you join a trade
      </div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.5 }}>
        Your own size, on your own account. Nothing is copied from whoever invited you — the
        instrument, the direction and their initial stop are, and the size is yours.
      </div>
      {!canTrade && (
        <div style={{ fontSize: 12, color: C.amber, marginBottom: 12, fontWeight: 600 }}>
          Advanced Trading is off for your account, so you cannot join a trade until it is on.
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
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
              ...ghostBtn,
              ...(mode === key ? { borderColor: C.gold, color: C.gold } : null),
            }}
          >
            {text}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        {mode === 'units' ? (
          <label style={label}>
            Position size (units)
            <input value={units} onChange={(e) => setUnits(e.target.value)} inputMode="decimal" style={field} />
          </label>
        ) : (
          <label style={label}>
            Share of account value (%)
            <input value={pct} onChange={(e) => setPct(e.target.value)} inputMode="decimal" style={field} />
          </label>
        )}
        <label style={label}>
          Account
          <select value={connectionId} onChange={(e) => setConnectionId(e.target.value)} style={field}>
            <option value="">Not set</option>
            {accounts.map((a) => (
              <option key={a.connectionId} value={a.connectionId}>
                {a.label} · {a.broker.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      </div>
      {mode === 'account_pct' && (
        <>
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 10, lineHeight: 1.5 }}>
            The share of your account value the position&rsquo;s estimated margin uses. It is worked
            out again at the moment you join, from your account and your broker&rsquo;s own margin
            requirement — never from a size saved here, and never from the sender&rsquo;s size.
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, color: C.muted }}>
            <input
              type="checkbox"
              checked={round}
              onChange={(e) => setRound(e.target.checked)}
              style={{ accentColor: C.gold, width: 15, height: 15 }}
            />
            Round calculated $/pip
          </label>
          {round && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12, color: C.muted }}>
              <span>To the nearest</span>
              <input
                value={increment}
                onChange={(e) => setIncrement(e.target.value)}
                inputMode="decimal"
                aria-label="Round to the nearest, per pip"
                style={{ ...field, width: 78, textAlign: 'right' }}
              />
              <span>per pip — always rounded down</span>
            </div>
          )}
          <SizePreview preview={preview} />
        </>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          style={{
            padding: '9px 16px',
            borderRadius: 8,
            border: 'none',
            background: C.gold,
            color: C.goldText,
            fontSize: 13,
            fontWeight: 700,
            cursor: saving ? 'wait' : 'pointer',
            fontFamily: C.sans,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {note && <span style={{ fontSize: 12, color: C.muted }}>{note}</span>}
      </div>
    </div>
  );
}

// What the saved share currently comes to. INFORMATIONAL: none of these numbers
// is stored, and the join re-derives every one of them at the moment it sends.
function SizePreview({ preview }: { preview: FounderSizePreview | null }) {
  if (!preview || preview.mode !== 'account_pct') return null;
  const ccy = (v: number | null): string =>
    v == null ? '—' : preview.currency === 'USD' ? `$${round2(v)}` : `${round2(v)} ${preview.currency}`;
  return (
    <div
      style={{
        marginTop: 12,
        padding: '10px 12px',
        borderRadius: 8,
        border: `1px solid ${C.line2}`,
        background: C.bg,
        fontSize: 11.5,
        fontFamily: C.mono,
        color: C.muted,
        lineHeight: 1.7,
      }}
    >
      <div style={{ fontFamily: C.sans, fontWeight: 700, color: C.text, marginBottom: 4 }}>
        Right now, that would be
      </div>
      {preview.problem ? (
        <div style={{ color: C.amber, fontFamily: C.sans }}>{preview.problem}</div>
      ) : (
        <>
          <div>{`Target ${preview.targetPct ?? '—'}% · account value ${ccy(preview.accountValue)}`}</div>
          <div>
            {`${preview.units == null ? '—' : preview.units.toLocaleString('en-US')} units · ${ccy(preview.perStep)}/pip`}
          </div>
          <div>
            {`Margin ${ccy(preview.cost)} · ${
              preview.actualPct == null ? '—' : `${round2(preview.actualPct)}% of account value`
            }${preview.rounded ? ' after rounding' : ''}`}
          </div>
          {preview.instrument && (
            <div style={{ color: C.faint }}>
              {`Priced on ${preview.instrument}${preview.accountLabel ? ` · ${preview.accountLabel}` : ''}. Another instrument sizes differently.`}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const round2 = (v: number): number => Number(v.toFixed(2));

function InviteRow({
  invite,
  expanded,
  onToggle,
}: {
  invite: FounderInvite;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [events, setEvents] = useState<FounderTradeEvent[] | null>(null);
  const [proof, setProof] = useState<string | null>(null);
  const long = invite.side === 'long';
  const other = invite.isRecipient ? invite.inviter : invite.recipient;

  useEffect(() => {
    if (!expanded || events) return;
    void api
      .founderInvite(invite.id)
      .then((r) => setEvents(r.events))
      .catch(() => setEvents([]));
  }, [expanded, events, invite.id]);

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, background: C.panel2 }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '11px 13px',
          background: 'transparent',
          border: 'none',
          color: C.text,
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: C.sans,
        }}
      >
        <span style={{ fontFamily: C.mono, fontWeight: 700, fontSize: 13 }}>{invite.instrument}</span>
        <span style={{ color: long ? C.green : C.red, fontWeight: 800, fontSize: 12 }}>
          {long ? 'BUY' : 'SELL'}
        </span>
        <span style={{ fontSize: 12, color: C.muted, flex: 1, minWidth: 0 }}>
          {invite.isRecipient ? `from ${other.displayName}` : `to ${other.displayName}`}
        </span>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: invite.status === 'complete' ? C.green : C.amber,
          }}
        >
          {STATUS_LABEL[invite.status]}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: '0 13px 13px', fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
          <div>
            Their entry {fmt(invite.entryPrice)} · stop{' '}
            {invite.stopLoss == null ? 'none set' : fmt(invite.stopLoss)}
          </div>
          <div>
            Trade decision:{' '}
            <b style={{ color: C.text }}>
              {invite.primaryDecision === 'joined'
                ? `Joined${invite.primaryUnits ? ` (${invite.primaryUnits} units)` : ''}`
                : invite.primaryDecision === 'declined'
                  ? 'Did not join'
                  : 'Not yet answered'}
            </b>
          </div>
          <div>
            Funded decision:{' '}
            <b style={{ color: C.text }}>
              {invite.fundedDecision === 'yes'
                ? invite.hasProof
                  ? 'Placed and verified'
                  : 'Placing — screenshot still owed'
                : invite.fundedDecision === 'no'
                  ? 'Not placed'
                  : 'Not yet answered'}
            </b>
          </div>
          {invite.hasProof && (
            <div style={{ marginTop: 10 }}>
              {proof ? (
                <img
                  src={proof}
                  alt="The funded trade screenshot"
                  style={{ width: '100%', maxWidth: 420, borderRadius: 8, border: `1px solid ${C.line2}` }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => void api.founderProof(invite.id).then((r) => setProof(r.image)).catch(() => {})}
                  style={linkBtn}
                >
                  Show the funded screenshot
                </button>
              )}
            </div>
          )}
          {events && events.length > 0 && (
            <ol style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
              {events.map((e) => (
                <li key={e.id} style={{ fontSize: 11.5, color: C.faint, fontFamily: C.mono }}>
                  {etStamp(e.createdAt)} · {e.kind}
                  {e.detail ? ` — ${e.detail}` : ''}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function fmt(v: number | null): string {
  return v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

const goldBtn: React.CSSProperties = {
  padding: '9px 16px',
  borderRadius: 8,
  border: 'none',
  background: C.gold,
  color: C.goldText,
  fontSize: 13,
  fontWeight: 800,
  cursor: 'pointer',
  fontFamily: C.sans,
};

const ghostBtn: React.CSSProperties = {
  padding: '9px 16px',
  borderRadius: 8,
  border: `1px solid ${C.line2}`,
  background: 'transparent',
  color: C.text,
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: C.sans,
};

const groupLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '.08em',
  color: C.faint,
  marginBottom: 8,
};

const cardStyle: React.CSSProperties = {
  border: `1px solid ${C.line2}`,
  borderRadius: 10,
  padding: 14,
  background: C.panel2,
};

const label: React.CSSProperties = {
  display: 'grid',
  gap: 5,
  fontSize: 11.5,
  color: C.faint,
  fontWeight: 600,
};

const field: React.CSSProperties = {
  padding: '9px 11px',
  borderRadius: 8,
  border: `1px solid ${C.line2}`,
  background: C.bg,
  color: C.text,
  fontSize: 13,
  fontFamily: C.mono,
};

const linkBtn: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${C.line2}`,
  borderRadius: 8,
  color: C.text,
  fontSize: 12,
  fontWeight: 600,
  padding: '7px 12px',
  cursor: 'pointer',
  fontFamily: C.sans,
};
