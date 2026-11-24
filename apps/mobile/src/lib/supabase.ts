import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The only Supabase client in the app. Uses the public URL and anon key only; every
 * privileged rule lives in the database (RLS) or Edge Functions.
 *
 * Returns null when the app is built without Supabase settings (tests, a fresh checkout),
 * so screens fall back to built-in data instead of crashing.
 *
 * Session storage: AsyncStorage for now. ST-05 (stay signed in) moves tokens to
 * expo-secure-store before any real sign-in ships.
 */
let client: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  client =
    url && anonKey
      ? createClient(url, anonKey, {
          auth: {
            storage: AsyncStorage,
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false,
          },
        })
      : null;
  return client;
}
