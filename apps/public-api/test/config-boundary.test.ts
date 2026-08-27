import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPublicConfig, PUBLIC_ENV_NAMES } from '../src/config.js';

const valid={PUBLIC_DATABASE_URL:'postgres://public-only',PUBLIC_SESSION_SIGNING_KEY:'s'.repeat(32),PUBLIC_CHALLENGE_PEPPER:'c'.repeat(32),PUBLIC_TRUSTED_DEVICE_SIGNING_KEY:'t'.repeat(32),PUBLIC_ALLOWED_ORIGINS:'https://public.example.com',PUBLIC_COOKIE_SECURE:'true',PUBLIC_MAIL_FROM:'public@example.com',PUBLIC_SMTP_URL:'smtps://mail.example.com'};
test('configuration fails closed and never falls back to private names',()=>{assert.throws(()=>loadPublicConfig({DATABASE_URL:'postgres://private',SESSION_SECRET:'private',...Object.fromEntries(Object.entries(valid).filter(([k])=>k!=='PUBLIC_DATABASE_URL'))}),/PUBLIC_DATABASE_URL/);assert.throws(()=>loadPublicConfig({...valid,PUBLIC_COOKIE_SECURE:'false'}),/exactly true/);assert.equal(loadPublicConfig(valid).databaseUrl,'postgres://public-only')});
test('public environment allowlist contains no private credential names',()=>{for(const name of PUBLIC_ENV_NAMES)assert.match(name,/^PUBLIC_/);assert.equal(PUBLIC_ENV_NAMES.includes('DATABASE_URL' as never),false)});
