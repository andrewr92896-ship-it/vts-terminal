// The PUBLIC terminal's legal documents. This file replaces the private
// legal content module at the build seam (see the public Vite config), so the Site Help screens
// render these instead of the private portal's operative documents.
//
// WHY THESE ARE SUMMARIES RATHER THAN THE REAL DOCUMENTS (owner decision, 2026-08):
// publishing a full Terms of Service and Privacy Policy before the service is actually
// launched creates obligations against a product that is still changing, so the owner
// does not want the operative text out yet. What is published instead is, for every
// subsection the real documents will carry, a plain line saying HOW IT WILL WORK. That
// keeps the pages useful to a visitor deciding whether to ask for beta access, and it
// keeps the pre-release honest: nothing here claims to be the binding agreement.
//
// LEGAL_STATUS is the banner the screens draw above all three documents. It is what
// makes the "in production" state impossible to miss and must not be quietly dropped.
export const LEGAL_VERSION='2026-08-30.1';export const LEGAL_EFFECTIVE_DATE='August 30, 2026';
export const LEGAL_STATUS='PRE-RELEASE — THIS DOCUMENT IS INCOMPLETE AND IN PRODUCTION. It is a plain-language summary of how the finished document will work, published so you can see the shape of it while the terminal is still being built. It is not the operative agreement, it creates no obligations on you, and the binding Terms of Service and Privacy Policy will be published before the service launches. Do not rely on it as legal terms.';
// TWO ADDRESSES, AND THEY ARE DIFFERENT JOBS. `contactEmail` is general contact
// — Terms questions, bugs, anything about the service. `privacyEmail` is where a
// request to see or delete what is held goes, and it is separate because those
// carry response deadlines in several states: a privacy request must not be
// findable only by digging through a pile of support mail. Both are aliases on
// one mailbox, so this costs nothing to monitor.
export const COMPANY={entity:'Vitalis Trading Systems LLC',short:'Vitalis Trading Systems',product:'VTS Public Terminal',state:'Ohio',country:'United States',contactEmail:'support@vitalistradingsystems.com',privacyEmail:'privacy@vitalistradingsystems.com'} as const;
export type Block={p:string}|{ul:string[]}|{note:string};export interface LegalSection{heading:string;blocks:Block[]}export interface LegalDoc{title:string;intro:string;sections:LegalSection[]}

export const TERMS:LegalDoc={
 title:'Terms of Service',
 intro:'A summary of the terms that will govern use of the public terminal. Each subsection below states how that part of the finished agreement will work. The full Terms of Service will be published at launch.',
 sections:[
 {heading:'Status of this document',blocks:[
  {note:'This is a pre-release summary, not the operative agreement. The binding Terms of Service will be published before launch, and continued use after that will be subject to them.'},
  {p:'How this will work: the finished Terms will carry an effective date and a version, the same way this page already does, and material changes will be notified inside the terminal before they take effect.'}]},
 {heading:'What the terminal is',blocks:[
  {p:'VTS Public Terminal is an informational and record-keeping tool. It shows market data and news, and it lets you keep your own trading records, notes, budget, net worth, portfolio and study material in one place.'},
  {p:'How this will work: the Terms will define the service as informational and educational software, and will list plainly what it does and does not do, so there is no gap between what is advertised and what is agreed.'}]},
 {heading:'What the terminal is not',blocks:[
  {note:'It is not a broker, not an exchange, not an investment adviser, and not a money transmitter. It does not hold, receive or transmit your funds, and it does not place, modify or cancel orders on any venue.'},
  {ul:['No order placement and no broker connections.','No custody: no deposits, no withdrawals, no balances held by us.','No managed accounts, no mirroring of anybody else’s trades, no signal service.','No guaranteed or promised results of any kind.']},
  {p:'How this will work: these exclusions will be stated as binding representations in the Terms, so what you are agreeing to is a piece of software rather than a financial service.'}]},
 {heading:'No advice and no recommendations',blocks:[
  {note:'Nothing in the terminal is financial, investment, legal, tax or trading advice, and nothing in it is a recommendation, solicitation or offer to buy or sell any instrument.'},
  {p:'Figures, charts, notes, study material and any automated commentary are informational only. They are not personalised to you, they take no account of your circumstances, objectives or risk tolerance, and they must not be relied on as a basis for a trading or investment decision.'},
  {p:'How this will work: the Terms will carry this as a standing disclaimer, and every advice-adjacent surface in the product will carry it again at the point of use rather than only in a document nobody reads.'}]},
 {heading:'Risk',blocks:[
  {note:'Trading foreign exchange, derivatives, crypto-assets and securities carries a high level of risk and is not suitable for everybody. You can lose more than you deposit. Past performance does not indicate future results.'},
  {p:'How this will work: the Terms will require you to acknowledge this risk statement before the account is usable, and it will remain reachable from every screen that displays a result.'}]},
 {heading:'Eligibility and your account',blocks:[
  {p:'Accounts are for individuals of legal age in their jurisdiction, used personally, and are not to be shared. Access during pre-release is by beta invitation only.'},
  {p:'How this will work: the Terms will set the minimum age, require accurate registration details, make you responsible for keeping your credentials secure, and require you to tell us promptly about unauthorised use.'}]},
 {heading:'Your records and your content',blocks:[
  {p:'Everything you enter — trades, notes, budgets, holdings, study material — stays yours. We do not sell it, and we do not use it to make recommendations to other users.'},
  {p:'How this will work: the Terms will confirm you keep ownership of your content, grant us only the limited licence needed to store and display it back to you, and will describe how to export or delete it.'}]},
 {heading:'Acceptable use',blocks:[
  {ul:['Use only your own account and your own records.','Do not attempt to reach another user’s data, any private service, or any part of the system you were not given.','Do not upload unlawful, infringing or harmful material.','Do not scrape, resell or redistribute market data obtained through the terminal.','Do not use the terminal to advise, solicit or manage money for other people.']},
  {p:'How this will work: the Terms will make these binding conditions of access, with suspension as the remedy, and will describe how a suspension is notified and appealed.'}]},
 {heading:'Market data and third-party sources',blocks:[
  {p:'Market data, news headlines and economic calendar entries come from third parties. They may be delayed, incomplete, revised or wrong, and they are provided as they are received.'},
  {note:'Never treat a figure in this terminal as a settlement price, an execution price, or a substitute for your broker’s or custodian’s own records.'},
  {p:'How this will work: the Terms will disclaim accuracy and timeliness for third-party data, name the reliance limits, and carry any pass-through terms individual data providers require.'}]},
 {heading:'AI features',blocks:[
  {p:'Where the terminal uses AI, it is used to explain, summarise, extract or tutor. It does not decide anything for you and it does not act on your behalf.'},
  {note:'AI output can be wrong. Check anything that matters against a primary source before acting on it.'},
  {p:'How this will work: the Terms will disclose that a third-party AI provider processes the text you submit to those features, state what is and is not sent, and confirm that AI output is not advice.'}]},
 {heading:'Availability and changes',blocks:[
  {p:'This is pre-release software. Features may change, break, be added or be withdrawn, and data entered during pre-release may be reset.'},
  {p:'How this will work: the Terms will state that the service is provided without an uptime commitment during pre-release, and will describe the notice given before a change that would lose data.'}]},
 {heading:'Fees',blocks:[
  {p:'Nothing is sold here. The terminal is in pre-release, there are no plans, tiers or payments anywhere in it, and no payment details are collected. If any part of it is charged for after launch, nothing is charged without a price being shown and accepted first.'},
  {p:'How this would work: the Terms would set out any subscription, its price, its renewal and its cancellation before purchase, as the app stores and consumer rules require. None of that exists today.'}]},
 {heading:'Disclaimers and limitation of liability',blocks:[
  {note:'The service is provided “as is” and “as available”, without warranties of any kind, to the fullest extent the law allows.'},
  {p:'How this will work: the Terms will exclude implied warranties, cap liability, and exclude indirect and consequential loss — including trading losses — while preserving the rights your local law does not allow to be excluded.'}]},
 {heading:'Suspension and termination',blocks:[
  {p:'You may stop using the terminal at any time. We may suspend or end access where these terms or the public boundary are breached, or where we must for legal reasons.'},
  {p:'How this will work: the Terms will describe notice, what happens to your records afterwards, and how to get an export before an account is closed.'}]},
 {heading:'Governing law',blocks:[
  {p:`The finished agreement will be governed by the law of ${COMPANY.state}, ${COMPANY.country}.`},
  {p:'How this will work: the Terms will name the governing law and the forum for disputes, and will state any informal-resolution step required before a formal one.'}]},
 {heading:'Contact',blocks:[
  {p:`Questions about these terms may be sent to ${COMPANY.contactEmail}.`}]},
]};

export const PRIVACY:LegalDoc={
 title:'Privacy Policy',
 intro:'A summary of how the public terminal will handle your information. Each subsection below states how that part of the finished policy will work. The full Privacy Policy will be published at launch.',
 sections:[
 {heading:'Status of this document',blocks:[
  {note:'This is a pre-release summary, not the operative policy. The binding Privacy Policy will be published before launch.'},
  {p:'How this will work: the finished policy will carry an effective date and a version, and material changes will be notified inside the terminal before they take effect.'}]},
 {heading:'Who is responsible',blocks:[
  {p:`${COMPANY.entity}, a company in ${COMPANY.state}, ${COMPANY.country}, operates the public terminal and is responsible for the information it holds.`},
  {p:'How this will work: the policy will name the controlling entity, its address, and how to reach a person about a privacy question.'}]},
 {heading:'What is collected',blocks:[
  {ul:['Account details: your email address, display name and password (stored only as a hash).','Security records: sessions, sign-in attempts and remembered devices.','What you enter: trades, notes, budgets, holdings, goals, study material, support messages.','Basic technical records needed to run and secure the service.']},
  {p:'How this will work: the policy will list each category, why it is held, and the legal basis for holding it.'}]},
 {heading:'What is not collected',blocks:[
  {note:'The public terminal never asks you to connect a broker. It does not request sign-in details for one, an API key of any kind, order authority, bank details or payment card numbers, and it holds none of them.'},
  {p:'It also holds nothing from the private portal: no private-portal accounts, records, organisation data or administrator data reach this service.'},
  {p:'How this will work: the policy will state these exclusions plainly, because what is never collected is the strongest privacy guarantee available.'}]},
 {heading:'How information is used',blocks:[
  {ul:['To run the terminal and show your own records back to you.','To keep your account secure and to investigate abuse.','To answer your support messages.','To tell you about changes to the service.']},
  {note:'Your records are not sold, not rented, and not used to advertise to you or to advise anyone else.'},
  {p:'How this will work: the policy will bind each use to a stated purpose and will state that a new purpose requires fresh notice.'}]},
 {heading:'Who information is shared with',blocks:[
  {p:'Only the service providers needed to run the terminal — hosting, email delivery, and the AI provider for AI features — each acting on our instructions, and only where the law requires disclosure.'},
  {p:'How this will work: the policy will list the categories of processor, what each receives, and the safeguards in place.'}]},
 {heading:'AI features and your text',blocks:[
  {p:'Where you use an AI feature, the text or image you submit is sent to a third-party AI provider to produce the answer.'},
  {note:'Do not put anything you would not want processed by a third party into an AI feature — including account numbers, credentials or another person’s personal details.'},
  {p:'How this will work: the policy will name the provider, state what is sent and what is not, and state the retention that provider applies.'}]},
 {heading:'Cookies and sessions',blocks:[
  {p:'A single session cookie keeps you signed in, and an optional remembered-device cookie lets you skip the second factor on a device you choose. There is no advertising or cross-site tracking cookie in the public terminal.'},
  {p:'How this will work: the policy will list each cookie, what it does, how long it lasts, and how to clear it.'}]},
 {heading:'The public and private boundary',blocks:[
  {p:'The public terminal is a separate deployment with its own database, its own cookies and its own secrets. Nothing you enter here reaches the private portal, and nothing from the private portal reaches here.'},
  {p:'How this will work: the policy will describe the separation as a technical control rather than a promise, because that is what it is.'}]},
 {heading:'Retention',blocks:[
  {p:'Records are kept while your account is open, and for as long afterwards as the law requires. Security and audit records are kept longer than ordinary records, deliberately, because they exist to answer questions about access after the fact.'},
  {p:'How this will work: the policy will state a retention period for each category and what survives account deletion.'}]},
 {heading:'Your choices',blocks:[
  {ul:['See and correct what is held about you.','Export the records you have entered.','Delete your account from inside the terminal.','Ask a question or complain to a supervisory authority where you have that right.']},
  {p:'How this will work: the policy will state how to make each request, how long a response takes, and what proof of identity is needed.'}]},
 {heading:'Children',blocks:[
  {p:'The terminal is not intended for children, and accounts are not knowingly created for them.'},
  {p:'How this will work: the policy will state the minimum age and how a child’s record is removed if one is found.'}]},
 {heading:'Security',blocks:[
  {p:'Passwords are stored only as hashes, sessions are separate from the private portal’s, and sign-in is protected by a second factor sent to your email address.'},
  {note:'No system is perfectly secure. Use a password you use nowhere else, and tell us immediately if you think your account has been reached by somebody else.'},
  {p:'How this will work: the policy will describe the safeguards in place and the notification you would receive if a breach affected you.'}]},
 {heading:'Contact',blocks:[
  {p:`Privacy questions, and requests to see or delete what is held about you, may be sent to ${COMPANY.privacyEmail}.`}]},
]};

export const RULES={
 title:'Rules & Conduct',
 intro:'These rules keep the public terminal safe, personal and informational. They apply to everybody, including during pre-release, and they exist as much to keep the terminal on the right side of financial rules as to keep it pleasant to use.',
 groups:[
 {heading:'What this terminal is',intro:'Read this first — it is the rule the rest hang off.',items:[
  'The terminal is informational and educational software for keeping your own records. It is not a broker, an exchange, an adviser or a signal service.',
  'Nothing in it is financial, investment, legal, tax or trading advice, and nothing in it is a recommendation to buy or sell anything.',
  'No figure here is an execution price or a settlement price. Your broker’s and custodian’s records are the authority on your account.',
 ]},
 {heading:'No advice, no solicitation',intro:'The line the whole product is built to stay on the right side of.',items:[
  'Do not use the terminal to give personalised investment advice to another person.',
  'Do not use it to solicit money, to manage money for anybody else, or to advertise a fund, pool or managed account.',
  'Do not present anything from the terminal — a result, a note, a chart, a study score — as a track record, a performance claim, or an offer.',
  'Do not ask other users for advice on what to trade, and do not answer if you are asked.',
 ]},
 {heading:'Your account',items:[
  'Use only your own account, and do not share it or your credentials.',
  'Give accurate details when you register, and keep your email address current — it is how the second factor and any security notice reach you.',
  'Do not attempt to reach another user’s records, any private service, or any part of the system you were not given.',
  'Tell us straight away if you think somebody else has reached your account.',
 ]},
 {heading:'Your records and content',items:[
  'Enter only records you are entitled to store. Do not put another person’s personal or financial details into your account.',
  'Do not upload unlawful, infringing, harassing or harmful material.',
  'Study material you build must be your own or material you are permitted to use. Do not paste in copyrighted question banks, books or courses.',
  'Your records are yours. We do not sell them and we do not use them to advise anybody.',
 ]},
 {heading:'Market data and third-party content',items:[
  'Market data, headlines and calendar entries come from third parties and may be delayed, incomplete or revised.',
  'Do not scrape, republish or resell data obtained through the terminal.',
  'A figure marked as sample, unavailable or unpriced is exactly that. Do not read it as a measurement.',
 ]},
 {heading:'AI features',items:[
  'AI in the terminal explains, summarises, extracts and tutors. It does not decide anything and it does not act for you.',
  'AI output can be wrong. Check anything that matters against a primary source.',
  'Do not ask an AI feature whether to enter or exit a position — it will decline, and the request is recorded.',
  'Do not submit credentials, account numbers or another person’s personal details to an AI feature.',
 ]},
 {heading:'Support and conduct',items:[
  'Be civil in support messages, suggestions and bug reports.',
  'Report a bug rather than exploiting it. Reporting one is always free and always welcome.',
  'Do not test the security of the service without asking first.',
 ]},
 ],
 closing:'Breaking these rules, or working around the public boundary, may cost you access. Where a rule protects somebody other than you — the advice rules above especially — expect that to happen quickly and without much warning.',
};
