import { readFile } from 'node:fs/promises';
const sql=await readFile(new URL('../migrations/0001_public_auth_foundation.sql',import.meta.url),'utf8');
for(const table of ['public_accounts','public_auth_challenges','public_sessions','public_trusted_devices','public_rate_limits','public_recovery_events','public_market_layouts','public_audit_events'])if(!sql.includes(`create table ${table}`))throw new Error(`Missing public migration table ${table}`);
for(const forbidden of ['users ','sessions ','broker_connections','trading_orders'])if(new RegExp(`create table ${forbidden.replace(' ','\\s')}`,'i').test(sql))throw new Error(`Forbidden private table in public migration: ${forbidden}`);
console.log('Public migrations verified.');
