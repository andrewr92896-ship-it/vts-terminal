import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import type { AiViolation, ViolationStatus } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { Icon } from '../../components/Icon';
import { fieldLabel, ghostBtn, inputStyle, panel, panelLabel, primaryBtn } from './adminUi';

// Admin ▸ Rule Breaking — every time VTS AI declined a request for financial or
// investment advice, with the conversation that produced it.
//
// The screen is built around one question: did the terminal get this right?
// Everything else follows from that. The conversation is shown in full because
// it is the only way to answer it, the disputed ones sort to the top because
// those are the cases where somebody has already said no, and the outcome
// buttons are deliberately plain verbs rather than severity levels — an admin
// deciding between "Nothing needed" and "Take action" is making a judgement, not
// filing a grade.
//
// Clearing the pause is separate from the outcome on purpose. Dismissing a
// borderline case should not silently hand back the thirty minutes, and
// agreeing the terminal misfired should not require also labelling it.

const STATUS_META: Record<ViolationStatus, { label: string; color: string }> = {
  open: { label: 'Needs review', color: '#FFB4A2' },
  dismissed: { label: 'Nothing needed', color: '#8298c4' },
  warned: { label: 'Warned', color: '#EBCB74' },
  actioned: { label: 'Action taken', color: '#8fe3c0' },
};

function when(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function AdminRuleBreaking({ theme }: { theme: Theme }) {
  const accentGrad = accentGradient(theme);
  const [rows, setRows] = useState<AiViolation[] | null>(null);
  const [error, setError] = useState('');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .listAiViolations()
      .then((r) => {
        if (alive) setRows(r.violations);
      })
      .catch((e) => {
        if (alive) setError(e instanceof ApiError ? e.message : 'Could not load the review list');
      });
    return () => {
      alive = false;
    };
  }, []);

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const open = (rows ?? []).filter((r) => r.status === 'open');
  const resolved = (rows ?? []).filter((r) => r.status !== 'open');
  // A disputed case leads: somebody has already said the terminal got it wrong,
  // and that is the one signal here worth reading first.
  open.sort((a, b) => (a.disputed === b.disputed ? b.createdAt - a.createdAt : a.disputed ? -1 : 1));

  return (
    <div style={{ maxWidth: 940 }}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 19, color: '#eef3ff' }}>Rule breaking</h2>
        <p style={{ margin: 0, fontSize: 12.5, color: '#8298c4', lineHeight: 1.6, maxWidth: 720 }}>
          Every time VTS AI declined a request for financial or investment advice. The
          first one in a day is a warning; a second within 24 hours pauses that
          account’s AI for 30 minutes. Conversations are stored only when the limits
          are tripped — ordinary AI chats are never kept.
        </p>
      </div>

      {error && <div style={errBox}>{error}</div>}

      {rows == null ? (
        <div style={{ color: '#8298c4', fontSize: 13 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ ...panel(theme), color: '#8298c4', fontSize: 13 }}>
          Nothing recorded. Nobody has asked VTS AI for financial advice.
        </div>
      ) : (
        <>
          <div style={{ ...panel(theme), marginBottom: 16 }}>
            <div style={panelLabel}>
              {open.length === 0 ? 'Nothing waiting' : `${open.length} waiting on review`}
            </div>
            {open.length === 0 ? (
              <div style={{ color: '#8298c4', fontSize: 12.5, paddingTop: 4 }}>
                Everything recorded has been looked at.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {open.map((v) => (
                  <ViolationCard
                    key={v.id}
                    v={v}
                    theme={theme}
                    accentGrad={accentGrad}
                    expanded={openIds.has(v.id)}
                    onToggle={() => toggle(v.id)}
                    onReviewed={setRows}
                    onError={setError}
                  />
                ))}
              </div>
            )}
          </div>

          {resolved.length > 0 && (
            <div style={panel(theme)}>
              <button
                type="button"
                onClick={() => setShowResolved((v) => !v)}
                style={{ ...ghostBtn, marginBottom: showResolved ? 12 : 0 }}
              >
                {showResolved ? 'Hide' : 'Show'} reviewed ({resolved.length})
              </button>
              {showResolved && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {resolved.map((v) => (
                    <ViolationCard
                      key={v.id}
                      v={v}
                      theme={theme}
                      accentGrad={accentGrad}
                      expanded={openIds.has(v.id)}
                      onToggle={() => toggle(v.id)}
                      onReviewed={setRows}
                      onError={setError}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ViolationCard({
  v,
  theme,
  accentGrad,
  expanded,
  onToggle,
  onReviewed,
  onError,
}: {
  v: AiViolation;
  theme: Theme;
  accentGrad: string;
  expanded: boolean;
  onToggle: () => void;
  onReviewed: (rows: AiViolation[]) => void;
  onError: (msg: string) => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const meta = STATUS_META[v.status];
  const paused = v.timeoutUntil != null && v.timeoutUntil > Date.now();

  async function decide(status: ViolationStatus, clearTimeout = false) {
    setBusy(true);
    onError('');
    try {
      const r = await api.reviewAiViolation(v.id, {
        status,
        note: note.trim() || undefined,
        clearTimeout,
      });
      onReviewed(r.violations);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Could not save that decision');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={cardStyle(v.disputed && v.status === 'open')}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#eef3ff' }}>{v.userName}</span>
        <span style={{ ...chip, color: meta.color, borderColor: meta.color }}>{meta.label}</span>
        {v.timedOut && (
          <span style={{ ...chip, color: '#FFB4A2', borderColor: '#5a3a3a' }}>
            {paused ? 'Paused now' : 'Was paused'}
          </span>
        )}
        {v.disputed && (
          <span style={{ ...chip, color: '#EBCB74', borderColor: '#5a4d2a' }}>
            <Icon name="lightbulb" size={10} color="#EBCB74" /> Says it was a mistake
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#7488b5' }}>
          {v.surface === 'tutor' ? 'Study tutor' : 'Ask VTS AI'} · {when(v.createdAt)}
        </span>
      </div>

      <button type="button" onClick={onToggle} style={{ ...ghostBtn, marginTop: 10 }}>
        {expanded ? 'Hide conversation' : 'Show conversation'}
      </button>

      {expanded && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {v.conversation.length === 0 ? (
            <div style={{ fontSize: 12, color: '#7488b5' }}>
              The stored conversation could not be read.
            </div>
          ) : (
            v.conversation.map((m, i) => (
              <div key={i} style={turnStyle(m.role)}>
                <div style={turnRole}>{m.role === 'user' ? v.userName : 'VTS AI'}</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
              </div>
            ))
          )}
          <div style={{ ...turnStyle('assistant'), borderColor: '#3a5a8a' }}>
            <div style={turnRole}>VTS AI replied</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{v.reply}</div>
          </div>
          {v.disputeNote && (
            <div style={{ ...turnStyle('user'), borderColor: '#5a4d2a' }}>
              <div style={turnRole}>What they said about it</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{v.disputeNote}</div>
            </div>
          )}
        </div>
      )}

      {v.status === 'open' ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ ...fieldLabel, marginBottom: 6 }}>Note (optional)</div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why you decided this"
            style={{ ...inputStyle, marginBottom: 10 }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void decide('dismissed', paused)}
              style={primaryBtn(theme, accentGrad)}
            >
              {paused ? 'Nothing needed — end the pause' : 'Nothing needed'}
            </button>
            <button type="button" disabled={busy} onClick={() => void decide('warned')} style={ghostBtn}>
              Warned them
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void decide('actioned')}
              style={{ ...ghostBtn, color: '#ffb4ab' }}
            >
              Action taken
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 10, fontSize: 11.5, color: '#7488b5' }}>
          {meta.label}
          {v.reviewedByName ? ` by ${v.reviewedByName}` : ''}
          {v.reviewedAt ? ` · ${when(v.reviewedAt)}` : ''}
          {v.reviewNote ? ` — ${v.reviewNote}` : ''}
        </div>
      )}
    </div>
  );
}

const cardStyle = (highlight: boolean): CSSProperties => ({
  border: `1px solid ${highlight ? '#5a4d2a' : '#1d3560'}`,
  background: highlight ? 'rgba(235,203,116,.05)' : 'rgba(11,26,58,.5)',
  borderRadius: 10,
  padding: '13px 15px',
});
const chip: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 10.5,
  fontWeight: 700,
  border: '1px solid',
  borderRadius: 999,
  padding: '2px 8px',
};
const turnStyle = (role: string): CSSProperties => ({
  border: '1px solid #1d3560',
  borderRadius: 8,
  padding: '8px 11px',
  fontSize: 12,
  lineHeight: 1.6,
  color: '#ccd7ef',
  background: role === 'user' ? 'rgba(255,255,255,.03)' : 'transparent',
});
const turnRole: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#7488b5',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  marginBottom: 4,
};
const errBox: CSSProperties = {
  color: '#ffb4ab',
  fontSize: 12.5,
  background: 'rgba(239,84,104,.1)',
  border: '1px solid rgba(239,84,104,.4)',
  borderRadius: 8,
  padding: '9px 11px',
  marginBottom: 14,
};
