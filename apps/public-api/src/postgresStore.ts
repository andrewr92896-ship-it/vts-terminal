import pg from 'pg';
import type { NewStudyDeck, StudyDeckDetail, StudyDeckPatch, StudyDeckRow, NewTradingNote, TradingNotePatch, NetWorthItem, NetWorthSnapshot, InvestmentAccount, InvestmentGoal, InvestmentHolding, InvestmentSnapshot, InvestmentTransaction, BudgetCategory, BudgetEntry, Challenge, NewBudgetCategory, NewBudgetEntry, PublicAccount, PublicStore, RateLimitResult, Session, TodoItemRow, TodoSectionRow, TrustedDevice } from './types.js';
import { STARTER_SECTIONS } from './todo.js';
import type { NoteRow } from './notes.js';
import type { DeckQuestion } from './studies.js';
const {Pool}=pg;

export class PostgresPublicStore implements PublicStore {
  private pool:pg.Pool;
  constructor(url:string){this.pool=new Pool({connectionString:url,application_name:'vts-public-api'})}
  async close(){await this.pool.end()}
  async findAccountByEmail(email:string){const r=await this.pool.query('select id,email,password_hash as "passwordHash",display_name as "displayName",force_password_change as "forcePasswordChange",extract(epoch from temporary_password_expires_at)*1000 as "temporaryPasswordExpiresAt",private_group_warning as "privateGroupWarning",disabled from public_accounts where email=$1',[email]);const v=r.rows[0];return v?{...v,temporaryPasswordExpiresAt:v.temporaryPasswordExpiresAt?Number(v.temporaryPasswordExpiresAt):undefined} as PublicAccount:undefined}
  async findAccountById(id:string){const r=await this.pool.query('select id,email,password_hash as "passwordHash",display_name as "displayName",force_password_change as "forcePasswordChange",extract(epoch from temporary_password_expires_at)*1000 as "temporaryPasswordExpiresAt",private_group_warning as "privateGroupWarning",disabled from public_accounts where id=$1',[id]);const v=r.rows[0];return v?{...v,temporaryPasswordExpiresAt:v.temporaryPasswordExpiresAt?Number(v.temporaryPasswordExpiresAt):undefined} as PublicAccount:undefined}
  async updatePassword(id:string,passwordHash:string,force:boolean,expiresAt?:number){await this.pool.query('update public_accounts set password_hash=$2,force_password_change=$3,temporary_password_expires_at=case when $4::double precision is null then null else to_timestamp($4/1000.0) end,password_changed_at=now() where id=$1',[id,passwordHash,force,expiresAt??null])}
  async createChallenge(hash:string,v:Challenge){await this.pool.query('insert into public_auth_challenges(token_hash,account_id,code_hash,expires_at,attempts) values($1,$2,$3,to_timestamp($4/1000.0),$5)',[hash,v.accountId,v.codeHash,v.expiresAt,v.attempts])}
  async getChallenge(hash:string){const r=await this.pool.query('select account_id as "accountId",code_hash as "codeHash",extract(epoch from expires_at)*1000 as "expiresAt",attempts,extract(epoch from consumed_at)*1000 as "consumedAt" from public_auth_challenges where token_hash=$1',[hash]);const v=r.rows[0];return v?{...v,expiresAt:Number(v.expiresAt),consumedAt:v.consumedAt?Number(v.consumedAt):undefined} as Challenge:undefined}
  async updateChallenge(hash:string,v:Challenge){await this.pool.query('update public_auth_challenges set attempts=$2,consumed_at=case when $3::double precision is null then null else to_timestamp($3/1000.0) end where token_hash=$1',[hash,v.attempts,v.consumedAt??null])}
  async createSession(hash:string,v:Session){await this.pool.query('insert into public_sessions(token_hash,account_id,expires_at,force_password_change) values($1,$2,to_timestamp($3/1000.0),$4)',[hash,v.accountId,v.expiresAt,v.forcePasswordChange])}
  async getSession(hash:string){const r=await this.pool.query('select account_id as "accountId",extract(epoch from expires_at)*1000 as "expiresAt",force_password_change as "forcePasswordChange",extract(epoch from revoked_at)*1000 as "revokedAt" from public_sessions where token_hash=$1',[hash]);const v=r.rows[0];return v?{...v,expiresAt:Number(v.expiresAt),revokedAt:v.revokedAt?Number(v.revokedAt):undefined} as Session:undefined}
  async revokeSession(hash:string){await this.pool.query('update public_sessions set revoked_at=coalesce(revoked_at,now()) where token_hash=$1',[hash])}
  async revokeAllSessions(id:string){await this.pool.query('update public_sessions set revoked_at=coalesce(revoked_at,now()) where account_id=$1',[id])}
  async createTrustedDevice(hash:string,v:TrustedDevice){await this.pool.query('insert into public_trusted_devices(token_hash,account_id,expires_at) values($1,$2,to_timestamp($3/1000.0))',[hash,v.accountId,v.expiresAt])}
  async getTrustedDevice(hash:string){const r=await this.pool.query('select account_id as "accountId",extract(epoch from expires_at)*1000 as "expiresAt",extract(epoch from revoked_at)*1000 as "revokedAt" from public_trusted_devices where token_hash=$1',[hash]);const v=r.rows[0];return v?{...v,expiresAt:Number(v.expiresAt),revokedAt:v.revokedAt?Number(v.revokedAt):undefined} as TrustedDevice:undefined}
  async revokeTrustedDevice(hash:string){await this.pool.query('update public_trusted_devices set revoked_at=coalesce(revoked_at,now()) where token_hash=$1',[hash])}
  async revokeAllTrustedDevices(id:string){await this.pool.query('update public_trusted_devices set revoked_at=coalesce(revoked_at,now()) where account_id=$1',[id])}
  async consumeRateLimit(bucket:string,key:string,limit:number,windowMs:number):Promise<RateLimitResult>{const r=await this.pool.query(`insert into public_rate_limits(bucket,key_hash,window_started,count) values($1,$2,now(),1) on conflict(bucket,key_hash) do update set window_started=case when public_rate_limits.window_started < now()-($4::text||' milliseconds')::interval then now() else public_rate_limits.window_started end,count=case when public_rate_limits.window_started < now()-($4::text||' milliseconds')::interval then 1 else public_rate_limits.count+1 end returning count,greatest(1,ceil(extract(epoch from (window_started+($4::text||' milliseconds')::interval-now()))))::int as retry`,[bucket,key,limit,windowMs]);return {allowed:Number(r.rows[0].count)<=limit,retryAfterSeconds:Number(r.rows[0].retry)}}
  async getLayout(id:string){const r=await this.pool.query('select layout from public_market_layouts where account_id=$1',[id]);return r.rows[0]?.layout}
  async saveLayout(id:string,layout:unknown){await this.pool.query('insert into public_market_layouts(account_id,layout) values($1,$2) on conflict(account_id) do update set layout=excluded.layout,updated_at=now()',[id,layout])}
  async recordEarlyAccessRequest(email:string,note:string|null){await this.pool.query(`insert into public_early_access_requests(email,note) values($1,$2) on conflict(lower(email)) do update set note=coalesce(excluded.note,public_early_access_requests.note),status='new',handled_at=null,created_at=now()`,[email,note])}
  // ---- budget ---------------------------------------------------------------
  //
  // Every statement carries `account_id = $1`, including the ones that already
  // match on a row id. Matching on the id alone would let a guessed id reach
  // another account's row; matching on both means a wrong id simply affects
  // nothing, and the caller is told it changed nothing.
  async listBudgetCategories(accountId:string):Promise<BudgetCategory[]>{
    const r=await this.pool.query('select id,name,kind,monthly_limit as "monthlyLimit",icon,sort_order as "sortOrder",archived from public_budget_categories where account_id=$1 order by sort_order,lower(name)',[accountId]);
    return r.rows.map((v)=>({...v,monthlyLimit:v.monthlyLimit===null?null:Number(v.monthlyLimit),sortOrder:Number(v.sortOrder)})) as BudgetCategory[];
  }
  async addBudgetCategory(accountId:string,v:NewBudgetCategory):Promise<BudgetCategory>{
    const r=await this.pool.query(
      `insert into public_budget_categories(account_id,name,kind,monthly_limit,icon,sort_order)
       values($1,$2,$3,$4,$5,coalesce((select max(sort_order)+1 from public_budget_categories where account_id=$1),0))
       returning id,name,kind,monthly_limit as "monthlyLimit",icon,sort_order as "sortOrder",archived`,
      [accountId,v.name,v.kind,v.monthlyLimit,v.icon]);
    const row=r.rows[0];
    return {...row,monthlyLimit:row.monthlyLimit===null?null:Number(row.monthlyLimit),sortOrder:Number(row.sortOrder)} as BudgetCategory;
  }
  async archiveBudgetCategory(accountId:string,id:string,archived:boolean):Promise<boolean>{
    const r=await this.pool.query('update public_budget_categories set archived=$3,updated_at=now() where account_id=$1 and id=$2',[accountId,id,archived]);
    return (r.rowCount??0)>0;
  }
  async deleteBudgetCategory(accountId:string,id:string):Promise<boolean>{
    const r=await this.pool.query('delete from public_budget_categories where account_id=$1 and id=$2',[accountId,id]);
    return (r.rowCount??0)>0;
  }
  // Bounded by the month rather than fetching a whole history and filtering in
  // memory — a budget kept for years is a lot of rows to send nowhere.
  async listBudgetEntries(accountId:string,month:string):Promise<BudgetEntry[]>{
    const r=await this.pool.query(
      `select id,category_id as "categoryId",amount_cents as "amountCents",note,to_char(occurred_on,'YYYY-MM-DD') as "occurredOn",source
         from public_budget_entries
        where account_id=$1 and to_char(occurred_on,'YYYY-MM')=$2
        order by occurred_on desc,created_at desc`,[accountId,month]);
    return r.rows.map((v)=>({...v,amountCents:Number(v.amountCents)})) as BudgetEntry[];
  }
  // The category is matched on the account too, so an entry can never be filed
  // against a category belonging to somebody else. No match inserts nothing.
  async addBudgetEntry(accountId:string,v:NewBudgetEntry):Promise<BudgetEntry|undefined>{
    const r=await this.pool.query(
      `insert into public_budget_entries(account_id,category_id,amount_cents,note,occurred_on)
       select $1,$2,$3,$4,$5::date
        where exists (select 1 from public_budget_categories where id=$2 and account_id=$1)
       returning id,category_id as "categoryId",amount_cents as "amountCents",note,to_char(occurred_on,'YYYY-MM-DD') as "occurredOn",source`,
      [accountId,v.categoryId,v.amountCents,v.note,v.occurredOn]);
    const row=r.rows[0];
    return row?{...row,amountCents:Number(row.amountCents)} as BudgetEntry:undefined;
  }
  async deleteBudgetEntry(accountId:string,id:string):Promise<boolean>{
    const r=await this.pool.query('delete from public_budget_entries where account_id=$1 and id=$2',[accountId,id]);
    return (r.rowCount??0)>0;
  }
  // ---- to do ----------------------------------------------------------------
  //
  // Seeding is idempotent by CONSTRAINT — `on conflict do nothing` against the
  // unique (account_id, n). Two concurrent first loads on two containers both
  // run it and the second inserts nothing, which an in-process guard could not
  // promise.
  async ensureTodoSections(accountId:string){
    const params:unknown[]=[accountId];
    for(const s of STARTER_SECTIONS)params.push(s.n,s.icon,s.title,s.type,s.intervalDays);
    // Five placeholders per section after $1, which every row shares.
    const placeholders=STARTER_SECTIONS.map((_,i)=>`($1,$${i*5+2},$${i*5+3},$${i*5+4},$${i*5+5},$${i*5+6})`).join(',');
    await this.pool.query(`insert into public_todo_sections(account_id,n,icon,title,type,interval_days) values${placeholders} on conflict (account_id,n) do nothing`,params);
  }
  async listTodoSections(accountId:string):Promise<TodoSectionRow[]>{
    const r=await this.pool.query('select id,n,icon,title,type,interval_days as "intervalDays" from public_todo_sections where account_id=$1 order by n',[accountId]);
    return r.rows.map((v)=>({...v,n:Number(v.n),intervalDays:v.intervalDays===null?null:Number(v.intervalDays)})) as TodoSectionRow[];
  }
  async listTodoItems(accountId:string):Promise<TodoItemRow[]>{
    const r=await this.pool.query('select id,section_id as "sectionId",text,position,hyphen,done,due_at as "dueAt",interval_days as "intervalDays" from public_todo_items where account_id=$1 order by position,created_at',[accountId]);
    return r.rows.map((v)=>({...v,position:Number(v.position),dueAt:v.dueAt?new Date(v.dueAt).getTime():null,intervalDays:v.intervalDays===null?null:Number(v.intervalDays)})) as TodoItemRow[];
  }
  // The section is matched on the account too, so an item can never be filed
  // into somebody else's list. No match inserts nothing and returns undefined.
  async addTodoItem(accountId:string,sectionId:string,text:string):Promise<TodoItemRow|undefined>{
    const r=await this.pool.query(
      `insert into public_todo_items(account_id,section_id,text,position)
       select $1,$2,$3,coalesce((select max(position)+1 from public_todo_items where account_id=$1 and section_id=$2),0)
        where exists (select 1 from public_todo_sections where id=$2 and account_id=$1)
       returning id,section_id as "sectionId",text,position,hyphen,done,due_at as "dueAt",interval_days as "intervalDays"`,
      [accountId,sectionId,text]);
    const v=r.rows[0];
    return v?{...v,position:Number(v.position),dueAt:v.dueAt?new Date(v.dueAt).getTime():null,intervalDays:v.intervalDays===null?null:Number(v.intervalDays)} as TodoItemRow:undefined;
  }
  async getTodoItem(accountId:string,id:string):Promise<TodoItemRow|undefined>{
    const r=await this.pool.query('select id,section_id as "sectionId",text,position,hyphen,done,due_at as "dueAt",interval_days as "intervalDays" from public_todo_items where account_id=$1 and id=$2',[accountId,id]);
    const v=r.rows[0];
    return v?{...v,position:Number(v.position),dueAt:v.dueAt?new Date(v.dueAt).getTime():null,intervalDays:v.intervalDays===null?null:Number(v.intervalDays)} as TodoItemRow:undefined;
  }
  async setTodoItemState(accountId:string,id:string,done:boolean,dueAt:number|null){
    const r=await this.pool.query('update public_todo_items set done=$3,due_at=case when $4::double precision is null then null else to_timestamp($4/1000.0) end where account_id=$1 and id=$2',[accountId,id,done,dueAt]);
    return (r.rowCount??0)>0;
  }
  async deleteTodoItem(accountId:string,id:string){
    const r=await this.pool.query('delete from public_todo_items where account_id=$1 and id=$2',[accountId,id]);
    return (r.rowCount??0)>0;
  }
  // Restore puts the item back with the id and position it held, so an undo
  // returns the list to what it was rather than appending a copy at the end.
  async restoreTodoItem(accountId:string,item:TodoItemRow){
    const r=await this.pool.query(
      `insert into public_todo_items(id,account_id,section_id,text,position,hyphen,done,due_at,interval_days)
       select $2,$1,$3,$4,$5,$6,$7,case when $8::double precision is null then null else to_timestamp($8/1000.0) end,$9
        where exists (select 1 from public_todo_sections where id=$3 and account_id=$1)
       on conflict (id) do nothing`,
      [accountId,item.id,item.sectionId,item.text,item.position,item.hyphen,item.done,item.dueAt,item.intervalDays]);
    return (r.rowCount??0)>0;
  }
  // ---- investments ----------------------------------------------------------
  //
  // Every statement carries `account_id = $1`, including those already matching
  // a row id, and every child row is inserted only `where exists` a parent the
  // same account owns — so a guessed id reaches nothing rather than filing into
  // somebody else's portfolio.
  async listInvestmentAccounts(accountId:string):Promise<InvestmentAccount[]>{
    const r=await this.pool.query('select id,label,kind,institution,source,cash_balance as "cashBalance",note,active,sort_order as "sortOrder" from public_investment_accounts where account_id=$1 order by sort_order,label',[accountId]);
    return r.rows.map((v)=>({...v,cashBalance:Number(v.cashBalance),sortOrder:Number(v.sortOrder)})) as InvestmentAccount[];
  }
  async listInvestmentHoldings(accountId:string):Promise<InvestmentHolding[]>{
    const r=await this.pool.query('select id,investment_account_id as "investmentAccountId",symbol,name,asset_class as "assetClass",quantity,cost_basis as "costBasis",manual_price as "manualPrice",manual_price_at as "manualPriceAt",sector,region,note from public_investment_holdings where account_id=$1 order by name',[accountId]);
    return r.rows.map((v)=>({...v,quantity:Number(v.quantity),costBasis:v.costBasis===null?null:Number(v.costBasis),
      manualPrice:v.manualPrice===null?null:Number(v.manualPrice),manualPriceAt:v.manualPriceAt?new Date(v.manualPriceAt).getTime():null})) as InvestmentHolding[];
  }
  async listInvestmentTransactions(accountId:string):Promise<InvestmentTransaction[]>{
    const r=await this.pool.query('select id,investment_account_id as "investmentAccountId",holding_id as "holdingId",kind,amount,quantity,occurred_at as "occurredAt",tax_year as "taxYear",note,source from public_investment_transactions where account_id=$1 order by occurred_at desc',[accountId]);
    return r.rows.map((v)=>({...v,amount:Number(v.amount),quantity:v.quantity===null?null:Number(v.quantity),
      occurredAt:new Date(v.occurredAt).getTime(),taxYear:v.taxYear===null?null:Number(v.taxYear)})) as InvestmentTransaction[];
  }
  async listInvestmentGoals(accountId:string):Promise<InvestmentGoal[]>{
    const r=await this.pool.query('select id,label,target_amount as "targetAmount",target_year as "targetYear",note from public_investment_goals where account_id=$1 order by target_year nulls last,label',[accountId]);
    return r.rows.map((v)=>({...v,targetAmount:v.targetAmount===null?null:Number(v.targetAmount),targetYear:v.targetYear===null?null:Number(v.targetYear)})) as InvestmentGoal[];
  }
  async listInvestmentSnapshots(accountId:string):Promise<InvestmentSnapshot[]>{
    const r=await this.pool.query(`select to_char(on_date,'YYYY-MM-DD') as "onDate",value,contributions from public_investment_snapshots where account_id=$1 order by on_date`,[accountId]);
    return r.rows.map((v)=>({...v,value:Number(v.value),contributions:Number(v.contributions)})) as InvestmentSnapshot[];
  }
  async createInvestmentAccount(accountId:string,v:Omit<InvestmentAccount,'id'|'source'>):Promise<InvestmentAccount>{
    // `source` is never read from the caller: a manual account must not be able
    // to claim it is a verified provider connection.
    const r=await this.pool.query(
      `insert into public_investment_accounts(account_id,label,kind,institution,cash_balance,note,active,sort_order)
       values($1,$2,$3,$4,$5,$6,$7,$8)
       returning id,label,kind,institution,source,cash_balance as "cashBalance",note,active,sort_order as "sortOrder"`,
      [accountId,v.label,v.kind,v.institution,v.cashBalance,v.note,v.active,v.sortOrder]);
    const row=r.rows[0];
    return {...row,cashBalance:Number(row.cashBalance),sortOrder:Number(row.sortOrder)} as InvestmentAccount;
  }
  async updateInvestmentAccount(accountId:string,id:string,patch:Partial<Omit<InvestmentAccount,'id'|'source'>>){
    const columns:Record<string,string>={label:'label',kind:'kind',institution:'institution',cashBalance:'cash_balance',note:'note',active:'active',sortOrder:'sort_order'};
    const sets:string[]=[]; const params:unknown[]=[accountId,id];
    for(const [key,column] of Object.entries(columns)){
      if(!(key in patch))continue;
      params.push((patch as Record<string,unknown>)[key]);
      sets.push(`${column}=$${params.length}`);
    }
    if(!sets.length)return (await this.pool.query('select 1 from public_investment_accounts where account_id=$1 and id=$2',[accountId,id])).rowCount!>0;
    const r=await this.pool.query(`update public_investment_accounts set ${sets.join(',')},updated_at=now() where account_id=$1 and id=$2`,params);
    return (r.rowCount??0)>0;
  }
  async deleteInvestmentAccount(accountId:string,id:string){
    const r=await this.pool.query('delete from public_investment_accounts where account_id=$1 and id=$2',[accountId,id]);
    return (r.rowCount??0)>0;
  }
  async createInvestmentHolding(accountId:string,v:Omit<InvestmentHolding,'id'>):Promise<InvestmentHolding|undefined>{
    const r=await this.pool.query(
      `insert into public_investment_holdings(account_id,investment_account_id,symbol,name,asset_class,quantity,cost_basis,manual_price,manual_price_at,sector,region,note)
       select $1,$2,$3,$4,$5,$6,$7,$8,case when $9::double precision is null then null else to_timestamp($9/1000.0) end,$10,$11,$12
        where exists (select 1 from public_investment_accounts where id=$2 and account_id=$1)
       returning id,investment_account_id as "investmentAccountId",symbol,name,asset_class as "assetClass",quantity,cost_basis as "costBasis",manual_price as "manualPrice",manual_price_at as "manualPriceAt",sector,region,note`,
      [accountId,v.investmentAccountId,v.symbol,v.name,v.assetClass,v.quantity,v.costBasis,v.manualPrice,v.manualPriceAt,v.sector,v.region,v.note]);
    const row=r.rows[0];
    return row?{...row,quantity:Number(row.quantity),costBasis:row.costBasis===null?null:Number(row.costBasis),
      manualPrice:row.manualPrice===null?null:Number(row.manualPrice),manualPriceAt:row.manualPriceAt?new Date(row.manualPriceAt).getTime():null} as InvestmentHolding:undefined;
  }
  async updateInvestmentHolding(accountId:string,id:string,patch:Partial<Omit<InvestmentHolding,'id'|'investmentAccountId'>>){
    const columns:Record<string,string>={symbol:'symbol',name:'name',assetClass:'asset_class',quantity:'quantity',costBasis:'cost_basis',manualPrice:'manual_price',sector:'sector',region:'region',note:'note'};
    const sets:string[]=[]; const params:unknown[]=[accountId,id];
    for(const [key,column] of Object.entries(columns)){
      if(!(key in patch))continue;
      params.push((patch as Record<string,unknown>)[key]);
      sets.push(`${column}=$${params.length}`);
    }
    // A price the user typed is stamped when it is typed, so the screen can say
    // how old it is rather than presenting it as a current quote.
    if('manualPrice' in patch)sets.push(patch.manualPrice==null?'manual_price_at=null':'manual_price_at=now()');
    if(!sets.length)return (await this.pool.query('select 1 from public_investment_holdings where account_id=$1 and id=$2',[accountId,id])).rowCount!>0;
    const r=await this.pool.query(`update public_investment_holdings set ${sets.join(',')},updated_at=now() where account_id=$1 and id=$2`,params);
    return (r.rowCount??0)>0;
  }
  async deleteInvestmentHolding(accountId:string,id:string){
    const r=await this.pool.query('delete from public_investment_holdings where account_id=$1 and id=$2',[accountId,id]);
    return (r.rowCount??0)>0;
  }
  async createInvestmentTransaction(accountId:string,v:Omit<InvestmentTransaction,'id'|'source'>):Promise<InvestmentTransaction|undefined>{
    const r=await this.pool.query(
      `insert into public_investment_transactions(account_id,investment_account_id,holding_id,kind,amount,quantity,occurred_at,tax_year,note)
       select $1,$2,$3,$4,$5,$6,to_timestamp($7/1000.0),$8,$9
        where exists (select 1 from public_investment_accounts where id=$2 and account_id=$1)
       returning id,investment_account_id as "investmentAccountId",holding_id as "holdingId",kind,amount,quantity,occurred_at as "occurredAt",tax_year as "taxYear",note,source`,
      [accountId,v.investmentAccountId,v.holdingId,v.kind,v.amount,v.quantity,v.occurredAt,v.taxYear,v.note]);
    const row=r.rows[0];
    return row?{...row,amount:Number(row.amount),quantity:row.quantity===null?null:Number(row.quantity),
      occurredAt:new Date(row.occurredAt).getTime(),taxYear:row.taxYear===null?null:Number(row.taxYear)} as InvestmentTransaction:undefined;
  }
  async deleteInvestmentTransaction(accountId:string,id:string){
    const r=await this.pool.query('delete from public_investment_transactions where account_id=$1 and id=$2',[accountId,id]);
    return (r.rowCount??0)>0;
  }
  async createInvestmentGoal(accountId:string,v:Omit<InvestmentGoal,'id'>):Promise<InvestmentGoal>{
    const r=await this.pool.query(
      'insert into public_investment_goals(account_id,label,target_amount,target_year,note) values($1,$2,$3,$4,$5) returning id,label,target_amount as "targetAmount",target_year as "targetYear",note',
      [accountId,v.label,v.targetAmount,v.targetYear,v.note]);
    const row=r.rows[0];
    return {...row,targetAmount:row.targetAmount===null?null:Number(row.targetAmount),targetYear:row.targetYear===null?null:Number(row.targetYear)} as InvestmentGoal;
  }
  async deleteInvestmentGoal(accountId:string,id:string){
    const r=await this.pool.query('delete from public_investment_goals where account_id=$1 and id=$2',[accountId,id]);
    return (r.rowCount??0)>0;
  }
  // One reading per Eastern day, last of the day standing. Never back-filled:
  // nothing can price a fund as of last March, so an earlier curve would be one
  // that never happened.
  async recordInvestmentSnapshot(accountId:string,onDate:string,value:number,contributions:number){
    await this.pool.query(
      `insert into public_investment_snapshots(account_id,on_date,value,contributions) values($1,$2::date,$3,$4)
       on conflict (account_id,on_date) do update set value=excluded.value,contributions=excluded.contributions`,
      [accountId,onDate,value,contributions]);
  }
  // ---- net worth ------------------------------------------------------------
  async listNetWorthItems(accountId:string):Promise<NetWorthItem[]>{
    const r=await this.pool.query('select id,kind,category,label,value,note,active,sort_order as "sortOrder",updated_at as "updatedAt" from public_net_worth_items where account_id=$1 order by sort_order,label',[accountId]);
    return r.rows.map((v)=>({...v,value:Number(v.value),sortOrder:Number(v.sortOrder),updatedAt:new Date(v.updatedAt).getTime()})) as NetWorthItem[];
  }
  async createNetWorthItem(accountId:string,v:Omit<NetWorthItem,'id'|'updatedAt'>):Promise<NetWorthItem>{
    // Stored positive whatever arrives: `kind` is what carries the sign, and a
    // negative in this column is invisible to anything that sums it.
    const r=await this.pool.query(
      `insert into public_net_worth_items(account_id,kind,category,label,value,note,active,sort_order)
       values($1,$2,$3,$4,$5,$6,$7,$8)
       returning id,kind,category,label,value,note,active,sort_order as "sortOrder",updated_at as "updatedAt"`,
      [accountId,v.kind,v.category,v.label,Math.abs(v.value),v.note,v.active,v.sortOrder]);
    const row=r.rows[0];
    return {...row,value:Number(row.value),sortOrder:Number(row.sortOrder),updatedAt:new Date(row.updatedAt).getTime()} as NetWorthItem;
  }
  async updateNetWorthItem(accountId:string,id:string,patch:Partial<Omit<NetWorthItem,'id'|'updatedAt'>>){
    const columns:Record<string,string>={kind:'kind',category:'category',label:'label',value:'value',note:'note',active:'active',sortOrder:'sort_order'};
    const sets:string[]=[]; const params:unknown[]=[accountId,id];
    for(const [key,column] of Object.entries(columns)){
      if(!(key in patch))continue;
      const raw=(patch as Record<string,unknown>)[key];
      params.push(key==='value'?Math.abs(Number(raw)):raw);
      sets.push(`${column}=$${params.length}`);
    }
    if(!sets.length)return (await this.pool.query('select 1 from public_net_worth_items where account_id=$1 and id=$2',[accountId,id])).rowCount!>0;
    const r=await this.pool.query(`update public_net_worth_items set ${sets.join(',')},updated_at=now() where account_id=$1 and id=$2`,params);
    return (r.rowCount??0)>0;
  }
  async deleteNetWorthItem(accountId:string,id:string){
    const r=await this.pool.query('delete from public_net_worth_items where account_id=$1 and id=$2',[accountId,id]);
    return (r.rowCount??0)>0;
  }
  async listNetWorthSnapshots(accountId:string):Promise<NetWorthSnapshot[]>{
    const r=await this.pool.query(`select to_char(on_date,'YYYY-MM-DD') as "onDate",assets,liabilities,net_worth as "netWorth" from public_net_worth_snapshots where account_id=$1 order by on_date`,[accountId]);
    return r.rows.map((v)=>({...v,assets:Number(v.assets),liabilities:Number(v.liabilities),netWorth:Number(v.netWorth)})) as NetWorthSnapshot[];
  }
  async recordNetWorthSnapshot(accountId:string,onDate:string,assets:number,liabilities:number,netWorth:number){
    await this.pool.query(
      `insert into public_net_worth_snapshots(account_id,on_date,assets,liabilities,net_worth) values($1,$2::date,$3,$4,$5)
       on conflict (account_id,on_date) do update set assets=excluded.assets,liabilities=excluded.liabilities,net_worth=excluded.net_worth`,
      [accountId,onDate,assets,liabilities,netWorth]);
  }
  // ---- trading notes --------------------------------------------------------
  //
  // Every statement carries `account_id=$1`, so there is no read here that could
  // reach another account's calls and no column that could publish one.
  //
  // Timestamps come back as epoch ms rather than Date objects because that is
  // what the payload carries and what the lock and deadline comparisons are
  // written against — converting once on the way out means nothing downstream
  // has to know which of the two it is holding.
  private noteColumns=`id,kind,title,body,instrument,direction,target_price as "targetPrice",confidence,
       week_key as "weekKey",window_opens_at as "windowOpensAt",deadline_at as "deadlineAt",open_price as "openPrice",
       locked_at as "lockedAt",outcome,settled_at as "settledAt",settled_by as "settledBy",
       settle_price as "settlePrice",settle_note as "settleNote",reflection,reflected_at as "reflectedAt",
       created_at as "createdAt",updated_at as "updatedAt"`;
  private toNoteRow(v:Record<string,unknown>):NoteRow{
    const ms=(x:unknown):number|null=>x==null?null:new Date(x as string).getTime();
    const num=(x:unknown):number|null=>x==null?null:Number(x);
    return {...v,
      targetPrice:num(v.targetPrice),confidence:num(v.confidence),settlePrice:num(v.settlePrice),openPrice:num(v.openPrice),
      windowOpensAt:ms(v.windowOpensAt),deadlineAt:ms(v.deadlineAt),lockedAt:ms(v.lockedAt),
      settledAt:ms(v.settledAt),reflectedAt:ms(v.reflectedAt),
      createdAt:ms(v.createdAt)??0,updatedAt:ms(v.updatedAt)??0} as NoteRow;
  }
  async listTradingNotes(accountId:string,weekKey?:string):Promise<NoteRow[]>{
    const r=weekKey==null
      ? await this.pool.query(`select ${this.noteColumns} from public_trading_notes where account_id=$1 order by created_at desc`,[accountId])
      : await this.pool.query(`select ${this.noteColumns} from public_trading_notes where account_id=$1 and week_key=$2 order by created_at desc`,[accountId,weekKey]);
    return r.rows.map((v)=>this.toNoteRow(v));
  }
  async countTradingNotesInWeek(accountId:string,weekKey:string):Promise<number>{
    const r=await this.pool.query('select count(*)::int as n from public_trading_notes where account_id=$1 and week_key=$2',[accountId,weekKey]);
    return Number(r.rows[0]?.n??0);
  }
  async getTradingNote(accountId:string,id:string):Promise<NoteRow|undefined>{
    const r=await this.pool.query(`select ${this.noteColumns} from public_trading_notes where account_id=$1 and id=$2`,[accountId,id]);
    const row=r.rows[0];
    return row?this.toNoteRow(row):undefined;
  }
  async createTradingNote(accountId:string,v:NewTradingNote):Promise<NoteRow>{
    const at=(ms:number|null)=>ms==null?null:new Date(ms).toISOString();
    const r=await this.pool.query(
      `insert into public_trading_notes(account_id,kind,title,body,instrument,direction,target_price,confidence,week_key,window_opens_at,deadline_at,locked_at)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       returning ${this.noteColumns}`,
      [accountId,v.kind,v.title,v.body,v.instrument,v.direction,v.targetPrice,v.confidence,v.weekKey,at(v.windowOpensAt),at(v.deadlineAt),at(v.lockedAt)]);
    return this.toNoteRow(r.rows[0]);
  }
  async updateTradingNote(accountId:string,id:string,patch:TradingNotePatch):Promise<boolean>{
    const columns:Record<string,string>={title:'title',body:'body',instrument:'instrument',direction:'direction',targetPrice:'target_price',confidence:'confidence',windowOpensAt:'window_opens_at',deadlineAt:'deadline_at',outcome:'outcome',settledAt:'settled_at',settledBy:'settled_by',settleNote:'settle_note',reflection:'reflection',reflectedAt:'reflected_at'};
    const stamps=new Set(['windowOpensAt','deadlineAt','settledAt','reflectedAt']);
    const sets:string[]=[]; const params:unknown[]=[accountId,id];
    for(const [key,column] of Object.entries(columns)){
      if(!(key in patch))continue;
      const raw=(patch as Record<string,unknown>)[key];
      params.push(stamps.has(key)&&raw!=null?new Date(Number(raw)).toISOString():raw??null);
      sets.push(`${column}=$${params.length}`);
    }
    if(!sets.length)return ((await this.pool.query('select 1 from public_trading_notes where account_id=$1 and id=$2',[accountId,id])).rowCount??0)>0;
    const r=await this.pool.query(`update public_trading_notes set ${sets.join(',')},updated_at=now() where account_id=$1 and id=$2`,params);
    return (r.rowCount??0)>0;
  }
  async deleteTradingNote(accountId:string,id:string):Promise<boolean>{
    const r=await this.pool.query('delete from public_trading_notes where account_id=$1 and id=$2',[accountId,id]);
    return (r.rowCount??0)>0;
  }
  // ---- study games ----------------------------------------------------------
  //
  // Every statement carries `account_id=$1`. Questions are written as one batch
  // per deck inside a transaction with the deck itself, because a deck that
  // exists with half its questions is worse than one that failed to save.
  private deckRow(v:Record<string,unknown>):StudyDeckRow{
    return {id:String(v.id),name:String(v.name),description:(v.description??null) as string|null,
      source:String(v.source),
      categories:Array.isArray(v.categories)?v.categories as string[]:[],
      categoryWeights:(v.categoryWeights??null) as Record<string,number>|null,
      questionCount:Number(v.questionCount??0),
      createdAt:new Date(String(v.createdAt)).getTime()};
  }
  private deckColumns=`id,name,description,source,categories,category_weights as "categoryWeights",created_at as "createdAt"`;
  async listStudyDecks(accountId:string):Promise<StudyDeckRow[]>{
    const r=await this.pool.query(
      `select d.id,d.name,d.description,d.source,d.categories,d.category_weights as "categoryWeights",d.created_at as "createdAt",
              (select count(*) from public_study_questions q where q.deck_id=d.id)::int as "questionCount"
         from public_study_decks d where d.account_id=$1 order by d.created_at desc`,[accountId]);
    return r.rows.map((v)=>this.deckRow(v));
  }
  async getStudyDeck(accountId:string,id:string):Promise<StudyDeckDetail|undefined>{
    const r=await this.pool.query(`select ${this.deckColumns} from public_study_decks where account_id=$1 and id=$2`,[accountId,id]);
    const row=r.rows[0];
    if(!row)return undefined;
    const q=await this.pool.query(
      `select seq,topic,stem,options,answer,explanation,source_name as "sourceName"
         from public_study_questions where deck_id=$1 order by seq`,[id]);
    const questions=q.rows as DeckQuestion[];
    return {...this.deckRow(row),questionCount:questions.length,questions};
  }
  private async writeQuestions(client:pg.PoolClient,deckId:string,questions:DeckQuestion[]):Promise<void>{
    await client.query('delete from public_study_questions where deck_id=$1',[deckId]);
    if(questions.length===0)return;
    // One statement for the whole deck: a thousand round trips would make an
    // ordinary import feel broken.
    const values:unknown[]=[deckId];
    const rows=questions.map((q)=>{
      const at=values.length;
      values.push(q.seq,q.topic,q.stem,JSON.stringify(q.options),q.answer,q.explanation,q.sourceName);
      return `($1,$${at+1},$${at+2},$${at+3},$${at+4}::jsonb,$${at+5},$${at+6},$${at+7})`;
    });
    await client.query(`insert into public_study_questions(deck_id,seq,topic,stem,options,answer,explanation,source_name) values ${rows.join(',')}`,values);
  }
  async createStudyDeck(accountId:string,v:NewStudyDeck):Promise<StudyDeckDetail>{
    const client=await this.pool.connect();
    try{
      await client.query('begin');
      const r=await client.query(
        `insert into public_study_decks(account_id,name,description,source,categories,category_weights)
         values($1,$2,$3,$4,$5::jsonb,$6::jsonb) returning ${this.deckColumns}`,
        [accountId,v.name,v.description,v.source,JSON.stringify(v.categories),v.categoryWeights==null?null:JSON.stringify(v.categoryWeights)]);
      const deck=this.deckRow(r.rows[0]);
      await this.writeQuestions(client,deck.id,v.questions);
      await client.query('commit');
      return {...deck,questionCount:v.questions.length,questions:v.questions};
    }catch(error){
      await client.query('rollback').catch(()=>{});
      throw error;
    }finally{client.release()}
  }
  async updateStudyDeck(accountId:string,id:string,patch:StudyDeckPatch):Promise<StudyDeckDetail|undefined>{
    const client=await this.pool.connect();
    try{
      await client.query('begin');
      const owned=await client.query('select 1 from public_study_decks where account_id=$1 and id=$2',[accountId,id]);
      if((owned.rowCount??0)===0){await client.query('rollback');return undefined}
      const columns:Record<string,string>={name:'name',description:'description',categories:'categories',categoryWeights:'category_weights'};
      const json=new Set(['categories','categoryWeights']);
      const sets:string[]=[]; const params:unknown[]=[accountId,id];
      for(const [key,column] of Object.entries(columns)){
        if(!(key in patch))continue;
        const raw=(patch as Record<string,unknown>)[key];
        params.push(json.has(key)?(raw==null?null:JSON.stringify(raw)):raw??null);
        sets.push(`${column}=$${params.length}${json.has(key)?'::jsonb':''}`);
      }
      if(sets.length)await client.query(`update public_study_decks set ${sets.join(',')},updated_at=now() where account_id=$1 and id=$2`,params);
      if(patch.questions)await this.writeQuestions(client,id,patch.questions);
      await client.query('commit');
    }catch(error){
      await client.query('rollback').catch(()=>{});
      throw error;
    }finally{client.release()}
    return this.getStudyDeck(accountId,id);
  }
  async deleteStudyDeck(accountId:string,id:string):Promise<boolean>{
    // The questions, the learner's progress and the banked runs all cascade from
    // the deck row — there is nothing left for them to be progress THROUGH.
    const r=await this.pool.query('delete from public_study_decks where account_id=$1 and id=$2',[accountId,id]);
    return (r.rowCount??0)>0;
  }
  async getStudyDeckGame(accountId:string,deckId:string):Promise<string|null>{
    const r=await this.pool.query('select state from public_study_deck_game where account_id=$1 and deck_id=$2',[accountId,deckId]);
    return r.rows[0]?.state??null;
  }
  async saveStudyDeckGame(accountId:string,deckId:string,state:string):Promise<void>{
    await this.pool.query(
      `insert into public_study_deck_game(account_id,deck_id,state) values($1,$2,$3)
       on conflict (account_id,deck_id) do update set state=excluded.state,updated_at=now()`,
      [accountId,deckId,state]);
  }
  async recordStudyDeckRun(accountId:string,deckId:string,attempted:number,correct:number,bestStep:number):Promise<void>{
    await this.pool.query('insert into public_study_deck_runs(account_id,deck_id,attempted,correct,best_step) values($1,$2,$3,$4,$5)',
      [accountId,deckId,attempted,correct,bestStep]);
  }
  async audit(event:string,accountId:string|undefined,metadata:Record<string,unknown>){await this.pool.query('insert into public_audit_events(event,account_id,metadata) values($1,$2,$3)',[event,accountId??null,metadata])}
}
