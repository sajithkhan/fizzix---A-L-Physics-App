/**
 * ST-55 AC2 · the OTP goes only to a number that has an account; resend after 45 seconds and
 * at most 3 per hour (Supabase Auth max_frequency and the SMS hook, see 95_password_reset).
 */
import { deepStrictEqual as assertEquals, ok as assert } from 'node:assert/strict';
import { createPublicHandler, type LogEntry } from '../_shared/handler.ts';
import { lockoutKey } from '../_shared/password.ts';
import { resetRequestSpec, type ResetRequestDeps, type SendOtpResult } from './reset-request.ts';

const PEPPER = 'r'.repeat(48);

function fake(outcome = 'ok', sent: SendOtpResult = 'ok') {
  const calls = { request: [] as Array<[string, string]>, send: [] as string[] };
  const deps: ResetRequestDeps = {
    pepper: PEPPER,
    resetRequest: (phone, ip) => {
      calls.request.push([phone, ip]);
      return Promise.resolve(outcome);
    },
    sendOtp: (phone) => {
      calls.send.push(phone);
      return Promise.resolve(sent);
    },
  };
  return { deps, calls };
}

async function call(deps: ResetRequestDeps, body: unknown) {
  const logs: LogEntry[] = [];
  const res = await createPublicHandler(resetRequestSpec(deps), {
    log: (e) => logs.push(e),
    requestId: () => 'r',
  })(
    new Request('http://localhost/reset-request', {
      method: 'POST',
      headers: { 'x-forwarded-for': '198.51.100.7' },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json(), logs };
}

Deno.test('a registered number gets an intent, then the OTP', async () => {
  const { deps, calls } = fake();
  const r = await call(deps, { phone: '077 111 1111' });
  assertEquals(r.body, { ok: true });
  assertEquals(calls.request, [['94771111111', await lockoutKey(PEPPER, 'ip', '198.51.100.7')]]);
  assertEquals(calls.send, ['94771111111']);
});

Deno.test('a number without an account is told so and no OTP is sent', async () => {
  const { deps, calls } = fake('not_registered');
  const r = await call(deps, { phone: '0779999999' });
  assertEquals(r.status, 404);
  assertEquals(r.body, { error: { code: 'not_registered' } });
  assertEquals(calls.send, []);
});

Deno.test('too many requests from one IP are refused before anything else', async () => {
  const { deps, calls } = fake('ip_limited');
  assertEquals((await call(deps, { phone: '0771111111' })).body, {
    error: { code: 'rate_limited' },
  });
  assertEquals(calls.send, []);
});

Deno.test('the hourly limit and the 45-second wait come back as their own codes', async () => {
  assertEquals((await call(fake('ok', 'otp_rate_limited').deps, { phone: '0771111111' })).body, {
    error: { code: 'otp_rate_limited' },
  });
  assertEquals((await call(fake('ok', 'otp_resend_wait').deps, { phone: '0771111111' })).body, {
    error: { code: 'otp_resend_wait' },
  });
  assertEquals(
    (await call(fake('ok', 'sms_unavailable').deps, { phone: '0771111111' })).status,
    503,
  );
});

Deno.test(
  'a number that is not a Sri Lankan mobile is refused without touching the database',
  async () => {
    const { deps, calls } = fake();
    assertEquals((await call(deps, { phone: '12345' })).body, {
      error: { code: 'phone_not_supported' },
    });
    assertEquals((await call(deps, { phone: '0771111111', extra: 1 })).status, 400);
    assertEquals(calls.request, []);
  },
);

Deno.test('logs never hold the phone number', async () => {
  const r = await call(fake().deps, { phone: '0771111111' });
  assert(!JSON.stringify(r.logs).includes('771111111'));
});
