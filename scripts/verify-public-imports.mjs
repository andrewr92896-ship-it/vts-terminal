#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ENTRY='apps/public-terminal/src/main.tsx';
const PUBLIC_DIRS=['apps/public-terminal/src','apps/web/src/public'];
const ALLOWED_PORTAL_IMPORTS=[
  /^\.\.\/\.\.\/web\/src\/styles\/global\.css$/,
  /^\.\.\/\.\.\/web\/src\/public\/PublicApp$/,
  /^\.\.\/\.\.\/\.\.\/web\/src\/public\/PublicRuntime$/,
  // MyTerminalCustomizer + theme/myTerminal are the customizable My Terminal
  // workspace, shared with the private terminal deliberately: one set of rules
  // over two navs (the public shell passes its own allowlist), because two
  // copies is how the shells come to disagree about what "customized" means.
  // Neither reaches a service or names a private capability — the customizer is
  // a list editor, and myTerminal.ts is pure functions over whatever nav it is
  // handed.
  /^\.\.\/(components\/(Icon|Clock|MyTerminalCustomizer)|theme\/(tokens|themes|myTerminal)|workspaces\/trading\/(MarketData|CalendarTile|NewsTile|WatchlistTile|ChartTile|TvWidget)|api\/types)$/,
  /^\.\.\/(hooks\/useNowTick|lib\/timezone|workspaces\/trading\/(etClock|tvChart)|workspaces\/trading\/tiles\/TileFrame)$/,
  /^\.\/((Public(App|ClockTile|LiveWall|Login|Runtime|Sidebar|TopBar|Screens|AccountPages)|publicNav))$/,
  /^\.\.\/demo\/demo(Store|Seed)$/,
  /^\.\/demo(Seed|Store|Questions)$/,
  /^\.\.\/(api\/client|auth\/AuthContext|theme\/(tokens|themes))$/,
  /^\.\.\/workspaces\/(trading\/(MarketData|TradeLog|FundedScreen|DeletedTrades|TradingTodo|MarketNews|notesFormat)|news\/GeneralNews|studies\/(StudyCreation|StudyLibrary|StudyGameHub|FlashcardsHub|StudyGuides)|help\/(HelpScreens|LegalScreens)|myportal\/(Preferences|NetWorth)|finances\/Budget|investments)$/,

];
const PROHIBITED_SOURCE=[/AdminTerminal/i,/DeveloperTerminal/i,/FounderTrade/i,/OrderTicket/i,/TradeDesk/i,/BrokerConnections/i,/Pushover/i,/TeamChat/i];
// The bundle is MINIFIED, so a proximity match like /broker.{0,8}key/ fires on
// two unrelated tokens that minification happened to push together — the manual
// trade form's `{key:'',label:'No broker'},{key:'oanda'}` reads as "broker...key"
// and is not a credential at all. So each pattern below matches the PHRASE, with
// only word separators allowed between its halves: it still catches `brokerKey`,
// `BROKER_TOKEN` and "it places live orders", and no longer cries wolf on an
// object literal. A guard that fails on unrelated code is one people learn to
// widen until it catches nothing.
const SEP='[\\s_-]{0,3}';
const PROHIBITED_BUNDLE=[
  /vts_portal_session/i,
  /portal\.vitalistradingsystems\.com/i,
  /\/api\/(admin|dev|brokers|trade-desk|founder|teams|chat|pushover)/i,
  /plac(e|es|ed|ing)\s+(a\s+|an\s+|the\s+|live\s+|real\s+|market\s+)*orders?\b/i,
  new RegExp(`broker${SEP}(api${SEP})?(key|token|secret|credential)`,'i'),
  new RegExp(`(oanda|kraken|tradestation)${SEP}(api${SEP})?(key|token|secret)`,'i'),
  new RegExp(`founder${SEP}trade`,'i'),
  new RegExp(`strategy${SEP}bias`,'i'),
  // The PRIVATE NAV, by the labels only it carries. These leaked once, and they
  // leaked the way this kind of thing always will: a module shared between the
  // two terminals (theme/myTerminal.ts) imported one small thing out of
  // theme/nav.ts and brought the entire array with it, so five private section
  // names were readable in the public JavaScript while no public screen could
  // reach any of them. The fix was theme/navGates.ts; this is what keeps it
  // fixed. Each string appears in the private nav and nowhere a public screen
  // would legitimately print it.
  // Matched as a NAV LABEL rather than as loose prose: "Market hours, strategy
  // sessions and the Fed schedule stay on Eastern Time" is a real sentence on
  // the Preferences screen, and a guard that fails on it is one people widen
  // until it catches nothing.
  ...['Developer Terminal','Admin Terminal','Strategy Sessions','Live Trades','Funded Trades','Alert Settings']
    .map((name)=>new RegExp(`label\\s*:\\s*["']${name}["']`,'i')),
];
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
for(const seam of ['src/api/client','src/auth/AuthContext','src/auth/access','src/privacy/privacy','src/legal/content','src/meta/version','src/help/tutorials','src/auth/reviewMarks'])if(!config.includes(seam))fail(`public build is missing adapter seam ${seam}`);
if(!config.includes('sourcemap:false'))fail('public build must keep source maps disabled');
const dist='apps/public-terminal/dist';
if(existsSync(dist))for(const file of walk(dist).filter((item)=>/\.(js|css|html|json)$/.test(item))){const text=readFileSync(file,'utf8');for(const pattern of PROHIBITED_BUNDLE)if(pattern.test(text))fail(`${file} contains prohibited bundle reference ${pattern}`)}
if(failures)process.exit(1);
console.log('Public React import allowlist and built-bundle denylist passed.');
