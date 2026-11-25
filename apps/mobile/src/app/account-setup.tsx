import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/screen';
import { useTheme } from '@/theme';

/** Placeholder for ST-04 (create my account). Reached right after the number is verified. */
export default function AccountSetup() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Screen testID="account-setup-screen">
      <View style={styles.body}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {t('accountSetup.title')}
        </Text>
        <Text style={[styles.text, { color: colors.textMuted }]}>{t('accountSetup.body')}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', gap: 12 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  text: { fontSize: 15, lineHeight: 24, textAlign: 'center' },
});
