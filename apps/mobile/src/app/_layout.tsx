import { useEffect, useMemo, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { I18nextProvider } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Locale } from '@fizzix/shared';
import { createI18n } from '@/i18n';
import { loadSavedLocale } from '@/lib/locale-store';
import { LocaleContext } from '@/features/language/locale-context';
import { Loading } from '@/components/loading';
import { useTheme } from '@/theme';

export default function RootLayout() {
  const [i18n] = useState(() => createI18n());
  const [saved, setSaved] = useState<Locale | null>(null);
  const [ready, setReady] = useState(false);
  const { scheme, colors } = useTheme();

  useEffect(() => {
    let active = true;
    void loadSavedLocale().then(async (locale) => {
      if (!active) return;
      if (locale) await i18n.changeLanguage(locale);
      setSaved(locale);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [i18n]);

  const localeState = useMemo(() => ({ saved, setSaved }), [saved]);

  return (
    <SafeAreaProvider>
      <I18nextProvider i18n={i18n}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        {ready ? (
          <LocaleContext.Provider value={localeState}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
              }}
            />
          </LocaleContext.Provider>
        ) : (
          <Loading />
        )}
      </I18nextProvider>
    </SafeAreaProvider>
  );
}
