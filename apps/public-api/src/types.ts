import type { NoteDirection, NoteKind, NoteRow } from './notes.js';
import type { DeckQuestion, Flashcard, GuideSlide } from './studies.js';
import type { FundedAccountRow, FundedTradeRow, TradeRow } from './trades.js';

export type PublicAccount = { id:string; email:string; passwordHash:string; displayName:string; forcePasswordChange:boolean; temporaryPasswordExpiresAt?:number; privateGroupWarning:boolean; disabled:boolean };
export type Challenge = { accountId:string; codeHash:string; expiresAt:number; attempts:number; consumedAt?:number };
export type Session = { accountId:string; expiresAt:number; forcePasswordChange:boolean; revokedAt?:number };
export type TrustedDevice = { accountId:string; expiresAt:number; revokedAt?:number };
export type RateLimitResult = { allowed:boolean; retryAfterSeconds:number };

// ---- budget -----------------------------------------------------------------
//
// The same shapes the private portal's Budget screen already reads, because the
// public terminal renders that same component. Money is CENTS as integers
// throughout; an amount is always POSITIVE and `kind` carries the sign.
export type BudgetKind = 'income'|'expense';
export type BudgetCategory = { id:string; name:string; kind:BudgetKind; monthlyLimit:number|null; icon:string|null; sortOrder:number; archived:boolean };
export type BudgetEntry = { id:string; categoryId:string; amountCents:number; note:string|null; occurredOn:string; source:string };
export type NewBudgetCategory = { name:string; kind:BudgetKind; monthlyLimit:number|null; icon:string|null };
export type NewBudgetEntry = { categoryId:string; amountCents:number; note:string|null; occurredOn:string };
// ---- to do ------------------------------------------------------------------
//
// The shapes the portal's To Do component already reads. `code` is unused by
// that component and kept so the payload matches; markers and timers are
// computed on read from `done`, `dueAt` and the section type.
export type TodoMarker='check'|'dash'|'dot';
export type TodoSectionType='one'|'note'|'daily'|'routine';
export type TodoItemRow={id:string;sectionId:string;text:string;position:number;hyphen:boolean;done:boolean;dueAt:number|null;intervalDays:number|null};
export type TodoSectionRow={id:string;n:number;icon:string;title:string;type:TodoSectionType;intervalDays:number|null};
// ---- investments ------------------------------------------------------------
//
// The stored shapes. Valuation lives in investmentsMath.ts, which is a verified
// mirror of the private one — nothing here recomputes a total.
export type InvestmentAccount = { id:string; label:string; kind:string; institution:string|null; source:string; cashBalance:number; note:string|null; active:boolean; sortOrder:number };
export type InvestmentHolding = { id:string; investmentAccountId:string; symbol:string|null; name:string; assetClass:string; quantity:number; costBasis:number|null; manualPrice:number|null; manualPriceAt:number|null; sector:string|null; region:string|null; note:string|null };
export type InvestmentTransaction = { id:string; investmentAccountId:string; holdingId:string|null; kind:string; amount:number; quantity:number|null; occurredAt:number; taxYear:number|null; note:string|null; source:string };
export type InvestmentGoal = { id:string; label:string; targetAmount:number|null; targetYear:number|null; note:string|null };
export type InvestmentSnapshot = { onDate:string; value:number; contributions:number };
// ---- net worth --------------------------------------------------------------
//
// `value` is ALWAYS positive and `kind` carries the sign. There is deliberately
// no 'brokerage' or 'investments' category: the portfolio is tracked live, and
// offering one would invite somebody to type it in a second time.
export const NET_WORTH_CATEGORIES=['cash','real_estate','vehicle','crypto','business','valuables','retirement_other','other_asset','mortgage','auto_loan','student_loan','credit_card','personal_loan','other_debt'] as const;
export type NetWorthCategory=(typeof NET_WORTH_CATEGORIES)[number];
export type NetWorthKind='asset'|'liability';
export type NetWorthItem={id:string;kind:NetWorthKind;category:NetWorthCategory;label:string;value:number;note:string|null;active:boolean;sortOrder:number;updatedAt:number};
export type NetWorthSnapshot={onDate:string;assets:number;liabilities:number;netWorth:number};
// ---- trading notes ----------------------------------------------------------
//
// A prediction carries a window, a deadline and an outcome it still owes; an
// observation leaves all of those null and is never settled. The rules and the
// Eastern week arithmetic live in notes.ts.
//
// THERE IS NO `visibility` COLUMN AND NO PUBLISH ROUTE. The public terminal has
// no groups, so a note is the author's own and there is nothing here that could
// make it anybody else's — absent from the schema rather than hidden behind a
// guard somebody has to remember.
export type NewTradingNote={kind:NoteKind;title:string;body:string|null;instrument:string|null;direction:NoteDirection|null;targetPrice:number|null;confidence:number|null;weekKey:string;windowOpensAt:number|null;deadlineAt:number|null;lockedAt:number|null};
export type TradingNotePatch=Partial<Pick<NoteRow,'title'|'body'|'instrument'|'direction'|'targetPrice'|'confidence'|'windowOpensAt'|'deadlineAt'|'outcome'|'settledAt'|'settledBy'|'settleNote'|'reflection'|'reflectedAt'>>;

// ---- study games ------------------------------------------------------------
//
// A deck belongs to ONE account. There is no scope column, no team dimension and
// no leaderboard — see studies.ts for why the board is absent rather than
// disabled.
export type StudyDeckRow={id:string;name:string;description:string|null;source:string;categories:string[];categoryWeights:Record<string,number>|null;questionCount:number;createdAt:number};
export type StudyDeckDetail=StudyDeckRow&{questions:DeckQuestion[]};
export type NewStudyDeck={name:string;description:string|null;source:string;categories:string[];categoryWeights:Record<string,number>|null;questions:DeckQuestion[]};
export type StudyDeckPatch={name?:string;description?:string|null;categories?:string[];categoryWeights?:Record<string,number>|null;questions?:DeckQuestion[]};

// ---- flashcards and presentations -------------------------------------------
//
// Both belong to ONE account. A presentation's slides are stored whole, and each
// slide's `id` is its identity across an edit or a reorder — see studies.ts.
export type FlashcardSetRow={id:string;name:string;description:string|null;source:string;topics:string[];cardCount:number;createdAt:number};
export type FlashcardSetDetail=FlashcardSetRow&{cards:Flashcard[]};
export type NewFlashcardSet={name:string;description:string|null;source:string;cards:Flashcard[]};
export type FlashcardSetPatch={name?:string;description?:string|null;cards?:Flashcard[]};
export type StudyGuideRow={id:string;name:string;description:string|null;slideCount:number;createdAt:number;updatedAt:number};
export type StudyGuideDetail=StudyGuideRow&{slides:GuideSlide[]};
export type NewStudyGuide={name:string;description:string|null;slides:GuideSlide[]};
export type StudyGuidePatch={name?:string;description?:string|null;slides?:GuideSlide[]};

// ---- support ----------------------------------------------------------------
//
// Reporting a bug is free on every account and never sits behind the paid or AI
// paths — a user who cannot reach help is a user who cannot tell you their
// payment failed.
export type BugRole='user'|'ai'|'admin';
export type BugMessage={id:string;role:BugRole;body:string;createdAt:number};
export type BugReport={id:string;author:string;summary:string;status:string;createdAt:number;updatedAt:number;messages:BugMessage[]};
export type Suggestion={id:string;author:string;body:string;status:string;createdAt:number};

// ---- the hand-kept trade log ------------------------------------------------
//
// No broker behind any of it. Deleting is SOFT, because a hand-typed trade
// exists nowhere else and no broker can re-import it.
export type NewTrade=Omit<TradeRow,'id'>;
export type NewFundedAccount=Omit<FundedAccountRow,'id'|'createdAt'|'updatedAt'|'trades'>;
export type NewFundedTrade=Omit<FundedTradeRow,'id'>;

export interface PublicStore {
  createAccount(v:{email:string;displayName:string;passwordHash:string}):Promise<string>;
  findAccountByEmail(email:string):Promise<PublicAccount|undefined>;
  findAccountById(id:string):Promise<PublicAccount|undefined>;
  updatePassword(accountId:string,passwordHash:string,forcePasswordChange:boolean,temporaryPasswordExpiresAt?:number):Promise<void>;
  createChallenge(hash:string,value:Challenge):Promise<void>;
  getChallenge(hash:string):Promise<Challenge|undefined>;
  updateChallenge(hash:string,value:Challenge):Promise<void>;
  createSession(hash:string,value:Session):Promise<void>;
  getSession(hash:string):Promise<Session|undefined>;
  revokeSession(hash:string):Promise<void>;
  revokeAllSessions(accountId:string):Promise<void>;
  createTrustedDevice(hash:string,value:TrustedDevice):Promise<void>;
  getTrustedDevice(hash:string):Promise<TrustedDevice|undefined>;
  revokeTrustedDevice(hash:string):Promise<void>;
  revokeAllTrustedDevices(accountId:string):Promise<void>;
  consumeRateLimit(bucket:string,keyHash:string,limit:number,windowMs:number):Promise<RateLimitResult>;
  getLayout(accountId:string):Promise<unknown|undefined>;
  saveLayout(accountId:string,layout:unknown):Promise<void>;
  recordEarlyAccessRequest(email:string,note:string|null):Promise<void>;
  // Budget. Every one of these takes the account id and filters on it — there is
  // no "whose" parameter anywhere, and no version of this feature where somebody
  // else's budget is worth reading.
  listBudgetCategories(accountId:string):Promise<BudgetCategory[]>;
  addBudgetCategory(accountId:string,value:NewBudgetCategory):Promise<BudgetCategory>;
  archiveBudgetCategory(accountId:string,id:string,archived:boolean):Promise<boolean>;
  deleteBudgetCategory(accountId:string,id:string):Promise<boolean>;
  listBudgetEntries(accountId:string,month:string):Promise<BudgetEntry[]>;
  addBudgetEntry(accountId:string,value:NewBudgetEntry):Promise<BudgetEntry|undefined>;
  deleteBudgetEntry(accountId:string,id:string):Promise<boolean>;
  // To do. `ensureTodoSections` is idempotent by constraint rather than by a
  // guard the caller has to remember.
  ensureTodoSections(accountId:string):Promise<void>;
  listTodoSections(accountId:string):Promise<TodoSectionRow[]>;
  listTodoItems(accountId:string):Promise<TodoItemRow[]>;
  addTodoItem(accountId:string,sectionId:string,text:string):Promise<TodoItemRow|undefined>;
  getTodoItem(accountId:string,id:string):Promise<TodoItemRow|undefined>;
  setTodoItemState(accountId:string,id:string,done:boolean,dueAt:number|null):Promise<boolean>;
  deleteTodoItem(accountId:string,id:string):Promise<boolean>;
  restoreTodoItem(accountId:string,item:TodoItemRow):Promise<boolean>;
  // Investments. Reads are whole-portfolio because every screen in the
  // workspace is a different view of the same set of holdings.
  listInvestmentAccounts(accountId:string):Promise<InvestmentAccount[]>;
  listInvestmentHoldings(accountId:string):Promise<InvestmentHolding[]>;
  listInvestmentTransactions(accountId:string):Promise<InvestmentTransaction[]>;
  listInvestmentGoals(accountId:string):Promise<InvestmentGoal[]>;
  listInvestmentSnapshots(accountId:string):Promise<InvestmentSnapshot[]>;
  createInvestmentAccount(accountId:string,value:Omit<InvestmentAccount,'id'|'source'>):Promise<InvestmentAccount>;
  updateInvestmentAccount(accountId:string,id:string,patch:Partial<Omit<InvestmentAccount,'id'|'source'>>):Promise<boolean>;
  deleteInvestmentAccount(accountId:string,id:string):Promise<boolean>;
  createInvestmentHolding(accountId:string,value:Omit<InvestmentHolding,'id'>):Promise<InvestmentHolding|undefined>;
  updateInvestmentHolding(accountId:string,id:string,patch:Partial<Omit<InvestmentHolding,'id'|'investmentAccountId'>>):Promise<boolean>;
  deleteInvestmentHolding(accountId:string,id:string):Promise<boolean>;
  createInvestmentTransaction(accountId:string,value:Omit<InvestmentTransaction,'id'|'source'>):Promise<InvestmentTransaction|undefined>;
  deleteInvestmentTransaction(accountId:string,id:string):Promise<boolean>;
  createInvestmentGoal(accountId:string,value:Omit<InvestmentGoal,'id'>):Promise<InvestmentGoal>;
  deleteInvestmentGoal(accountId:string,id:string):Promise<boolean>;
  // Written forward, one per Eastern day, never back-filled.
  recordInvestmentSnapshot(accountId:string,onDate:string,value:number,contributions:number):Promise<void>;
  // Net worth. The hand-entered half only — the tracked half is read live from
  // the portfolio and is deliberately not stored here.
  listNetWorthItems(accountId:string):Promise<NetWorthItem[]>;
  createNetWorthItem(accountId:string,value:Omit<NetWorthItem,'id'|'updatedAt'>):Promise<NetWorthItem>;
  updateNetWorthItem(accountId:string,id:string,patch:Partial<Omit<NetWorthItem,'id'|'updatedAt'>>):Promise<boolean>;
  deleteNetWorthItem(accountId:string,id:string):Promise<boolean>;
  listNetWorthSnapshots(accountId:string):Promise<NetWorthSnapshot[]>;
  recordNetWorthSnapshot(accountId:string,onDate:string,assets:number,liabilities:number,netWorth:number):Promise<void>;
  // Trading notes. Every read filters on the account and no method takes a
  // "whose" parameter — there is no version of this feature where somebody
  // else's calls are readable.
  listTradingNotes(accountId:string,weekKey?:string):Promise<NoteRow[]>;
  countTradingNotesInWeek(accountId:string,weekKey:string):Promise<number>;
  getTradingNote(accountId:string,id:string):Promise<NoteRow|undefined>;
  createTradingNote(accountId:string,value:NewTradingNote):Promise<NoteRow>;
  updateTradingNote(accountId:string,id:string,patch:TradingNotePatch):Promise<boolean>;
  deleteTradingNote(accountId:string,id:string):Promise<boolean>;
  // Study games. Every method filters on the account; a deck id the caller does
  // not own resolves to nothing rather than to a refusal that names it.
  listStudyDecks(accountId:string):Promise<StudyDeckRow[]>;
  getStudyDeck(accountId:string,id:string):Promise<StudyDeckDetail|undefined>;
  createStudyDeck(accountId:string,value:NewStudyDeck):Promise<StudyDeckDetail>;
  updateStudyDeck(accountId:string,id:string,patch:StudyDeckPatch):Promise<StudyDeckDetail|undefined>;
  deleteStudyDeck(accountId:string,id:string):Promise<boolean>;
  getStudyDeckGame(accountId:string,deckId:string):Promise<string|null>;
  saveStudyDeckGame(accountId:string,deckId:string,state:string):Promise<void>;
  recordStudyDeckRun(accountId:string,deckId:string,attempted:number,correct:number,bestStep:number):Promise<void>;
  // Flashcards and presentations. Same rule as everything else here: every
  // method filters on the account and none takes a "whose" parameter.
  listFlashcardSets(accountId:string):Promise<FlashcardSetRow[]>;
  getFlashcardSet(accountId:string,id:string):Promise<FlashcardSetDetail|undefined>;
  createFlashcardSet(accountId:string,value:NewFlashcardSet):Promise<FlashcardSetDetail>;
  updateFlashcardSet(accountId:string,id:string,patch:FlashcardSetPatch):Promise<FlashcardSetDetail|undefined>;
  deleteFlashcardSet(accountId:string,id:string):Promise<boolean>;
  listStudyGuides(accountId:string):Promise<StudyGuideRow[]>;
  getStudyGuide(accountId:string,id:string):Promise<StudyGuideDetail|undefined>;
  createStudyGuide(accountId:string,value:NewStudyGuide):Promise<StudyGuideDetail>;
  updateStudyGuide(accountId:string,id:string,patch:StudyGuidePatch):Promise<StudyGuideDetail|undefined>;
  deleteStudyGuide(accountId:string,id:string):Promise<boolean>;
  // Support. Reads are the caller's own reports; there is no admin surface on
  // the public side, so nothing here answers for anybody else.
  listBugReports(accountId:string):Promise<BugReport[]>;
  getBugReport(accountId:string,id:string):Promise<BugReport|undefined>;
  createBugReport(accountId:string,summary:string,body:string):Promise<BugReport>;
  appendBugMessage(accountId:string,id:string,role:BugRole,body:string):Promise<BugReport|undefined>;
  createSuggestion(accountId:string,body:string):Promise<Suggestion>;
  // Trades. `deleted` selects which half of the book is being read.
  listTrades(accountId:string,deleted:boolean):Promise<TradeRow[]>;
  getTrade(accountId:string,id:string):Promise<TradeRow|undefined>;
  countTrades(accountId:string):Promise<number>;
  createTrade(accountId:string,value:NewTrade):Promise<TradeRow>;
  updateTrade(accountId:string,id:string,value:NewTrade):Promise<TradeRow|undefined>;
  softDeleteTrade(accountId:string,id:string):Promise<boolean>;
  restoreTrade(accountId:string,id:string):Promise<boolean>;
  // The funded book. Read whole — an account without its trades cannot report
  // its own balance, since the figures are derived from them.
  listFundedAccounts(accountId:string):Promise<FundedAccountRow[]>;
  createFundedAccount(accountId:string,value:NewFundedAccount):Promise<FundedAccountRow>;
  updateFundedAccount(accountId:string,id:string,value:NewFundedAccount):Promise<boolean>;
  deleteFundedAccount(accountId:string,id:string):Promise<boolean>;
  addFundedTrade(accountId:string,bookId:string,value:NewFundedTrade):Promise<boolean>;
  deleteFundedTrade(accountId:string,id:string):Promise<boolean>;
  audit(event:string,accountId:string|undefined,metadata:Record<string,unknown>):Promise<void>;
}

export interface PublicMailer {
  sendVerification(to:string,code:string):Promise<void>;
  sendTemporaryPassword(to:string,password:string):Promise<void>;
}

export interface PublicMarketProvider {
  marketData():Promise<unknown>;
  marketNews():Promise<unknown>;
}
