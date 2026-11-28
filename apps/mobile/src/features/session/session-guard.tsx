import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { analytics } from '@/lib/analytics';
import { checkActiveSession, endElsewhereSession } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';

/**
 * ST-06 · when the app comes back to the foreground, check that this phone is still the
 * account's active one. If another phone has signed in, sign out here and say why.
 * (On app start, the entry screen does the same check through getAuthState.)
 */
export function SessionGuard() {
  const router = useRouter();
  const checking = useRef(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || checking.current) return;
      checking.current = true;
      void (async () => {
        try {
          const supabase = getSupabase();
          const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
          if (!data.session) return;
          if ((await checkActiveSession()) !== 'elsewhere') return;
          await endElsewhereSession();
          analytics.track('signed_out_elsewhere');
          if (router.canDismiss()) router.dismissAll();
          router.replace({ pathname: '/login', params: { reason: 'elsewhere' } });
        } finally {
          checking.current = false;
        }
      })();
    });
    return () => sub.remove();
  }, [router]);

  return null;
}
