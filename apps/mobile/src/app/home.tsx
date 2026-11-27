import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/screen';
import { TextButton } from '@/components/text-button';
import { ErrorMessage } from '@/components/error-message';
import { analytics } from '@/lib/analytics';
import { signOut } from '@/lib/session';
import { useTheme } from '@/theme';

/**
 * Placeholder until ST-08 (home and daily targets). Reached once the account is complete.
 * Logout (ST-05) sits here until Settings (Screen 9) exists.
 */
export default function Home() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const logout = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const result = await signOut();
    setBusy(false);
    if (!result.ok) {
      setFailed(true);
      analytics.track('logout_failed', { reason: result.error });
      return;
    }
    analytics.track('logged_out');
    router.replace('/login');
  };

  return (
    <Screen testID="home-screen">
      <View style={styles.body}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {t('home.title')}
        </Text>
        <Text style={[styles.text, { color: colors.textMuted }]}>{t('home.body')}</Text>
      </View>
      {failed ? <ErrorMessage testID="home-logout-error" message={t('home.logoutFailed')} /> : null}
      <View style={styles.footer}>
        <TextButton
          testID="home-logout"
          label={t('home.logout')}
          onPress={() => void logout()}
          disabled={busy}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', gap: 12 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  text: { fontSize: 15, lineHeight: 24, textAlign: 'center' },
  footer: { alignItems: 'center' },
});
