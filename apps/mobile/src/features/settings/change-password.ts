import { callFunction } from '@/lib/functions';
import { getSupabase } from '@/lib/supabase';

/** What the change-password screen can show (changePassword.errors.*). */
export type ChangePasswordError =
  | 'invalid_credentials'
  | 'password_unchanged'
  | 'weak_password'
  | 'rate_limited'
  | 'session_expired'
  | 'network'
  | 'internal';

interface Session {
  access_token: string;
  refresh_token: string;
}

/**
 * ST-56 · change the password with the current one (no OTP). The server answers with a fresh
 * session for this phone, because changing the password ends every session (ADR-0013).
 */
export async function changePassword(
  current: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: ChangePasswordError }> {
  const result = await callFunction<Session>('change-password', { current, password });
  if (!result.ok) {
    switch (result.code) {
      case 'invalid_credentials':
      case 'password_unchanged':
      case 'weak_password':
      case 'rate_limited':
      case 'network':
        return { ok: false, error: result.code };
      case 'not_authenticated':
      case 'signed_in_elsewhere':
        return { ok: false, error: 'session_expired' };
      default:
        return { ok: false, error: 'internal' };
    }
  }
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'network' };
  const { error } = await supabase.auth.setSession({
    access_token: result.data.access_token,
    refresh_token: result.data.refresh_token,
  });
  return error ? { ok: false, error: 'internal' } : { ok: true };
}
