import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { hoursUntilReset } from '@fizzix/shared';
import { PrimaryButton } from './primary-button';
import { radius, space, useTheme } from '@/theme';

/**
 * ST-59 · daily limit reached / Premium needed. Says what the limit is and when it resets
 * (midnight Sri Lanka time, the same rule the server uses), and offers Premium.
 */
export function LimitState(props: {
  testID: string;
  kind: 'daily_limit' | 'premium_required';
  /** The free daily allowance, e.g. 10 MCQs (from app_config on the server). */
  limit?: number;
  now?: Date;
  onUpgrade(): void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { testID, kind, limit, now, onUpgrade } = props;
  const hours = hoursUntilReset(now);
  return (
    <View
      testID={testID}
      style={[styles.root, { backgroundColor: colors.surface, borderColor: colors.warning }]}
    >
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        {t(`states.${kind}.title`)}
      </Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        {kind === 'daily_limit'
          ? t('states.daily_limit.body', { limit: limit ?? 0, hours })
          : t('states.premium_required.body')}
      </Text>
      <PrimaryButton testID={`${testID}-upgrade`} label={t('states.upgrade')} onPress={onUpgrade} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderWidth: 1, borderRadius: radius.card, padding: space.xl, gap: space.md },
  title: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 22 },
});
