import type { ReactNode } from 'react';
import type { Theme } from '../../theme/themes';
import { C } from '../../theme/tokens';
import { Icon } from '../../components/Icon';
import { SectionHeader, panel, panelLabel } from './adminUi';

// Admin ▸ Admin Guidelines — the rules administrators work to, and how to handle
// the situations that actually come up.
//
// Hardcoded text, like the rest of the terminal's coded copy: to change a rule,
// edit this file and deploy. That is deliberate for this screen in particular —
// the rules an administrator is held to should not be editable from inside the
// running app by the people they govern.
//
// The membership rules below are the ones the server actually enforces
// (memberships/service.ts): the six-month cap on an admin grant, and the
// required note. Anything stated here as a hard rule is enforced in code; the
// rest is judgement, and is written as such.

export function AdminGuidelines({ theme }: { theme: Theme }) {
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 20px 40px' }}>
      <SectionHeader
        title="Admin Guidelines"
        subtitle="What administrators are expected to do, and what they are not permitted to do."
      />

      <Card theme={theme} label="The rules" tone={C.red}>
        <Rule icon="lock" title="Never grant a membership without permission">
          Granting a paid membership to yourself, a friend, or anyone else outside
          the situations listed below is prohibited. Every grant is recorded in the
          Administrator Log with your name and your stated reason, permanently.
        </Rule>
        <Rule icon="file-text" title="Every grant needs a real reason">
          The note is not a formality — it is the record of why. Write what
          actually happened ("refund for the 3 days the desk was down"), not
          "approved" or "as discussed".
        </Rule>
        <Rule icon="alarm-clock" title="Six months is your limit">
          An admin can grant up to six months at a time. Only a founder or
          software developer can grant longer, or indefinitely. If a situation
          seems to call for more, escalate it rather than granting repeatedly.
        </Rule>
        <Rule icon="eye" title="Do not read what you do not need">
          Access to a user's account data is for resolving the issue in front of
          you. Trades, balances, and broker connections are private.
        </Rule>
        <Rule icon="message-circle" title="Keep it in the Administrator chat">
          Decisions about a user's account are discussed in the Administrator chat,
          not in the team chat and not privately, so there is a record.
        </Rule>
      </Card>

      <Card theme={theme} label="When to grant a membership" tone={C.gold}>
        <Rule icon="refresh-cw" title="Service the user paid for and did not get">
          An outage, a broken feature, or a billing error. Grant the time lost,
          rounded up. Note what broke and for how long.
        </Rule>
        <Rule icon="life-buoy" title="A support case you cannot otherwise resolve">
          Where the fix is not available and the user is out of pocket. Note the
          ticket.
        </Rule>
        <Rule icon="users" title="Someone a founder has told you to set up">
          A tester, a partner, a demo account. Note who asked and when — and if
          they need it indefinitely, they need to grant it themselves.
        </Rule>
        <Rule icon="x-circle" title="Not: because they asked nicely">
          A request on its own is not a reason. Neither is being a friend, an
          early user, or persistent. Refer them to the upgrade path.
        </Rule>
      </Card>

      <Card theme={theme} label="Handling common situations" tone={C.info}>
        <Rule icon="bug" title="A bug report comes in">
          Reproduce it if you can, reply with what you found, and leave it open
          until it is genuinely fixed. Closing a ticket is a statement that the
          problem is gone.
        </Rule>
        <Rule icon="flame" title="A user is angry">
          Answer the substance first and the tone not at all. If they are owed
          something, say so plainly and fix it. Do not argue in writing.
        </Rule>
        <Rule icon="shield" title="A user asks you to place or change a trade">
          Refuse. Nobody administers another person's trades — there is no code
          path for it, and there should not be one. Walk them through doing it
          themselves.
        </Rule>
        <Rule icon="key" title="A user sends you their broker credentials">
          Tell them to revoke that key immediately and never send credentials to
          anyone. Do not use them, and do not keep the message.
        </Rule>
        <Rule icon="trash-2" title="A user asks for their account to be deleted">
          Confirm it is really what they want, then delete it. It is permanent and
          takes their trades, investments and settings with it.
        </Rule>
        <Rule icon="scale" title="Anything legal, financial, or about money owed">
          Do not answer it yourself. Pass it to a founder. This includes refunds
          beyond a lost-service credit, chargebacks, and anything that reads like
          a complaint about advice.
        </Rule>
      </Card>

      <div style={{ fontSize: 11.5, color: C.faint, marginTop: 18, lineHeight: 1.6 }}>
        {
          'These guidelines are part of the terminal’s code. To change one, edit the source and deploy — they are not editable from inside the app.'
        }
      </div>
    </div>
  );
}

function Card({
  theme,
  label,
  tone,
  children,
}: {
  theme: Theme;
  label: string;
  tone: string;
  children: ReactNode;
}) {
  return (
    <section style={{ ...panel(theme), marginBottom: 14, borderLeft: `2px solid ${tone}` }}>
      <div style={panelLabel}>{label}</div>
      <div style={{ display: 'grid', gap: 14 }}>{children}</div>
    </section>
  );
}

function Rule({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span style={{ flex: 'none', marginTop: 2 }}>
        <Icon name={icon} size={15} color={C.faint} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{title}</div>
        <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6, marginTop: 3 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
