import assert from 'node:assert/strict';
import {
  generateLoginOtp,
  hashLoginOtp,
  loginOtpMatches,
  maskLoginEmail,
  loginChallengeCookieOptions,
  terminalDeviceCookieOptions,
} from './twoFactor.js';

for (let i = 0; i < 100; i += 1) {
  assert.match(generateLoginOtp(), /^\d{6}$/);
}

const hash = hashLoginOtp('123456');
assert.equal(hash.length, 64);
assert.equal(loginOtpMatches(hash, '123456'), true);
assert.equal(loginOtpMatches(hash, '123457'), false);
assert.equal(loginOtpMatches(hash, '12 34-56'), true);

assert.equal(maskLoginEmail('moody@vitalistradingsystems.com'), 'mo•••@vitalistradingsystems.com');
assert.equal(maskLoginEmail('a@example.com'), 'a•••@example.com');
assert.equal(maskLoginEmail('not-an-email'), 'your email');

const challenge = loginChallengeCookieOptions(600);
assert.equal(challenge.httpOnly, true);
assert.equal(challenge.sameSite, 'lax');
assert.equal(challenge.maxAge, 600);

const device = terminalDeviceCookieOptions(30 * 24 * 60 * 60);
assert.equal(device.httpOnly, true);
assert.equal(device.sameSite, 'strict');

console.log('terminal email two-factor checks passed');
