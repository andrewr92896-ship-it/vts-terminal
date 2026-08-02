// The terminal's legal documents, kept as structured data so they render
// consistently in Site Help and in the first-run acceptance gate.
//
// These are long-form legal paragraphs, NOT site "wording": they are
// deliberately NOT wrapped in <EditableText> (see CLAUDE.md — paragraphs and
// legal copy are excluded from inline editing). Edit the text here when the
// documents change, and bump LEGAL_VERSION below AND the matching constant in
// apps/api/src/legal/version.ts together so the acceptance gate re-prompts
// everyone. Keep LEGAL_EFFECTIVE_DATE in step with LEGAL_VERSION.
//
// NOTE: These documents are a good-faith, industry-standard starting point
// drafted to reduce liability; they are not a substitute for review by a
// licensed attorney before public launch.

export const LEGAL_VERSION = '2026-07-23.1';
export const LEGAL_EFFECTIVE_DATE = 'July 23, 2026';

export const COMPANY = {
  entity: 'Vitalis Trading Systems LLC',
  short: 'Vitalis Trading Systems',
  product: 'VTS Terminal',
  state: 'Ohio',
  country: 'United States',
  contactEmail: 'support@vitalistradingsystems.com',
} as const;

// ---- Document model -------------------------------------------------------

export type Block =
  | { p: string } // a paragraph
  | { ul: string[] } // a bulleted list
  | { note: string }; // a set-apart callout (e.g. a bold disclaimer)

export interface LegalSection {
  heading: string;
  blocks: Block[];
}

export interface LegalDoc {
  title: string;
  intro: string;
  sections: LegalSection[];
}

// ===========================================================================
//  TERMS OF SERVICE
// ===========================================================================

export const TERMS: LegalDoc = {
  title: 'Terms of Service',
  intro:
    `These Terms of Service (the "Terms") are a binding agreement between you and ${COMPANY.entity} ` +
    `("${COMPANY.short}," "we," "us," or "our") governing your access to and use of ${COMPANY.product} ` +
    `(the "Terminal," the "Service," or the "app"), including any related mobile applications, home-screen ` +
    `widgets, notifications, and features. Please read them carefully. By creating an account, signing in, ` +
    `or otherwise using the Service, you agree to these Terms and to our Privacy Policy, which is ` +
    `incorporated here by reference. If you do not agree, do not use the Service.`,
  sections: [
    {
      heading: '1. Acceptance of these Terms',
      blocks: [
        {
          p:
            'By accessing or using the Service, and by clicking to accept when prompted, you acknowledge ' +
            'that you have read, understood, and agree to be bound by these Terms and the Privacy Policy. ' +
            'We may require you to re-accept an updated version of these documents before continuing to use ' +
            'the Service. If you are using the Service on behalf of another person or an organization, you ' +
            'represent that you are authorized to accept these Terms for them.',
        },
        {
          p:
            'The Service is currently private and offered by invitation only. There is no public sign-up. A ' +
            'read-only demonstration account and an Early Access request form may be made available, but ' +
            'access to the live Terminal is granted at our sole discretion and may be modified or withdrawn at ' +
            'any time.',
        },
      ],
    },
    {
      heading: '2. What the Service is — and is not',
      blocks: [
        {
          p:
            `${COMPANY.product} is a private, invite-only, read-only tracking and collaboration tool for a ` +
            'small group of individuals who already know and trust one another. It lets you and your ' +
            'chosen teammates record, view, organize, and discuss your own trading activity, connect ' +
            'read-only broker data, study together, and share notes. It is intended purely for ' +
            'informational, organizational, educational, and personal-reference purposes.',
        },
        {
          p:
            'The Service is a tracker and a workspace. It does not operate as a brokerage, an exchange, a ' +
            'trading platform, a money-transmitter, a copy-trading or signal service, an investment adviser, ' +
            'a broker-dealer, or a bank. The Service does not place, execute, route, copy, mirror, or manage ' +
            'trades or orders, does not hold, move, or custody money or assets, does not provide financial ' +
            'products or advisory services, and does not manage anyone’s account. Any actual trading you do ' +
            'happens entirely outside the Service, through your own broker, under your own control and ' +
            'responsibility.',
        },
        {
          p:
            'The purpose of the Service is to help people you personally know work together on their own ' +
            'individual trading. It is not a marketplace, a lead-generation tool, an advisory offering, or a ' +
            'vehicle for soliciting, recruiting, or selling to strangers or the public.',
        },
      ],
    },
    {
      heading: '3. No financial, investment, or professional advice',
      blocks: [
        {
          note:
            'THE SERVICE IS FOR INFORMATIONAL AND EDUCATIONAL PURPOSES ONLY. NOTHING IN OR PRODUCED BY THE ' +
            'SERVICE IS FINANCIAL, INVESTMENT, TRADING, LEGAL, ACCOUNTING, OR TAX ADVICE, A RECOMMENDATION, ' +
            'OR A SOLICITATION OR OFFER TO BUY, SELL, OR HOLD ANY SECURITY, CONTRACT, CRYPTO ASSET, OR OTHER ' +
            'FINANCIAL INSTRUMENT.',
        },
        {
          p:
            'The Service is not a substitute for the advice of a licensed and qualified professional. We are ' +
            'not your broker, investment adviser, financial planner, fiduciary, or agent, and no such ' +
            'relationship is created by your use of the Service, by your membership on a team, or by any ' +
            'communication, data, alert, market news item, AI output, session bias, coaching note, or other ' +
            'content made available through the Service.',
        },
        {
          p:
            'Trading and investing involve a substantial and real risk of loss and are not suitable for ' +
            'everyone; you can lose some or all of your capital. Past performance is not indicative of, and ' +
            'does not guarantee, future results. Any market commentary, news, tags, briefs, "session bias," ' +
            'or AI-generated content is general in nature, may be inaccurate, incomplete, or out of date, ' +
            'and must not be relied upon as advice or as a basis for any decision.',
        },
        {
          p:
            'You are solely and exclusively responsible for your own trading and financial decisions and for ' +
            'independently evaluating any information before acting on it. You should consult your own ' +
            'licensed financial, legal, and tax advisers regarding your specific situation. Any action you ' +
            'take based on information from the Service is taken at your own risk.',
        },
      ],
    },
    {
      heading: '4. Eligibility and accounts',
      blocks: [
        {
          p:
            'You must be at least 18 years old and able to form a binding contract to use the Service. The ' +
            'Service is not directed to and may not be used by anyone under 18. You must provide accurate ' +
            'information and keep it current.',
        },
        {
          p:
            'Accounts are personal to a single individual. You are responsible for all activity under your ' +
            'account and for keeping your credentials confidential. You must notify us promptly of any ' +
            'unauthorized use or suspected compromise of your account.',
        },
        {
          note:
            'One person per account. You may not share, sell, transfer, or provide access to your account, ' +
            'or allow more than one person to use a single account, under any circumstances. Each person ' +
            'who uses the Service must have their own account.',
        },
      ],
    },
    {
      heading: '5. Teams, shared visibility, and assumption of risk',
      blocks: [
        {
          p:
            'The Service is organized into "teams." When you join a team, you and your teammates can see a ' +
            'great deal of one another’s information within the Terminal — including trades and positions, ' +
            'trade history and results, broker capital figures, trading metrics, team chat, study content, ' +
            'and other team-scoped data. Joining a team is a decision to share this information with those ' +
            'specific people.',
        },
        {
          note:
            'Only work with people you personally know and trust. Assume that everyone on your team can ' +
            'see essentially all of your team-scoped information. Do not join a team with, or invite, ' +
            'strangers. We are not responsible for how your teammates use information you choose to share ' +
            'with them.',
        },
        {
          p:
            'Data in the Service can be created, edited, and deleted by users, including trade entries and ' +
            'results. Information shared by a teammate is self-reported and unverified. You are responsible ' +
            'for deciding whom to trust, and you accept the risks of team-based sharing described in these ' +
            'Terms and in Section 6.',
        },
      ],
    },
    {
      heading: '6. Trading data, metrics, and data integrity',
      blocks: [
        {
          p:
            'Trades, results, balances, and metrics recorded in the Service are entered, imported, or ' +
            'connected by users and can be added to, changed, corrected, or removed at any time. Being able ' +
            'to add trades manually, edit your information, and delete trades is an intentional part of the ' +
            'design: it lets you keep records that are accurate and meaningful for your own goals — for ' +
            'example, removing test or erroneous entries or adding trades placed outside a connected broker. ' +
            'As a consequence of that same flexibility, the data is not audited, verified, or guaranteed by ' +
            'us and may not reflect actual trading outcomes.',
        },
        {
          note:
            'Because trade data can be edited, it must not be used to demonstrate, prove, market, or ' +
            'advertise anyone’s trading performance or track record. Trading metrics in the Service are ' +
            'for your own personal reference and for reference within your team only.',
        },
        {
          p:
            'You must understand and accept that relying on another person’s displayed metrics or results ' +
            'as a reason to trust them, follow them, or copy them can lead to losses, because that data can ' +
            'be manipulated or is simply mistaken. Do not treat any figures in the Service as verified ' +
            'performance. You may share your own trade information and results with your team for ' +
            'troubleshooting, journaling, discussion, and mutual reference — but never to induce, solicit, ' +
            'or encourage anyone to copy your trades or to pay for access to them (see Section 7).',
        },
      ],
    },
    {
      heading: '7. Acceptable use and prohibited conduct',
      blocks: [
        { p: 'You agree that you will not, and will not permit or help anyone else to:' },
        {
          ul: [
            'Pay another person to place trades for you, or accept payment to place trades for others, and ' +
              'you will not offer, operate, join, or participate in any paid copy-trading, mirror-trading, ' +
              'managed-account, or trade-signal-for-compensation arrangement through or in connection with ' +
              'the Service.',
            'Use webhooks, bots, automation, mirroring, or order-routing to relay, copy, or execute another ' +
              'person’s trades or signals into any account. Any trade you place must be entered by you, ' +
              'manually and independently, in your own broker account — never automatically wired to ' +
              'execute or copy another person’s trades.',
            'Use the Service, or any trade information, results, or metrics from it, to solicit, recruit, ' +
              'advertise to, or induce any person to copy your trades, follow your trades, or pay for access ' +
              'to your trades or "signals."',
            'Access, view, request, scrape, or attempt to obtain the trades, positions, results, capital, ' +
              'metrics, chat, or other data of any person who is not on your team. Viewing data belonging to ' +
              'people outside your own team is strictly prohibited.',
            'Provide, or hold yourself out as providing, personalized investment, financial, or trading ' +
              'advice through the Service, or otherwise act as an unregistered adviser, broker, or ' +
              'money-manager.',
            'Attempt to obtain financial or investment advice or recommendations from the built-in AI ' +
              'assistants, or attempt to bypass, weaken, "jailbreak," or work around any restriction, ' +
              'safeguard, or refusal that the AI or the Service imposes (see Section 8).',
            'Upload, enter, or use any content you do not have the right to use — including copyrighted or ' +
              'other proprietary material — in study games, flashcards, study guides, notes, chat, or ' +
              'anywhere else in the Service.',
            'Share, sell, or transfer your account, or use another person’s account; use the Service to ' +
              'infringe intellectual-property or privacy rights; or misuse, disclose, or re-share another ' +
              'user’s information for any purpose other than the legitimate, mutual, team-based ' +
              'collaboration the Service is intended for.',
            'Violate any law or regulation, or the terms, policies, or acceptable-use rules of any ' +
              'third-party service you connect or use with the Service, including any broker, exchange, or ' +
              'API (see Section 11).',
            'Interfere with, disrupt, probe, overload, reverse-engineer, or attempt to gain unauthorized ' +
              'access to the Service, its security, other accounts, or its underlying systems; or use bots, ' +
              'scrapers, or automated means except features we expressly provide.',
            'Use the Service to transmit malware, spam, harassing, defamatory, hateful, or unlawful ' +
              'content, or to impersonate any person or entity.',
          ],
        },
        {
          p:
            'These rules exist to keep the Service a lawful, private tool for people who know one another. ' +
            'Violating them may result in immediate suspension or removal from the platform (see Section 16).',
        },
      ],
    },
    {
      heading: '8. AI features',
      blocks: [
        {
          p:
            'The Service includes AI-assisted features (for example, an "Ask" assistant, study tutoring, ' +
            'market-news summaries, screenshot analysis, and coaching-style reads). AI output is generated ' +
            'automatically, is provided for informational and educational purposes only, may be wrong, ' +
            'incomplete, or misleading, and must not be relied upon as advice of any kind. You are ' +
            'responsible for independently verifying anything you use.',
        },
        {
          note:
            'The AI assistants are designed and instructed to refuse to give financial, investment, or ' +
            'trading advice or personalized recommendations. Attempting to trick, prompt, or work around ' +
            'the AI to obtain such advice, or to bypass any other safeguard or rule, is prohibited and can ' +
            'result in removal from the platform.',
        },
        {
          p:
            'To keep the Service safe and compliant, AI conversations and support interactions are not ' +
            'private: they may be logged, monitored, and reviewed by our administrators, and the Service ' +
            'may flag attempts to misuse the AI or evade its restrictions for administrator review. By using ' +
            'the AI and support features you consent to this logging, monitoring, and review as further ' +
            'described in the Privacy Policy.',
        },
      ],
    },
    {
      heading: '9. Your content and license',
      blocks: [
        {
          p:
            '"User Content" means anything you submit to the Service — for example trade entries and notes, ' +
            'study games, flashcards and study guides, chat messages, bug reports, suggestions, uploaded ' +
            'files, and profile details. You retain whatever ownership rights you already have in your User ' +
            'Content.',
        },
        {
          p:
            'You grant us a limited, non-exclusive, worldwide, royalty-free license to host, store, process, ' +
            'display, and transmit your User Content solely to operate, secure, support, and improve the ' +
            'Service and to make it available to you and, where you have chosen to share it, to your team. ' +
            'You represent and warrant that you have all rights necessary to submit your User Content and ' +
            'that it does not infringe any third party’s rights or violate any law or these Terms.',
        },
        {
          p:
            'We may remove or disable User Content that we believe violates these Terms or the law, but we ' +
            'are not obligated to monitor or review User Content and are not responsible for it.',
        },
      ],
    },
    {
      heading: '10. Intellectual property, copyright, and DMCA',
      blocks: [
        {
          p:
            `The Service, including its software, design, text, graphics, and trademarks, is owned by ` +
            `${COMPANY.short} or its licensors and is protected by intellectual-property laws. Except for the ` +
            'limited right to use the Service under these Terms, no rights are granted to you. You may not ' +
            'copy, modify, distribute, sell, or create derivative works from the Service.',
        },
        {
          p:
            'You must not upload or use content that infringes anyone’s copyright or other rights, ' +
            'including in study games, flashcards, study guides, or any other feature. We respond to valid ' +
            'notices of alleged copyright infringement under the Digital Millennium Copyright Act (DMCA) and ' +
            'may remove infringing material and terminate repeat infringers.',
        },
        {
          p:
            `To submit a copyright notice, contact us at ${COMPANY.contactEmail} with: (a) your signature ` +
            '(physical or electronic); (b) identification of the copyrighted work; (c) identification of the ' +
            'allegedly infringing material and its location in the Service; (d) your contact information; ' +
            '(e) a statement that you have a good-faith belief the use is not authorized; and (f) a ' +
            'statement, under penalty of perjury, that your notice is accurate and that you are the owner or ' +
            'authorized to act for the owner. A counter-notice may be submitted with the corresponding ' +
            'information required by the DMCA.',
        },
      ],
    },
    {
      heading: '11. Third-party services and broker connections',
      blocks: [
        {
          p:
            'The Service can connect to third-party services, including brokers and exchanges (for example ' +
            'via read-only API keys or tokens), notification providers, and AI providers. Those services are ' +
            'operated by third parties under their own terms and privacy policies, and we do not control and ' +
            'are not responsible for them.',
        },
        {
          note:
            'You are responsible for complying with all terms, conditions, policies, and acceptable-use ' +
            'and API rules of any third-party service you connect or use with the Service. This includes ' +
            'using only the access you are permitted to use (for example, read-only keys where required) ' +
            'and honoring any restrictions your broker or an API provider imposes.',
        },
        {
          p:
            'You are solely responsible for your own relationships and accounts with your broker and any ' +
            'other third party, and for any consequences of connecting them to the Service. We strongly ' +
            'recommend using read-only or query-only credentials wherever available. You are responsible for ' +
            'the credentials you provide and for revoking them if needed.',
        },
        {
          p:
            'Data retrieved from brokers and other third parties may be delayed, inaccurate, incomplete, or ' +
            'unavailable, and third parties may change or discontinue their services or APIs at any time. ' +
            'The Service’s display of such data is for convenience only; your broker’s own statements and ' +
            'records are the authoritative record of your account. We may suspend or remove any third-party ' +
            'integration at any time.',
        },
      ],
    },
    {
      heading: '12. Privacy',
      blocks: [
        {
          p:
            'Our Privacy Policy explains what information we collect, how we use and share it, how it is ' +
            'protected, and your choices. By using the Service you also agree to the Privacy Policy. Please ' +
            'note in particular that AI and support conversations may be reviewed by administrators, that ' +
            'team-scoped data is visible to your teammates, and that team chat is private among team members.',
        },
      ],
    },
    {
      heading: '13. Disclaimers of warranties',
      blocks: [
        {
          note:
            'THE SERVICE AND ALL CONTENT ARE PROVIDED "AS IS" AND "AS AVAILABLE," WITH ALL FAULTS AND ' +
            'WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY.',
        },
        {
          p:
            'To the fullest extent permitted by law, we disclaim all warranties, including implied warranties ' +
            'of merchantability, fitness for a particular purpose, title, and non-infringement, and any ' +
            'warranties arising from course of dealing or usage of trade. We do not warrant that the Service ' +
            'will be uninterrupted, secure, error-free, accurate, complete, current, or that any data, ' +
            'metric, alert, price, or AI output is reliable. You use the Service, and rely on any content, ' +
            'at your own risk.',
        },
      ],
    },
    {
      heading: '14. Limitation of liability',
      blocks: [
        {
          note:
            'TO THE FULLEST EXTENT PERMITTED BY LAW, VITALIS TRADING SYSTEMS LLC AND ITS OWNERS, MEMBERS, ' +
            'OFFICERS, EMPLOYEES, CONTRACTORS, AND AGENTS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, ' +
            'SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, ' +
            'DATA, GOODWILL, OR TRADING OR INVESTMENT LOSSES, ARISING OUT OF OR RELATING TO THE SERVICE OR ' +
            'THESE TERMS, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.',
        },
        {
          p:
            'This includes, without limitation, any losses arising from your or a teammate’s trading ' +
            'decisions; from reliance on any information, data, metric, result, news, or AI output; from ' +
            'inaccurate, edited, or manipulated data; from the acts or omissions of teammates or third ' +
            'parties (including brokers and APIs); or from unauthorized access to your data.',
        },
        {
          p:
            'To the fullest extent permitted by law, our total aggregate liability for all claims relating ' +
            'to the Service or these Terms will not exceed the greater of the amount you paid us for the ' +
            'Service in the twelve months before the claim, or one hundred U.S. dollars ($100). Some ' +
            'jurisdictions do not allow certain limitations, so some of the above may not apply to you.',
        },
      ],
    },
    {
      heading: '15. Indemnification',
      blocks: [
        {
          p:
            `You agree to defend, indemnify, and hold harmless ${COMPANY.entity} and its owners, members, ` +
            'officers, employees, contractors, and agents from and against any claims, liabilities, damages, ' +
            'losses, and expenses (including reasonable attorneys’ fees) arising out of or related to ' +
            'your use of the Service, your User Content, your trading or financial decisions, your ' +
            'connections to third-party services, your violation of these Terms or any law, or your ' +
            'violation of the rights of any person, including your teammates.',
        },
      ],
    },
    {
      heading: '16. Suspension and termination',
      blocks: [
        {
          p:
            'We may suspend, restrict, or terminate your access to the Service at any time, with or without ' +
            'notice, including if we believe you have violated these Terms, misused the AI or attempted to ' +
            'evade its safeguards, put the Service, other users, or any third party at risk, or engaged in ' +
            'conduct that is unlawful or inconsistent with the private, informational nature of the Service. ' +
            'Serious or repeated violations can result in permanent removal from the platform.',
        },
        {
          p:
            'You may stop using the Service at any time. You may request deletion of your account as ' +
            'described in the Privacy Policy. Sections that by their nature should survive termination — ' +
            'including disclaimers, limitations of liability, indemnification, intellectual property, and ' +
            'dispute-resolution provisions — will survive.',
        },
      ],
    },
    {
      heading: '17. Changes to the Service and these Terms',
      blocks: [
        {
          p:
            'We may change, suspend, or discontinue any part of the Service at any time. We may also update ' +
            'these Terms or the Privacy Policy from time to time. When we make material changes, we will ' +
            'update the "effective date" and may ask you to review and accept the updated documents before ' +
            'continuing to use the Service. Your continued use after an update means you accept the changes.',
        },
      ],
    },
    {
      heading: '18. Governing law and dispute resolution',
      blocks: [
        {
          p:
            `These Terms are governed by the laws of the State of ${COMPANY.state} and applicable U.S. ` +
            'federal law, without regard to conflict-of-laws rules. Subject to the arbitration provision ' +
            `below, you agree that the state and federal courts located in ${COMPANY.state} will have ` +
            'exclusive jurisdiction and venue over any dispute not subject to arbitration, and you consent ' +
            'to personal jurisdiction there.',
        },
        {
          p:
            'Please contact us first — most concerns can be resolved informally. To the fullest extent ' +
            'permitted by law, any dispute arising out of or relating to these Terms or the Service that ' +
            'cannot be resolved informally will be resolved by binding individual arbitration administered ' +
            'in ' +
            `${COMPANY.state}` +
            ', rather than in court, except that either party may bring an individual claim in small-claims ' +
            'court or seek injunctive relief for intellectual-property or misuse claims.',
        },
        {
          note:
            'CLASS-ACTION AND JURY-TRIAL WAIVER. To the fullest extent permitted by law, disputes will be ' +
            'resolved only on an individual basis; you and we waive any right to participate in a class, ' +
            'collective, or representative action, and waive any right to a jury trial. You may opt out of ' +
            'arbitration by notifying us in writing within 30 days of first accepting these Terms.',
        },
        {
          p:
            'To the extent permitted by law, any claim relating to the Service or these Terms must be ' +
            'brought within one (1) year after it arises, or it is permanently barred.',
        },
      ],
    },
    {
      heading: '19. General',
      blocks: [
        {
          p:
            'These Terms and the Privacy Policy are the entire agreement between you and us regarding the ' +
            'Service and supersede any prior agreements. If any provision is found unenforceable, the rest ' +
            'remains in effect and the unenforceable provision will be limited to the minimum extent ' +
            'necessary. Our failure to enforce a provision is not a waiver. You may not assign these Terms ' +
            'without our consent; we may assign them in connection with a merger, acquisition, or sale of ' +
            'assets. There are no third-party beneficiaries. Headings are for convenience only.',
        },
      ],
    },
    {
      heading: '20. Contact',
      blocks: [
        {
          p:
            `Questions about these Terms? Contact ${COMPANY.entity} at ${COMPANY.contactEmail}, or use ` +
            'Site Help ▸ Report a bug inside the Terminal.',
        },
      ],
    },
  ],
};

// ===========================================================================
//  PRIVACY POLICY
// ===========================================================================

export const PRIVACY: LegalDoc = {
  title: 'Privacy Policy',
  intro:
    `This Privacy Policy explains how ${COMPANY.entity} ("${COMPANY.short}," "we," "us," or "our") ` +
    `collects, uses, shares, and protects information in connection with ${COMPANY.product} (the "Service"). ` +
    `${COMPANY.product} is a private, invite-only, read-only trading tracker and collaboration tool. By ` +
    'using the Service, you agree to this Policy. If you do not agree, do not use the Service.',
  sections: [
    {
      heading: '1. Who we are',
      blocks: [
        {
          p:
            `${COMPANY.entity} is a limited liability company based in the State of ${COMPANY.state}, ` +
            `${COMPANY.country}, and is the controller of personal information processed through the ` +
            `Service. You can reach us at ${COMPANY.contactEmail}.`,
        },
      ],
    },
    {
      heading: '2. Information we collect',
      blocks: [
        { p: 'We collect the following categories of information:' },
        {
          ul: [
            'Account and profile information: your username, display name, email address (where provided), ' +
              'password (stored only as a secure cryptographic hash — we never store your plaintext ' +
              'password), optional profile picture, assigned roles, team membership, and badges.',
            'Content you provide: trades, positions, results, notes and journals, strategy sessions, ' +
              'study games, flashcards and study guides, to-do items, team chat messages, announcements, ' +
              'bug reports, suggestions, feedback, and any files or screenshots you upload.',
            'Broker and third-party connection data: information needed to connect read-only broker or ' +
              'exchange feeds (such as API keys or tokens and account identifiers) and the resulting ' +
              'read-only trading data (positions, balances/NAV, and closed trades). Broker credentials are ' +
              'stored encrypted (see Security).',
            'AI and support interactions: the prompts, messages, screenshots, and other content you send ' +
              'to the AI features and to support/bug intake, and the responses. These are logged and are ' +
              'available to administrators (see Sections 5 and 6).',
            'Usage, device, and log data: IP address, browser/device and user-agent information, session ' +
              'and cookie identifiers, pages/actions and timestamps, approximate metering of AI usage, and ' +
              'diagnostic logs.',
            'Notification data: push-notification subscription tokens and related device information used ' +
              'to deliver web-push and Pushover notifications you opt into.',
          ],
        },
        {
          p:
            'We do not intentionally collect special-category or sensitive personal information beyond what ' +
            'you choose to enter, and we ask that you not submit sensitive personal information that the ' +
            'Service does not need.',
        },
      ],
    },
    {
      heading: '3. How we use information',
      blocks: [
        { p: 'We use information to:' },
        {
          ul: [
            'Provide, operate, maintain, and secure the Service and its features;',
            'Authenticate you, manage your account, teams, roles, and permissions;',
            'Display your data to you and, where you have chosen to share it, to your teammates;',
            'Connect and refresh read-only broker data and deliver notifications you opt into;',
            'Provide AI-assisted features and support, and process and review those interactions for ' +
              'quality, safety, and rule enforcement;',
            'Monitor for, investigate, and prevent prohibited conduct, security incidents, abuse, and ' +
              'violations of our Terms — including attempts to misuse the AI or evade its safeguards;',
            'Diagnose problems, understand usage, and improve the Service; and',
            'Comply with legal obligations and enforce our Terms.',
          ],
        },
        {
          p:
            'We do not sell your personal information, and we do not use it to serve third-party ' +
            'advertising.',
        },
      ],
    },
    {
      heading: '4. Visibility within the Terminal (teams, trades, and chat)',
      blocks: [
        {
          p:
            'The Service is built around trust boundaries. How your information is visible depends on your ' +
            'team:',
        },
        {
          ul: [
            'Trades and team-scoped data are visible only to members of your own team. They are not shown ' +
              'to other teams or to the public.',
            'Team chat among your team’s members is private to that team.',
            'Data belonging to people outside your team is not available to you, and viewing it is ' +
              'prohibited by the Terms.',
          ],
        },
        {
          note:
            'Trades, positions, results, and team-scoped trading data are not made available for browsing ' +
            'by our developers or administrators as part of normal operations. Administrators do not use ' +
            'the Terminal to view your team’s trades.',
        },
        {
          p:
            'Please understand the practical limits of any private system: within your team, teammates can ' +
            'see essentially all team-scoped information, so share only with people you trust. In addition, ' +
            'as with any hosted service, personnel with database or infrastructure access could ' +
            'technically access stored data when strictly necessary for security, legal, maintenance, or ' +
            'abuse-prevention reasons, and we may access specific data when you ask us to (for example, to ' +
            'troubleshoot an issue you report) or when required by law. We limit such access to what is ' +
            'necessary.',
        },
      ],
    },
    {
      heading: '5. AI and support conversations are not private',
      blocks: [
        {
          note:
            'Your interactions with the AI assistants and with support/bug intake are logged and can be ' +
            'reviewed by our administrators. They are not private and are not treated as confidential ' +
            'team chat.',
        },
        {
          p:
            'We do this to keep the Service safe and compliant — including to enforce our rule that the AI ' +
            'must not be used for financial or investment advice and must not be manipulated to bypass its ' +
            'safeguards. The Service may flag suspected misuse or circumvention attempts so that a member of ' +
            'the administrative team can review the relevant AI chat or support history. By using the AI and ' +
            'support features, you consent to this logging, monitoring, and review.',
        },
      ],
    },
    {
      heading: '6. How we share information',
      blocks: [
        { p: 'We share information only as described here:' },
        {
          ul: [
            'With your team: team-scoped content you create or choose to share is visible to your ' +
              'teammates, as described in Section 4.',
            'With service providers: vendors that host and operate the Service and provide specific ' +
              'features on our behalf, such as our hosting/infrastructure provider, our AI provider ' +
              '(Anthropic, which processes AI prompts and content to generate responses), and ' +
              'push-notification providers. They may process information only to provide their services to ' +
              'us.',
            'With brokers and third parties you connect: to retrieve the read-only data you ask us to ' +
              'display, subject to their terms and privacy policies.',
            'For legal and safety reasons: when we believe disclosure is reasonably necessary to comply ' +
              'with law or legal process, enforce our Terms, or protect the rights, property, or safety of ' +
              'our users, the public, or us.',
            'In a business transfer: in connection with a merger, acquisition, financing, or sale of ' +
              'assets, subject to this Policy.',
          ],
        },
        { p: 'We do not sell or rent your personal information to third parties.' },
      ],
    },
    {
      heading: '7. Cookies and similar technologies',
      blocks: [
        {
          p:
            'We use a single, essential, signed, HTTP-only session cookie to keep you signed in; it is ' +
            'strictly necessary for the Service to function. As an installable web app (PWA), the Service ' +
            'also uses local browser storage and a service worker to cache the app shell and function ' +
            'reliably. We do not use third-party advertising or cross-site tracking cookies. Because we rely ' +
            'only on essential cookies, we do not respond to browser "Do Not Track" signals.',
        },
      ],
    },
    {
      heading: '8. Data retention',
      blocks: [
        {
          p:
            'We retain information for as long as your account is active and as needed to provide the ' +
            'Service, and thereafter as needed to comply with legal obligations, resolve disputes, maintain ' +
            'security, and enforce our agreements. When you delete content or your account, we delete or ' +
            'de-identify the associated personal information within a reasonable period, except where we are ' +
            'required or permitted to retain it (for example, in backups or logs for a limited time).',
        },
      ],
    },
    {
      heading: '9. Security',
      blocks: [
        {
          p:
            'We take reasonable technical and organizational measures to protect information. Passwords are ' +
            'stored only as strong cryptographic hashes; broker credentials are encrypted at rest; session ' +
            'tokens are stored only as hashes; access to sensitive data is limited. No method of ' +
            'transmission or storage is completely secure, however, and we cannot guarantee absolute ' +
            'security. You are responsible for keeping your credentials confidential and for using strong, ' +
            'unique passwords.',
        },
      ],
    },
    {
      heading: '10. Your choices and rights',
      blocks: [
        {
          p:
            'You can review and update much of your information from within the Service (for example, your ' +
            'profile, content, and notification preferences), and you can opt out of push notifications at ' +
            'any time through your device or the Service settings.',
        },
        {
          p:
            'Subject to applicable law, you may request to access, correct, or delete your personal ' +
            'information, or to close your account. You can request account deletion from within the ' +
            `Service where available, or by contacting us at ${COMPANY.contactEmail}. We will respond ` +
            'consistent with applicable law. We will not discriminate against you for exercising these ' +
            'rights.',
        },
      ],
    },
    {
      heading: '11. U.S. state privacy rights',
      blocks: [
        {
          p:
            'Depending on where you live, U.S. state privacy laws (such as those in California, and similar ' +
            'laws in other states) may give you rights to know or access the personal information we hold ' +
            'about you, to correct or delete it, to obtain a portable copy, and to opt out of the "sale" or ' +
            '"sharing" of personal information or certain targeted advertising. We do not sell or share ' +
            'personal information for cross-context behavioral advertising, and we do not use it for ' +
            'targeted advertising. To exercise any available right, contact us using the details in Section ' +
            '14; we may need to verify your identity before responding.',
        },
        {
          p:
            'Our home state of Ohio does not currently have a comprehensive consumer data privacy statute ' +
            'in effect, but we honor the practices described in this Policy for all users regardless of ' +
            'location.',
        },
      ],
    },
    {
      heading: '12. Children’s privacy',
      blocks: [
        {
          p:
            'The Service is intended only for adults 18 and older and is not directed to children. We do ' +
            'not knowingly collect personal information from anyone under 13, consistent with the ' +
            'Children’s Online Privacy Protection Act (COPPA). If we learn we have collected ' +
            'information from a child under 13, we will delete it. If you believe a child has provided us ' +
            'information, contact us.',
        },
      ],
    },
    {
      heading: '13. Changes to this Policy',
      blocks: [
        {
          p:
            'We may update this Policy from time to time. When we make material changes, we will update the ' +
            'effective date and may ask you to review and accept the updated Policy before continuing to ' +
            'use the Service. Your continued use after an update means you accept the updated Policy.',
        },
      ],
    },
    {
      heading: '14. Contact us',
      blocks: [
        {
          p:
            `If you have questions or requests about this Policy or your information, contact ` +
            `${COMPANY.entity} at ${COMPANY.contactEmail}, or use Site Help ▸ Report a bug inside the ` +
            'Terminal.',
        },
      ],
    },
  ],
};

// ===========================================================================
//  RULES & CONDUCT (plain-English overview shown in Site Help)
// ===========================================================================

export interface RulesGroup {
  heading: string;
  intro?: string;
  items: string[];
}

export interface RulesDoc {
  title: string;
  intro: string;
  groups: RulesGroup[];
  closing: string;
}

export const RULES: RulesDoc = {
  title: 'Rules & Conduct',
  intro:
    `A plain-English summary of how ${COMPANY.product} is meant to be used. This overview is for ` +
    'convenience only — the full, binding rules are in the Terms of Service and Privacy Policy, also in ' +
    'Site Help. If anything here seems to conflict with those documents, the full documents control.',
  groups: [
    {
      heading: 'The big picture',
      items: [
        'VTS Terminal is an informational and educational tracker and workspace — not financial, investment, ' +
          'or trading advice, and not a place for tips, signals, or recommendations.',
        'It exists so that people who already know and trust each other can track and discuss their own ' +
          'trading together. Only work with people you personally know.',
        'You are always responsible for your own trading and financial decisions. Trading carries a real ' +
          'risk of loss, and past results never guarantee future results.',
      ],
    },
    {
      heading: 'Trading with your team',
      items: [
        'Do not pay anyone to place or copy trades for you, and do not accept payment to trade for others. ' +
          'Paid copy-trading and signal services are not allowed.',
        'Do not use webhooks, bots, or automation to relay or copy anyone else’s trades. Any trade you ' +
          'place must be entered by you, manually and independently, in your own broker account — never ' +
          'wired up to execute automatically.',
        'You can share your own trade information and results with your team for troubleshooting, ' +
          'journaling, and reference — but never to get others to copy your trades or pay for them.',
        'You may only see your own team’s data. Viewing the trades, results, or information of anyone ' +
          'outside your team is strictly prohibited.',
      ],
    },
    {
      heading: 'Data and metrics',
      items: [
        'By design, you can add trades manually, edit your information, and delete trades — so you can keep ' +
          'records that are accurate and meaningful for your own goals (for example, clearing out test or ' +
          'mistaken entries).',
        'Because of that same flexibility, trade data is not verified and is not proof of performance. ' +
          'Metrics are for your own and your team’s reference only — never to advertise or demonstrate a ' +
          'track record.',
        'Do not trust someone just because of the numbers they show; those numbers can be changed or ' +
          'mistaken, and relying on them can lead to losses.',
      ],
    },
    {
      heading: 'AI, news, and advice',
      items: [
        'The AI assistants, market news, and any "brief," bias, or coaching content are informational only ' +
          'and are not advice. Do not act on them as advice.',
        'The AI will refuse to give financial or investment advice. Do not try to trick it or work around ' +
          'its limits — doing so can get you removed from the platform.',
        'AI chats and support conversations are not private: admins can review them, and the system may ' +
          'flag attempts to misuse the AI for review. (Team chat among teammates is private.)',
      ],
    },
    {
      heading: 'Accounts, content, and third parties',
      items: [
        'One person per account. Do not share, sell, or let anyone else use your account.',
        'Do not upload copyrighted or other material you don’t have the right to use — including in ' +
          'study games, flashcards, and study guides.',
        'Follow the terms of any third-party service you connect, especially broker and API rules. Prefer ' +
          'read-only broker access, and you remain responsible for your own broker relationship.',
      ],
    },
  ],
  closing:
    'Breaking these rules can lead to a warning, suspension, or permanent removal from the platform. ' +
    'When in doubt, read the full Terms of Service and Privacy Policy, or ask an admin.',
};
