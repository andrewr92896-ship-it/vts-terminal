import { C, tint } from '../../theme/tokens';
import { Icon } from '../../components/Icon';
import { EditableText } from '../../copy/SiteCopy';

// My Portal ▸ Employee Portal — the way in to the separate employee site.
//
// This screen is a doorway, not the portal. The employee portal lives at its own
// URL (/employee) as a different page with a different bundle and a different
// session, so the button below is a real page navigation, not a screen switch.
// Everything on this card exists to set that expectation before the click: you
// will be asked to sign in again, and you will need your authenticator.
//
// The section is only in the sidebar for accounts that hold the Employee role
// AND sign in on a company email address. The server enforces both again at
// /employee, so reaching this screen by other means gains nothing.

const ACCENT = '#38BDF8';

const STEPS: { icon: string; title: string; body: string; id: string }[] = [
  {
    id: 'signin',
    icon: 'key',
    title: 'You sign in again',
    body: 'Your main portal session does not carry over. The employee portal keeps its own, so a browser left open here is never a way into it.',
  },
  {
    id: 'twofactor',
    icon: 'shield-check',
    title: 'You confirm a second factor',
    body: 'A code from your authenticator app, every time. The first visit walks you through pairing one and hands you ten single-use recovery codes.',
  },
  {
    id: 'short',
    icon: 'alarm-clock',
    title: 'The session is short',
    body: 'Eight hours at the outside, and it ends after thirty minutes idle. Everything done in there is written to an activity log you can read yourself.',
  },
];

export function EmployeePortalLaunch() {
  return (
    <div style={{ padding: '26px 28px 60px', maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 22 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 11,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: tint(ACCENT, 0.12),
            border: `1px solid ${tint(ACCENT, 0.32)}`,
            color: ACCENT,
          }}
        >
          <Icon name="shield-check" size={20} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 650, color: C.text, letterSpacing: '0.2px' }}>
            <EditableText id="myemp.title">Employee Portal</EditableText>
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: C.muted, lineHeight: 1.65 }}>
            <EditableText id="myemp.subtitle">
              The company's internal site — staff directory, announcements, documents and your own
              employment record. It is a separate, secured site rather than another workspace here.
            </EditableText>
          </p>
        </div>
      </div>

      <div
        style={{
          background: `linear-gradient(180deg, ${tint(ACCENT, 0.07)}, transparent)`,
          border: `1px solid ${tint(ACCENT, 0.28)}`,
          borderRadius: 14,
          padding: 22,
          marginBottom: 22,
        }}
      >
        <div
          style={{
            fontFamily: C.mono,
            fontSize: 10.5,
            letterSpacing: '1.6px',
            textTransform: 'uppercase',
            color: ACCENT,
            marginBottom: 9,
          }}
        >
          <EditableText id="myemp.address_label">Its own address</EditableText>
        </div>
        <div
          style={{
            fontFamily: C.mono,
            fontSize: 15,
            color: C.text,
            marginBottom: 16,
            wordBreak: 'break-all',
          }}
        >
          vitalistradingsystems.com/employee
        </div>
        <a
          href="/employee"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 9,
            padding: '12px 20px',
            borderRadius: 10,
            background: `linear-gradient(180deg, ${ACCENT}, #0EA5E9)`,
            color: '#04202E',
            fontSize: 13.5,
            fontWeight: 650,
            textDecoration: 'none',
            fontFamily: C.sans,
          }}
        >
          <Icon name="external-link" size={16} />
          <EditableText id="myemp.open">Open the Employee Portal</EditableText>
        </a>
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 11 }}>
          <EditableText id="myemp.open_hint">
            Opens the employee site. You will be asked to sign in there.
          </EditableText>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        {STEPS.map((step) => (
          <div
            key={step.id}
            style={{
              background: C.panel,
              border: `1px solid ${C.line}`,
              borderRadius: 12,
              padding: 17,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
              <span style={{ color: ACCENT, display: 'flex' }}>
                <Icon name={step.icon} size={16} />
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 650, color: C.text }}>
                <EditableText id={`myemp.step.${step.id}.title`} text={step.title} />
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.65 }}>
              <EditableText id={`myemp.step.${step.id}.body`} text={step.body} />
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 20,
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
          border: `1px solid ${C.line}`,
          background: C.panel2,
          borderRadius: 11,
          padding: '13px 15px',
        }}
      >
        <span style={{ color: C.faint, flex: 'none', marginTop: 1 }}>
          <Icon name="file-lock-2" size={15} />
        </span>
        <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.65 }}>
          <EditableText id="myemp.eligibility">
            Access is granted per person and requires a company email address. If you cannot sign in
            there, ask a founder to check your access — the sign-in screen will not tell you which part
            is missing, by design.
          </EditableText>
        </div>
      </div>
    </div>
  );
}
