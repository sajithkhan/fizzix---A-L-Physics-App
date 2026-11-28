/**
 * ST-56 · Change my password.
 * AC1 Settings › "Password மாற்று" asks for the current password and a new one twice.
 * AC2 No OTP is needed when I know my current password.
 */
import { deepStrictEqual as assertEquals, ok as assert } from 'node:assert/strict';
import { createHandler, type AuthUser, type Deps, type LogEntry } from '../_shared/handler.ts';
import { derivePassword, lockoutKey } from '../_shared/password.ts';
import { changePasswordSpec, type ChangePasswordDeps } from './change-password.ts';

const PEPPER = 'c'.repeat(48);
const USER: AuthUser = { id: '11111111-1111-4111-8111-111111111111', phone: '+94771111111' };
const SESSION = {
  access_token: 'new-at',
  refresh_token: 'new-rt',
  expires_in: 3600,
  expires_at: 2,
};

function fake(overrides: Partial<ChangePasswordDeps> = {}) {
  const calls = {
    match: [] as Array<[string, string]>,
    set: [] as Array<[string, string]>,
    unlock: [] as string[],
    grant: [] as Array<[string, string]>,
  };
  const deps: ChangePasswordDeps = {
    pepper: PEPPER,
    passwordMatches: async (id, pw) => {
      calls.match.push([id, pw]);
      return pw === (await derivePassword(PEPPER, USER.phone!, 'physics26'));
    },
    setAuthPassword: (id, pw) => {
      calls.set.push([id, pw]);
      return Promise.resolve('ok');
    },
    clearLoginLock: (key) => {
      calls.unlock.push(key);
      return Promise.resolve();
    },
    passwordGrant: (phone, pw) => {
      calls.grant.push([phone, pw]);
      return Promise.resolve({ kind: 'ok', session: SESSION });
    },
    ...overrides,
  };
  return { deps, calls };
}

async function call(deps: ChangePasswordDeps, body: unknown, rateOk = true) {
  const logs: LogEntry[] = [];
  const base: Deps = {
    verifyToken: (t) => Promise.resolve(t === 'good' ? USER : null),
    rateLimit: () => Promise.resolve(rateOk),
    isPremium: () => Promise.resolve(false),
    log: (e) => logs.push(e),
    requestId: () => 'r',
  };
  const res = await createHandler(
    changePasswordSpec(deps),
    base,
  )(
    new Request('http://localhost/change-password', {
      method: 'POST',
      headers: { authorization: 'Bearer good' },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json(), logs };
}

Deno.test(
  'with the right current password the new one is saved and this phone gets a fresh session',
  async () => {
    const { deps, calls } = fake();
    const r = await call(deps, { current: 'physics26', password: 'newphys27' });
    assertEquals(r.status, 200);
    assertEquals(r.body, SESSION);
    const next = await derivePassword(PEPPER, '+94771111111', 'newphys27');
    assertEquals(calls.set, [[USER.id, next]]);
    assertEquals(calls.grant, [['+94771111111', next]]);
    assertEquals(calls.unlock, [await lockoutKey(PEPPER, 'number', '+94771111111')]);
  },
);

Deno.test('a wrong current password changes nothing', async () => {
  const { deps, calls } = fake();
  const r = await call(deps, { current: 'guess1234', password: 'newphys27' });
  assertEquals(r.status, 401);
  assertEquals(r.body, { error: { code: 'invalid_credentials' } });
  assertEquals(calls.set, []);
});

Deno.test('the current password is checked in its derived form, never sent as typed', async () => {
  const { deps, calls } = fake();
  await call(deps, { current: 'physics26', password: 'newphys27' });
  assertEquals(calls.match, [[USER.id, await derivePassword(PEPPER, '+94771111111', 'physics26')]]);
  assert(!JSON.stringify(calls).includes('physics26'));
});

Deno.test(
  'the new password follows the sign-up rules and must differ from the current one',
  async () => {
    const { deps, calls } = fake();
    for (const pw of ['short1', '12345678', 'lettersonly']) {
      assertEquals((await call(deps, { current: 'physics26', password: pw })).body, {
        error: { code: 'weak_password' },
      });
    }
    assertEquals((await call(deps, { current: 'physics26', password: 'physics26' })).body, {
      error: { code: 'password_unchanged' },
    });
    assertEquals(calls.match, []);
  },
);

Deno.test('guessing the current password is limited (5 tries in 15 minutes)', async () => {
  const { deps, calls } = fake();
  const r = await call(deps, { current: 'physics26', password: 'newphys27' }, false);
  assertEquals(r.status, 429);
  assertEquals(calls.match, []);
});

Deno.test('passwords and tokens never reach the logs', async () => {
  const r = await call(fake().deps, { current: 'physics26', password: 'newphys27' });
  const text = JSON.stringify(r.logs);
  for (const s of ['physics26', 'newphys27', 'new-at', 'new-rt']) assert(!text.includes(s));
});
