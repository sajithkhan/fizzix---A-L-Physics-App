import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';

export function Loading() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View
      testID="loading"
      style={[styles.root, { backgroundColor: colors.background }]}
      accessibilityLabel={t('common.loading')}
    >
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
