import { useEffect, useState } from 'react';
import { Redirect, type Href } from 'expo-router';
import { useLocaleState } from '@/features/language/locale-context';
import { getAuthState } from '@/lib/session';
import { Loading } from '@/components/loading';

const TARGET = {
  signed_out: '/register',
  needs_account: '/account-setup',
  complete: '/home',
} as const satisfies Record<string, Href>;

/**
 * Entry. First launch: language (ST-01). No session: registration (ST-02). Verified number
 * without an account: account creation (ST-04). Finished account: home. Login (ST-54) joins
 * this when it lands.
 */
export default function Index() {
  const { saved } = useLocaleState();
  const [target, setTarget] = useState<Href | null>(null);

  useEffect(() => {
    if (!saved) {
      setTarget('/language');
      return;
    }
    let active = true;
    void getAuthState().then((state) => {
      if (active) setTarget(TARGET[state]);
    });
    return () => {
      active = false;
    };
  }, [saved]);

  return target ? <Redirect href={target} /> : <Loading />;
}
