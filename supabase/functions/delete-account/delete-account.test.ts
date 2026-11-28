/**
 * ST-57 · Delete my account.
 * AC1 asks for my password to confirm.
 * AC2 personal data is removed; payment records the law requires are kept separately,
 *     without study data (supabase/tests/99_delete_account.test.sql).
 */
import { deepStrictEqual as assertEquals, ok as assert } from 'node:assert/strict';
import { createHandler, type AuthUser, type Deps, type LogEntry } from '../_shared/handler.ts';
import { derivePassword } from '../_shared/password.ts';
import { deleteAccountSpec, type DeleteAccountDeps } from './delete-account.ts';

const PEPPER = 'd'.repeat(48);
const USER: AuthUser = { id: '11111111-1111-4111-8111-111111111111', phone: '+94771111111' };

function fake(overrides: Partial<DeleteAccountDeps> = {}) {
  const calls = { steps: [] as string[] };
  const deps: DeleteAccountDeps = {
    pepper: PEPPER,
    passwordMatches: async (_id, pw) =>
      pw === (await derivePassword(PEPPER, USER.phone!, 'physics26')),
    prepareDeletion: (id) => {
      calls.steps.push(`prepare:${id}`);
      return Promise.resolve();
    },
    deleteAuthUser: (id) => {
      calls.steps.push(`delete:${id}`);
      return Promise.resolve();
    },
    ...overrides,
  };
  return { deps, calls };
}

async function call(deps: DeleteAccountDeps, body: unknown, rateOk = true) {
  const logs: LogEntry[] = [];
  const base: Deps = {
    verifyToken: (t) => Promise.resolve(t === 'good' ? USER : null),
    rateLimit: () => Promise.resolve(rateOk),
    isPremium: () => Promise.resolve(false),
    log: (e) => logs.push(e),
    requestId: () => 'r',
  };
  const res = await createHandler(
    deleteAccountSpec(deps),
    base,
  )(
    new Request('http://localhost/delete-account', {
      method: 'POST',
      headers: { authorization: 'Bearer good' },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json(), logs };
}

Deno.test(
  'with the right password the payments are set aside, then the account is deleted',
  async () => {
    const { deps, calls } = fake();
    const r = await call(deps, { password: 'physics26' });
    assertEquals(r.body, { ok: true });
    assertEquals(calls.steps, [`prepare:${USER.id}`, `delete:${USER.id}`]);
  },
);

Deno.test('a wrong password deletes nothing', async () => {
  const { deps, calls } = fake();
  const r = await call(deps, { password: 'guess1234' });
  assertEquals(r.status, 401);
  assertEquals(r.body, { error: { code: 'invalid_credentials' } });
  assertEquals(calls.steps, []);
});

Deno.test('guessing the password is limited (5 tries in 15 minutes)', async () => {
  const { deps, calls } = fake();
  assertEquals((await call(deps, { password: 'physics26' }, false)).status, 429);
  assertEquals(calls.steps, []);
});

Deno.test('if keeping the payment records fails, the account is not deleted', async () => {
  const { deps, calls } = fake({ prepareDeletion: () => Promise.reject(new Error('internal')) });
  assertEquals((await call(deps, { password: 'physics26' })).status, 500);
  assertEquals(calls.steps, []);
});

Deno.test('a password is required and never logged', async () => {
  const { deps } = fake();
  assertEquals((await call(deps, {})).status, 400);
  const r = await call(deps, { password: 'physics26' });
  assert(!JSON.stringify(r.logs).includes('physics26'));
});
