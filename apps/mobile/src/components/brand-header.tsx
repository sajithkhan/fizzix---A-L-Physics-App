import { Image, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import brand from '@/brand/brand.json';
import { radius, useTheme } from '@/theme';

/** Logo, app name (brand.json) and tagline (translations). Top of the sign-up and login screens. */
export function BrandHeader() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.root}>
      <View style={[styles.logo, { backgroundColor: colors.primary }]}>
        <Image
          source={require('../../assets/logo-mark.png')}
          style={styles.mark}
          accessibilityIgnoresInvertColors
        />
      </View>
      <Text accessibilityRole="header" style={[styles.name, { color: colors.text }]}>
        {brand.appName}
      </Text>
      <Text style={[styles.tagline, { color: colors.textMuted }]}>{t('brand.tagline')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 12 },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: { width: 34, height: 34 },
  name: { fontSize: 26, fontWeight: '700' },
  tagline: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
