export const LEGAL_VERSION='2026-08-26.1';export const LEGAL_EFFECTIVE_DATE='August 26, 2026';
export const COMPANY={entity:'Vitalis Trading Systems LLC',short:'Vitalis Trading Systems',product:'VTS Public Terminal',state:'Ohio',country:'United States',contactEmail:'support@vitalistradingsystems.com'} as const;
export type Block={p:string}|{ul:string[]}|{note:string};export interface LegalSection{heading:string;blocks:Block[]}export interface LegalDoc{title:string;intro:string;sections:LegalSection[]}
export const TERMS:LegalDoc={title:'Terms of Service',intro:'These terms govern use of the public terminal.',sections:[
 {heading:'Public capability boundary',blocks:[{p:'The public terminal provides informational market views and isolated, user-entered tracking and study tools. It does not connect to a broker, place or manage orders, move money, or expose private organization features.'}]},
 {heading:'No advice',blocks:[{note:'The service is informational and educational only and is not financial, investment, legal, tax, or trading advice.'},{p:'You remain responsible for your records, decisions, account security, and compliance with applicable law.'}]},
 {heading:'Acceptable use',blocks:[{ul:['Use only your own public account and records.','Do not attempt to reach private services or another user’s records.','Do not upload unlawful or harmful material.']}]},
 {heading:'Availability',blocks:[{p:'Features may change or be unavailable. AI-dependent actions remain unavailable until a separate public-provider migration is completed.'}]}]};
export const PRIVACY:LegalDoc={title:'Privacy Policy',intro:'This policy describes the public terminal’s isolated data handling.',sections:[
 {heading:'Public records',blocks:[{p:'The public service stores public-account identity, session, security, preference, support, study, finance, investment, and manual trade-tracking records in the separate public data boundary.'}]},
 {heading:'What is not collected here',blocks:[{p:'The public terminal does not request private-portal credentials, broker keys, order credentials, private organization records, or administrator data.'}]},
 {heading:'Security and retention',blocks:[{p:'Sessions and remembered-device tokens are separated from private cookies. Records are scoped to the authenticated public account and retained only as needed to provide the public service and meet legal obligations.'}]},
 {heading:'Contact',blocks:[{p:`Privacy questions may be sent to ${COMPANY.contactEmail}.`}]}]};
export const RULES={title:'Rules & Conduct',intro:'Keep the public terminal safe, personal, and informational.',groups:[
 {heading:'Account boundaries',items:['Use only your own account.','Do not attempt to access another user or any private service.']},
 {heading:'Records and content',items:['Enter only records you are authorized to store.','Do not treat the terminal as execution or personalized advice.']},
 {heading:'Support',items:['Bug reports and suggestions are stored as local public-service records in this release.']}
],closing:'Access may be limited when these rules or the public boundary are violated.'};
