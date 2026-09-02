import { useRef, useState } from 'react';
import { C, tint } from '../../theme/tokens';
import { Icon } from '../../components/Icon';

/**
 * Site Editor ▸ View Site.
 *
 * The site itself, behind the password, while it is not public yet — and, once
 * the editor exists, the place to check a change actually looks right.
 *
 * IT IS AN IFRAME OF /preview, NOT THE COMPONENT RENDERED HERE, AND THAT IS THE
 * WHOLE DESIGN. The portfolio's layout is decided by `clamp(…vw…)` and a
 * `max-width: 720px` media query, both of which resolve against the VIEWPORT.
 * Rendered inside this column, a 390px "phone" frame would still be laid out
 * against the full window — every responsive decision shown wrong, which is
 * worse than not offering the widths at all. A separate document gets its own
 * viewport, so a narrow frame really is a narrow screen.
 *
 * The frame is exactly the same code the public site runs: `src/render/` and
 * `src/content/` are byte-identical in both repositories, and
 * `npm run verify:mirror` is what keeps them that way. What is on screen here
 * is what a visitor would get.
 */

/**
 * Real device widths, so a frame means something.
 *
 * Desktop and phone only (owner decision, 2026-09 — there was a Tablet at 820px
 * and it was dropped). The site has one breakpoint, at 720px, so a tablet frame
 * only ever showed the desktop layout in a narrower box.
 */
const WIDTHS = [
  { key: 'desktop', label: 'Desktop', icon: 'monitor', width: null },
  { key: 'phone', label: 'Phone', icon: 'smartphone', width: 390 },
] as const;

export function ViewSite() {
  const [device, setDevice] = useState<string>('desktop');
  // Bumping this remounts the iframe, which is the only reliable way to reload
  // a document whose URL has not changed.
  const [nonce, setNonce] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);

  const chosen = WIDTHS.find((w) => w.key === device) ?? WIDTHS[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          flexWrap: 'wrap',
          padding: '14px clamp(16px,3vw,28px)',
          borderBottom: `1px solid ${C.line}`,
          background: C.panel2,
          flex: 'none',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              font: `500 .64rem/1.4 ${C.mono}`,
              letterSpacing: '.2em',
              textTransform: 'uppercase',
              color: C.gold,
            }}
          >
            Site
          </p>
          <h1 style={{ margin: '4px 0 0', font: `700 1.05rem/1.2 ${C.sans}`, color: C.text }}>
            View Site
          </h1>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              gap: 2,
              padding: 3,
              borderRadius: 9,
              border: `1px solid ${C.line}`,
              background: C.bg,
            }}
          >
            {WIDTHS.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => setDevice(w.key)}
                title={w.width ? `${w.label} — ${w.width}px` : w.label}
                aria-pressed={device === w.key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '7px 11px',
                  borderRadius: 7,
                  border: 'none',
                  cursor: 'pointer',
                  font: `500 12.5px/1 ${C.sans}`,
                  fontFamily: C.sans,
                  color: device === w.key ? C.gold : C.muted,
                  background: device === w.key ? tint(C.gold, 0.12) : 'transparent',
                }}
              >
                <Icon name={w.icon} size={14} color={device === w.key ? C.gold : C.faint} />
                {w.label}
              </button>
            ))}
          </div>

          <IconButton label="Reload" icon="refresh-cw" onClick={() => setNonce((n) => n + 1)} />
          <a
            href="/site-preview"
            target="_blank"
            rel="noopener noreferrer"
            title="Open the preview in its own tab"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '9px 12px',
              borderRadius: 8,
              border: `1px solid ${C.line2}`,
              color: C.text,
              textDecoration: 'none',
              font: `500 12.5px/1 ${C.sans}`,
            }}
          >
            <Icon name="external-link" size={13} color={C.text} />
            Full screen
          </a>
        </div>
      </div>

      <div
        // STRETCH, not start — an iframe asking for height:100% inside a
        // container that sizes to its content resolves to nothing, and the
        // preview loads perfectly while being zero pixels tall. The frame
        // takes the pane's height and scrolls internally, which is also what a
        // device does.
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'stretch',
          padding: chosen.width ? 'clamp(16px,3vw,28px)' : 0,
          background: C.bg,
          overflow: 'hidden',
        }}
      >
        <iframe
          key={`${chosen.key}-${nonce}`}
          ref={frame}
          src="/site-preview"
          title="Site preview"
          style={{
            width: chosen.width ? `min(${chosen.width}px, 100%)` : '100%',
            height: '100%',
            border: chosen.width ? `1px solid ${C.line}` : 'none',
            borderRadius: chosen.width ? 12 : 0,
            background: C.bg,
            display: 'block',
          }}
        />
      </div>

      <p
        style={{
          margin: 0,
          padding: '10px clamp(16px,3vw,28px)',
          borderTop: `1px solid ${C.line}`,
          background: C.panel2,
          font: `400 12px/1.6 ${C.sans}`,
          color: C.faint,
          flex: 'none',
        }}
      >
        This is the same code the public site runs, behind your password. Nothing here is public.
      </p>
    </div>
  );
}

function IconButton({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '9px 12px',
        borderRadius: 8,
        border: `1px solid ${C.line2}`,
        background: 'transparent',
        color: C.text,
        font: `500 12.5px/1 ${C.sans}`,
        fontFamily: C.sans,
        cursor: 'pointer',
      }}
    >
      <Icon name={icon} size={13} color={C.text} />
      {label}
    </button>
  );
}
