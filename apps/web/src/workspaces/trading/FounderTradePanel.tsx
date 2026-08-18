import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../../api/client';
import type {
  FounderAccountView,
  FounderInvite,
  FounderPerson,
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

      <AutoSend prefs={prefs} recipients={recipients} onSaved={(p) => setPrefs(p)} />

      <SizeSettings
        prefs={prefs}
        accounts={accounts}
        canTrade={canTrade}
        onSaved={(p) => setPrefs(p)}
      />

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

// AUTO-SEND — the standing choice to put every trade you place in front of one
// other Founder, instead of being asked about each one.
//
// It is a setting rather than a per-trade question because that is what it
// actually is: a trader either works this way with somebody or they do not, and
// asking on every fill is a prompt to click past. Off by default and per person,
// so it is never symmetric by accident — switching yours on says nothing about
// whether theirs is on.
function AutoSend({
  prefs,
  recipients,
  onSaved,
}: {
  prefs: FounderTradePrefs;
  recipients: FounderPerson[];
  onSaved: (p: FounderTradePrefs) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Who a tick would send to: whoever is chosen, or the only other Founder there
  // is. With one other person there is nothing to pick, so the row is one tick.
  const target = prefs.autoInviteUserId ?? (recipients.length === 1 ? recipients[0].userId : null);
  const targetName = recipients.find((r) => r.userId === target)?.displayName ?? null;

  const save = async (patch: { autoInvite?: boolean; autoInviteUserId?: string | null }) => {
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

  if (recipients.length === 0) {
    return (
      <div style={{ ...cardStyle, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Send my trades to another Founder</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
          There is nobody else with Founder access to send to yet.
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...cardStyle, marginBottom: 12 }}>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={prefs.autoInvite}
          disabled={saving || !target}
          onChange={(e) =>
            void save(
              e.target.checked
                ? { autoInvite: true, autoInviteUserId: target }
                : { autoInvite: false },
            )
          }
          style={{ width: 18, height: 18, marginTop: 1, accentColor: C.gold, flex: 'none' }}
        />
        <span>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
            Send my trades to {targetName ?? 'another Founder'}
          </span>
          <span style={{ display: 'block', fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
            Every trade you place is put in front of them to join or decline, without asking you each
            time. Only trades that fill are sent — a limit or stop order that has not triggered is not.
          </span>
        </span>
      </label>

      {/* Only worth a picker once there is a choice to make. */}
      {recipients.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {recipients.map((r) => (
            <button
              key={r.userId}
              type="button"
              disabled={saving}
              onClick={() => void save({ autoInviteUserId: r.userId })}
              style={{
                padding: '7px 12px',
                borderRadius: 8,
                border: `1px solid ${target === r.userId ? C.gold : C.line2}`,
                background: target === r.userId ? 'rgba(235,203,116,.14)' : 'transparent',
                color: C.text,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: C.sans,
              }}
            >
              {r.displayName}
            </button>
          ))}
        </div>
      )}
      {problem && <div style={{ fontSize: 12, color: C.red, marginTop: 8, fontWeight: 600 }}>{problem}</div>}
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
  const [units, setUnits] = useState(prefs.defaultUnits == null ? '' : String(prefs.defaultUnits));
  const [connectionId, setConnectionId] = useState(prefs.defaultConnectionId ?? '');
  const [every, setEvery] = useState(String(prefs.reminderEverySeconds));
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setNote(null);
    try {
      const n = Number(units);
      const { prefs: next } = await api.saveFounderPrefs({
        defaultUnits: Number.isFinite(n) && n > 0 ? n : null,
        defaultConnectionId: connectionId || null,
        reminderEverySeconds: Math.max(60, Math.min(3600, Number(every) || 300)),
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
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <label style={label}>
          Position size (units)
          <input value={units} onChange={(e) => setUnits(e.target.value)} inputMode="decimal" style={field} />
        </label>
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
        <label style={label}>
          Remind me every (seconds)
          <input value={every} onChange={(e) => setEvery(e.target.value)} inputMode="numeric" style={field} />
        </label>
      </div>
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
