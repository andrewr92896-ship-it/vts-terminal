import type { NewFundedAccount, NewFundedTrade, NewTrade, BugReport, BugRole, Suggestion, FlashcardSetDetail, FlashcardSetPatch, FlashcardSetRow, NewFlashcardSet, NewStudyGuide, StudyGuideDetail, StudyGuidePatch, StudyGuideRow, NewStudyDeck, StudyDeckDetail, StudyDeckPatch, StudyDeckRow, NewTradingNote, TradingNotePatch, NetWorthItem, NetWorthSnapshot, InvestmentAccount, InvestmentGoal, InvestmentHolding, InvestmentSnapshot, InvestmentTransaction, BudgetCategory, BudgetEntry, Challenge, NewBudgetCategory, NewBudgetEntry, PublicAccount, PublicStore, LegalAcceptance, RateLimitResult, RetentionSweep, Session, TodoItemRow, TodoSectionRow, TrustedDevice } from './types.js';
import { RETENTION } from './retention.js';
import { STARTER_SECTIONS } from './todo.js';
import type { NoteRow } from './notes.js';
import type { FundedAccountRow, TradeRow } from './trades.js';


export class MemoryPublicStore implements PublicStore {
  accounts=new Map<string,PublicAccount>(); challenges=new Map<string,Challenge>(); sessions=new Map<string,Session>(); trusted=new Map<string,TrustedDevice>();
  rates=new Map<string,{count:number;reset:number;started:number}>(); layouts=new Map<string,unknown>(); audits:Array<{event:string;accountId?:string;metadata:Record<string,unknown>}>=[];
  constructor(private now=()=>Date.now()){}
  addAccount(account:PublicAccount){this.accounts.set(account.id,account)}
  async createAccount(v:{email:string;displayName:string;passwordHash:string}){const id=crypto.randomUUID();this.accounts.set(id,{id,email:v.email,passwordHash:v.passwordHash,displayName:v.displayName,forcePasswordChange:false,privateGroupWarning:false,disabled:false});return id}
  async findAccountByEmail(email:string){return [...this.accounts.values()].find((a)=>a.email===email)}
  async findAccountById(id:string){return this.accounts.get(id)}
  async updatePassword(id:string,passwordHash:string,force:boolean,temporaryPasswordExpiresAt?:number){const a=this.accounts.get(id);if(a)this.accounts.set(id,{...a,passwordHash,forcePasswordChange:force,temporaryPasswordExpiresAt})}
  async createChallenge(h:string,v:Challenge){this.challenges.set(h,{...v})} async getChallenge(h:string){const v=this.challenges.get(h);return v&&{...v}} async updateChallenge(h:string,v:Challenge){this.challenges.set(h,{...v})}
  async createSession(h:string,v:Session){this.sessions.set(h,{...v})} async getSession(h:string){const v=this.sessions.get(h);return v&&{...v}} async revokeSession(h:string){const v=this.sessions.get(h);if(v)this.sessions.set(h,{...v,revokedAt:this.now()})} async revokeAllSessions(id:string){for(const [h,v] of this.sessions)if(v.accountId===id)this.sessions.set(h,{...v,revokedAt:this.now()})}
  async createTrustedDevice(h:string,v:TrustedDevice){this.trusted.set(h,{...v})} async getTrustedDevice(h:string){const v=this.trusted.get(h);return v&&{...v}} async revokeTrustedDevice(h:string){const v=this.trusted.get(h);if(v)this.trusted.set(h,{...v,revokedAt:this.now()})} async revokeAllTrustedDevices(id:string){for(const [h,v] of this.trusted)if(v.accountId===id)this.trusted.set(h,{...v,revokedAt:this.now()})}
  async consumeRateLimit(bucket:string,key:string,limit:number,windowMs:number):Promise<RateLimitResult>{const id=`${bucket}:${key}`,now=this.now();let v=this.rates.get(id);if(!v||v.reset<=now)v={count:0,reset:now+windowMs,started:now};v.count++;this.rates.set(id,v);return {allowed:v.count<=limit,retryAfterSeconds:Math.ceil((v.reset-now)/1000)}}
  async getLayout(id:string){return this.layouts.get(id)} async saveLayout(id:string,v:unknown){this.layouts.set(id,v)}
  prefs=new Map<string,Record<string,unknown>>();
  async getPreferences(id:string){return {...(this.prefs.get(id)??{})}} async savePreferences(id:string,v:Record<string,unknown>){this.prefs.set(id,{...v})}
  deletions=new Map<string,{accountId:string;expiresAt:number;consumedAt?:number}>();
  async createDeletionRequest(h:string,v:{accountId:string;expiresAt:number;consumedAt?:number}){this.deletions.set(h,{...v})}
  async getDeletionRequest(h:string){const v=this.deletions.get(h);return v?{...v}:undefined}
  // CLAIMED, not read-then-written. Two clicks of the same emailed link race
  // here exactly as they would in Postgres, and only one may win.
  async consumeDeletionRequest(h:string,at:number){const v=this.deletions.get(h);if(!v||v.consumedAt)return false;v.consumedAt=at;return true}
  async deleteAccount(accountId:string,email:string){
    this.earlyAccess.delete(email.toLowerCase());
    this.accounts.delete(accountId);
    for(const [k,v] of this.deletions) if(v.accountId===accountId) this.deletions.delete(k);
    for(const [k,v] of this.sessions) if(v.accountId===accountId) this.sessions.delete(k);
    for(const [k,v] of this.trusted) if(v.accountId===accountId) this.trusted.delete(k);
    for(const [k,v] of this.challenges) if(v.accountId===accountId) this.challenges.delete(k);
    this.legalAcceptances=this.legalAcceptances.filter((r)=>r.accountId!==accountId);
    this.layouts.delete(accountId); this.prefs.delete(accountId);
  }
  // `createdAt` is restamped by a repeat submission, exactly as the Postgres
  // upsert restamps `created_at`: asking again is asking again, not running out.
  earlyAccess=new Map<string,{email:string;note:string|null;createdAt:number}>();
  async recordEarlyAccessRequest(email:string,note:string|null){this.earlyAccess.set(email.toLowerCase(),{email,note,createdAt:this.now()})}
  async deleteEarlyAccessRequest(email:string){this.earlyAccess.delete(email.trim().toLowerCase())}
  // Append-only, like the table. Nothing here ever rewrites a row.
  legalAcceptances:Array<LegalAcceptance&{accountId:string}>=[];
  async listLegalAcceptances(accountId:string){return this.legalAcceptances.filter((r)=>r.accountId===accountId).map(({accountId:_,...r})=>r)}
  async recordLegalAcceptances(accountId:string,entries:ReadonlyArray<{document:string;version:string;sha256:string}>){
    const acceptedAt=this.now();
    for(const entry of entries)this.legalAcceptances.push({accountId,...entry,acceptedAt});
  }
  // The same rules `retention.ts` states, applied to the maps. Expired or spent,
  // never merely old — a live session and an unexpired trusted device survive
  // however long the sweep has been running.
  async sweepExpired(now:number):Promise<RetentionSweep>{
    const swept={betaAccessRequests:0,sessions:0,challenges:0,trustedDevices:0,recoveryEvents:0,deletionRequests:0,rateLimits:0};
    for(const [k,v] of this.earlyAccess) if(now-v.createdAt>=RETENTION.betaAccessMs){this.earlyAccess.delete(k);swept.betaAccessRequests++}
    for(const [k,v] of this.sessions) if(v.expiresAt<=now||v.revokedAt!=null){this.sessions.delete(k);swept.sessions++}
    for(const [k,v] of this.challenges) if(v.expiresAt<=now||v.consumedAt!=null){this.challenges.delete(k);swept.challenges++}
    for(const [k,v] of this.trusted) if(v.expiresAt<=now||v.revokedAt!=null){this.trusted.delete(k);swept.trustedDevices++}
    for(const [k,v] of this.deletions) if(v.expiresAt<=now||v.consumedAt!=null){this.deletions.delete(k);swept.deletionRequests++}
    for(const [k,v] of this.rates) if(now-v.started>=RETENTION.rateLimitMs){this.rates.delete(k);swept.rateLimits++}
    // `public_recovery_events` has no counterpart here because NOTHING WRITES
    // ONE — the table survives from the first migration and no code path has
    // ever inserted a row. The Postgres store still sweeps it, so a future
    // writer inherits the rule; inventing a map for it here would be inventing
    // state this store does not hold.
    return swept;
  }
  // ---- budget ---------------------------------------------------------------
  //
  // Mirrors the Postgres store's RULES, not just its shape: rows are keyed by
  // account, a category name is unique per account and kind, an entry can only
  // be filed against a category the same account owns, and an amount must be
  // positive. A memory store that is merely permissive lets a test pass on
  // behaviour production would refuse.
  budgetCategories=new Map<string,BudgetCategory&{accountId:string}>();
  budgetEntries=new Map<string,BudgetEntry&{accountId:string}>();
  private nextId=1;
  private id(){return `mem-${this.nextId++}`}
  async listBudgetCategories(accountId:string){
    return [...this.budgetCategories.values()].filter((c)=>c.accountId===accountId)
      .sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name))
      .map(({accountId:_,...c})=>c);
  }
  async addBudgetCategory(accountId:string,v:NewBudgetCategory){
    const key=v.name.trim().toLowerCase();
    const clash=[...this.budgetCategories.values()].some((c)=>c.accountId===accountId&&c.kind===v.kind&&c.name.trim().toLowerCase()===key);
    if(clash)throw Object.assign(new Error('That category already exists.'),{status:409});
    const mine=[...this.budgetCategories.values()].filter((c)=>c.accountId===accountId);
    const row={id:this.id(),accountId,name:v.name,kind:v.kind,monthlyLimit:v.monthlyLimit,icon:v.icon,
      sortOrder:mine.length?Math.max(...mine.map((c)=>c.sortOrder))+1:0,archived:false};
    this.budgetCategories.set(row.id,row);
    const {accountId:_,...out}=row; return out;
  }
  async archiveBudgetCategory(accountId:string,id:string,archived:boolean){
    const c=this.budgetCategories.get(id); if(!c||c.accountId!==accountId)return false;
    this.budgetCategories.set(id,{...c,archived}); return true;
  }
  async deleteBudgetCategory(accountId:string,id:string){
    const c=this.budgetCategories.get(id); if(!c||c.accountId!==accountId)return false;
    this.budgetCategories.delete(id);
    // The database cascades; the memory store has to do it by hand or a deleted
    // category leaves entries that no longer resolve to one.
    for(const [k,e] of this.budgetEntries)if(e.categoryId===id)this.budgetEntries.delete(k);
    return true;
  }
  async listBudgetEntries(accountId:string,month:string){
    return [...this.budgetEntries.values()]
      .filter((e)=>e.accountId===accountId&&e.occurredOn.slice(0,7)===month)
      .sort((a,b)=>b.occurredOn.localeCompare(a.occurredOn))
      .map(({accountId:_,...e})=>e);
  }
  async addBudgetEntry(accountId:string,v:NewBudgetEntry){
    const c=this.budgetCategories.get(v.categoryId);
    if(!c||c.accountId!==accountId)return undefined;
    if(!Number.isInteger(v.amountCents)||v.amountCents<=0)throw Object.assign(new Error('Amount must be positive.'),{status:400});
    const row={id:this.id(),accountId,categoryId:v.categoryId,amountCents:v.amountCents,note:v.note,occurredOn:v.occurredOn,source:'manual'};
    this.budgetEntries.set(row.id,row);
    const {accountId:_,...out}=row; return out;
  }
  async deleteBudgetEntry(accountId:string,id:string){
    const e=this.budgetEntries.get(id); if(!e||e.accountId!==accountId)return false;
    this.budgetEntries.delete(id); return true;
  }
  // ---- to do ----------------------------------------------------------------
  //
  // Mirrors the Postgres store's RULES, not only its shape: seeding twice adds
  // nothing, an item cannot be filed into a section another account owns, and a
  // restore keeps the item's own id and position rather than appending a copy.
  todoSections=new Map<string,TodoSectionRow&{accountId:string}>();
  todoItems=new Map<string,TodoItemRow&{accountId:string}>();
  async ensureTodoSections(accountId:string){
    // Idempotent the way the unique index makes it idempotent in Postgres: a
    // section number this account already has is skipped, not duplicated.
    const have=new Set([...this.todoSections.values()].filter((s)=>s.accountId===accountId).map((s)=>s.n));
    for(const s of STARTER_SECTIONS){
      if(have.has(s.n))continue;
      const row={id:this.id(),accountId,n:s.n,icon:s.icon,title:s.title,type:s.type,intervalDays:s.intervalDays};
      this.todoSections.set(row.id,row);
    }
  }
  async listTodoSections(accountId:string){
    return [...this.todoSections.values()].filter((s)=>s.accountId===accountId).sort((a,b)=>a.n-b.n)
      .map(({accountId:_,...s})=>s);
  }
  async listTodoItems(accountId:string){
    return [...this.todoItems.values()].filter((i)=>i.accountId===accountId).sort((a,b)=>a.position-b.position)
      .map(({accountId:_,...i})=>i);
  }
  async addTodoItem(accountId:string,sectionId:string,text:string){
    const section=this.todoSections.get(sectionId);
    if(!section||section.accountId!==accountId)return undefined;
    const mine=[...this.todoItems.values()].filter((i)=>i.accountId===accountId&&i.sectionId===sectionId);
    const row={id:this.id(),accountId,sectionId,text,position:mine.length?Math.max(...mine.map((i)=>i.position))+1:0,
      hyphen:false,done:false,dueAt:null,intervalDays:null};
    this.todoItems.set(row.id,row);
    const {accountId:_,...out}=row; return out;
  }
  async getTodoItem(accountId:string,id:string){
    const i=this.todoItems.get(id); if(!i||i.accountId!==accountId)return undefined;
    const {accountId:_,...out}=i; return out;
  }
  async setTodoItemState(accountId:string,id:string,done:boolean,dueAt:number|null){
    const i=this.todoItems.get(id); if(!i||i.accountId!==accountId)return false;
    this.todoItems.set(id,{...i,done,dueAt}); return true;
  }
  async deleteTodoItem(accountId:string,id:string){
    const i=this.todoItems.get(id); if(!i||i.accountId!==accountId)return false;
    this.todoItems.delete(id); return true;
  }
  async restoreTodoItem(accountId:string,item:TodoItemRow){
    const section=this.todoSections.get(item.sectionId);
    if(!section||section.accountId!==accountId)return false;
    // `do nothing` on a live id: restoring twice must not overwrite whatever is
    // there now, which for an undo button pressed twice is the item itself.
    if(this.todoItems.has(item.id))return false;
    this.todoItems.set(item.id,{...item,accountId}); return true;
  }
  // ---- investments ----------------------------------------------------------
  //
  // Mirrors the Postgres store's RULES: rows are keyed by account, a child can
  // only be created under a parent the same account owns, `source` is
  // server-owned, deleting an investment account cascades, and a manual price
  // is stamped when it is set and cleared when it is removed.
  invAccounts=new Map<string,InvestmentAccount&{accountId:string}>();
  invHoldings=new Map<string,InvestmentHolding&{accountId:string}>();
  invTransactions=new Map<string,InvestmentTransaction&{accountId:string}>();
  invGoals=new Map<string,InvestmentGoal&{accountId:string}>();
  invSnapshots=new Map<string,InvestmentSnapshot&{accountId:string}>();
  private strip<T extends {accountId:string}>(v:T){const {accountId:_,...rest}=v; return rest}
  private mine<T extends {accountId:string}>(map:Map<string,T>,accountId:string){
    return [...map.values()].filter((v)=>v.accountId===accountId);
  }
  async listInvestmentAccounts(accountId:string){
    return this.mine(this.invAccounts,accountId).sort((a,b)=>a.sortOrder-b.sortOrder||a.label.localeCompare(b.label)).map((v)=>this.strip(v)) as InvestmentAccount[];
  }
  async listInvestmentHoldings(accountId:string){
    return this.mine(this.invHoldings,accountId).sort((a,b)=>a.name.localeCompare(b.name)).map((v)=>this.strip(v)) as InvestmentHolding[];
  }
  async listInvestmentTransactions(accountId:string){
    return this.mine(this.invTransactions,accountId).sort((a,b)=>b.occurredAt-a.occurredAt).map((v)=>this.strip(v)) as InvestmentTransaction[];
  }
  async listInvestmentGoals(accountId:string){
    return this.mine(this.invGoals,accountId).map((v)=>this.strip(v)) as InvestmentGoal[];
  }
  async listInvestmentSnapshots(accountId:string){
    return this.mine(this.invSnapshots,accountId).sort((a,b)=>a.onDate.localeCompare(b.onDate)).map((v)=>this.strip(v)) as InvestmentSnapshot[];
  }
  async createInvestmentAccount(accountId:string,v:Omit<InvestmentAccount,'id'|'source'>){
    const row={...v,id:this.id(),accountId,source:'manual'};
    this.invAccounts.set(row.id,row); return this.strip(row) as InvestmentAccount;
  }
  async updateInvestmentAccount(accountId:string,id:string,patch:Partial<Omit<InvestmentAccount,'id'|'source'>>){
    const row=this.invAccounts.get(id); if(!row||row.accountId!==accountId)return false;
    this.invAccounts.set(id,{...row,...patch}); return true;
  }
  async deleteInvestmentAccount(accountId:string,id:string){
    const row=this.invAccounts.get(id); if(!row||row.accountId!==accountId)return false;
    this.invAccounts.delete(id);
    // The database cascades; here it is done by hand or the portfolio keeps
    // holdings that belong to an account that no longer exists.
    for(const [k,h] of this.invHoldings)if(h.investmentAccountId===id)this.invHoldings.delete(k);
    for(const [k,t] of this.invTransactions)if(t.investmentAccountId===id)this.invTransactions.delete(k);
    return true;
  }
  async createInvestmentHolding(accountId:string,v:Omit<InvestmentHolding,'id'>){
    const parent=this.invAccounts.get(v.investmentAccountId);
    if(!parent||parent.accountId!==accountId)return undefined;
    const row={...v,id:this.id(),accountId};
    this.invHoldings.set(row.id,row); return this.strip(row) as InvestmentHolding;
  }
  async updateInvestmentHolding(accountId:string,id:string,patch:Partial<Omit<InvestmentHolding,'id'|'investmentAccountId'>>){
    const row=this.invHoldings.get(id); if(!row||row.accountId!==accountId)return false;
    const next={...row,...patch};
    if('manualPrice' in patch)next.manualPriceAt=patch.manualPrice==null?null:Date.now();
    this.invHoldings.set(id,next); return true;
  }
  async deleteInvestmentHolding(accountId:string,id:string){
    const row=this.invHoldings.get(id); if(!row||row.accountId!==accountId)return false;
    this.invHoldings.delete(id); return true;
  }
  async createInvestmentTransaction(accountId:string,v:Omit<InvestmentTransaction,'id'|'source'>){
    const parent=this.invAccounts.get(v.investmentAccountId);
    if(!parent||parent.accountId!==accountId)return undefined;
    const row={...v,id:this.id(),accountId,source:'manual'};
    this.invTransactions.set(row.id,row); return this.strip(row) as InvestmentTransaction;
  }
  async deleteInvestmentTransaction(accountId:string,id:string){
    const row=this.invTransactions.get(id); if(!row||row.accountId!==accountId)return false;
    this.invTransactions.delete(id); return true;
  }
  async createInvestmentGoal(accountId:string,v:Omit<InvestmentGoal,'id'>){
    const row={...v,id:this.id(),accountId};
    this.invGoals.set(row.id,row); return this.strip(row) as InvestmentGoal;
  }
  async deleteInvestmentGoal(accountId:string,id:string){
    const row=this.invGoals.get(id); if(!row||row.accountId!==accountId)return false;
    this.invGoals.delete(id); return true;
  }
  async recordInvestmentSnapshot(accountId:string,onDate:string,value:number,contributions:number){
    // Last reading of the day stands, keyed by (account, day).
    this.invSnapshots.set(`${accountId}:${onDate}`,{accountId,onDate,value,contributions});
  }
  // ---- net worth ------------------------------------------------------------
  netWorthItems=new Map<string,NetWorthItem&{accountId:string}>();
  netWorthSnapshots=new Map<string,NetWorthSnapshot&{accountId:string}>();
  async listNetWorthItems(accountId:string){
    return this.mine(this.netWorthItems,accountId).sort((a,b)=>a.sortOrder-b.sortOrder||a.label.localeCompare(b.label)).map((v)=>this.strip(v)) as NetWorthItem[];
  }
  async createNetWorthItem(accountId:string,v:Omit<NetWorthItem,'id'|'updatedAt'>){
    // Positive whatever arrives — `kind` carries the sign, as in Postgres.
    const row={...v,value:Math.abs(v.value),id:this.id(),accountId,updatedAt:Date.now()};
    this.netWorthItems.set(row.id,row); return this.strip(row) as NetWorthItem;
  }
  async updateNetWorthItem(accountId:string,id:string,patch:Partial<Omit<NetWorthItem,'id'|'updatedAt'>>){
    const row=this.netWorthItems.get(id); if(!row||row.accountId!==accountId)return false;
    const next={...row,...patch,updatedAt:Date.now()};
    if('value' in patch)next.value=Math.abs(Number(patch.value));
    this.netWorthItems.set(id,next); return true;
  }
  async deleteNetWorthItem(accountId:string,id:string){
    const row=this.netWorthItems.get(id); if(!row||row.accountId!==accountId)return false;
    this.netWorthItems.delete(id); return true;
  }
  async listNetWorthSnapshots(accountId:string){
    return this.mine(this.netWorthSnapshots,accountId).sort((a,b)=>a.onDate.localeCompare(b.onDate)).map((v)=>this.strip(v)) as NetWorthSnapshot[];
  }
  async recordNetWorthSnapshot(accountId:string,onDate:string,assets:number,liabilities:number,netWorth:number){
    this.netWorthSnapshots.set(`${accountId}:${onDate}`,{accountId,onDate,assets,liabilities,netWorth});
  }
  // ---- trading notes --------------------------------------------------------
  //
  // Every method filters on the account. There is no `visibility` field on the
  // row and no method that could set one — a note is the author's own.
  tradingNotes=new Map<string,NoteRow&{accountId:string}>();
  async listTradingNotes(accountId:string,weekKey?:string){
    return this.mine(this.tradingNotes,accountId)
      .filter((r)=>weekKey==null||r.weekKey===weekKey)
      .sort((a,b)=>b.createdAt-a.createdAt)
      .map((r)=>this.strip(r)) as NoteRow[];
  }
  async countTradingNotesInWeek(accountId:string,weekKey:string){
    return this.mine(this.tradingNotes,accountId).filter((r)=>r.weekKey===weekKey).length;
  }
  async getTradingNote(accountId:string,id:string){
    const row=this.tradingNotes.get(id);
    // Undefined rather than a refusal, so a caller cannot tell an id it does not
    // own from one that does not exist.
    if(!row||row.accountId!==accountId)return undefined;
    return this.strip(row) as NoteRow;
  }
  async createTradingNote(accountId:string,v:NewTradingNote){
    const now=this.now();
    const row={accountId,id:crypto.randomUUID(),...v,openPrice:null,outcome:null,settledAt:null,settledBy:null,settlePrice:null,settleNote:null,reflection:null,reflectedAt:null,createdAt:now,updatedAt:now};
    this.tradingNotes.set(row.id,row);
    return this.strip(row) as NoteRow;
  }
  async updateTradingNote(accountId:string,id:string,patch:TradingNotePatch){
    const row=this.tradingNotes.get(id); if(!row||row.accountId!==accountId)return false;
    this.tradingNotes.set(id,{...row,...patch,updatedAt:this.now()});
    return true;
  }
  async deleteTradingNote(accountId:string,id:string){
    const row=this.tradingNotes.get(id); if(!row||row.accountId!==accountId)return false;
    this.tradingNotes.delete(id); return true;
  }
  // ---- study games ----------------------------------------------------------
  studyDecks=new Map<string,StudyDeckDetail&{accountId:string}>();
  deckGames=new Map<string,string>();
  deckRuns:Array<{accountId:string;deckId:string;attempted:number;correct:number;bestStep:number}>=[];
  private deckView(row:StudyDeckDetail):StudyDeckRow{
    const {questions,...rest}=row; void questions; return rest;
  }
  async listStudyDecks(accountId:string){
    return this.mine(this.studyDecks,accountId).sort((a,b)=>b.createdAt-a.createdAt).map((d)=>this.deckView(this.strip(d) as StudyDeckDetail));
  }
  async getStudyDeck(accountId:string,id:string){
    const row=this.studyDecks.get(id);
    if(!row||row.accountId!==accountId)return undefined;
    return structuredClone(this.strip(row)) as StudyDeckDetail;
  }
  async createStudyDeck(accountId:string,v:NewStudyDeck){
    const row={accountId,id:crypto.randomUUID(),name:v.name,description:v.description,source:v.source,
      categories:v.categories,categoryWeights:v.categoryWeights,questions:v.questions,
      questionCount:v.questions.length,createdAt:this.now()};
    this.studyDecks.set(row.id,row);
    return structuredClone(this.strip(row)) as StudyDeckDetail;
  }
  async updateStudyDeck(accountId:string,id:string,patch:StudyDeckPatch){
    const row=this.studyDecks.get(id); if(!row||row.accountId!==accountId)return undefined;
    const next={...row,...patch};
    if(patch.questions)next.questionCount=patch.questions.length;
    this.studyDecks.set(id,next);
    return structuredClone(this.strip(next)) as StudyDeckDetail;
  }
  async deleteStudyDeck(accountId:string,id:string){
    const row=this.studyDecks.get(id); if(!row||row.accountId!==accountId)return false;
    this.studyDecks.delete(id);
    // The learner's own progress and banked runs go with the deck they were
    // against — there is nothing left for them to be progress THROUGH.
    this.deckGames.delete(`${accountId}:${id}`);
    this.deckRuns=this.deckRuns.filter((r)=>r.deckId!==id);
    return true;
  }
  async getStudyDeckGame(accountId:string,deckId:string){return this.deckGames.get(`${accountId}:${deckId}`)??null}
  async saveStudyDeckGame(accountId:string,deckId:string,state:string){this.deckGames.set(`${accountId}:${deckId}`,state)}
  async recordStudyDeckRun(accountId:string,deckId:string,attempted:number,correct:number,bestStep:number){
    this.deckRuns.push({accountId,deckId,attempted,correct,bestStep});
  }
  // ---- flashcards -----------------------------------------------------------
  flashcardSets=new Map<string,FlashcardSetDetail&{accountId:string}>();
  private setView(row:FlashcardSetDetail):FlashcardSetRow{
    const {cards,...rest}=row; void cards; return rest;
  }
  // The topics a set covers are DERIVED from its cards, never stored beside
  // them: stored, the two could disagree about what is in the set.
  private topicsOf(cards:Array<{topic:string|null}>):string[]{
    const seen=new Set<string>(); const out:string[]=[];
    for(const card of cards){
      if(!card.topic)continue;
      const key=card.topic.toLowerCase();
      if(seen.has(key))continue;
      seen.add(key); out.push(card.topic);
    }
    return out;
  }
  async listFlashcardSets(accountId:string){
    return this.mine(this.flashcardSets,accountId).sort((a,b)=>b.createdAt-a.createdAt).map((r)=>this.setView(this.strip(r) as FlashcardSetDetail));
  }
  async getFlashcardSet(accountId:string,id:string){
    const row=this.flashcardSets.get(id);
    if(!row||row.accountId!==accountId)return undefined;
    return structuredClone(this.strip(row)) as FlashcardSetDetail;
  }
  async createFlashcardSet(accountId:string,v:NewFlashcardSet){
    const row={accountId,id:crypto.randomUUID(),name:v.name,description:v.description,source:v.source,
      topics:this.topicsOf(v.cards),cardCount:v.cards.length,cards:v.cards,createdAt:this.now()};
    this.flashcardSets.set(row.id,row);
    return structuredClone(this.strip(row)) as FlashcardSetDetail;
  }
  async updateFlashcardSet(accountId:string,id:string,patch:FlashcardSetPatch){
    const row=this.flashcardSets.get(id); if(!row||row.accountId!==accountId)return undefined;
    const next={...row,...patch};
    if(patch.cards){next.cardCount=patch.cards.length;next.topics=this.topicsOf(patch.cards)}
    this.flashcardSets.set(id,next);
    return structuredClone(this.strip(next)) as FlashcardSetDetail;
  }
  async deleteFlashcardSet(accountId:string,id:string){
    const row=this.flashcardSets.get(id); if(!row||row.accountId!==accountId)return false;
    this.flashcardSets.delete(id); return true;
  }
  // ---- presentations --------------------------------------------------------
  studyGuides=new Map<string,StudyGuideDetail&{accountId:string}>();
  private guideView(row:StudyGuideDetail):StudyGuideRow{
    const {slides,...rest}=row; void slides; return rest;
  }
  async listStudyGuides(accountId:string){
    return this.mine(this.studyGuides,accountId).sort((a,b)=>b.createdAt-a.createdAt).map((r)=>this.guideView(this.strip(r) as StudyGuideDetail));
  }
  async getStudyGuide(accountId:string,id:string){
    const row=this.studyGuides.get(id);
    if(!row||row.accountId!==accountId)return undefined;
    return structuredClone(this.strip(row)) as StudyGuideDetail;
  }
  async createStudyGuide(accountId:string,v:NewStudyGuide){
    const now=this.now();
    const row={accountId,id:crypto.randomUUID(),name:v.name,description:v.description,
      slides:v.slides,slideCount:v.slides.length,createdAt:now,updatedAt:now};
    this.studyGuides.set(row.id,row);
    return structuredClone(this.strip(row)) as StudyGuideDetail;
  }
  async updateStudyGuide(accountId:string,id:string,patch:StudyGuidePatch){
    const row=this.studyGuides.get(id); if(!row||row.accountId!==accountId)return undefined;
    const next={...row,...patch,updatedAt:this.now()};
    if(patch.slides)next.slideCount=patch.slides.length;
    this.studyGuides.set(id,next);
    return structuredClone(this.strip(next)) as StudyGuideDetail;
  }
  async deleteStudyGuide(accountId:string,id:string){
    const row=this.studyGuides.get(id); if(!row||row.accountId!==accountId)return false;
    this.studyGuides.delete(id); return true;
  }
  // ---- support --------------------------------------------------------------
  bugReports=new Map<string,BugReport&{accountId:string}>();
  suggestions=new Map<string,Suggestion&{accountId:string}>();
  async listBugReports(accountId:string){
    return this.mine(this.bugReports,accountId).sort((a,b)=>b.updatedAt-a.updatedAt).map((r)=>structuredClone(this.strip(r))) as BugReport[];
  }
  async getBugReport(accountId:string,id:string){
    const row=this.bugReports.get(id);
    if(!row||row.accountId!==accountId)return undefined;
    return structuredClone(this.strip(row)) as BugReport;
  }
  async createBugReport(accountId:string,summary:string,body:string){
    const now=this.now();
    const row={accountId,id:crypto.randomUUID(),author:'You',summary,status:'open',createdAt:now,updatedAt:now,
      messages:[{id:crypto.randomUUID(),role:'user' as BugRole,body,createdAt:now}]};
    this.bugReports.set(row.id,row);
    return structuredClone(this.strip(row)) as BugReport;
  }
  async appendBugMessage(accountId:string,id:string,role:BugRole,body:string){
    const row=this.bugReports.get(id); if(!row||row.accountId!==accountId)return undefined;
    row.messages.push({id:crypto.randomUUID(),role,body,createdAt:this.now()});
    row.updatedAt=this.now();
    return structuredClone(this.strip(row)) as BugReport;
  }
  async createSuggestion(accountId:string,body:string){
    const row={accountId,id:crypto.randomUUID(),author:'You',body,status:'new',createdAt:this.now()};
    this.suggestions.set(row.id,row);
    return structuredClone(this.strip(row)) as Suggestion;
  }
  // ---- trades ---------------------------------------------------------------
  trades=new Map<string,TradeRow&{accountId:string}>();
  async listTrades(accountId:string,deleted:boolean){
    return this.mine(this.trades,accountId)
      .filter((t)=>(t.deletedAt!=null)===deleted)
      .sort((a,b)=>(deleted?(b.deletedAt??0)-(a.deletedAt??0):b.openedAt-a.openedAt))
      .map((t)=>structuredClone(this.strip(t))) as TradeRow[];
  }
  async getTrade(accountId:string,id:string){
    const row=this.trades.get(id);
    if(!row||row.accountId!==accountId)return undefined;
    return structuredClone(this.strip(row)) as TradeRow;
  }
  async countTrades(accountId:string){return this.mine(this.trades,accountId).length}
  async createTrade(accountId:string,value:NewTrade){
    const row={accountId,...value,id:crypto.randomUUID()};
    this.trades.set(row.id,row);
    return structuredClone(this.strip(row)) as TradeRow;
  }
  async updateTrade(accountId:string,id:string,value:NewTrade){
    const row=this.trades.get(id); if(!row||row.accountId!==accountId)return undefined;
    const next={...row,...value,id};
    this.trades.set(id,next);
    return structuredClone(this.strip(next)) as TradeRow;
  }
  async softDeleteTrade(accountId:string,id:string){
    const row=this.trades.get(id); if(!row||row.accountId!==accountId||row.deletedAt!=null)return false;
    row.deletedAt=this.now(); return true;
  }
  async restoreTrade(accountId:string,id:string){
    const row=this.trades.get(id); if(!row||row.accountId!==accountId||row.deletedAt==null)return false;
    row.deletedAt=null; return true;
  }
  // ---- the funded book ------------------------------------------------------
  fundedAccounts=new Map<string,FundedAccountRow&{accountId:string}>();
  async listFundedAccounts(accountId:string){
    return this.mine(this.fundedAccounts,accountId).sort((a,b)=>a.createdAt-b.createdAt)
      .map((a)=>structuredClone(this.strip(a))) as FundedAccountRow[];
  }
  async createFundedAccount(accountId:string,v:NewFundedAccount){
    const now=this.now();
    const row={accountId,id:crypto.randomUUID(),...v,trades:[],createdAt:now,updatedAt:now};
    this.fundedAccounts.set(row.id,row);
    return structuredClone(this.strip(row)) as FundedAccountRow;
  }
  async updateFundedAccount(accountId:string,id:string,v:NewFundedAccount){
    const row=this.fundedAccounts.get(id); if(!row||row.accountId!==accountId)return false;
    this.fundedAccounts.set(id,{...row,...v,updatedAt:this.now()});
    return true;
  }
  async deleteFundedAccount(accountId:string,id:string){
    const row=this.fundedAccounts.get(id); if(!row||row.accountId!==accountId)return false;
    this.fundedAccounts.delete(id); return true;
  }
  async addFundedTrade(accountId:string,bookId:string,v:NewFundedTrade){
    const row=this.fundedAccounts.get(bookId); if(!row||row.accountId!==accountId)return false;
    row.trades.unshift({...v,id:crypto.randomUUID()});
    row.updatedAt=this.now();
    return true;
  }
  async deleteFundedTrade(accountId:string,id:string){
    for(const row of this.mine(this.fundedAccounts,accountId)){
      const live=this.fundedAccounts.get(row.id)!;
      const index=live.trades.findIndex((t)=>t.id===id);
      if(index>=0){live.trades.splice(index,1);live.updatedAt=this.now();return true}
    }
    return false;
  }
  async audit(event:string,accountId:string|undefined,metadata:Record<string,unknown>){this.audits.push({event,accountId,metadata})}
}
