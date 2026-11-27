import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  AGE_BANDS,
  needsParentConfirmation,
  type AgeBand,
  type PrivacyNotice,
} from '@fizzix/shared';
import { ChoiceChips } from '@/components/choice-chips';
import { radius, useTheme } from '@/theme';

/**
 * ST-58 · age range chips, with the under-16 parent note. Used on the account screen and on
 * the "notice updated" screen. Test IDs: `<prefix>-age-<band>`, `<prefix>-age-parent-note`.
 */
export function AgeRange(props: {
  prefix: string;
  value: AgeBand | null;
  onChange(value: AgeBand): void;
  error: string | null;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { prefix, value, onChange, error } = props;
  return (
    <View style={styles.group}>
      <ChoiceChips
        testID={`${prefix}-age`}
        label={t('consent.ageLabel')}
        options={AGE_BANDS.map((band) => ({ value: band, label: t(`consent.ages.${band}`) }))}
        value={value}
        onChange={onChange}
      />
      {needsParentConfirmation(value) ? (
        <Text
          testID={`${prefix}-age-parent-note`}
          accessibilityLiveRegion="polite"
          style={[styles.note, { color: colors.warning }]}
        >
          {t('consent.parentNote')}
        </Text>
      ) : null}
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

/**
 * ST-58 · short privacy summary, link to the full notice and the required checkbox.
 * Test IDs: `<prefix>-privacy-accept`, `<prefix>-privacy-link`, `<prefix>-privacy-error`.
 */
export function PrivacyConsent(props: {
  prefix: string;
  notice: PrivacyNotice | null;
  accepted: boolean;
  onAcceptedChange(value: boolean): void;
  error: string | null;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { prefix, notice, accepted, onAcceptedChange, error } = props;

  const openNotice = () => {
    // parsePrivacyNotice() only lets https links through.
    if (notice) void Linking.openURL(notice.url).catch(() => undefined);
  };

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: error ? colors.danger : colors.inputBorder,
          borderWidth: error ? 2 : 1,
          backgroundColor: colors.inputBg,
        },
      ]}
    >
      <Text style={[styles.summary, { color: colors.textMuted }]}>{t('consent.summary')}</Text>
      <Pressable
        testID={`${prefix}-privacy-accept`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
        accessibilityLabel={t('consent.accept')}
        onPress={() => onAcceptedChange(!accepted)}
        style={styles.row}
        hitSlop={4}
      >
        <View
          style={[
            styles.box,
            accepted
              ? { backgroundColor: colors.primary, borderColor: colors.primary }
              : { backgroundColor: colors.inputBg, borderColor: colors.radioOff },
          ]}
        >
          {accepted ? <Text style={[styles.tick, { color: colors.onPrimary }]}>✓</Text> : null}
        </View>
        <Text style={[styles.label, { color: colors.text }]}>{t('consent.accept')}</Text>
      </Pressable>
      <Pressable
        testID={`${prefix}-privacy-link`}
        accessibilityRole="link"
        accessibilityState={{ disabled: !notice }}
        disabled={!notice}
        onPress={openNotice}
        hitSlop={8}
        style={styles.link}
      >
        <Text style={[styles.linkText, { color: notice ? colors.accent : colors.textMuted }]}>
          {t('consent.link')}
        </Text>
      </Pressable>
      {error ? (
        <Text
          testID={`${prefix}-privacy-error`}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[styles.error, { color: colors.danger }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  note: { fontSize: 12, lineHeight: 18 },
  error: { fontSize: 12, fontWeight: '600', lineHeight: 18 },
  card: { borderRadius: radius.sm, padding: 14, gap: 10 },
  summary: { fontSize: 12, lineHeight: 19 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  tick: { fontSize: 14, fontWeight: '800', lineHeight: 16 },
  label: { flex: 1, fontSize: 13, lineHeight: 21 },
  link: { alignSelf: 'flex-start', paddingVertical: 2 },
  linkText: { fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
});
