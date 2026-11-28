import { StyleSheet, View, type DimensionValue } from 'react-native';
import { useTranslation } from 'react-i18next';
import { radius, useTheme } from '@/theme';

/**
 * ST-59 · placeholder shapes shown while content loads, instead of a blank screen or a
 * spinner. Static on purpose: no endless animation (kinder for reduced-motion settings and
 * keeps UI automation able to see the screen settle).
 */
export function SkeletonBlock({
  width = '100%',
  height = 16,
  round = false,
}: {
  width?: DimensionValue;
  height?: number;
  round?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width,
        height,
        borderRadius: round ? radius.pill : radius.xs,
        backgroundColor: colors.surfaceBorder,
      }}
    />
  );
}

/** A whole-screen placeholder: a title and two cards. */
export function ScreenSkeleton({ testID = 'screen-skeleton' }: { testID?: string }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={t('common.loading')}
      accessibilityState={{ busy: true }}
      style={[styles.root, { backgroundColor: colors.background }]}
    >
      <SkeletonBlock width="55%" height={26} />
      {[0, 1].map((i) => (
        <View
          key={i}
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
          ]}
        >
          <SkeletonBlock width="70%" height={18} />
          <SkeletonBlock height={14} />
          <SkeletonBlock width="85%" height={14} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 56, paddingHorizontal: 24, gap: 20 },
  card: { borderWidth: 1, borderRadius: radius.card, padding: 20, gap: 12 },
});
