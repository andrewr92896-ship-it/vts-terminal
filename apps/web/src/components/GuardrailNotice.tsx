import { useState, type CSSProperties } from 'react';
import { api, ApiError } from '../api/client';
import { Icon } from './Icon';
import type { GuardrailHit } from '../api/types';

// What a user sees when VTS AI declines a financial-advice request.
//
// The tone here is the whole point, and it is a deliberate choice against how
// this kind of notice is usually written. Somebody who asked "is now a good time
// to buy" is not an attacker — they are a customer using a trading terminal in
// the most natural way imaginable, and most of them have no idea the question is
// a regulatory problem rather than a rude one. A stern compliance banner reads as
// an accusation and is the kind of thing that makes a paying user close the tab.
//
// So the card:
//   • says what happened in one plain sentence,
//   • says outright that both sides make mistakes and that this may be one,
//   • gives them a button to say so, and
//   • only then mentions the pause, when there is one.
//
// It also carries the two privacy facts the owner asked to be stated wherever
// this comes up: conversations with the AI can be reviewed, and trading data
// cannot.

const CARD_WARN = 'rgba(235,203,116,.09)';
const CARD_STOP = 'rgba(255,140,120,.09)';

export function GuardrailNotice({
  hit,
  onDismiss,
}: {
  hit: GuardrailHit;
  onDismiss?: () => void;
}) {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function flag() {
    setSending(true);
    setError('');
    try {
      await api.disputeGuardrail(hit.violationId);
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send that just now');
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ ...card, background: hit.timedOut ? CARD_STOP : CARD_WARN }}>
      <div style={head}>
        <Icon name="shield" size={14} color={hit.timedOut ? '#FFB4A2' : '#EBCB74'} />
        <span style={{ fontWeight: 700, fontSize: 12.5, color: '#eef3ff' }}>
          {hit.timedOut ? 'AI paused for 30 minutes' : 'A note about that question'}
        </span>
      </div>

      <p style={para}>
        VTS AI can explain how things work, but it can’t give financial or investment
        advice — what to buy or sell, when to trade, or how to size a position.
        That’s a rule we hold to everywhere in the terminal.
      </p>

      {hit.timedOut && (
        <p style={para}>
          Because this has come up more than once today, AI features are paused for
          30 minutes. Everything else in the terminal keeps working, and you can
          still reach support at any time.
        </p>
      )}

      <p style={para}>
        Our system gets this wrong sometimes, and so do all of us — if your question
        wasn’t what it looked like, no harm done. Just steer clear of asking the AI
        what to do with your money and you’ll never see this again.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
        {sent ? (
          <span style={{ fontSize: 11.5, color: '#8fe3c0' }}>
            Thanks — someone will take a look at this.
          </span>
        ) : (
          <button type="button" onClick={() => void flag()} disabled={sending} style={btn}>
            {sending ? 'Sending…' : 'I think the AI made a mistake'}
          </button>
        )}
        {onDismiss && !sent && (
          <button type="button" onClick={onDismiss} style={{ ...btn, borderColor: 'transparent' }}>
            Dismiss
          </button>
        )}
      </div>

      {error && <div style={{ fontSize: 11.5, color: '#ffb4ab', marginTop: 8 }}>{error}</div>}

      <p style={fine}>
        Conversations with VTS AI aren’t private — the team can review them. Your
        trading data is separate: positions, results, balances and broker keys are
        never read by administrators, and only a software developer can reach them,
        only to keep them secure.
      </p>
    </div>
  );
}

/**
 * The standing "you are paused" state, for when the panel loads inside a timeout
 * rather than having just tripped one. No mistake button here — that belongs on
 * the specific exchange it is about, which this is not.
 */
export function GuardrailPaused({ until }: { until: number }) {
  const mins = Math.max(1, Math.ceil((until - Date.now()) / 60000));
  return (
    <div style={{ ...card, background: CARD_STOP }}>
      <div style={head}>
        <Icon name="shield" size={14} color="#FFB4A2" />
        <span style={{ fontWeight: 700, fontSize: 12.5, color: '#eef3ff' }}>
          AI paused for {mins} more {mins === 1 ? 'minute' : 'minutes'}
        </span>
      </div>
      <p style={para}>
        AI features are paused after more than one request for financial or investment
        advice. Everything else in the terminal keeps working, and support is always
        reachable.
      </p>
    </div>
  );
}

const card: CSSProperties = {
  border: '1px solid #29406e',
  borderRadius: 10,
  padding: '12px 14px',
  marginTop: 10,
};
const head: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  marginBottom: 8,
};
const para: CSSProperties = {
  margin: '0 0 8px',
  fontSize: 12,
  lineHeight: 1.6,
  color: '#ccd7ef',
};
const fine: CSSProperties = {
  margin: '12px 0 0',
  paddingTop: 10,
  borderTop: '1px solid #1d3560',
  fontSize: 10.5,
  lineHeight: 1.6,
  color: '#8298c4',
};
const btn: CSSProperties = {
  background: 'transparent',
  border: '1px solid #2c4b7d',
  borderRadius: 8,
  color: '#cfe0ff',
  fontSize: 11.5,
  padding: '6px 11px',
  cursor: 'pointer',
};
