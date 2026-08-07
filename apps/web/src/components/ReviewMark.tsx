import { useAuth } from '../auth/AuthContext';
import { isFounder } from '../auth/access';
import { RISK_COLOR, WIP_COLOR, reviewMark, type ReviewKey } from '../auth/reviewMarks';
import { Icon } from './Icon';

// The status marks that sit beside a feature — see auth/reviewMarks.ts for what
// each one means and who is meant to see it.
//
// It reads the signed-in user itself rather than taking one as a prop, because
// the founder-only half must never depend on a call site remembering to pass
// something. A caller that forgets a prop gets a silent default; a component
// that asks for itself cannot be got wrong that way.
//
// Gated on the reader's REAL roles, deliberately — the same rule the "View as
// role" control follows. Previewing as a member is about checking what a member
// can reach, not about hiding the owner's own review notes from the owner.
//
// It is ADDITIONAL to the tier mark, never a replacement: call sites draw a
// TierMark and this one beside it, so a row still says both what it costs and
// that it is unfinished.
export function ReviewMark({ id, size = 12 }: { id: ReviewKey; size?: number }) {
  const { user } = useAuth();
  const mark = reviewMark(id);
  // Founder-level only, and the check is what keeps the compliance note out of
  // every customer's terminal. Do not widen it.
  const showRisk = !!mark.risk && isFounder(user?.roles ?? []);
  const showWip = !!mark.wip;
  if (!showRisk && !showWip) return null;
  return (
    <>
      {showWip && (
        <span
          title={mark.wip}
          aria-label={mark.wip}
          style={{ display: 'inline-flex', flex: 'none' }}
        >
          <Icon name="message-circle-dashed" size={size} color={WIP_COLOR} />
        </span>
      )}
      {showRisk && (
        <span
          title={`Flagged for review — ${mark.risk}`}
          aria-label={`Flagged for review — ${mark.risk}`}
          style={{ display: 'inline-flex', flex: 'none' }}
        >
          <Icon name="alert-triangle" size={size} color={RISK_COLOR} />
        </span>
      )}
    </>
  );
}
