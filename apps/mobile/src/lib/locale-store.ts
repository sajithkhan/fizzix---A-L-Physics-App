import AsyncStorage from '@react-native-async-storage/async-storage';
import { isLocale, type Locale } from '@fizzix/shared';
import { getSupabase } from './supabase';

export const LOCALE_STORAGE_KEY = 'fizzix.locale';

/** The language chosen on this device, or null on first launch (or if the value is corrupt). */
export async function loadSavedLocale(): Promise<Locale | null> {
  try {
    const value = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Saves the choice on the device, and on the student's profile when signed in. The profile
 * is what the server uses to pick question, explanation and audio language.
 * A failed profile write is retried on the next save; it never blocks the student.
 */
export async function saveLocale(locale: Locale): Promise<void> {
  await AsyncStorage.setItem(LOCALE_STORAGE_KEY, locale);

  const supabase = getSupabase();
  if (!supabase) return;
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;
    await supabase.from('profiles').update({ locale_code: locale }).eq('id', userId);
  } catch {
    // Offline or server error: the device copy is kept and synced on the next change or sign-in.
  }
}
