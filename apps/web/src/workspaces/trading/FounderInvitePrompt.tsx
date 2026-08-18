import { useEffect, useState } from 'react';
import { ApiError, api } from '../../api/client';
import type { FounderPerson } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { isFounder } from '../../auth/access';
import { C } from '../../theme/tokens';

// "Do you want [Founder] to join this trade?" — shown to the inviter once their
// own order has actually gone in, under the ticket's success message.
//
// It is offered from the FILL rather than from the ticket, and that is what
// keeps the invitation honest: `sourceOrderId` is the desk's own journal row, so
// the server can read the instrument, direction and stop off the trade it
// actually placed instead of trusting anything sent from here.
//
// Nothing is named in code. The recipients are whichever accounts hold the
// Founder role, read from the server, so a third Founder appears here the day
// they are granted the role and this component does not change.

interface Props {
  /** The desk journal row of the trade just placed. */
  sourceOrderId: string;
  instrument: string;
}

export function FounderInvitePrompt({ sourceOrderId, instrument }: Props) {
  const { user } = useAuth();
  const eligible = !!user && !user.isDemo && isFounder(user.roles);
  const [recipients, setRecipients] = useState<FounderPerson[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'dismissed'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eligible) return;
    let live = true;
    void api
      .founderRecipients()
      .then((r) => {
        if (!live) return;
        setRecipients(r.recipients);
        // With exactly one other Founder there is nothing to choose, so the
        // prompt asks the question by name and takes one press.
        if (r.recipients.length === 1) setPicked(r.recipients[0].userId);
      })
      .catch(() => {
        if (live) setRecipients([]);
      });
    return () => {
      live = false;
    };
  }, [eligible, sourceOrderId]);

  // Reset when a new fill comes through, so the prompt asks again about the new
  // trade rather than staying on the last one's answer.
  useEffect(() => {
    setState('idle');
    setError(null);
  }, [sourceOrderId]);

  if (!eligible || state === 'dismissed') return null;
  if (!recipients || recipients.length === 0) return null;

  if (state === 'sent') {
    const name = recipients.find((r) => r.userId === picked)?.displayName ?? 'They';
    return (
      <div style={{ ...box, borderColor: C.green }}>
        <div style={{ fontWeight: 700, color: C.green, fontSize: 13 }}>
          {name} has been invited to this trade
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
          They decide for themselves, at their own size. You will see what they chose on the desk.
        </div>
      </div>
    );
  }

  const single = recipients.length === 1;
  const name = recipients.find((r) => r.userId === picked)?.displayName ?? null;

  const send = async () => {
    if (!picked) return;
    setState('sending');
    setError(null);
    try {
      await api.createFounderInvite(picked, sourceOrderId);
      setState('sent');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The invitation could not be sent');
      setState('idle');
    }
  };

  return (
    <div style={box}>
      <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>
        {single && name
          ? `Do you want ${name} to join this trade?`
          : `Invite another Founder to this ${instrument} trade?`}
      </div>
      {!single && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {recipients.map((r) => (
            <button
              key={r.userId}
              type="button"
              onClick={() => setPicked(r.userId)}
              style={{
                padding: '7px 12px',
                borderRadius: 8,
                border: `1px solid ${picked === r.userId ? C.gold : C.line2}`,
                background: picked === r.userId ? 'rgba(235,203,116,.14)' : 'transparent',
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
      {error && (
        <div style={{ fontSize: 12, color: C.red, marginTop: 8, fontWeight: 600 }}>{error}</div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          type="button"
          onClick={() => void send()}
          disabled={!picked || state === 'sending'}
          style={{
            padding: '9px 16px',
            borderRadius: 8,
            border: 'none',
            background: C.gold,
            color: C.goldText,
            fontSize: 13,
            fontWeight: 800,
            cursor: !picked || state === 'sending' ? 'not-allowed' : 'pointer',
            opacity: !picked || state === 'sending' ? 0.5 : 1,
            fontFamily: C.sans,
          }}
        >
          {state === 'sending' ? 'Inviting…' : 'YES — INVITE'}
        </button>
        {/* No is genuinely nothing: no invitation, no notification, nothing
            recorded against the other Founder. */}
        <button
          type="button"
          onClick={() => setState('dismissed')}
          style={{
            padding: '9px 16px',
            borderRadius: 8,
            border: `1px solid ${C.line2}`,
            background: 'transparent',
            color: C.muted,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: C.sans,
          }}
        >
          NO
        </button>
      </div>
    </div>
  );
}

const box: React.CSSProperties = {
  border: `1px solid ${C.line2}`,
  borderRadius: 10,
  padding: '12px 14px',
  marginTop: 10,
  background: 'rgba(235,203,116,.06)',
};
