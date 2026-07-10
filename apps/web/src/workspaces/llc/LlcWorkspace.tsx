import { useState, type CSSProperties, type ReactNode } from 'react';
import { C, GOLD_GRADIENT, tint } from '../../theme/tokens';
import { Icon } from '../../components/Icon';

// Vitalis Trading Systems LLC — the new business workspace. This is a scaffold:
// it establishes the layout and every section from the design handoff with
// representative (sample) content. Wiring these sections to real backend models
// is a later stage; until then a "Sample data" marker keeps it honest.

const contentStyle: CSSProperties = {
  padding: '30px 32px 48px',
  maxWidth: 1240,
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
};

function Card({ children, style, hover }: { children: ReactNode; style?: CSSProperties; hover?: boolean }) {
  const [h, setH] = useState(false);
  return (
    <div
      onMouseEnter={hover ? () => setH(true) : undefined}
      onMouseLeave={hover ? () => setH(false) : undefined}
      style={{
        background: C.panel,
        border: `1px solid ${hover && h ? C.hover : C.line}`,
        borderRadius: 12,
        transition: 'border-color .15s ease',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div>
        <h1
          style={{
            fontSize: 25,
            fontWeight: 600,
            letterSpacing: '-0.3px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            margin: 0,
            color: C.text,
          }}
        >
          {title}
          <Pill color={C.gold} border={C.gold}>
            Sample data
          </Pill>
        </h1>
        {sub && <div style={{ fontSize: 13.5, color: C.muted, marginTop: 8, maxWidth: 680, lineHeight: 1.6 }}>{sub}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 10, flex: 'none', flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

function Btn({ icon, children, gold }: { icon?: string; children: ReactNode; gold?: boolean }) {
  const [h, setH] = useState(false);
  return (
    <button
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: 'inherit',
        fontSize: 13,
        fontWeight: gold ? 600 : 500,
        borderRadius: 8,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'all .15s ease',
        ...(gold
          ? { background: GOLD_GRADIENT, color: C.goldText, border: 'none', padding: '9px 16px', filter: h ? 'brightness(1.05)' : 'none' }
          : { background: 'transparent', color: h ? C.text : C.muted, border: `1px solid ${h ? '#2A3D6B' : C.line2}`, padding: '8px 14px' }),
      }}
    >
      {icon && <Icon name={icon} size={15} />}
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <span
        style={{
          fontSize: 11,
          letterSpacing: '1.4px',
          textTransform: 'uppercase',
          color: C.faint,
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        {children}
      </span>
      <span style={{ flex: 1, height: 1, background: C.line }} />
    </div>
  );
}

function Pill({ children, color = C.muted, bg, border }: { children: ReactNode; color?: string; bg?: string; border?: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.2px',
        padding: '3px 9px',
        borderRadius: 5,
        color,
        background: bg || 'transparent',
        border: border ? `1px solid ${border}` : 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

function statusPill(label: string, color: string) {
  return (
    <Pill color={color} bg={tint(color, 0.1)}>
      {label}
    </Pill>
  );
}

function MiniStat({ icon, k, v, color }: { icon: string; k: string; v: string; color?: string }) {
  return (
    <Card style={{ padding: '18px 20px', flex: 1, minWidth: 150 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: C.faint, fontWeight: 500 }}>
        <Icon name={icon} size={14} color={color || C.faint} />
        {k}
      </div>
      <div style={{ fontFamily: C.mono, fontSize: 24, fontWeight: 500, marginTop: 10, color: C.text }}>{v}</div>
    </Card>
  );
}

function DetailRow({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        padding: '11px 0',
        borderBottom: `1px solid ${C.line}`,
        fontSize: 13,
      }}
    >
      <span style={{ color: C.faint, fontWeight: 500 }}>{k}</span>
      <span style={{ color: C.text, fontFamily: mono ? C.mono : 'inherit', fontSize: mono ? 12.5 : 13, textAlign: 'right' }}>{v}</span>
    </div>
  );
}

function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <Card style={{ overflow: 'hidden', padding: 0 }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{head}</tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </Card>
  );
}

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th
      style={{
        textAlign: right ? 'right' : 'left',
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '0.8px',
        textTransform: 'uppercase',
        color: C.faint,
        padding: '11px 18px',
        borderBottom: `1px solid ${C.line}`,
        background: 'rgba(255,255,255,.012)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, right, style }: { children: ReactNode; right?: boolean; style?: CSSProperties }) {
  return (
    <td
      style={{
        padding: '15px 18px',
        borderBottom: `1px solid ${C.line}`,
        fontSize: 12.5,
        textAlign: right ? 'right' : 'left',
        verticalAlign: 'middle',
        color: C.text,
        ...style,
      }}
    >
      {children}
    </td>
  );
}

function nameCell(title: string, subtitle?: string) {
  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11, color: C.faint, marginTop: 3 }}>{subtitle}</div>}
    </div>
  );
}

// ---------- Overview ----------
function Overview() {
  const activity = (icon: string, title: string, meta: string, color: string) => (
    <div style={{ display: 'flex', gap: 12, padding: '11px 0', borderBottom: `1px solid ${C.line}` }}>
      <span style={{ color, marginTop: 1 }}>
        <Icon name={icon} size={16} />
      </span>
      <div>
        <div style={{ fontSize: 12.5, color: C.text }}>{title}</div>
        <div style={{ fontSize: 11, color: C.faint, marginTop: 3 }}>{meta}</div>
      </div>
    </div>
  );
  return (
    <div style={contentStyle}>
      <PageHead
        title="Vitalis Trading Systems LLC"
        sub="Company snapshot — entity details, key dates, and everything that keeps the business in good standing."
        actions={
          <>
            <Btn icon="external-link">State registry</Btn>
            <Btn icon="pencil" gold>
              Edit details
            </Btn>
          </>
        }
      />
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <MiniStat icon="users" k="Members" v="2" color={C.info} />
        <MiniStat icon="briefcase" k="Contractors" v="3" color={C.info} />
        <MiniStat icon="folder-archive" k="Documents" v="24" color={C.info} />
        <MiniStat icon="file-check-2" k="Filings due" v="2" color={C.amber} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <Card style={{ padding: '20px 24px' }}>
          <SectionLabel>Entity details</SectionLabel>
          <div style={{ marginTop: 6 }}>
            <DetailRow k="Legal name" v="Vitalis Trading Systems LLC" />
            <DetailRow k="Entity type" v="Single-member → Multi-member (2025)" />
            <DetailRow k="EIN" v="88-•••••21" mono />
            <DetailRow k="State of formation" v="Ohio" />
            <DetailRow k="Formation date" v="Mar 14, 2024" mono />
            <DetailRow k="Registered agent" v="Andrew Vitalis" />
            <DetailRow k="Principal address" v="Streetsboro, OH 44241" />
            <DetailRow k="Fiscal year end" v="Dec 31" mono />
            <DetailRow k="Tax classification" v="S-Corp election (Form 2553)" />
          </div>
        </Card>
        <Card style={{ padding: '20px 24px' }}>
          <SectionLabel>Recent activity</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 10 }}>
            {activity('file-plus-2', 'Q2 operating expenses uploaded', 'Documents · 2 days ago', C.green)}
            {activity('user-plus', 'Contractor agreement signed — J. Reyes', 'Contractors · 5 days ago', C.info)}
            {activity('scale', 'NDA sent to Meridian Data LLC', 'Legal · 1 week ago', C.gold)}
            {activity('banknote', 'Chase Business account reconciled', 'Banking · 1 week ago', C.muted)}
            {activity('file-check-2', 'Ohio annual report filed', 'Compliance · 3 weeks ago', C.green)}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------- Documents ----------
const DOC_CATS = [
  { icon: 'building-2', label: 'Formation', n: 4 },
  { icon: 'receipt', label: 'Tax', n: 7 },
  { icon: 'shield', label: 'Insurance', n: 3 },
  { icon: 'landmark', label: 'Banking', n: 5 },
  { icon: 'scale', label: 'Legal', n: 5 },
];
const DOCS = [
  { name: 'Articles of Organization', cat: 'Formation', type: 'PDF', updated: 'Mar 14, 2024', size: '212 KB' },
  { name: 'Operating Agreement (Amended 2025)', cat: 'Formation', type: 'PDF', updated: 'Jan 8, 2025', size: '1.1 MB' },
  { name: 'EIN Confirmation Letter (CP-575)', cat: 'Tax', type: 'PDF', updated: 'Mar 20, 2024', size: '96 KB' },
  { name: '2024 Federal Return (1120-S)', cat: 'Tax', type: 'PDF', updated: 'Mar 2, 2025', size: '3.4 MB' },
  { name: 'General Liability Policy', cat: 'Insurance', type: 'PDF', updated: 'Jun 1, 2025', size: '740 KB' },
  { name: 'Chase Business Signature Card', cat: 'Banking', type: 'PDF', updated: 'Apr 2, 2024', size: '180 KB' },
];
function Documents() {
  return (
    <div style={contentStyle}>
      <PageHead
        title="Documents"
        sub="Formation papers, tax returns, insurance, and banking records — organized by category."
        actions={
          <>
            <Btn icon="folder-plus">New folder</Btn>
            <Btn icon="upload" gold>
              Upload
            </Btn>
          </>
        }
      />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {DOC_CATS.map((c) => (
          <Card key={c.label} hover style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer' }}>
            <span style={{ color: C.gold }}>
              <Icon name={c.icon} size={18} />
            </span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{c.label}</div>
              <div style={{ fontSize: 11, color: C.faint, fontFamily: C.mono, marginTop: 2 }}>{c.n} files</div>
            </div>
          </Card>
        ))}
      </div>
      <SectionLabel>All documents</SectionLabel>
      <Table
        head={[
          <Th key="1">Name</Th>,
          <Th key="2">Category</Th>,
          <Th key="3">Type</Th>,
          <Th key="4">Updated</Th>,
          <Th key="5" right>
            Size
          </Th>,
        ]}
      >
        {DOCS.map((d) => (
          <tr key={d.name}>
            <Td>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <Icon name="file-text" size={16} color={C.faint} />
                <span style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</span>
              </div>
            </Td>
            <Td>
              <Pill border={C.line2} color={C.muted}>
                {d.cat}
              </Pill>
            </Td>
            <Td>
              <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>{d.type}</span>
            </Td>
            <Td>
              <span style={{ fontFamily: C.mono, color: C.muted }}>{d.updated}</span>
            </Td>
            <Td right>
              <span style={{ fontFamily: C.mono, color: C.faint }}>{d.size}</span>
            </Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

// ---------- Members ----------
const MEMBERS = [
  { name: 'Andrew Vitalis', role: 'Managing Member', handle: '@andrew · you', equity: 75, cap: '$120,000', since: 'Mar 2024', roleColor: C.gold },
  { name: 'Jordan Vitalis', role: 'Member', handle: '@jordan', equity: 25, cap: '$40,000', since: 'Jan 2025', roleColor: C.info },
];
function Members() {
  return (
    <div style={contentStyle}>
      <PageHead
        title="Members"
        sub="Ownership of the LLC — each member, their role, equity stake, and capital contributed."
        actions={
          <Btn icon="user-plus" gold>
            Add member
          </Btn>
        }
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {MEMBERS.map((m) => (
          <Card key={m.name} hover style={{ padding: '22px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg,#143FA0,#0A2A6B)',
                  border: `1px solid ${C.line2}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: C.mono,
                  fontSize: 17,
                  color: C.gold,
                  flex: 'none',
                }}
              >
                {m.name[0]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15.5, fontWeight: 600, color: C.text }}>{m.name}</div>
                <div style={{ fontFamily: C.mono, fontSize: 11.5, color: C.faint, marginTop: 2 }}>{m.handle}</div>
              </div>
              <Pill color={m.roleColor} bg={tint(m.roleColor, 0.1)}>
                {m.role}
              </Pill>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: C.faint }}>Equity stake</span>
              <span style={{ fontFamily: C.mono, fontSize: 13, color: C.text }}>{m.equity}%</span>
            </div>
            <div style={{ height: 7, borderRadius: 4, background: C.line, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ width: `${m.equity}%`, height: '100%', background: m.roleColor }} />
            </div>
            <DetailRow k="Capital contributed" v={m.cap} mono />
            <DetailRow k="Member since" v={m.since} mono />
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------- Contractors ----------
const CONTRACTORS = [
  { name: 'Jamie Reyes', work: 'Backend developer', agree: 'Signed', w9: true, since: 'Feb 2025', paid: '$18,400', status: 'active' },
  { name: 'Priya Shah', work: 'UI / brand design', agree: 'Signed', w9: true, since: 'Nov 2024', paid: '$9,750', status: 'active' },
  { name: 'Meridian Data LLC', work: 'Market-data feed', agree: 'Sent', w9: false, since: 'Jul 2025', paid: '$0', status: 'pending' },
  { name: 'Chris Nolan', work: 'Bookkeeping (2024)', agree: 'Archived', w9: true, since: 'Ended Dec 2024', paid: '$6,200', status: 'past' },
];
function Contractors() {
  const badge = (s: string) =>
    s === 'active' ? statusPill('Active', C.green) : s === 'pending' ? statusPill('Pending', C.amber) : statusPill('Past', C.faint);
  return (
    <div style={contentStyle}>
      <PageHead
        title="Contractors"
        sub="Active and past contractors — their agreements, W-9 status, payment history, and contact."
        actions={
          <>
            <Btn icon="download">Export 1099s</Btn>
            <Btn icon="user-plus" gold>
              Add contractor
            </Btn>
          </>
        }
      />
      <Table head={['Contractor', 'Agreement', 'W-9', 'Working since', 'Paid to date', 'Status'].map((h, i) => (
        <Th key={h} right={i === 4}>
          {h}
        </Th>
      ))}>
        {CONTRACTORS.map((c) => (
          <tr key={c.name}>
            <Td>{nameCell(c.name, c.work)}</Td>
            <Td>
              <Pill border={C.line2} color={c.agree === 'Signed' ? C.green : c.agree === 'Sent' ? C.amber : C.faint}>
                {c.agree}
              </Pill>
            </Td>
            <Td>
              {c.w9 ? (
                <span style={{ color: C.green, display: 'inline-flex' }}>
                  <Icon name="check" size={15} />
                </span>
              ) : (
                <span style={{ color: C.faint, fontSize: 11.5 }}>missing</span>
              )}
            </Td>
            <Td>
              <span style={{ color: C.muted }}>{c.since}</span>
            </Td>
            <Td right>
              <span style={{ fontFamily: C.mono, color: C.text }}>{c.paid}</span>
            </Td>
            <Td>{badge(c.status)}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

// ---------- Compliance & Filings ----------
const FILINGS = [
  { title: 'Ohio Biennial Report', authority: 'Ohio Secretary of State', due: 'Aug 1, 2026', status: 'due', left: 'in 23 days' },
  { title: 'Q3 Estimated Tax (Form 1120-W)', authority: 'IRS', due: 'Sep 15, 2026', status: 'upcoming', left: 'in 68 days' },
  { title: 'Business License Renewal', authority: 'City of Streetsboro', due: 'Oct 31, 2026', status: 'upcoming', left: 'in 114 days' },
  { title: 'Registered Agent Confirmation', authority: 'Ohio Secretary of State', due: 'Jun 15, 2026', status: 'filed', left: 'filed Jun 12' },
  { title: '2024 Federal Return (1120-S)', authority: 'IRS', due: 'Mar 15, 2025', status: 'filed', left: 'filed Mar 2' },
];
function Compliance() {
  const badge = (s: string) =>
    s === 'due' ? statusPill('Due soon', C.amber) : s === 'upcoming' ? statusPill('Upcoming', C.info) : statusPill('Filed', C.green);
  return (
    <div style={contentStyle}>
      <PageHead
        title="Compliance & Filings"
        sub="Annual reports, license renewals, and tax deadlines — with reminder status so nothing lapses."
        actions={
          <>
            <Btn icon="bell-plus">Reminders</Btn>
            <Btn icon="plus" gold>
              Add filing
            </Btn>
          </>
        }
      />
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <MiniStat icon="alarm-clock" k="Due within 30 days" v="1" color={C.amber} />
        <MiniStat icon="calendar-clock" k="Upcoming" v="2" color={C.info} />
        <MiniStat icon="check-check" k="Filed this year" v="4" color={C.green} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {FILINGS.map((f) => (
          <Card key={f.title} hover style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 22px' }}>
            <span
              style={{
                width: 38,
                height: 38,
                borderRadius: 9,
                background: 'rgba(255,255,255,.03)',
                border: `1px solid ${C.line}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: f.status === 'filed' ? C.green : f.status === 'due' ? C.amber : C.info,
                flex: 'none',
              }}
            >
              <Icon name={f.status === 'filed' ? 'file-check-2' : 'file-clock'} size={18} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{f.title}</div>
              <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>{f.authority}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: C.mono, fontSize: 13, color: C.text }}>{f.due}</div>
              <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>{f.left}</div>
            </div>
            <div style={{ width: 96, textAlign: 'right' }}>{badge(f.status)}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------- Accounts & Banking ----------
const ACCOUNTS = [
  { bank: 'Chase Business Complete', type: 'Checking', last4: '4821', used: 'Operating account · payroll, contractors', icon: 'landmark' },
  { bank: 'Chase Business Savings', type: 'Savings', last4: '7930', used: 'Tax reserve · quarterly estimates', icon: 'piggy-bank' },
  { bank: 'Ramp Business Card', type: 'Credit', last4: '1145', used: 'Software, data feeds, subscriptions', icon: 'credit-card' },
  { bank: 'Mercury Treasury', type: 'Treasury', last4: '2208', used: 'Idle cash · money-market sweep', icon: 'trending-up' },
];
function Banking() {
  return (
    <div style={contentStyle}>
      <PageHead
        title="Accounts & Banking"
        sub="Business bank accounts and cards, and where each one is used — no credentials or balances stored here."
        actions={
          <Btn icon="plus" gold>
            Add account
          </Btn>
        }
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {ACCOUNTS.map((a) => (
          <Card key={a.bank} hover style={{ padding: '22px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 16 }}>
              <span
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  background: 'rgba(255,255,255,.03)',
                  border: `1px solid ${C.line}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: C.gold,
                  flex: 'none',
                }}
              >
                <Icon name={a.icon} size={19} />
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: C.text }}>{a.bank}</div>
                <div style={{ fontFamily: C.mono, fontSize: 11.5, color: C.faint, marginTop: 3 }}>•••• {a.last4}</div>
              </div>
              <Pill border={C.line2} color={C.muted}>
                {a.type}
              </Pill>
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>{a.used}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------- Legal & Contracts ----------
const CONTRACTS = [
  { title: 'Contractor Agreement — J. Reyes', party: 'Jamie Reyes', kind: 'Contractor', status: 'Active', signed: 'Feb 3, 2025' },
  { title: 'Mutual NDA', party: 'Meridian Data LLC', kind: 'NDA', status: 'Out for signature', signed: '—' },
  { title: 'Market Data License', party: 'OANDA Corp.', kind: 'Vendor', status: 'Active', signed: 'Apr 12, 2024' },
  { title: 'Contractor Agreement — P. Shah', party: 'Priya Shah', kind: 'Contractor', status: 'Active', signed: 'Nov 18, 2024' },
  { title: 'Office Sublease', party: 'Streetsboro Commons', kind: 'Lease', status: 'Expired', signed: 'Jan 1, 2024' },
];
const TEMPLATES = [
  { icon: 'file-signature', label: 'Contractor Agreement' },
  { icon: 'file-lock-2', label: 'Mutual NDA' },
  { icon: 'file-text', label: 'Statement of Work' },
];
function Legal() {
  const badge = (s: string) =>
    s === 'Active' ? statusPill('Active', C.green) : s === 'Expired' ? statusPill('Expired', C.faint) : statusPill('Awaiting signature', C.amber);
  return (
    <div style={contentStyle}>
      <PageHead
        title="Legal & Contracts"
        sub="Signed agreements, NDAs, and vendor contracts — plus templates ready to send."
        actions={
          <Btn icon="plus" gold>
            New contract
          </Btn>
        }
      />
      <SectionLabel>Templates ready to send</SectionLabel>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {TEMPLATES.map((t) => (
          <Card key={t.label} hover style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 18px', cursor: 'pointer' }}>
            <span style={{ color: C.gold }}>
              <Icon name={t.icon} size={17} />
            </span>
            <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{t.label}</span>
            <span style={{ color: C.faint, marginLeft: 4 }}>
              <Icon name="arrow-up-right" size={14} />
            </span>
          </Card>
        ))}
      </div>
      <SectionLabel>All contracts</SectionLabel>
      <Table head={['Contract', 'Counterparty', 'Type', 'Signed', 'Status'].map((h) => <Th key={h}>{h}</Th>)}>
        {CONTRACTS.map((c) => (
          <tr key={c.title}>
            <Td>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <Icon name="scale" size={16} color={C.faint} />
                <span style={{ fontWeight: 600, fontSize: 13 }}>{c.title}</span>
              </div>
            </Td>
            <Td>
              <span style={{ color: C.muted }}>{c.party}</span>
            </Td>
            <Td>
              <Pill border={C.line2} color={C.muted}>
                {c.kind}
              </Pill>
            </Td>
            <Td>
              <span style={{ fontFamily: C.mono, color: C.muted }}>{c.signed}</span>
            </Td>
            <Td>{badge(c.status)}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

export function LlcWorkspace({ screen }: { screen: string }) {
  switch (screen) {
    case 'llc_documents':
      return <Documents />;
    case 'llc_members':
      return <Members />;
    case 'llc_contractors':
      return <Contractors />;
    case 'llc_compliance':
      return <Compliance />;
    case 'llc_banking':
      return <Banking />;
    case 'llc_legal':
      return <Legal />;
    case 'llc_overview':
    default:
      return <Overview />;
  }
}
