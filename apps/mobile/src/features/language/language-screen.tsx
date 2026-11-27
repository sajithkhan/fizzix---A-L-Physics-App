import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { isLocale, selectableLocales, type Locale, type LocaleRow } from '@fizzix/shared';
import { Screen } from '@/components/screen';
import { PrimaryButton } from '@/components/primary-button';
import { analytics } from '@/lib/analytics';
import { saveLocale } from '@/lib/locale-store';
import { radius, space, useTheme, type Palette } from '@/theme';
import { resources } from '@/i18n';
import { useLocaleState } from './locale-context';
import { useLocales } from './use-locales';

/** Short script sample shown in each option's badge. Falls back to the first letter. */
const GLYPHS: Record<string, string> = { ta: 'த', si: 'සි', en: 'En' };

/**
 * ST-01 · Screen 0. First-launch language choice. The selected language previews instantly;
 * Continue saves it on the device (and the profile when signed in).
 */
export function LanguageScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const { saved, setSaved } = useLocaleState();
  const rows = useLocales();
  const selectable = selectableLocales(rows);

  const current = isLocale(i18n.language) ? i18n.language : 'ta';
  const [picked, setPicked] = useState<Locale>(current);
  const [saving, setSaving] = useState(false);
  const active: Locale = selectable.includes(picked) ? picked : (selectable[0] ?? picked);

  const pick = (locale: Locale) => {
    setPicked(locale);
    void i18n.changeLanguage(locale);
  };

  const onContinue = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (i18n.language !== active) await i18n.changeLanguage(active);
      await saveLocale(active);
      analytics.track('language_selected', { locale: active, first_launch: saved === null });
      setSaved(active);
      // First launch: most students are new, so sign-up (ST-02); it links to login (ST-54).
      router.replace(saved === null ? '/register' : '/');
    } finally {
      setSaving(false);
    }
  };

  // Title in every available language, so a student who reads only one can still find it.
  const titles = (Object.keys(resources) as Locale[]).map((lng) => t('language.title', { lng }));

  return (
    <Screen testID="language-screen">
      <View style={styles.header}>
        <View style={[styles.logo, { backgroundColor: colors.primary }]}>
          <Image
            source={require('../../../assets/logo-mark.png')}
            style={styles.logoMark}
            accessibilityIgnoresInvertColors
          />
        </View>
        <View accessibilityRole="header">
          {titles.map((title) => (
            <Text key={title} style={[styles.title, { color: colors.text }]}>
              {title}
            </Text>
          ))}
        </View>
      </View>

      <View style={styles.list} accessibilityRole="radiogroup">
        {rows.map((row) =>
          isLocale(row.code) && selectable.includes(row.code) ? (
            <LanguageOption
              key={row.code}
              row={row}
              medium={t(`language.medium.${row.code}`)}
              selected={row.code === active}
              onPress={() => pick(row.code as Locale)}
              colors={colors}
            />
          ) : (
            <ComingSoonOption
              key={row.code}
              row={row}
              label={`${row.native_name} · ${t('language.comingSoon')}`}
              colors={colors}
            />
          ),
        )}
      </View>

      <View
        testID="language-preview"
        style={[
          styles.preview,
          { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
        ]}
      >
        <Text style={[styles.previewLabel, { color: colors.label }]}>
          {t('language.previewLabel')}
        </Text>
        <Text style={[styles.previewText, { color: colors.text }]}>
          {t('language.previewText')}
        </Text>
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          testID="language-continue"
          label={t('language.continue')}
          onPress={() => void onContinue()}
          disabled={saving}
        />
        <Text style={[styles.hint, { color: colors.textMuted }]}>{t('language.hint')}</Text>
      </View>
    </Screen>
  );
}

function LanguageOption(props: {
  row: LocaleRow;
  medium: string;
  selected: boolean;
  onPress(): void;
  colors: Palette;
}) {
  const { row, medium, selected, onPress, colors } = props;
  const { t } = useTranslation();
  return (
    <Pressable
      testID={`language-option-${row.code}`}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={t('language.optionA11y', { name: row.native_name, medium })}
      onPress={onPress}
      style={[
        styles.option,
        selected
          ? {
              backgroundColor: colors.optionSelected,
              borderColor: colors.optionSelectedBorder,
              borderWidth: 2,
            }
          : { backgroundColor: colors.option, borderColor: colors.optionBorder, borderWidth: 1 },
      ]}
    >
      <View style={[styles.glyph, { backgroundColor: colors.glyph }]}>
        <Text style={[styles.glyphText, { color: colors.glyphText }]}>
          {GLYPHS[row.code] ?? row.native_name[0]}
        </Text>
      </View>
      <View style={styles.optionText}>
        <Text style={[styles.optionName, { color: colors.text }]}>{row.native_name}</Text>
        <Text style={[styles.optionSub, { color: colors.textMuted }]}>{medium}</Text>
      </View>
      <View
        style={[
          styles.radio,
          selected
            ? {
                borderWidth: 7,
                borderColor: colors.optionSelectedBorder,
                backgroundColor: colors.option,
              }
            : { borderWidth: 2, borderColor: colors.radioOff },
        ]}
      />
    </Pressable>
  );
}

function ComingSoonOption({
  row,
  label,
  colors,
}: {
  row: LocaleRow;
  label: string;
  colors: Palette;
}) {
  return (
    <Pressable
      testID={`language-option-${row.code}`}
      accessibilityRole="radio"
      accessibilityState={{ disabled: true, selected: false }}
      accessibilityLabel={label}
      disabled
      style={[styles.option, styles.comingSoon, { borderColor: colors.disabledBorder }]}
    >
      <View style={[styles.glyph, { backgroundColor: colors.disabledGlyph }]}>
        <Text style={[styles.comingSoonGlyph, { color: colors.disabledText }]}>
          {GLYPHS[row.code] ?? row.native_name[0]}
        </Text>
      </View>
      <Text style={[styles.comingSoonText, { color: colors.disabledText }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: space.md },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoMark: { width: 34, height: 34 },
  title: { fontSize: 22, fontWeight: '700', lineHeight: 33, textAlign: 'center' },
  list: { gap: space.md },
  option: {
    minHeight: 72,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  glyph: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphText: { fontSize: 20, fontWeight: '700' },
  optionText: { flex: 1, gap: 2 },
  optionName: { fontSize: 18, fontWeight: '700' },
  optionSub: { fontSize: 13 },
  radio: { width: 22, height: 22, borderRadius: radius.pill },
  comingSoon: { minHeight: 60, borderWidth: 1, borderStyle: 'dashed' },
  comingSoonGlyph: { fontSize: 16, fontWeight: '700' },
  comingSoonText: { fontSize: 15 },
  preview: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.xs },
  previewLabel: { fontSize: 12, fontWeight: '700' },
  previewText: { fontSize: 15, lineHeight: 25 },
  footer: { marginTop: 'auto', gap: space.sm },
  hint: { fontSize: 12, textAlign: 'center' },
});
