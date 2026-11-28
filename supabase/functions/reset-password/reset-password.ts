/**
 * ST-55 · save the new password after the reset OTP (ADR-0011).
 *
 * Needs: a session made by an OTP in the last 10 minutes, an open reset intent for this
 * number (reset_allowed), and the sign-up password rules. Then it stores the derived
 * password, closes the intent, clears the login lock for the number and signs out every
 * session, so the student logs in with the new password.
 */
import { z } from 'zod';
import { AppError, type FunctionSpec } from '../_shared/handler.ts';
import { hasFreshOtp } from '../_shared/jwt.ts';
import { derivePassword, lockoutKey, serverPasswordIssue } from '../_shared/password.ts';

export const ResetPasswordInput = z.object({ password: z.string().min(1).max(128) }).strict();
export const ResetPasswordOutput = z.object({ ok: z.literal(true) }).strict();

/** The OTP sign-in must be this recent (seconds). */
export const OTP_MAX_AGE = 600;

export interface ResetPasswordDeps {
  pepper: string;
  nowSeconds(): number;
  resetAllowed(userId: string): Promise<boolean>;
  setAuthPassword(userId: string, password: string): Promise<'ok' | 'weak' | 'error'>;
  resetFinished(userId: string): Promise<void>;
  /** login_result(numberKey, true): a new password also lifts a login lock. */
  clearLoginLock(numberKey: string): Promise<void>;
  /** Supabase Auth sign-out of every session of this user. */
  signOutEverywhere(accessToken: string): Promise<void>;
}

export function resetPasswordSpec(
  deps: ResetPasswordDeps,
): FunctionSpec<typeof ResetPasswordInput, typeof ResetPasswordOutput> {
  return {
    name: 'reset-password',
    input: ResetPasswordInput,
    output: ResetPasswordOutput,
    rateLimit: { max: 10, windowSeconds: 3600 },
    async work(ctx, input) {
      const phone = ctx.user.phone;
      if (!phone) throw new AppError('not_authenticated');
      if (!hasFreshOtp(ctx.user.amr, deps.nowSeconds(), OTP_MAX_AGE)) {
        throw new AppError('reset_not_allowed');
      }
      if (!(await deps.resetAllowed(ctx.user.id))) throw new AppError('reset_not_allowed');
      if (serverPasswordIssue(input.password)) throw new AppError('weak_password');

      const result = await deps.setAuthPassword(
        ctx.user.id,
        await derivePassword(deps.pepper, phone, input.password),
      );
      if (result === 'weak') throw new AppError('weak_password');
      if (result === 'error') throw new AppError('internal');

      await deps.resetFinished(ctx.user.id);
      await deps.clearLoginLock(await lockoutKey(deps.pepper, 'number', phone));
      await deps.signOutEverywhere(ctx.accessToken);
      return { ok: true as const };
    },
  };
}
