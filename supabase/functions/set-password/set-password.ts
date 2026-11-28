/**
 * ST-04 · set the password at sign-up (ADR-0009). Runs after the OTP step, before
 * complete_account(). Supabase Auth stores only the derived password.
 *
 * Only an account that is not finished yet may use this. Changing the password later is
 * ST-56 (needs the current password) and resetting it is ST-55 (needs a fresh OTP).
 *
 * Supabase Auth ends every session when a password is set, including the OTP session that
 * called this. So the function signs in with the new password and returns that session for
 * the app to keep (it also becomes the account's active session, ST-06).
 */
import { z } from 'zod';
import { AppError, type FunctionSpec } from '../_shared/handler.ts';
import { derivePassword, serverPasswordIssue } from '../_shared/password.ts';
import { LoginOutput, type GrantResult } from '../login/login.ts';

export const SetPasswordInput = z.object({ password: z.string().min(1).max(128) }).strict();
/** The fresh session for this phone (same fields as login). */
export const SetPasswordOutput = LoginOutput;

export interface SetPasswordDeps {
  pepper: string;
  accountCompleted(userId: string): Promise<boolean>;
  /** Supabase Auth admin update. 'weak' when Auth refuses the password. */
  setAuthPassword(userId: string, password: string): Promise<'ok' | 'weak' | 'error'>;
  /** Supabase Auth password sign-in with the derived password. */
  passwordGrant(phone: string, password: string): Promise<GrantResult>;
}

export function setPasswordSpec(
  deps: SetPasswordDeps,
): FunctionSpec<typeof SetPasswordInput, typeof SetPasswordOutput> {
  return {
    name: 'set-password',
    input: SetPasswordInput,
    output: SetPasswordOutput,
    rateLimit: { max: 10, windowSeconds: 3600 },
    async work(ctx, input) {
      if (!ctx.user.phone) throw new AppError('not_authenticated');
      if (serverPasswordIssue(input.password)) throw new AppError('weak_password');
      if (await deps.accountCompleted(ctx.user.id)) throw new AppError('account_already_completed');

      const derived = await derivePassword(deps.pepper, ctx.user.phone, input.password);
      const result = await deps.setAuthPassword(ctx.user.id, derived);
      if (result === 'weak') throw new AppError('weak_password');
      if (result === 'error') throw new AppError('internal');

      const grant = await deps.passwordGrant(ctx.user.phone, derived);
      if (grant.kind !== 'ok') throw new AppError('internal');
      return grant.session;
    },
  };
}
