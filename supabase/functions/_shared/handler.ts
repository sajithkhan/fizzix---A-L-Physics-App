/**
 * The one request pipeline every Edge Function uses (see CLAUDE.md and ADR-0002):
 *
 *   method check → body size → verify token → validate input (zod) → rate limit
 *   → entitlement → work → validate output (strict, minimal fields) → respond
 *
 * Errors always come back as `{ error: { code } }` with a matching HTTP status.
 * No stack traces, SQL text or tokens ever reach the client or the logs.
 */
import type { z } from 'zod';
import { ERROR_STATUS, isErrorCode, type ErrorCode } from '@fizzix/shared';

export const MAX_BODY_BYTES = 64 * 1024;

export interface AuthUser {
  id: string;
  /** Verified phone, E.164 (+947…), when the account has one. */
  phone?: string;
}

export interface Deps {
  /** Verifies a Supabase access token and returns the user, or null if invalid/expired. */
  verifyToken(token: string): Promise<AuthUser | null>;
  /** Returns true if the call is allowed, false if the user is over the limit. */
  rateLimit(userId: string, action: string, max: number, windowSeconds: number): Promise<boolean>;
  /** Server-side entitlement check. Never trust a client flag. */
  isPremium(userId: string): Promise<boolean>;
  log(entry: LogEntry): void;
  now?(): number;
  requestId?(): string;
}

export interface LogEntry {
  fn: string;
  request_id: string;
  user_id?: string;
  status: number;
  code?: ErrorCode;
  ms: number;
}

export interface Context {
  user: AuthUser;
  premium: boolean;
  requestId: string;
}

export interface FunctionSpec<In extends z.ZodTypeAny, Out extends z.ZodTypeAny> {
  name: string;
  input: In;
  /** Strict schema for the response. Fields outside it fail the request instead of leaking. */
  output: Out;
  rateLimit: { max: number; windowSeconds: number };
  requiresPremium?: boolean;
  work(ctx: Context, input: z.output<In>): Promise<z.input<Out>>;
}

/** Throw from `work` to return a specific error code. */
export class AppError extends Error {
  constructor(public readonly code: ErrorCode) {
    super(code);
  }
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

function json(status: number, body: unknown, requestId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, 'x-request-id': requestId },
  });
}

function bearer(req: Request): string | null {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
}

async function readJson(req: Request): Promise<unknown | typeof TOO_LARGE | typeof BAD_JSON> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return TOO_LARGE;
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return TOO_LARGE;
  if (text.length === 0) return {};
  try {
    return JSON.parse(text);
  } catch {
    return BAD_JSON;
  }
}
const TOO_LARGE = Symbol('too_large');
const BAD_JSON = Symbol('bad_json');

export function createHandler<In extends z.ZodTypeAny, Out extends z.ZodTypeAny>(
  spec: FunctionSpec<In, Out>,
  deps: Deps,
): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => Date.now());
  const newId = deps.requestId ?? (() => crypto.randomUUID());

  return async (req) => {
    const started = now();
    const requestId = newId();
    let userId: string | undefined;

    const fail = (code: ErrorCode): Response => {
      const status = ERROR_STATUS[code];
      deps.log({
        fn: spec.name,
        request_id: requestId,
        ...(userId ? { user_id: userId } : {}),
        status,
        code,
        ms: now() - started,
      });
      return json(status, { error: { code } }, requestId);
    };

    try {
      if (req.method !== 'POST') return fail('invalid_input');

      const token = bearer(req);
      if (!token) return fail('not_authenticated');
      const user = await deps.verifyToken(token);
      if (!user) return fail('not_authenticated');
      userId = user.id;

      const body = await readJson(req);
      if (body === TOO_LARGE || body === BAD_JSON) return fail('invalid_input');
      const parsed = spec.input.safeParse(body);
      if (!parsed.success) return fail('invalid_input');

      const allowed = await deps.rateLimit(
        user.id,
        spec.name,
        spec.rateLimit.max,
        spec.rateLimit.windowSeconds,
      );
      if (!allowed) return fail('rate_limited');

      const premium = await deps.isPremium(user.id);
      if (spec.requiresPremium && !premium) return fail('premium_required');

      const result = await spec.work({ user, premium, requestId }, parsed.data);

      const out = spec.output.safeParse(result);
      if (!out.success) return fail('internal');

      deps.log({
        fn: spec.name,
        request_id: requestId,
        user_id: user.id,
        status: 200,
        ms: now() - started,
      });
      return json(200, out.data, requestId);
    } catch (err) {
      const code: ErrorCode =
        err instanceof AppError
          ? err.code
          : isErrorCode((err as { message?: unknown })?.message)
            ? ((err as Error).message as ErrorCode)
            : 'internal';
      return fail(code);
    }
  };
}

// ---------------------------------------------------------------------------------------------
// Public functions (no signed-in user yet, e.g. login)
// ---------------------------------------------------------------------------------------------

export interface PublicContext {
  requestId: string;
  /** First address in x-forwarded-for (set by the Supabase gateway), or 'unknown'. */
  clientIp: string;
}

/**
 * Same pipeline without the token and entitlement steps:
 *
 *   method check → body size → validate input (zod) → work → validate output → respond
 *
 * There is no user to rate-limit by, so `work` MUST apply its own limits keyed by what it
 * protects (for login: the client IP and the phone number) before doing anything else.
 */
export interface PublicFunctionSpec<In extends z.ZodTypeAny, Out extends z.ZodTypeAny> {
  name: string;
  input: In;
  output: Out;
  work(ctx: PublicContext, input: z.output<In>): Promise<z.input<Out>>;
}

export type PublicDeps = Pick<Deps, 'log' | 'now' | 'requestId'>;

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for') ?? '';
  const first = forwarded.split(',')[0]?.trim() ?? '';
  return first.length > 0 && first.length <= 64 ? first : 'unknown';
}

export function createPublicHandler<In extends z.ZodTypeAny, Out extends z.ZodTypeAny>(
  spec: PublicFunctionSpec<In, Out>,
  deps: PublicDeps,
): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => Date.now());
  const newId = deps.requestId ?? (() => crypto.randomUUID());

  return async (req) => {
    const started = now();
    const requestId = newId();
    const fail = (code: ErrorCode): Response => {
      const status = ERROR_STATUS[code];
      deps.log({ fn: spec.name, request_id: requestId, status, code, ms: now() - started });
      return json(status, { error: { code } }, requestId);
    };

    try {
      if (req.method !== 'POST') return fail('invalid_input');
      const body = await readJson(req);
      if (body === TOO_LARGE || body === BAD_JSON) return fail('invalid_input');
      const parsed = spec.input.safeParse(body);
      if (!parsed.success) return fail('invalid_input');

      const result = await spec.work({ requestId, clientIp: clientIp(req) }, parsed.data);
      const out = spec.output.safeParse(result);
      if (!out.success) return fail('internal');

      deps.log({ fn: spec.name, request_id: requestId, status: 200, ms: now() - started });
      return json(200, out.data, requestId);
    } catch (err) {
      const code: ErrorCode =
        err instanceof AppError
          ? err.code
          : isErrorCode((err as { message?: unknown })?.message)
            ? ((err as Error).message as ErrorCode)
            : 'internal';
      return fail(code);
    }
  };
}
