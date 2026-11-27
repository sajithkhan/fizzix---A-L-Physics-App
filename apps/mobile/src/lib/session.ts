import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabase } from './supabase';
import { fetchConsentStatus } from '@/features/consent/consent';

/**
 * Where a student is: no session, verified number only, a finished account that must accept
 * a new privacy notice (ST-58), or a finished account.
 */
export type AuthState = 'signed_out' | 'needs_account' | 'needs_consent' | 'complete';

/** Remembered on the device so a finished account opens home even when offline. */
export const ACCOUNT_COMPLETE_KEY = 'fizzix.account_complete';

export async function getAuthState(): Promise<AuthState> {
  const supabase = getSupabase();
  if (!supabase) return 'signed_out';
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return 'signed_out';

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
