import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/screen';
import { PrimaryButton } from '@/components/primary-button';
import { useTheme } from '@/theme';

/**
 * Temporary landing screen after the language choice. ST-02 replaces it with
 * Screen 1 (sign up / sign in).
 */
export default function Welcome() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Screen testID="welcome-screen">
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.text }]}>{t('welcome.title')}</Text>
        <Text style={[styles.text, { color: colors.textMuted }]}>{t('welcome.body')}</Text>
      </View>
      <PrimaryButton
        testID="welcome-change-language"
        label={t('welcome.changeLanguage')}
        onPress={() => router.push('/language')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', gap: 12 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  text: { fontSize: 15, lineHeight: 24, textAlign: 'center' },
});
