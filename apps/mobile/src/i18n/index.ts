import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, type Locale } from '@fizzix/shared';
import ta from './ta.json';
import si from './si.json';

export const resources = {
  ta: { translation: ta },
  si: { translation: si },
} as const;

/** Creates the app's i18n instance. Tests get a fresh one per render through the root layout. */
export function createI18n(initial: Locale = DEFAULT_LOCALE) {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    resources,
    lng: initial,
    fallbackLng: false,
    supportedLngs: ['ta', 'si'],
    interpolation: { escapeValue: false },
    returnNull: false,
    initAsync: false,
  });
  return instance;
}
