#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const appRoot = process.argv[2];
if (!appRoot) {
  console.error('Usage: node scripts/build-static-app.mjs <app-root>');
  process.exit(1);
}
const source = path.resolve(appRoot, 'src');
const output = path.resolve(appRoot, 'dist');
if (!existsSync(path.join(source, 'index.html'))) {
  console.error(`Missing ${path.join(source, 'index.html')}`);
  process.exit(1);
}
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(source, output, { recursive: true });
console.log(`Built ${appRoot} -> ${output}`);
