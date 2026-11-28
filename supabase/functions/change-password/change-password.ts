/**
 * ST-56 · change the password in Settings, knowing the current one (no OTP). ADR-0013.
 *
 *   verify token (active session) → rate limit (5 tries / 15 min) → rules for the new
 *   password → current password matches (checked without signing in) → store the new
 *   derived password → lift any login lock → sign this phone in again with the new password
 *
 * Supabase Auth ends every session when the password changes, so the fresh session returned
 * here keeps this phone signed in; other phones are signed out.
 */
import { z } from 'zod';
import { AppError, type FunctionSpec } from '../_shared/handler.ts';
import { derivePassword, lockoutKey, serverPasswordIssue } from '../_shared/password.ts';
import { LoginOutput, type GrantResult } from '../login/login.ts';

export const ChangePasswordInput = z
  .object({
    current: z.string().min(1).max(128),
    password: z.string().min(1).max(128),
  })
  .strict();

export interface ChangePasswordDeps {
  pepper: string;
  passwordMatches(userId: string, derived: string): Promise<boolean>;
  setAuthPassword(userId: string, derived: string): Promise<'ok' | 'weak' | 'error'>;
  clearLoginLock(numberKey: string): Promise<void>;
  passwordGrant(phone: string, derived: string): Promise<GrantResult>;
}

export function changePasswordSpec(
  deps: ChangePasswordDeps,
): FunctionSpec<typeof ChangePasswordInput, typeof LoginOutput> {
  return {
    name: 'change-password',
    input: ChangePasswordInput,
    output: LoginOutput,
    rateLimit: { max: 5, windowSeconds: 900 },
    async work(ctx, input) {
      const phone = ctx.user.phone;
      if (!phone) throw new AppError('not_authenticated');
      if (serverPasswordIssue(input.password)) throw new AppError('weak_password');
      if (input.password === input.current) throw new AppError('password_unchanged');

      const current = await derivePassword(deps.pepper, phone, input.current);
      if (!(await deps.passwordMatches(ctx.user.id, current))) {
        throw new AppError('invalid_credentials');
      }

      const next = await derivePassword(deps.pepper, phone, input.password);
      const saved = await deps.setAuthPassword(ctx.user.id, next);
      if (saved === 'weak') throw new AppError('weak_password');
      if (saved === 'error') throw new AppError('internal');

      await deps.clearLoginLock(await lockoutKey(deps.pepper, 'number', phone));
      const grant = await deps.passwordGrant(phone, next);
      if (grant.kind !== 'ok') throw new AppError('internal');
      return grant.session;
    },
  };
}
