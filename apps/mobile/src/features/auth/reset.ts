import { callFunction } from '@/lib/functions';
import { getSupabase } from '@/lib/supabase';
import { ACCOUNT_COMPLETE_KEY } from '@/lib/session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { verifyOtp, type OtpError } from './otp';

/** What the reset screen can show (reset.errors.*). */
export type ResetError =
  OtpError | 'not_registered' | 'reset_not_allowed' | 'rate_limited' | 'weak_password';

const REQUEST_CODES = [
  'phone_not_supported',
  'not_registered',
  'otp_rate_limited',
  'otp_resend_wait',
  'sms_unavailable',
  'rate_limited',
  'network',
] as const;

/** ST-55 step 1 · ask the server to send a reset OTP. `phone` is E.164 (+947…). */
export async function requestReset(
  phone: string,
): Promise<{ ok: true } | { ok: false; error: ResetError }> {
  const result = await callFunction<{ ok: true }>('reset-request', { phone });
  if (result.ok) return { ok: true };
  const known = REQUEST_CODES.find((c) => c === result.code);
  return { ok: false, error: known ?? 'internal' };
}

/** ST-55 step 2a · check the OTP (creates a short OTP session). */
export function verifyResetOtp(phone: string, code: string) {
  return verifyOtp(phone, code);
}

/** ST-55 step 2b · save the new password; the server signs out every session. */
export async function saveNewPassword(
  password: string,
): Promise<{ ok: true } | { ok: false; error: ResetError }> {
  const result = await callFunction<{ ok: true }>('reset-password', { password });
  if (result.ok) {
    await dropLocalSession();
    return { ok: true };
  }
  switch (result.code) {
    case 'weak_password':
    case 'reset_not_allowed':
    case 'network':
    case 'rate_limited':
      return { ok: false, error: result.code };
    case 'not_authenticated':
      return { ok: false, error: 'reset_not_allowed' };
    default:
      return { ok: false, error: 'internal' };
  }
}

/**
 * Removes the reset's OTP session from this phone, so the student is never left signed in
 * without having used their password. Errors are ignored: after a reset the server has
 * already ended the session.
 */
export async function dropLocalSession(): Promise<void> {
  const supabase = getSupabase();
  try {
    await supabase?.auth.signOut({ scope: 'local' });
  } catch {
    // ignore
  }
  await AsyncStorage.removeItem(ACCOUNT_COMPLETE_KEY).catch(() => undefined);
}
