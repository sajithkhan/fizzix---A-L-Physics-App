import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useOnline } from '@/hooks/use-online';
import { useTheme } from '@/theme';

/** ST-59 · a thin banner at the top of every screen while the phone is offline. */
export function OfflineBanner() {
  const online = useOnline();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  if (online) return null;
  return (
    <View
      testID="offline-banner"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.root, { paddingTop: insets.top + 6, backgroundColor: colors.warning }]}
    >
      <Text style={[styles.text, { color: colors.onPrimary }]}>{t('common.offline')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingBottom: 6,
    paddingHorizontal: 16,
    zIndex: 10,
  },
  text: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
