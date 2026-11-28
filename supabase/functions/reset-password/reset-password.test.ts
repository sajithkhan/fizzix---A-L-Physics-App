/**
 * ST-55 AC3 · after saving, every session is signed out and the student logs in with the new
 * password. Only a fresh OTP session inside an open reset window may set it.
 */
import { deepStrictEqual as assertEquals, ok as assert } from 'node:assert/strict';
import { createHandler, type AuthUser, type Deps, type LogEntry } from '../_shared/handler.ts';
import { derivePassword, lockoutKey } from '../_shared/password.ts';
import { OTP_MAX_AGE, resetPasswordSpec, type ResetPasswordDeps } from './reset-password.ts';

const PEPPER = 'q'.repeat(48);
const NOW = 2_000_000_000;
const OTP_USER: AuthUser = {
  id: '11111111-1111-4111-8111-111111111111',
  phone: '+94771111111',
  amr: [{ method: 'otp', timestamp: NOW - 30 }],
};

function fake(overrides: Partial<ResetPasswordDeps> = {}) {
  const calls = {
    set: [] as Array<[string, string]>,
    finished: [] as string[],
    unlock: [] as string[],
    signOut: [] as string[],
  };
  const deps: ResetPasswordDeps = {
    pepper: PEPPER,
    nowSeconds: () => NOW,
    resetAllowed: () => Promise.resolve(true),
    setAuthPassword: (id, pw) => {
      calls.set.push([id, pw]);
      return Promise.resolve('ok');
    },
    resetFinished: (id) => {
      calls.finished.push(id);
      return Promise.resolve();
    },
    clearLoginLock: (key) => {
      calls.unlock.push(key);
      return Promise.resolve();
    },
    signOutEverywhere: (token) => {
      calls.signOut.push(token);
      return Promise.resolve();
    },
    ...overrides,
  };
  return { deps, calls };
}

async function call(deps: ResetPasswordDeps, body: unknown, user: AuthUser = OTP_USER) {
  const logs: LogEntry[] = [];
  const base: Deps = {
    verifyToken: (t) => Promise.resolve(t === 'otp-session' ? user : null),
    rateLimit: () => Promise.resolve(true),
    isPremium: () => Promise.resolve(false),
    log: (e) => logs.push(e),
    requestId: () => 'r',
  };
  const res = await createHandler(
    resetPasswordSpec(deps),
    base,
  )(
    new Request('http://localhost/reset-password', {
      method: 'POST',
      headers: { authorization: 'Bearer otp-session' },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json(), logs };
}

Deno.test(
  'saves the derived password, closes the window, lifts the lock, signs out everywhere',
  async () => {
    const { deps, calls } = fake();
    const r = await call(deps, { password: 'newphys27' });
    assertEquals(r.body, { ok: true });
    assertEquals(calls.set, [
      [OTP_USER.id, await derivePassword(PEPPER, '+94771111111', 'newphys27')],
    ]);
    assertEquals(calls.finished, [OTP_USER.id]);
    assertEquals(calls.unlock, [await lockoutKey(PEPPER, 'number', '+94771111111')]);
    assertEquals(calls.signOut, ['otp-session']);
  },
);

Deno.test('a password session cannot use reset (it needs a fresh OTP)', async () => {
  const { deps, calls } = fake();
  const passwordUser = { ...OTP_USER, amr: [{ method: 'password', timestamp: NOW }] };
  const r = await call(deps, { password: 'newphys27' }, passwordUser);
  assertEquals(r.status, 403);
  assertEquals(r.body, { error: { code: 'reset_not_allowed' } });
  assertEquals(calls.set, []);
});

Deno.test('an OTP older than 10 minutes is not enough', async () => {
  const { deps, calls } = fake();
  const old = { ...OTP_USER, amr: [{ method: 'otp', timestamp: NOW - OTP_MAX_AGE - 1 }] };
  assertEquals((await call(deps, { password: 'newphys27' }, old)).body, {
    error: { code: 'reset_not_allowed' },
  });
  assertEquals(calls.set, []);
});

Deno.test('without an open reset window (no reset requested) nothing changes', async () => {
  const { deps, calls } = fake({ resetAllowed: () => Promise.resolve(false) });
  assertEquals((await call(deps, { password: 'newphys27' })).status, 403);
  assertEquals(calls.set, []);
  assertEquals(calls.signOut, []);
});

Deno.test('the new password follows the sign-up rules', async () => {
  const { deps, calls } = fake();
  for (const pw of ['short1', '12345678', 'lettersonly']) {
    assertEquals((await call(deps, { password: pw })).body, { error: { code: 'weak_password' } });
  }
  assertEquals(calls.set, []);
});

Deno.test('if Auth cannot save it, nobody is signed out and the window stays open', async () => {
  const { deps, calls } = fake({ setAuthPassword: () => Promise.resolve('error') });
  assertEquals((await call(deps, { password: 'newphys27' })).status, 500);
  assertEquals(calls.finished, []);
  assertEquals(calls.signOut, []);
});

Deno.test('the password and token never reach the logs', async () => {
  const r = await call(fake().deps, { password: 'newphys27' });
  const text = JSON.stringify(r.logs);
  assert(!text.includes('newphys27') && !text.includes('otp-session'));
});
