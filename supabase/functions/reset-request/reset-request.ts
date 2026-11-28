/**
 * ST-55 · ask for a password-reset OTP (ADR-0011).
 *
 *   validate → reset_request (IP limit, registered?, open a 10-minute intent) → Supabase Auth
 *   sends the OTP (the SMS hook allows a registered number only with an open intent)
 *
 * A number without an account gets `not_registered`: sign-up (ST-02) already says whether a
 * number is registered, so this reveals nothing new, and it tells the student what to do.
 */
import { z } from 'zod';
import { normalizeSlMobile } from '@fizzix/shared';
import { AppError, type PublicFunctionSpec } from '../_shared/handler.ts';
import { lockoutKey } from '../_shared/password.ts';

export const ResetRequestInput = z.object({ phone: z.string().min(1).max(20) }).strict();
export const ResetRequestOutput = z.object({ ok: z.literal(true) }).strict();

export type SendOtpResult =
  'ok' | 'otp_rate_limited' | 'otp_resend_wait' | 'sms_unavailable' | 'error';

export interface ResetRequestDeps {
  pepper: string;
  /** public.reset_request(): 'ok' | 'not_registered' | 'ip_limited' | 'phone_not_supported'. */
  resetRequest(phone: string, ipKey: string): Promise<string>;
  /** Supabase Auth POST /otp for an existing user. `phone` is 947XXXXXXXX. */
  sendOtp(phone: string): Promise<SendOtpResult>;
}

export function resetRequestSpec(
  deps: ResetRequestDeps,
): PublicFunctionSpec<typeof ResetRequestInput, typeof ResetRequestOutput> {
  return {
    name: 'reset-request',
    input: ResetRequestInput,
    output: ResetRequestOutput,
    async work(ctx, input) {
      const e164 = normalizeSlMobile(input.phone);
      if (!e164) throw new AppError('phone_not_supported');
      const phone = e164.slice(1);

      const ipKey = await lockoutKey(deps.pepper, 'ip', ctx.clientIp);
      const outcome = await deps.resetRequest(phone, ipKey);
      if (outcome === 'ip_limited') throw new AppError('rate_limited');
      if (outcome === 'not_registered') throw new AppError('not_registered');
      if (outcome === 'phone_not_supported') throw new AppError('phone_not_supported');
      if (outcome !== 'ok') throw new AppError('internal');

      const sent = await deps.sendOtp(phone);
      if (sent === 'ok') return { ok: true as const };
      throw new AppError(sent === 'error' ? 'internal' : sent);
    },
  };
}
