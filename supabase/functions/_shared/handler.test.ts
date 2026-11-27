import { deepStrictEqual as assertEquals, ok as assert } from 'node:assert/strict';
import { z } from 'zod';
import { AppError, createHandler, MAX_BODY_BYTES, type Deps, type LogEntry } from './handler.ts';

const USER = { id: '11111111-1111-4111-8111-111111111111' };

function deps(overrides: Partial<Deps> = {}): Deps & { logs: LogEntry[] } {
  const logs: LogEntry[] = [];
  return {
    logs,
    verifyToken: (t) => Promise.resolve(t === 'good' ? USER : null),
    rateLimit: () => Promise.resolve(true),
    isPremium: () => Promise.resolve(false),
    log: (e) => logs.push(e),
    requestId: () => 'req-1',
    ...overrides,
  };
}

const spec = {
  name: 'echo',
  input: z.object({ n: z.number().int() }).strict(),
  output: z.object({ doubled: z.number() }).strict(),
  rateLimit: { max: 10, windowSeconds: 60 },
  work: (_ctx: unknown, input: { n: number }) => Promise.resolve({ doubled: input.n * 2 }),
};

function post(body: unknown, token: string | null = 'good'): Request {
  return new Request('http://localhost/echo', {
    method: 'POST',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'content-type': 'application/json',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function call(d: Deps, req: Request, s: typeof spec | Record<string, unknown> = spec) {
  // deno-lint-ignore no-explicit-any
  const res = await createHandler(s as any, d)(req);
  return { status: res.status, body: await res.json(), headers: res.headers };
}

Deno.test('happy path returns only the output fields', async () => {
  const r = await call(deps(), post({ n: 4 }));
  assertEquals(r.status, 200);
  assertEquals(r.body, { doubled: 8 });
  assertEquals(r.headers.get('cache-control'), 'no-store');
  assertEquals(r.headers.get('x-request-id'), 'req-1');
});

Deno.test('missing or bad token is 401', async () => {
  assertEquals((await call(deps(), post({ n: 1 }, null))).body, {
    error: { code: 'not_authenticated' },
  });
  assertEquals((await call(deps(), post({ n: 1 }, 'forged'))).status, 401);
});

Deno.test('token is checked before input is parsed', async () => {
  const r = await call(deps(), post('not json', null));
  assertEquals(r.status, 401);
});

Deno.test('invalid, extra or oversized input is 400', async () => {
  assertEquals((await call(deps(), post({ n: 'x' }))).status, 400);
  assertEquals((await call(deps(), post({ n: 1, premium: true }))).status, 400);
  assertEquals((await call(deps(), post('{bad'))).status, 400);
  assertEquals((await call(deps(), post({ n: 1, pad: 'x'.repeat(MAX_BODY_BYTES) }))).status, 400);
});

Deno.test('only POST is accepted', async () => {
  const r = await call(
    deps(),
    new Request('http://localhost/echo', {
      method: 'GET',
      headers: { authorization: 'Bearer good' },
    }),
  );
  assertEquals(r.status, 400);
});

Deno.test('rate limit is 429', async () => {
  const r = await call(deps({ rateLimit: () => Promise.resolve(false) }), post({ n: 1 }));
  assertEquals(r.body, { error: { code: 'rate_limited' } });
  assertEquals(r.status, 429);
});

Deno.test('premium-only functions refuse free users on the server', async () => {
  const premiumSpec = { ...spec, requiresPremium: true };
  assertEquals((await call(deps(), post({ n: 1 }), premiumSpec)).status, 402);
  assertEquals(
    (await call(deps({ isPremium: () => Promise.resolve(true) }), post({ n: 1 }), premiumSpec))
      .status,
    200,
  );
});

Deno.test('a leaked field in the output fails closed', async () => {
  const leaky = { ...spec, work: () => Promise.resolve({ doubled: 2, correct_option: 3 }) };
  const r = await call(deps(), post({ n: 1 }), leaky);
  assertEquals(r.status, 500);
  assertEquals(r.body, { error: { code: 'internal' } });
});

Deno.test('AppError and SQL-raised codes map to their status', async () => {
  const appErr = { ...spec, work: () => Promise.reject(new AppError('already_answered')) };
  assertEquals((await call(deps(), post({ n: 1 }), appErr)).status, 409);
  const sqlErr = { ...spec, work: () => Promise.reject({ message: 'daily_limit_reached' }) };
  assertEquals((await call(deps(), post({ n: 1 }), sqlErr)).body, {
    error: { code: 'daily_limit_reached' },
  });
});

Deno.test('unexpected errors never leak details', async () => {
  const boom = {
    ...spec,
    work: () => Promise.reject(new Error('relation "question_keys" does not exist at line 4')),
  };
  const r = await call(deps(), post({ n: 1 }), boom);
  assertEquals(r.status, 500);
  assertEquals(JSON.stringify(r.body), '{"error":{"code":"internal"}}');
});

Deno.test('logs carry ids and codes but never the token or body', async () => {
  const d = deps();
  await call(d, post({ n: 1 }, 'good'));
  await call(d, post({ n: 'x' }, 'good'));
  const text = JSON.stringify(d.logs);
  assert(!text.includes('good'), 'token must not be logged');
  assert(!text.includes('"n"'), 'request body must not be logged');
  assertEquals(d.logs[1]?.code, 'invalid_input');
  assertEquals(d.logs[1]?.user_id, USER.id);
});

// Public functions -------------------------------------------------------------------------------
import { createPublicHandler } from './handler.ts';

const publicSpec = {
  name: 'public-echo',
  input: z.object({ n: z.number().int() }).strict(),
  output: z.object({ doubled: z.number(), ip: z.string() }).strict(),
  work: (ctx: { clientIp: string }, input: { n: number }) =>
    Promise.resolve({ doubled: input.n * 2, ip: ctx.clientIp }),
};

async function callPublic(req: Request, s: Record<string, unknown> = publicSpec) {
  const logs: LogEntry[] = [];
  // deno-lint-ignore no-explicit-any
  const res = await createPublicHandler(s as any, {
    log: (e) => logs.push(e),
    requestId: () => 'r',
  })(req);
  return { status: res.status, body: await res.json(), logs };
}

Deno.test('public functions need no token and see the client IP', async () => {
  const r = await callPublic(
    new Request('http://localhost/x', {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
      body: JSON.stringify({ n: 2 }),
    }),
  );
  assertEquals(r.status, 200);
  assertEquals(r.body, { doubled: 4, ip: '203.0.113.7' });
});

Deno.test('public functions still validate input and output strictly', async () => {
  assertEquals((await callPublic(post({ n: 1, extra: true }, null))).status, 400);
  assertEquals((await callPublic(post('{bad', null))).status, 400);
  const leaky = { ...publicSpec, work: () => Promise.resolve({ doubled: 1, ip: 'x', token: 't' }) };
  assertEquals((await callPublic(post({ n: 1 }, null), leaky)).body, {
    error: { code: 'internal' },
  });
});

Deno.test('public functions map AppError codes and never leak details', async () => {
  const locked = { ...publicSpec, work: () => Promise.reject(new AppError('login_locked')) };
  const r = await callPublic(post({ n: 1 }, null), locked);
  assertEquals(r.status, 429);
  assertEquals(r.body, { error: { code: 'login_locked' } });
  const boom = { ...publicSpec, work: () => Promise.reject(new Error('secret detail')) };
  const b = await callPublic(post({ n: 1 }, null), boom);
  assertEquals(JSON.stringify(b.body), '{"error":{"code":"internal"}}');
  assert(!JSON.stringify(b.logs).includes('secret'));
});
