import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
const root=new URL('../apps/public-api/src/',import.meta.url);
async function files(dir){const out=[];for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())out.push(...await files(path));else if(/\.ts$/.test(path))out.push(path)}return out}
const source=(await Promise.all((await files(root)).map((file)=>readFile(file,'utf8')))).join('\n');
for(const pattern of [/from ['"].*apps\/api/i,/process\.env\.(DATABASE_URL|SESSION_SECRET|COOKIE_NAME|SMTP_URL)\b/,/\/public\/v1\/(orders?|positions?|balances?|brokers?|admin|founder|groups?)/i])if(pattern.test(source))throw new Error(`Public API boundary violation: ${pattern}`);
for(const required of ["'/public/v1/health'","'/public/v1/auth/login'","'/public/v1/auth/two-factor/verify'","'/public/v1/auth/recovery'","'/public/v1/market-data'"])if(!source.includes(required))throw new Error(`Missing public contract ${required}`);
if(!source.includes("PUBLIC_SESSION_COOKIE='vts_public_session_v1'")||!source.includes("PUBLIC_COOKIE_PATH='/public'"))throw new Error('Public cookie boundary is not explicit.');
console.log('Public API route, import, environment, and cookie boundaries verified.');
