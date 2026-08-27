#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ENTRY='apps/public-terminal/src/main.tsx';
const PUBLIC_DIRS=['apps/public-terminal/src','apps/web/src/public'];
const ALLOWED_PORTAL_IMPORTS=[
  /^\.\.\/\.\.\/web\/src\/styles\/global\.css$/,
  /^\.\.\/\.\.\/web\/src\/public\/PublicApp$/,
  /^\.\.\/\.\.\/\.\.\/web\/src\/public\/PublicRuntime$/,
  /^\.\.\/(components\/(Icon|Clock)|theme\/(tokens|themes)|workspaces\/trading\/(MarketData|CalendarTile|NewsTile|WatchlistTile|TvWidget)|api\/types)$/,
  /^\.\.\/(hooks\/useNowTick|lib\/timezone|workspaces\/trading\/(etClock|tvChart)|workspaces\/trading\/tiles\/TileFrame)$/,
  /^\.\/((Public(App|ClockTile|LiveWall|Login|Runtime|Sidebar|TopBar)|publicNav))$/,
];
const PROHIBITED_SOURCE=[/Admin/i,/Developer/i,/Founder/i,/OrderTicket/i,/TradeDesk/i,/BrokerConnections/i,/Pushover/i,/TeamChat/i,/FounderTrade/i];
const PROHIBITED_BUNDLE=[/vts_portal_session/i,/portal\.vitalistradingsystems\.com/i,/\/api\/(admin|dev|brokers|trade-desk|founder|teams|chat|pushover)/i,/place.{0,8}order/i,/broker.{0,8}(key|token|secret)/i,/founder.{0,8}trade/i,/strategy.{0,8}bias/i];
let failures=0;
const fail=(message)=>{failures+=1;console.error(`FAIL ${message}`)};
const walk=(directory)=>readdirSync(directory,{withFileTypes:true}).flatMap((entry)=>{const next=path.join(directory,entry.name);return entry.isDirectory()?walk(next):[next]});
if(!existsSync(ENTRY))fail(`missing ${ENTRY}`);
for(const directory of PUBLIC_DIRS){
  for(const file of walk(directory).filter((item)=>/\.(ts|tsx)$/.test(item))){
    const text=readFileSync(file,'utf8');
    for(const pattern of PROHIBITED_SOURCE)if(pattern.test(text))fail(`${file} contains prohibited public source reference ${pattern}`);
    for(const match of text.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g)){
      const specifier=match[1];
      if(!specifier.startsWith('.'))continue;
      if(file.startsWith('apps/public-terminal/src')&&!ALLOWED_PORTAL_IMPORTS.some((pattern)=>pattern.test(specifier))&&!specifier.startsWith('./'))fail(`${file} imports non-allowlisted portal module ${specifier}`);
      if(file.startsWith('apps/web/src/public')&&!ALLOWED_PORTAL_IMPORTS.some((pattern)=>pattern.test(specifier))&&!specifier.startsWith('./'))fail(`${file} imports non-allowlisted portal module ${specifier}`);
    }
  }
}
const config=readFileSync('apps/web/vite.public.config.ts','utf8');
for(const seam of ['src/api/client','src/auth/AuthContext','src/auth/access','src/privacy/privacy','src/workspaces/trading/TvWidget'])if(!config.includes(seam))fail(`public build is missing adapter seam ${seam}`);
if(!config.includes('sourcemap:false'))fail('public build must keep source maps disabled');
const dist='apps/public-terminal/dist';
if(existsSync(dist))for(const file of walk(dist).filter((item)=>/\.(js|css|html|json)$/.test(item))){const text=readFileSync(file,'utf8');for(const pattern of PROHIBITED_BUNDLE)if(pattern.test(text))fail(`${file} contains prohibited bundle reference ${pattern}`)}
if(failures)process.exit(1);
console.log('Public React import allowlist and built-bundle denylist passed.');
