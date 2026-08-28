import type { WorkspaceKey } from '../theme/themes';
import { C } from '../theme/tokens';

export type PublicWorkspaceKey = Extract<WorkspaceKey, 'myportal'|'trading'|'finances'|'news'|'investments'|'studies'|'help'>;
export type PublicScreenKey =
  | 'live'|'data'|'desk'|'funded'|'deleted'|'notes'
  | 'td_trading'|'my_access'|'my_rules'|'my_prefs'|'my_settings'
  | 'fin_networth'|'fin_budget'
  | 'news'|'news_world'|'news_politics'
  | 'inv_overview'|'inv_accounts'|'inv_holdings'|'inv_allocation'|'inv_performance'|'inv_dividends'|'inv_contributions'|'inv_projections'
  | 'st_decks'|'st_packages'|'st_game'|'st_cards'|'st_test'|'st_guides'|'st_progress'
  | 'hp_howto'|'hp_news'|'hp_notes'|'hp_bug'|'hp_suggest'|'hp_rules'|'hp_terms'|'hp_privacy'
  | 'login'|'two-factor';

export interface PublicNavWorkspace { key:PublicWorkspaceKey;label:string;icon:string;accent:string;group:string;sections:ReadonlyArray<{key:PublicScreenKey;label:string;icon:string}>; }

// Compile-time allowlist derived from portal NAV at 0ca961d6e5a14edb9e629f11f283ee71ec454e70. Prohibited rows are
// absent rather than hidden; ordering and stable screen keys are retained.
export const PUBLIC_NAV:readonly PublicNavWorkspace[]=[
 {key:'myportal',label:'My Terminal',icon:'briefcase',accent:'#34D399',group:'My Terminal',sections:[
  {key:'data',label:'Market Data',icon:'line-chart'},{key:'td_trading',label:'To Do',icon:'list-todo'},
  {key:'my_access',label:'Premium Features',icon:'gem'},{key:'my_rules',label:'Site Rules',icon:'list-checks'},
  {key:'my_prefs',label:'Preferences',icon:'settings-2'},{key:'my_settings',label:'Settings',icon:'settings'}]},
 {key:'trading',label:'Advanced Trading',icon:'candlestick-chart',accent:C.gold,group:'Trade Tracking',sections:[
  {key:'live',label:'Live Wall',icon:'layout-dashboard'},{key:'desk',label:'Closed Trades & Metrics',icon:'candlestick-chart'},
  {key:'funded',label:'Manual Trades',icon:'pencil'},{key:'deleted',label:'Deleted Trades',icon:'trash-2'},{key:'notes',label:'Trading Notes',icon:'notebook-pen'}]},
 {key:'finances',label:'Finances',icon:'piggy-bank',accent:'#4ADE80',group:'Finances',sections:[
  {key:'fin_networth',label:'Net Worth',icon:'scale'},{key:'fin_budget',label:'Budget',icon:'receipt'}]},
 {key:'news',label:'News',icon:'newspaper',accent:'#93B4FF',group:'News',sections:[
  {key:'news',label:'Market News',icon:'line-chart'},{key:'news_world',label:'World',icon:'globe'},{key:'news_politics',label:'Politics',icon:'landmark'}]},
 {key:'investments',label:'Investments',icon:'landmark',accent:'#2DD4BF',group:'Investments',sections:[
  {key:'inv_overview',label:'Portfolio Overview',icon:'layout-dashboard'},{key:'inv_accounts',label:'Accounts',icon:'building-2'},
  {key:'inv_holdings',label:'Holdings',icon:'layers'},{key:'inv_allocation',label:'Allocation',icon:'gauge'},
  {key:'inv_performance',label:'Performance',icon:'trending-up'},{key:'inv_dividends',label:'Dividends & Income',icon:'banknote'},
  {key:'inv_contributions',label:'Contributions & Goals',icon:'piggy-bank'},{key:'inv_projections',label:'Projections',icon:'sparkles'}]},
 {key:'studies',label:'Studies',icon:'graduation-cap',accent:C.violet,group:'Studies',sections:[
  {key:'st_decks',label:'Study Creation',icon:'library'},{key:'st_packages',label:'Study Packages',icon:'package'},
  {key:'st_game',label:'Study Game',icon:'gamepad-2'},{key:'st_cards',label:'Flashcards',icon:'copy'},
  {key:'st_test',label:'Practice Tests',icon:'file-check-2'},{key:'st_guides',label:'Study Presentations',icon:'presentation'},
  {key:'st_progress',label:'Progress',icon:'trending-up'}]},
 {key:'help',label:'Site Help',icon:'life-buoy',accent:'#6C9EFF',group:'Help & support',sections:[
  {key:'hp_howto',label:'How to',icon:'book-open'},{key:'hp_news',label:'Announcements',icon:'megaphone'},
  {key:'hp_notes',label:'Patch notes',icon:'file-text'},{key:'hp_bug',label:'Report a bug',icon:'bug'},
  {key:'hp_suggest',label:'Suggestion',icon:'lightbulb'},{key:'hp_rules',label:'Rules & Conduct',icon:'list-checks'},
  {key:'hp_terms',label:'Terms of Service',icon:'scale'},{key:'hp_privacy',label:'Privacy Policy',icon:'file-lock-2'}]},
] as const;
export function publicNavFor(key:PublicWorkspaceKey){return PUBLIC_NAV.find((workspace)=>workspace.key===key)??PUBLIC_NAV[0];}
export function publicWorkspaceFor(screen:PublicScreenKey){return PUBLIC_NAV.find((workspace)=>workspace.sections.some((section)=>section.key===screen))??PUBLIC_NAV[0];}
