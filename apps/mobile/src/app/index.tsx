import { useEffect, useState } from 'react';
import { Redirect, type Href } from 'expo-router';
import { useLocaleState } from '@/features/language/locale-context';
import { getAuthState } from '@/lib/session';
import { Loading } from '@/components/loading';

const TARGET = {
  signed_out: '/login',
  needs_account: '/account-setup',
  needs_consent: '/consent',
  complete: '/home',
} as const satisfies Record<string, Href>;

/**
 * Entry. First launch: language (ST-01), then sign-up. Later opens with no session: login
 * (ST-54), which links to sign-up (ST-02). Verified number without an account: account
 * creation (ST-04). Finished account with an old privacy notice: accept the new one (ST-58).
 * Finished account: home.
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
