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
export type NewBudgetEntry = { categoryId:string; amountCents:number; note:string|null; occurredOn:string };

export interface PublicStore {
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
