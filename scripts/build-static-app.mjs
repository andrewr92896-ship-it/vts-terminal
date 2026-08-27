#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const appRoot = process.argv[2];
if (!appRoot) {
  console.error('Usage: node scripts/build-static-app.mjs <app-root>');
  process.exit(1);
}

const source = path.resolve(appRoot, 'src');
const output = path.resolve(appRoot, 'dist');
const entry = path.join(source, 'index.html');
if (!existsSync(entry)) {
  console.error(`Missing ${entry}`);
  process.exit(1);
}

function validatedPublicAppOrigin(raw) {
  if (!raw) throw new Error('PUBLIC_APP_ORIGIN is required for the marketing build (fail-closed).');
  if (raw !== raw.trim()) throw new Error('PUBLIC_APP_ORIGIN must not contain surrounding whitespace.');

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('PUBLIC_APP_ORIGIN must be a valid canonical HTTPS origin.');
  }

  if (url.protocol !== 'https:') throw new Error('PUBLIC_APP_ORIGIN must use HTTPS.');
  if (url.username || url.password) throw new Error('PUBLIC_APP_ORIGIN must not contain credentials.');
  if (url.search || url.hash) throw new Error('PUBLIC_APP_ORIGIN must not contain a query or fragment.');
  if (url.pathname !== '/') throw new Error('PUBLIC_APP_ORIGIN must not contain a non-root path.');
  if (url.port) throw new Error('PUBLIC_APP_ORIGIN must not contain an explicit port.');
  if (url.origin !== raw) throw new Error('PUBLIC_APP_ORIGIN must be a canonical origin without a trailing slash.');

  const hostname = url.hostname.toLowerCase();
  const privatePortal = hostname === 'portal.vitalistradingsystems.com'
    || hostname.endsWith('.portal.vitalistradingsystems.com');
  if (privatePortal) throw new Error('PUBLIC_APP_ORIGIN must not target the private portal.');

  const isPublicProduction = hostname === 'app.vitalistradingsystems.com';
  const isRailwayStaging = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.up\.railway\.app$/.test(hostname);
  if (!isPublicProduction && !isRailwayStaging) {
    throw new Error('PUBLIC_APP_ORIGIN must target the public production app or a disposable Railway HTTPS origin.');
  }

  return url.origin;
}

function escapeHtmlAttribute(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(source, output, { recursive: true });

if (path.basename(path.resolve(appRoot)) === 'marketing') {
  let publicAppOrigin;
  try {
    publicAppOrigin = validatedPublicAppOrigin(process.env.PUBLIC_APP_ORIGIN);
  } catch (error) {
    rmSync(output, { recursive: true, force: true });
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const outputEntry = path.join(output, 'index.html');
  const html = readFileSync(outputEntry, 'utf8');
  const placeholder = '%%PUBLIC_APP_ORIGIN%%';
  const occurrences = html.split(placeholder).length - 1;
  if (occurrences !== 1) {
    rmSync(output, { recursive: true, force: true });
    console.error(`Marketing entry must contain exactly one ${placeholder} placeholder.`);
    process.exit(1);
  }
  writeFileSync(outputEntry, html.replace(placeholder, escapeHtmlAttribute(publicAppOrigin)));
}

console.log(`Built ${appRoot} -> ${output}`);
