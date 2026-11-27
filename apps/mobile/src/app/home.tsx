import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/screen';
import { TextButton } from '@/components/text-button';
import { useTheme } from '@/theme';

/**
 * Placeholder until ST-08 (home and daily targets). Reached once the account is complete.
 * Links to Settings (Screen 9) until the bottom tab bar arrives with the real home.
 */
export default function Home() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Screen testID="home-screen">
      <View style={styles.body}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {t('home.title')}
        </Text>
        <Text style={[styles.text, { color: colors.textMuted }]}>{t('home.body')}</Text>
      </View>
      <View style={styles.footer}>
        <TextButton
          testID="home-settings"
          label={t('home.settingsLink')}
          onPress={() => router.push('/settings')}
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
