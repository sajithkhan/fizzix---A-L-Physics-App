import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLocaleState } from '@/features/language/locale-context';
import { getAuthState } from '@/lib/session';
import { ScreenSkeleton } from '@/components/skeleton';
import { ErrorMessage } from '@/components/error-message';
import { useSlow } from '@/hooks/use-slow';
import { useTheme } from '@/theme';

const TARGET = {
  signed_out: '/login',
  signed_out_elsewhere: { pathname: '/login', params: { reason: 'elsewhere' } },
  needs_account: '/account-setup',
  needs_consent: '/consent',
  complete: '/home',
} as const satisfies Record<string, Href>;

/**
 * Entry. First launch: language (ST-01), then sign-up. Later opens with no session: login
 * (ST-54), which links to sign-up (ST-02). Verified number without an account: account
 * creation (ST-04). Finished account with an old privacy notice: accept the new one (ST-58).
 * Finished account: home. Signed out by a sign-in on another phone: login with a note (ST-06).
 * ST-59: a skeleton while this is worked out, and a retry if it takes more than 10 s.
 */
export default function Index() {
  const { saved } = useLocaleState();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [target, setTarget] = useState<Href | null>(null);
  const [attempt, setAttempt] = useState(0);
  const slow = useSlow(target === null, attempt);

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
  }, [saved, attempt]);

  if (target) return <Redirect href={target} />;
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenSkeleton />
      {slow ? (
        <View style={styles.slow}>
          <ErrorMessage
            testID="entry-slow"
            message={t('states.slow')}
            actionLabel={t('states.retry')}
            onAction={() => setAttempt((n) => n + 1)}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  slow: { position: 'absolute', left: 24, right: 24, bottom: 48 },
});
