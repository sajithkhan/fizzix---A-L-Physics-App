import { getSupabase } from './supabase';

/** True if this phone holds a Supabase session (the student verified their number). */
export async function hasSession(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session !== null;
  } catch {
    return false;
  }
}
