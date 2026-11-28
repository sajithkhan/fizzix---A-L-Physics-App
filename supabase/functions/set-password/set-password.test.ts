/**
 * ST-04 / ST-54 · setting the password at sign-up goes through the server, which stores only
 * the derived password in Supabase Auth (ADR-0009).
 */
import { deepStrictEqual as assertEquals, ok as assert } from 'node:assert/strict';
import { createHandler, type Deps, type LogEntry } from '../_shared/handler.ts';
import { derivePassword } from '../_shared/password.ts';
import { setPasswordSpec, type SetPasswordDeps } from './set-password.ts';

const PEPPER = 'k'.repeat(48);
const USER = { id: '11111111-1111-4111-8111-111111111111', phone: '+94770000003' };

const SESSION = { access_token: 'at', refresh_token: 'rt', expires_in: 3600, expires_at: 2 };

function fake(overrides: Partial<SetPasswordDeps> = {}) {
  const calls = { set: [] as Array<[string, string]>, grant: [] as Array<[string, string]> };
  const deps: SetPasswordDeps = {
    pepper: PEPPER,
    accountCompleted: () => Promise.resolve(false),
    setAuthPassword: (id, password) => {
      calls.set.push([id, password]);
      return Promise.resolve('ok');
    },
    passwordGrant: (phone, password) => {
      calls.grant.push([phone, password]);
      return Promise.resolve({ kind: 'ok', session: SESSION });
    },
    ...overrides,
  };
  return { deps, calls };
}

async function call(
  deps: SetPasswordDeps,
  body: unknown,
  user: typeof USER | { id: string } = USER,
) {
  const logs: LogEntry[] = [];
  const base: Deps = {
    verifyToken: (t) => Promise.resolve(t === 'good' ? user : null),
    rateLimit: () => Promise.resolve(true),
    isPremium: () => Promise.resolve(false),
    log: (e) => logs.push(e),
    requestId: () => 'req',
  };
  const res = await createHandler(
    setPasswordSpec(deps),
    base,
  )(
    new Request('http://localhost/set-password', {
      method: 'POST',
      headers: { authorization: 'Bearer good', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json(), logs };
}

Deno.test('stores the derived password and returns a fresh session for this phone', async () => {
  const { deps, calls } = fake();
  const r = await call(deps, { password: 'physics26' });
  assertEquals(r.status, 200);
  assertEquals(r.body, SESSION);
  const derived = await derivePassword(PEPPER, USER.phone, 'physics26');
  assertEquals(calls.set, [[USER.id, derived]]);
  // Auth ends the OTP session when the password is set, so the app needs this new one.
  assertEquals(calls.grant, [[USER.phone, derived]]);
});

Deno.test('if signing in with the new password fails, the step reports an error', async () => {
  const { deps } = fake({ passwordGrant: () => Promise.resolve({ kind: 'error' }) });
  assertEquals((await call(deps, { password: 'physics26' })).status, 500);
});

Deno.test('the server applies the password rules', async () => {
  const { deps, calls } = fake();
  for (const pw of ['phys26', '12345678', 'physicsss']) {
    const r = await call(deps, { password: pw });
    assertEquals(r.body, { error: { code: 'weak_password' } });
  }
  assertEquals(calls.set, []);
});

Deno.test('a finished account cannot change its password here (needs ST-55 / ST-56)', async () => {
  const { deps, calls } = fake({ accountCompleted: () => Promise.resolve(true) });
  const r = await call(deps, { password: 'physics26' });
  assertEquals(r.status, 409);
  assertEquals(r.body, { error: { code: 'account_already_completed' } });
  assertEquals(calls.set, []);
});

Deno.test('an account without a verified phone cannot set a password', async () => {
  const { deps } = fake();
  const r = await call(deps, { password: 'physics26' }, { id: USER.id });
  assertEquals(r.status, 401);
});

Deno.test('Auth refusing the password is reported as weak', async () => {
  const { deps } = fake({ setAuthPassword: () => Promise.resolve('weak') });
  assertEquals((await call(deps, { password: 'physics26' })).body, {
    error: { code: 'weak_password' },
  });
});

Deno.test('the password never reaches the logs', async () => {
  const { deps } = fake();
  const r = await call(deps, { password: 'physics26' });
  assert(!JSON.stringify(r.logs).includes('physics26'));
});
