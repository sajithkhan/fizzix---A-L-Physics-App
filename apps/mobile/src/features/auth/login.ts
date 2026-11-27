import { normalizeSlMobile } from '@fizzix/shared';
import { callFunction } from '@/lib/functions';
import { getSupabase } from '@/lib/supabase';

/** What the login screen can show. Wrong number and wrong password are the same message. */
export type LoginError =
  | 'phone_not_supported'
  | 'invalid_credentials'
  | 'login_locked'
  | 'rate_limited'
  | 'network'
  | 'internal';

interface Session {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
}

/**
 * ST-54 · log in through the `login` Edge Function (which applies the 5-tries lockout), then
 * hand the returned session to the Supabase client so it stays signed in and refreshes.
 */
export async function logIn(
  phoneInput: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: LoginError }> {
  const phone = normalizeSlMobile(phoneInput);
  if (!phone) return { ok: false, error: 'phone_not_supported' };
  if (password.length === 0) return { ok: false, error: 'invalid_credentials' };

  const result = await callFunction<Session>('login', { phone, password });
  if (!result.ok) {
    switch (result.code) {
      case 'invalid_credentials':
      case 'login_locked':
      case 'rate_limited':
      case 'network':
        return { ok: false, error: result.code };
      case 'invalid_input':
        return { ok: false, error: 'phone_not_supported' };
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
