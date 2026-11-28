import { deepStrictEqual as assertEquals } from 'node:assert/strict';
import { hasFreshOtp, tokenAmr } from './jwt.ts';

function token(payload: unknown): string {
  const b64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${b64}.signature`;
}

Deno.test('reads the amr claim from a token', () => {
  assertEquals(tokenAmr(token({ amr: [{ method: 'otp', timestamp: 100 }] })), [
    { method: 'otp', timestamp: 100 },
  ]);
  assertEquals(tokenAmr(token({ sub: 'x' })), undefined);
  assertEquals(tokenAmr('not-a-jwt'), undefined);
  assertEquals(tokenAmr(token({ amr: [{ method: 1 }, { method: 'password', timestamp: 5 }] })), [
    { method: 'password', timestamp: 5 },
  ]);
});

Deno.test('a fresh OTP means an OTP sign-in within the window', () => {
  const now = 10_000;
  assertEquals(hasFreshOtp([{ method: 'otp', timestamp: now - 60 }], now, 600), true);
  assertEquals(hasFreshOtp([{ method: 'otp', timestamp: now - 601 }], now, 600), false);
  assertEquals(hasFreshOtp([{ method: 'password', timestamp: now }], now, 600), false);
  assertEquals(hasFreshOtp(undefined, now, 600), false);
});
