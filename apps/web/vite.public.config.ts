import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const webRoot=path.dirname(fileURLToPath(import.meta.url));
const repoRoot=path.resolve(webRoot,'../..');
const publicRoot=path.join(repoRoot,'apps/public-terminal');
const adapters=path.join(publicRoot,'src/adapters');
const normalize=(value:string)=>value.replace(/\.(tsx?|jsx?)$/,'');
const replacements=new Map([
  [normalize(path.join(webRoot,'src/api/client')),path.join(adapters,'publicApi.ts')],
  [normalize(path.join(webRoot,'src/auth/AuthContext')),path.join(adapters,'publicAuth.ts')],
  [normalize(path.join(webRoot,'src/auth/access')),path.join(adapters,'publicAccess.ts')],
  [normalize(path.join(webRoot,'src/privacy/privacy')),path.join(adapters,'publicPrivacy.ts')],
  [normalize(path.join(webRoot,'src/legal/content')),path.join(adapters,'publicLegal.ts')],
  [normalize(path.join(webRoot,'src/workspaces/trading/TvWidget')),path.join(adapters,'FixtureTvWidget.tsx')],
]);
function publicBoundaryAliases():Plugin{return{name:'vts-public-boundary-aliases',enforce:'pre',resolveId(source,importer){if(!importer||!source.startsWith('.'))return null;const resolved=normalize(path.resolve(path.dirname(importer.split('?')[0]),source));return replacements.get(resolved)??null;},load(id){const clean=normalize(id.split('?')[0]);if(clean===normalize(path.join(webRoot,'src/legal/content')))return readFileSync(path.join(adapters,'publicLegal.ts'),'utf8');return null;}}}

export default defineConfig({root:publicRoot,plugins:[publicBoundaryAliases(),react()],resolve:{alias:[{find:new RegExp('/src/legal/content(?:\\.ts)?$'),replacement:path.join(adapters,'publicLegal.ts')}]},publicDir:path.join(publicRoot,'public'),build:{outDir:path.join(publicRoot,'dist'),emptyOutDir:true,sourcemap:false},server:{host:'127.0.0.1',port:4173}});
