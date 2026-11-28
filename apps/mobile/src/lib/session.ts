import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabase } from './supabase';
import { fetchConsentStatus } from '@/features/consent/consent';

/**
 * Where a student is: no session, signed out because the account signed in on another phone
 * (ST-06), verified number only, a finished account that must accept a new privacy notice
 * (ST-58), or a finished account.
 */
export type AuthState =
  'signed_out' | 'signed_out_elsewhere' | 'needs_account' | 'needs_consent' | 'complete';

/** Remembered on the device so a finished account opens home even when offline. */
export const ACCOUNT_COMPLETE_KEY = 'fizzix.account_complete';

function isElsewhere(error: unknown): boolean {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message.includes('signed_in_elsewhere');
}

/**
 * ST-06 · is this phone's session still the account's active one? 'unknown' when the
 * server cannot be reached (the app then carries on and asks again later).
 */
export async function checkActiveSession(): Promise<'active' | 'elsewhere' | 'unknown'> {
  const supabase = getSupabase();
  if (!supabase) return 'unknown';
  try {
    const { data, error } = await supabase.rpc('session_status');
    if (error) return isElsewhere(error) ? 'elsewhere' : 'unknown';
    return data === false ? 'elsewhere' : 'active';
  } catch {
    return 'unknown';
  }
}

/** ST-06 · this phone was signed out by a sign-in elsewhere: drop its session here too. */
export async function endElsewhereSession(): Promise<void> {
  const supabase = getSupabase();
  try {
    await supabase?.auth.signOut({ scope: 'local' });
  } catch {
    // The server already ended it; nothing else to do.
  }
  await AsyncStorage.removeItem(ACCOUNT_COMPLETE_KEY).catch(() => undefined);
}

export async function getAuthState(): Promise<AuthState> {
  const supabase = getSupabase();
  if (!supabase) return 'signed_out';
  try {
    const { data, error: sessionError } = await supabase.auth.getSession();
    // Auth refuses to refresh a session that is no longer the active one.
    if (sessionError && isElsewhere(sessionError)) {
      await endElsewhereSession();
      return 'signed_out_elsewhere';
    }
    const userId = data.session?.user.id;
    if (!userId) return 'signed_out';

    if ((await checkActiveSession()) === 'elsewhere') {
      await endElsewhereSession();
      return 'signed_out_elsewhere';
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('account_completed_at')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;

    const complete = Boolean(profile?.account_completed_at);
    await AsyncStorage.setItem(ACCOUNT_COMPLETE_KEY, complete ? '1' : '0');
    if (!complete) return 'needs_account';

    // A new notice version is asked for on the next open (ST-58 AC3).
    const consent = await fetchConsentStatus();
    return consent.accepted ? 'complete' : 'needs_consent';
  } catch {
    // Offline or server error: fall back to what this device last knew. A pending notice is
    // asked for at the next open that reaches the server.
    const cached = await AsyncStorage.getItem(ACCOUNT_COMPLETE_KEY).catch(() => null);
    const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    if (!data.session) return 'signed_out';
    return cached === '1' ? 'complete' : 'needs_account';
  }
}

/** The verified phone number of the current session, E.164 (+947…), or null. */
export async function sessionPhone(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const phone = data.session?.user.phone;
    if (!phone) return null;
    return phone.startsWith('+') ? phone : `+${phone}`;
  } catch {
    return null;
  }
}

/**
 * ST-05 · log out on this phone: Supabase ends this session (other phones stay signed in)
 * and the tokens are removed from secure storage. Next time the student logs in with number
 * and password (ST-54), no OTP.
 */
export async function signOut(): Promise<{ ok: true } | { ok: false; error: 'network' }> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) return { ok: false, error: 'network' };
    } catch {
      return { ok: false, error: 'network' };
    }
  }
  await AsyncStorage.removeItem(ACCOUNT_COMPLETE_KEY).catch(() => undefined);
  return { ok: true };
}
