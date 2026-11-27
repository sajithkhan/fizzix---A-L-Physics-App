import { isErrorCode, type ErrorCode } from '@fizzix/shared';
import { getSupabase } from './supabase';

export type FunctionResult<T> = { ok: true; data: T } | { ok: false; code: ErrorCode | 'network' };

/**
 * Calls an Edge Function and returns its data or a safe error code. Our functions answer
 * errors as `{ error: { code } }` (supabase/functions/_shared/handler.ts); anything else, or
 * no answer at all, becomes `internal` or `network`. Raw server text never reaches screens.
 */
export async function callFunction<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<FunctionResult<T>> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, code: 'network' };
  try {
    const { data, error } = await supabase.functions.invoke<T>(name, { body });
    if (!error) return { ok: true, data: data as T };

    const response = (error as { context?: { json?: () => Promise<unknown> } }).context;
    if (response && typeof response.json === 'function') {
      const json = (await response.json().catch(() => null)) as {
        error?: { code?: unknown };
      } | null;
      const code = json?.error?.code;
      return { ok: false, code: isErrorCode(code) ? code : 'internal' };
    }
    // FunctionsFetchError / FunctionsRelayError: the request did not reach our code.
    return { ok: false, code: error.name === 'FunctionsFetchError' ? 'network' : 'internal' };
  } catch {
    return { ok: false, code: 'network' };
  }
}
