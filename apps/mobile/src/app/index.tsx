import { useEffect, useState } from 'react';
import { Redirect, type Href } from 'expo-router';
import { useLocaleState } from '@/features/language/locale-context';
import { hasSession } from '@/lib/session';
import { Loading } from '@/components/loading';

/**
 * Entry. First launch: language (ST-01). No session: registration (ST-02). Verified number
 * but no account yet: account creation (ST-04). Login (ST-54) and home join this as they land.
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
    void hasSession().then((signedIn) => {
      if (active) setTarget(signedIn ? '/account-setup' : '/register');
    });
    return () => {
      active = false;
    };
  }, [saved]);

  return target ? <Redirect href={target} /> : <Loading />;
}
