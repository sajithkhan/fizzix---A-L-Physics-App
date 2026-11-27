/**
 * ST-54 · login with phone number and password (ADR-0009).
 *
 *   validate → IP limit + number lock (login_guard) → Supabase Auth password grant with the
 *   derived password → record the outcome (login_result) → return the session
 *
 * Wrong number and wrong password give the same `invalid_credentials`, and both count as a
 * wrong try for that number, so the answer never tells whether a number has an account.
 */
import { z } from 'zod';
import { normalizeSlMobile } from '@fizzix/shared';
import { AppError, type PublicFunctionSpec } from '../_shared/handler.ts';
import { derivePassword, lockoutKey } from '../_shared/password.ts';

export const LoginInput = z
  .object({
    phone: z.string().min(1).max(20),
    password: z.string().min(1).max(128),
  })
  .strict();

export const LoginOutput = z
  .object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
    expires_in: z.number().int().positive(),
    expires_at: z.number().int().positive(),
  })
  .strict();
export type LoginSession = z.infer<typeof LoginOutput>;

export type GrantResult =
  { kind: 'ok'; session: LoginSession } | { kind: 'invalid' } | { kind: 'error' };

export interface LoginDeps {
  pepper: string;
  guard(numberKey: string, ipKey: string): Promise<'ok' | 'locked' | 'ip_limited'>;
  result(numberKey: string, success: boolean): Promise<'ok' | 'failed' | 'locked'>;
  /** Supabase Auth `grant_type=password`. `phone` is E.164; `password` is already derived. */
  passwordGrant(phone: string, password: string): Promise<GrantResult>;
}

export function loginSpec(
  deps: LoginDeps,
): PublicFunctionSpec<typeof LoginInput, typeof LoginOutput> {
  return {
    name: 'login',
    input: LoginInput,
    output: LoginOutput,
    async work(ctx, input) {
      const phone = normalizeSlMobile(input.phone);
      if (!phone) throw new AppError('invalid_input');

      const numberKey = await lockoutKey(deps.pepper, 'number', phone);
      const ipKey = await lockoutKey(deps.pepper, 'ip', ctx.clientIp);
      const guard = await deps.guard(numberKey, ipKey);
      if (guard === 'locked') throw new AppError('login_locked');
      if (guard === 'ip_limited') throw new AppError('rate_limited');

      const grant = await deps.passwordGrant(
        phone,
        await derivePassword(deps.pepper, phone, input.password),
      );
      if (grant.kind === 'error') throw new AppError('internal');

      const outcome = await deps.result(numberKey, grant.kind === 'ok');
      if (grant.kind === 'ok') return grant.session;
      throw new AppError(outcome === 'locked' ? 'login_locked' : 'invalid_credentials');
    },
  };
}
