/**
 * ST-54 · Log in with number and password.
 * AC2 Correct details give a session; wrong details give one message that does not say
 *     which field was wrong.
 * AC3 After 5 wrong tries, login is locked for 15 minutes for that number.
 * The lockout itself is tested in supabase/tests/90_login.test.sql; here we test that the
 * function uses it correctly and never passes the real password to Supabase Auth.
 */
import { deepStrictEqual as assertEquals, ok as assert } from 'node:assert/strict';
import { createPublicHandler, type LogEntry } from '../_shared/handler.ts';
import { derivePassword, lockoutKey } from '../_shared/password.ts';
import { loginSpec, type LoginDeps } from './login.ts';

const PEPPER = 'z'.repeat(48);
const SESSION = {
  access_token: 'at',
  refresh_token: 'rt',
  expires_in: 3600,
  expires_at: 1_900_000_000,
};

function fake(overrides: Partial<LoginDeps> = {}) {
  const calls = {
    guard: [] as Array<[string, string]>,
    result: [] as Array<[string, boolean]>,
    grant: [] as Array<[string, string]>,
  };
  const deps: LoginDeps = {
    pepper: PEPPER,
    guard: (n, ip) => {
      calls.guard.push([n, ip]);
      return Promise.resolve('ok');
    },
    result: (n, ok) => {
      calls.result.push([n, ok]);
      return Promise.resolve(ok ? 'ok' : 'failed');
    },
    passwordGrant: (phone, password) => {
      calls.grant.push([phone, password]);
      return Promise.resolve({ kind: 'invalid' });
    },
    ...overrides,
  };
  return { deps, calls };
}

async function login(deps: LoginDeps, body: unknown, ip = '203.0.113.9') {
  const logs: LogEntry[] = [];
  const handler = createPublicHandler(loginSpec(deps), {
    log: (e) => logs.push(e),
    requestId: () => 'req',
  });
  const res = await handler(
    new Request('http://localhost/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json(), logs };
}

Deno.test('correct details return a session and clear the counter', async () => {
  const { deps, calls } = fake({
    passwordGrant: (phone, password) => {
      calls.grant.push([phone, password]);
      return Promise.resolve({ kind: 'ok', session: SESSION });
    },
  });
  const r = await login(deps, { phone: '077 000 0001', password: 'physics26' });
  assertEquals(r.status, 200);
  assertEquals(r.body, SESSION);
  assertEquals(calls.result, [[await lockoutKey(PEPPER, 'number', '+94770000001'), true]]);
});

Deno.test('Supabase Auth gets the derived password, never the real one', async () => {
  const { deps, calls } = fake();
  await login(deps, { phone: '0770000001', password: 'physics26' });
  assertEquals(calls.grant, [
    ['+94770000001', await derivePassword(PEPPER, '+94770000001', 'physics26')],
  ]);
  assert(!JSON.stringify(calls).includes('physics26'));
});

Deno.test('a wrong password and an unknown number give the same answer', async () => {
  const { deps, calls } = fake();
  const wrong = await login(deps, { phone: '0770000001', password: 'wrong123' });
  const unknown = await login(deps, { phone: '0779999999', password: 'physics26' });
  assertEquals(wrong.status, 401);
  assertEquals(wrong.body, { error: { code: 'invalid_credentials' } });
  assertEquals(unknown.body, wrong.body);
  assertEquals(
    calls.result.map(([, ok]) => ok),
    [false, false],
    'both count as wrong tries',
  );
});

Deno.test('the try that reaches the limit says the number is now locked', async () => {
  const { deps } = fake({ result: () => Promise.resolve('locked') });
  const r = await login(deps, { phone: '0770000001', password: 'wrong123' });
  assertEquals(r.status, 429);
  assertEquals(r.body, { error: { code: 'login_locked' } });
});

Deno.test('a locked number is refused without checking the password', async () => {
  const { deps, calls } = fake({ guard: () => Promise.resolve('locked') });
  const r = await login(deps, { phone: '0770000001', password: 'physics26' });
  assertEquals(r.body, { error: { code: 'login_locked' } });
  assertEquals(calls.grant, []);
  assertEquals(calls.result, []);
});

Deno.test('too many tries from one IP are rate limited', async () => {
  const { deps, calls } = fake({ guard: () => Promise.resolve('ip_limited') });
  const r = await login(deps, { phone: '0770000001', password: 'physics26' });
  assertEquals(r.status, 429);
  assertEquals(r.body, { error: { code: 'rate_limited' } });
  assertEquals(calls.grant, []);
});

Deno.test('lockout keys are HMACs, never the phone number or IP', async () => {
  const { deps, calls } = fake();
  await login(deps, { phone: '0770000001', password: 'x1234567' }, '198.51.100.4');
  const [numberKey, ipKey] = calls.guard[0] ?? [];
  assertEquals(numberKey, await lockoutKey(PEPPER, 'number', '+94770000001'));
  assertEquals(ipKey, await lockoutKey(PEPPER, 'ip', '198.51.100.4'));
});

Deno.test('a number that is not a Sri Lankan mobile is invalid input', async () => {
  const { deps, calls } = fake();
  assertEquals((await login(deps, { phone: '12345', password: 'physics26' })).status, 400);
  assertEquals((await login(deps, { phone: '0770000001' })).status, 400);
  assertEquals((await login(deps, { phone: '0770000001', password: '' })).status, 400);
  assertEquals((await login(deps, { phone: '0770000001', password: 'p'.repeat(200) })).status, 400);
  assertEquals(calls.guard, []);
});

Deno.test('an Auth outage is an internal error and does not count as a wrong try', async () => {
  const { deps, calls } = fake({ passwordGrant: () => Promise.resolve({ kind: 'error' }) });
  const r = await login(deps, { phone: '0770000001', password: 'physics26' });
  assertEquals(r.body, { error: { code: 'internal' } });
  assertEquals(calls.result, []);
});

Deno.test('logs never hold the phone number, password or tokens', async () => {
  const { deps } = fake({
    passwordGrant: () => Promise.resolve({ kind: 'ok', session: SESSION }),
  });
  const ok = await login(deps, { phone: '0770000001', password: 'physics26' });
  const bad = await login(fake().deps, { phone: '0770000001', password: 'physics26' });
  const text = JSON.stringify([...ok.logs, ...bad.logs]);
  for (const secret of ['0770000001', '770000001', 'physics26', '"at"', '"rt"']) {
    assert(!text.includes(secret), `log must not contain ${secret}`);
  }
});
