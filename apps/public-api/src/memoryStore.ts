import type { InvestmentAccount, InvestmentGoal, InvestmentHolding, InvestmentSnapshot, InvestmentTransaction, BudgetCategory, BudgetEntry, Challenge, NewBudgetCategory, NewBudgetEntry, PublicAccount, PublicStore, RateLimitResult, Session, TodoItemRow, TodoSectionRow, TrustedDevice } from './types.js';
import { STARTER_SECTIONS } from './todo.js';

export class MemoryPublicStore implements PublicStore {
  accounts=new Map<string,PublicAccount>(); challenges=new Map<string,Challenge>(); sessions=new Map<string,Session>(); trusted=new Map<string,TrustedDevice>();
  rates=new Map<string,{count:number;reset:number}>(); layouts=new Map<string,unknown>(); audits:Array<{event:string;accountId?:string;metadata:Record<string,unknown>}>=[];
  constructor(private now=()=>Date.now()){}
  addAccount(account:PublicAccount){this.accounts.set(account.id,account)}
  async findAccountByEmail(email:string){return [...this.accounts.values()].find((a)=>a.email===email)}
  async findAccountById(id:string){return this.accounts.get(id)}
  async updatePassword(id:string,passwordHash:string,force:boolean,temporaryPasswordExpiresAt?:number){const a=this.accounts.get(id);if(a)this.accounts.set(id,{...a,passwordHash,forcePasswordChange:force,temporaryPasswordExpiresAt})}
  async createChallenge(h:string,v:Challenge){this.challenges.set(h,{...v})} async getChallenge(h:string){const v=this.challenges.get(h);return v&&{...v}} async updateChallenge(h:string,v:Challenge){this.challenges.set(h,{...v})}
  async createSession(h:string,v:Session){this.sessions.set(h,{...v})} async getSession(h:string){const v=this.sessions.get(h);return v&&{...v}} async revokeSession(h:string){const v=this.sessions.get(h);if(v)this.sessions.set(h,{...v,revokedAt:this.now()})} async revokeAllSessions(id:string){for(const [h,v] of this.sessions)if(v.accountId===id)this.sessions.set(h,{...v,revokedAt:this.now()})}
  async createTrustedDevice(h:string,v:TrustedDevice){this.trusted.set(h,{...v})} async getTrustedDevice(h:string){const v=this.trusted.get(h);return v&&{...v}} async revokeTrustedDevice(h:string){const v=this.trusted.get(h);if(v)this.trusted.set(h,{...v,revokedAt:this.now()})} async revokeAllTrustedDevices(id:string){for(const [h,v] of this.trusted)if(v.accountId===id)this.trusted.set(h,{...v,revokedAt:this.now()})}
  async consumeRateLimit(bucket:string,key:string,limit:number,windowMs:number):Promise<RateLimitResult>{const id=`${bucket}:${key}`,now=this.now();let v=this.rates.get(id);if(!v||v.reset<=now)v={count:0,reset:now+windowMs};v.count++;this.rates.set(id,v);return {allowed:v.count<=limit,retryAfterSeconds:Math.ceil((v.reset-now)/1000)}}
  async getLayout(id:string){return this.layouts.get(id)} async saveLayout(id:string,v:unknown){this.layouts.set(id,v)}
  earlyAccess=new Map<string,{email:string;note:string|null}>();
  async recordEarlyAccessRequest(email:string,note:string|null){this.earlyAccess.set(email.toLowerCase(),{email,note})}
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
  async audit(event:string,accountId:string|undefined,metadata:Record<string,unknown>){this.audits.push({event,accountId,metadata})}
}
