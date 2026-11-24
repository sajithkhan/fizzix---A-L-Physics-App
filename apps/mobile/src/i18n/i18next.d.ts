import 'i18next';
import type ta from './ta.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof ta };
  }
}
