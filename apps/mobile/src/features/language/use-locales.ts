import { useEffect, useState } from 'react';
import { FALLBACK_LOCALES, LocaleList, type LocaleRow } from '@fizzix/shared';
import { getSupabase } from '@/lib/supabase';

/**
 * The language list. Starts with the built-in list so the screen works offline on first
 * launch, then switches to the database list (white-label: languages are configured there).
 */
export function useLocales(): readonly LocaleRow[] {
  const [rows, setRows] = useState<readonly LocaleRow[]>(FALLBACK_LOCALES);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let active = true;

    supabase
      .from('locales')
      .select('code, native_name, is_enabled, sort_order')
      .order('sort_order')
      .then(({ data, error }) => {
        if (!active || error) return;
        const parsed = LocaleList.safeParse(data);
        if (parsed.success && parsed.data.length > 0) setRows(parsed.data);
      })
      .then(undefined, () => {
        // Network failure: keep the built-in list.
      });

    return () => {
      active = false;
    };
  }, []);

  return rows;
}
