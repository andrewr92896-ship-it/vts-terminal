import { readFile } from 'node:fs/promises';
const read=(file)=>readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8');
const sql=(await Promise.all(['0001_public_auth_foundation.sql','0002_public_early_access.sql'].map(read))).join('\n');
for(const table of ['public_accounts','public_auth_challenges','public_sessions','public_trusted_devices','public_rate_limits','public_recovery_events','public_market_layouts','public_audit_events','public_early_access_requests'])if(!sql.includes(`create table ${table}`))throw new Error(`Missing public migration table ${table}`);
for(const forbidden of ['users ','sessions ','broker_connections','trading_orders'])if(new RegExp(`create table ${forbidden.replace(' ','\\s')}`,'i').test(sql))throw new Error(`Forbidden private table in public migration: ${forbidden}`);
// Every public table is prefixed, so a private table can never be created by a
// migration that runs against the public database by mistake.
for(const [,name] of sql.matchAll(/create table\s+([a-z_]+)/gi))if(!name.startsWith('public_'))throw new Error(`Public migration creates a non-public table: ${name}`);
console.log('Public migrations verified.');
