import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AgeBand } from '@fizzix/shared';
import { getSupabase } from '@/lib/supabase';
import { ACCOUNT_COMPLETE_KEY } from '@/lib/session';
import { recordConsent, type ConsentError } from '@/features/consent/consent';

export type Stream = 'bio' | 'maths';

export interface AccountInput {
  name: string;
  username: string;
  password: string;
  examYear: number;
  stream: Stream;
  school: string;
  /** ST-58: the age range and the notice version shown on screen. */
  ageBand: AgeBand;
  noticeVersion: string;
}

/** Errors the account screen turns into translated text. */
export type AccountError =
  | 'invalid_name'
  | 'invalid_username'
  | 'username_taken'
  | 'invalid_exam_year'
  | 'invalid_stream'
  | 'invalid_school'
  | 'weak_password'
  | 'session_expired'
  | 'network'
  | 'internal';

const SERVER_CODES: readonly AccountError[] = [
  'invalid_name',
  'invalid_username',
  'username_taken',
  'invalid_exam_year',
  'invalid_stream',
  'invalid_school',
];

/** Used when the list cannot be loaded (offline). Mirrors the seeded app_config value. */
export const FALLBACK_EXAM_YEARS: readonly number[] = [2026, 2027, 2028];

export function toAccountError(error: unknown): AccountError {
  if (!error || typeof error !== 'object') return 'internal';
  const e = error as { message?: unknown; code?: unknown; name?: unknown; status?: unknown };
  const message = typeof e.message === 'string' ? e.message : '';
  const known = SERVER_CODES.find((code) => message.includes(code));
  if (known) return known;
  if (e.code === 'weak_password' || message.includes('weak_password')) return 'weak_password';
  if (
    message.includes('not_authenticated') ||
    e.code === 'session_not_found' ||
    e.code === 'bad_jwt'
  ) {
    return 'session_expired';
  }
  if (
    e.name === 'AuthRetryableFetchError' ||
    e.status === 0 ||
    message.includes('Network request failed')
  ) {
    return 'network';
  }
  // No logging here: this error can come from the password call (security rule: logs never
  // touch passwords). The screen records the error code through analytics instead.
  return 'internal';
}

/** Exam years offered on the screen (admin-configurable in app_config.exam_years). */
export async function loadExamYears(): Promise<readonly number[]> {
  const supabase = getSupabase();
  if (!supabase) return FALLBACK_EXAM_YEARS;
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'exam_years')
      .maybeSingle();
    const years = (data as { value?: unknown } | null)?.value;
    if (error || !Array.isArray(years) || !years.every((y) => Number.isInteger(y)))
      return FALLBACK_EXAM_YEARS;
    return years as number[];
  } catch {
    return FALLBACK_EXAM_YEARS;
  }
}

/** True if nobody else has this username. Unknown (offline) counts as available; the server re-checks. */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return true;
  try {
    const { data, error } = await supabase.rpc('username_available', { p_username: username });
    return error ? true : data !== false;
  } catch {
    return true;
  }
}

/**
 * ST-04 + ST-58: save details → record consent → set password → mark complete. Each step is
 * safe to repeat, so a student who loses connection halfway simply presses the button again.
 */
export async function createAccount(
  input: AccountInput,
): Promise<{ ok: true } | { ok: false; error: AccountError | ConsentError }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'network' };
  try {
    const saved = await supabase.rpc('save_account_details', {
      p_display_name: input.name,
      p_username: input.username,
      p_exam_year: input.examYear,
      p_stream: input.stream,
      p_school: input.school,
    });
    if (saved.error) return { ok: false, error: toAccountError(saved.error) };

    const consent = await recordConsent(input.noticeVersion, input.ageBand);
    if (!consent.ok) return consent;

    const password = await supabase.auth.updateUser({ password: input.password });
    if (password.error) return { ok: false, error: toAccountError(password.error) };

    const completed = await supabase.rpc('complete_account');
    if (completed.error) return { ok: false, error: toAccountError(completed.error) };

    await AsyncStorage.setItem(ACCOUNT_COMPLETE_KEY, '1');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toAccountError(err) };
  }
}
