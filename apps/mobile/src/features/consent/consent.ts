import {
  ConsentStatus,
  isAgeBand,
  parsePrivacyNotice,
  type AgeBand,
  type PrivacyNotice,
} from '@fizzix/shared';
import { getSupabase } from '@/lib/supabase';

/** Errors the consent UI turns into translated text (consent.errors.*). */
export type ConsentError =
  | 'consent_missing'
  | 'invalid_age_band'
  | 'notice_outdated'
  | 'session_expired'
  | 'network'
  | 'internal';

export function toConsentError(error: unknown): ConsentError {
  if (!error || typeof error !== 'object') return 'internal';
  const e = error as { message?: unknown; code?: unknown; name?: unknown; status?: unknown };
  const message = typeof e.message === 'string' ? e.message : '';
  for (const code of ['notice_outdated', 'invalid_age_band', 'consent_missing'] as const) {
    if (message.includes(code)) return code;
  }
  if (message.includes('not_authenticated') || e.code === 'bad_jwt') return 'session_expired';
  if (
    e.name === 'AuthRetryableFetchError' ||
    e.status === 0 ||
    message.includes('Network request failed')
  ) {
    return 'network';
  }
  return 'internal';
}

/** The current notice (app_config.privacy_notice), or null when offline or misconfigured. */
export async function loadPrivacyNotice(): Promise<PrivacyNotice | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'privacy_notice')
      .maybeSingle();
    if (error) return null;
    return parsePrivacyNotice((data as { value?: unknown } | null)?.value);
  } catch {
    return null;
  }
}

/** Saves acceptance of this notice version with the age range (public.record_consent). */
export async function recordConsent(
  noticeVersion: string,
  ageBand: AgeBand,
): Promise<{ ok: true } | { ok: false; error: ConsentError }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'network' };
  try {
    const { error } = await supabase.rpc('record_consent', {
      p_notice_version: noticeVersion,
      p_age_band: ageBand,
    });
    return error ? { ok: false, error: toConsentError(error) } : { ok: true };
  } catch (err) {
    return { ok: false, error: toConsentError(err) };
  }
}

/** Whether the signed-in student has accepted the current notice. Throws when unknown. */
export async function fetchConsentStatus(): Promise<ConsentStatus> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('offline');
  const { data, error } = await supabase.rpc('consent_status');
  if (error) throw error;
  const row: unknown = Array.isArray(data) ? data[0] : data;
  return ConsentStatus.parse(row);
}

/** The age range the student gave before, to pre-select it when a new notice is shown. */
export async function loadSavedAgeBand(): Promise<AgeBand | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return null;
    const { data } = await supabase
      .from('profiles')
      .select('age_band')
      .eq('id', userId)
      .maybeSingle();
    const band = (data as { age_band?: unknown } | null)?.age_band;
    return isAgeBand(band) ? band : null;
  } catch {
    return null;
  }
}
