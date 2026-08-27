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
