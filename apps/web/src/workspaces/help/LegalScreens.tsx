import type { CSSProperties } from 'react';
import type { Theme } from '../../theme/themes';
import {
  TERMS,
  PRIVACY,
  RULES,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_VERSION,
  COMPANY,
  type Block,
  type LegalDoc,
} from '../../legal/content';

// The Site Help legal screens: Rules & Conduct,
// Terms of Service, and Privacy Policy. These render long-form legal copy from
// legal/content.ts. Per CLAUDE.md, legal paragraphs are intentionally NOT
// wrapped in <EditableText> — they are edited in the content module, not inline.

function page(children: React.ReactNode) {
  return <div style={{ maxWidth: 820, margin: '0 auto', padding: '4px 2px 40px' }}>{children}</div>;
}

function DocHeader({ title, theme }: { title: string; theme: Theme }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#eef3ff' }}>{title}</h2>
      <div
        style={{
          marginTop: 8,
          fontSize: 11,
          color: '#7488b5',
          fontFamily: "'IBM Plex Mono', monospace",
          letterSpacing: '0.3px',
        }}
      >
        {COMPANY.entity} · Effective {LEGAL_EFFECTIVE_DATE} · v{LEGAL_VERSION}
      </div>
      <div
        style={{
          marginTop: 12,
          padding: '9px 12px',
          borderRadius: 8,
          border: `1px solid ${theme.navBorder}`,
          background: 'rgba(11,26,58,.5)',
          fontSize: 11.5,
          color: '#9fb0d6',
          lineHeight: 1.5,
        }}
      >
        {COMPANY.product} is an informational and educational tool. It does not provide financial,
        investment, or trading advice, and nothing in it should be relied on as such.
      </div>
    </div>
  );
}

const paraStyle: CSSProperties = {
  margin: '0 0 12px',
  fontSize: 13,
  color: '#ccd7ef',
  lineHeight: 1.65,
};

function noteStyle(theme: Theme): CSSProperties {
  return {
    margin: '0 0 14px',
    padding: '11px 14px',
    borderLeft: `3px solid ${theme.accent}`,
    borderRadius: 6,
    background: 'rgba(255,255,255,.04)',
    fontSize: 12.5,
    fontWeight: 600,
    color: '#e6edff',
    lineHeight: 1.6,
  };
}

function renderBlock(b: Block, i: number, theme: Theme) {
  if ('p' in b) {
    return (
      <p key={i} style={paraStyle}>
        {b.p}
      </p>
    );
  }
  if ('note' in b) {
    return (
      <div key={i} style={noteStyle(theme)}>
        {b.note}
      </div>
    );
  }
  return (
    <ul key={i} style={{ margin: '0 0 12px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 7 }}>
      {b.ul.map((li, j) => (
        <li key={j} style={{ fontSize: 12.5, color: '#ccd7ef', lineHeight: 1.6 }}>
          {li}
        </li>
      ))}
    </ul>
  );
}

// The body of a legal document (header + intro + sections), without the page
// wrapper — reused by the Site Help screens and the first-run acceptance gate.
export function LegalDocBody({ doc, theme }: { doc: LegalDoc; theme: Theme }) {
  return (
    <>
      <DocHeader title={doc.title} theme={theme} />
      <p style={{ ...paraStyle, color: '#aebcd8', marginBottom: 22 }}>{doc.intro}</p>
      {doc.sections.map((s, i) => (
        <section key={i} style={{ marginBottom: 22 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: theme.accent }}>{s.heading}</h3>
          {s.blocks.map((b, j) => renderBlock(b, j, theme))}
        </section>
      ))}
    </>
  );
}

// The Rules & Conduct overview body, without the page wrapper.
export function RulesBody({ theme }: { theme: Theme }) {
  return (
    <>
      <DocHeader title={RULES.title} theme={theme} />
      <p style={{ ...paraStyle, color: '#aebcd8', marginBottom: 22 }}>{RULES.intro}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {RULES.groups.map((g, i) => (
          <div
            key={i}
            style={{
              background: 'rgba(11,26,58,.5)',
              border: `1px solid ${theme.navBorder}`,
              borderRadius: 12,
              padding: '15px 18px',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: '#eef3ff', marginBottom: g.intro ? 4 : 10 }}>
              {g.heading}
            </div>
            {g.intro && <p style={{ ...paraStyle, marginBottom: 10, color: '#aebcd8' }}>{g.intro}</p>}
            <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {g.items.map((it, j) => (
                <li key={j} style={{ fontSize: 12.5, color: '#ccd7ef', lineHeight: 1.6 }}>
                  {it}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div style={{ ...noteStyle(theme), marginTop: 18, marginBottom: 0 }}>{RULES.closing}</div>
    </>
  );
}

export function HelpTerms({ theme }: { theme: Theme }) {
  return page(<LegalDocBody doc={TERMS} theme={theme} />);
}

export function HelpPrivacy({ theme }: { theme: Theme }) {
  return page(<LegalDocBody doc={PRIVACY} theme={theme} />);
}

export function HelpRules({ theme }: { theme: Theme }) {
  return page(<RulesBody theme={theme} />);
}
