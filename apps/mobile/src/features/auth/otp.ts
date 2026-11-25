import { getSupabase } from '@/lib/supabase';

/** Everything that can go wrong in ST-02, as codes the screen turns into translated text. */
export type OtpError =
  | 'phone_not_supported'
  | 'already_registered'
  | 'otp_rate_limited'
  | 'otp_resend_wait'
  | 'otp_invalid'
  | 'sms_unavailable'
  | 'network'
  | 'internal';

export type OtpResult = { ok: true } | { ok: false; error: OtpError };

const HOOK_CODES: readonly OtpError[] = [
  'phone_not_supported',
  'already_registered',
  'otp_rate_limited',
  'sms_unavailable',
];

/**
 * Maps a Supabase Auth error to an OtpError. Our SMS hook returns its code as the message;
 * Supabase's own errors carry a `code`. Anything unknown becomes `internal` so raw server
 * text never reaches the student.
 */
export function toOtpError(error: unknown): OtpError {
  if (!error || typeof error !== 'object') return 'internal';
  const e = error as { message?: unknown; code?: unknown; name?: unknown; status?: unknown };
  const message = typeof e.message === 'string' ? e.message : '';

  const fromHook = HOOK_CODES.find((code) => message.includes(code));
  if (fromHook) return fromHook;

  switch (e.code) {
    case 'over_sms_send_rate_limit':
    case 'over_request_rate_limit':
      return 'otp_resend_wait';
    case 'otp_expired':
    case 'invalid_credentials':
      return 'otp_invalid';
    case 'sms_send_failed':
    case 'hook_timeout':
    case 'hook_timeout_after_retry':
      return 'sms_unavailable';
  }
  if (e.name === 'AuthRetryableFetchError' || e.status === 0) return 'network';
  return 'internal';
}

/** Sends a 6-digit OTP to a new student's number (ST-02). `phone` is E.164 (+947…). */
export async function requestOtp(phone: string): Promise<OtpResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'network' };
  try {
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: true, channel: 'sms' },
    });
    return error ? { ok: false, error: toOtpError(error) } : { ok: true };
  } catch (err) {
    return { ok: false, error: toOtpError(err) };
  }
}

/** Checks the code. On success Supabase stores a session and the number is verified. */
export async function verifyOtp(phone: string, code: string): Promise<OtpResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'network' };
  try {
    const { data, error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
    if (error) return { ok: false, error: toOtpError(error) };
    return data.session ? { ok: true } : { ok: false, error: 'otp_invalid' };
  } catch (err) {
    return { ok: false, error: toOtpError(err) };
  }
}

/** Seconds to wait before "resend" is allowed (Supabase max_frequency, config.toml). */
export const RESEND_SECONDS = 45;
